/** Questions aux pharmaciens (anonymat, pharmacies vérifiées, publication consentie) et équivalents de médicaments. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildWorld, createTestDb, Db, expectError, hasDb, q, sys, World } from "./helpers";

describe.skipIf(!hasDb)("Questions aux pharmaciens", () => {
  let db: Db;
  let w: World;
  let qid: string;
  beforeAll(async () => { db = await createTestDb(); w = await buildWorld(db); }, 120_000);
  afterAll(async () => db?.close());

  it("question posée, invisible des autres clients, file anonyme pour les pharmaciens", async () => {
    await expectError(q(db, w.customerA, "select public.ask_pharmacist('trop court')"), /15 et 1 000/);
    qid = (await q(db, w.customerA, "select public.ask_pharmacist('Puis-je donner ce sirop à mon enfant de deux ans ?', 'enfant', true) as id")).rows[0].id;
    expect((await q(db, w.customerB, "select count(*)::int n from public.pharmacist_questions")).rows[0].n).toBe(0);
    await expectError(q(db, w.customerB, "select * from public.pharmacist_question_queue()"), /pharmaciens/);
    const queue = (await q(db, w.ph1User, "select * from public.pharmacist_question_queue()")).rows;
    expect(queue).toHaveLength(1);
    expect(Object.keys(queue[0])).not.toContain("user_id");
    for (let i = 0; i < 2; i++) await q(db, w.customerA, "select public.ask_pharmacist('Autre question de test numéro ' || $1)", [String(i)]);
    await expectError(q(db, w.customerA, "select public.ask_pharmacist('Une question de trop pour aujourd''hui')"), /3 questions/);
  });

  it("réponse : nom obligatoire, pharmacie vérifiée, demandeur notifié, publication anonyme", async () => {
    await expectError(q(db, w.customerB, "select public.answer_question($1, $2, 'Réponse illégitime de test')", [qid, w.ph1]), /pharmaciens/);
    await sys(db, "update public.profiles set full_name = null where id = $1", [w.ph1User]);
    await expectError(q(db, w.ph1User, "select public.answer_question($1, $2, 'Oui, à la dose indiquée.')", [qid, w.ph1]), /nom/);
    await sys(db, "update public.profiles set full_name = 'Dr Test Pharma' where id = $1", [w.ph1User]);
    await q(db, w.ph1User, "select public.answer_question($1, $2, 'Montrez la boîte au pharmacien : la dose dépend du poids.')", [qid, w.ph1]);
    expect((await sys(db, "select title, link from public.notifications where user_id = $1 and kind = 'question'", [w.customerA])).rows[0])
      .toEqual({ title: "Un pharmacien a répondu à votre question", link: "/questions-pharmacien/mes-questions" });
    const pub = (await q(db, null, "select question, answers from public.public_pharmacist_questions()")).rows;
    expect(pub).toHaveLength(1);
    expect(pub[0].answers[0]).toMatchObject({ author: "Dr Test Pharma", pharmacy: "Pharmacie Test Un" });
    expect(JSON.stringify(pub)).not.toContain(w.customerA);
    expect((await q(db, w.customerA, "select count(*)::int n from public.pharmacist_answers")).rows[0].n).toBe(1);
  });

  it("modération et suppression par le demandeur", async () => {
    await expectError(q(db, w.customerA, "select public.admin_moderate_question($1, null, true)", [qid]), /administrat|PP403|réservé/i);
    await q(db, w.admin, "select public.admin_moderate_question($1, null, true)", [qid]);
    expect((await q(db, null, "select count(*)::int n from public.public_pharmacist_questions()")).rows[0].n).toBe(0);
    await q(db, w.customerA, "select public.close_my_question($1, true)", [qid]);
    expect((await sys(db, "select count(*)::int n from public.pharmacist_questions where id = $1", [qid])).rows[0].n).toBe(0);
  });

  it("équivalents : même principe actif et dosage, prix des pharmacies vérifiées", async () => {
    const other = (await q(db, w.ph2User, "select public.upsert_catalog_item($1::jsonb) as id", [JSON.stringify({ brand_name: "Générique Paracétamol", active_ingredient: "paracetamol", dosage: "500mg", form: "Comprimé", category_id: w.cat("Médicaments sans ordonnance") })])).rows[0].id;
    await q(db, w.ph2User, "select public.set_inventory($1, $2, 20, 150, true)", [w.ph2, other]);
    const eq = (await q(db, null, "select brand_name, is_same, min_price, pharmacies from public.equivalent_products($1)", [w.para1.catalogId])).rows;
    expect(eq.map((r) => r.brand_name)).toContain("Générique Paracétamol");
    expect(eq.find((r) => r.brand_name === "Générique Paracétamol")).toMatchObject({ min_price: 150, pharmacies: "1", is_same: false });
    const cmp = (await q(db, null, "select ingredient, products, min_price from public.compare_prices('paracetamol')")).rows;
    expect(cmp[0]).toMatchObject({ min_price: 150 });
    expect(Number(cmp[0].products)).toBeGreaterThanOrEqual(2);
  });
});
