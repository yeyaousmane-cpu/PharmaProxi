/**
 * Tests de charge et de concurrence : de nombreuses opérations simultanées sur
 * les mêmes lignes de stock et les mêmes commandes. Après chaque rafale, les
 * invariants sont vérifiés par le contrôle d'intégrité et par des comptes directs.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildWorld, createTestDb, createUser, Db, hasDb, key, q, sys, World } from "./helpers";

const settle = <T,>(ps: Promise<T>[]) => Promise.allSettled(ps);
const ok = (r: PromiseSettledResult<unknown>[]) => r.filter((x) => x.status === "fulfilled").length;
const reasons = (r: PromiseSettledResult<unknown>[]) =>
  r.filter((x): x is PromiseRejectedResult => x.status === "rejected").map((x) => String(x.reason?.message ?? x.reason));

describe.skipIf(!hasDb)("Concurrence et charge", () => {
  let db: Db;
  let w: World;
  let customers: string[];

  async function freshItem(qty: number) {
    const name = `Produit Charge ${key()}`;
    const cid = (await q(db, w.ph1User, "select public.upsert_catalog_item($1::jsonb) as id", [JSON.stringify({ brand_name: name })])).rows[0].id;
    const inv = (await q(db, w.ph1User, "select public.set_inventory($1, $2, $3, 100) as id", [w.ph1, cid, qty])).rows[0].id as string;
    return inv;
  }
  const newOrder = (uid: string, inv: string, qty = 1) =>
    q(db, uid, "select public.create_order($1, $2::jsonb, 'pickup', $3) as id", [w.ph1, JSON.stringify([{ inventory_id: inv, quantity: qty }]), key()]).then(
      (r) => r.rows[0].id as string,
    );
  const stock = async (inv: string) =>
    (await sys(db, "select quantity, reserved_quantity from public.pharmacy_inventory where id = $1", [inv])).rows[0] as { quantity: number; reserved_quantity: number };
  const critical = async () => (await sys(db, "select * from public.integrity_issues() where severity = 'critique'")).rows;

  beforeAll(async () => {
    db = await createTestDb();
    w = await buildWorld(db);
    customers = await Promise.all(Array.from({ length: 30 }, (_, i) => createUser(db, `client${i}`)));
  }, 120_000);
  afterAll(async () => db?.close());

  it("30 confirmations simultanées sur un stock de 10 : exactement 10 réservations, aucune survente", async () => {
    const inv = await freshItem(10);
    const orders = await Promise.all(customers.map((c) => newOrder(c, inv)));
    const res = await settle(orders.map((o) => q(db, w.ph1User, "select public.pharmacy_respond_order($1, true)", [o])));
    expect(ok(res)).toBe(10);
    expect(reasons(res).every((m) => /stock insuffisant/.test(m))).toBe(true);
    expect(await stock(inv)).toEqual({ quantity: 10, reserved_quantity: 10 });
    expect(await critical()).toEqual([]);
  });

  it("rafale de 60 confirmations de quantités variées : la somme réservée ne dépasse jamais le stock", async () => {
    const inv = await freshItem(37);
    const orders: string[] = [];
    for (let round = 0; round < 2; round++) {
      orders.push(...(await Promise.all(customers.map((c, i) => newOrder(c, inv, (i % 4) + 1)))));
    }
    const res = await settle(orders.map((o) => q(db, w.ph1User, "select public.pharmacy_respond_order($1, true)", [o])));
    const s = await stock(inv);
    expect(s.quantity).toBe(37);
    expect(s.reserved_quantity).toBeLessThanOrEqual(37);
    const confirmed = (await sys(db, "select coalesce(sum(oi.quantity), 0)::int n from public.orders o join public.order_items oi on oi.order_id = o.id where o.id = any($1) and o.status = 'confirmed'", [orders])).rows[0].n;
    expect(confirmed).toBe(s.reserved_quantity);
    expect(ok(res)).toBeGreaterThan(0);
    expect(await critical()).toEqual([]);
    // Libère pour les tests suivants
    await settle(orders.map((o, i) => q(db, customers[i % customers.length], "select public.advance_order($1, 'cancelled')", [o])));
    expect((await stock(inv)).reserved_quantity).toBe(0);
  }, 60_000);

  it("course remise / annulation / expiration sur les mêmes commandes : un seul état final, stock cohérent", async () => {
    const inv = await freshItem(40);
    const orders = await Promise.all(customers.slice(0, 20).map((c) => newOrder(c, inv, 2)));
    for (const o of orders) await q(db, w.ph1User, "select public.pharmacy_respond_order($1, true)", [o]);
    await Promise.all(orders.map(async (o) => {
      await q(db, w.ph1User, "select public.advance_order($1, 'preparing')", [o]);
      await q(db, w.ph1User, "select public.advance_order($1, 'ready_for_pickup')", [o]);
    }));
    // Réservations échues pour que l'expiration entre aussi dans la course
    await sys(db, "update public.orders set reservation_expires_at = now() - interval '1 minute' where id = any($1)", [orders]);
    const races = orders.flatMap((o, i) => [
      q(db, w.ph1User, "select public.advance_order($1, 'completed')", [o]),
      q(db, customers[i], "select public.advance_order($1, 'cancelled')", [o]),
      sys(db, "select public.expire_overdue_orders()"),
    ]);
    await settle(races);
    const final = (await sys(db, "select status, count(*)::int n from public.orders where id = any($1) group by status", [orders])).rows;
    const byStatus: Record<string, number> = Object.fromEntries(final.map((r) => [r.status as string, r.n as number]));
    expect(Object.values(byStatus).reduce((a, b) => a + b, 0)).toBe(20);
    expect(Object.keys(byStatus).every((s) => ["completed", "cancelled", "expired"].includes(s))).toBe(true);
    // Seules les commandes remises ont diminué le stock, et une seule fois chacune
    const sold = (byStatus.completed ?? 0) * 2;
    expect(await stock(inv)).toEqual({ quantity: 40 - sold, reserved_quantity: 0 });
    const sales = (await sys(db, "select count(*)::int n from public.inventory_movements where inventory_id = $1 and kind = 'sale'", [inv])).rows[0].n;
    expect(sales).toBe(byStatus.completed ?? 0);
    expect(await critical()).toEqual([]);
  }, 60_000);

  it("modifications de stock simultanées par deux membres : une seule passe avec la même version", async () => {
    const inv = await freshItem(5);
    const v = (await sys(db, "select row_version from public.pharmacy_inventory where id = $1", [inv])).rows[0].row_version;
    const res = await settle(Array.from({ length: 10 }, (_, i) => q(db, w.ph1User, "select public.update_inventory_line($1, $2, $3, 100, true)", [inv, v, 10 + i])));
    expect(ok(res)).toBe(1);
    expect(reasons(res).every((m) => /modifiée entre-temps/.test(m))).toBe(true);
  });

  it("imports CSV concurrents et mise à jour rapide pendant des réservations : aucune incohérence", async () => {
    const inv = await freshItem(50);
    const orders = await Promise.all(customers.slice(0, 10).map((c) => newOrder(c, inv, 3)));
    const rows = Array.from({ length: 50 }, (_, i) => ({ brand_name: `Import Charge ${i % 25}`, quantity: i + 1, price_xof: 100 + i }));
    const imports = [
      q(db, w.ph1User, "select public.import_inventory($1, $2::jsonb) as r", [w.ph1, JSON.stringify(rows)]),
      q(db, w.ph1User, "select public.import_inventory($1, $2::jsonb) as r", [w.ph1, JSON.stringify(rows.slice().reverse())]),
    ];
    await settle([
      ...orders.map((o) => q(db, w.ph1User, "select public.pharmacy_respond_order($1, true)", [o])),
      ...imports,
      ...Array.from({ length: 5 }, () => q(db, w.ph1User, "select public.confirm_inventory_fresh(array[$1]::uuid[])", [inv])),
      ...Array.from({ length: 5 }, (_, i) => q(db, w.ph1User, "select public.set_inventory($1, (select catalog_id from public.pharmacy_inventory where id = $2), $3, 100)", [w.ph1, inv, 30 + i])),
    ]);
    for (const imp of await Promise.all(imports)) expect(imp.rows[0].r.failed, JSON.stringify(imp.rows[0].r.errors)).toBe(0);
    const s = await stock(inv);
    expect(s.reserved_quantity).toBeLessThanOrEqual(s.quantity);
    expect(await critical()).toEqual([]);
    // Pas de doublons de fiches catalogue malgré deux imports simultanés des mêmes produits
    const dup = (await sys(db, "select count(*)::int n from public.medicine_catalog where brand_name like 'Import Charge %'")).rows[0].n;
    expect(dup).toBe(25);
  }, 60_000);

  it("charge de recherche : 200 recherches simultanées répondent toutes", async () => {
    const t0 = Date.now();
    const res = await settle(Array.from({ length: 200 }, (_, i) => q(db, null, "select * from public.search_inventory($1)", [i % 2 ? "paracetamol" : "charge"])));
    expect(ok(res)).toBe(200);
    expect(Date.now() - t0).toBeLessThan(20_000);
  }, 30_000);

  it("idempotence sous rafale : 20 envois de la même demande créent une seule commande", async () => {
    const inv = await freshItem(5);
    const k = key();
    const u = await createUser(db, "double-clic");
    const res = await settle(Array.from({ length: 20 }, () =>
      q(db, u, "select public.create_order($1, $2::jsonb, 'pickup', $3) as id", [w.ph1, JSON.stringify([{ inventory_id: inv, quantity: 1 }]), k]).then((r) => r.rows[0].id)));
    const ids = new Set(res.filter((r) => r.status === "fulfilled").map((r) => (r as PromiseFulfilledResult<string>).value));
    expect(ids.size).toBe(1);
    expect((await sys(db, "select count(*)::int n from public.orders where idempotency_key = $1", [k])).rows[0].n).toBe(1);
  });
});
