/** 0.31 : espace infirmier — inscription, vérification, colonnes privées, demandes de soins à domicile cloisonnées. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildWorld, createTestDb, createUser, Db, expectError, q, sys, World, hasDb } from "./helpers";

describe.skipIf(!hasDb)("Version 0.31 — espace infirmier", () => {
  let db: Db; let w: World; let nurseUser: string; let nurseId: string; let other: string;
  beforeAll(async () => { db = await createTestDb(); w = await buildWorld(db); nurseUser = await createUser(db, "inf31"); other = await createUser(db, "inf31b"); }, 120_000);
  afterAll(async () => db?.close());
  const reg = (over = {}) => JSON.stringify({ display_name: "Adama Test", registration_number: "INF-123", specialty: "Infirmier d'État", consent: "true", ...over });

  it("inscription : accord obligatoire, une seule fois, invisible avant vérification", async () => {
    await expectError(q(db, nurseUser, "select public.nurse_register_self($1::jsonb)", [reg({ consent: "false" })]), /accord/);
    nurseId = (await q(db, nurseUser, "select public.nurse_register_self($1::jsonb) id", [reg()])).rows[0].id;
    await expectError(q(db, nurseUser, "select public.nurse_register_self($1::jsonb)", [reg()]), /déjà/);
    expect((await q(db, null, "select count(id)::int n from public.nurse_accounts")).rows[0].n).toBe(0);
    expect((await q(db, nurseUser, "select status::text s from public.nurse_me()")).rows[0].s).toBe("pending");
    await q(db, nurseUser, "select public.nurse_update_self($1::jsonb)", [JSON.stringify({ published: true, phone: "+22376000031", phone_public: false, care_types: ["pansements", "injections"] })]);
    expect((await sys(db, "select is_published from public.nurse_accounts where id = $1", [nurseId])).rows[0].is_published).toBe(false);
  });

  it("vérification réservée à l'administration ; téléphone privé tant que non autorisé", async () => {
    await expectError(q(db, nurseUser, "select public.admin_review_nurse($1, 'verified', null)", [nurseId]), /administrat/);
    await expectError(q(db, w.admin, "select public.admin_review_nurse($1, 'rejected', '')", [nurseId]), /motif/);
    await q(db, w.admin, "select public.admin_review_nurse($1, 'verified', null)", [nurseId]);
    expect((await q(db, null, "select count(id)::int n from public.nurse_accounts where is_published")).rows[0].n).toBe(1);
    await expectError(q(db, null, "select phone from public.nurse_accounts"), /permission denied/);
    await expectError(q(db, w.customerA, "select phone from public.nurse_accounts"), /permission denied/);
    expect((await q(db, null, "select public.nurse_public_phone($1) p", [nurseId])).rows[0].p).toBeNull();
    await q(db, nurseUser, "select public.nurse_update_self($1::jsonb)", [JSON.stringify({ published: true, phone: "+22376000031", phone_public: true, care_types: ["pansements"] })]);
    expect((await q(db, null, "select public.nurse_public_phone($1) p", [nurseId])).rows[0].p).toBeTruthy();
    expect((await q(db, w.customerA, "select count(*)::int n from public.nurse_me()")).rows[0].n).toBe(0);
  });

  it("demande de soins : visible du seul patient et de l'infirmier destinataire, jamais de l'administration", async () => {
    const req = (o = {}) => JSON.stringify({ nurse_id: nurseId, care_type: "pansements", preferred_date: new Date(Date.now() + 2 * 86400_000).toISOString().slice(0, 10), preferred_slot: "matin", area: "Hamdallaye", contact_phone: "+22370000001", accord: "true", ...o });
    await expectError(q(db, w.customerA, "select public.request_home_care($1::jsonb)", [req({ accord: "false" })]), /accord/);
    await expectError(q(db, w.customerA, "select public.request_home_care($1::jsonb)", [req({ preferred_date: "2020-01-01" })]), /60 prochains jours/);
    const ref = (await q(db, w.customerA, "select public.request_home_care($1::jsonb) r", [req()])).rows[0].r;
    expect(ref).toMatch(/^SAD-\d{8}-[0-9A-F]{5}$/);
    const id = (await sys(db, "select id from public.home_care_requests where reference = $1", [ref])).rows[0].id;
    expect((await q(db, nurseUser, "select count(*)::int n from public.home_care_requests")).rows[0].n).toBe(1);
    expect((await q(db, w.customerB, "select count(*)::int n from public.home_care_requests")).rows[0].n).toBe(0);
    expect((await q(db, w.admin, "select count(*)::int n from public.home_care_requests")).rows[0].n).toBe(0);
    expect((await q(db, other, "select count(*)::int n from public.home_care_requests")).rows[0].n).toBe(0);
    await expectError(q(db, w.customerA, "select public.home_care_set_status($1, 'acceptee')", [id]), /infirmier/);
    await expectError(q(db, other, "select public.home_care_set_status($1, 'acceptee')", [id]), /refusé/);
    await q(db, nurseUser, "select public.home_care_set_status($1, 'acceptee', 'Je passe vers 9 h.')", [id]);
    expect((await sys(db, "select count(*)::int n from public.notifications where user_id = $1 and title = 'Demande de soins acceptée'", [w.customerA])).rows[0].n).toBe(1);
    await q(db, nurseUser, "select public.home_care_set_status($1, 'terminee')", [id]);
    await expectError(q(db, w.customerA, "select public.home_care_set_status($1, 'annulee')", [id]), /ne peut plus/);
  });

  it("infirmier suspendu : plus visible, plus de demande possible", async () => {
    await q(db, w.admin, "select public.admin_review_nurse($1, 'suspended', 'Justificatif expiré')", [nurseId]);
    expect((await q(db, null, "select count(id)::int n from public.nurse_accounts")).rows[0].n).toBe(0);
    await expectError(q(db, w.customerA, "select public.request_home_care($1::jsonb)", [JSON.stringify({ nurse_id: nurseId, care_type: "pansements", preferred_date: "2099-01-01", preferred_slot: "matin", area: "X Y", contact_phone: "+22370000001", accord: "true" })]), /ne reçoit pas/);
  });
});

describe.skipIf(!hasDb)("Version 0.31 — médecin traitant", () => {
  let db: Db; let w: World; let docUser: string; let docId: string; let person: string;
  beforeAll(async () => {
    db = await createTestDb(); w = await buildWorld(db); docUser = await createUser(db, "mt31");
    docId = (await sys(db, "insert into public.doctors (user_id, display_name, title, status, is_published, publication_consent_at) values ($1, 'Diarra (fictif)', 'Dr', 'verified', true, now()) returning id", [docUser])).rows[0].id;
    person = (await q(db, w.customerA, "select public.record_ensure_self() id")).rows[0].id;
  }, 120_000);
  afterAll(async () => db?.close());
  it("désignation par le patient, visible par lui seul ; le médecin ne voit que le nom, et seulement si prévenu", async () => {
    await q(db, w.customerA, "select public.set_treating_doctor($1::jsonb)", [JSON.stringify({ person_id: person, doctor_id: docId, notify_doctor: false })]);
    expect((await q(db, w.customerA, "select count(*)::int n from public.treating_doctors")).rows[0].n).toBe(1);
    expect((await q(db, w.customerB, "select count(*)::int n from public.treating_doctors")).rows[0].n).toBe(0);
    expect((await q(db, docUser, "select count(*)::int n from public.treating_doctor_patients()")).rows[0].n).toBe(0);
    await q(db, w.customerA, "select public.set_treating_doctor($1::jsonb)", [JSON.stringify({ person_id: person, doctor_id: docId, notify_doctor: true })]);
    const rows = (await q(db, docUser, "select * from public.treating_doctor_patients()")).rows;
    expect(rows.length).toBe(1); expect(Object.keys(rows[0]).sort()).toEqual(["designated_at", "patient_name", "since"]);
    expect((await sys(db, "select count(*)::int n from public.notifications where user_id = $1 and title like 'Un patient vous a désigné%'", [docUser])).rows[0].n).toBe(1);
    await expectError(q(db, w.customerB, "select public.set_treating_doctor($1::jsonb)", [JSON.stringify({ person_id: person, doctor_id: docId })]), /autre compte/);
  });
  it("médecin hors plateforme saisi librement ; retrait", async () => {
    await expectError(q(db, w.customerA, "select public.set_treating_doctor($1::jsonb)", [JSON.stringify({ person_id: person, free_name: "" })]), /check/);
    await q(db, w.customerA, "select public.set_treating_doctor($1::jsonb)", [JSON.stringify({ person_id: person, free_name: "Dr Coulibaly", free_structure: "CSCom de quartier", free_phone: "+22366000000" })]);
    expect((await q(db, docUser, "select count(*)::int n from public.treating_doctor_patients()")).rows[0].n).toBe(0);
    await q(db, w.customerA, "select public.remove_treating_doctor($1)", [person]);
    expect((await q(db, w.customerA, "select count(*)::int n from public.treating_doctors")).rows[0].n).toBe(0);
  });
  it("voix de synthèse (IA) : modèle obligatoire, publication seulement après vérification par un locuteur nommé, même en français", async () => {
    await q(db, w.admin, "select public.audio_register_clip('accueil', 'francais', 'accueil/fr-ia31.wav', 'audio/wav', 120000, 20, null, null, null)");
    const id = (await sys(db, "select id from public.audio_clips where target_key = 'accueil' and lang = 'francais'")).rows[0].id;
    await expectError(q(db, w.customerA, "select public.audio_set_origin($1, 'synthese_ia', 'facebook/mms-tts-bam')", [id]), /réservé/);
    await expectError(q(db, w.admin, "select public.audio_set_origin($1, 'synthese_ia', '')", [id]), /modèle/);
    await q(db, w.admin, "select public.audio_set_origin($1, 'synthese_ia', 'facebook/mms-tts-bam')", [id]);
    await expectError(q(db, w.admin, "select public.audio_set_published($1, true)", [id]), /locuteur natif/);
    await sys(db, "update public.audio_clips set reviewer = 'Relecteur Test' where id = $1", [id]);
    await q(db, w.admin, "select public.audio_set_published($1, true)", [id]);
    const c = (await q(db, null, "select origin, ai_model, status from public.audio_clips where id = $1", [id])).rows[0];
    expect(c).toEqual({ origin: "synthese_ia", ai_model: "facebook/mms-tts-bam", status: "published" });
    await q(db, w.admin, "select public.audio_set_origin($1, 'enregistrement', null)", [id]);
    expect((await sys(db, "select status, ai_model from public.audio_clips where id = $1", [id])).rows[0]).toEqual({ status: "draft", ai_model: null });
  });
});
