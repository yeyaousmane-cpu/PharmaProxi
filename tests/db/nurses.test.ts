/** Infirmiers : import du Tableau, téléphone publié seulement si autorisé, retrait durable, structures à domicile. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildWorld, createTestDb, Db, expectError, hasDb, q, sys, World } from "./helpers";

describe.skipIf(!hasDb)("Infirmiers et soins à domicile", () => {
  let db: Db;
  let w: World;
  beforeAll(async () => { db = await createTestDb(); w = await buildWorld(db); }, 120_000);
  afterAll(async () => db?.close());
  const rows = [
    { line: 2, inscription: "INF-001", nom: "TRAORE", prenom: "Aminata", specialite: "Infirmière d'État", section: "Bamako", structure: "CSRéf CV", telephone: "76 12 34 56", telephone_autorise: "oui", domicile: "oui" },
    { line: 3, inscription: "INF-002", nom: "Diarra", prenom: "Moussa", specialite: "Technicien de santé", section: "Ségou", telephone: "66 00 00 01", telephone_autorise: "non" },
    { line: 4, inscription: "INF-003", nom: "", prenom: "Sans nom" },
    { line: 5, inscription: "INF-004", nom: "Keita", telephone: "123" },
  ];

  it("import : erreurs ligne par ligne, région déduite, téléphone masqué sans accord", async () => {
    await expectError(q(db, w.customerA, "select public.admin_import_nurse_register(2026, $1::jsonb)", [JSON.stringify(rows)]), /administrat|PP403|réservé/i);
    const r = (await q(db, w.admin, "select public.admin_import_nurse_register(2026, $1::jsonb, true) as r", [JSON.stringify(rows)])).rows[0].r;
    expect(r).toMatchObject({ imported: 2, failed: 2 });
    const res = (await q(db, null, "select last_name, phone, home_care, region_name from public.search_nurse_register(null, null, null, 20, 0) order by last_name")).rows;
    expect(res).toEqual([
      { last_name: "Diarra", phone: null, home_care: false, region_name: "Ségou" },
      { last_name: "TRAORE", phone: "+22376123456", home_care: true, region_name: "District de Bamako" },
    ]);
    await expectError(q(db, null, "select * from public.nurse_register"), /permission denied/);
    expect((await q(db, w.customerA, "select count(*)::int as n from public.nurse_register")).rows[0].n).toBe(0);
    expect((await q(db, null, "select count(*)::int as n from public.search_nurse_register('aminata csref')")).rows[0].n).toBe(1);
  });

  it("retrait à la demande conservé au réimport ; vérification par l'administration", async () => {
    const id = (await sys(db, "select id from public.nurse_register where last_name = 'Diarra'")).rows[0].id;
    await q(db, w.admin, "select public.admin_update_nurse($1, '{\"is_published\": false}'::jsonb)", [id]);
    await q(db, w.admin, "select public.admin_import_nurse_register(2026, $1::jsonb, true)", [JSON.stringify(rows)]);
    expect((await q(db, null, "select count(*)::int as n from public.search_nurse_register('diarra')")).rows[0].n).toBe(0);
    const t = (await sys(db, "select id from public.nurse_register where last_name = 'TRAORE'")).rows[0].id;
    await q(db, w.admin, "select public.admin_update_nurse($1, '{\"phone\": \"\", \"phone_public\": true, \"verification\": \"verifie\"}'::jsonb)", [t]);
    expect((await q(db, null, "select phone, verification from public.search_nurse_register('traore')")).rows[0]).toEqual({ phone: null, verification: "verifie" });
  });

  it("structures à domicile : 4 référencées non vérifiées ; vérification exige une autorisation, non publiée", async () => {
    const list = (await q(db, null, "select name, verification from public.home_care_providers order by name")).rows;
    expect(list.map((r) => r.name)).toEqual(["Keneya Assistance", "Massaya Santé", "SMART SANTE", "Santé Mobile Groupe"]);
    expect(list.every((r) => r.verification === "non_verifie")).toBe(true);
    await expectError(q(db, null, "select authorization_ref from public.home_care_providers"), /permission denied/);
    const id = (await sys(db, "select id from public.home_care_providers where name = 'Keneya Assistance'")).rows[0].id;
    await expectError(q(db, w.admin, "select public.admin_save_home_care($1::jsonb)", [JSON.stringify({ id, name: "Keneya Assistance", verification: "verifie" })]), /référence d'autorisation/);
    await q(db, w.admin, "select public.admin_save_home_care($1::jsonb)", [JSON.stringify({ id, name: "Keneya Assistance", phone: "73 28 02 02", verification: "verifie", authorization_ref: "Arrêté n° X", care_types: ["pansements", "injections"] })]);
    expect((await q(db, null, "select verification, care_types, verified_at is not null as d from public.home_care_providers where id = $1", [id])).rows[0]).toEqual({ verification: "verifie", care_types: expect.arrayContaining(["pansements", "injections"]), d: true });
    await expectError(q(db, w.customerA, "select public.admin_save_home_care('{\"name\":\"Pirate\"}'::jsonb)"), /administrat|PP403|réservé/i);
    expect((await q(db, w.admin, "select count(*)::int as n from public.admin_home_care_list()")).rows[0].n).toBe(4);
    expect((await q(db, w.customerA, "select count(*)::int as n from public.admin_home_care_list()")).rows[0].n).toBe(0);
  });
});
