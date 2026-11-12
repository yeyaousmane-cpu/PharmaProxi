// 0.39 : transmission d'ordonnances (patient → pharmacie vérifiée, réponse datée, réservation, retrait, accès coupé).
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
const noOverflow = (p) => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth <= 2);
// Image PNG synthétique (aucune vraie ordonnance)
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAHklEQVR4nGP4z8BAEmIY1TCqYVTDqIZRDaMahqUGAIiN/AFq8pTRAAAAAElFTkSuQmCC", "base64");

const pat = await login("customer", devices["Pixel 7"]);
await pat.goto(`${BASE}/ma-sante/dossier/ordonnances?q=Fleuve`, NI);
ok(await wait(pat.getByRole("heading", { name: /Envoyer une ordonnance à une pharmacie/ })), "page de transmission");
ok(await pat.getByText(/L'ordonnance originale reste à présenter au comptoir/).isVisible(), "rappel : ordonnance originale au comptoir");
ok(await wait(pat.getByText("Pharmacie DÉMO du Fleuve")), "recherche d'une pharmacie vérifiée");
ok(!(await pat.getByText("Pharmacie DÉMO en attente").count()), "pharmacie non vérifiée absente");
ok(await noOverflow(pat), "mobile : pas de débordement");
await pat.getByLabel(/Pharmacie DÉMO du Fleuve/).check();
await pat.setInputFiles("#rxf", { name: "ordonnance.png", mimeType: "image/png", buffer: PNG });
await pat.getByRole("button", { name: "Transmettre l'ordonnance" }).click();
ok(!(await pat.getByText(/Ordonnance transmise/).count()), "rien n'est transmis sans la case de consentement");
await pat.locator("input[name=consent]").check();
await pat.getByRole("button", { name: "Transmettre l'ordonnance" }).click();
ok(await wait(pat.getByText(/Ordonnance transmise \(référence ORD-/), 15000), "ordonnance transmise avec référence");
await pat.reload(NI);
ok(await wait(pat.getByText("Envoyée", { exact: true })), "suivi : envoyée");

// Pharmacie destinataire
const ph = await login("pharmacist1");
await ph.goto(`${BASE}/pharmacien/ordonnances`, NI);
ok(await wait(ph.getByRole("heading", { name: /À traiter \(\d+\)/ })), "pharmacie : boîte de réception");
await Promise.all([ph.waitForURL(/\/pharmacien\/ordonnances\/[0-9a-f-]{36}/), ph.locator("a[href^='/pharmacien/ordonnances/']").first().click()]);
ok(await wait(ph.getByRole("img", { name: /Image de l'examen/ }), 15000), "pharmacie : ordonnance affichée");
const rxUrl = ph.url();
await ph.fill("#l0", "Amoxicilline 500 mg"); await ph.selectOption("#a0", "disponible"); await ph.fill("#q0", "2"); await ph.fill("#p0", "1500");
await ph.fill("#l1", "Paracétamol 1 g"); await ph.selectOption("#a1", "a_commander"); await ph.fill("#d1", "2");
await ph.selectOption("#vh", "12");
await ph.getByRole("button", { name: "Envoyer la réponse" }).click();
ok(await wait(ph.getByText(/Réponse envoyée/)), "pharmacie : réponse datée envoyée");

// Autre pharmacie : aucun accès
const other = await login("pharmacist2");
ok((await other.request.get(`${rxUrl}/fichier`)).status() === 403, "autre pharmacie : fichier refusé");

// Patient : réponse puis réservation
await pat.reload(NI);
ok(await wait(pat.getByText(/Amoxicilline 500 mg/)) && await pat.getByText(/valable jusqu'au/).first().isVisible(), "patient : réponse avec date de validité");
ok(await pat.getByText(/indiqué par la pharmacie/).first().isVisible(), "prix attribué à la pharmacie");
await pat.getByRole("button", { name: "Réserver" }).first().click();
ok(await wait(pat.getByText(/Réservation envoyée|Réservée : gardée/)), "réservation");

// Pharmacie : prête puis retirée
await ph.goto(rxUrl, NI);
await ph.getByRole("button", { name: "Prête au comptoir" }).click();
await ph.reload(NI);
ok(await wait(ph.getByText("Prête au comptoir", { exact: true })), "pharmacie : prête");
ph.once("dialog", (d) => d.accept());
await ph.getByRole("button", { name: /Retirée/ }).click();
ok(await wait(ph.getByText(/Retrait enregistré|Demande close/)), "pharmacie : retrait enregistré");
ok((await ph.request.get(`${rxUrl}/fichier`)).status() === 403, "demande close : fichier inaccessible");
await pat.reload(NI);
ok(await wait(pat.getByText("Retirée", { exact: true })), "patient : statut retirée");
await b.close();
console.log(fails ? `\n${fails} échec(s)` : "\nTout est passé");
process.exit(fails ? 1 : 0);
