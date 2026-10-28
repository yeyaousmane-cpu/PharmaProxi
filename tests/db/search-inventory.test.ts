import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildWorld, createTestDb, createUser, Db, expectError, hasDb, q, sys, World } from "./helpers";

describe.skipIf(!hasDb)("Recherche, fraîcheur, catalogue et import", () => {
  let db: Db;
  let w: World;

  beforeAll(async () => {
    db = await createTestDb();
    w = await buildWorld(db);
  }, 60_000);
  afterAll(async () => db?.close());

  it("dédoublonne le catalogue (casse, accents, espaces)", async () => {
    expect(w.para1.catalogId).toBe(w.para2.catalogId);
    const id = (await q(db, w.ph1User, "select public.upsert_catalog_item('{\"brand_name\":\"  PARACÉTAMOL   test \",\"dosage\":\"500 MG\",\"form\":\"COMPRIMÉ\"}'::jsonb) as id")).rows[0].id;
    expect(id).toBe(w.para1.catalogId);
  });

  it("recherche tolérante à la casse, aux accents et aux fautes légères", async () => {
    for (const term of ["PARACETAMOL", "paracétamol", "  Paracétamol   test ", "paracetamol tst"]) {
      const { rows } = await q(db, null, "select pharmacy_name from public.search_inventory($1)", [term]);
      expect(rows.length, term).toBe(2);
    }
    expect((await q(db, null, "select * from public.search_inventory('a')")).rowCount).toBe(0); // trop court
  });

  it("recherche multi-mots dans n'importe quel ordre", async () => {
    const id = (await q(db, w.ph1User, "select public.upsert_catalog_item('{\"brand_name\":\"Solution de réhydratation orale\",\"generic_name\":\"SRO\",\"dosage\":\"20,5 g\"}'::jsonb) as id")).rows[0].id;
    await q(db, w.ph1User, "select public.set_inventory($1, $2, 10, 150)", [w.ph1, id]);
    for (const term of ["sro rehydratation", "orale solution", "SRO"]) {
      expect((await q(db, null, "select * from public.search_inventory($1)", [term])).rowCount, term).toBe(1);
    }
    expect((await q(db, null, "select * from public.suggest_medicines('orale sro')")).rowCount).toBe(1);
  });

  it("recherche par principe actif", async () => {
    const { rows } = await q(db, null, "select brand_name from public.search_inventory('paracétamol')");
    expect(rows.length).toBeGreaterThan(0);
  });

  it("classe la fraîcheur : disponible, à confirmer, indisponible, ancienne", async () => {
    const set = (hours: number) =>
      sys(db, "update public.pharmacy_inventory set stock_updated_at = now() - make_interval(hours => $2) where id = $1", [w.para2.inventoryId, hours]);
    const fresh = async () =>
      (await q(db, null, "select freshness from public.search_inventory('paracetamol test') where inventory_id = $1", [w.para2.inventoryId])).rows[0].freshness;

    await set(1);
    expect(await fresh()).toBe("available");
    await set(30);
    expect(await fresh()).toBe("to_confirm");
    await set(100);
    expect(await fresh()).toBe("stale"); // jamais présenté comme certain
    await q(db, w.ph2User, "select public.confirm_inventory_fresh(array[$1]::uuid[])", [w.para2.inventoryId]);
    expect(await fresh()).toBe("available");
    await q(db, w.ph2User, "select public.set_inventory($1, $2, 50, 450, false)", [w.ph2, w.para2.catalogId]);
    expect(await fresh()).toBe("unavailable");
    await q(db, w.ph2User, "select public.set_inventory($1, $2, 50, 450, true)", [w.ph2, w.para2.catalogId]);
    // Les seuils sont paramétrables
    await q(db, w.admin, "select public.admin_update_setting('stock_fresh_hours', '0'::jsonb)");
    await set(1);
    expect(await fresh()).toBe("to_confirm");
    await q(db, w.admin, "select public.admin_update_setting('stock_fresh_hours', '24'::jsonb)");
  });

  it("filtres combinables : commune, prix maximum, distance, disponibles uniquement, ouvert", async () => {
    const byCommune = await q(db, null, "select pharmacy_id from public.search_inventory('paracetamol', null, $1)", [w.c3]);
    expect(byCommune.rows.map((r) => r.pharmacy_id)).toEqual([w.ph1]);
    const cheap = await q(db, null, "select pharmacy_id from public.search_inventory('paracetamol', p_max_price => 460)");
    expect(cheap.rows.map((r) => r.pharmacy_id)).toEqual([w.ph2]);
    const near = await q(db, null, "select pharmacy_id, distance_km from public.search_inventory('paracetamol', p_lat => 12.64, p_lng => -8.0, p_max_km => 1, p_sort => 'distance')");
    expect(near.rows.map((r) => r.pharmacy_id)).toEqual([w.ph1]);
    expect(near.rows[0].distance_km).toBeLessThan(0.1);
    // Ouvert : seules les pharmacies aux horaires vérifiés peuvent apparaître
    expect((await q(db, null, "select * from public.search_inventory('paracetamol', p_open_only => true)")).rowCount).toBe(0);
    await q(db, w.admin, "select public.admin_set_hours_verified($1, true)", [w.ph1]);
    const open = await q(db, null, "select pharmacy_id, is_open from public.search_inventory('paracetamol', p_open_only => true)");
    expect(open.rows).toEqual([{ pharmacy_id: w.ph1, is_open: true }]);
    // Une modification des horaires par la pharmacie annule la vérification
    await q(db, w.ph1User, "update public.pharmacies set opening_hours = '{\"mon\":[[\"08:00\",\"12:00\"]]}'::jsonb where id = $1", [w.ph1]);
    expect((await sys(db, "select hours_verified from public.pharmacies where id = $1", [w.ph1])).rows[0].hours_verified).toBe(false);
  });

  it("tri par prix et pagination avec total", async () => {
    const r = await q(db, null, "select price_xof, total_count from public.search_inventory('paracetamol', p_sort => 'price', p_limit => 1)");
    expect(r.rows).toHaveLength(1);
    expect(Number(r.rows[0].total_count)).toBe(2);
    expect(r.rows[0].price_xof).toBe(450);
    const page2 = await q(db, null, "select price_xof from public.search_inventory('paracetamol', p_sort => 'price', p_limit => 1, p_offset => 1)");
    expect(page2.rows[0].price_xof).toBe(500);
  });

  it("journalise les recherches de façon anonyme, y compris sans résultat", async () => {
    await q(db, null, "select * from public.search_inventory('produitinexistantxyz')");
    const s = (await q(db, w.admin, "select public.admin_stats() as s")).rows[0].s;
    expect(s.searches).toBeGreaterThan(0);
    expect(s.searches_no_result).toBeGreaterThan(0);
    expect(s.top_no_result_queries.map((x: { query: string }) => x.query)).toContain("produitinexistantxyz");
    const cols = (await sys(db, "select column_name from information_schema.columns where table_name = 'search_logs'")).rows.map((r) => r.column_name);
    expect(cols).not.toContain("user_id");
  });

  it("suggestions depuis le catalogue", async () => {
    const r = await q(db, null, "select label from public.suggest_medicines('parac')");
    expect(r.rows[0].label).toMatch(/Paracétamol Test/);
  });

  it("stock public d'une pharmacie sans quantités exactes", async () => {
    const r = await q(db, null, "select * from public.pharmacy_public_inventory($1)", [w.ph1]);
    expect(r.rowCount).toBeGreaterThan(0);
    expect(r.fields.map((f) => f.name)).not.toContain("quantity");
  });

  it("import CSV : lignes valides importées, erreurs détaillées par ligne", async () => {
    const rows = [
      { brand_name: "Import Alpha", dosage: "10 mg", quantity: 12, price_xof: 300 },
      { brand_name: "Import Beta", quantity: -1, price_xof: 300 },
      { brand_name: "X", quantity: 1 },
      { brand_name: "Import Gamma", quantity: 4, price_xof: "" },
    ];
    const rep = (await q(db, w.ph1User, "select public.import_inventory($1, $2::jsonb) as r", [w.ph1, JSON.stringify(rows)])).rows[0].r;
    expect(rep.imported).toBe(2);
    expect(rep.failed).toBe(2);
    expect(rep.errors.map((e: { row: number }) => e.row)).toEqual([2, 3]);
    const mv = await q(db, w.ph1User, "select count(*)::int n from public.inventory_movements where kind = 'import' and pharmacy_id = $1", [w.ph1]);
    expect(mv.rows[0].n).toBe(2);
    await expectError(q(db, w.ph2User, "select public.import_inventory($1, $2::jsonb)", [w.ph1, JSON.stringify(rows)]), /PP403/);
  });

  it("alerte de stock faible côté pharmacien", async () => {
    await q(db, w.ph2User, "select public.set_inventory($1, $2, 3, 450, true)", [w.ph2, w.para2.catalogId]);
    const n = await q(db, w.ph2User, "select * from public.notifications where kind = 'low_stock'");
    expect(n.rowCount).toBeGreaterThan(0);
  });

  it("validation à l'inscription d'une pharmacie", async () => {
    const u = await createUser(db, "invalide");
    const base = { name: "Pharmacie V", address: "Rue v", region_id: w.region, phone: "+22370000000", pharmacist_in_charge: "Dr V" };
    await expectError(q(db, u, "select public.register_pharmacy($1::jsonb)", [JSON.stringify({ ...base, phone: "70000000" })]), /check constraint/);
    const seg = (await sys(db, "select id from public.regions where name = 'Ségou'")).rows[0].id;
    await expectError(q(db, u, "select public.register_pharmacy($1::jsonb)", [JSON.stringify({ ...base, region_id: seg, commune_id: w.c3 })]), /commune/);
    await expectError(q(db, u, "select public.register_pharmacy($1::jsonb)", [JSON.stringify({ ...base, pharmacist_in_charge: "" })]), /responsable/);
    await expectError(q(db, u, "select public.register_pharmacy($1::jsonb)", [JSON.stringify({ ...base, opening_hours: { lundi: [] } })]), /hours_valid/);
    await expectError(q(db, u, "select public.register_pharmacy($1::jsonb)", [JSON.stringify({ ...base, latitude: 12.6 })]), /check constraint/);
  });

  it("fusion de doublons du catalogue", async () => {
    const a = (await q(db, w.admin, "select public.upsert_catalog_item('{\"brand_name\":\"Doublon Médoc\",\"dosage\":\"5 mg\"}'::jsonb) as id")).rows[0].id;
    const b = (await q(db, w.ph1User, "select public.upsert_catalog_item('{\"brand_name\":\"Doublon Medoc.\",\"dosage\":\"5 mg\"}'::jsonb) as id")).rows[0].id;
    expect(a).not.toBe(b);
    await q(db, w.ph1User, "select public.set_inventory($1, $2, 7, 100)", [w.ph1, b]);
    const cands = await q(db, w.admin, "select * from public.catalog_duplicate_candidates(0.5)");
    expect(cands.rows.some((r) => [r.a_id, r.b_id].sort().join() === [a, b].sort().join())).toBe(true);
    await q(db, w.admin, "select public.admin_merge_catalog($1, $2)", [a, b]);
    const stock = await q(db, w.ph1User, "select catalog_id, quantity from public.pharmacy_inventory where pharmacy_id = $1 and catalog_id in ($2, $3)", [w.ph1, a, b]);
    expect(stock.rows).toEqual([{ catalog_id: a, quantity: 7 }]);
    await expectError(q(db, w.ph1User, "select public.set_inventory($1, $2, 1, 1)", [w.ph1, b]), /fusionné/);
  });

  it("données de démonstration : installation et suppression complètes", async () => {
    const ids: Record<string, string> = {};
    for (const r of ["admin", "pharmacist1", "pharmacist2", "customer", "courier"]) ids[r] = await createUser(db, `demo-${r}`);
    await sys(db, "set role service_role");
    try {
      await sys(db, "select public.demo_install($1::jsonb)", [JSON.stringify(ids)]);
    } finally {
      await sys(db, "reset role");
    }
    const demo = await q(db, null, "select pharmacy_name from public.search_inventory('demo paracetamol')");
    expect(demo.rows.filter((r) => r.pharmacy_name.includes("DÉMO")).length).toBe(2); // la pharmacie « en attente » n'apparaît pas
    expect((await sys(db, "select value from public.platform_settings where key = 'delivery_enabled'")).rows[0].value).toBe(true);

    const res = (await sys(db, "select public.demo_uninstall() as r")).rows[0].r;
    expect(res.pharmacies_deleted).toBe(3);
    expect((await sys(db, "select count(*)::int n from public.pharmacies where is_demo")).rows[0].n).toBe(0);
    expect((await sys(db, "select count(*)::int n from public.medicine_catalog where is_demo")).rows[0].n).toBe(0);
    expect((await sys(db, "select count(*)::int n from public.localities where is_demo")).rows[0].n).toBe(0);
    expect((await sys(db, "select value from public.platform_settings where key = 'delivery_enabled'")).rows[0].value).toBe(false);
    // Les données non démo sont intactes
    expect((await q(db, null, "select * from public.search_inventory('paracetamol test')")).rowCount).toBe(2);
  });
});
