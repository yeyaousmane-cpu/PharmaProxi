/**
 * Registres publics : Tableau de l'Ordre des médecins et établissements non vérifiés.
 * Import réservé à l'administration, correspondance des spécialités, conseils régionaux,
 * recherche publique, masquage durable (opposition d'un médecin), pas de doublon avec
 * une fiche médecin vérifiée.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildWorld, createTestDb, createUser, Db, expectError, hasDb, q, sys, World } from "./helpers";

const TABLEAU = [
  { ordre: "1", inscription: "2019393", nom: "ABACAR", prenom: "Seydou", specialite: "Généraliste", structure: "Hôpital Régional de Sikasso", crom: "CROM GAO" },
  { ordre: "2", inscription: "2018147", nom: "ABDOUL AZIZ", prenom: "Abidine", specialite: "Chirurgie générale", structure: "ONG Muso", crom: "BAMAKO" },
  { ordre: "3", inscription: "2003009", nom: "AG ABOUBACRINE", prenom: "Souleymane", specialite: "Maladies infectieuses et tropicales", structure: "Clinique Kénéya", crom: "BAMAKO" },
  { ordre: "4", inscription: "1990003", nom: "YENA", prenom: "Sadio", specialite: "Chirurgie Thorac et cardiovascul", structure: "Hôpital du Mali", crom: "NIORO SAHEL" },
  { ordre: "5", inscription: "2022260", nom: "ALBAKAYE", prenom: "Mohamed", specialite: "Neurologie", structure: "", crom: "TAOUDENNI" },
  { ordre: "6", inscription: "2010001", nom: "TRAORE", prenom: "Awa", specialite: "Pédiatrie-néonatologie", structure: "CHU Gabriel TOURE", crom: "BAMAKO" },
  { ordre: "7", inscription: "2010002", nom: "KEITA", prenom: "Ibrahim", specialite: "Gestionnaire Services de Santé", structure: "", crom: "DIOILA" },
  { ordre: "8", inscription: "2010002", nom: "KEITA", prenom: "Ibrahim", specialite: "", structure: "", crom: "DIOILA" },
  { ordre: "9", inscription: "", nom: "", prenom: "Sans nom", specialite: "", structure: "", crom: "" },
];

describe.skipIf(!hasDb)("Registres publics", () => {
  let db: Db;
  let w: World;
  const imp = (uid: string, rows: unknown[], replace = false, year = 2025) =>
    q(db, uid, "select public.admin_import_doctor_register($1, $2::jsonb, $3) as r", [year, JSON.stringify(rows), replace]).then((r) => r.rows[0].r);
  const spec = async (code: string) => (await sys(db, "select id from public.medical_specialties where code = $1", [code])).rows[0].id as string;
  const region = async (name: string) => (await sys(db, "select id from public.regions where name = $1", [name])).rows[0].id as string;

  beforeAll(async () => {
    db = await createTestDb();
    w = await buildWorld(db);
  }, 120_000);
  afterAll(async () => db?.close());

  it("associe les libellés du Tableau aux spécialités de l'annuaire", async () => {
    const r = (await q(db, null, `select public.register_specialty_code('Généraliste') a, public.register_specialty_code('Pédiatrie-néonatologie') b,
      public.register_specialty_code('Chirurgie Thorac et cardiovascul') c, public.register_specialty_code('C.O & Traumatologie') d,
      public.register_specialty_code('Hémato-Biologie') e, public.register_specialty_code('ORL et CCF') f,
      public.register_specialty_code('Gestionnaire Services de Santé') g, public.register_specialty_code('Epidémiologie') h`)).rows[0];
    expect(r).toEqual({ a: "medecine_generale", b: "pediatrie", c: "chirurgie_cardio_thoracique", d: "traumatologie", e: "biologie", f: "orl", g: null, h: "sante_publique" });
  });

  it("seule l'administration importe ; doublons et erreurs comptés", async () => {
    await expectError(imp(w.customerA, TABLEAU), /réservée à l'administration/);
    await expectError(q(db, w.customerA, "insert into public.doctor_register (register_year, last_name) values (2025, 'X')"), /permission denied/);
    const r = await imp(w.admin, TABLEAU, true);
    expect(r).toMatchObject({ imported: 7, duplicates: 1, failed: 1 });
    const rows = (await q(db, null, "select last_name, crom, region_id is not null as has_region from public.doctor_register order by order_no")).rows;
    expect(rows.every((x) => x.has_region)).toBe(true);
    expect(rows[0].crom).toBe("GAO");
  });

  it("recherche publique : nom, spécialité, région ; sans coordonnée personnelle", async () => {
    const all = (await q(db, null, "select * from public.search_doctor_register(p_limit => 50)")).rows;
    expect(all).toHaveLength(7);
    expect(Object.keys(all[0])).not.toContain("phone");
    const ped = (await q(db, null, "select last_name from public.search_doctor_register(p_specialty => $1)", [await spec("pediatrie")])).rows;
    expect(ped.map((x) => x.last_name)).toEqual(["TRAORE"]);
    const byName = (await q(db, null, "select last_name, total_count from public.search_doctor_register('traore awa')")).rows;
    expect(byName).toHaveLength(1);
    const byStructure = (await q(db, null, "select last_name from public.search_doctor_register('gabriel toure')")).rows;
    expect(byStructure.map((x) => x.last_name)).toEqual(["TRAORE"]);
    const gao = (await q(db, null, "select last_name from public.search_doctor_register(p_region => $1)", [await region("Gao")])).rows;
    expect(gao.map((x) => x.last_name)).toEqual(["ABACAR"]);
    const nioro = (await q(db, null, "select last_name from public.search_doctor_register(p_region => $1)", [await region("Nioro")])).rows;
    expect(nioro.map((x) => x.last_name)).toEqual(["YENA"]);
    expect((await q(db, null, "select public.register_summary() as s")).rows[0].s).toEqual({ year: 2025, total: 7 });
  });

  it("un médecin masqué à sa demande le reste après un nouvel import", async () => {
    const id = (await q(db, w.admin, "select id from public.doctor_register where last_name = 'YENA'")).rows[0].id;
    await q(db, w.admin, "select public.admin_set_register_published($1, false)", [id]);
    expect((await q(db, null, "select id from public.search_doctor_register('yena')")).rowCount).toBe(0);
    const r = await imp(w.admin, TABLEAU, true);
    expect(r).toMatchObject({ imported: 7, replaced: 7 });
    expect((await q(db, null, "select id from public.search_doctor_register('yena')")).rowCount).toBe(0);
    const again = (await q(db, w.admin, "select id from public.doctor_register where last_name = 'YENA'")).rows[0].id;
    await q(db, w.admin, "select public.admin_set_register_published($1, true)", [again]);
    expect((await q(db, null, "select id from public.search_doctor_register('yena')")).rowCount).toBe(1);
  });

  it("pas de doublon avec une fiche médecin vérifiée portant le même numéro d'inscription", async () => {
    const u = await createUser(db, "awa");
    const doctor = (await q(db, u, "select public.register_doctor($1::jsonb) as id", [JSON.stringify({
      display_name: "Awa Traoré", consent: true, order_number: "2010001", languages: ["fr"], specialties: [await spec("pediatrie")],
    })])).rows[0].id;
    await q(db, u, "insert into public.doctor_documents (doctor_id, doc_type, storage_path, uploaded_by) values ($1, 'inscription_ordre', $2, $3)", [doctor, `doctor/${doctor}/o.pdf`, u]);
    await q(db, w.admin, "select public.admin_review_doctor($1, 'verified', null, $2::jsonb)", [doctor, JSON.stringify({ ordre: true, diplome: true, identite: true, lieu: true, telephone: true })]);
    expect((await q(db, null, "select id from public.search_doctor_register('traore awa')")).rowCount).toBe(0);
  });

  it("établissements non vérifiés : import, région facultative, téléphones, masquage", async () => {
    await expectError(q(db, w.customerA, "select public.admin_import_facility_listings('[]'::jsonb)"), /réservée à l'administration/);
    const r = (await q(db, w.admin, "select public.admin_import_facility_listings($1::jsonb) as r", [JSON.stringify([
      { nom: "Clinique Aldi", type: "clinique", region: "District de Bamako", ville: "Bamako", telephone: "20 21 14 34", telephone2: "20 21 97 21" },
      { nom: "Cabinet dentaire du Golf", type: "cabinet_dentaire", telephone: "20 28 09 96" },
      { nom: "CLINIQUE ALDI", type: "clinique", region: "Bamako" },
      { nom: "Garage", type: "garage" },
      { nom: "Centre X", region: "Atlantide" },
    ])])).rows[0].r;
    expect(r).toMatchObject({ imported: 2, duplicates: 1, failed: 2 });
    const pub = (await q(db, null, "select name, phone, phone2, region_name from public.search_facility_listings()")).rows;
    expect(pub).toHaveLength(2);
    expect(pub.find((x) => x.name === "Clinique Aldi")).toMatchObject({ phone: "+22320211434", phone2: "+22320219721", region_name: "District de Bamako" });
    expect((await q(db, null, "select name from public.search_facility_listings('aldi')")).rowCount).toBe(1);
    const id = (await q(db, w.admin, "select id from public.facility_listings where name = 'Clinique Aldi'")).rows[0].id;
    await q(db, w.admin, "select public.admin_set_facility_published($1, false)", [id]);
    expect((await q(db, null, "select name from public.search_facility_listings('aldi')")).rowCount).toBe(0);
    await q(db, w.admin, "select public.admin_delete_facility($1)", [id]);
    const st = (await q(db, w.admin, "select public.admin_register_stats() as s")).rows[0].s;
    expect(st).toMatchObject({ register_total: 7, facilities_total: 1, facilities_published: 1 });
  });
});
