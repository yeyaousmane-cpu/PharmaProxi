/** Mon dossier santé : strictement privé, verrou par code, proches, rappels discrets, effacement avec le compte. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildWorld, createTestDb, Db, expectError, hasDb, q, sys, World } from "./helpers";

describe.skipIf(!hasDb)("Mon dossier santé", () => {
  let db: Db;
  let w: World;
  beforeAll(async () => { db = await createTestDb(); w = await buildWorld(db); }, 120_000);
  afterAll(async () => db?.close());
  const notifs = async (uid: string) => (await sys(db, "select title, body, link from public.notifications where user_id = $1 and kind = 'dossier' order by created_at", [uid])).rows;

  it("dossier personnel créé une seule fois, invisible pour les autres comptes et pour l'administrateur", async () => {
    const a1 = (await q(db, w.customerA, "select public.record_ensure_self() id")).rows[0].id;
    const a2 = (await q(db, w.customerA, "select public.record_ensure_self() id")).rows[0].id;
    expect(a1).toBe(a2);
    await q(db, w.customerA, "insert into public.record_essentials (person_id, blood_group, emergency_phone) values ($1, 'O+', '+223 70 00 00 00')", [a1]);
    await q(db, w.customerA, "insert into public.record_items (person_id, kind, title, severity) values ($1, 'allergie', 'Pénicilline', 'grave')", [a1]);
    for (const other of [w.customerB, w.admin]) {
      expect((await q(db, other, "select count(*)::int n from public.record_items")).rows[0].n).toBe(0);
      expect((await q(db, other, "select count(*)::int n from public.record_essentials")).rows[0].n).toBe(0);
      expect((await q(db, other, "select count(*)::int n from public.record_persons")).rows[0].n).toBe(0);
      await expectError(q(db, other, "insert into public.record_items (person_id, kind, title) values ($1, 'allergie', 'x')", [a1]), /row-level security/);
    }
    expect((await q(db, w.customerB, "update public.record_items set title = 'x' returning id")).rows).toHaveLength(0);
    await expectError(q(db, w.customerA, "insert into public.record_items (person_id, kind, title) values ($1, 'inconnu', 'x')", [a1]), /check constraint/);
    await expectError(q(db, w.customerA, "insert into public.record_essentials (person_id, blood_group) values ($1, 'Z')", [a1]), /check constraint|duplicate/);
  });

  it("proches : 10 au maximum, rattachés au seul titulaire", async () => {
    const kid = (await q(db, w.customerA, "insert into public.record_persons (display_name, relation, birth_year) values ('Maman', 'mere', 1955) returning id")).rows[0].id;
    await q(db, w.customerA, "insert into public.record_items (person_id, kind, title, year) values ($1, 'maladie', 'Hypertension', 2010)", [kid]);
    expect((await q(db, w.customerA, "select count(*)::int n from public.record_persons")).rows[0].n).toBe(2);
    await expectError(q(db, w.customerB, "insert into public.record_persons (owner_id, display_name) values ($1, 'Pirate')", [w.customerA]), /row-level security/);
    for (let i = 0; i < 9; i++) await q(db, w.customerA, "insert into public.record_persons (display_name) values ($1)", [`Proche ${i}`]);
    await expectError(q(db, w.customerA, "insert into public.record_persons (display_name) values ('Un de trop')"), /10 proches/);
  });

  it("code : dossier illisible tant qu'il est verrouillé, blocage après 5 erreurs", async () => {
    await q(db, w.customerA, "select public.record_set_pin('4821')");
    expect((await q(db, w.customerA, "select count(*)::int n from public.record_items")).rows[0].n).toBe(2);   // ouvert 30 min
    await q(db, w.customerA, "select public.record_lock()");
    expect((await q(db, w.customerA, "select count(*)::int n from public.record_items")).rows[0].n).toBe(0);
    expect((await q(db, w.customerA, "select public.record_status() s")).rows[0].s).toMatchObject({ has_pin: true, locked: true });
    await expectError(q(db, w.customerA, "select public.record_ensure_self()"), /verrouillé/);
    await expectError(q(db, w.customerA, "select public.record_set_pin('')"), /verrouillé/);
    const hash = (await sys(db, "select pin_hash from public.record_settings where user_id = $1", [w.customerA])).rows[0].pin_hash;
    expect(hash).not.toContain("4821");
    await expectError(q(db, w.customerA, "select pin_hash from public.record_settings"), /permission denied/);
    for (let i = 0; i < 5; i++) expect((await q(db, w.customerA, "select public.record_unlock('0000') ok")).rows[0].ok).toBe(false);
    await expectError(q(db, w.customerA, "select public.record_unlock('4821')"), /trop d'essais/);
    await sys(db, "update public.record_settings set pin_blocked_until = now() - interval '1 second' where user_id = $1", [w.customerA]);
    expect((await q(db, w.customerA, "select public.record_unlock('4821') ok")).rows[0].ok).toBe(true);
    expect((await q(db, w.customerA, "select count(*)::int n from public.record_items")).rows[0].n).toBe(2);
    await expectError(q(db, w.customerA, "select public.record_set_pin('12')"), /4 à 6 chiffres/);
    await q(db, w.customerA, "select public.record_set_pin('')");
    expect((await q(db, w.customerA, "select public.record_status() s")).rows[0].s).toMatchObject({ has_pin: false, locked: false });
  });

  it("rappels : rendez-vous la veille, vaccin à 7 jours, don de sang ; messages sans détail médical, une seule fois", async () => {
    const me = (await q(db, w.customerA, "select public.record_ensure_self() id")).rows[0].id;
    const maman = (await q(db, w.customerA, "select id from public.record_persons where display_name = 'Maman'")).rows[0].id;
    await q(db, w.customerA, "insert into public.record_items (person_id, kind, title, event_date, event_time) values ($1, 'rendez_vous', 'Cardiologue Point G', current_date + 1, '09:30')", [maman]);
    await q(db, w.customerA, "insert into public.record_items (person_id, kind, title, event_date, next_date) values ($1, 'vaccin', 'Hépatite B', current_date - 23, current_date + 7)", [me]);
    await q(db, w.customerA, "update public.record_persons set sex = 'M' where id = $1", [me]);
    await q(db, w.customerA, "update public.record_essentials set last_donation = (current_date - interval '3 months')::date where person_id = $1", [me]);
    await expectError(q(db, w.customerA, "update public.record_essentials set donation_notified_for = current_date where person_id = $1", [me]), /permission denied/);
    await sys(db, "select public.record_reminders()");
    await sys(db, "select public.record_reminders()");
    const n = await notifs(w.customerA);
    expect(n.map((x) => x.title).sort()).toEqual(["Rappel de vaccin dans 7 jours", "Rendez-vous médical demain (Maman)", "Vous pouvez de nouveau donner votre sang"]);
    const rdv = n.find((x) => x.title.startsWith("Rendez-vous"))!;
    expect(rdv.body).toContain("9 h 30");
    expect(JSON.stringify(n)).not.toMatch(/Cardiologue|Hépatite|Point G/);
    expect(rdv.link).toBe(`/ma-sante/dossier/consultations?p=${maman}`);
    expect(Object.keys((await sys(db, "select public.run_maintenance() r")).rows[0].r)).toContain("health_record");
  });

  it("un traitement lié doit appartenir au même compte", async () => {
    const me = (await q(db, w.customerA, "select public.record_ensure_self() id")).rows[0].id;
    const tb = (await q(db, w.customerB, "insert into public.treatments (name, times) values ('Paracétamol', '{08:00}') returning id")).rows[0].id;
    await expectError(q(db, w.customerA, "insert into public.record_items (person_id, kind, title, treatment_id) values ($1, 'ordonnance', 'X', $2)", [me, tb]), /traitement inconnu/);
    const ta = (await q(db, w.customerA, "insert into public.treatments (name, times) values ('Amoxicilline 500 mg', '{08:00,20:00}') returning id")).rows[0].id;
    await q(db, w.customerA, "insert into public.record_items (person_id, kind, title, treatment_id) values ($1, 'ordonnance', 'Amoxicilline 500 mg', $2)", [me, ta]);
  });

  it("suppression du compte : tout le dossier est effacé", async () => {
    await sys(db, "update public.profiles set deleted_at = now() where id = $1", [w.customerA]);
    for (const t of ["record_persons where owner_id = $1", "record_settings where user_id = $1"])
      expect((await sys(db, `select count(*)::int n from public.${t}`, [w.customerA])).rows[0].n).toBe(0);
    expect((await sys(db, "select count(*)::int n from public.record_items")).rows[0].n).toBe(0);
    expect((await sys(db, "select count(*)::int n from public.record_essentials")).rows[0].n).toBe(0);
  });
});
