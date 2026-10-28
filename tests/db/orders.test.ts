import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildWorld, createTestDb, createUser, Db, expectError, hasDb, key, q, sys, World } from "./helpers";

async function inv(db: Db, id: string) {
  return (await sys(db, "select quantity, reserved_quantity from public.pharmacy_inventory where id = $1", [id])).rows[0] as {
    quantity: number;
    reserved_quantity: number;
  };
}

async function order(db: Db, customer: string, pharmacy: string, items: { inventory_id: string; quantity: number }[], mode = "pickup", address: string | null = null, k = key()) {
  return (
    await q(db, customer, "select public.create_order($1, $2::jsonb, $3::public.fulfillment_mode, $4, $5) as id", [pharmacy, JSON.stringify(items), mode, k, address])
  ).rows[0].id as string;
}

async function status(db: Db, id: string) {
  return (await sys(db, "select status, payment_status from public.orders where id = $1", [id])).rows[0];
}

describe.skipIf(!hasDb)("Commandes, réservations et livraisons", () => {
  let db: Db;
  let w: World;

  beforeAll(async () => {
    db = await createTestDb();
    w = await buildWorld(db);
  }, 60_000);
  afterAll(async () => db?.close());

  it("parcours complet de retrait : réservation transactionnelle puis consommation du stock", async () => {
    const before = await inv(db, w.para2.inventoryId);
    const k = key();
    const id = await order(db, w.customerA, w.ph2, [{ inventory_id: w.para2.inventoryId, quantity: 3 }], "pickup", null, k);
    // Idempotence : même clé => même commande
    expect(await order(db, w.customerA, w.ph2, [{ inventory_id: w.para2.inventoryId, quantity: 3 }], "pickup", null, k)).toBe(id);
    expect((await sys(db, "select count(*)::int n from public.orders where idempotency_key = $1", [k])).rows[0].n).toBe(1);

    const o = (await sys(db, "select subtotal_xof, total_xof, status from public.orders where id = $1", [id])).rows[0];
    expect(o).toMatchObject({ subtotal_xof: 1350, total_xof: 1350, status: "pending_confirmation" });
    expect(await inv(db, w.para2.inventoryId)).toEqual(before); // rien n'est réservé avant confirmation

    // La pharmacie reçoit une notification
    expect((await q(db, w.ph2User, "select * from public.notifications where order_id = $1", [id])).rowCount).toBe(1);

    expect((await q(db, w.ph2User, "select public.pharmacy_respond_order($1, true) as s", [id])).rows[0].s).toBe("confirmed");
    // Double confirmation : pas de double réservation
    expect((await q(db, w.ph2User, "select public.pharmacy_respond_order($1, true) as s", [id])).rows[0].s).toBe("confirmed");
    expect(await inv(db, w.para2.inventoryId)).toEqual({ quantity: before.quantity, reserved_quantity: before.reserved_quantity + 3 });

    await q(db, w.ph2User, "select public.advance_order($1, 'preparing')", [id]);
    await expectError(q(db, w.ph2User, "select public.advance_order($1, 'awaiting_courier')", [id]), /PP403/); // retrait, pas livraison
    await q(db, w.ph2User, "select public.advance_order($1, 'ready_for_pickup')", [id]);
    expect((await status(db, id)).payment_status).toBe("unpaid"); // jamais payé sans confirmation explicite
    await q(db, w.ph2User, "select public.confirm_payment($1)", [id]);
    await q(db, w.ph2User, "select public.advance_order($1, 'completed')", [id]);
    await q(db, w.ph2User, "select public.advance_order($1, 'completed')", [id]); // idempotent : pas de double déduction

    expect(await inv(db, w.para2.inventoryId)).toEqual({ quantity: before.quantity - 3, reserved_quantity: before.reserved_quantity });
    expect(await status(db, id)).toEqual({ status: "completed", payment_status: "paid" });

    const kinds = (await q(db, w.ph2User, "select kind from public.inventory_movements where order_id = $1 order by id", [id])).rows.map((r) => r.kind);
    expect(kinds).toEqual(["reservation", "sale"]);
    const hist = (await q(db, w.customerA, "select to_status from public.order_status_history where order_id = $1 order by id", [id])).rows.map((r) => r.to_status);
    expect(hist).toEqual(["pending_confirmation", "confirmed", "preparing", "ready_for_pickup", "ready_for_pickup", "completed"]);
    expect((await q(db, w.customerA, "select count(*)::int n from public.notifications where order_id = $1", [id])).rows[0].n).toBeGreaterThanOrEqual(4);
  });

  it("deux confirmations concurrentes ne peuvent pas dépasser le stock disponible", async () => {
    // Stock de para1 : 5 unités ; deux commandes de 3
    const o1 = await order(db, w.customerA, w.ph1, [{ inventory_id: w.para1.inventoryId, quantity: 3 }]);
    const o2 = await order(db, w.customerB, w.ph1, [{ inventory_id: w.para1.inventoryId, quantity: 3 }]);
    const results = await Promise.allSettled([
      q(db, w.ph1User, "select public.pharmacy_respond_order($1, true)", [o1]),
      q(db, w.ph1User, "select public.pharmacy_respond_order($1, true)", [o2]),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled");
    const ko = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    expect(ok).toHaveLength(1);
    expect(ko).toHaveLength(1);
    expect(String(ko[0].reason.message)).toMatch(/stock insuffisant/);
    expect(await inv(db, w.para1.inventoryId)).toMatchObject({ quantity: 5, reserved_quantity: 3 });

    // La pharmacie refuse la seconde (rupture constatée) — un motif est exigé
    const pending = (await status(db, o1)).status === "pending_confirmation" ? o1 : o2;
    await expectError(q(db, w.ph1User, "select public.pharmacy_respond_order($1, false)", [pending]), /motif/);
    await q(db, w.ph1User, "select public.pharmacy_respond_order($1, false, 'Rupture constatée')", [pending]);
    expect((await status(db, pending)).status).toBe("rejected");

    // Annulation par le client de la commande confirmée : le stock est libéré
    const confirmed = pending === o1 ? o2 : o1;
    const cust = confirmed === o1 ? w.customerA : w.customerB;
    await q(db, cust, "select public.advance_order($1, 'cancelled')", [confirmed]);
    expect(await inv(db, w.para1.inventoryId)).toMatchObject({ quantity: 5, reserved_quantity: 0 });
  });

  it("commandes simultanées avec la même clé d'idempotence : une seule commande créée", async () => {
    const k = key();
    const ids = await Promise.all(
      Array.from({ length: 5 }, () => order(db, w.customerB, w.ph2, [{ inventory_id: w.para2.inventoryId, quantity: 1 }], "pickup", null, k)),
    );
    expect(new Set(ids).size).toBe(1);
  });

  it("refuse les quantités invalides, les produits d'une autre pharmacie et la modification de stock sous le réservé", async () => {
    await expectError(order(db, w.customerA, w.ph1, [{ inventory_id: w.para1.inventoryId, quantity: 0 }]), /quantité invalide/);
    await expectError(order(db, w.customerA, w.ph1, [{ inventory_id: w.para1.inventoryId, quantity: 999 }]), /quantité invalide/);
    await expectError(order(db, w.customerA, w.ph1, [{ inventory_id: w.para2.inventoryId, quantity: 1 }]), /introuvable/);
    await expectError(order(db, w.ph1User, w.ph1, [{ inventory_id: w.para1.inventoryId, quantity: 1 }]), /propre pharmacie/);

    const id = await order(db, w.customerA, w.ph1, [{ inventory_id: w.para1.inventoryId, quantity: 4 }]);
    await q(db, w.ph1User, "select public.pharmacy_respond_order($1, true)", [id]);
    await expectError(q(db, w.ph1User, "select public.set_inventory($1, $2, 2, 500)", [w.ph1, w.para1.catalogId]), /réservée/);
    // Le client ne peut pas clôturer lui-même, la pharmacie ne peut pas sauter d'étape
    await expectError(q(db, w.customerA, "select public.advance_order($1, 'completed')", [id]), /PP403/);
    await expectError(q(db, w.ph1User, "select public.advance_order($1, 'completed')", [id]), /PP403/);
    await expectError(q(db, w.ph1User, "select public.advance_order($1, 'cancelled')", [id]), /motif/);
    await q(db, w.ph1User, "select public.advance_order($1, 'cancelled', 'Rupture constatée au rayon')", [id]);
    expect(await inv(db, w.para1.inventoryId)).toMatchObject({ reserved_quantity: 0 });
    await expectError(q(db, w.ph1User, "select public.advance_order($1, 'preparing')", [id]), /clôturée/);
  });

  it("produit déclaré indisponible : aucune demande possible", async () => {
    const cid = (await q(db, w.ph1User, "select public.upsert_catalog_item('{\"brand_name\":\"Produit Rupture\"}'::jsonb) as id")).rows[0].id;
    const i = (await q(db, w.ph1User, "select public.set_inventory($1, $2, 10, 100, false) as id", [w.ph1, cid])).rows[0].id;
    await expectError(order(db, w.customerA, w.ph1, [{ inventory_id: i, quantity: 1 }]), /indisponible/);
  });

  it("expiration des demandes sans réponse et des réservations non retirées", async () => {
    const a = await order(db, w.customerA, w.ph2, [{ inventory_id: w.para2.inventoryId, quantity: 1 }]);
    const b = await order(db, w.customerA, w.ph2, [{ inventory_id: w.para2.inventoryId, quantity: 2 }]);
    await q(db, w.ph2User, "select public.pharmacy_respond_order($1, true)", [b]);
    const reservedBefore = (await inv(db, w.para2.inventoryId)).reserved_quantity;
    await sys(db, "update public.orders set confirmation_expires_at = now() - interval '1 minute' where id = $1", [a]);
    await sys(db, "update public.orders set reservation_expires_at = now() - interval '1 minute' where id = $1", [b]);
    const n = (await sys(db, "select public.expire_overdue_orders() as n")).rows[0].n;
    expect(n).toBeGreaterThanOrEqual(2);
    expect((await status(db, a)).status).toBe("expired");
    expect((await status(db, b)).status).toBe("expired");
    expect((await inv(db, w.para2.inventoryId)).reserved_quantity).toBe(reservedBefore - 2);
    expect((await sys(db, "select status from public.stock_reservations where order_id = $1", [b])).rows[0].status).toBe("expired");
  });

  describe("livraison", () => {
    it("est refusée tant que la livraison n'est pas activée", async () => {
      await expectError(order(db, w.customerA, w.ph1, [{ inventory_id: w.para1.inventoryId, quantity: 1 }], "delivery", w.addressA), /pas encore activée/);
    });

    it("refuse les produits sur ordonnance et les catégories non autorisées, même livraison activée", async () => {
      await q(db, w.admin, "select public.admin_update_setting('delivery_enabled', 'true'::jsonb)");
      // Catégorie sans ordonnance non encore autorisée à la livraison
      await expectError(order(db, w.customerA, w.ph1, [{ inventory_id: w.para1.inventoryId, quantity: 1 }], "delivery", w.addressA), /ne peut pas être livré/);
      await sys(db, "update public.product_categories set delivery_allowed = true where name = 'Médicaments sans ordonnance'");
      await expectError(order(db, w.customerA, w.ph1, [{ inventory_id: w.amox1.inventoryId, quantity: 1 }], "delivery", w.addressA), /ordonnance/);
      // Adresse d'un autre client
      await expectError(order(db, w.customerB, w.ph1, [{ inventory_id: w.para1.inventoryId, quantity: 1 }], "delivery", w.addressA), /adresse/);
      // Le retrait reste possible pour un produit sur ordonnance (signalé)
      const rx = await order(db, w.customerA, w.ph1, [{ inventory_id: w.amox1.inventoryId, quantity: 1 }]);
      expect((await sys(db, "select has_prescription_items from public.orders where id = $1", [rx])).rows[0].has_prescription_items).toBe(true);
    });

    it("parcours de livraison avec livreur habilité uniquement", async () => {
      const id = await order(db, w.customerA, w.ph1, [{ inventory_id: w.para1.inventoryId, quantity: 2 }], "delivery", w.addressA);
      const o = (await sys(db, "select delivery_fee_xof, total_xof, subtotal_xof, payment_method from public.orders where id = $1", [id])).rows[0];
      expect(o.payment_method).toBe("cash_on_delivery");
      expect(o.total_xof).toBe(o.subtotal_xof + o.delivery_fee_xof);
      await q(db, w.ph1User, "select public.pharmacy_respond_order($1, true)", [id]);
      await q(db, w.ph1User, "select public.advance_order($1, 'preparing')", [id]);
      await q(db, w.ph1User, "select public.advance_order($1, 'awaiting_courier')", [id]);

      await expectError(q(db, w.admin, "select public.assign_courier($1, $2)", [id, w.otherCourier]), /non habilité/);
      await expectError(q(db, w.ph1User, "select public.assign_courier($1, $2)", [id, w.courierUser]), /PP403/);
      await q(db, w.admin, "select public.assign_courier($1, $2)", [id, w.courierUser]);
      expect((await status(db, id)).status).toBe("courier_assigned");

      // Le livreur affecté voit la livraison ; l'autre non
      expect((await q(db, w.courierUser, "select * from public.deliveries where order_id = $1", [id])).rowCount).toBe(1);
      expect((await q(db, w.otherCourier, "select * from public.deliveries where order_id = $1", [id])).rowCount).toBe(0);
      await expectError(q(db, w.otherCourier, "select public.advance_order($1, 'in_delivery')", [id]), /PP403/);
      await expectError(q(db, w.courierUser, "select public.advance_order($1, 'delivered')", [id]), /PP403/); // collecte d'abord

      await q(db, w.courierUser, "select public.advance_order($1, 'in_delivery')", [id]);
      await q(db, w.courierUser, "select public.confirm_payment($1)", [id]);
      await q(db, w.courierUser, "select public.advance_order($1, 'delivered')", [id]);
      expect(await status(db, id)).toEqual({ status: "delivered", payment_status: "paid" });
      const d = (await sys(db, "select status, picked_up_at, delivered_at from public.deliveries where order_id = $1", [id])).rows[0];
      expect(d.status).toBe("delivered");
      expect(d.picked_up_at).not.toBeNull();
      expect(d.delivered_at).not.toBeNull();
      expect((await sys(db, "select count(*)::int n from public.delivery_assignments a join public.deliveries d on d.id = a.delivery_id where d.order_id = $1 and a.is_active", [id])).rows[0].n).toBe(0);
    });

    it("échec de livraison : motif obligatoire et retour du stock", async () => {
      const before = await inv(db, w.para1.inventoryId);
      const id = await order(db, w.customerB, w.ph1, [{ inventory_id: w.para1.inventoryId, quantity: 1 }], "delivery", await w.addAddress(w.customerB));
      await q(db, w.ph1User, "select public.pharmacy_respond_order($1, true)", [id]);
      await q(db, w.ph1User, "select public.advance_order($1, 'preparing')", [id]);
      await q(db, w.ph1User, "select public.advance_order($1, 'awaiting_courier')", [id]);
      await q(db, w.admin, "select public.assign_courier($1, $2)", [id, w.courierUser]);
      await q(db, w.courierUser, "select public.advance_order($1, 'in_delivery')", [id]);
      const del = (await sys(db, "select id from public.deliveries where order_id = $1", [id])).rows[0].id;
      await q(db, w.courierUser, "select public.report_delivery_incident($1, 'client_absent', 'Personne au domicile')", [del]);
      await expectError(q(db, w.courierUser, "select public.advance_order($1, 'delivery_failed')", [id]), /motif/);
      await q(db, w.courierUser, "select public.advance_order($1, 'delivery_failed', 'Client injoignable')", [id]);
      expect(await inv(db, w.para1.inventoryId)).toEqual(before);
      expect((await q(db, w.ph1User, "select * from public.delivery_incidents where delivery_id = $1", [del])).rowCount).toBe(1);
    });

    it("un paiement annulé après encaissement passe en remboursement à traiter", async () => {
      const id = await order(db, w.customerA, w.ph2, [{ inventory_id: w.para2.inventoryId, quantity: 1 }]);
      await q(db, w.ph2User, "select public.pharmacy_respond_order($1, true)", [id]);
      await expectError(q(db, w.ph2User, "select public.confirm_payment($1)", [id]), /PP403/); // trop tôt
      await q(db, w.ph2User, "select public.advance_order($1, 'preparing')", [id]);
      await q(db, w.ph2User, "select public.advance_order($1, 'ready_for_pickup')", [id]);
      await q(db, w.ph2User, "select public.confirm_payment($1)", [id]);
      await q(db, w.customerA, "select public.advance_order($1, 'cancelled')", [id]);
      expect((await status(db, id)).payment_status).toBe("refund_pending");
      await q(db, w.admin, "select public.admin_mark_refunded($1, 'Remboursé en espèces, reçu n°12')", [id]);
      expect((await status(db, id)).payment_status).toBe("refunded");
    });
  });

  it("suppression de compte : impossible avec une commande en cours, puis anonymisation", async () => {
    const u = await createUser(db, "partant", { phone: "+22370999999" });
    const id = await order(db, u, w.ph2, [{ inventory_id: w.para2.inventoryId, quantity: 1 }]);
    await expectError(q(db, u, "select public.request_account_deletion()"), /en cours/);
    await q(db, u, "select public.advance_order($1, 'cancelled')", [id]);
    await q(db, u, "select public.request_account_deletion()");
    const p = (await sys(db, "select full_name, phone, deleted_at from public.profiles where id = $1", [u])).rows[0];
    expect(p.full_name).toBeNull();
    expect(p.phone).toBeNull();
    expect(p.deleted_at).not.toBeNull();
    await expectError(order(db, u, w.ph2, [{ inventory_id: w.para2.inventoryId, quantity: 1 }]), /supprimé/);
  });
});
