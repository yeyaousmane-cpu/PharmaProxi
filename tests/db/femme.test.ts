/** PharmaProxi Femme : confidentialité, verrou, limites adolescentes, rappels neutres, export, suppression. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildWorld, createTestDb, createUser, Db, expectError, hasDb, q, sys, World } from "./helpers";

describe.skipIf(!hasDb)("PharmaProxi Femme", () => {
  let db: Db;
  let w: World;
  let awa: string;
  let teen: string;
  beforeAll(async () => {
    db = await createTestDb();
    w = await buildWorld(db);
    awa = await createUser(db, "awa");
    teen = await createUser(db, "fanta");
  }, 120_000);
  afterAll(async () => db?.close());

  const activate = (uid: string | null, p: object) => q(db, uid, "select public.femme_activate($1::jsonb)", [JSON.stringify(p)]);

  it("activation : compte, déclaration, consentement, limites avant 18 ans", async () => {
    const base = { declared_woman: true, consent: true, age_band: "25-34", journey: "cycle", cycle_length: 30, period_length: 5, last_period: "2026-10-01" };
    await expectError(activate(null, base), /permission denied|connectez-vous/);
    await expectError(activate(awa, { ...base, declared_woman: false }), /réservé aux femmes/);
    await expectError(activate(awa, { ...base, consent: false }), /accord est nécessaire/);
    await activate(awa, base);
    await expectError(activate(awa, base), /déjà activé/);
    await expectError(activate(teen, { ...base, age_band: "13-17", journey: "conception" }), /avant 18 ans/);
    await activate(teen, { ...base, age_band: "13-17", journey: "cycle" });
    const st = (await q(db, awa, "select public.femme_status() as s")).rows[0].s;
    expect(st).toMatchObject({ enabled: true, has_pin: false, locked: false });
    expect((await q(db, null, "select public.femme_status() as s")).rows[0].s).toEqual({ signed_in: false });
  });

  it("chacune ne voit que ses données ; l'administration ne voit rien ; le code secret n'est jamais lisible", async () => {
    await q(db, awa, "select public.femme_save_day($1::jsonb)", [JSON.stringify({ day: "2026-10-02", flow: "moyen", symptoms: ["crampes", "fatigue"], pain: 6, intercourse: "protege", note: "x" })]);
    expect((await q(db, awa, "select count(*)::int as n from public.femme_days")).rows[0].n).toBe(1);
    expect((await q(db, teen, "select count(*)::int as n from public.femme_days")).rows[0].n).toBe(0);
    for (const uid of [w.admin, w.customerA]) {
      expect((await q(db, uid, "select count(*)::int as n from public.femme_periods")).rows[0].n).toBe(0);
      expect((await q(db, uid, "select count(*)::int as n from public.femme_profiles")).rows[0].n).toBe(0);
    }
    await expectError(q(db, null, "select count(*) from public.femme_days"), /permission denied/);
    await expectError(q(db, awa, "select pin_hash from public.femme_profiles"), /permission denied/);
    await expectError(q(db, awa, "insert into public.femme_periods (user_id, start_date) values ($1, '2026-01-01')", [awa]), /permission denied/);
    // Adolescente : rapports non enregistrés
    await q(db, teen, "select public.femme_save_day($1::jsonb)", [JSON.stringify({ day: "2026-10-02", intercourse: "protege", mood: "bien" })]);
    expect((await q(db, teen, "select intercourse, mood from public.femme_days")).rows[0]).toEqual({ intercourse: null, mood: "bien" });
    await expectError(q(db, teen, "select public.femme_set_partner(true, array['cycle'])"), /avant 18 ans/);
  });

  it("règles : chevauchement refusé, dates futures refusées, prévision", async () => {
    await expectError(q(db, awa, "select public.femme_save_period(null, '2026-10-03', null)"), /chevauchent/);
    await expectError(q(db, awa, "select public.femme_save_period(null, current_date + 5, null)"), /futur/);
    await q(db, awa, "select public.femme_save_period(null, '2026-08-31', '2026-09-04')");
    await expectError(q(db, awa, "select public.femme_save_period(null, '2026-07-01', '2026-07-30')"), /fin doit suivre/);
    expect((await sys(db, "select public.femme_next_period($1)::text as d", [awa])).rows[0].d).toBe("2026-11-01");
  });

  it("verrou : la base refuse lecture et écriture tant que le code n'est pas saisi ; blocage après 5 erreurs", async () => {
    await expectError(q(db, awa, "select public.femme_set_pin('12a4')"), /4 à 6 chiffres/);
    await q(db, awa, "select public.femme_set_pin('2468')");
    await q(db, awa, "select public.femme_lock()");
    expect((await q(db, awa, "select public.femme_status() as s")).rows[0].s).toMatchObject({ locked: true, has_pin: true });
    expect((await q(db, awa, "select count(*)::int as n from public.femme_days")).rows[0].n).toBe(0);
    await expectError(q(db, awa, "select public.femme_save_day('{\"day\":\"2026-10-05\",\"mood\":\"bien\"}'::jsonb)"), /verrouillé/);
    await expectError(q(db, awa, "select public.femme_export()"), /verrouillé/);
    expect((await q(db, awa, "select public.femme_unlock('0000') as ok")).rows[0].ok).toBe(false);
    expect((await q(db, awa, "select public.femme_unlock('2468') as ok")).rows[0].ok).toBe(true);
    expect((await q(db, awa, "select count(*)::int as n from public.femme_days")).rows[0].n).toBe(1);
    await q(db, awa, "select public.femme_lock()");
    for (let i = 0; i < 5; i++) await q(db, awa, "select public.femme_unlock('1111')");
    await expectError(q(db, awa, "select public.femme_unlock('2468')"), /trop d'essais/);
    await sys(db, "update public.femme_profiles set pin_blocked_until = null where user_id = $1", [awa]);
    expect((await q(db, awa, "select public.femme_unlock('2468') as ok")).rows[0].ok).toBe(true);
    const actions = (await q(db, awa, "select action from public.femme_access_log order by id")).rows.map((r) => r.action);
    expect(actions).toEqual(expect.arrayContaining(["activation", "code_defini", "code_errone", "deverrouillage"]));
  });

  it("rappels : notification au texte neutre, répétition ; partage partenaire sans données personnelles", async () => {
    await q(db, awa, "select public.femme_save_reminder($1::jsonb)", [JSON.stringify({ kind: "consultation_prenatale", label: "Consultation prénatale CSCom", due_at: new Date(Date.now() - 60_000).toISOString(), repeat: "hebdomadaire" })]);
    await expectError(q(db, awa, "select public.femme_save_reminder('{\"kind\":\"autre\",\"label\":\"x\",\"due_at\":\"2026-11-01\"}'::jsonb)"), /intitulé/);
    expect((await sys(db, "select public.femme_send_reminders() as n")).rows[0].n).toBeGreaterThanOrEqual(1);
    const n = (await sys(db, "select title, body from public.notifications where user_id = $1 and kind = 'femme'", [awa])).rows;
    expect(n[0]).toEqual({ title: "Vous avez un rappel", body: "Ouvrez votre espace personnel pour le consulter." });
    expect(JSON.stringify(n)).not.toMatch(/prénatale|règles|grossesse/i);
    expect((await q(db, awa, "select due_at > now() + interval '6 days' as later, done from public.femme_reminders")).rows[0]).toEqual({ later: true, done: false });
    await sys(db, "select public.femme_send_reminders()");
    expect((await sys(db, "select count(*)::int as n from public.notifications where user_id = $1 and kind = 'femme'", [awa])).rows[0].n).toBe(1);
    const tok = (await q(db, awa, "select public.femme_set_partner(true, array['grossesse', 'general']) as t")).rows[0].t;
    expect(tok).toMatch(/^[0-9a-f]{36}$/);
    expect((await q(db, null, "select public.femme_partner_view($1) as t", [tok])).rows[0].t.sort()).toEqual(["general", "grossesse"]);
    expect((await q(db, null, "select public.femme_partner_view('abc') as t")).rows[0].t).toBeNull();
    await q(db, awa, "select public.femme_set_partner(false, null)");
    expect((await q(db, null, "select public.femme_partner_view($1) as t", [tok])).rows[0].t).toBeNull();
  });

  it("export complet sans secret, puis suppression totale", async () => {
    const ex = (await q(db, awa, "select public.femme_export() as e")).rows[0].e;
    expect(ex.regles.length).toBe(2);
    expect(ex.journal.length).toBe(1);
    expect(ex.profil.pin_hash).toBeUndefined();
    expect(ex.profil.partner_token).toBeUndefined();
    await q(db, awa, "select public.femme_delete_all()");
    for (const t of ["femme_profiles", "femme_periods", "femme_days", "femme_reminders", "femme_access_log"])
      expect((await sys(db, `select count(*)::int as n from public.${t} where user_id = $1`, [awa])).rows[0].n).toBe(0);
    expect((await sys(db, "select count(*)::int as n from public.notifications where user_id = $1 and kind = 'femme'", [awa])).rows[0].n).toBe(0);
    expect((await q(db, awa, "select public.femme_status() as s")).rows[0].s).toMatchObject({ enabled: false });
  });
});
