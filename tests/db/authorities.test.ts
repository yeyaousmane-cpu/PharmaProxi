/** Espace Autorités : accès réservé et journalisé, seuil de 10, aucune donnée personnelle ; signalements ; croissance ; campagnes ; avis. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildWorld, createTestDb, Db, expectError, hasDb, q, regionId, sys, World } from "./helpers";

describe.skipIf(!hasDb)("Autorités et signalements", () => {
  let db: Db;
  let w: World;
  let bamako: string;
  beforeAll(async () => {
    db = await createTestDb(); w = await buildWorld(db); bamako = await regionId(db);
    const email = (await sys(db, "select email from auth.users where id = $1", [w.customerB])).rows[0].email;
    await q(db, w.admin, "select public.admin_set_authority($1, 'ministere', 'Ministère de la Santé', 'Point focal')", [email]);
  }, 120_000);
  afterAll(async () => db?.close());

  it("accès : refusé aux utilisateurs ordinaires, journalisé pour l'autorité", async () => {
    await expectError(q(db, w.customerA, "select public.authority_overview()"), /réservé aux autorités/);
    await expectError(q(db, null, "select public.authority_overview()"), /permission denied|connectez/);
    const o = (await q(db, w.customerB, "select public.authority_overview() o")).rows[0].o;
    expect(o.k).toBe(10);
    const log = (await sys(db, "select action, scope from public.authority_access_log where user_id = $1", [w.customerB])).rows;
    expect(log).toContainEqual({ action: "stats:overview", scope: "ministere" });
    expect((await q(db, w.customerB, "select count(*)::int n from public.authority_access_log")).rows[0]?.n ?? 0).toBe(0);
  });

  it("seuil de 10 : moins de 10 recherches = non affiché", async () => {
    await sys(db, "insert into public.search_logs (query_normalized, region_id, result_count, kind) select 'artesunate injectable', $1, 0, 'medicine' from generate_series(1, 12)", [bamako]);
    await sys(db, "insert into public.search_logs (query_normalized, region_id, result_count, kind) select 'traitement rare', $1, 0, 'medicine' from generate_series(1, 4)", [bamako]);
    const rows = (await q(db, w.customerB, "select query, unfound from public.authority_searches($1, null, null, true)", [bamako])).rows;
    expect(rows).toContainEqual({ query: "artesunate injectable", unfound: "12" });
    expect(rows.find((r) => r.query === "traitement rare")).toBeUndefined();
    const trend = (await q(db, w.customerB, "select week, searches from public.authority_trend('artesunate', $1, 4)", [bamako])).rows;
    expect(trend).toHaveLength(4);
    expect(trend.at(-1)!.searches).toBe("12");
    await expectError(q(db, w.customerB, "select * from public.authority_trend('ab')"), /3 lettres/);
    const o = (await q(db, w.customerB, "select public.authority_overview($1) o", [bamako])).rows[0].o;
    expect(o.searches).toBe(16);
    expect(o.unfound_rate).toBe(100);
    expect(o.blood_donors).toBeNull();
  });

  it("le dossier santé et les données personnelles n'entrent jamais dans les statistiques", async () => {
    const src = (await sys(db, "select string_agg(pg_get_functiondef(p.oid), ' ') s from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'authority_%'")).rows[0].s as string;
    for (const t of ["record_items", "record_essentials", "femme_", "treatments", "health_measures", "child_growth", "children"]) expect(src).not.toContain(t);
  });

  it("signalement : accord obligatoire, réservé aux autorités, identité cachée, téléphone seulement si accepté", async () => {
    await expectError(q(db, w.customerA, "select public.submit_drug_report($1)", [{ kind: "suspect", product_name: "Coartem", consent: false }]), /accord/);
    await expectError(q(db, w.customerA, "select public.submit_drug_report($1)", [{ kind: "effet", product_name: "Amoxicilline", consent: true }]), /réaction/);
    const id = (await q(db, w.customerA, "select public.submit_drug_report($1) id", [{ kind: "suspect", reporter_type: "patient", product_name: "Coartem 20/120",
      where_bought: "marche", place_detail: "Marché de Médine", region_id: bamako, price_xof: 500, problems: ["emballage", "prix"], description: "Boîte sans notice", consent: true, contact_ok: false, contact_phone: "+223 70 00 00 00" }])).rows[0].id;
    await q(db, w.customerA, "select public.submit_drug_report($1)", [{ kind: "effet", product_name: "Amoxicilline 500", reaction: "Boutons partout", severity: "grave", consent: true, contact_ok: true, contact_phone: "+223 76 00 00 00" }]);
    expect((await q(db, w.customerA, "select count(*)::int n from public.drug_reports")).rows[0].n).toBe(2);
    expect((await q(db, w.ph1User, "select count(*)::int n from public.drug_reports")).rows[0].n).toBe(0);
    await expectError(q(db, w.customerA, "select * from public.authority_reports()"), /réservé/);
    const list = (await q(db, w.customerB, "select * from public.authority_reports()")).rows;
    expect(list).toHaveLength(2);
    expect(list[0].severity).toBe("grave");                    // les graves en premier
    expect(list[0].contact_phone).toBe("+223 76 00 00 00");
    expect(list.find((r) => r.id === id)!.contact_phone).toBeNull();
    expect(Object.keys(list[0])).not.toContain("reporter_id");
    await q(db, w.customerB, "select public.authority_update_report($1, 'transmis', 'Transmis à la DPM')", [id]);
    expect((await sys(db, "select title from public.notifications where user_id = $1 and kind = 'signalement'", [w.customerA])).rows).toHaveLength(1);
    // Le CNTS ne voit pas les signalements
    const email = (await sys(db, "select email from auth.users where id = $1", [w.ph1User])).rows[0].email;
    await q(db, w.admin, "select public.admin_set_authority($1, 'cnts', 'CNTS')", [email]);
    await expectError(q(db, w.ph1User, "select * from public.authority_reports()"), /réservé/);
    await q(db, w.admin, "select public.admin_set_authority($1, 'cnts', 'CNTS', null, false)", [email]);
    await expectError(q(db, w.ph1User, "select public.authority_overview()"), /réservé/);
  });

  it("croissance : privée, rattachée au carnet de l'enfant", async () => {
    const kid = (await q(db, w.customerA, "insert into public.children (first_name, birth_date, sex) values ('Awa', current_date - 200, 'F') returning id")).rows[0].id;
    await q(db, w.customerA, "insert into public.child_growth (child_id, measured_on, weight_kg, height_cm) values ($1, current_date, 7.1, 65.5)", [kid]);
    expect((await q(db, w.customerB, "select count(*)::int n from public.child_growth")).rows[0].n).toBe(0);
    await expectError(q(db, w.customerB, "insert into public.child_growth (child_id, measured_on, weight_kg) values ($1, current_date - 1, 7)", [kid]), /row-level security/);
    await expectError(q(db, w.customerA, "insert into public.child_growth (child_id, measured_on, weight_kg) values ($1, current_date - 2, 90)", [kid]), /check constraint/);
  });

  it("campagnes : source obligatoire, donneurs prévenus, participants affichés à partir de 10", async () => {
    await sys(db, "insert into public.user_alert_prefs (user_id, blood_alerts, blood_group, region_id) values ($1, true, 'O+', $2)", [w.customerA, bamako]);
    await expectError(q(db, w.customerB, "select public.save_blood_campaign($1)", [{ title: "Collecte", place: "Lycée", starts_on: "2099-01-10" }]), /source officielle/);
    const id = (await q(db, w.customerB, "select public.save_blood_campaign($1) id", [{ title: "Collecte au lycée Askia", place: "Lycée Askia Mohamed", region_id: bamako,
      starts_on: new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10), start_time: "08:00", end_time: "14:00", source_url: "https://cnts.ml/" }])).rows[0].id;
    expect((await sys(db, "select count(*)::int n from public.notifications where user_id = $1 and kind = 'don'", [w.customerA])).rows[0].n).toBe(1);
    await q(db, w.customerB, "select public.save_blood_campaign($1)", [{ id, title: "Collecte au lycée Askia", place: "Lycée Askia Mohamed", starts_on: "2099-01-10", source_url: "https://cnts.ml/" }]);
    expect((await sys(db, "select count(*)::int n from public.notifications where user_id = $1 and kind = 'don'", [w.customerA])).rows[0].n).toBe(1);   // pas deux fois
    await q(db, w.customerA, "insert into public.blood_campaign_attendance (campaign_id) values ($1)", [id]);
    expect((await q(db, null, "select public.campaign_going($1) n", [id])).rows[0].n).toBeNull();
    await expectError(q(db, w.customerA, "select public.save_blood_campaign($1)", [{ title: "x" }]), /réservé/);
  });

  it("avis : anonyme possible, lisible par l'administrateur seulement", async () => {
    await q(db, null, "select public.submit_feedback('/recherche', 'pas_content', 'difficile', 'Je ne trouve pas mon quartier')");
    expect((await q(db, w.customerA, "select count(*)::int n from public.feedback")).rows[0].n).toBe(0);
    expect((await q(db, w.admin, "select count(*)::int n from public.feedback")).rows[0].n).toBe(1);
    await expectError(q(db, null, "select public.submit_feedback('/x', null, 'autre', null)"), /invalide/);
  });

  it("compte supprimé : rôle retiré, signalements gardés sans identité", async () => {
    await sys(db, "update public.profiles set deleted_at = now() where id = $1", [w.customerA]);
    expect((await sys(db, "select count(*)::int n from public.drug_reports where reporter_id is not null or contact_phone is not null")).rows[0].n).toBe(0);
    expect((await sys(db, "select count(*)::int n from public.drug_reports")).rows[0].n).toBe(2);
    expect((await sys(db, "select count(*)::int n from public.child_growth")).rows[0].n).toBe(0);
  });
});
