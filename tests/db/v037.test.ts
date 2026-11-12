/** 0.37 : premiers secours & citoyens sauveteurs (organismes potentiels, demandes, badge vérifié par l'organisme, QR sans données personnelles). */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildWorld, createTestDb, createUser, Db, expectError, q, sys, World, hasDb } from "./helpers";

describe.skipIf(!hasDb)("Version 0.37 — citoyens sauveteurs", () => {
  let db: Db; let w: World; let trainer: string; let org: string;
  beforeAll(async () => {
    db = await createTestDb(); w = await buildWorld(db);
    trainer = await createUser(db, "formateur37");
    org = (await sys(db, "select id from public.first_aid_organizations where slug = 'croix-rouge-malienne'")).rows[0].id;
    await sys(db, "insert into public.first_aid_org_members (organization_id, user_id) values ($1, $2)", [org, trainer]);
  }, 120_000);
  afterAll(async () => db?.close());

  it("organismes présentés comme partenaires potentiels, sans logo", async () => {
    const r = (await q(db, null, "select partnership_status, logo_authorized, email from public.first_aid_organizations where slug = 'croix-rouge-malienne'")).rows[0];
    expect(r).toEqual({ partnership_status: "potentiel", logo_authorized: false, email: "crmalienne@croix-rouge.ml" });
    const s = (await q(db, null, "select public.first_aid_stats() s")).rows[0].s;
    expect(s.organismes_partenaires).toBe(0); expect(s.citoyens_formes_verifies).toBe(0);
    await expectError(q(db, w.admin, "select public.admin_first_aid_org($1, 'accord_signe', '', null)", [org]), /accord signé/);
  });

  it("demande d'inscription suivie ; contact visible par l'organisme seulement si accepté", async () => {
    const ref = (await q(db, w.customerA, "select public.first_aid_register($1::jsonb) r", [JSON.stringify({ organization_id: org, audience: "etudiant", share_contact: false })])).rows[0].r;
    expect(ref).toMatch(/^PS-/);
    await expectError(q(db, w.customerA, "select public.first_aid_register($1::jsonb)", [JSON.stringify({ organization_id: org })]), /déjà une demande/);
    expect((await q(db, w.customerB, "select count(*)::int n from public.first_aid_registrations")).rows[0].n).toBe(0);
    const rows = (await q(db, trainer, "select * from public.first_aid_registrations_for_org($1)", [org])).rows;
    expect(rows).toHaveLength(1); expect(rows[0].phone).toBeNull();
    await expectError(q(db, w.customerB, "select * from public.first_aid_registrations_for_org($1)", [org]), /réservé/);
    await q(db, trainer, "select public.first_aid_set_registration($1, 'confirmee', 'Session du 20/11')", [rows[0].id]);
    expect((await q(db, w.customerA, "select status from public.first_aid_registrations")).rows[0].status).toBe("confirmee");
  });

  it("le badge n'est jamais automatique : validation par l'organisme, vérification publique sans données personnelles", async () => {
    const id = (await q(db, w.customerA, "select public.first_aid_declare($1::jsonb) id", [JSON.stringify({ organization_id: org, course_label: "Premiers secours niveau 1", completed_on: "2026-10-01" })])).rows[0].id;
    const tok = (await q(db, w.customerA, "select verify_token from public.first_aid_certifications where id = $1", [id])).rows[0].verify_token;
    expect((await q(db, null, "select public.first_aid_badge_lookup($1) b", [tok])).rows[0].b).toBeNull();
    await expectError(q(db, w.customerB, "select public.first_aid_verify($1, 'verifiee')", [id]), /organisme formateur/);
    await expectError(q(db, w.customerA, "select public.first_aid_verify($1, 'verifiee')", [id]), /organisme formateur|propre/);
    await q(db, trainer, "select public.first_aid_verify($1, 'verifiee', '2028-10-01')", [id]);
    const b = (await q(db, null, "select public.first_aid_badge_lookup($1) b", [tok])).rows[0].b;
    expect(b.status).toBe("valide"); expect(b.organisation).toBe("Croix-Rouge malienne"); expect(b.titulaire).toBeNull();
    expect(JSON.stringify(b)).not.toMatch(/@|\+223/);
    await q(db, w.customerA, "select public.first_aid_set_show_name($1, true)", [id]);
    expect((await q(db, null, "select public.first_aid_badge_lookup($1) b", [tok])).rows[0].b.titulaire).toMatch(/\.$|^\S+$/);
    await sys(db, "update public.first_aid_certifications set expires_on = '2026-10-02' where id = $1", [id]);
    expect((await q(db, null, "select public.first_aid_badge_lookup($1) b", [tok])).rows[0].b.status).toBe("expiree");
    await q(db, w.customerA, "select public.first_aid_set_show_name($1, false, true)", [id]);
    expect((await q(db, null, "select public.first_aid_badge_lookup($1) b", [tok])).rows[0].b).toBeNull();
  });

  it("sessions publiées après validation ; compteur réel", async () => {
    const d = new Date(Date.now() + 10 * 86400_000).toISOString().slice(0, 10);
    await expectError(q(db, w.customerA, "select public.first_aid_propose_course($1::jsonb)", [JSON.stringify({ organization_id: org, title: "Initiation", starts_on: d })]), /habilités/);
    const c = (await q(db, trainer, "select public.first_aid_propose_course($1::jsonb) id", [JSON.stringify({ organization_id: org, title: "Initiation aux gestes qui sauvent", starts_on: d })])).rows[0].id;
    expect((await q(db, null, "select count(*)::int n from public.first_aid_courses")).rows[0].n).toBe(0);
    await q(db, w.admin, "select public.admin_first_aid_moderate('course', $1, 'publiee')", [c]);
    expect((await q(db, null, "select count(*)::int n from public.first_aid_courses")).rows[0].n).toBe(1);
    expect((await q(db, null, "select public.first_aid_stats() s")).rows[0].s.formations_organisees).toBe(1);
  });
});
