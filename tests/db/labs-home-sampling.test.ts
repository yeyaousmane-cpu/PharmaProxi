/** 0.21 : profil à l'inscription, espace laboratoire, prélèvement à domicile, identifiants uniques, statistiques de l'offre. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildWorld, createTestDb, Db, expectError, hasDb, q, regionId, sys, World } from "./helpers";

describe.skipIf(!hasDb)("Laboratoires et prélèvement à domicile", () => {
  let db: Db;
  let w: World;
  let lab: string;
  let nfs: string;
  let bamako: string;
  const email = async (uid: string) => (await sys(db, "select email from auth.users where id = $1", [uid])).rows[0].email as string;
  beforeAll(async () => {
    db = await createTestDb(); w = await buildWorld(db); bamako = await regionId(db);
    lab = (await sys(db, "insert into public.facility_listings (name, kind, region_id, phone) values ('Laboratoire Test', 'laboratoire', $1, '+22370000000') returning id", [bamako])).rows[0].id;
    nfs = (await sys(db, "select id from public.medical_exams where code = 'nfs'")).rows[0].id;
  }, 120_000);
  afterAll(async () => db?.close());

  it("profil : lu à l'inscription, modifiable, valeurs contrôlées", async () => {
    const u = (await sys(db, "insert into auth.users (id, email, raw_user_meta_data) values (gen_random_uuid(), 'labo.nouveau@test.invalid', '{\"full_name\":\"Awa\",\"account_type\":\"laboratoire\"}') returning id")).rows[0].id;
    expect((await sys(db, "select account_type from public.profiles where id = $1", [u])).rows[0].account_type).toBe("laboratoire");
    const v = (await sys(db, "insert into auth.users (id, email, raw_user_meta_data) values (gen_random_uuid(), 'pirate@test.invalid', '{\"account_type\":\"admin\"}') returning id")).rows[0].id;
    expect((await sys(db, "select account_type from public.profiles where id = $1", [v])).rows[0].account_type).toBe("patient");
    await q(db, w.customerA, "select public.set_account_type('medecin')");
    await expectError(q(db, w.customerA, "select public.set_account_type('admin')"), /invalide/);
    await q(db, w.customerA, "select public.set_account_type('patient')");
  });

  it("identifiants uniques attribués et distincts", async () => {
    const codes = (await sys(db, "select public_code from public.pharmacies union all select public_code from public.facility_listings")).rows.map((r) => r.public_code);
    expect(codes.every((c) => /^PP-(PH|ET|LB)-\d{6}$/.test(c))).toBe(true);
    expect(new Set(codes).size).toBe(codes.length);
    expect((await sys(db, "select public_code from public.facility_listings where id = $1", [lab])).rows[0].public_code).toMatch(/^PP-LB-/);
  });

  it("espace laboratoire : réservé aux membres désignés par l'administrateur", async () => {
    await expectError(q(db, w.customerB, "select public.lab_save_exam($1, $2, 5000, null, '24 h')", [lab, nfs]), /réservé aux membres/);
    await expectError(q(db, w.customerB, "select public.admin_grant_lab($1, $2)", [await email(w.customerB), lab]), /administrat|réservé|PP403/i);
    await q(db, w.customerB, "insert into public.lab_access_requests (lab_name, phone, authorization_ref) values ('Laboratoire Test', '+22370000000', 'Arrêté 2021-0042')");
    await expectError(q(db, w.customerB, "insert into public.lab_access_requests (lab_name, phone, authorization_ref, status) values ('X', '+22370000000', 'Y', 'acceptee')"), /row-level security/);
    const req = (await sys(db, "select id from public.lab_access_requests where user_id = $1", [w.customerB])).rows[0].id;
    await q(db, w.admin, "select public.admin_grant_lab(null, $1, $2)", [lab, req]);
    await q(db, w.customerB, "select public.lab_save_exam($1, $2, 5000, 'Tarif normal', '24 h')", [lab, nfs]);
    const row = (await q(db, null, "select price_xof, source from public.facility_exams where facility_id = $1", [lab])).rows[0];
    expect(row).toEqual({ price_xof: 5000, source: "Déclaré par le laboratoire" });
    await q(db, w.customerB, "select public.lab_suggest_exam($1, 'Dosage de l''homocystéine', 'biologie')", [lab]);
    expect((await q(db, w.admin, "select count(*)::int n from public.exam_suggestions")).rows[0].n).toBe(1);
  });

  it("prélèvement à domicile : seulement si le laboratoire le propose ; visible par le patient et le laboratoire", async () => {
    const d = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
    const req = { facility_id: lab, exam_ids: [nfs], patient_name: "Papa", patient_age: 74, for_relative: true, address: "Hamdallaye ACI, rue 300, porte 12", phone: "+22376000000", preferred_date: d, slot: "matin", has_prescription: true };
    await expectError(q(db, w.customerA, "select public.request_home_sampling($1)", [req]), /ne propose pas/);
    await q(db, w.customerB, "select public.lab_save_home_service($1, $2)", [lab, { enabled: true, fee_xof: "3000", partner_name: "Partenaire de soins à domicile", areas: "Bamako", hours: "7 h – 11 h" }]);
    await expectError(q(db, w.customerA, "select public.lab_save_home_service($1, $2)", [lab, { enabled: false }]), /réservé aux membres/);
    const id = (await q(db, w.customerA, "select public.request_home_sampling($1) id", [req])).rows[0].id;
    expect((await sys(db, "select count(*)::int n from public.notifications where user_id = $1 and kind = 'laboratoire' and title like 'Nouvelle demande%'", [w.customerB])).rows[0].n).toBe(1);
    expect((await q(db, w.customerA, "select count(*)::int n from public.home_sampling_requests")).rows[0].n).toBe(1);
    expect((await q(db, w.customerB, "select count(*)::int n from public.home_sampling_requests")).rows[0].n).toBe(1);
    expect((await q(db, w.ph1User, "select count(*)::int n from public.home_sampling_requests")).rows[0].n).toBe(0);
    await expectError(q(db, w.ph1User, "select public.lab_update_sampling($1, 'acceptee')", [id]), /introuvable/);
    await q(db, w.customerB, "select public.lab_update_sampling($1, 'planifiee', $2, 'Infirmière : Mme Diallo')", [id, `${d}T08:30:00Z`]);
    const n = (await sys(db, "select title, body from public.notifications where user_id = $1 and kind = 'laboratoire' order by created_at desc limit 1", [w.customerA])).rows[0];
    expect(n.title).toMatch(/planifié/); expect(n.body).toContain("08h30");
    await expectError(q(db, w.customerA, "select public.request_home_sampling($1)", [{ ...req, exam_ids: ["00000000-0000-4000-8000-000000000000"] }]), /analyse inconnue/);
    await q(db, w.customerA, "select public.cancel_home_sampling($1)", [id]);
    await expectError(q(db, w.customerB, "select public.lab_update_sampling($1, 'prelevee')", [id]), /close/);
  });

  it("statistiques de l'offre de soins : réservées aux autorités", async () => {
    await expectError(q(db, w.customerA, "select public.authority_supply()"), /réservé/);
    const s = (await q(db, w.admin, "select public.authority_supply() s")).rows[0].s;
    expect(s.by_region.find((r: { region_id: string }) => r.region_id === bamako).labs).toBeGreaterThanOrEqual(1);
    expect(s.by_region.find((r: { region_id: string }) => r.region_id === bamako).home_sampling).toBe(1);
  });

  it("suppression du compte : demandes et accès laboratoire effacés", async () => {
    await sys(db, "update public.profiles set deleted_at = now() where id = $1", [w.customerA]);
    expect((await sys(db, "select count(*)::int n from public.home_sampling_requests where user_id = $1", [w.customerA])).rows[0].n).toBe(0);
    await sys(db, "update public.profiles set deleted_at = now() where id = $1", [w.customerB]);
    expect((await sys(db, "select count(*)::int n from public.facility_members where user_id = $1", [w.customerB])).rows[0].n).toBe(0);
  });
});
