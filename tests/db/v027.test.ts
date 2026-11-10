/** 0.27 : révision périodique et archivage des fiches, calendrier de prévention sourcé, langue du profil. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildWorld, createTestDb, createUser, Db, expectError, q, sys, World, hasDb } from "./helpers";

describe.skipIf(!hasDb)("Version 0.27", () => {
  let db: Db; let w: World; let editor: string; let validator: string;
  const emailOf = async (id: string) => (await sys(db, "select email from auth.users where id = $1", [id])).rows[0].email as string;
  const article = (over: Record<string, unknown> = {}) => JSON.stringify({
    slug: "stress-au-travail", category_slug: "sante-mentale", kind: "fiche", title: "Stress au travail : repères",
    summary: "Le stress prolongé peut épuiser. Savoir le reconnaître et en parler aide à le prendre en charge.", keywords: "stress burn-out",
    audiences: ["adulte"], recommendation: null, body: { definition: "Réaction de l'organisme à une pression." }, faq: [], myths: [],
    sources: [{ title: "Santé mentale au travail", organization: "OMS", url: "https://www.who.int/exemple", published_on: "2022", accessed_on: "2026-11-10" }], ...over,
  });
  beforeAll(async () => {
    db = await createTestDb(); w = await buildWorld(db);
    editor = await createUser(db, "redac27"); validator = await createUser(db, "valid27");
    await q(db, w.admin, "select public.health_set_staff($1, 'editor', 'Awa Rédactrice', null, true)", [await emailOf(editor)]);
    await q(db, w.admin, "select public.health_set_staff($1, 'validator', 'Dr Oumou Sangaré, psychiatre', 'Ordre des médecins', true)", [await emailOf(validator)]);
  }, 120_000);
  afterAll(async () => db?.close());

  it("validation : date de révision fixée à un an, modifiable par un validateur seulement ; archivage puis sortie en brouillon", async () => {
    const id = (await q(db, editor, "select public.health_save_article($1::jsonb) as id", [article()])).rows[0].id;
    await q(db, editor, "select public.health_submit($1)", [id]);
    await q(db, validator, "select public.health_review($1, 'approve')", [id]);
    const r = (await sys(db, "select next_review_on, (validated_at at time zone 'UTC')::date + 365 as expected from public.health_articles where id = $1", [id])).rows[0];
    expect(String(r.next_review_on)).toBe(String(r.expected));
    await q(db, validator, "select public.health_publish($1, true)", [id]);
    await expectError(q(db, editor, "select public.health_set_review_date($1, current_date + 100)", [id]), /validateurs/);
    await expectError(q(db, validator, "select public.health_set_review_date($1, current_date - 1)", [id]), /entre aujourd/);
    await q(db, validator, "select public.health_set_review_date($1, current_date + 10)", [id]);
    expect((await q(db, validator, "select count(*)::int n from public.health_due_reviews()")).rows[0].n).toBe(1);
    await expectError(q(db, null, "select count(*)::int n from public.health_due_reviews()"), /permission denied/);
    expect((await q(db, w.customerA, "select count(*)::int n from public.health_due_reviews()")).rows[0].n).toBe(0);
    expect((await q(db, null, "select count(*)::int n from public.health_articles where id = $1", [id])).rows[0].n).toBe(1);
    await expectError(q(db, editor, "select public.health_archive($1, true)", [id]), /validateurs/);
    await q(db, validator, "select public.health_archive($1, true)", [id]);
    expect((await q(db, null, "select count(*)::int n from public.health_articles where id = $1", [id])).rows[0].n).toBe(0);
    expect((await sys(db, "select count(*)::int n from public.health_article_history where article_id = $1 and to_status = 'archived'", [id])).rows[0].n).toBe(1);
    await q(db, validator, "select public.health_archive($1, false)", [id]);
    expect((await sys(db, "select status from public.health_articles where id = $1", [id])).rows[0].status).toBe("draft");
  });

  it("prévention : réservé à l'administration, source obligatoire pour publier, brouillon invisible", async () => {
    const ev = (status: string, src = "Ministère de la Santé") => JSON.stringify({ kind: "vaccination", title: "Campagne de vaccination contre la rougeole", description: "", starts_on: "2026-12-01", ends_on: "2026-12-05", region_id: "", place: "", organizer: "Ministère de la Santé", source_name: src, source_url: "", public_concerned: "Enfants de 9 mois à 5 ans", is_free: "true", status });
    await expectError(q(db, w.customerA, "select public.save_prevention_event($1::jsonb)", [ev("publie")]), /administrat/);
    await expectError(q(db, w.admin, "select public.save_prevention_event($1::jsonb)", [ev("publie", " ")]), /source officielle/);
    const draft = (await q(db, w.admin, "select public.save_prevention_event($1::jsonb) id", [ev("brouillon")])).rows[0].id;
    expect((await q(db, null, "select count(*)::int n from public.prevention_events")).rows[0].n).toBe(0);
    await q(db, w.admin, "select public.save_prevention_event($1::jsonb)", [JSON.stringify({ ...JSON.parse(ev("publie")), id: draft })]);
    expect((await q(db, null, "select count(*)::int n from public.prevention_events where status = 'publie'")).rows[0].n).toBe(1);
    await expectError(sys(db, "insert into public.prevention_events (kind, title, starts_on, ends_on, organizer, source_name) values ('campagne', 'Dates inversées', '2026-12-05', '2026-12-01', 'X Y', 'Source')"), /check/);
    expect((await sys(db, "select count(*)::int n from public.audit_logs where action = 'prevention.save'")).rows[0].n).toBe(2);
  });

  it("langue préférée : enregistrée pour soi seulement, valeur contrôlée", async () => {
    await q(db, w.customerA, "select public.set_preferred_lang('ar')");
    expect((await sys(db, "select preferred_lang from public.profiles where id = $1", [w.customerA])).rows[0].preferred_lang).toBe("ar");
    await expectError(q(db, w.customerA, "select public.set_preferred_lang('xx')"), /langue invalide/);
    await expectError(q(db, null, "select public.set_preferred_lang('en')"), /permission denied/);
    expect((await sys(db, "select count(*)::int n from public.profiles where preferred_lang = 'en'")).rows[0].n).toBe(0);
  });
});
