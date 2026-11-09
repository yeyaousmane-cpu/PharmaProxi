// Tests de bout en bout 0.26 : consentements (accepter, refuser, retirer), historique imprimable, réclamation,
// module conformité (recherche, dossier, export, journal), connexions, favoris, tableau de bord, page publique.
import { chromium, devices } from "playwright";
import { readFile } from "node:fs/promises";
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PW = process.env.DEMO_PASSWORD;
let fails = 0;
const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
const wait = (loc, t = 10000) => loc.waitFor({ timeout: t }).then(() => true, () => false);
const CONFIRM = "Vos préférences de confidentialité ont bien été enregistrées. Vous pouvez les consulter ou les modifier à tout moment depuis votre espace personnel.";
const b = await chromium.launch();
async function login(ctx, role) {
  const p = await ctx.newPage();
  await p.goto(`${BASE}/connexion`); await p.fill("#email", `demo.${role}@pharmaproxi.invalid`); await p.fill("#password", PW);
  await p.click("button[type=submit]"); await p.waitForURL((u) => !u.pathname.startsWith("/connexion"), { timeout: 20000 });
  return p;
}

// ---------- Patient ----------
const pc = await b.newContext({ ...devices["Pixel 7"], locale: "fr-FR" });
const pp = await login(pc, "customer");
await pp.goto(`${BASE}/compte`, { waitUntil: "networkidle" });
ok(await wait(pp.getByRole("heading", { name: /^Bonjour/ })), "tableau de bord patient affiché");
ok(await wait(pp.getByText("Mes favoris")), "rubrique favoris présente");
await pp.goto(`${BASE}/compte/confidentialite`, { waitUntil: "networkidle" });
ok(await wait(pp.getByRole("button", { name: "J'accepte tout" })) && await wait(pp.getByRole("button", { name: "Je refuse tout" })), "boutons Accepter tout / Refuser tout présents");
const acceptBox = await pp.getByRole("button", { name: "J'accepte tout" }).boundingBox();
const refuseBox = await pp.getByRole("button", { name: "Je refuse tout" }).boundingBox();
ok(Math.abs(acceptBox.height - refuseBox.height) < 1 && Math.abs(acceptBox.width - refuseBox.width) < 2, "refus aussi accessible que l'acceptation (même taille)");
ok((await pp.locator("#personnaliser").getByText("Pas encore choisi").count()) >= 4, "aucun choix pré-enregistré");
await pp.getByRole("button", { name: "Je refuse tout" }).click();
ok(await wait(pp.getByText(CONFIRM)), "message de confirmation exact après « Je refuse tout »");
await pp.reload({ waitUntil: "networkidle" });
ok((await pp.locator("#personnaliser").getByText("Refusé", { exact: true }).count()) >= 4, "les refus sont enregistrés");
const card = pp.locator("#personnaliser li", { hasText: "Enquêtes de satisfaction" });
await card.getByRole("button", { name: "J'accepte" }).click();
ok(await wait(pp.getByText(CONFIRM)), "acceptation d'une finalité");
await pp.reload({ waitUntil: "networkidle" });
await pp.locator("#personnaliser li", { hasText: "Enquêtes de satisfaction" }).getByRole("button", { name: "Je refuse" }).click();
await wait(pp.getByText(CONFIRM));
await pp.reload({ waitUntil: "networkidle" });
ok(await wait(pp.locator("#personnaliser li", { hasText: "Enquêtes de satisfaction" }).getByText("Retiré", { exact: true })), "refuser après avoir accepté = retrait");
// historique imprimable
await pp.goto(`${BASE}/compte/confidentialite/historique`, { waitUntil: "networkidle" });
ok(await wait(pp.getByRole("heading", { name: "Historique de mes consentements" })), "historique de consentement téléchargeable/imprimable");
ok((await pp.locator("tbody tr").count()) >= 6 && (await pp.locator("td.font-mono").first().innerText()).length === 64, "historique : événements et empreintes SHA-256");
// réclamation
await pp.goto(`${BASE}/compte/confidentialite`, { waitUntil: "networkidle" });
await pp.getByText("Je n'ai jamais donné ce consentement").click();
await pp.fill("#dm", "Je ne me souviens pas avoir accepté les enquêtes.");
await pp.getByRole("button", { name: "Envoyer la réclamation" }).click();
ok(await wait(pp.getByText(/Réclamation enregistrée \(référence REC-/)), "réclamation enregistrée avec référence");
// connexions
await pp.getByText("Mes dernières connexions").click();
ok(await wait(pp.getByText(/Chrome · Android/).first()), "historique des connexions (appareil détecté)");
// accès refusé au module conformité
await pp.goto(`${BASE}/conformite`, { waitUntil: "networkidle" });
ok(!(await pp.getByRole("heading", { name: "Conformité et registre des consentements" }).count()), "un patient n'accède pas au module conformité");
const r403 = await pp.request.get(`${BASE}/conformite/preuves/export?tout=1`);
ok(r403.status() === 403, "export des preuves refusé à un patient");
// favoris
await pp.goto(`${BASE}/pharmacies`, { waitUntil: "networkidle" });
const firstPharma = await pp.locator("a[href^='/pharmacies/']").first().getAttribute("href");
await pp.goto(BASE + firstPharma, { waitUntil: "networkidle" });
await pp.getByRole("button", { name: "Ajouter aux favoris" }).click();
ok(await wait(pp.getByRole("button", { name: "Dans mes favoris" })), "pharmacie ajoutée aux favoris");
await pp.goto(`${BASE}/compte`, { waitUntil: "networkidle" });
ok(await wait(pp.getByText(/Pharmacie ·/).first()), "le favori apparaît dans le tableau de bord");

// ---------- Administration / conformité ----------
const ac = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: "fr-FR", acceptDownloads: true });
const ap = await login(ac, "admin");
await ap.goto(`${BASE}/conformite`, { waitUntil: "networkidle" });
ok(await wait(ap.getByRole("heading", { name: "Conformité et registre des consentements" })), "module conformité accessible à l'administrateur");
await ap.getByRole("button", { name: "Vérifier maintenant" }).click();
ok(await wait(ap.getByText(/Registre intègre : \d+ preuve/)), "registre des consentements intègre");
await ap.goto(`${BASE}/conformite/preuves?q=demo.customer@pharmaproxi.invalid`, { waitUntil: "networkidle" });
await ap.locator("a[href^='/conformite/preuves?user=']").first().click();
await ap.waitForURL(/user=/);
ok((await ap.locator("tbody tr").count()) >= 6 && await wait(ap.getByText("✓ texte vérifié").first()), "recherche par personne : preuves et vérification d'empreinte");
const [dl] = await Promise.all([ap.waitForEvent("download"), ap.getByRole("link", { name: "Exporter (CSV)" }).click()]);
const csv = await readFile(await dl.path(), "utf8");
ok(csv.includes("empreinte_sha256") && csv.split("\n").length >= 7, "export CSV des preuves");
await ap.getByRole("link", { name: "Dossier de preuve de cette personne" }).click();
ok(await wait(ap.getByText(/Référence PRV-\d{8}-/)) && await wait(ap.getByText(/textes conformes à leurs empreintes/)), "dossier de preuve avec résultat de vérification");
await ap.goto(`${BASE}/conformite/reclamations`, { waitUntil: "networkidle" });
const d = ap.locator("section", { hasText: "Je ne me souviens pas avoir accepté" }).first();
await d.locator("select[name=status]").selectOption("preuve_retrouvee");
await d.locator("textarea[name=report]").fill("Acceptation du 9 novembre retrouvée puis retirée le même jour.");
await d.getByRole("button", { name: "Enregistrer" }).click();
ok(await wait(ap.getByText(/Réclamation mise à jour/)), "réclamation traitée");
await ap.goto(`${BASE}/conformite/journal`, { waitUntil: "networkidle" });
ok(await wait(ap.getByText("Export de preuves").first()) && await wait(ap.getByText("Recherche de preuves").first()), "journal des consultations et exports");
await ap.goto(`${BASE}/conformite/identite`, { waitUntil: "networkidle" });
ok(await wait(ap.getByText(/information\(s\) à compléter/)), "identité du responsable : champs à compléter signalés");
await ap.goto(`${BASE}/conformite/registre`, { waitUntil: "networkidle" });
const reg = ap.locator("details", { hasText: "Création et sécurité des comptes" });
await reg.locator("summary").click();
await reg.locator("select[name=legal_status]").selectOption("valide");
await reg.getByRole("button", { name: "Enregistrer" }).click();
ok(await wait(ap.getByText(/indiquez le nom et la qualité/)), "validation juridique impossible sans nom du valideur");
await ap.screenshot({ path: "/tmp/pp/v026_registre.png", fullPage: false });

// ---------- Patient : suite ----------
await pp.goto(`${BASE}/compte/confidentialite`, { waitUntil: "networkidle" });
await pp.getByText("Je n'ai jamais donné ce consentement").click();
ok(await wait(pp.getByText("Preuve retrouvée").first()), "le patient voit l'issue de sa réclamation");

// ---------- Page publique ----------
const v = await b.newPage();
await v.goto(`${BASE}/votre-sante-vos-donnees`, { waitUntil: "networkidle" });
ok(await wait(v.getByRole("heading", { name: "Qui est responsable de vos données ?" })) && (await v.getByText("À compléter").count()) >= 1, "page publique : responsable du traitement avec mentions « À compléter »");
ok(await wait(v.getByText(/Obligatoire ou facultatif/)), "page publique : données obligatoires et facultatives expliquées");
await b.close();
console.log(fails ? `${fails} ÉCHEC(S)` : "TOUT EST PASSÉ");
process.exitCode = fails ? 1 : 0;
