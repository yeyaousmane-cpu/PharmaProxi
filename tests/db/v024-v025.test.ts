/** 0.24 / 0.25 : numéros d'urgence, consentements et preuves, demandes de droits, journal d'audit chaîné, centre d'aide et tickets. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildWorld, createTestDb, Db, expectError, q, sys, World, hasDb } from "./helpers";

describe.skipIf(!hasDb)("Versions 0.24 et 0.25", () => {
  let db: Db;
  let w: World;
  beforeAll(async () => { db = await createTestDb(); w = await buildWorld(db); }, 120_000);
  afterAll(async () => db?.close());

  it("numéros d'urgence : lecture publique des actifs, écriture réservée à l'administration", async () => {
    const pub = (await q(db, null, "select phone from public.emergency_contacts where country = 'ML' order by sort")).rows.map((r) => r.phone);
    expect(pub).toContain("122");
    expect(pub).not.toContain("15");
    await expectError(q(db, w.customerA, "insert into public.emergency_contacts (name, phone) values ('Pirate', '999')"), /row-level security|permission/);
    await q(db, w.admin, "update public.emergency_contacts set active = false where phone = '145'");
    expect((await q(db, null, "select count(*)::int n from public.emergency_contacts where phone = '145'")).rows[0].n).toBe(0);
  });

  it("consentements : registre en ajout seul, version du texte conservée", async () => {
    await q(db, w.customerA, "select public.set_consent('communications', true)");
    await q(db, w.customerA, "select public.set_consent('communications', true)"); // doublon ignoré
    await sys(db, "update public.consent_purposes set description = description || ' Texte modifié.' where code = 'communications'");
    await q(db, w.customerA, "select public.set_consent('communications', false)");
    const r = (await q(db, w.customerA, "select decision, purpose_version from public.consent_records order by id")).rows;
    expect(r).toEqual([{ decision: "accorde", purpose_version: 1 }, { decision: "retire", purpose_version: 2 }]);
    await expectError(q(db, w.customerA, "select public.set_consent('compte_et_services', false)"), /ne relève pas du consentement/);
    await expectError(sys(db, "update public.consent_records set decision = 'accorde'"), /ne peut pas être modifié/);
    await expectError(sys(db, "delete from public.consent_records"), /ne peut pas être modifié/);
    expect((await q(db, w.customerB, "select count(*)::int n from public.consent_records")).rows[0].n).toBe(0);
    const proof = (await q(db, w.admin, "select decision from public.consent_proof($1)", [w.customerA])).rows;
    expect(proof.length).toBe(2);
    await expectError(q(db, w.customerB, "select * from public.consent_proof($1)", [w.customerA]), /PP403/);
  });

  it("demandes d'exercice des droits : créées par la personne, traitées par l'administration", async () => {
    const id = (await q(db, w.customerA, "select public.create_privacy_request('export', 'test') id")).rows[0].id;
    expect((await q(db, w.customerB, "select count(*)::int n from public.privacy_requests")).rows[0].n).toBe(0);
    await expectError(q(db, w.customerB, "select public.handle_privacy_request($1, 'traitee', 'x')", [id]), /PP403/);
    await q(db, w.admin, "select public.handle_privacy_request($1, 'traitee', 'Fait')", [id]);
    expect((await q(db, w.customerA, "select status, admin_note from public.privacy_requests")).rows[0]).toEqual({ status: "traitee", admin_note: "Fait" });
  });

  it("journal d'audit : chaîné, impossible à modifier, altération détectée", async () => {
    await expectError(sys(db, "update public.audit_logs set action = 'x'"), /ni modifié ni supprimé/);
    await expectError(sys(db, "delete from public.audit_logs"), /ni modifié ni supprimé/);
    const ok = (await q(db, w.admin, "select * from public.audit_verify_chain()")).rows[0];
    expect(Number(ok.checked)).toBeGreaterThan(0);
    expect(ok.broken_at).toBeNull();
    // altération directe (contournement des déclencheurs) : détectée
    await sys(db, "alter table public.audit_logs disable trigger audit_logs_immutable");
    await sys(db, "update public.audit_logs set details = '{\"falsifie\":true}' where id = (select min(id) from public.audit_logs where row_hash is not null)");
    await sys(db, "alter table public.audit_logs enable trigger audit_logs_immutable");
    const bad = (await q(db, w.admin, "select * from public.audit_verify_chain()")).rows[0];
    expect(bad.broken_at).not.toBeNull();
    await expectError(q(db, w.customerA, "select * from public.audit_verify_chain()"), /PP403/);
  });

  it("centre d'aide : recherche tolérante, brouillons cachés, vote unique", async () => {
    expect((await q(db, null, "select slug from public.search_help('mot de pase oublie') limit 1")).rows[0].slug).toBe("mot-de-passe-oublie");
    expect((await q(db, null, "select count(*)::int n from public.search_help('zzqxw')")).rows[0].n).toBe(0);
    await q(db, w.admin, "update public.help_articles set status = 'brouillon' where slug = 'changer-langue'");
    expect((await q(db, null, "select count(*)::int n from public.help_articles where slug = 'changer-langue'")).rows[0].n).toBe(0);
    const voter = "a".repeat(64);
    expect((await q(db, null, "select public.vote_help_article('creer-mon-compte', true, $1) v", [voter])).rows[0].v).toBe(true);
    expect((await q(db, null, "select public.vote_help_article('creer-mon-compte', true, $1) v", [voter])).rows[0].v).toBe(false);
    await expectError(q(db, null, "update public.help_articles set helpful_yes = 999"), /permission denied|row-level/);
  });

  it("tickets : création sans compte, notes internes invisibles, accès limité au demandeur", async () => {
    const ref = (await q(db, null, "select public.create_support_ticket('Awa', 'awa@example.org', null, 'mon-compte', 'Objet test', 'Message de test assez long') r")).rows[0].r;
    expect(ref).toMatch(/^SP-\d{6}$/);
    await expectError(q(db, null, "select public.create_support_ticket('Awa', null, null, null, 'Objet', 'Message assez long ici')"), /e-mail ou un téléphone/);
    await q(db, w.customerA, "select public.create_support_ticket('Client A', null, null, null, 'Ma question', 'Bonjour, une question test')");
    const id = (await q(db, w.customerA, "select id from public.support_tickets")).rows[0].id;
    expect((await q(db, w.customerB, "select count(*)::int n from public.support_tickets")).rows[0].n).toBe(0);
    await q(db, w.admin, "select public.reply_support_ticket($1, 'Réponse publique', false, 'attente_infos', null)", [id]);
    await q(db, w.admin, "select public.reply_support_ticket($1, 'Note interne', true, null, null)", [id]);
    const seen = (await q(db, w.customerA, "select body from public.support_ticket_messages order by id")).rows.map((r) => r.body);
    expect(seen).toEqual(["Bonjour, une question test", "Réponse publique"]);
    expect((await q(db, w.customerA, "select status from public.support_tickets")).rows[0].status).toBe("attente_infos");
    await q(db, w.customerA, "select public.reply_support_ticket($1, 'Voici la précision', false, 'ferme', 'urgente')", [id]);
    expect((await q(db, w.customerA, "select status, priority from public.support_tickets")).rows[0]).toEqual({ status: "en_cours", priority: "normale" });
    await expectError(q(db, w.customerB, "select public.reply_support_ticket($1, 'intrus', false, null, null)", [id]), /introuvable/);
  });
});
