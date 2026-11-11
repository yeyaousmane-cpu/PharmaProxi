/** 0.35 : SOS Besoin de sang, mise en relation, disponibilités déclarées, rendez-vous de don. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildWorld, createTestDb, createUser, Db, expectError, q, sys, World, hasDb } from "./helpers";

const soon = () => new Date(Date.now() + 6 * 3600_000).toISOString();
const req = (extra: Record<string, unknown> = {}) => JSON.stringify({
  requester_kind: "famille", blood_group: "A+", facility_name: "Hôpital de test", needed_at: soon(), urgency: "critique",
  contact_name: "Famille Test", contact_phone: "+22370000001", accord: "true", ...extra,
});

describe.skipIf(!hasDb)("Version 0.35 — SOS Besoin de sang", () => {
  let db: Db; let w: World; let fam: string; let cnts: string; let dOk: string; let dNo: string; let dWrong: string;
  beforeAll(async () => {
    db = await createTestDb(); w = await buildWorld(db);
    fam = await createUser(db, "fam35"); cnts = await createUser(db, "cnts35");
    dOk = await createUser(db, "dok35"); dNo = await createUser(db, "dno35"); dWrong = await createUser(db, "dwr35");
    await sys(db, "insert into public.authority_members (user_id, scope, organisation) values ($1, 'cnts', 'CNTS')", [cnts]);
    await q(db, dOk, "select public.donor_save_profile($1::jsonb)", [JSON.stringify({ blood_group: "O+", consent: "true", accepts_solicitations: true })]);
    await q(db, dNo, "select public.donor_save_profile($1::jsonb)", [JSON.stringify({ blood_group: "O+", consent: "true", accepts_solicitations: false })]);
    await q(db, dWrong, "select public.donor_save_profile($1::jsonb)", [JSON.stringify({ blood_group: "B+", consent: "true", accepts_solicitations: true })]);
  }, 120_000);
  afterAll(async () => db?.close());

  it("compatibilité théorique ABO/Rh", async () => {
    expect((await q(db, null, "select public.blood_compatible_donors('A+') g")).rows[0].g.sort()).toEqual(["A+", "A-", "O+", "O-"]);
    expect((await q(db, null, "select public.blood_compatible_donors('O-') g")).rows[0].g).toEqual(["O-"]);
    expect((await q(db, null, "select public.blood_compatible_donors('O+', 'plasma') g")).rows[0].g).toHaveLength(8);
  });

  it("une demande n'est publique qu'après vérification ; contact jamais public", async () => {
    await expectError(q(db, fam, "select public.blood_request_create($1::jsonb)", [req({ accord: "false" })]), /confirmez/);
    await expectError(q(db, null, "select public.blood_request_create($1::jsonb)", [req()]), /permission denied/);
    const ref = (await q(db, fam, "select public.blood_request_create($1::jsonb) r", [req()])).rows[0].r;
    expect(ref).toMatch(/^SOS-/);
    expect((await q(db, null, "select count(*)::int n from public.blood_requests")).rows[0].n).toBe(0);
    expect((await q(db, fam, "select count(*)::int n from public.blood_requests")).rows[0].n).toBe(1);
    expect((await sys(db, "select count(*)::int n from public.notifications where user_id = $1 and title = 'Demande de sang à vérifier'", [cnts])).rows[0].n).toBe(1);
    const id = (await q(db, fam, "select id from public.blood_requests")).rows[0].id;
    await expectError(q(db, fam, "select public.blood_request_set_status($1, 'verifiee')", [id]), /réservé/);
    await expectError(q(db, cnts, "select public.blood_request_mobilize($1)", [id]), /vérifiée/);
    await q(db, cnts, "select public.blood_request_set_status($1, 'verifiee', 'Confirmé avec le service')", [id]);
    expect((await q(db, null, "select count(*)::int n from public.blood_requests")).rows[0].n).toBe(1);
    await expectError(q(db, null, "select contact_phone from public.blood_requests"), /permission denied/);
    await expectError(q(db, w.customerA, "select public.blood_request_contact($1)", [id]), /accès refusé/);
    expect((await q(db, fam, "select public.blood_request_contact($1) c", [id])).rows[0].c.contact_phone).toBe("+22370000001");
  });

  it("mise en relation : seulement les volontaires de groupe théoriquement compatible, une fois", async () => {
    const id = (await q(db, null, "select id from public.blood_requests")).rows[0].id;
    expect((await q(db, cnts, "select public.blood_request_mobilize($1) n", [id])).rows[0].n).toBe(1);
    const sol = (await sys(db, "select donor_id from public.blood_request_solicitations where request_id = $1", [id])).rows.map((r) => r.donor_id);
    expect(sol).toEqual([dOk]);
    expect((await q(db, cnts, "select public.blood_request_mobilize($1) n", [id])).rows[0].n).toBe(0);
    expect((await sys(db, "select body from public.notifications where user_id = $1 and title like 'Besoin de sang%'", [dOk])).rows[0].body).toMatch(/théoriquement compatible/);
    expect((await q(db, null, "select status from public.blood_requests")).rows[0].status).toBe("mobilisation");
  });

  it("je suis disponible : le demandeur voit le donneur, téléphone seulement avec accord", async () => {
    const id = (await q(db, null, "select id from public.blood_requests")).rows[0].id;
    await expectError(q(db, w.customerA, "select public.blood_request_respond($1, true)", [id]), /espace donneur/);
    await q(db, dOk, "select public.blood_request_respond($1, false)", [id]);
    const r = (await q(db, fam, "select * from public.blood_request_responders($1)", [id])).rows;
    expect(r).toHaveLength(1); expect(r[0].phone).toBeNull(); expect(r[0].blood_group).toBe("O+");
    await expectError(q(db, w.customerA, "select * from public.blood_request_responders($1)", [id]), /accès refusé/);
    await q(db, fam, "select public.blood_request_set_status($1, 'satisfaite')", [id]);
    await expectError(q(db, dWrong, "select public.blood_request_respond($1, true)", [id]), /n'attend plus/);
  });

  it("signalements : 3 signalements masquent la demande en attendant le CNTS", async () => {
    const ref = (await q(db, fam, "select public.blood_request_create($1::jsonb) r", [req({ blood_group: "B+" })])).rows[0].r;
    const id = (await sys(db, "select id from public.blood_requests where reference = $1", [ref])).rows[0].id;
    await q(db, cnts, "select public.blood_request_set_status($1, 'verifiee')", [id]);
    for (const u of [dOk, dNo, dWrong]) await q(db, u, "select public.blood_request_report($1, 'Numéro qui demande de l''argent')", [id]);
    await expectError(q(db, dOk, "select public.blood_request_report($1, 'encore une fois')", [id]), /déjà signalé/);
    expect((await q(db, null, "select count(*)::int n from public.blood_requests where id = $1", [id])).rows[0].n).toBe(0);
    expect((await q(db, cnts, "select reports from public.blood_hidden_requests() where id = $1", [id])).rows[0].reports).toBe(3);
    await expectError(q(db, dOk, "select * from public.blood_hidden_requests()"), /réservé/);
    expect((await q(db, fam, "select public.blood_request_is_mine($1) m", [id])).rows[0].m).toBe(true);
    expect((await q(db, dOk, "select public.blood_request_is_mine($1) m", [id])).rows[0].m).toBe(false);
    await q(db, cnts, "select public.blood_request_unhide($1)", [id]);
    expect((await q(db, null, "select count(*)::int n from public.blood_requests where id = $1", [id])).rows[0].n).toBe(1);
    await expectError(q(db, cnts, "select public.blood_request_set_status($1, 'rejetee')", [id]), /motif/);
  });

  it("disponibilités : déclarées par le CNTS seulement, datées, « non actualisées » après 48 h", async () => {
    await expectError(q(db, w.customerA, "select public.blood_stock_update('CNTS', null, 'globules_rouges', '{\"O-\":\"urgent\"}'::jsonb)"), /réservé/);
    expect((await q(db, cnts, "select public.blood_stock_update('CNTS Bamako', null, 'globules_rouges', '{\"O-\":\"urgent\",\"A+\":\"normal\",\"X\":\"bad\"}'::jsonb) n")).rows[0].n).toBe(2);
    const cur = (await q(db, null, "select blood_group, level, organisation, stale from public.blood_stock_current() order by blood_group")).rows;
    expect(cur).toEqual([{ blood_group: "A+", level: "normal", organisation: "CNTS", stale: false }, { blood_group: "O-", level: "urgent", organisation: "CNTS", stale: false }]);
    await sys(db, "update public.blood_stock_levels set created_at = now() - interval '3 days'");
    expect((await q(db, null, "select bool_and(stale) s from public.blood_stock_current()")).rows[0].s).toBe(true);
  });

  it("rendez-vous de don : créneaux du centre, capacité respectée, annulation par le centre notifiée", async () => {
    const d = new Date(Date.now() + 2 * 86400_000).toISOString().slice(0, 10);
    await expectError(q(db, w.customerA, "select public.blood_slot_create($1::jsonb)", [JSON.stringify({ center: "CNTS", slot_date: d, start_time: "08:00", end_time: "10:00", capacity: 1 })]), /réservé/);
    await expectError(q(db, cnts, "select public.blood_slot_create($1::jsonb)", [JSON.stringify({ center: "CNTS", slot_date: d, start_time: "10:00", end_time: "08:00", capacity: 1 })]), /fin après début/);
    const slot = (await q(db, cnts, "select public.blood_slot_create($1::jsonb) id", [JSON.stringify({ center: "CNTS Bamako", slot_date: d, start_time: "08:00", end_time: "10:00", capacity: 1 })])).rows[0].id;
    expect((await q(db, dOk, "select public.blood_slot_book($1) r", [slot])).rows[0].r).toMatch(/^RDD-/);
    await expectError(q(db, dNo, "select public.blood_slot_book($1)", [slot]), /complet/);
    expect((await q(db, null, "select public.blood_slot_remaining($1) n", [slot])).rows[0].n).toBe(0);
    expect((await q(db, dNo, "select count(*)::int n from public.blood_slot_bookings")).rows[0].n).toBe(0);
    await q(db, cnts, "select public.blood_slot_close($1)", [slot]);
    expect((await q(db, dOk, "select status from public.blood_slot_bookings")).rows[0].status).toBe("annule");
    expect((await sys(db, "select count(*)::int n from public.notifications where user_id = $1 and title = 'Créneau de don annulé par le centre'", [dOk])).rows[0].n).toBe(1);
    expect((await q(db, null, "select count(*)::int n from public.blood_donation_slots where id = $1", [slot])).rows[0].n).toBe(0);
  });
});
