/**
 * Demandes de rendez-vous : publication du lieu, règles de demande (jour de consultation,
 * absence, limites), cloisonnement du motif, réponses du médecin et du secrétariat,
 * contre-proposition, annulation, clôture, expiration automatique.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildWorld, createTestDb, createUser, Db, expectError, hasDb, q, sys, World } from "./helpers";

const MORNINGS = { mon: [["08:00", "12:00"]], tue: [["08:00", "12:00"]], wed: [["08:00", "12:00"]], thu: [["08:00", "12:00"]], fri: [["08:00", "12:00"]], sat: [["08:00", "12:00"]] };
const iso = (d: Date) => d.toISOString().slice(0, 10);
/** Prochain jour (à partir de demain) dont le jour ISO de la semaine vaut `dow` (1 = lundi … 7 = dimanche). */
function next(dow: number, after = 1) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + after);
  while (((d.getUTCDay() + 6) % 7) + 1 !== dow) d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

describe.skipIf(!hasDb)("Rendez-vous", () => {
  let db: Db;
  let w: World;
  let docUser: string, clinicUser: string, secretary: string, patient: string, patient2: string;
  let doctor: string, clinic: string, site: string;
  const req = (uid: string, p: { date: string; period?: string; name?: string; phone?: string; reason?: string; key?: string; site?: string }) =>
    q(db, uid, "select public.request_appointment($1, $2::date, $3, $4, $5, $6, $7) as id",
      [p.site ?? site, p.date, p.period ?? "matin", p.name ?? "Fatoumata Diarra", p.phone ?? "76 11 22 33", p.reason ?? null, p.key ?? null]).then((r) => r.rows[0].id as string);

  beforeAll(async () => {
    db = await createTestDb();
    w = await buildWorld(db);
    docUser = await createUser(db, "docteur");
    clinicUser = await createUser(db, "clinique");
    secretary = await createUser(db, "secretaire");
    patient = await createUser(db, "patiente");
    patient2 = await createUser(db, "patient2");
    const spec = (await sys(db, "select id from public.medical_specialties where code = 'pediatrie'")).rows[0].id;
    doctor = (await q(db, docUser, "select public.register_doctor($1::jsonb) as id", [JSON.stringify({
      display_name: "Awa Traoré", consent: true, order_number: "ML-77", languages: ["fr"], specialties: [spec] })])).rows[0].id;
    await q(db, docUser, "insert into public.doctor_documents (doctor_id, doc_type, storage_path, uploaded_by) values ($1, 'inscription_ordre', $2, $3)", [doctor, `doctor/${doctor}/o.pdf`, docUser]);
    await q(db, w.admin, "select public.admin_review_doctor($1, 'verified', null, $2::jsonb)", [doctor, JSON.stringify({ ordre: true, diplome: true, identite: true, lieu: true, telephone: true })]);
    clinic = (await q(db, clinicUser, "select public.register_clinic($1::jsonb) as id", [JSON.stringify({
      name: "Clinique du Fleuve", kind: "clinique", address: "Rue 1", region_id: w.region, phone: "+22320000000", manager_name: "M. Responsable" })])).rows[0].id;
    await q(db, clinicUser, "insert into public.clinic_documents (clinic_id, doc_type, storage_path, uploaded_by) values ($1, 'autorisation_ouverture', $2, $3)", [clinic, `clinic/${clinic}/a.pdf`, clinicUser]);
    await q(db, w.admin, "select public.admin_review_clinic($1, 'verified', null, $2::jsonb)", [clinic, JSON.stringify({ autorisation: true, existence_legale: true, responsable: true, adresse: true, telephone: true })]);
    const email = (await sys(db, "select email from auth.users where id = $1", [secretary])).rows[0].email;
    await q(db, clinicUser, "select public.clinic_add_member($1, $2)", [clinic, email]);
    site = (await q(db, docUser, "select public.doctor_propose_site($1, $2::jsonb) as id", [clinic, JSON.stringify(MORNINGS)])).rows[0].id;
    await q(db, clinicUser, "select public.accept_practice_site($1)", [site]);
  }, 120_000);
  afterAll(async () => db?.close());

  it("un lieu n'accepte les demandes en ligne qu'après activation par le médecin ou l'établissement", async () => {
    await expectError(req(patient, { date: iso(next(1)) }), /ne prend pas de demandes en ligne/);
    await expectError(q(db, patient, "select public.set_site_appointments($1, true)", [site]), /réservée au médecin/);
    await q(db, secretary, "select public.set_site_appointments($1, true)", [site]);
    expect((await q(db, null, "select accepts_appointments from public.doctor_practice_sites where id = $1", [site])).rows[0].accepts_appointments).toBe(true);
  });

  it("refuse les demandes hors jours ou heures de consultation, passées, trop lointaines, ou anonymes", async () => {
    await expectError(req(patient, { date: iso(next(7)) }), /ne consulte pas à ce moment/);
    await expectError(req(patient, { date: iso(next(2)), period: "apres_midi" }), /ne consulte pas à ce moment/);
    await expectError(req(patient, { date: "2020-01-06" }), /date à venir/);
    await expectError(req(patient, { date: iso(next(1, 70)) }), /60 jours/);
    await expectError(q(db, null, "select public.request_appointment($1, current_date + 1, 'matin', 'X Y', '76112233')", [site]), /permission denied|connectez-vous/);
    await expectError(req(patient, { date: iso(next(1)), phone: "123" }), /téléphone/);
  });

  it("refuse un jour d'absence annoncée", async () => {
    const day = iso(next(3, 8));
    const abs = (await q(db, docUser, "select public.add_doctor_absence($1::date, $1::date, 'Congrès') as id", [day])).rows[0].id;
    await expectError(req(patient, { date: day }), /absence/);
    await q(db, docUser, "select public.remove_doctor_absence($1)", [abs]);
  });

  let a1: string;
  it("la demande est enregistrée (une seule fois), notifiée, et son motif n'est visible que des personnes concernées", async () => {
    a1 = await req(patient, { date: iso(next(2)), reason: "Contrôle vaccin", key: "k1" });
    expect(await req(patient, { date: iso(next(2)), reason: "Contrôle vaccin", key: "k1" })).toBe(a1);
    await expectError(req(patient, { date: iso(next(2)) }), /déjà une demande auprès de ce médecin pour ce jour/);
    const n = (await q(db, docUser, "select title, link from public.notifications where kind = 'appointment'")).rows;
    expect(n).toEqual([{ title: "Nouvelle demande de rendez-vous", link: "/medecin/rendez-vous" }]);
    expect((await q(db, secretary, "select link from public.notifications where kind = 'appointment'")).rows[0].link).toBe(`/clinique/${clinic}/rendez-vous`);
    expect((await q(db, patient, "select reason, patient_phone from public.appointments where id = $1", [a1])).rows[0]).toEqual({ reason: "Contrôle vaccin", patient_phone: "+22376112233" });
    expect((await q(db, secretary, "select reason from public.appointments where id = $1", [a1])).rowCount).toBe(1);
    expect((await q(db, patient2, "select id from public.appointments")).rowCount).toBe(0);
    expect((await q(db, w.admin, "select id from public.appointments")).rowCount).toBe(0);
    expect((await q(db, w.ph1User, "select id from public.appointments")).rowCount).toBe(0);
    await expectError(q(db, patient, "update public.appointments set status = 'confirmed' where id = $1", [a1]), /permission denied/);
    const mine = (await q(db, patient, "select doctor_label, clinic_name, status from public.my_appointments()")).rows;
    expect(mine).toEqual([{ doctor_label: "Dr Awa Traoré", clinic_name: "Clinique du Fleuve", status: "pending" }]);
    expect((await q(db, docUser, "select patient_name from public.practice_appointments()")).rows.map((r) => r.patient_name)).toEqual(["Fatoumata Diarra"]);
    expect((await q(db, secretary, "select id from public.practice_appointments($1)", [clinic])).rowCount).toBe(1);
    await expectError(q(db, patient2, "select * from public.practice_appointments($1)", [clinic]), /réservée à l'établissement/);
  });

  it("le médecin confirme avec une heure ; seul le patient ou le cabinet peut annuler", async () => {
    const day = iso(next(2));
    await expectError(q(db, patient2, "select public.respond_appointment($1, 'confirm', $2::timestamptz)", [a1, `${day}T09:30:00Z`]), /introuvable/);
    await expectError(q(db, docUser, "select public.respond_appointment($1, 'confirm', $2::timestamptz)", [a1, `${iso(next(3))}T09:30:00Z`]), /autre moment/);
    await q(db, docUser, "select public.respond_appointment($1, 'confirm', $2::timestamptz, 'Apportez le carnet')", [a1, `${day}T09:30:00Z`]);
    const p = (await q(db, patient, "select status, response_note from public.my_appointments()")).rows[0];
    expect(p).toEqual({ status: "confirmed", response_note: "Apportez le carnet" });
    expect((await q(db, patient, "select title from public.notifications where kind = 'appointment' order by created_at desc limit 1")).rows[0].title).toBe("Rendez-vous confirmé");
    await expectError(q(db, docUser, "select public.respond_appointment($1, 'decline', null, 'complet')", [a1]), /déjà reçu une réponse/);
    await expectError(q(db, secretary, "select public.cancel_appointment($1, '')", [a1]), /motif/);
    await expectError(q(db, docUser, "select public.close_appointment($1, 'completed')", [a1]), /pas encore eu lieu/);
    await q(db, patient, "select public.cancel_appointment($1)", [a1]);
    expect((await q(db, docUser, "select status, cancelled_by from public.appointments where id = $1", [a1])).rows[0]).toEqual({ status: "cancelled", cancelled_by: "patient" });
  });

  it("contre-proposition acceptée par le patient, puis clôture après l'heure", async () => {
    const id = await req(patient2, { date: iso(next(4)), name: "Moussa Coulibaly", phone: "+22366000000" });
    await q(db, secretary, "select public.respond_appointment($1, 'propose', $2::timestamptz, 'Le jeudi est complet')", [id, `${iso(next(5))}T08:15:00Z`]);
    await expectError(q(db, patient, "select public.answer_appointment_proposal($1, true)", [id]), /introuvable/);
    await q(db, patient2, "select public.answer_appointment_proposal($1, true)", [id]);
    expect((await q(db, patient2, "select status from public.appointments where id = $1", [id])).rows[0].status).toBe("confirmed");
    // Simule le passage du temps : le rendez-vous a eu lieu
    await sys(db, "update public.appointments set scheduled_at = now() - interval '1 hour' where id = $1", [id]);
    await q(db, docUser, "select public.close_appointment($1, 'no_show')", [id]);
    expect((await q(db, patient2, "select status from public.appointments where id = $1", [id])).rows[0].status).toBe("no_show");
  });

  it("refus motivé obligatoire ; limite de 3 demandes en attente par patient", async () => {
    const ids = [] as string[];
    for (const dow of [1, 2, 3]) ids.push(await req(patient, { date: iso(next(dow, 15)) }));
    await expectError(req(patient, { date: iso(next(4, 15)) }), /3 demandes en attente/);
    await expectError(q(db, docUser, "select public.respond_appointment($1, 'decline')", [ids[0]]), /motif/);
    await q(db, docUser, "select public.respond_appointment($1, 'decline', null, 'Complet ce jour-là, appelez le secrétariat')", [ids[0]]);
    expect(await req(patient, { date: iso(next(4, 15)) })).toBeTruthy();
  });

  it("expiration automatique des demandes sans réponse et statistiques sans données personnelles", async () => {
    await sys(db, "update public.appointments set created_at = now() - interval '3 days' where status = 'pending'");
    const n = (await sys(db, "select public.expire_appointments() as n")).rows[0].n;
    expect(n).toBe(3);
    expect((await q(db, patient, "select count(*)::int as n from public.appointments where status = 'expired'")).rows[0].n).toBe(3);
    const st = (await q(db, w.admin, "select public.admin_appointment_stats() as s")).rows[0].s;
    expect(st.sites_open).toBe(1);
    expect(JSON.stringify(st)).not.toMatch(/Fatoumata|Moussa|vaccin/);
    const m = (await sys(db, "select public.run_maintenance() as r")).rows[0].r;
    expect(m).toHaveProperty("appointments_expired", 0);
  });
});
