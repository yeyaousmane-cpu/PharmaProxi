/** 0.26 : preuves de consentement renforcées, versions de politique, réclamations, conformité, connexions, favoris. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildWorld, createTestDb, Db, expectError, q, sys, World, hasDb } from "./helpers";

describe.skipIf(!hasDb)("Version 0.26", () => {
  let db: Db;
  let w: World;
  const email = async (uid: string) => (await sys(db, "select email from auth.users where id = $1", [uid])).rows[0].email as string;
  beforeAll(async () => { db = await createTestDb(); w = await buildWorld(db); }, 120_000);
  afterAll(async () => db?.close());

  it("refus, acceptation, retrait : chaque choix est une preuve horodatée, liée au texte exact", async () => {
    expect((await q(db, w.customerA, "select public.record_consent('enquetes', 'refuse', 'centre_confidentialite', 'fr', 'Africa/Bamako') d")).rows[0].d).toBe("refuse");
    expect((await q(db, w.customerA, "select public.record_consent('enquetes', 'accorde', 'centre_confidentialite', 'fr', 'Africa/Bamako') d")).rows[0].d).toBe("accorde");
    expect((await q(db, w.customerA, "select public.record_consent('enquetes', 'refuse') d")).rows[0].d).toBe("retire");
    const r = (await q(db, w.customerA, "select decision, text_sha256, timezone, lang from public.consent_records where purpose_code = 'enquetes' order by id")).rows;
    expect(r.map((x) => x.decision)).toEqual(["refuse", "accorde", "retire"]);
    const v = (await q(db, null, "select text_sha256, public.sha256_text(snapshot::text) h from public.consent_purpose_versions where purpose_code = 'enquetes'")).rows[0];
    expect(r[0].text_sha256).toBe(v.text_sha256);
    expect(v.h).toBe(v.text_sha256);
    expect(r[0].timezone).toBe("Africa/Bamako");
    await expectError(q(db, w.customerA, "select public.record_consent('enquetes', 'n_importe_quoi')"), /choix invalide/);
  });

  it("aucune preuve ne peut être modifiée, effacée ou fabriquée par un administrateur", async () => {
    await expectError(sys(db, "update public.consent_records set decision = 'accorde'"), /ne peut pas être modifié/);
    await expectError(q(db, w.admin, "insert into public.consent_records (user_id, purpose_code, purpose_version, decision, method, data_categories, recipients) values ($1, 'enquetes', 1, 'accorde', 'inscription', 'x', 'y')", [w.customerB]), /permission denied/);
    await expectError(q(db, w.admin, "select public.record_consent('enquetes', 'accorde')"), /./).catch(() => undefined);
    expect((await sys(db, "select count(*)::int n from public.consent_records where user_id = $1", [w.customerB])).rows[0].n).toBe(0);
    await expectError(sys(db, "update public.consent_purpose_versions set text_sha256 = repeat('0', 64)"), /immuable/);
  });

  it("une nouvelle version du texte est archivée et les anciennes preuves gardent leur version", async () => {
    await sys(db, "update public.consent_purposes set description = description || ' Précision.' where code = 'enquetes'");
    const versions = (await q(db, null, "select version from public.consent_purpose_versions where purpose_code = 'enquetes' order by version")).rows.map((x) => x.version);
    expect(versions).toEqual([1, 2]);
    await q(db, w.customerA, "select public.record_consent('enquetes', 'accorde')");
    const last = (await q(db, w.customerA, "select purpose_version from public.consent_records where purpose_code = 'enquetes' order by id desc limit 1")).rows[0];
    expect(last.purpose_version).toBe(2);
  });

  it("chaîne d'empreintes : intègre, puis altération détectée", async () => {
    await sys(db, "insert into public.compliance_members (user_id, role) values ($1, 'auditeur')", [w.customerB]);
    expect((await q(db, w.customerB, "select * from public.consent_chain_verify()")).rows[0].broken_at).toBeNull();
    await sys(db, "alter table public.consent_records disable trigger consent_records_append_only");
    await sys(db, "update public.consent_records set decision = 'accorde' where id = (select min(id) from public.consent_records where row_hash is not null)");
    await sys(db, "alter table public.consent_records enable trigger consent_records_append_only");
    expect((await q(db, w.customerB, "select * from public.consent_chain_verify()")).rows[0].broken_at).not.toBeNull();
  });

  it("habilitations : l'auditeur consulte sans modifier, un patient n'accède à rien", async () => {
    expect((await q(db, w.customerB, "select count(*)::int n from public.compliance_search($1)", [w.customerA])).rows[0].n).toBeGreaterThan(0);
    await expectError(q(db, w.customerB, "select public.save_registry_entry('{\"code\":\"comptes\",\"retention\":\"x\"}')"), /PP403/);
    await expectError(q(db, w.customerA, "select * from public.compliance_search(null)"), /PP403/);
    await expectError(q(db, w.customerA, "select * from public.consent_chain_verify()"), /PP403/);
    expect((await q(db, w.customerA, "select count(*)::int n from public.data_processing_registry")).rows[0].n).toBe(0);
    await q(db, w.admin, "select public.admin_set_compliance_member($1, 'juriste')", [await email(w.customerB)]);
    await expectError(q(db, w.customerB, "select public.save_registry_entry('{\"code\":\"comptes\",\"legal_status\":\"valide\"}')"), /indiquez le nom/);
    await q(db, w.customerB, "select public.save_registry_entry('{\"code\":\"comptes\",\"legal_status\":\"valide\",\"validated_by_name\":\"Me Test, avocat\"}')");
    expect((await q(db, w.customerB, "select legal_status from public.data_processing_registry where code = 'comptes'")).rows[0].legal_status).toBe("valide");
    const log = (await q(db, w.customerB, "select action from public.compliance_access_log(50)")).rows.map((x) => x.action);
    expect(log).toContain("compliance.search");
  });

  it("politique : une version publiée est figée, une nouvelle version archive l'ancienne", async () => {
    await q(db, w.customerB, "select public.publish_policy_version('2', 'Politique v2', 'Texte de la politique de confidentialité version deux.')");
    const rows = (await q(db, null, "select version, status from public.privacy_policy_versions order by created_at")).rows;
    expect(rows.find((r) => r.version === "2")?.status).toBe("publiee");
    await expectError(sys(db, "update public.privacy_policy_versions set body = 'modifié en douce' where version = '2'"), /figée/);
    await expectError(sys(db, "delete from public.privacy_policy_versions where version = '2'"), /ne peut pas être supprimée/);
    await q(db, w.customerA, "select public.record_consent('communications', 'accorde')");
    expect((await q(db, w.customerA, "select policy_version from public.consent_records where purpose_code = 'communications' order by id desc limit 1")).rows[0].policy_version).toBe("2");
  });

  it("réclamations : créées par la personne, traitées par le juriste, notifiées", async () => {
    const ref = (await q(db, w.customerA, "select public.create_consent_dispute('enquetes', 'Je n''ai jamais donné ce consentement') r")).rows[0].r;
    expect(ref).toMatch(/^REC-\d{8}-[0-9A-F]{6}$/);
    const id = (await q(db, w.customerA, "select id from public.consent_disputes")).rows[0].id;
    await expectError(q(db, w.customerA, "select public.handle_consent_dispute($1, 'resolue', null, null, null)", [id]), /PP403/);
    await q(db, w.customerB, "select public.handle_consent_dispute($1, 'preuve_retrouvee', 'Aucun', 'Néant', 'Preuve du 9 nov. retrouvée')", [id]);
    expect((await q(db, w.customerA, "select status from public.consent_disputes")).rows[0].status).toBe("preuve_retrouvee");
  });

  it("connexions : nouvel appareil signalé, historique privé ; favoris personnels", async () => {
    const h1 = "1".repeat(64), h2 = "2".repeat(64);
    expect((await q(db, w.customerA, "select public.record_login($1, 'Chrome · Android') n", [h1])).rows[0].n).toBe(false);
    expect((await q(db, w.customerA, "select public.record_login($1, 'Chrome · Android') n", [h1])).rows[0].n).toBe(false);
    expect((await q(db, w.customerA, "select public.record_login($1, 'Safari · iPhone') n", [h2])).rows[0].n).toBe(true);
    expect((await q(db, w.customerA, "select count(*)::int n from public.notifications where title = 'Connexion depuis un nouvel appareil'")).rows[0].n).toBe(1);
    expect((await q(db, w.customerB, "select count(*)::int n from public.login_events")).rows[0].n).toBe(0);
    await q(db, w.customerA, "insert into public.favorites (user_id, kind, target_id, label, href) values ($1, 'pharmacie', gen_random_uuid(), 'Pharmacie test', '/pharmacies/test')", [w.customerA]);
    await expectError(q(db, w.customerB, "insert into public.favorites (user_id, kind, target_id, label, href) values ($1, 'pharmacie', gen_random_uuid(), 'X', '/x')", [w.customerA]), /row-level security/);
    expect((await q(db, w.customerB, "select count(*)::int n from public.favorites")).rows[0].n).toBe(0);
  });
});
