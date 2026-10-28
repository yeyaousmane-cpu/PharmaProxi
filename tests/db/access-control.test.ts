import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildWorld, createTestDb, createUser, Db, expectError, hasDb, key, q, World } from "./helpers";

describe.skipIf(!hasDb)("Contrôle d'accès (RLS et fonctions)", () => {
  let db: Db;
  let w: World;
  let orderA: string;

  beforeAll(async () => {
    db = await createTestDb();
    w = await buildWorld(db);
    orderA = (
      await q(db, w.customerA, "select public.create_order($1, $2::jsonb, 'pickup', $3, null, 'note privée du client') as id", [
        w.ph1,
        JSON.stringify([{ inventory_id: w.para1.inventoryId, quantity: 1 }]),
        key(),
      ])
    ).rows[0].id;
  }, 60_000);
  afterAll(async () => db?.close());

  it("le visiteur anonyme ne voit que les pharmacies vérifiées", async () => {
    const pending = await createUser(db, "pending");
    await q(db, pending, "select public.register_pharmacy($1::jsonb)", [
      JSON.stringify({ name: "Pharmacie En Attente", address: "Rue x", region_id: w.region, phone: "+22370000009", pharmacist_in_charge: "Dr X" }),
    ]);
    const { rows } = await q(db, null, "select name, status from public.pharmacies");
    expect(rows.map((r) => r.name)).not.toContain("Pharmacie En Attente");
    expect(rows.every((r) => r.status === "verified")).toBe(true);
  });

  it("le visiteur ne lit ni les stocks bruts, ni les données privées des pharmacies", async () => {
    expect((await q(db, null, "select * from public.pharmacy_inventory")).rowCount).toBe(0);
    await expectError(q(db, null, "select * from public.pharmacy_private"), /permission denied/);
    // Mais la recherche publique fonctionne, sans exposer les quantités
    const { rows, fields } = await q(db, null, "select * from public.search_inventory('paracetamol')");
    expect(rows.length).toBeGreaterThan(0);
    expect(fields.map((f) => f.name)).not.toContain("quantity");
  });

  it("le visiteur ne peut rien écrire", async () => {
    await expectError(q(db, null, "insert into public.regions (name) values ('Pirate')"), /permission denied/);
    await expectError(q(db, null, "select public.create_order($1, '[]'::jsonb, 'pickup', $2)", [w.ph1, key()]), /PP401/);
  });

  it("un client ne voit pas les commandes ni les notes d'un autre client", async () => {
    expect((await q(db, w.customerA, "select id from public.orders")).rows.map((r) => r.id)).toContain(orderA);
    expect((await q(db, w.customerB, "select id from public.orders where id = $1", [orderA])).rowCount).toBe(0);
    expect((await q(db, w.customerB, "select * from public.order_items where order_id = $1", [orderA])).rowCount).toBe(0);
    expect((await q(db, w.customerB, "select * from public.order_private_notes")).rowCount).toBe(0);
    expect((await q(db, w.customerB, "select * from public.customer_addresses where id = $1", [w.addressA])).rowCount).toBe(0);
    await expectError(q(db, w.customerB, "select public.advance_order($1, 'cancelled')", [orderA]), /PP403/);
  });

  it("un client ne peut pas modifier directement une commande ni s'attribuer un rôle", async () => {
    await expectError(q(db, w.customerA, "update public.orders set payment_status = 'paid' where id = $1", [orderA]), /permission denied/);
    await expectError(q(db, w.customerA, "insert into public.user_roles (user_id, role) values ($1, 'admin')", [w.customerA]), /permission denied/);
    await expectError(q(db, w.customerA, "select public.admin_set_role($1, 'admin', true)", [w.customerA]), /PP403/);
  });

  it("une pharmacie ne voit ni ne modifie les données d'une autre pharmacie", async () => {
    const inv = await q(db, w.ph2User, "select pharmacy_id from public.pharmacy_inventory");
    expect(inv.rows.every((r) => r.pharmacy_id === w.ph2)).toBe(true);
    expect((await q(db, w.ph2User, "select * from public.orders where id = $1", [orderA])).rowCount).toBe(0);
    expect((await q(db, w.ph2User, "select * from public.pharmacy_private where pharmacy_id = $1", [w.ph1])).rowCount).toBe(0);
    await expectError(q(db, w.ph2User, "select public.set_inventory($1, $2, 999, 1)", [w.ph1, w.para1.catalogId]), /PP403/);
    await expectError(q(db, w.ph2User, "select public.pharmacy_respond_order($1, true)", [orderA]), /PP403/);
    const upd = await q(db, w.ph2User, "update public.pharmacies set name = 'Piratée' where id = $1", [w.ph1]);
    expect(upd.rowCount).toBe(0);
  });

  it("un pharmacien ne peut pas se déclarer vérifié ni modifier un stock sans passer par la fonction dédiée", async () => {
    const pend = await createUser(db, "pend2");
    const pid = (
      await q(db, pend, "select public.register_pharmacy($1::jsonb) as id", [
        JSON.stringify({ name: "Pharmacie Ambitieuse", address: "Rue y", region_id: w.region, phone: "+22370000010", pharmacist_in_charge: "Dr Y" }),
      ])
    ).rows[0].id;
    await expectError(q(db, pend, "update public.pharmacies set status = 'verified' where id = $1", [pid]), /PP403/);
    await expectError(
      q(db, w.ph1User, "update public.pharmacy_inventory set quantity = 1000 where id = $1", [w.para1.inventoryId]),
      /PP403/,
    );
    // Le seuil d'alerte reste modifiable directement
    const ok = await q(db, w.ph1User, "update public.pharmacy_inventory set low_stock_threshold = 2 where id = $1", [w.para1.inventoryId]);
    expect(ok.rowCount).toBe(1);
  });

  it("une pharmacie en attente n'apparaît pas dans la recherche et ne reçoit pas de commande", async () => {
    const u = await createUser(db, "pend3");
    const pid = (
      await q(db, u, "select public.register_pharmacy($1::jsonb) as id", [
        JSON.stringify({ name: "Pharmacie Non Validée", address: "Rue z", region_id: w.region, phone: "+22370000011", pharmacist_in_charge: "Dr Z" }),
      ])
    ).rows[0].id;
    const cid = (await q(db, u, "select public.upsert_catalog_item('{\"brand_name\":\"Produit Unique Zeta\"}'::jsonb) as id")).rows[0].id;
    const inv = (await q(db, u, "select public.set_inventory($1, $2, 10, 100) as id", [pid, cid])).rows[0].id;
    expect((await q(db, null, "select * from public.search_inventory('Produit Unique Zeta')")).rowCount).toBe(0);
    await expectError(
      q(db, w.customerA, "select public.create_order($1, $2::jsonb, 'pickup', $3)", [pid, JSON.stringify([{ inventory_id: inv, quantity: 1 }]), key()]),
      /PP422/,
    );
  });

  it("l'administration ne lit pas les notes privées sans justification journalisée", async () => {
    expect((await q(db, w.admin, "select * from public.order_private_notes")).rowCount).toBe(0);
    await expectError(q(db, w.admin, "select public.admin_read_order_note($1, 'court')", [orderA]), /PP422/);
    const note = await q(db, w.admin, "select public.admin_read_order_note($1, 'Litige signalé par le client, ticket 42') as n", [orderA]);
    expect(note.rows[0].n).toBe("note privée du client");
    const log = await q(db, w.admin, "select * from public.audit_logs where action = 'sensitive.order_note_read' and entity_id = $1", [orderA]);
    expect(log.rowCount).toBe(1);
    // La pharmacie concernée voit la note, pas les autres
    expect((await q(db, w.ph1User, "select * from public.order_private_notes where order_id = $1", [orderA])).rowCount).toBe(1);
  });

  it("seuls les administrateurs lisent le journal d'audit et valident les pharmacies", async () => {
    expect((await q(db, w.ph1User, "select * from public.audit_logs")).rowCount).toBe(0);
    await expectError(q(db, w.ph1User, "select public.admin_review_pharmacy($1, 'suspended', 'test')", [w.ph2]), /PP403/);
    await expectError(q(db, w.customerA, "select public.admin_stats()"), /PP403/);
    const stats = await q(db, w.admin, "select public.admin_stats() as s");
    expect(stats.rows[0].s.pharmacies_verified).toBe(2);
  });

  it("les fonctions internes et de démonstration ne sont pas exposées", async () => {
    await expectError(q(db, w.admin, "select public.demo_install('{}'::jsonb)"), /permission denied/);
    await expectError(q(db, w.admin, "select public.demo_uninstall()"), /permission denied/);
    await expectError(q(db, w.admin, "select public.bootstrap_admin('x@y.z')"), /permission denied/);
    await expectError(q(db, w.customerA, "select public._set_order_status($1, 'completed', $2, null)", [orderA, w.customerA]), /permission denied/);
    await expectError(q(db, w.customerA, "select public.expire_overdue_orders()"), /permission denied/);
    await expectError(q(db, w.customerA, "select public.log_audit('x','y','z')"), /permission denied/);
  });

  it("un utilisateur ne peut modifier que son propre profil et ne peut pas se marquer « démo »", async () => {
    const r = await q(db, w.customerB, "update public.profiles set full_name = 'Pirate' where id = $1", [w.customerA]);
    expect(r.rowCount).toBe(0);
    await q(db, w.customerA, "update public.profiles set full_name = 'Awa' where id = $1", [w.customerA]);
    await q(db, w.customerA, "update public.profiles set is_demo = true, deleted_at = now() where id = $1", [w.customerA]);
    const me = (await q(db, w.customerA, "select is_demo, deleted_at, full_name from public.profiles where id = $1", [w.customerA])).rows[0];
    expect(me).toEqual({ is_demo: false, deleted_at: null, full_name: "Awa" }); // champs protégés ignorés
    await expectError(q(db, w.customerA, "update public.profiles set phone = '0612' where id = $1", [w.customerA]), /check constraint/);
  });

  it("les signalements sont visibles par l'auteur et l'administration, pas par les autres clients", async () => {
    await q(db, w.customerA, "insert into public.reports (reporter_id, pharmacy_id, reason) values ($1, $2, 'stock_incorrect')", [w.customerA, w.ph1]);
    expect((await q(db, w.customerB, "select * from public.reports")).rowCount).toBe(0);
    expect((await q(db, w.admin, "select * from public.reports")).rowCount).toBeGreaterThan(0);
    await expectError(
      q(db, w.customerA, "insert into public.reports (reporter_id, pharmacy_id, reason, status) values ($1, $2, 'autre', 'resolved')", [w.customerA, w.ph1]),
      /row-level security/,
    );
  });

  it("un livreur non affecté ne voit pas la livraison", async () => {
    expect((await q(db, w.courierUser, "select * from public.orders")).rowCount).toBe(0);
    expect((await q(db, w.courierUser, "select * from public.deliveries")).rowCount).toBe(0);
  });

  it("suspension : la pharmacie disparaît de la recherche et ne peut plus gérer ses stocks", async () => {
    const u = await createUser(db, "susp");
    const pid = (
      await q(db, u, "select public.register_pharmacy($1::jsonb) as id", [
        JSON.stringify({ name: "Pharmacie Suspendue", address: "Rue s", region_id: w.region, phone: "+22370000012", pharmacist_in_charge: "Dr S" }),
      ])
    ).rows[0].id;
    await expectError(q(db, w.admin, "select public.admin_review_pharmacy($1, 'verified')", [pid]), /justificatif/);
    await q(db, u, "insert into public.pharmacy_documents (pharmacy_id, doc_type, storage_path, uploaded_by) values ($1, 'rccm', $2, $3)", [pid, `${pid}/rccm.pdf`, u]);
    // Un chemin de stockage hors du dossier de la pharmacie est refusé
    await expectError(
      q(db, u, "insert into public.pharmacy_documents (pharmacy_id, doc_type, storage_path, uploaded_by) values ($1, 'rccm', $2, $3)", [pid, `${w.ph1}/x.pdf`, u]),
      /row-level security/,
    );
    await q(db, w.admin, "select public.admin_review_pharmacy($1, 'verified')", [pid]);
    const cid = (await q(db, u, "select public.upsert_catalog_item('{\"brand_name\":\"Produit Sigma\"}'::jsonb) as id")).rows[0].id;
    await q(db, u, "select public.set_inventory($1, $2, 10, 100)", [pid, cid]);
    expect((await q(db, null, "select * from public.search_inventory('Produit Sigma')")).rowCount).toBe(1);
    await expectError(q(db, w.admin, "select public.admin_review_pharmacy($1, 'suspended')", [pid]), /motif/);
    await q(db, w.admin, "select public.admin_review_pharmacy($1, 'suspended', 'Contrôle en cours')", [pid]);
    expect((await q(db, null, "select * from public.search_inventory('Produit Sigma')")).rowCount).toBe(0);
    await expectError(q(db, u, "select public.set_inventory($1, $2, 3, 100)", [pid, cid]), /PP403/);
    const hist = await q(db, u, "select decision from public.pharmacy_verifications where pharmacy_id = $1 order by created_at", [pid]);
    expect(hist.rows.map((r) => r.decision)).toEqual(["pending", "verified", "suspended"]);
    // Réactivation
    await q(db, w.admin, "select public.admin_review_pharmacy($1, 'verified', 'Contrôle terminé')", [pid]);
    expect((await q(db, null, "select * from public.search_inventory('Produit Sigma')")).rowCount).toBe(1);
  });

});
