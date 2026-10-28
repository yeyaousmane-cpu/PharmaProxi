import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildWorld, createTestDb, createUser, Db, expectError, hasDb, key, q, sys, World } from "./helpers";

const order = (db: Db, uid: string, ph: string, inv: string, qty = 1) =>
  q(db, uid, "select public.create_order($1, $2::jsonb, 'pickup', $3) as id", [ph, JSON.stringify([{ inventory_id: inv, quantity: qty }]), key()]).then(
    (r) => r.rows[0].id as string,
  );

describe.skipIf(!hasDb)("Robustesse : limites, concurrence optimiste, intégrité, maintenance, équipe", () => {
  let db: Db;
  let w: World;
  beforeAll(async () => {
    db = await createTestDb();
    w = await buildWorld(db);
  }, 60_000);
  afterAll(async () => db?.close());

  it("limite de demandes imposée en base, même en appelant l'API directement", async () => {
    const u = await createUser(db, "pressé");
    for (let i = 0; i < 10; i++) await order(db, u, w.ph2, w.para2.inventoryId);
    await expectError(order(db, u, w.ph2, w.para2.inventoryId), /PP429/);
    // Les autres clients ne sont pas affectés
    await order(db, w.customerB, w.ph2, w.para2.inventoryId);
  });

  it("limite de signalements et d'adresses", async () => {
    const u = await createUser(db, "signaleur");
    for (let i = 0; i < 5; i++) await q(db, u, "insert into public.reports (reporter_id, pharmacy_id, reason) values ($1, $2, 'autre')", [u, w.ph1]);
    await expectError(q(db, u, "insert into public.reports (reporter_id, pharmacy_id, reason) values ($1, $2, 'autre')", [u, w.ph1]), /PP429/);
    for (let i = 0; i < 10; i++) await w.addAddress(u);
    await expectError(w.addAddress(u), /10 adresses/);
  });

  it("limitation de débit partagée : réservée au serveur (clé de service)", async () => {
    await expectError(q(db, null, "select public.rate_limit_hit('x', 1, 60)"), /permission denied/);
    await expectError(q(db, w.customerA, "select public.rate_limit_hit('x', 1, 60)"), /permission denied/);
    await expectError(q(db, w.customerA, "select * from public.rate_limit_events"), /permission denied|row-level/);
    await sys(db, "set role service_role");
    try {
      const r = await sys(db, "select public.rate_limit_hit('login:test', 2, 60) a, public.rate_limit_hit('login:test', 2, 60) b, public.rate_limit_hit('login:test', 2, 60) c");
      expect(r.rows[0]).toEqual({ a: true, b: true, c: false });
      expect((await sys(db, "select public.rate_limit_hit('login:test', 2, 60, false) as v")).rows[0].v).toBe(false);
    } finally {
      await sys(db, "reset role");
    }
  });

  it("concurrence optimiste : une modification sur une ligne changée entre-temps est refusée", async () => {
    const v0 = (await q(db, w.ph1User, "select row_version from public.pharmacy_inventory where id = $1", [w.amox1.inventoryId])).rows[0].row_version;
    const v1 = (await q(db, w.ph1User, "select public.update_inventory_line($1, $2, 12, 2500, true) as v", [w.amox1.inventoryId, v0])).rows[0].v;
    expect(v1).toBe(v0 + 1);
    // Un second formulaire ouvert avant la modification utilise l'ancienne version
    await expectError(q(db, w.ph1User, "select public.update_inventory_line($1, $2, 3, 2500, true)", [w.amox1.inventoryId, v0]), /modifiée entre-temps/);
    // Une vente change aussi la version
    const o = await order(db, w.customerA, w.ph1, w.amox1.inventoryId, 1);
    await q(db, w.ph1User, "select public.pharmacy_respond_order($1, true)", [o]);
    await q(db, w.ph1User, "select public.advance_order($1, 'preparing')", [o]);
    await q(db, w.ph1User, "select public.advance_order($1, 'ready_for_pickup')", [o]);
    await q(db, w.ph1User, "select public.advance_order($1, 'completed')", [o]);
    await expectError(q(db, w.ph1User, "select public.update_inventory_line($1, $2, 20, 2500, true)", [w.amox1.inventoryId, v1]), /quantité actuelle : 11/);
    // Personne ne peut modifier la version directement, ni gérer la ligne d'une autre pharmacie
    await expectError(q(db, w.ph1User, "update public.pharmacy_inventory set row_version = 0 where id = $1", [w.amox1.inventoryId]), /PP403/);
    await expectError(q(db, w.ph2User, "select public.update_inventory_line($1, null, 1, 1, true)", [w.amox1.inventoryId]), /PP403/);
  });

  it("contrôle d'intégrité : rien à signaler, puis détection et réparation d'une incohérence", async () => {
    await expectError(q(db, w.customerA, "select * from public.admin_integrity_report()"), /PP403/);
    expect((await q(db, w.admin, "select * from public.admin_integrity_report() where severity = 'critique'")).rowCount).toBe(0);
    // Corruption simulée (ex. intervention manuelle en base)
    await sys(db, "update public.pharmacy_inventory set reserved_quantity = 3 where id = $1", [w.para2.inventoryId]);
    const issues = await q(db, w.admin, "select check_name from public.admin_integrity_report() where severity = 'critique'");
    expect(issues.rows.map((r) => r.check_name)).toContain("reserved_mismatch");
    const rep = (await q(db, w.admin, "select public.admin_repair_reservations() as r")).rows[0].r;
    expect(rep.fixed).toBeGreaterThanOrEqual(1);
    expect((await q(db, w.admin, "select * from public.admin_integrity_report() where severity = 'critique'")).rowCount).toBe(0);
    expect((await q(db, w.admin, "select count(*)::int n from public.audit_logs where action = 'integrity.repair_reservations'")).rows[0].n).toBe(1);
  });

  it("maintenance : expire, purge, journalise ; réservée au serveur et aux administrateurs", async () => {
    const o = await order(db, w.customerB, w.ph1, w.para1.inventoryId);
    await sys(db, "update public.orders set confirmation_expires_at = now() - interval '1 hour' where id = $1", [o]);
    await sys(db, "insert into public.search_logs (query_normalized, result_count, created_at) values ('ancienne', 0, now() - interval '2 years')");
    await expectError(q(db, w.customerA, "select public.run_maintenance()"), /permission denied/);
    await expectError(q(db, w.customerA, "select public.admin_run_maintenance()"), /PP403/);
    const r = (await q(db, w.admin, "select public.admin_run_maintenance() as r")).rows[0].r;
    expect(r.expired).toBeGreaterThanOrEqual(1);
    expect(r.purged.search_logs).toBe(1);
    expect(r.critical_issues).toBe(0);
    expect((await sys(db, "select status from public.orders where id = $1", [o])).rows[0].status).toBe("expired");
    expect((await q(db, w.admin, "select count(*)::int n from public.maintenance_runs")).rows[0].n).toBe(1);
  });

  it("équipe : le propriétaire ajoute un collaborateur qui gère les stocks mais pas l'équipe", async () => {
    const staff = await createUser(db, "assistant");
    const email = (await sys(db, "select email from auth.users where id = $1", [staff])).rows[0].email;
    await expectError(q(db, w.customerA, "select public.pharmacy_add_member($1, $2)", [w.ph1, email]), /PP403/);
    await expectError(q(db, w.ph1User, "select public.pharmacy_add_member($1, 'inconnu@nulle.part')", [w.ph1]), /aucun compte/);
    await q(db, w.ph1User, "select public.pharmacy_add_member($1, $2)", [w.ph1, email.toUpperCase()]);
    const team = await q(db, staff, "select member_role from public.pharmacy_team($1)", [w.ph1]);
    expect(team.rows.map((r) => r.member_role).sort()).toEqual(["owner", "staff"]);
    // Le collaborateur gère le stock et les commandes
    await q(db, staff, "select public.set_inventory($1, $2, 9, 500)", [w.ph1, w.para1.catalogId]);
    // … mais ne gère ni l'équipe ni les justificatifs
    const other = await createUser(db, "autre");
    const otherEmail = (await sys(db, "select email from auth.users where id = $1", [other])).rows[0].email;
    await expectError(q(db, staff, "select public.pharmacy_add_member($1, $2)", [w.ph1, otherEmail]), /PP403/);
    await expectError(
      q(db, staff, "insert into public.pharmacy_documents (pharmacy_id, doc_type, storage_path, uploaded_by) values ($1, 'autre', $2, $3)", [w.ph1, `${w.ph1}/x.pdf`, staff]),
      /row-level security/,
    );
    await expectError(q(db, w.ph1User, "select public.pharmacy_remove_member($1, $2)", [w.ph1, w.ph1User]), /propriétaire/);
    // Retrait : plus d'accès, rôle pharmacien retiré
    await q(db, w.ph1User, "select public.pharmacy_remove_member($1, $2)", [w.ph1, staff]);
    await expectError(q(db, staff, "select public.set_inventory($1, $2, 9, 500)", [w.ph1, w.para1.catalogId]), /PP403/);
    expect((await sys(db, "select count(*)::int n from public.user_roles where user_id = $1 and role = 'pharmacist'", [staff])).rows[0].n).toBe(0);
  });

  it("longueurs de texte bornées en base", async () => {
    await expectError(q(db, w.ph1User, "select public.upsert_catalog_item($1::jsonb)", [JSON.stringify({ brand_name: "Produit Long", dosage: "x".repeat(100) })]), /catalog_text_lengths/);
  });
});
