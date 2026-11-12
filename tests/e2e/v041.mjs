// 0.41 : orientation par niveau, établissement partenaire (conditions d'accès, état de service, rendez-vous), couverture.
import { chromium, devices } from "playwright";
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PW = process.env.DEMO_PASSWORD;
let fails = 0;
const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
const wait = (loc, t = 10000) => loc.first().waitFor({ timeout: t }).then(() => true, () => false);
const NI = { waitUntil: "networkidle" };
const b = await chromium.launch();
async function login(role, opts = { viewport: { width: 1280, height: 900 } }) {
  const p = await (await b.newContext({ ...opts, locale: "fr-FR" })).newPage();
  await p.goto(`${BASE}/connexion`); await p.fill("#email", `demo.${role}@pharmaproxi.invalid`); await p.fill("#password", PW);
  await p.click("button[type=submit]"); await p.waitForURL((u) => !u.pathname.startsWith("/connexion"), { timeout: 20000 });
  return p;
}
const pick = async (pg, sel, prefix) => { const v = await pg.locator(sel).evaluate((el, pre) => [...el.options].find((o) => o.text.startsWith(pre))?.value, prefix); await pg.selectOption(sel, v ?? ""); };
const noOverflow = (p) => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth <= 2);

// Orientation
const anon = await (await b.newContext({ ...devices["Pixel 7"], locale: "fr-FR" })).newPage();
await anon.goto(`${BASE}/orientation`, NI);
ok(await wait(anon.getByRole("heading", { name: "Où me faire soigner ?" })) && await anon.getByText(/Urgence grave/).isVisible(), "orientation : page et rappel urgence");
await pick(anon, "select[name=region]", "Koulikoro"); await pick(anon, "select[name=cercle]", "Kati");
await anon.getByRole("button", { name: "Voir les structures" }).click(); await anon.waitForLoadState("networkidle");
ok(await wait(anon.getByRole("heading", { name: /Premier contact : CSCom/ })) && await anon.getByRole("link", { name: "CSRéf de Kati", exact: true }).first().isVisible(), "orientation : CSCom puis CSRéf de Kati");
ok(await anon.getByRole("link", { name: "CHU du Point G", exact: true }).isVisible(), "orientation : niveau national");
ok(await anon.getByText(/HeRAMS Mali/).isVisible(), "orientation : source citée");
ok(await noOverflow(anon), "mobile : pas de débordement");

// Administration : désignation d'un membre partenaire
const adm = await login("admin");
await adm.goto(`${BASE}/etablissements?q=${encodeURIComponent("csref de kati")}`, NI);
await Promise.all([adm.waitForURL(/\/etablissements\/[0-9a-f-]{36}/), adm.locator("li, article", { has: adm.getByText("CSRéf de Kati", { exact: true }) }).getByRole("link", { name: "Voir la fiche" }).first().click()]);
const fiche = adm.url();
const form = adm.locator("form", { hasText: "Membre partenaire" });
await form.locator("input[name=email]").fill("demo.pharmacist2@pharmaproxi.invalid"); await form.locator("input[name=role]").fill("Secrétariat");
await form.locator("input[name=note]").fill("Test e2e : appel au standard");
await form.getByRole("button", { name: "Enregistrer" }).click();
ok(await wait(adm.getByText(/Membre partenaire désigné/)), "administration : membre partenaire désigné");

// Établissement : conditions d'accès et état de service
const st = await login("pharmacist2");
await st.goto(`${BASE}/etablissements/espace`, NI);
ok(await wait(st.getByRole("heading", { name: /Espace établissement : CSRéf de Kati/ })), "espace établissement");
const tarif = st.locator("form", { hasText: "Tarif de consultation" });
await tarif.locator("input[name=value]").fill("Ticket : 1 000 FCFA"); await tarif.getByRole("button", { name: "Enregistrer" }).click();
ok(await wait(st.getByText(/Information enregistrée et datée/)), "conditions d'accès enregistrées");
await st.fill("#sv-s", "Maternité"); await st.selectOption("#sv-t", "sature"); await st.selectOption("#sv-h", "6"); await st.fill("#sv-m", "Test e2e");
await st.getByRole("button", { name: "Publier" }).click();
ok(await wait(st.getByText(/État du service publié/)), "état de service publié");

// Patient : fiche puis demande
const pat = await login("customer", devices["Pixel 7"]);
await pat.goto(fiche, NI);
ok(await wait(pat.getByText("Ticket : 1 000 FCFA")) && await pat.getByText(/Indiqué par l'établissement le .* tarif indicatif/).isVisible(), "fiche : tarif indicatif daté et sourcé");
ok(await pat.getByText("Saturé").isVisible() && await pat.getByText(/valable jusqu'au/).first().isVisible(), "fiche : état de service avec échéance");
await pat.locator("#rdv input[name=service]").fill("Consultation prénatale"); await pat.locator("#rdv input[name=preferred]").fill("Lundi matin");
await pat.getByRole("button", { name: "Envoyer la demande" }).click();
ok(await wait(pat.getByText(/Demande RDV-/)), "demande de rendez-vous envoyée");

await st.reload(NI);
ok(await wait(st.getByText("Consultation prénatale")) && await st.getByText(/téléphone non partagé/).first().isVisible(), "établissement : demande reçue, téléphone non partagé");
const when = new Date(Date.now() + 2 * 86400_000).toISOString().slice(0, 11) + "08:30";
const card = st.locator("li", { hasText: "Consultation prénatale" }).first();
await card.locator("input[name=at]").fill(when);
await card.getByRole("button", { name: "Proposer ce créneau" }).click();
ok(await wait(st.getByText(/Créneau proposé/)), "créneau proposé");
await pat.goto(`${BASE}/compte/rendez-vous-etablissements`, NI);
await pat.getByRole("button", { name: "Confirmer ce créneau" }).click();
ok(await wait(pat.getByText(/Rendez-vous confirmé|Confirmé/)), "patient : rendez-vous confirmé");

// Autorités
await adm.goto(`${BASE}/autorites/territoire`, NI);
ok(await wait(adm.getByText(/ne sont pas des statistiques officielles/)) && await adm.getByRole("cell", { name: "Kati", exact: true }).isVisible(), "autorités : couverture territoriale");
await b.close();
console.log(fails ? `\n${fails} échec(s)` : "\nTout est passé");
process.exit(fails ? 1 : 0);
