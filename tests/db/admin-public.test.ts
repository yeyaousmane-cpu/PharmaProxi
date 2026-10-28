import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildWorld, createTestDb, createUser, Db, expectError, hasDb, q, sys, World } from "./helpers";

describe.skipIf(!hasDb)("Listes publiques et outils d'administration", () => {
  let db: Db;
  let w: World;
  beforeAll(async () => {
    db = await createTestDb();
    w = await buildWorld(db);
  }, 60_000);
  afterAll(async () => db?.close());

  it("disponibilité d'un produit précis dans toutes les pharmacies", async () => {
    const r = await q(db, null, "select pharmacy_id from public.search_inventory('', p_catalog => $1)", [w.para1.catalogId]);
    expect(r.rows.map((x) => x.pharmacy_id).sort()).toEqual([w.ph1, w.ph2].sort());
    // Pas d'entrée de journal de recherche pour une consultation de fiche produit
    const n = (await sys(db, "select count(*)::int n from public.search_logs")).rows[0].n;
    expect(n).toBe(0);
  });

  it("accueil et carte : uniquement des pharmacies vérifiées, données réelles", async () => {
    const recent = await q(db, null, "select id, products_count from public.recent_pharmacies(10)");
    expect(recent.rows.map((r) => r.id).sort()).toEqual([w.ph1, w.ph2].sort());
    const map = await q(db, null, "select id, distance_km from public.map_pharmacies(p_lat => 12.64, p_lng => -8.0)");
    expect(map.rows[0].id).toBe(w.ph1); // la plus proche d'abord
  });

  it("recherche d'utilisateurs réservée à l'administration", async () => {
    await expectError(q(db, w.customerA, "select * from public.admin_find_users('client')"), /PP403/);
    const r = await q(db, w.admin, "select email, roles from public.admin_find_users('pharma1')");
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].roles).toContain("pharmacist");
    const c = await q(db, w.admin, "select status from public.admin_couriers()");
    expect(c.rows.map((x) => x.status).sort()).toEqual(["pending", "verified"]);
  });

  it("géographie : ajout journalisé, pas de doublon, cohérence cercle/région", async () => {
    const seg = (await sys(db, "select id from public.regions where name = 'Ségou'")).rows[0].id;
    const circle = (await q(db, w.admin, "select public.admin_add_geo('circle', $1, 'Cercle Test', 'Source test') as id", [seg])).rows[0].id;
    await q(db, w.admin, "select public.admin_add_geo('commune', $1, 'Commune Test', 'Source test', $2)", [seg, circle]);
    await expectError(q(db, w.admin, "select public.admin_add_geo('commune', $1, 'Commune Test', 'Source test', $2)", [seg, circle]), /existe déjà/);
    await expectError(q(db, w.admin, "select public.admin_add_geo('commune', $1, 'Autre', null, $2)", [w.region, circle]), /cercle/);
    await expectError(q(db, w.ph1User, "select public.admin_add_geo('circle', $1, 'X')", [seg]), /PP403/);
    expect((await q(db, w.admin, "select count(*)::int n from public.audit_logs where action = 'geo.add'")).rows[0].n).toBe(2);
  });

  it("catégories : une catégorie sur ordonnance ne peut pas être livrable", async () => {
    const rx = w.cat("Médicaments sur ordonnance");
    await expectError(q(db, w.admin, "select public.admin_update_category($1, true, true, true)", [rx]), /ordonnance/);
    const otc = w.cat("Médicaments sans ordonnance");
    await q(db, w.admin, "select public.admin_update_category($1, true, true, false)", [otc]);
    expect((await sys(db, "select delivery_allowed from public.product_categories where id = $1", [otc])).rows[0].delivery_allowed).toBe(true);
    // Catégorie non autorisée : ses produits disparaissent de la recherche
    await q(db, w.admin, "select public.admin_update_category($1, false, false, false)", [otc]);
    expect((await q(db, null, "select * from public.search_inventory('paracetamol test')")).rowCount).toBe(0);
    await q(db, w.admin, "select public.admin_update_category($1, true, false, false)", [otc]);
  });

  it("pages d'information et signalements gérés par l'administration", async () => {
    await q(db, w.admin, "select public.admin_update_content('aide', 'Aide', 'Texte', true)");
    expect((await q(db, null, "select title from public.content_pages where slug = 'aide'")).rows[0].title).toBe("Aide");
    await q(db, w.admin, "select public.admin_update_content('aide', 'Aide', 'Texte', false)");
    expect((await q(db, null, "select * from public.content_pages where slug = 'aide'")).rowCount).toBe(0);
    expect((await q(db, w.customerA, "update public.content_pages set body = 'x'")).rowCount).toBe(0);
    await expectError(q(db, w.customerA, "insert into public.content_pages (slug, title) values ('pirate', 'x')"), /row-level/);
  });

  it("une pharmacie refusée peut corriger ses informations puis soumettre à nouveau", async () => {
    const u = await createUser(db, "refusee");
    const pid = (await q(db, u, "select public.register_pharmacy($1::jsonb) as id", [
      JSON.stringify({ name: "Pharmacie Refusée", address: "Rue r", region_id: w.region, phone: "+22370000020", pharmacist_in_charge: "Dr R" }),
    ])).rows[0].id;
    await q(db, w.admin, "select public.admin_review_pharmacy($1, 'rejected', 'Autorisation illisible')", [pid]);
    const upd = await q(db, u, "update public.pharmacies set address = 'Rue corrigée' where id = $1", [pid]);
    expect(upd.rowCount).toBe(1);
    await q(db, u, "select public.resubmit_pharmacy($1)", [pid]);
    expect((await sys(db, "select status from public.pharmacies where id = $1", [pid])).rows[0].status).toBe("pending");
    // Toujours invisible du public
    expect((await q(db, null, "select * from public.pharmacies where id = $1", [pid])).rowCount).toBe(0);
  });
});
