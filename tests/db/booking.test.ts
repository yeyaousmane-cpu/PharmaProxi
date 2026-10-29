/**
 * Réservation par créneaux : motifs, réglages du lieu, calcul des créneaux, réservation
 * immédiate (sans double réservation), proches, nouveaux patients, rendez-vous saisis par
 * le cabinet, plages bloquées, délai d'annulation, liste d'attente, rappels, prochaine dispo.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildWorld, createTestDb, createUser, Db, expectError, hasDb, q, sys, World } from "./helpers";

const ALL_DAYS = Object.fromEntries(["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((d) => [d, [["08:00", "10:00"]]]));
function dayIn(n: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

describe.skipIf(!hasDb)("Réservation par créneaux", () => {
  let db: Db;
  let w: World;
  let docUser: string, clinicUser: string, patient: string, patient2: string, stranger: string;
  let doctor: string, clinic: string, site: string, typeAll: string, typeNew: string;
  const slots = (day: string, type = typeAll, days = 1) =>
    q(db, null, "select slot_start from public.available_slots($1, $2, $3::date, $4) order by 1", [site, type, day, days]).then((r) => r.rows.map((x) => new Date(x.slot_start).toISOString()));
  const book = (uid: string, start: string, extra: { type?: string; relative?: string | null; name?: string; key?: string } = {}) =>
    q(db, uid, "select public.book_appointment($1, $2, $3::timestamptz, $4, '76 11 22 33', null, $5, $6) as id",
      [site, extra.type ?? typeAll, start, extra.name ?? "Awa Patiente", extra.relative ?? null, extra.key ?? null]).then((r) => r.rows[0].id as string);

  beforeAll(async () => {
    db = await createTestDb();
    w = await buildWorld(db);
    docUser = await createUser(db, "docteur");
    clinicUser = await createUser(db, "clinique");
    patient = await createUser(db, "patient");
    patient2 = await createUser(db, "patient2");
    stranger = await createUser(db, "inconnu");
    const spec = (await sys(db, "select id from public.medical_specialties where code = 'cardiologie'")).rows[0].id;
    doctor = (await q(db, docUser, "select public.register_doctor($1::jsonb) as id", [JSON.stringify({
      display_name: "Ibrahim Keita", consent: true, order_number: "ML-88", languages: ["fr"], specialties: [spec] })])).rows[0].id;
    await q(db, docUser, "insert into public.doctor_documents (doctor_id, doc_type, storage_path, uploaded_by) values ($1, 'inscription_ordre', $2, $3)", [doctor, `doctor/${doctor}/o.pdf`, docUser]);
    await q(db, w.admin, "select public.admin_review_doctor($1, 'verified', null, $2::jsonb)", [doctor, JSON.stringify({ ordre: true, diplome: true, identite: true, lieu: true, telephone: true })]);
    clinic = (await q(db, clinicUser, "select public.register_clinic($1::jsonb) as id", [JSON.stringify({
      name: "Polyclinique Niger", kind: "clinique", address: "Rue 2", region_id: w.region, phone: "+22320000001", manager_name: "Mme Directrice" })])).rows[0].id;
    await q(db, clinicUser, "insert into public.clinic_documents (clinic_id, doc_type, storage_path, uploaded_by) values ($1, 'autorisation_ouverture', $2, $3)", [clinic, `clinic/${clinic}/a.pdf`, clinicUser]);
    await q(db, w.admin, "select public.admin_review_clinic($1, 'verified', null, $2::jsonb)", [clinic, JSON.stringify({ autorisation: true, existence_legale: true, responsable: true, adresse: true, telephone: true })]);
    site = (await q(db, docUser, "select public.doctor_propose_site($1, $2::jsonb) as id", [clinic, JSON.stringify(ALL_DAYS)])).rows[0].id;
    await q(db, clinicUser, "select public.accept_practice_site($1)", [site]);
    await q(db, docUser, "select public.set_site_appointments($1, true)", [site]);
  }, 120_000);
  afterAll(async () => db?.close());

  it("motifs : créés par le médecin, lisibles du public, invisibles et non modifiables par un tiers", async () => {
    await expectError(q(db, docUser, "select public.update_site_booking($1, 'instant', 2, 2, null)", [site]), /au moins un motif/);
    typeAll = (await q(db, docUser, "select public.save_appointment_type($1::jsonb) as id", [JSON.stringify({ name: "Consultation de suivi", duration_min: 30, audience: "all", fee: "15 000 FCFA", instructions: "Apportez vos derniers examens" })])).rows[0].id;
    typeNew = (await q(db, docUser, "select public.save_appointment_type($1::jsonb) as id", [JSON.stringify({ name: "Première consultation", duration_min: 60, audience: "new" })])).rows[0].id;
    await expectError(q(db, stranger, "select public.save_appointment_type($1::jsonb)", [JSON.stringify({ name: "X", duration_min: 10 })]), /espace médecin requis|réservée au médecin/);
    await expectError(q(db, stranger, "select public.save_appointment_type($1::jsonb)", [JSON.stringify({ id: typeAll, name: "Piraté", duration_min: 10 })]), /réservée au médecin/);
    await expectError(q(db, docUser, "select public.save_appointment_type($1::jsonb)", [JSON.stringify({ name: "Trop long", duration_min: 600 })]), /durée/);
    expect((await q(db, null, "select name from public.appointment_types order by sort_order, name")).rowCount).toBe(2);
    await expectError(q(db, stranger, "select public.update_site_booking($1, 'instant', 2, 2, null)", [site]), /réservée au médecin/);
    await q(db, clinicUser, "select public.update_site_booking($1, 'instant', 0, 2, '2e étage, porte B')", [site]);
  });

  it("créneaux : découpés par la durée du motif, jamais dans le passé", async () => {
    const tomorrow = dayIn(1);
    expect(await slots(tomorrow)).toEqual([`${tomorrow}T08:00:00.000Z`, `${tomorrow}T08:30:00.000Z`, `${tomorrow}T09:00:00.000Z`, `${tomorrow}T09:30:00.000Z`]);
    expect(await slots(tomorrow, typeNew)).toEqual([`${tomorrow}T08:00:00.000Z`, `${tomorrow}T09:00:00.000Z`]);
    expect(await slots("2020-01-01", typeAll, 1)).not.toContain("2020-01-01T08:00:00.000Z");
    expect((await slots(dayIn(1), typeAll, 7)).length).toBe(28);
  });

  let first: string;
  it("réservation immédiate : confirmée, notifiée, et le créneau disparaît ; pas de double réservation", async () => {
    const start = `${dayIn(1)}T08:30:00Z`;
    first = await book(patient, start, { key: "k1" });
    expect(await book(patient, start, { key: "k1" })).toBe(first);
    const a = (await q(db, patient, "select status, ends_at, source from public.appointments where id = $1", [first])).rows[0];
    expect(a.status).toBe("confirmed");
    expect(new Date(a.ends_at).toISOString()).toBe(`${dayIn(1)}T09:00:00.000Z`);
    expect(await slots(dayIn(1))).not.toContain(`${dayIn(1)}T08:30:00.000Z`);
    // Le motif de 60 min ne peut plus commencer à 08:00 (chevauchement)
    expect(await slots(dayIn(1), typeNew)).toEqual([`${dayIn(1)}T09:00:00.000Z`]);
    await expectError(book(patient2, start), /n'est plus disponible/);
    await expectError(book(patient, `${dayIn(1)}T09:30:00Z`), /déjà un rendez-vous avec ce médecin ce jour-là/);
    await expectError(book(patient2, `${dayIn(1)}T08:10:00Z`), /n'est plus disponible/);
    const mine = (await q(db, patient, "select type_name, instructions, access_info, can_cancel from public.my_appointments()")).rows[0];
    expect(mine).toEqual({ type_name: "Consultation de suivi", instructions: "Apportez vos derniers examens", access_info: "2e étage, porte B", can_cancel: true });
    expect((await q(db, docUser, "select title from public.notifications where kind = 'appointment'")).rows[0].title).toBe("Nouveau rendez-vous");
  });

  it("réservations simultanées sur le même créneau : une seule réussit", async () => {
    const start = `${dayIn(2)}T08:00:00Z`;
    const users = await Promise.all(Array.from({ length: 6 }, (_, i) => createUser(db, `rush${i}`)));
    const results = await Promise.allSettled(users.map((u) => book(u, start)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await sys(db, "select count(*)::int as n from public.appointments where scheduled_at = $1 and status = 'confirmed'", [start])).rows[0].n).toBe(1);
  });

  it("proches : rendez-vous pour un enfant ; proches privés", async () => {
    await expectError(q(db, patient, "select public.add_relative('X', 'enfant')"), /nom/);
    const kid = (await q(db, patient, "select public.add_relative('Moussa (fils)', 'enfant') as id")).rows[0].id;
    expect((await q(db, patient2, "select id from public.patient_relatives")).rowCount).toBe(0);
    await expectError(book(patient2, `${dayIn(3)}T08:00:00Z`, { relative: kid }), /proche introuvable/);
    const id = await book(patient, `${dayIn(3)}T08:00:00Z`, { relative: kid });
    expect((await q(db, docUser, "select patient_name from public.appointments where id = $1", [id])).rows[0].patient_name).toBe("Moussa (fils)");
  });

  it("motif réservé aux nouveaux patients ; médecin qui n'accepte plus de nouveaux patients", async () => {
    await sys(db, "update public.appointments set scheduled_at = now() - interval '2 days', ends_at = now() - interval '2 days' + interval '30 minutes', status = 'completed' where id = $1", [first]);
    await expectError(book(patient, `${dayIn(4)}T08:00:00Z`, { type: typeNew }), /réservé aux nouveaux patients/);
    await q(db, docUser, "select public.update_doctor_practice_info($1::jsonb)", [JSON.stringify({ presentation: "Cardiologue.", fee_info: "Consultation : 15 000 FCFA", payment_methods: ["especes", "orange_money", "bitcoin"], accepts_new_patients: false })]);
    expect((await q(db, null, "select payment_methods from public.doctors where id = $1", [doctor])).rows[0].payment_methods).toEqual(["especes", "orange_money"]);
    const newcomer = await createUser(db, "nouveau");
    await expectError(book(newcomer, `${dayIn(4)}T09:00:00Z`), /n'accepte pas de nouveaux patients/);
    expect(await book(patient, `${dayIn(4)}T09:00:00Z`)).toBeTruthy();
    await q(db, docUser, "select public.update_doctor_practice_info($1::jsonb)", [JSON.stringify({ accepts_new_patients: true })]);
  });

  it("rendez-vous saisi par le cabinet et plage bloquée : retirent les créneaux", async () => {
    const day = dayIn(5);
    await expectError(q(db, stranger, "select public.practice_add_appointment($1, $2::timestamptz, 30, 'Tel', '76000000')", [site, `${day}T08:00:00Z`]), /réservée au médecin/);
    await q(db, clinicUser, "select public.practice_add_appointment($1, $2::timestamptz, 30, 'Patient au téléphone', '76000000')", [site, `${day}T08:00:00Z`]);
    await expectError(q(db, clinicUser, "select public.practice_add_appointment($1, $2::timestamptz, 30, 'Doublon', '76000000')", [site, `${day}T08:15:00Z`]), /déjà prévu/);
    const b = (await q(db, docUser, "select public.add_practice_block($1, $2::timestamptz, $3::timestamptz, 'Réunion') as id", [site, `${day}T09:00:00Z`, `${day}T10:00:00Z`])).rows[0].id;
    expect(await slots(day)).toEqual([`${day}T08:30:00.000Z`]);
    expect((await q(db, stranger, "select id from public.practice_blocks")).rowCount).toBe(0);
    await q(db, clinicUser, "select public.remove_practice_block($1)", [b]);
    expect((await slots(day)).length).toBe(3);
    const day1 = (await q(db, clinicUser, "select patient_name, source from public.practice_appointments($1, 'jour', $2::date)", [clinic, day])).rows;
    expect(day1).toEqual([{ patient_name: "Patient au téléphone", source: "practice" }]);
  });

  it("délai d'annulation en ligne, puis alerte de la liste d'attente quand un créneau se libère", async () => {
    // Délai d'annulation : 24 h ; un rendez-vous dans 3 h ne peut plus être annulé en ligne
    await q(db, docUser, "select public.update_site_booking($1, 'instant', 0, 24, '2e étage, porte B')", [site]);
    const soon = await sys(db, `insert into public.appointments (site_id, doctor_id, clinic_id, patient_id, patient_name, patient_phone, requested_date, status, scheduled_at, ends_at, source)
      values ($1, $2, $3, $4, 'Awa', '+22376112233', current_date, 'confirmed', now() + interval '3 hours', now() + interval '3 hours 30 minutes', 'online') returning id`, [site, doctor, clinic, patient2]);
    await expectError(q(db, patient2, "select public.cancel_appointment($1)", [soon.rows[0].id]), /moins de 24 h avant/);
    // Liste d'attente
    await expectError(q(db, stranger, "select public.join_waitlist($1, '2020-01-01')", [site]), /60 prochains jours/);
    await q(db, stranger, "select public.join_waitlist($1, $2::date)", [site, dayIn(30)]);
    const later = await book(patient2, `${dayIn(6)}T08:00:00Z`);
    await q(db, docUser, "select public.update_site_booking($1, 'instant', 0, 2, '2e étage, porte B')", [site]);
    await q(db, patient2, "select public.cancel_appointment($1)", [later]);
    const n = (await q(db, stranger, "select title, link from public.notifications where kind = 'appointment'")).rows;
    expect(n).toEqual([{ title: "Un créneau s'est libéré", link: `/medecins/${doctor}/rendez-vous?lieu=${site}` }]);
    const wl = (await q(db, stranger, "select id from public.appointment_waitlist")).rows[0].id;
    await q(db, stranger, "select public.leave_waitlist($1)", [wl]);
  });

  it("rappel la veille (une seule fois) et prochaine disponibilité", async () => {
    await sys(db, "update public.appointments set reminded_at = null");
    const n1 = (await sys(db, "select public.send_appointment_reminders() as n")).rows[0].n;
    expect(n1).toBeGreaterThanOrEqual(1);
    expect((await sys(db, "select public.send_appointment_reminders() as n")).rows[0].n).toBe(0);
    expect((await sys(db, "select count(*)::int as n from public.notification_outbox where channel = 'sms'")).rows[0].n).toBe(n1);
    const next = (await q(db, null, "select doctor_id, site_id, slot_start from public.next_availabilities($1::uuid[])", [[doctor, w.ph1User]])).rows;
    expect(next).toHaveLength(1);
    expect(next[0].site_id).toBe(site);
    expect(new Date(next[0].slot_start).getTime()).toBeGreaterThan(Date.now());
    // Lieu repassé en « demande à confirmer » : plus de créneaux publics
    await q(db, docUser, "select public.update_site_booking($1, 'request', 2, 2, null)", [site]);
    expect(await slots(dayIn(8))).toEqual([]);
    await expectError(book(patient, `${dayIn(8)}T08:00:00Z`), /n'est pas ouverte/);
  });
});
