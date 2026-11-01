/** AMO : import de la liste, rapprochement prudent, calcul du reste à payer, pharmacies conventionnées. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildWorld, createTestDb, Db, expectError, hasDb, q, sys, World } from "./helpers";

describe.skipIf(!hasDb)("Assurance maladie obligatoire", () => {
  let db: Db;
  let w: World;
  beforeAll(async () => { db = await createTestDb(); w = await buildWorld(db); }, 120_000);
  afterAll(async () => db?.close());
  // Données de test (fictives) au format de la liste CANAM : code, désignation, prix plafond
  const rows = [
    { code: "T0001", designation: "PARACETAMOL TEST 500MG COMP PL/10", prix_plafond: "100" },
    { code: "T0002", designation: "PARACETAMOL TEST 500MG CPR EFFV BTE/16", prix_plafond: "1 360" },
    { code: "T0003", designation: "AMOXICILLINE TEST 500MG GELU PL/10", prix_plafond: "655" },
    { code: "T0004", designation: "AMOXICILLINE TEST 500MG GELU BTE/12", prix_plafond: "990" },
    { code: "T0005", designation: "", prix_plafond: "10" },
    { code: "T0006", designation: "PRODUIT TAUX 0,5% COLLYRE", prix_plafond: "abc", taux: "0,8" },
  ];

  it("calcul : taux × min(prix, tarif)", async () => {
    const r = (await q(db, null, "select public.amo_patient_share(1000, 1000, 70) a, public.amo_patient_share(1200, 1000, 70) b, public.amo_patient_share(800, 1000, 70) c, public.amo_patient_share(1000, null, 70) d")).rows[0];
    expect(r).toEqual({ a: 300, b: 500, c: 240, d: 300 });
  });

  it("import réservé à l'administration, erreurs ligne par ligne, rapprochement prudent", async () => {
    await expectError(q(db, w.customerA, "select public.admin_import_amo('Test', $1::jsonb)", [JSON.stringify(rows)]), /administrat|PP403|réservé/i);
    const r = (await q(db, w.admin, "select public.admin_import_amo('Liste test', $1::jsonb, true) as r", [JSON.stringify(rows)])).rows[0].r;
    expect(r).toMatchObject({ imported: 4, failed: 2 });
    expect((await q(db, null, "select tariff_xof from public.amo_medicines where code = 'T0002'")).rows[0].tariff_xof).toBe(1360);
    await q(db, w.admin, "select public.admin_amo_finish_import()");
    const links = (await sys(db, "select l.catalog_id, a.code from public.amo_catalog_links l left join public.amo_medicines a on a.id = l.amo_id")).rows;
    // Paracétamol comprimé : le comprimé effervescent est écarté → lien unique
    expect(links.find((l) => l.catalog_id === w.para1.catalogId)?.code).toBe("T0001");
    // Amoxicilline : deux boîtes à des tarifs différents → aucun lien automatique
    expect(links.find((l) => l.catalog_id === w.amox1.catalogId)).toBeUndefined();
    // Recherche publique : « 500 mg » retrouve « 500MG »
    const s = (await q(db, null, "select code, patient_share from public.amo_search('paracetamol test 500 mg') order by code")).rows;
    expect(s).toEqual([{ code: "T0001", patient_share: 30 }, { code: "T0002", patient_share: 408 }]);
  });

  it("lien manuel par l'administration, conservé au rapprochement", async () => {
    const t4 = (await sys(db, "select id from public.amo_medicines where code = 'T0004'")).rows[0].id;
    await expectError(q(db, w.ph1User, "select public.admin_amo_link($1, $2)", [w.amox1.catalogId, t4]), /administrat|PP403|réservé/i);
    await q(db, w.admin, "select public.admin_amo_link($1, $2)", [w.amox1.catalogId, t4]);
    await q(db, w.admin, "select public.admin_amo_finish_import()");
    const r = (await q(db, null, "select public.amo_for_results($1::uuid[], $2::uuid[]) as r", [[w.amox1.catalogId, w.para1.catalogId], [w.ph1, w.ph2]])).rows[0].r;
    expect(r.rate).toBe(70);
    expect(r.products[w.amox1.catalogId]).toMatchObject({ amo: true, code: "T0004", tariff: 990, rate: 70 });
    expect(r.products[w.para1.catalogId]).toMatchObject({ amo: true, code: "T0001" });
    expect(r.pharmacies).toEqual({});
    // « Non pris en charge » confirmé
    await q(db, w.admin, "select public.admin_amo_link($1, null, true)", [w.amox1.catalogId]);
    const r2 = (await q(db, null, "select public.amo_for_results($1::uuid[], '{}') as r", [[w.amox1.catalogId]])).rows[0].r;
    expect(r2.products[w.amox1.catalogId].amo).toBe(false);
  });

  it("pharmacie conventionnée : déclarée par le propriétaire, vérifiée par l'administration", async () => {
    await expectError(q(db, w.ph2User, "select public.pharmacy_declare_amo($1, true)", [w.ph1]), /propriétaire|PP403/);
    await q(db, w.ph1User, "select public.pharmacy_declare_amo($1, true)", [w.ph1]);
    let r = (await q(db, null, "select public.amo_for_results('{}', $1::uuid[]) as r", [[w.ph1, w.ph2]])).rows[0].r;
    expect(r.pharmacies).toEqual({ [w.ph1]: "declared" });
    await expectError(q(db, w.ph1User, "update public.pharmacy_amo set status = 'verified'"), /permission denied/);
    await q(db, w.admin, "select public.admin_set_pharmacy_amo($1, 'verified')", [w.ph1]);
    r = (await q(db, null, "select public.amo_for_results('{}', $1::uuid[]) as r", [[w.ph1]])).rows[0].r;
    expect(r.pharmacies).toEqual({ [w.ph1]: "verified" });
    // Une nouvelle déclaration ne fait pas perdre la vérification
    await q(db, w.ph1User, "select public.pharmacy_declare_amo($1, true)", [w.ph1]);
    expect((await sys(db, "select status from public.pharmacy_amo where pharmacy_id = $1", [w.ph1])).rows[0].status).toBe("verified");
    // Refus : non visible publiquement, nouvelle déclaration bloquée
    await q(db, w.admin, "select public.admin_set_pharmacy_amo($1, 'rejected', 'Convention non trouvée')", [w.ph2]);
    expect((await q(db, null, "select count(*)::int n from public.pharmacy_amo where pharmacy_id = $1", [w.ph2])).rows[0].n).toBe(0);
    await expectError(q(db, w.ph2User, "select public.pharmacy_declare_amo($1, true)", [w.ph2]), /refusée/);
    expect((await q(db, null, "select (public.amo_summary() ->> 'verified')::int v")).rows[0].v).toBe(1);
  });

  it("configuration : taux et intitulé modifiables par l'administration seulement", async () => {
    await expectError(q(db, w.customerA, "select public.admin_amo_config('{\"rate_medicines\": 100}'::jsonb)"), /administrat|PP403|réservé/i);
    await expectError(q(db, w.admin, "select public.admin_amo_config('{\"rate_medicines\": 150}'::jsonb)"), /taux/);
    await q(db, w.admin, "select public.admin_amo_config('{\"rate_medicines\": 80, \"list_label\": \"Liste test\", \"list_date\": \"2014-10-01\"}'::jsonb)");
    const s = (await q(db, null, "select public.amo_summary() as s")).rows[0].s;
    expect(s).toMatchObject({ total: 4, rate: 80, label: "Liste test", date: "2014-10-01" });
    expect((await q(db, null, "select patient_share from public.amo_search('T0001')")).rows[0].patient_share).toBe(20);
  });

  it("nouveau produit au catalogue : relié automatiquement s'il est sans ambiguïté", async () => {
    const id = (await q(db, w.ph1User, "select public.upsert_catalog_item($1::jsonb) as id", [JSON.stringify({ brand_name: "Produit Taux", dosage: "0,5 %", form: "Collyre", category_id: w.cat("Médicaments sans ordonnance") })])).rows[0].id;
    // La ligne T0006 avait un tarif invalide : non importée → pas de lien
    expect((await sys(db, "select count(*)::int n from public.amo_catalog_links where catalog_id = $1", [id])).rows[0].n).toBe(0);
    await q(db, w.admin, "select public.admin_import_amo('Liste test', $1::jsonb)", [JSON.stringify([{ code: "T0007", nom: "PRODUIT TAUX 0,5% COLLYRE FL/5ML", tarif: "4150" }])]);
    await q(db, w.ph1User, "select public.upsert_catalog_item($1::jsonb)", [JSON.stringify({ brand_name: "Produit Taux", dosage: "0,5 %", form: "Collyre", packaging: "Flacon 5 ml", category_id: w.cat("Médicaments sans ordonnance") })]);
    const n = (await sys(db, "select count(*)::int n from public.amo_catalog_links l join public.amo_medicines a on a.id = l.amo_id where a.code = 'T0007'")).rows[0].n;
    expect(n).toBe(1);
  });
});
