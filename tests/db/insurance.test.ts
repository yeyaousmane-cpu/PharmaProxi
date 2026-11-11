/** Assurances : import du réseau, lien automatique avec les pharmacies inscrites, lecture publique. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildWorld, createTestDb, Db, expectError, hasDb, q, sys, World } from "./helpers";

describe.skipIf(!hasDb)("Assurances et réseaux de soins", () => {
  let db: Db;
  let w: World;
  let ins: string;
  beforeAll(async () => { db = await createTestDb(); w = await buildWorld(db); }, 120_000);
  afterAll(async () => db?.close());
  // Données fictives au format de la liste fournie par un assureur
  const rows = [
    { line: 4, categorie: "PHARMACIE", nom: "PHARMACIE TEST UN", zone: "COMMUNE III", adresse: "Rue 1", telephone: "20 24 89 74", telephone2: "Dr X 76000000" },
    { line: 5, categorie: "CLINIQUE ET POLYCLINIQUE MEDICALE", nom: "Clinique Essai", zone: "COMMUNE V", telephone: "66721597" },
    { line: 6, categorie: "", nom: "Laboratoire Biologie Essai", zone: "SIKASSO", region_nom: "Sikasso" },
    { line: 7, categorie: "PHARMACIE", nom: "", zone: "KAYES" },
    { line: 8, categorie: "PHARMACIE", nom: "Pharmacie Test Un", zone: "Commune III" },
  ];

  it("création réservée à l'administration", async () => {
    await expectError(q(db, w.customerA, "select public.admin_save_insurer('{\"name\":\"Pirate\"}'::jsonb)"), /administrat|PP403|réservé/i);
    ins = (await q(db, w.admin, "select public.admin_save_insurer($1::jsonb) as id", [JSON.stringify({ name: "Assurance Essai", network_date: "2026-10-31" })])).rows[0].id;
    expect((await q(db, null, "select slug from public.insurers where id = $1", [ins])).rows[0].slug).toBe("assurance-essai");
  });

  it("import : catégories, zones, téléphones nominatifs écartés, doublons, lien pharmacie", async () => {
    await expectError(q(db, w.customerA, "select public.admin_import_insurer_network($1, $2::jsonb)", [ins, JSON.stringify(rows)]), /administrat|PP403|réservé/i);
    const r = (await q(db, w.admin, "select public.admin_import_insurer_network($1, $2::jsonb, true) as r", [ins, JSON.stringify(rows)])).rows[0].r;
    expect(r).toMatchObject({ imported: 3, duplicates: 1, failed: 1 });
    const list = (await q(db, null, "select name, category, area, region_name, phones, pharmacy_id from public.search_insurer_network($1) order by name", [ins])).rows;
    expect(list).toEqual([
      { name: "Clinique Essai", category: "clinique", area: "Cinquième Arrondissement", region_name: "District de Bamako", phones: ["+22366721597"], pharmacy_id: null },
      { name: "Laboratoire Biologie Essai", category: "laboratoire", area: "Sikasso", region_name: "Sikasso", phones: [], pharmacy_id: null },
      { name: "PHARMACIE TEST UN", category: "pharmacie", area: "Troisième Arrondissement", region_name: "District de Bamako", phones: ["+22320248974"], pharmacy_id: w.ph1 },
    ]);
    expect((await q(db, null, "select name from public.pharmacy_insurers($1)", [w.ph1])).rows).toEqual([{ name: "Assurance Essai" }]);
    expect((await q(db, null, "select count(*)::int n from public.search_insurer_network($1, 'clinique', null, null)", [ins])).rows[0].n).toBe(1);
    expect((await q(db, null, "select count(*)::int n from public.search_insurer_network($1, null, 'pharmacie', null)", [ins])).rows[0].n).toBe(1);
  });

  it("lien manuel conservé ; partenaire masqué ; assureur dépublié invisible", async () => {
    const prov = (await sys(db, "select id from public.insurer_providers where name = 'Clinique Essai'")).rows[0].id;
    const pharm = (await sys(db, "select id from public.insurer_providers where category = 'pharmacie'")).rows[0].id;
    await q(db, w.admin, "select public.admin_link_provider($1, null, true)", [pharm]);
    expect((await q(db, null, "select count(*)::int n from public.pharmacy_insurers($1)", [w.ph1])).rows[0].n).toBe(0);
    await q(db, w.admin, "select public.admin_link_provider($1, null, false)", [pharm]);
    expect((await q(db, null, "select count(*)::int n from public.pharmacy_insurers($1)", [w.ph1])).rows[0].n).toBe(1);
    await q(db, w.admin, "select public.admin_set_provider_published($1, false)", [prov]);
    expect((await q(db, null, "select count(*)::int n from public.insurer_providers where insurer_id = $1", [ins])).rows[0].n).toBe(2);
    await q(db, w.admin, "select public.admin_save_insurer($1::jsonb)", [JSON.stringify({ id: ins, name: "Assurance Essai", is_published: false })]);
    expect((await q(db, null, "select count(*)::int n from public.insurers_overview()")).rows[0].n).toBe(0);
    expect((await q(db, null, "select count(*)::int n from public.search_insurer_network($1)", [ins])).rows[0].n).toBe(0);
    await expectError(q(db, w.admin, "update public.insurers set name = 'x'"), /permission denied/);
  });
});
