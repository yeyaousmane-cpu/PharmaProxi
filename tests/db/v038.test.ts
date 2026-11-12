/** 0.38 : imagerie médicale (DICOM dans le dossier, partage temporaire consenti avec un médecin vérifié, journal et révocation). */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildWorld, createTestDb, createUser, Db, expectError, q, sys, World, hasDb } from "./helpers";

describe.skipIf(!hasDb)("Version 0.38 — imagerie médicale", () => {
  let db: Db; let w: World; let docUser: string; let pendingUser: string; let code: string; let pendingCode: string; let docId: string; let otherDoc: string;
  beforeAll(async () => {
    db = await createTestDb(); w = await buildWorld(db);
    docUser = await createUser(db, "radio38"); pendingUser = await createUser(db, "attente38");
    code = (await sys(db, "insert into public.doctors (user_id, display_name, title, status, is_published, publication_consent_at) values ($1, 'Coulibaly (fictif)', 'Dr', 'verified', true, now()) returning public_code", [docUser])).rows[0].public_code;
    pendingCode = (await sys(db, "insert into public.doctors (user_id, display_name, title, status, is_published, publication_consent_at) values ($1, 'Sidibé (fictif)', 'Dr', 'pending', true, now()) returning public_code", [pendingUser])).rows[0].public_code;
    const person = (await q(db, w.customerA, "select public.record_ensure_self() id")).rows[0].id;
    docId = (await q(db, w.customerA, "insert into public.record_documents (user_id, person_id, title, doc_kind, storage_path, mime, size_bytes, modality, body_part) values ($1, $2, 'Radio thorax', 'imagerie', $3, 'application/dicom', 2048, 'radiographie', 'Thorax') returning id", [w.customerA, person, `${w.customerA}/a.bin`])).rows[0].id;
    otherDoc = (await q(db, w.customerA, "insert into public.record_documents (user_id, person_id, title, doc_kind, storage_path, mime, size_bytes) values ($1, $2, 'Ordonnance', 'ordonnance', $3, 'application/pdf', 1024) returning id", [w.customerA, person, `${w.customerA}/b.bin`])).rows[0].id;
  }, 120_000);
  afterAll(async () => db?.close());

  it("DICOM accepté et métadonnées d'examen ; types inconnus refusés", async () => {
    expect((await q(db, w.customerA, "select mime, modality from public.record_documents where id = $1", [docId])).rows[0]).toEqual({ mime: "application/dicom", modality: "radiographie" });
    await expectError(q(db, w.customerA, "update public.record_documents set modality = 'rayons_x' where id = $1", [docId]), /check constraint/);
  });

  it("partage : médecin vérifié seulement, durée bornée, pas d'ordonnance, rien pour les autres", async () => {
    await expectError(q(db, w.customerA, "select public.imaging_grant($1, $2, 7)", [docId, pendingCode]), /aucun médecin vérifié/);
    await expectError(q(db, w.customerA, "select public.imaging_grant($1, $2, 60)", [docId, code]), /1 à 30 jours/);
    await expectError(q(db, w.customerA, "select public.imaging_grant($1, $2, 7)", [otherDoc, code]), /imagerie/);
    await expectError(q(db, w.customerB, "select public.imaging_grant($1, $2, 7)", [docId, code]), /introuvable/);
    const ref = (await q(db, w.customerA, "select public.imaging_grant($1, lower($2), 7, 'Avis') r", [docId, code])).rows[0].r;
    expect(ref).toMatch(/^IMG-/);
    expect((await sys(db, "select count(*)::int n from public.notifications where user_id = $1 and link = '/medecin/imagerie'", [docUser])).rows[0].n).toBe(1);
    const rows = (await q(db, docUser, "select * from public.imaging_shared_with_me()")).rows;
    expect(rows).toHaveLength(1); expect(rows[0].title).toBe("Radio thorax");
    expect(JSON.stringify(rows[0])).not.toMatch(/storage_path|a\.bin/);
    // le médecin ne voit aucun autre document du dossier
    expect((await q(db, docUser, "select count(*)::int n from public.record_documents")).rows[0].n).toBe(0);
    expect((await q(db, w.customerB, "select count(*)::int n from public.imaging_grants")).rows[0].n).toBe(0);
    expect((await q(db, w.customerB, "select * from public.imaging_shared_with_me()")).rows).toHaveLength(0);
  });

  it("ouverture journalisée et notifiée ; révocation et expiration coupent l'accès", async () => {
    const g = (await q(db, docUser, "select grant_id from public.imaging_shared_with_me()")).rows[0].grant_id;
    await expectError(q(db, w.customerB, "select public.imaging_open($1)", [g]), /expiré, retiré|PP403/);
    expect((await q(db, docUser, "select public.imaging_can_read($1) r", [`${w.customerA}/a.bin`])).rows[0].r).toBe(true);
    expect((await q(db, docUser, "select public.imaging_can_read($1) r", [`${w.customerA}/b.bin`])).rows[0].r).toBe(false);
    expect((await q(db, w.customerB, "select public.imaging_can_read($1) r", [`${w.customerA}/a.bin`])).rows[0].r).toBe(false);
    const o = (await q(db, docUser, "select public.imaging_open($1) o", [g])).rows[0].o;
    expect(o.mime).toBe("application/dicom");
    await q(db, docUser, "select public.imaging_open($1)", [g]);
    expect((await sys(db, "select views from public.imaging_grants where id = $1", [g])).rows[0].views).toBe(2);
    expect((await sys(db, "select count(*)::int n from public.notifications where user_id = $1 and link = '/ma-sante/dossier/imagerie'", [w.customerA])).rows[0].n).toBe(1);
    expect((await sys(db, "select count(*)::int n from public.audit_logs where action = 'imaging.view'")).rows[0].n).toBe(2);
    await expectError(q(db, docUser, "select public.imaging_revoke($1)", [g]), /introuvable/);
    await q(db, w.customerA, "select public.imaging_revoke($1)", [g]);
    await expectError(q(db, docUser, "select public.imaging_open($1)", [g]), /expiré, retiré|PP403/);
    expect((await q(db, docUser, "select public.imaging_can_read($1) r", [`${w.customerA}/a.bin`])).rows[0].r).toBe(false);
    const g2 = (await q(db, w.customerA, "select public.imaging_grant($1, $2, 1) r", [docId, code])).rows[0].r;
    await sys(db, "update public.imaging_grants set expires_at = now() - interval '1 minute' where reference = $1", [g2]);
    expect((await q(db, docUser, "select * from public.imaging_shared_with_me()")).rows).toHaveLength(0);
  });
});
