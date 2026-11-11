/** 0.28 / 0.29 : passeport santé partagé, historique des accès, suivi par un médecin choisi, rappels de mesure. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildWorld, createTestDb, createUser, Db, expectError, q, sys, World, hasDb } from "./helpers";

describe.skipIf(!hasDb)("Versions 0.28 et 0.29", () => {
  let db: Db; let w: World; let self: string; let doctorUser: string; let doctorId: string;
  beforeAll(async () => {
    db = await createTestDb(); w = await buildWorld(db);
    await q(db, w.customerA, "select public.record_set_pin('4821')");
    self = (await q(db, w.customerA, "select public.record_ensure_self() id")).rows[0].id;
    await q(db, w.customerA, "insert into public.record_essentials (person_id, blood_group, emergency_name, emergency_phone) values ($1, 'O+', 'Awa', '+223 70 00 00 00')", [self]);
    await q(db, w.customerA, "insert into public.record_items (person_id, kind, title, severity) values ($1, 'allergie', 'Pénicilline', 'grave'), ($1, 'maladie', 'Diabète', null)", [self]);
    await q(db, w.customerA, "insert into public.health_measures (kind, systolic, diastolic) values ('tension', 150, 95)");
    doctorUser = await createUser(db, "medsuivi");
    doctorId = (await sys(db, "insert into public.doctors (user_id, display_name, title, status, is_published, publication_consent_at) values ($1, 'Kanté (fictif)', 'Dr', 'verified', true, now()) returning id", [doctorUser])).rows[0].id;
  }, 120_000);
  afterAll(async () => db?.close());

  it("passeport : seulement les rubriques choisies, chaque consultation enregistrée, retrait immédiat", async () => {
    const s = (await q(db, w.customerA, "select public.create_health_share($1, array['groupe_sanguin','allergies'], 24, 'Urgences') r", [self])).rows[0].r;
    expect(s.token).toMatch(/^[0-9a-f]{64}$/);
    expect((await sys(db, "select token_hash from public.health_shares where id = $1", [s.id])).rows[0].token_hash).not.toBe(s.token);
    const view = (await q(db, null, "select public.open_health_share($1, 'Dr Urgences') r", [s.token])).rows[0].r;
    expect(view).toMatchObject({ status: "ok", groupe_sanguin: "O+" });
    expect(view.allergies[0].titre).toBe("Pénicilline");
    expect(view.maladies).toBeUndefined(); expect(view.contact_urgence).toBeUndefined();
    expect((await q(db, w.customerA, "select count(*)::int n from public.record_access_log where action = 'partage_consulte' and actor_label like '%Dr Urgences%'")).rows[0].n).toBe(1);
    expect((await sys(db, "select count(*)::int n from public.notifications where user_id = $1 and title = 'Votre passeport santé a été consulté'", [w.customerA])).rows[0].n).toBe(1);
    await expectError(q(db, w.customerB, "select public.revoke_health_share($1)", [s.id]), /introuvable/);
    await q(db, w.customerA, "select public.revoke_health_share($1)", [s.id]);
    expect((await q(db, null, "select public.open_health_share($1) r", [s.token])).rows[0].r.status).toBe("retire");
    expect((await q(db, null, "select public.open_health_share($1) r", ["0".repeat(64)])).rows[0].r.status).toBe("invalide");
  });

  it("passeport : durée maximale 30 jours, dossier verrouillé = pas de partage, partage expiré illisible, aucun accès direct aux tables", async () => {
    await expectError(q(db, w.customerA, "select public.create_health_share($1, array['identite'], 721)", [self]), /30 jours/);
    await expectError(q(db, w.customerB, "select public.create_health_share($1, array['identite'], 2)", [self]), /verrouill|autre compte/);
    const s = (await q(db, w.customerA, "select public.create_health_share($1, array['identite'], 1) r", [self])).rows[0].r;
    await sys(db, "update public.health_shares set created_at = now() - interval '2 hours', expires_at = now() - interval '1 hour' where id = $1", [s.id]);
    expect((await q(db, null, "select public.open_health_share($1) r", [s.token])).rows[0].r.status).toBe("expire");
    await expectError(q(db, null, "select * from public.health_shares"), /permission denied/);
    expect((await q(db, w.customerB, "select count(*)::int n from public.health_shares")).rows[0].n).toBe(0);
    expect((await q(db, w.customerB, "select count(*)::int n from public.record_access_log")).rows[0].n).toBe(0);
    await q(db, w.customerA, "select public.record_lock()");
    await expectError(q(db, w.customerA, "select public.create_health_share($1, array['identite'], 2)", [self]), /déverrouillez/);
  });

  it("suivi : demande du patient, acceptation par le médecin, accès journalisé aux seules mesures, arrêt par le patient", async () => {
    await expectError(q(db, w.customerA, "select public.care_request($1, 'Hypertension', false)", [doctorId]), /pas encore ouvert/);
    await expectError(q(db, w.customerA, "select public.admin_set_care_follow(true)"), /administrat/);
    await q(db, w.admin, "select public.admin_set_care_follow(true)");
    const id = (await q(db, w.customerA, "select public.care_request($1, 'Hypertension', false) id", [doctorId])).rows[0].id;
    await expectError(q(db, doctorUser, "select public.care_patient_data($1)", [id]), /inactif/);
    await expectError(q(db, w.customerB, "select public.care_set_status($1, 'actif')", [id]), /refusé/);
    await expectError(q(db, w.customerA, "select public.care_set_status($1, 'actif')", [id]), /médecin/);
    await q(db, doctorUser, "select public.care_set_status($1, 'actif')", [id]);
    const data = (await q(db, doctorUser, "select public.care_patient_data($1) d", [id])).rows[0].d;
    expect(data.mesures[0]).toMatchObject({ kind: "tension", systolic: 150 });
    expect(data.traitements).toEqual([]);
    await q(db, doctorUser, "select public.care_add_note($1, 'Continuez à noter vos mesures deux fois par semaine.')", [id]);
    expect((await q(db, w.customerA, "select count(*)::int n from public.care_notes")).rows[0].n).toBe(1);
    expect((await q(db, w.customerB, "select count(*)::int n from public.care_notes")).rows[0].n).toBe(0);
    expect((await q(db, w.customerA, "select string_agg(action, ',' order by id) a from public.record_access_log where actor_kind = 'medecin_suivi'")).rows[0].a).toBe("suivi_accepte,mesures_consultees,note_ajoutee");
    await expectError(q(db, w.customerB, "select public.care_patient_data($1)", [id]), /réservé/);
    await q(db, w.customerA, "select public.care_set_status($1, 'termine')", [id]);
    await expectError(q(db, doctorUser, "select public.care_patient_data($1)", [id]), /inactif/);
  });

  it("rappels de mesure : envoyés une fois par jour, seulement les jours choisis", async () => {
    const dow = (await sys(db, "select extract(isodow from now() at time zone 'UTC')::int d")).rows[0].d;
    await q(db, w.customerA, "insert into public.measure_reminders (kind, weekdays, at_time) values ('tension', array[$1::int], '00:00')", [dow]);
    await q(db, w.customerB, "insert into public.measure_reminders (kind, weekdays, at_time) values ('glycemie', array[$1::int], '00:00')", [dow === 7 ? 1 : dow + 1]);
    expect((await sys(db, "select public.chronic_reminders() n")).rows[0].n).toBe(1);
    expect((await sys(db, "select public.chronic_reminders() n")).rows[0].n).toBe(0);
    await expectError(q(db, w.customerB, "insert into public.measure_reminders (user_id, kind, weekdays, at_time) values ($1, 'tension', array[1], '08:00')", [w.customerA]), /row-level security/);
    expect((await sys(db, "select public.run_maintenance() r")).rows[0].r).toHaveProperty("chronic");
  });
});
