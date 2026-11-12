/** 0.40 : collectes proposées par des organisations (validation CNTS), créneaux, bilan déclaré, observatoire masqué. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildWorld, createTestDb, createUser, Db, expectError, q, sys, World, hasDb } from "./helpers";

describe.skipIf(!hasDb)("Version 0.40 — collectes et observatoire", () => {
  let db: Db; let w: World; let cnts: string; let pid: string; let cid: string;
  const day = (n: number) => new Date(Date.now() + n * 86400_000).toISOString().slice(0, 10);
  const prop = (over: Record<string, unknown> = {}) => JSON.stringify({ organization_name: "Association Test Jeunesse", organization_kind: "association", contact_phone: "70 00 00 01", title: "Collecte du quartier", region_id: w.region, place: "Maison des jeunes", starts_on: day(10), start_time: "08:00", end_time: "10:00", collecting_structure: "CNTS de Bamako", collecting_agreement: "confirme", slot_minutes: "60", slot_capacity: "2", ...over });
  beforeAll(async () => {
    db = await createTestDb(); w = await buildWorld(db);
    cnts = await createUser(db, "cnts40");
    await sys(db, "insert into public.authority_members (user_id, scope, organisation) values ($1, 'cnts', 'CNTS (test)')", [cnts]);
  }, 120_000);
  afterAll(async () => db?.close());

  it("proposition : délai de 7 jours, téléphone normalisé, invisible du public", async () => {
    await expectError(q(db, w.customerA, "select public.campaign_propose($1::jsonb)", [prop({ starts_on: day(2) })]), /7 jours/);
    const ref = (await q(db, w.customerA, "select public.campaign_propose($1::jsonb) r", [prop()])).rows[0].r;
    expect(ref).toMatch(/^COL-/);
    const r = (await sys(db, "select id, contact_phone, status from public.blood_campaign_proposals where reference = $1", [ref])).rows[0];
    expect(r.contact_phone).toBe("+22370000001"); expect(r.status).toBe("soumise"); pid = r.id;
    expect((await q(db, w.customerB, "select count(*)::int n from public.blood_campaign_proposals")).rows[0].n).toBe(0);
    expect((await q(db, null, "select count(*)::int n from public.blood_campaigns where proposal_id is not null")).rows[0].n).toBe(0);
  });

  it("validation réservée au CNTS ou à l'administration ; publication avec structure de collecte", async () => {
    await expectError(q(db, w.customerB, "select public.campaign_review($1, 'validee')", [pid]), /CNTS ou à l'administration/);
    await expectError(q(db, cnts, "select public.campaign_review($1, 'a_completer', '')", [pid]), /raison/);
    expect((await q(db, cnts, "select count(*)::int n from public.blood_campaign_proposals")).rows[0].n).toBe(1);
    cid = (await q(db, cnts, "select public.campaign_review($1, 'validee') c", [pid])).rows[0].c;
    const c = (await q(db, null, "select organizer, collecting_structure, source_url, validated_at is not null v from public.blood_campaigns where id = $1", [cid])).rows[0];
    expect(c).toEqual({ organizer: "Association Test Jeunesse", collecting_structure: "CNTS de Bamako", source_url: null, v: true });
    // structure non confirmée : pas de publication
    const p2 = (await q(db, w.customerA, "select public.campaign_propose($1::jsonb) r", [prop({ collecting_agreement: "en_discussion", title: "Autre collecte" })])).rows[0].r;
    const id2 = (await sys(db, "select id from public.blood_campaign_proposals where reference = $1", [p2])).rows[0].id;
    await expectError(q(db, cnts, "select public.campaign_review($1, 'validee')", [id2]), /confirmé sa participation/);
  });

  it("créneaux : capacité respectée, l'organisateur ne voit que des nombres", async () => {
    const slots = (await q(db, null, "select * from public.campaign_slots($1)", [cid])).rows;
    expect(slots.map((s) => s.slot_start)).toEqual(["08:00", "09:00"]);
    await q(db, w.customerA, "select public.campaign_book_slot($1, '08:00')", [cid]);
    await q(db, w.customerB, "select public.campaign_book_slot($1, '08:00')", [cid]);
    await expectError(q(db, w.admin, "select public.campaign_book_slot($1, '08:00')", [cid]), /complet/);
    await q(db, w.customerA, "select public.campaign_book_slot($1, '09:00')", [cid]);
    expect((await q(db, null, "select taken from public.campaign_slots($1) where slot_start = '08:00'", [cid])).rows[0].taken).toBe(1);
    const counts = (await q(db, w.customerA, "select public.campaign_organizer_counts($1) c", [pid])).rows[0].c;
    expect(counts.inscrits_creneaux).toBe(2); expect(JSON.stringify(counts)).not.toMatch(/[0-9a-f]{8}-/);
    expect((await q(db, w.customerA, "select count(*)::int n from public.blood_campaign_slot_signups")).rows[0].n).toBe(1);
  });

  it("bilan après la collecte seulement ; observatoire masqué sous le seuil", async () => {
    await expectError(q(db, w.customerA, "select public.campaign_report_outcome($1, 20, 15)", [pid]), /après la collecte/);
    await sys(db, "update public.blood_campaign_proposals set starts_on = current_date - 1 where id = $1", [pid]);
    await expectError(q(db, w.customerA, "select public.campaign_report_outcome($1, 5, 15)", [pid]), /dépasser/);
    await q(db, w.customerA, "select public.campaign_report_outcome($1, 20, 15, 'Bonne mobilisation')", [pid]);
    const o = (await q(db, null, "select public.blood_observatory(90) o")).rows[0].o;
    expect(o.seuil).toBe(10);
    expect(o.national.j_y_serai).toBeNull();
    expect(o.national.bilans_declares_poches).toBe(15);
    expect(o.regions.length).toBeGreaterThan(5);
  });
});
