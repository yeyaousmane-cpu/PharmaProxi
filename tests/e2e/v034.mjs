// 0.34 : Suis-je apte ?, suivi après le don, registre des groupes rares, passeport solidaire, espace CNTS.
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
const noOverflow = (p) => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth <= 2);

// Questionnaire (environnement de démonstration : version de travail affichée avec avertissement)
const p = await (await b.newContext({ ...devices["Pixel 7"], locale: "fr-FR" })).newPage();
await p.goto(`${BASE}/don-de-sang/suis-je-apte`, NI);
ok(await wait(p.getByText(/Version de travail, en attente de validation par le CNTS/)), "questionnaire : version de travail signalée");
const answer = async (label) => { await p.getByRole("button", { name: label, exact: true }).click(); };
await answer("De 18 à 65 ans"); await answer("Oui, 50 kg ou plus"); await answer("Oui");
ok(await wait(p.getByText("Quel était le type de votre dernier don ?")), "questions conditionnelles (type de don)");
await answer("Sang total (le plus courant)"); await answer("Il y a 1 à 3 mois");
await p.getByRole("button", { name: /Question précédente/ }).click();
ok(await wait(p.getByText("Quand était votre dernier don ?")), "retour à la question précédente");
await answer("Il y a plus de 4 mois"); await answer("Non / ne me concerne pas"); await answer("Oui");
await answer("Non"); await answer("Oui");
ok(await wait(p.getByText("Vous pouvez envisager de vous présenter dans un centre pour une évaluation médicale.")), "résultat pédagogique « vous pouvez envisager »");
ok(await wait(p.getByText(/ne dit pas si vous êtes apte ou inapte/)), "aucun diagnostic d'aptitude");
await p.getByRole("button", { name: "Recommencer" }).click();
await answer("Moins de 18 ans"); await answer("Moins de 45 kg"); await answer("Jamais"); await answer("Oui"); await answer("Oui"); await answer("Oui"); await answer("Oui");
ok(await wait(p.getByText("Certaines réponses nécessitent de demander conseil à un professionnel.")), "résultat « demander conseil »");
ok(await noOverflow(p), "mobile : pas de débordement (questionnaire)");

// Suivi après le don
const pat = await login("customer");
await pat.goto(`${BASE}/don-de-sang/apres-le-don`, NI);
ok(await wait(pat.getByText(/Perte de connaissance, douleur dans la poitrine/)), "consignes d'urgence visibles");
ok((await pat.locator("a[href*='efs.sante.fr'], a[href*='who.int']").count()) >= 3, "conseils sourcés");
await pat.selectOption("#ek", "vertiges");
await pat.getByRole("button", { name: "Envoyer la déclaration" }).click();
ok(await wait(pat.getByText(/Déclaration EVD-[0-9A-F]{8} transmise au CNTS/)), "déclaration transmise");

// Registre des groupes rares
await pat.goto(`${BASE}/don-de-sang/groupes-rares`, NI);
if (await wait(pat.getByRole("button", { name: "Rejoindre le registre" }), 4000)) {
  await pat.fill("#ph", "Phénotype indiqué par le laboratoire (test e2e)"); await pat.locator("input[name=consent]").check();
  await pat.getByRole("button", { name: "Rejoindre le registre" }).click();
}
ok(await wait(pat.getByText(/En attente de vérification par un centre habilité|Vérifiée/)), "inscription au registre en attente de vérification");

// Passeport
await pat.goto(`${BASE}/don-de-sang/passeport`, NI);
ok(await wait(pat.getByText("Mon parcours de donneur")) && await wait(pat.getByText(/ni un document médical, ni une pièce d'identité officielle/)), "passeport : parcours et mention légale");
if (await wait(pat.getByRole("button", { name: "Activer la version publique", exact: true }), 4000)) await pat.getByRole("button", { name: "Activer la version publique", exact: true }).click();
const link = pat.locator("a[href*='/don-de-sang/passeport/']").first();
ok(await wait(link), "version publique activée");
const href = await link.getAttribute("href");
const anon = await (await b.newContext({ locale: "fr-FR" })).newPage();
await anon.goto(`${BASE}${href}`, NI);
ok(await wait(anon.getByText(/don(s)? de sang validé/)) && !/O\+|Groupe/.test(await anon.locator("main").innerText()), "passeport public sans donnée médicale");
ok(await noOverflow(pat), "mobile : pas de débordement (passeport)");

// Espace CNTS
const adm = await login("admin", { viewport: { width: 1280, height: 900 } });
await adm.goto(`${BASE}/don-de-sang/validation`, NI);
ok(await wait(adm.getByRole("heading", { name: "Déclarations après un don" })) && await wait(adm.getByText("Vertiges").first()), "CNTS : déclaration reçue");
ok(await wait(adm.getByText(/test e2e/)), "CNTS : inscription au registre à vérifier");
await adm.goto(`${BASE}/don-de-sang/validation?groupe=&attente=1#registre`, NI);
ok(await wait(adm.getByText(/Inscription non vérifiée/)), "CNTS : recherche dans le registre");
ok(await wait(adm.getByRole("heading", { name: /Questionnaire « Suis-je apte \? »/ })), "administration : validation du questionnaire");
const nur = await login("nurse");
await nur.goto(`${BASE}/don-de-sang/groupes-rares`, NI);
ok(!(await nur.content()).includes("Espace CNTS"), "entrée « Espace CNTS » cachée aux non-habilités");
await b.close();
console.log(fails ? `\n${fails} échec(s)` : "\nTout est passé");
process.exit(fails ? 1 : 0);
