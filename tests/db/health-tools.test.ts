/** Outils santé : carnet vaccinal, traitements, mesures, don de sang, alertes officielles, purge à la suppression du compte. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildWorld, createTestDb, Db, expectError, hasDb, q, sys, World } from "./helpers";

describe.skipIf(!hasDb)("Outils santé personnels", () => {
  let db: Db;
  let w: World;
  beforeAll(async () => { db = await createTestDb(); w = await buildWorld(db); }, 120_000);
  afterAll(async () => db?.close());
  const notifs = async (uid: string, kind: string) => (await sys(db, "select title, body, link from public.notifications where user_id = $1 and kind = $2 order by created_at", [uid, kind])).rows;

  it("carnet vaccinal : privé, rappel J-3 une seule fois, doses faites non rappelées", async () => {
    const id = (await q(db, w.customerA, "insert into public.children (first_name, birth_date, sex) values ('Awa', (now() at time zone 'utc')::date - 39, 'F') returning id")).rows[0].id;
    expect((await q(db, w.customerB, "select count(*)::int n from public.children")).rows[0].n).toBe(0);
    await expectError(q(db, w.customerB, "insert into public.child_vaccinations (child_id, dose_code, done_on) values ($1, 'BCG', current_date)", [id]), /row-level security/);
    await q(db, w.customerA, "insert into public.child_vaccinations (child_id, dose_code, done_on) values ($1, 'BCG', current_date - 39), ($1, 'VPO0', current_date - 39)", [id]);
    await sys(db, "select public.health_tools_reminders()");
    await sys(db, "select public.health_tools_reminders()");
    const n = await notifs(w.customerA, "vaccin");
    expect(n).toHaveLength(1);
    expect(n[0]).toMatchObject({ title: "Vaccins de Awa dans 3 jours", link: `/ma-sante/enfants/${id}` });
    expect(n[0].body).toContain("6 semaines");
    // Toutes les doses des 6 semaines faites : plus de rappel le jour J
    await q(db, w.customerA, "insert into public.child_vaccinations (child_id, dose_code, done_on) select $1, code, current_date from public.vaccine_schedule where visit_key = 's6'", [id]);
    await sys(db, "update public.children set birth_date = birth_date - 3 where id = $1", [id]);
    await sys(db, "select public.health_tools_reminders()");
    expect(await notifs(w.customerA, "vaccin")).toHaveLength(1);
  });

  it("traitements : rappel de prise à l'heure, renouvellement à 5 jours de stock", async () => {
    await expectError(q(db, w.customerA, "insert into public.treatments (name, times) values ('Test', '{25:00}')"), /check constraint|violates/);
    const t = (await q(db, w.customerA, `insert into public.treatments (name, dose_note, times, units_in_stock, units_per_intake)
      values ('Amlodipine 5 mg', '1 comprimé', array[to_char(now() at time zone 'utc', 'HH24:MI')], 4, 1) returning id`)).rows[0].id;
    expect((await q(db, w.customerB, "select count(*)::int n from public.treatments")).rows[0].n).toBe(0);
    await sys(db, "select public.health_tools_reminders()");
    await sys(db, "select public.health_tools_reminders()");
    const n = await notifs(w.customerA, "traitement");
    expect(n.map((x) => x.title).sort()).toEqual(["C'est l'heure de votre traitement", "Votre traitement se termine bientôt"]);
    expect(n.find((x) => x.title.includes("termine"))!.link).toBe("/recherche?q=Amlodipine+5+mg");
    expect(n.find((x) => x.title.includes("heure"))!.body).not.toContain("Amlodipine");   // discrétion
    await q(db, w.customerA, "update public.treatment_intakes set taken_at = now() where treatment_id = $1", [t]);
    expect((await q(db, w.customerA, "select count(*)::int n from public.treatment_intakes where taken_at is not null")).rows[0].n).toBe(1);
  });

  it("mesures : cohérence vérifiée, données privées", async () => {
    await q(db, w.customerA, "insert into public.health_measures (kind, systolic, diastolic, pulse) values ('tension', 135, 85, 72)");
    await q(db, w.customerA, "insert into public.health_measures (kind, glucose_gl, context) values ('glycemie', 1.05, 'a_jeun')");
    await expectError(q(db, w.customerA, "insert into public.health_measures (kind, systolic, diastolic) values ('tension', 80, 120)"), /check constraint/);
    await expectError(q(db, w.customerA, "insert into public.health_measures (kind, glucose_gl) values ('glycemie', 12)"), /check constraint/);
    expect((await q(db, w.customerB, "select count(*)::int n from public.health_measures")).rows[0].n).toBe(0);
    expect((await q(db, null, "select count(*)::int n from public.health_measures").catch(() => ({ rows: [{ n: -1 }] }))).rows[0].n).toBe(-1);
  });

  it("don de sang : besoin publié par l'administration, abonnés du bon groupe prévenus", async () => {
    await q(db, w.customerA, "insert into public.user_alert_prefs (blood_alerts, blood_group) values (true, 'O-')");
    await q(db, w.customerB, "insert into public.user_alert_prefs (blood_alerts, blood_group) values (true, 'A+')");
    const p = { facility: "Hôpital Test", blood_groups: ["O-", "O+"], source: "Service de maternité de l'hôpital", contact_phone: "20 21 39 58" };
    await expectError(q(db, w.customerA, "select public.admin_save_blood_need($1::jsonb)", [JSON.stringify(p)]), /administrat|PP403|réservé/i);
    await expectError(q(db, w.admin, "select public.admin_save_blood_need($1::jsonb)", [JSON.stringify({ ...p, source: "" })]), /source/);
    await q(db, w.admin, "select public.admin_save_blood_need($1::jsonb)", [JSON.stringify(p)]);
    expect(await notifs(w.customerA, "sang")).toHaveLength(1);
    expect(await notifs(w.customerB, "sang")).toHaveLength(0);
    expect((await q(db, null, "select contact_phone from public.blood_needs")).rows[0].contact_phone).toBe("+22320213958");
  });

  it("alertes sanitaires : source officielle obligatoire, abonnés prévenus", async () => {
    await q(db, w.customerB, "update public.user_alert_prefs set health_alerts = true");
    const a = { kind: "rappel_lot", title: "Rappel d'un lot de test", body: "Texte de l'alerte officielle.", source_name: "Autorité de test" };
    await expectError(q(db, w.admin, "select public.admin_save_health_alert($1::jsonb, true)", [JSON.stringify(a)]), /source/);
    await q(db, w.admin, "select public.admin_save_health_alert($1::jsonb, true)", [JSON.stringify({ ...a, source_url: "https://exemple.org/communique" })]);
    expect(await notifs(w.customerB, "alerte")).toHaveLength(1);
    expect(await notifs(w.customerA, "alerte")).toHaveLength(0);
    expect((await q(db, null, "select count(*)::int n from public.health_alerts")).rows[0].n).toBe(1);
  });

  it("suppression du compte : toutes les données de santé sont effacées", async () => {
    await q(db, w.customerA, "select public.request_account_deletion()");
    for (const t of ["children", "treatments", "health_measures", "user_alert_prefs"]) {
      expect((await sys(db, `select count(*)::int n from public.${t} where user_id = $1`, [w.customerA])).rows[0].n, t).toBe(0);
    }
  });
});
