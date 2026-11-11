/** 0.23 : centres spécialisés, statistiques des fiches, lexique, SantéProxi Data, laboratoires (rendez-vous, résultats), documents, scanner, lignes d'écoute, langues. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildWorld, createTestDb, createUser, Db, expectError, hasDb, q, regionId, sys, World } from "./helpers";

describe.skipIf(!hasDb)("Version 0.23", () => {
  let db: Db;
  let w: World;
  let bamako: string;
  let lab: string;
  let nfs: string;
  const email = async (uid: string) => (await sys(db, "select email from auth.users where id = $1", [uid])).rows[0].email as string;
  beforeAll(async () => {
    db = await createTestDb(); w = await buildWorld(db); bamako = await regionId(db);
    lab = (await sys(db, "insert into public.facility_listings (name, kind, region_id, phone, latitude, longitude) values ('Labo 023', 'laboratoire', $1, '+22370000000', 12.6, -8.0) returning id", [bamako])).rows[0].id;
    nfs = (await sys(db, "select id from public.medical_exams where code = 'nfs'")).rows[0].id;
    await q(db, w.admin, "select public.admin_grant_lab($1, $2)", [await email(w.courierUser), lab]);
  }, 120_000);
  afterAll(async () => db?.close());

  it("centres spécialisés : saisis par l'administrateur, lisibles par tous", async () => {
    await expectError(q(db, w.customerA, "insert into public.facility_focus (focus_code, facility_id, source) values ('diabete', $1, 'test')", [lab]), /row-level security/);
    await q(db, w.admin, "insert into public.facility_focus (focus_code, facility_id, source) values ('diabete', $1, 'Appel du 5 nov.')", [lab]);
    const r = (await q(db, null, "select name, source from public.specialized_centres('diabete') where name = 'Labo 023'")).rows;
    expect(r).toEqual([{ name: "Labo 023", source: "Appel du 5 nov." }]);
    expect((await q(db, null, "select count(*)::int n from public.specialized_centres('cancer') where name = 'Labo 023'")).rows[0].n).toBe(0);
  });

  it("statistiques des fiches : comptées anonymement, visibles par l'établissement seulement", async () => {
    for (let i = 0; i < 3; i++) await q(db, null, "select public.track_listing_event('laboratoire', $1, 'view')", [lab]);
    await q(db, null, "select public.track_listing_event('laboratoire', $1, 'call')", [lab]);
    await q(db, null, "select public.track_listing_event('laboratoire', $1, 'piratage')", [lab]);
    const s = (await q(db, w.courierUser, "select public.my_listing_stats('laboratoire', $1) s", [lab])).rows[0].s;
    expect(s.total).toMatchObject({ views: 3, calls: 1 });
    await expectError(q(db, w.customerA, "select public.my_listing_stats('laboratoire', $1)", [lab]), /réservées à l'établissement/);
    await expectError(q(db, w.customerA, "select * from public.listing_daily_stats"), /permission denied/);
  });

  it("lexique : publié seulement avec le nom du relecteur", async () => {
    expect((await sys(db, "select lay_status, lay_text is not null t from public.medical_exams where id = $1", [nfs])).rows[0]).toEqual({ lay_status: "brouillon", t: true });
    await expectError(q(db, w.customerA, "select public.admin_save_lexicon($1, 'Un texte assez long pour être valable.', 'Moi')", [nfs]), /PP403|administrat/i);
    await q(db, w.admin, "select public.admin_save_lexicon($1, 'Compte les globules du sang, prise de sang au bras.', null)", [nfs]);
    expect((await sys(db, "select lay_status from public.medical_exams where id = $1", [nfs])).rows[0].lay_status).toBe("brouillon");
    await q(db, w.admin, "select public.admin_save_lexicon($1, 'Compte les globules du sang, prise de sang au bras.', 'Dr Test, biologiste')", [nfs]);
    expect((await sys(db, "select lay_status, lay_validated_by from public.medical_exams where id = $1", [nfs])).rows[0]).toEqual({ lay_status: "valide", lay_validated_by: "Dr Test, biologiste" });
  });

  it("SantéProxi Data : évolution, carte, communiqués sous convention, validation des données", async () => {
    await expectError(q(db, w.customerA, "select * from public.authority_registry_trend()"), /réservé/);
    await expectError(q(db, w.customerA, "select * from public.authority_map_points()"), /réservé/);
    await q(db, w.admin, "select public.admin_set_authority($1, 'ministere', 'Ministère de la Santé', 'Point focal')", [await email(w.customerB)]);
    expect((await q(db, w.customerB, "select count(*)::int n from public.authority_registry_trend(null, 12)")).rows[0].n).toBe(12);
    expect((await q(db, w.customerB, "select count(*)::int n from public.authority_map_points() where kind = 'laboratoire'")).rows[0].n).toBe(1);
    await expectError(q(db, w.customerB, "select public.authority_publish('Campagne de vaccination', 'La campagne commence lundi dans tous les centres.')"), /convention/);
    await q(db, w.admin, "select public.admin_set_can_publish($1, true)", [w.customerB]);
    await q(db, w.customerB, "select public.authority_publish('Campagne de vaccination', 'La campagne commence lundi dans tous les centres.')");
    const c = (await q(db, null, "select organisation, title from public.official_communiques")).rows;
    expect(c).toEqual([{ organisation: "Ministère de la Santé", title: "Campagne de vaccination" }]);
    const code = (await sys(db, "select public_code from public.facility_listings where id = $1", [lab])).rows[0].public_code;
    await q(db, w.customerB, "select public.authority_validate_data($1, 'a_corriger', 'Adresse à mettre à jour')", [code.toLowerCase()]);
    await expectError(q(db, w.customerB, "select public.authority_validate_data('SP-PH-999999', 'confirme')"), /aucun établissement/);
    expect((await q(db, w.admin, "select count(*)::int n from public.data_validation_reports")).rows[0].n).toBe(1);
    expect((await q(db, w.customerA, "select count(*)::int n from public.data_validation_reports")).rows[0].n).toBe(0);
  });

  it("laboratoire : rendez-vous au laboratoire, résultats seulement avec le consentement du patient", async () => {
    const d = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
    const req = { facility_id: lab, mode: "laboratoire", exam_ids: [nfs], patient_name: "Awa", phone: "+22376000000", preferred_date: d, slot: "matin" };
    await expectError(q(db, w.customerA, "select public.request_home_sampling($1)", [req]), /ne prend pas encore de rendez-vous/);
    await q(db, w.courierUser, "select public.lab_save_options($1, true, 'Lundi au vendredi 7 h – 16 h', true)", [lab]);
    const noConsent = (await q(db, w.customerA, "select public.request_home_sampling($1) id", [req])).rows[0].id;
    expect((await sys(db, "select mode, address from public.home_sampling_requests where id = $1", [noConsent])).rows[0]).toEqual({ mode: "laboratoire", address: null });
    await expectError(q(db, w.customerA, "select public.request_home_sampling($1)", [{ ...req, mode: "domicile" }]), /ne propose pas de prélèvement à domicile/);
    await q(db, w.courierUser, "select public.lab_update_sampling($1, 'prelevee')", [noConsent]);
    await expectError(q(db, w.courierUser, "select public.lab_add_result($1, $2, 'r.pdf', 'application/pdf', 100)", [noConsent, `${lab}/${noConsent}/00000000-0000-4000-8000-000000000000.bin`]), /accepté de recevoir/);
    await expectError(q(db, w.courierUser, "insert into storage.objects (bucket_id, name) values ('lab-results', $1)", [`${lab}/${noConsent}/x.bin`]), /row-level security/);

    const ok = (await q(db, w.customerA, "select public.request_home_sampling($1) id", [{ ...req, results_consent: true }])).rows[0].id;
    await q(db, w.courierUser, "select public.lab_update_sampling($1, 'prelevee')", [ok]);
    const path = `${lab}/${ok}/11111111-1111-4111-8111-111111111111.bin`;
    await q(db, w.courierUser, "insert into storage.objects (bucket_id, name) values ('lab-results', $1)", [path]);
    await expectError(q(db, w.ph1User, "insert into storage.objects (bucket_id, name) values ('lab-results', $1)", [`${lab}/${ok}/22222222-2222-4222-8222-222222222222.bin`]), /row-level security/);
    const rid = (await q(db, w.courierUser, "select public.lab_add_result($1, $2, 'resultat.pdf', 'application/pdf', 1234, 'À montrer au médecin') id", [ok, path])).rows[0].id;
    expect((await sys(db, "select count(*)::int n from public.notifications where user_id = $1 and title like 'Vos résultats%'", [w.customerA])).rows[0].n).toBe(1);
    expect((await q(db, w.customerA, "select count(*)::int n from public.lab_results")).rows[0].n).toBe(1);
    expect((await q(db, w.customerB, "select count(*)::int n from public.lab_results")).rows[0].n).toBe(0);
    expect((await q(db, w.customerA, "select count(*)::int n from storage.objects where bucket_id = 'lab-results'")).rows[0].n).toBe(1);
    expect((await q(db, w.customerB, "select count(*)::int n from storage.objects where bucket_id = 'lab-results'")).rows[0].n).toBe(0);
    await q(db, w.customerA, "select public.mark_result_opened($1)", [rid]);
    expect((await q(db, w.customerA, "select public.delete_lab_result($1) p", [rid])).rows[0].p).toBe(path);
  });

  it("documents personnels : visibles et déposables par le seul titulaire", async () => {
    const me = (await q(db, w.customerA, "select public.record_ensure_self() id")).rows[0].id;
    const path = `${w.customerA}/33333333-3333-4333-8333-333333333333.bin`;
    await q(db, w.customerA, "insert into storage.objects (bucket_id, name) values ('personal-documents', $1)", [path]);
    await expectError(q(db, w.customerB, "insert into storage.objects (bucket_id, name) values ('personal-documents', $1)", [`${w.customerA}/x.bin`]), /row-level security/);
    await q(db, w.customerA, "insert into public.record_documents (person_id, title, doc_kind, storage_path, mime, size_bytes) values ($1, 'Ordonnance', 'ordonnance', $2, 'image/jpeg', 2000)", [me, path]);
    await expectError(q(db, w.customerB, "insert into public.record_documents (person_id, title, storage_path, mime, size_bytes) values ($1, 'Vol', $2, 'image/jpeg', 10)", [me, `${w.customerB}/y.bin`]), /row-level security/);
    expect((await q(db, w.customerB, "select count(*)::int n from public.record_documents")).rows[0].n).toBe(0);
    expect((await q(db, w.customerB, "select count(*)::int n from storage.objects where bucket_id = 'personal-documents'")).rows[0].n).toBe(0);
    expect((await q(db, w.customerA, "select count(*)::int n from public.record_documents")).rows[0].n).toBe(1);
  });

  it("scanner : codes proposés par les utilisateurs, ajoutés après vérification", async () => {
    await expectError(q(db, w.customerA, "select public.suggest_gtin('12AB', $1)", [w.para1.catalogId]), /code-barres invalide/);
    await q(db, w.customerA, "select public.suggest_gtin('3400912345678', $1)", [w.para1.catalogId]);
    expect((await q(db, null, "select count(*)::int n from public.medicine_identifiers where value = '3400912345678'")).rows[0].n).toBe(0);
    const id = (await q(db, w.admin, "select id from public.gtin_suggestions")).rows[0].id;
    await expectError(q(db, w.customerA, "select public.admin_review_gtin($1, true)", [id]), /PP403|administrat/i);
    await q(db, w.admin, "select public.admin_review_gtin($1, true)", [id]);
    expect((await q(db, null, "select catalog_id from public.medicine_identifiers where id_type = 'gtin' and value = '3400912345678'")).rows[0].catalog_id).toBe(w.para1.catalogId);
    await expectError(q(db, w.customerB, "select public.suggest_gtin('3400912345678', $1)", [w.para1.catalogId]), /déjà connu/);
  });

  it("lignes d'écoute et traductions : visibles seulement une fois vérifiées", async () => {
    await expectError(q(db, w.customerA, "insert into public.support_lines (name, phone, source) values ('X', '123', 'moi')"), /row-level security/);
    await q(db, w.admin, "insert into public.support_lines (name, phone, source, active) values ('Ligne test', '80 00 00 00', 'Appel de test', false)");
    expect((await q(db, null, "select count(*)::int n from public.support_lines")).rows[0].n).toBe(0);
    await q(db, w.admin, "insert into public.ui_translations (key, lang, text, status) values ('nav.sos', 'bm', 'Proposition', 'propose')");
    expect((await q(db, null, "select count(*)::int n from public.ui_translations")).rows[0].n).toBe(0);
    await q(db, w.admin, "update public.ui_translations set status = 'valide', validated_by = 'Relecteur' where key = 'nav.sos'");
    expect((await q(db, null, "select count(*)::int n from public.ui_translations")).rows[0].n).toBe(1);
  });

  it("suppression du compte : documents et résultats effacés", async () => {
    const u = await createUser(db, "efface");
    const me = (await q(db, u, "select public.record_ensure_self() id")).rows[0].id;
    await q(db, u, "insert into public.record_documents (person_id, title, storage_path, mime, size_bytes) values ($1, 'Doc', $2, 'application/pdf', 10)", [me, `${u}/z.bin`]);
    await sys(db, "update public.profiles set deleted_at = now() where id = $1", [u]);
    expect((await sys(db, "select count(*)::int n from public.record_documents where user_id = $1", [u])).rows[0].n).toBe(0);
  });
});
