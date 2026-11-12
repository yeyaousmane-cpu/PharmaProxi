/** 0.41 : orientation phases 2 à 4 (partenaires désignés, conditions d'accès sourcées, état temporaire, rendez-vous, niveaux). */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildWorld, createTestDb, createUser, Db, expectError, q, sys, World, hasDb } from "./helpers";

describe.skipIf(!hasDb)("Version 0.41 — orientation et établissements partenaires", () => {
  let db: Db; let w: World; let staff: string; let fac: string; let other: string; let circle: string;
  beforeAll(async () => {
    db = await createTestDb(); w = await buildWorld(db);
    staff = await createUser(db, "csref41");
    circle = (await sys(db, "select id from public.circles where official_code = 'ML0204'")).rows[0].id;
    const reg = (await sys(db, "select region_id from public.circles where id = $1", [circle])).rows[0].region_id;
    fac = (await sys(db, "insert into public.facility_listings (name, kind, region_id, circle_id, source, source_level, is_published) values ('CSRéf de Test41', 'csref', $1, $2, 'Test', 'officielle', true) returning id", [reg, circle])).rows[0].id;
    other = (await sys(db, "insert into public.facility_listings (name, kind, region_id, circle_id, source, source_level, is_published) values ('CSCOM de Test41', 'cscom', $1, $2, 'Test', 'officielle', true) returning id", [reg, circle])).rows[0].id;
    await sys(db, "insert into public.facility_listings (name, kind, region_id, source, source_level, is_published) select 'CHU Test41', 'chu', id, 'Test', 'officielle', true from public.regions where name = 'District de Bamako'");
  }, 120_000);
  afterAll(async () => db?.close());

  it("partenaire désigné uniquement par l'administration, avec note de vérification", async () => {
    const email = (await sys(db, "select email from auth.users where id = $1", [staff])).rows[0].email;
    await expectError(q(db, w.customerA, "select public.admin_facility_partner($1, $2, 'Major', 'Appel au standard')", [fac, email]), /administrat|réservé|PP403/);
    await expectError(q(db, w.admin, "select public.admin_facility_partner($1, $2, 'Major', '')", [fac, email]), /vérification/);
    await q(db, w.admin, "select public.admin_facility_partner($1, $2, 'Major', 'Appel au standard le 12/11')", [fac, email]);
    expect((await q(db, null, "select public.facility_is_partner($1) p", [fac])).rows[0].p).toBe(true);
    expect((await q(db, null, "select public.facility_is_partner($1) p", [other])).rows[0].p).toBe(false);
  });

  it("conditions d'accès sourcées et état de service temporaire", async () => {
    await expectError(q(db, w.customerA, "select public.facility_set_access($1, 'canam_amo', 'Oui')", [fac]), /membres/);
    await q(db, staff, "select public.facility_set_access($1, 'tarif_consultation', '1 000 FCFA (ticket modérateur)')", [fac]);
    expect((await q(db, null, "select source_kind from public.facility_access_info where facility_id = $1", [fac])).rows[0].source_kind).toBe("etablissement");
    await expectError(q(db, staff, "select public.facility_declare_service($1, 'Maternité', 'sature', 100)", [fac]), /1 à 72/);
    const sid = (await q(db, staff, "select public.facility_declare_service($1, 'Maternité', 'sature', 6, 'Orientez vers le CSRéf voisin') id", [fac])).rows[0].id;
    expect((await q(db, null, "select count(*)::int n from public.facility_service_status where facility_id = $1", [fac])).rows[0].n).toBe(1);
    await sys(db, "update public.facility_service_status set valid_until = now() - interval '1 minute' where id = $1", [sid]);
    expect((await q(db, null, "select count(*)::int n from public.facility_service_status where facility_id = $1", [fac])).rows[0].n).toBe(0);
  });

  it("rendez-vous : seulement chez un partenaire ; proposition puis confirmation ; téléphone sur accord", async () => {
    await expectError(q(db, w.customerA, "select public.facility_request_appointment($1, 'Consultation', 'Lundi matin')", [other]), /appelez-le directement/);
    const ref = (await q(db, w.customerA, "select public.facility_request_appointment($1, 'Consultation prénatale', 'Lundi ou mardi matin', null, false) r", [fac])).rows[0].r;
    expect(ref).toMatch(/^RDV-/);
    const inbox = (await q(db, staff, "select * from public.facility_appointment_inbox($1)", [fac])).rows;
    expect(inbox).toHaveLength(1); expect(inbox[0].phone).toBeNull();
    await expectError(q(db, w.customerB, "select * from public.facility_appointment_inbox($1)", [fac]), /accès refusé/);
    await expectError(q(db, w.customerA, "select public.facility_appointment_action($1, 'confirmer')", [inbox[0].id]), /impossible/);
    await q(db, staff, "select public.facility_appointment_action($1, 'proposer', now() + interval '2 days', 'Venez à 8 h')", [inbox[0].id]);
    await q(db, w.customerA, "select public.facility_appointment_action($1, 'confirmer')", [inbox[0].id]);
    expect((await q(db, w.customerA, "select status from public.facility_appointment_requests")).rows[0].status).toBe("confirmee");
  });

  it("orientation par niveau et couverture pour les autorités", async () => {
    const lv = (await q(db, null, "select level, name from public.orientation_levels(null, $1)", [circle])).rows;
    expect(lv.find((x) => x.name === "CSCOM de Test41")?.level).toBe(1);
    expect(lv.find((x) => x.name === "CSRéf de Test41")?.level).toBe(2);
    expect(lv.find((x) => x.name === "CHU Test41")?.level).toBe(4);
    await expectError(q(db, w.customerA, "select * from public.authority_territory()"), /autorités/);
    const t = (await q(db, w.admin, "select * from public.authority_territory() where circle = 'Kati'")).rows[0];
    expect(Number(t.partenaires)).toBe(1); expect(t.demandes_rdv).toBeNull();
  });
});
