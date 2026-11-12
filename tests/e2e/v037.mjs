// 0.37 : premiers secours & citoyens sauveteurs (formations, demande d'inscription, badge vérifié par l'organisme, QR public).
import { chromium, devices } from "playwright";
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PW = process.env.DEMO_PASSWORD;
let fails = 0;
const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
const wait = (loc, t = 10000) => loc.first().waitFor({ timeout: t }).then(() => true, () => false);
const NI = { waitUntil: "networkidle" };
const b = await chromium.launch();
async function login(role, opts = devices["Pixel 7"]) {
  const p = await (await b.newContext({ ...opts, locale: "fr-FR" })).newPage();
  await p.goto(`${BASE}/connexion`); await p.fill("#email", `demo.${role}@pharmaproxi.invalid`); await p.fill("#password", PW);
  await p.click("button[type=submit]"); await p.waitForURL((u) => !u.pathname.startsWith("/connexion"), { timeout: 20000 });
  return p;
}
const v = await (await b.newContext({ ...devices["Pixel 7"], locale: "fr-FR" })).newPage();
await v.goto(`${BASE}/premiers-secours`, NI);
ok(await wait(v.getByRole("link", { name: "Apprendre les gestes qui sauvent" })) && await wait(v.getByRole("link", { name: "Trouver une formation près de chez moi" })), "boutons mis en valeur");
ok(await wait(v.getByRole("heading", { name: /Un citoyen formé peut sauver une vie/ })), "campagne permanente");
ok(await wait(v.getByText("Citoyens formés (vérifiés)")) && await wait(v.getByText(/aucun chiffre estimé/)), "compteur calculé sur des données réelles");
ok(await wait(v.getByRole("button", { name: "Afficher ma position à dicter" })) && await wait(v.getByText(/ne remplace pas les services de secours/)), "réflexes d'urgence et localisation");
ok(await v.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth <= 2), "mobile : pas de débordement");
await v.goto(`${BASE}/premiers-secours/formations`, NI);
ok(await wait(v.getByRole("heading", { name: "Croix-Rouge malienne" })) && await wait(v.getByText("Partenaire potentiel — aucun accord signé")), "organisme présenté comme partenaire potentiel");
ok(await wait(v.getByRole("link", { name: /\+223 71 70 19 99/ })) && await wait(v.getByRole("link", { name: /Formulaire officiel/ })), "contacts vérifiés et lien vers le formulaire officiel");
ok(!(await v.locator("img[alt*='logo' i]").count()), "aucun logo d'organisme");

const u = await login("customer");
await u.goto(`${BASE}/premiers-secours/formations`, NI);
const orgId = await u.locator("select[name=organization_id] option", { hasText: "Croix-Rouge malienne" }).getAttribute("value");
await u.selectOption("select[name=organization_id]", orgId);
await u.selectOption("select[name=audience]", "etudiant");
await u.getByRole("button", { name: "Envoyer ma demande" }).click();
ok(await wait(u.getByText(/Demande PS-[0-9A-F]{8} envoyée|déjà une demande/)), "demande d'inscription envoyée");
await u.reload(NI);
ok(await wait(u.getByRole("heading", { name: "Mes demandes" })), "suivi des demandes");
await u.goto(`${BASE}/premiers-secours/badge`, NI);
await u.selectOption("select[name=organization_id]", orgId);
await u.fill("input[name=course_label]", "Premiers secours niveau 1 (test e2e)");
await u.fill("input[name=completed_on]", "2026-10-15");
await u.getByRole("button", { name: "Déclarer ma formation" }).click();
ok(await wait(u.getByText(/délivré seulement après vérification/)), "formation déclarée (badge non automatique)");
await u.reload(NI);
ok(await wait(u.getByText("Formation déclarée, en attente de vérification")), "statut en attente de vérification");

const a = await login("admin", { viewport: { width: 1280, height: 900 } });
await a.goto(`${BASE}/premiers-secours/espace-formateur`, NI);
const form = a.locator("form", { hasText: "Premiers secours niveau 1 (test e2e)" }).first();
ok(await wait(form), "organisme / administration : formation à vérifier");
await form.locator("input[name=expires_on]").fill("2028-10-15");
await form.getByRole("button", { name: "Vérifiée : délivrer le badge" }).click();
ok(await a.locator("form", { hasText: "Premiers secours niveau 1 (test e2e)" }).first().waitFor({ state: "detached", timeout: 10000 }).then(() => true, () => false), "formation vérifiée par l'organisme (retirée de la liste à vérifier)");
await a.goto(`${BASE}/admin/premiers-secours`, NI);
ok(await wait(a.getByRole("heading", { name: "Organismes" })), "administration des organismes et des sessions");

await u.goto(`${BASE}/premiers-secours/badge`, NI);
ok(await wait(u.getByText("Citoyen sauveteur formé").first()) && await wait(u.locator("img[alt='QR code de vérification du badge']")), "badge et QR code");
await u.getByRole("link", { name: "Voir la page de vérification" }).first().click(); await u.waitForLoadState("networkidle");
ok(await wait(u.getByText(/Badge « Citoyen sauveteur formé » valide/)), "vérification publique du badge");
const html = await u.content();
ok(!html.includes("demo.customer") && !/\+223\s?\d/.test(html.replace(/<[^>]+>/g, " ").split("Titulaire")[0] ?? ""), "aucune donnée personnelle sur la page de vérification");
await v.goto(`${BASE}/premiers-secours/badge/${"0".repeat(24)}`, NI);
ok(await wait(v.getByText("Badge introuvable ou retiré")), "badge inconnu : refusé");
await b.close();
console.log(fails ? `\n${fails} échec(s)` : "\nTout est passé");
process.exit(fails ? 1 : 0);
