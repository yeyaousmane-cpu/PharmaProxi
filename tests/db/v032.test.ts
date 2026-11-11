/** 0.32 : espace donneur — profil, dons déclarés/validés, distinctions, carte (QR opaque), certificat, confidentialité. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildWorld, createTestDb, createUser, Db, expectError, q, sys, World, hasDb } from "./helpers";

describe.skipIf(!hasDb)("Version 0.32 — espace donneur", () => {
  let db: Db; let w: World; let donor: string; let cnts: string; let token: string;
  const day = (n: number) => new Date(Date.now() - n * 86400_000).toISOString().slice(0, 10);
  beforeAll(async () => {
    db = await createTestDb(); w = await buildWorld(db);
    donor = await createUser(db, "don32"); cnts = await createUser(db, "cnts32");
    await sys(db, "insert into public.authority_members (user_id, scope, organisation) values ($1, 'cnts', 'CNTS Test')", [cnts]);
  }, 120_000);
  afterAll(async () => db?.close());
  const declare = (d: string, extra = {}) => q(db, donor, "select public.donor_declare_donation($1::jsonb) r", [JSON.stringify({ donated_on: d, center: "CNTS Quinzambougou", donation_type: "sang_total", ...extra })]);

  it("création : accord obligatoire, profil privé (ni anonyme, ni autre compte)", async () => {
    await expectError(q(db, donor, "select public.donor_save_profile($1::jsonb)", [JSON.stringify({ blood_group: "O+" })]), /accord/);
    const code = (await q(db, donor, "select public.donor_save_profile($1::jsonb) c", [JSON.stringify({ blood_group: "O+", sex: "M", consent: "true" })])).rows[0].c;
    expect(code).toMatch(/^DSP-[0-9A-F]{8}$/);
    await expectError(q(db, null, "select blood_group from public.blood_donor_profiles"), /permission denied/);
    expect((await q(db, w.customerA, "select count(*)::int n from public.blood_donor_profiles")).rows[0].n).toBe(0);
    expect((await q(db, cnts, "select count(*)::int n from public.blood_donor_profiles")).rows[0].n).toBe(1);
    await expectError(q(db, donor, "update public.blood_donor_profiles set blood_group_verified = true"), /permission denied/);
  });

  it("dons déclarés : jamais comptés avant validation ; le donneur ne peut pas les valider", async () => {
    expect((await declare(day(200))).rows[0].r).toMatch(/^DON-\d{8}-[0-9A-F]{5}$/);
    await expectError(declare(day(200)), /déjà enregistré/);
    await expectError(declare(day(-3)), /date du don invalide/);
    const s = (await q(db, donor, "select public.donor_summary() s")).rows[0].s;
    expect(s.validated_count).toBe(0); expect(s.pending_count).toBe(1); expect(s.badge.current).toBeNull();
    const id = (await sys(db, "select id from public.blood_donations where donor_id = $1", [donor])).rows[0].id;
    await expectError(q(db, donor, "select public.blood_decide_donation($1, 'valide')", [id]), /réservé au CNTS/);
    await expectError(q(db, donor, "update public.blood_donations set status = 'valide'"), /permission denied/);
    await expectError(q(db, w.customerA, "select * from public.blood_pending_donations()"), /réservé au CNTS/);
  });

  it("validation par le CNTS : motif de refus, groupe confirmé, distinction et notification", async () => {
    const [pending] = (await q(db, cnts, "select * from public.blood_pending_donations()")).rows;
    expect(pending.donor_code).toMatch(/^DSP-/);
    await expectError(q(db, cnts, "select public.blood_decide_donation($1, 'refuse', '')", [pending.id]), /motif/);
    await q(db, cnts, "select public.blood_decide_donation($1, 'valide', null, 'O+')", [pending.id]);
    await expectError(q(db, cnts, "select public.blood_decide_donation($1, 'refuse', 'erreur de saisie')", [pending.id]), /déjà été traité/);
    const s = (await q(db, donor, "select public.donor_summary() s")).rows[0].s;
    expect(s.validated_count).toBe(1); expect(s.badge.current.label).toBe("Premier geste"); expect(s.badge.next.threshold).toBe(3);
    expect(s.interval_months).toBe(3); expect(s.intervals_confirmed).toBe(false);
    expect((await sys(db, "select blood_group_verified v from public.blood_donor_profiles where user_id = $1", [donor])).rows[0].v).toBe(true);
    expect((await sys(db, "select count(*)::int n from public.notifications where user_id = $1 and kind = 'don_sang'", [donor])).rows[0].n).toBe(2);
    // Le groupe modifié par le donneur n'est plus vérifié
    await q(db, donor, "select public.donor_save_profile($1::jsonb)", [JSON.stringify({ blood_group: "A+", sex: "M" })]);
    expect((await sys(db, "select blood_group_verified v from public.blood_donor_profiles where user_id = $1", [donor])).rows[0].v).toBe(false);
    await q(db, donor, "select public.donor_save_profile($1::jsonb)", [JSON.stringify({ blood_group: "O+", sex: "M" })]);
  });

  it("refus : don non compté ; un donneur ne valide jamais son propre don", async () => {
    await declare(day(100));
    const id = (await sys(db, "select id from public.blood_donations where donor_id = $1 and status = 'en_attente'", [donor])).rows[0].id;
    await q(db, w.admin, "select public.blood_decide_donation($1, 'refuse', 'Aucune trace du prélèvement')", [id]);
    expect((await q(db, donor, "select public.donor_summary() s")).rows[0].s.validated_count).toBe(1);
    await sys(db, "insert into public.authority_members (user_id, scope, organisation) values ($1, 'cnts', 'CNTS') on conflict (user_id) do update set scope = 'cnts'", [donor]);
    await declare(day(50));
    const own = (await sys(db, "select id from public.blood_donations where donor_id = $1 and status = 'en_attente'", [donor])).rows[0].id;
    await expectError(q(db, donor, "select public.blood_decide_donation($1, 'valide')", [own]), /propre don/);
    await sys(db, "delete from public.authority_members where user_id = $1", [donor]);
    await q(db, donor, "select public.donor_cancel_donation($1)", [own]);
  });

  it("carte : QR opaque, groupe visible seulement du titulaire et du CNTS, connexion exigée", async () => {
    token = (await sys(db, "select card_token from public.blood_donor_profiles where user_id = $1", [donor])).rows[0].card_token;
    expect(token).toMatch(/^[0-9a-f]{32}$/);
    await expectError(q(db, null, "select public.donor_card_lookup($1)", [token]), /permission denied/);
    const other = (await q(db, w.customerA, "select public.donor_card_lookup($1) c", [token])).rows[0].c;
    expect(other.status).toBe("ok"); expect(other.blood_group).toBeNull(); expect(other.name).toBeNull(); expect(other.validated_count).toBe(1);
    const full = (await q(db, cnts, "select public.donor_card_lookup($1) c", [token])).rows[0].c;
    expect(full.full_access).toBe(true); expect(full.name).toBeTruthy();
    expect(full.blood_group).toBeNull(); // groupe modifié par le donneur depuis la validation : plus considéré comme vérifié
    await sys(db, "update public.blood_donor_profiles set blood_group_verified = true where user_id = $1", [donor]);
    expect((await q(db, cnts, "select public.donor_card_lookup($1) c", [token])).rows[0].c.blood_group).toBe("O+");
    expect((await q(db, w.customerA, "select public.donor_card_lookup($1) c", [token])).rows[0].c.blood_group).toBeNull();
    await q(db, donor, "select public.donor_renew_card_token()");
    expect((await q(db, w.customerA, "select public.donor_card_lookup($1) c", [token])).rows[0].c.status).toBe("invalide");
  });

  it("certificat vérifiable par sa référence, nom seulement avec accord ; paliers configurables", async () => {
    const ref = (await q(db, donor, "select public.donor_issue_certificate(false) r", [])).rows[0].r;
    const v = (await q(db, null, "select public.verify_blood_certificate($1) v", [ref])).rows[0].v;
    expect(v.status).toBe("ok"); expect(v.validated_count).toBe(1); expect(v.holder_name).toBeNull();
    expect((await q(db, null, "select public.verify_blood_certificate('CDS-INCONNU') v")).rows[0].v.status).toBe("introuvable");
    await expectError(q(db, w.customerA, "select public.donor_issue_certificate(true)"), /aucun espace/);
    await expectError(q(db, donor, "select public.admin_set_badge_threshold('donneur_fidele', 2)"), /administrat/);
    await expectError(q(db, w.admin, "select public.admin_set_badge_threshold('donneur_fidele', 5)"), /déjà ce nombre/);
    await q(db, w.admin, "select public.admin_set_badge_threshold('donneur_fidele', 2)");
    await q(db, w.admin, "select public.admin_set_badge_threshold('donneur_fidele', 3)");
  });

  it("rappel de date indicative une seule fois ; retrait du consentement efface tout", async () => {
    await sys(db, "update public.blood_donations set donated_on = current_date - 120 where donor_id = $1 and status = 'valide'", [donor]);
    expect((await sys(db, "select public.blood_donor_reminders() n")).rows[0].n).toBe(1);
    expect((await sys(db, "select public.blood_donor_reminders() n")).rows[0].n).toBe(0);
    await q(db, donor, "select public.donor_delete_space()");
    expect((await sys(db, "select count(*)::int n from public.blood_donations where donor_id = $1", [donor])).rows[0].n).toBe(0);
    expect((await q(db, donor, "select public.donor_summary() s")).rows[0].s.exists).toBe(false);
  });
});
