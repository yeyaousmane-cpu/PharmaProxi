/**
 * Santé essentielle : visibilité publique, circuit rédaction → validation → publication,
 * permissions, historique, recherche (synonymes et fautes), signalements.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildWorld, createTestDb, createUser, Db, expectError, hasDb, q, sys, World } from "./helpers";

describe.skipIf(!hasDb)("Santé essentielle", () => {
  let db: Db;
  let w: World;
  let editor: string, validator: string, validator2: string, stranger: string, editorEmail: string;
  const emailOf = async (id: string) => (await sys(db, "select email from auth.users where id = $1", [id])).rows[0].email as string;
  const article = (over: Record<string, unknown> = {}) => JSON.stringify({
    slug: "test-paludisme", category_slug: "maladies-infectieuses", kind: "fiche", title: "Paludisme : les signes à connaître",
    summary: "Le paludisme se transmet par la piqûre de moustique. Une fièvre doit faire consulter rapidement.",
    keywords: "palu malaria fievre moustique", audiences: ["tous"], recommendation: null,
    body: { definition: "Maladie due à un parasite transmis par le moustique.", urgence: "Fièvre chez un enfant : consultez vite.", inconnu: "ignoré" },
    faq: [{ q: "Le palu est-il contagieux ?", r: "Non, il se transmet par le moustique." }], myths: [],
    sources: [{ title: "Fiche paludisme", organization: "OMS", url: "https://www.who.int/exemple", published_on: "2024", accessed_on: "2026-10-29" }],
    ...over,
  });

  beforeAll(async () => {
    db = await createTestDb();
    w = await buildWorld(db);
    editor = await createUser(db, "redacteur");
    validator = await createUser(db, "validateur");
    validator2 = await createUser(db, "validatrice");
    stranger = await createUser(db, "visiteur");
    editorEmail = await emailOf(editor);
    await q(db, w.admin, "select public.health_set_staff($1, 'editor', 'Awa Rédactrice', null, true)", [editorEmail]);
    await q(db, w.admin, "select public.health_set_staff($1, 'validator', 'Dr Ibrahim Keita, médecin généraliste', 'Ordre des médecins n° 1234', true)", [await emailOf(validator)]);
    await q(db, w.admin, "select public.health_set_staff($1, 'validator', 'Dr Fanta Coulibaly, hématologue', null, true)", [await emailOf(validator2)]);
  }, 120_000);
  afterAll(async () => db?.close());

  it("rôles : seule l'administration attribue les rôles ; un compte inconnu est refusé", async () => {
    await expectError(q(db, stranger, "select public.health_set_staff($1, 'validator', 'Moi', null, true)", [editorEmail]), /administrat/);
    await expectError(q(db, w.admin, "select public.health_set_staff('personne@nulle.part', 'editor', 'X Y Z', null, true)"), /aucun compte/);
    await expectError(q(db, stranger, "select public.health_save_article($1::jsonb)", [article()]), /rédacteurs et validateurs/);
  });

  it("circuit complet : brouillon invisible, soumission, validation (pas par l'auteur), publication, modification qui retire du public", async () => {
    const id = (await q(db, editor, "select public.health_save_article($1::jsonb) as id", [article()])).rows[0].id;
    const body = (await sys(db, "select body from public.health_articles where id = $1", [id])).rows[0].body;
    expect(body).toEqual({ definition: "Maladie due à un parasite transmis par le moustique.", urgence: "Fièvre chez un enfant : consultez vite." });
    const visible = async () => (await q(db, null, "select count(*)::int as n from public.health_articles where id = $1", [id])).rows[0].n;
    expect(await visible()).toBe(0);
    expect((await q(db, null, "select count(*)::int as n from public.health_sources")).rows[0].n).toBe(0);
    // Publication impossible avant validation, même par l'administration
    await expectError(q(db, w.admin, "select public.health_publish($1, true)", [id]), /validée par un validateur/);
    await expectError(q(db, editor, "select public.health_review($1, 'approve')", [id]), /validateurs médicaux/);
    await q(db, editor, "select public.health_submit($1)", [id]);
    await expectError(q(db, editor, "select public.health_save_article($1::jsonb)", [article({ id })]), /en cours de validation/);
    await expectError(q(db, validator, "select public.health_review($1, 'changes')", [id]), /expliquez/);
    await q(db, validator, "select public.health_review($1, 'changes', 'Préciser les signes de gravité')", [id]);
    expect((await sys(db, "select count(*)::int as n from public.notifications where user_id = $1 and kind = 'health'", [editor])).rows[0].n).toBe(1);
    await q(db, editor, "select public.health_save_article($1::jsonb)", [article({ id, summary: "Le paludisme se transmet par la piqûre de moustique. Fièvre, frissons : consultez vite." })]);
    await q(db, editor, "select public.health_submit($1)", [id]);
    await q(db, validator, "select public.health_review($1, 'approve')", [id]);
    let a = (await sys(db, "select status, validator_name, validator_credentials, validated_at from public.health_articles where id = $1", [id])).rows[0];
    expect(a.status).toBe("validated");
    expect(a.validator_name).toBe("Dr Ibrahim Keita, médecin généraliste");
    expect(await visible()).toBe(0); // validée mais pas encore publiée
    await expectError(q(db, editor, "select public.health_publish($1, true)", [id]), /validateurs et à l'administration/);
    await q(db, validator2, "select public.health_publish($1, true)", [id]);
    expect(await visible()).toBe(1);
    expect((await q(db, null, "select count(*)::int as n from public.health_sources s join public.health_articles x on x.id = s.article_id where x.id = $1", [id])).rows[0].n).toBe(1);
    // Une modification d'une fiche publiée la retire du public (jamais de contenu non validé affiché comme validé)
    await q(db, editor, "select public.health_save_article($1::jsonb)", [article({ id, title: "Paludisme : signes et prévention" })]);
    a = (await sys(db, "select status, validator_name, validated_at from public.health_articles where id = $1", [id])).rows[0];
    expect(a).toEqual({ status: "draft", validator_name: null, validated_at: null });
    expect(await visible()).toBe(0);
    const hist = (await q(db, editor, "select action from public.health_article_history where article_id = $1 order by id", [id])).rows.map((r) => r.action);
    expect(hist).toEqual(["création", "soumission", "correction demandée", "modification", "soumission", "validation médicale", "publication", "modification"]);
    expect((await q(db, stranger, "select count(*)::int as n from public.health_article_history")).rows[0].n).toBe(0);
  });

  it("un validateur ne valide pas sa propre fiche ; soumission incomplète refusée", async () => {
    const own = (await q(db, validator, "select public.health_save_article($1::jsonb) as id", [article({ slug: "fiche-du-validateur" })])).rows[0].id;
    await q(db, validator, "select public.health_submit($1)", [own]);
    await expectError(q(db, validator, "select public.health_review($1, 'approve')", [own]), /que vous avez rédigée/);
    await q(db, validator2, "select public.health_review($1, 'approve')", [own]);
    const empty = (await q(db, editor, "select public.health_save_article($1::jsonb) as id", [article({ slug: "fiche-vide", summary: "court", sources: [] })])).rows[0].id;
    await expectError(q(db, editor, "select public.health_submit($1)", [empty]), /résumé/);
    await q(db, editor, "select public.health_save_article($1::jsonb)", [article({ id: empty, slug: "fiche-vide" , sources: [] })]);
    await expectError(q(db, editor, "select public.health_submit($1)", [empty]), /au moins une source/);
    await expectError(q(db, editor, "select public.health_save_article($1::jsonb)", [article({ slug: "fiche-vide" })]), /identifiant d'adresse/);
  });

  it("recherche publique : synonymes, faute de frappe, filtres ; sujets en préparation sans contenu", async () => {
    const id = (await q(db, editor, "select public.health_save_article($1::jsonb) as id", [article({ slug: "drepano-test", category_slug: "maladies-hereditaires", title: "Drépanocytose",
      summary: "Maladie héréditaire des globules rouges, transmise par les deux parents.", keywords: "drepano sickle anemie falciforme as ss", audiences: ["couple"] })])).rows[0].id;
    await q(db, editor, "select public.health_submit($1)", [id]);
    await q(db, validator, "select public.health_review($1, 'approve')", [id]);
    await q(db, validator, "select public.health_publish($1, true)", [id]);
    const s = (t: string, extra = "") => q(db, null, `select slug from public.health_search($1${extra})`, [t]).then((r) => r.rows.map((x) => x.slug));
    expect(await s("drépanocytose")).toEqual(["drepano-test"]);
    expect(await s("sickle")).toEqual(["drepano-test"]); // synonyme
    expect(await s("drepanocytos")).toEqual(["drepano-test"]); // faute
    expect(await s("hémoglobine")).toEqual([]);
    expect(await s("drepano", ", 'maladies-infectieuses'")).toEqual([]);
    expect((await q(db, null, "select slug from public.health_search(null, null, 'couple')")).rows.map((x) => x.slug)).toEqual(["drepano-test"]);
    const up = (await q(db, null, "select * from public.health_upcoming('maladies-infectieuses')")).rows;
    expect(up.map((x) => x.title)).toContain("Paludisme : signes et prévention");
    expect(Object.keys(up[0])).toEqual(["title", "status"]);
  });

  it("signalement public d'une information obsolète, traité par l'équipe", async () => {
    const id = (await sys(db, "select id from public.health_articles where slug = 'drepano-test'")).rows[0].id;
    await expectError(q(db, null, "select public.health_report($1, 'court')", [id]), /10 caractères/);
    await q(db, null, "select public.health_report($1, 'Le lien vers la source ne fonctionne plus.')", [id]);
    expect((await q(db, stranger, "select count(*)::int as n from public.health_reports")).rows[0].n).toBe(0);
    const r = (await q(db, editor, "select id from public.health_reports")).rows[0].id;
    await q(db, editor, "select public.health_close_report($1)", [r]);
    const draft = (await sys(db, "select id from public.health_articles where slug = 'fiche-vide'")).rows[0].id;
    await expectError(q(db, null, "select public.health_report($1, 'Brouillon non publié signalé')", [draft]), /introuvable/);
  });

  it("fiches de départ « Avant le mariage » : 15 brouillons, aucune visible du public", async () => {
    await sys(db, readFileSync(join(__dirname, "../../supabase/content/sante-avant-mariage-brouillons.sql"), "utf8"));
    const n = (await sys(db, "select count(*)::int as n, count(*) filter (where status = 'draft')::int as d from public.health_articles a join public.health_categories c on c.id = a.category_id where c.slug = 'mariage'")).rows[0];
    expect(n).toEqual({ n: 15, d: 15 });
    expect((await q(db, null, "select count(*)::int as n from public.health_search(null, 'mariage')")).rows[0].n).toBe(0);
    expect((await q(db, null, "select count(*)::int as n from public.health_upcoming('mariage')")).rows[0].n).toBe(15);
    const noSource = (await sys(db, "select count(*)::int as n from public.health_articles a where not exists (select 1 from public.health_sources s where s.article_id = a.id) and a.slug like 'avant-mariage-%'")).rows[0].n;
    expect(noSource).toBe(0);
  });
});
