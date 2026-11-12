/** 0.39 : transmission d'ordonnances (consentement, pharmacie destinataire seule, réponse datée, réservation, expiration). */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildWorld, createTestDb, Db, expectError, q, sys, World, hasDb } from "./helpers";

describe.skipIf(!hasDb)("Version 0.39 — transmission d'ordonnances", () => {
  let db: Db; let w: World; let rx: string; let other: string; let tid: string;
  beforeAll(async () => {
    db = await createTestDb(); w = await buildWorld(db);
    const person = (await q(db, w.customerA, "select public.record_ensure_self() id")).rows[0].id;
    rx = (await q(db, w.customerA, "insert into public.record_documents (user_id, person_id, title, doc_kind, storage_path, mime, size_bytes) values ($1, $2, 'Ordonnance Dr X', 'ordonnance', $3, 'image/jpeg', 1000) returning id", [w.customerA, person, `${w.customerA}/rx.bin`])).rows[0].id;
    other = (await q(db, w.customerA, "insert into public.record_documents (user_id, person_id, title, doc_kind, storage_path, mime, size_bytes) values ($1, $2, 'Résultat', 'resultat', $3, 'application/pdf', 1000) returning id", [w.customerA, person, `${w.customerA}/res.bin`])).rows[0].id;
  }, 120_000);
  afterAll(async () => db?.close());
  const lines = JSON.stringify([{ label: "Amoxicilline 500 mg", availability: "disponible", quantity: "2", price: "1500" }, { label: "Paracétamol 1 g", availability: "indisponible" }]);

  it("envoi : consentement, ordonnance du dossier, pharmacie vérifiée ; pas de doublon", async () => {
    await expectError(q(db, w.customerA, "select public.rx_send($1, $2, null, false)", [rx, w.ph1]), /consentement/);
    await expectError(q(db, w.customerA, "select public.rx_send($1, $2, null, true)", [other, w.ph1]), /Ordonnance/);
    await expectError(q(db, w.customerB, "select public.rx_send($1, $2, null, true)", [rx, w.ph1]), /introuvable/);
    const ref = (await q(db, w.customerA, "select public.rx_send($1, $2, 'Pour mon fils', true) r", [rx, w.ph1])).rows[0].r;
    expect(ref).toMatch(/^ORD-/);
    await expectError(q(db, w.customerA, "select public.rx_send($1, $2, null, true)", [rx, w.ph1]), /déjà en cours/);
    tid = (await sys(db, "select id from public.prescription_transmissions where reference = $1", [ref])).rows[0].id;
    expect((await sys(db, "select count(*)::int n from public.notifications where user_id = $1 and kind = 'ordonnance'", [w.ph1User])).rows[0].n).toBe(1);
  });

  it("seule la pharmacie destinataire voit la demande et lit le fichier", async () => {
    expect((await q(db, w.ph2User, "select count(*)::int n from public.prescription_transmissions")).rows[0].n).toBe(0);
    await expectError(q(db, w.ph2User, "select public.rx_open($1)", [tid]), /accès refusé/);
    await expectError(q(db, w.ph2User, "select * from public.rx_pharmacy_inbox($1)", [w.ph1]), /accès refusé/);
    expect((await q(db, w.ph2User, "select public.rx_can_read($1) r", [`${w.customerA}/rx.bin`])).rows[0].r).toBe(false);
    expect((await q(db, w.ph1User, "select public.rx_can_read($1) r", [`${w.customerA}/rx.bin`])).rows[0].r).toBe(true);
    expect((await q(db, w.ph1User, "select public.rx_can_read($1) r", [`${w.customerA}/res.bin`])).rows[0].r).toBe(false);
    const inbox = (await q(db, w.ph1User, "select * from public.rx_pharmacy_inbox($1)", [w.ph1])).rows;
    expect(inbox).toHaveLength(1); expect(JSON.stringify(inbox[0])).not.toMatch(/rx\.bin|@/);
    expect((await q(db, w.ph1User, "select public.rx_open($1) o", [tid])).rows[0].o.mime).toBe("image/jpeg");
    expect((await sys(db, "select status from public.prescription_transmissions where id = $1", [tid])).rows[0].status).toBe("vue");
  });

  it("réponse datée, réservation, retrait ; réponse périmée non réservable", async () => {
    await expectError(q(db, w.customerA, "select public.rx_patient_action($1, 'reserver')", [tid]), /après la réponse/);
    await expectError(q(db, w.ph1User, "select public.rx_respond($1, $2::jsonb, 100)", [tid, lines]), /2 à 48/);
    await expectError(q(db, w.ph2User, "select public.rx_respond($1, $2::jsonb, 12)", [tid, lines]), /accès refusé/);
    await q(db, w.ph1User, "select public.rx_respond($1, $2::jsonb, 12, 'Générique possible sur avis')", [tid, lines]);
    expect((await q(db, w.customerA, "select count(*)::int n from public.prescription_response_lines")).rows[0].n).toBe(2);
    await sys(db, "update public.prescription_transmissions set response_valid_until = now() - interval '1 minute' where id = $1", [tid]);
    await expectError(q(db, w.customerA, "select public.rx_patient_action($1, 'reserver')", [tid]), /n'est plus valable/);
    await q(db, w.ph1User, "select public.rx_respond($1, $2::jsonb, 12)", [tid, lines]);
    await q(db, w.customerA, "select public.rx_patient_action($1, 'reserver')", [tid]);
    await q(db, w.ph1User, "select public.rx_pharmacy_action($1, 'prete')", [tid]);
    await q(db, w.ph1User, "select public.rx_pharmacy_action($1, 'retiree')", [tid]);
    expect((await sys(db, "select status from public.prescription_transmissions where id = $1", [tid])).rows[0].status).toBe("retiree");
    // demande close : le fichier n'est plus lisible
    expect((await q(db, w.ph1User, "select public.rx_can_read($1) r", [`${w.customerA}/rx.bin`])).rows[0].r).toBe(false);
    await expectError(q(db, w.ph1User, "select public.rx_open($1)", [tid]), /close/);
  });

  it("expiration automatique et refus motivé", async () => {
    const ref = (await q(db, w.customerA, "select public.rx_send($1, $2, null, true) r", [rx, w.ph2])).rows[0].r;
    const id = (await sys(db, "select id from public.prescription_transmissions where reference = $1", [ref])).rows[0].id;
    await expectError(q(db, w.ph2User, "select public.rx_pharmacy_action($1, 'refusee', '')", [id]), /motif/);
    await sys(db, "update public.prescription_transmissions set expires_at = now() - interval '1 minute' where id = $1", [id]);
    await expectError(q(db, w.ph2User, "select public.rx_open($1)", [id]), /close/);
    await q(db, w.customerA, "select public.rx_expire()");
    expect((await sys(db, "select status from public.prescription_transmissions where id = $1", [id])).rows[0].status).toBe("expiree");
  });
});
