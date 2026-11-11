/** 0.34 : délais par type de don, questionnaire, suivi après le don, registre des groupes rares, passeport. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildWorld, createTestDb, createUser, Db, expectError, q, sys, World, hasDb } from "./helpers";

describe.skipIf(!hasDb)("Version 0.34 — parcours du donneur", () => {
  let db: Db; let w: World; let donor: string; let cnts: string;
  beforeAll(async () => {
    db = await createTestDb(); w = await buildWorld(db);
    donor = await createUser(db, "don34"); cnts = await createUser(db, "cnts34");
    await sys(db, "insert into public.authority_members (user_id, scope, organisation) values ($1, 'cnts', 'CNTS')", [cnts]);
    await q(db, donor, "select public.donor_save_profile($1::jsonb)", [JSON.stringify({ blood_group: "B-", sex: "F", consent: "true" })]);
  }, 120_000);
  afterAll(async () => db?.close());

  it("date indicative selon le type de don (plasma : 2 semaines)", async () => {
    await q(db, donor, "select public.donor_declare_donation($1::jsonb)", [JSON.stringify({ donated_on: new Date(Date.now() - 3 * 86400_000).toISOString().slice(0, 10), center: "CNTS", donation_type: "plasma" })]);
    const s = (await q(db, donor, "select public.donor_summary() s")).rows[0].s;
    expect(s.last_type).toBe("plasma");
    expect((new Date(s.next_indicative).getTime() - new Date(s.last_declared).getTime()) / 86400_000).toBe(14);
  });

  it("questionnaire : validation réservée à l'administration, nominative", async () => {
    await expectError(q(db, cnts, "select public.admin_validate_blood_questionnaire('v1-test', 'Dr Test', 'CNTS')"), /administrat|réservé/);
    await expectError(q(db, w.admin, "select public.admin_validate_blood_questionnaire('v1-test', '', 'CNTS')"), /nom de la personne/);
    await q(db, w.admin, "select public.admin_validate_blood_questionnaire('v1-test', 'Dr Test', 'CNTS')");
    expect((await q(db, null, "select value from public.platform_settings where key = 'blood_questionnaire_validation'")).rows[0].value).toMatchObject({ version: "v1-test", organisme: "CNTS" });
    await q(db, w.admin, "select public.admin_revoke_blood_questionnaire()");
  });

  it("déclaration après le don : privée (donneur et CNTS), CNTS notifié, réponse au donneur", async () => {
    const ref = (await q(db, donor, "select public.donor_report_event($1::jsonb) r", [JSON.stringify({ kind: "vertiges", occurred_on: new Date().toISOString().slice(0, 10), description: "vertiges le soir" })])).rows[0].r;
    expect(ref).toMatch(/^EVD-/);
    expect((await q(db, w.customerA, "select count(*)::int n from public.blood_donation_events")).rows[0].n).toBe(0);
    await expectError(q(db, null, "select count(*) from public.blood_donation_events"), /permission denied/);
    expect((await sys(db, "select count(*)::int n from public.notifications where user_id = $1 and title like 'Nouvelle déclaration%'", [cnts])).rows[0].n).toBe(1);
    const id = (await q(db, cnts, "select id from public.blood_donation_events")).rows[0].id;
    await expectError(q(db, donor, "select public.blood_event_set_status($1, 'clos')", [id]), /réservé au CNTS/);
    await q(db, cnts, "select public.blood_event_set_status($1, 'pris_en_compte', 'Nous vous rappelons demain')", [id]);
    expect((await q(db, donor, "select status, handler_note from public.blood_donation_events")).rows[0]).toEqual({ status: "pris_en_compte", handler_note: "Nous vous rappelons demain" });
  });

  it("registre des groupes rares : accord, validation avec critère, recherche réservée et journalisée", async () => {
    await expectError(q(db, donor, "select public.rare_register('Fy(a-b-)', false)"), /accord/);
    await q(db, donor, "select public.rare_register('Fy(a-b-)', true)");
    expect((await q(db, cnts, "select count(*)::int n from public.rare_search('B-')")).rows[0].n).toBe(0); // non vérifié : exclu par défaut
    expect((await q(db, cnts, "select count(*)::int n from public.rare_search('B-', null, true)")).rows[0].n).toBe(1);
    await expectError(q(db, w.customerA, "select * from public.rare_search()"), /réservé au CNTS/);
    await expectError(q(db, cnts, "select public.rare_review($1, 'verifie', '', '')", [donor]), /critère/);
    await q(db, cnts, "select public.rare_review($1, 'verifie', 'CNTS Bamako', 'Phénotype Fy(a-b-) confirmé')", [donor]);
    const r = (await q(db, cnts, "select name, status, availability from public.rare_search('B-')")).rows[0];
    expect(r).toMatchObject({ status: "verifie", availability: "disponible" });
    expect((await sys(db, "select count(*)::int n from public.audit_logs where action = 'rare_registry.search'")).rows[0].n).toBeGreaterThanOrEqual(3);
    await q(db, donor, "select public.rare_set_availability(false)");
    expect((await q(db, cnts, "select availability from public.rare_search('B-')")).rows[0].availability).toBe("indisponible");
    await q(db, donor, "select public.rare_withdraw()");
    expect((await q(db, cnts, "select count(*)::int n from public.rare_search(null, null, true)")).rows[0].n).toBe(0);
  });

  it("passeport public : désactivé par défaut, sans donnée médicale, lien renouvelable", async () => {
    const tok = (await sys(db, "select passport_token from public.blood_donor_profiles where user_id = $1", [donor])).rows[0].passport_token;
    expect((await q(db, null, "select public.passport_public($1) p", [tok])).rows[0].p.status).toBe("invalide");
    await q(db, donor, "select public.donor_set_passport_public(true)");
    const p = (await q(db, null, "select public.passport_public($1) p", [tok])).rows[0].p;
    expect(p.status).toBe("ok"); expect(JSON.stringify(p)).not.toMatch(/B-|CNTS|blood_group/);
    await q(db, donor, "select public.donor_set_passport_public(true, true)");
    expect((await q(db, null, "select public.passport_public($1) p", [tok])).rows[0].p.status).toBe("invalide");
  });

  it("rappel de suivi après le don : rien tant que l'administration ne l'a pas activé", async () => {
    await sys(db, "update public.blood_donations set donated_on = current_date - 2 where donor_id = $1", [donor]);
    await sys(db, "update public.blood_donor_profiles set reminders = false where user_id = $1", [donor]);
    expect((await sys(db, "select public.blood_donor_reminders() n")).rows[0].n).toBe(0);
    await sys(db, "update public.platform_settings set value = 'true' where key = 'blood_followup_enabled'");
    expect((await sys(db, "select public.blood_donor_reminders() n")).rows[0].n).toBe(1);
    expect((await sys(db, "select public.blood_donor_reminders() n")).rows[0].n).toBe(0);
  });
});
