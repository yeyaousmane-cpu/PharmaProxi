// 0.28 / 0.29 : passeport santé (lien + QR, consultation enregistrée, retrait), historique des accès,
// rappels de mesure, suivi par un médecin (interrupteur, accord, mesures brutes, note, arrêt), modules de contenu.
import { chromium, devices } from "playwright";
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PW = process.env.DEMO_PASSWORD;
let fails = 0;
const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
const wait = (loc, t = 10000) => loc.first().waitFor({ timeout: t }).then(() => true, () => false);
const b = await chromium.launch();
async function login(role, opts = { viewport: { width: 1280, height: 900 } }) {
  const ctx = await b.newContext({ ...opts, locale: "fr-FR" });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/connexion`); await p.fill("#email", `demo.${role}@pharmaproxi.invalid`); await p.fill("#password", PW);
  await p.click("button[type=submit]"); await p.waitForURL((u) => !u.pathname.startsWith("/connexion"), { timeout: 20000 });
  return p;
}
const NI = { waitUntil: "networkidle" };

// ---------- Patient : mesure, passeport ----------
const pat = await login("customer", devices["Pixel 7"]);
await pat.goto(`${BASE}/ma-sante/mesures`, NI);
await pat.fill("#sy", "148"); await pat.fill("#di", "92");
await pat.getByRole("button", { name: "Enregistrer" }).first().click();
await pat.waitForTimeout(1500);
await pat.goto(`${BASE}/ma-sante/dossier/autorisations`, NI);
ok(await wait(pat.getByRole("heading", { name: /Passeport santé : partager/ })), "page « Partages et accès » ouverte");
ok((await pat.locator("input[name=sections]:checked").count()) === 0, "aucune information cochée d'avance");
await pat.getByRole("button", { name: "Créer le partage" }).click();
ok(await pat.locator("form:invalid").count() > 0 || await wait(pat.getByText(/Choisissez au moins|Cochez la case/), 3000), "partage impossible sans choix ni accord");
await pat.locator("input[name=sections][value=groupe_sanguin]").check();
await pat.locator("input[name=sections][value=mesures]").check();
await pat.fill("input[name=label]", "Dr Test urgences");
await pat.locator("input[name=accord]").check();
await pat.getByRole("button", { name: "Créer le partage" }).click();
ok(await wait(pat.getByText(/Partage PAS-\d{8}-[0-9A-F]{6} créé/)), "partage créé avec référence");
const url = (await pat.getByTestId("share-url").innerText()).trim();
ok(/\/passeport\/[0-9a-f]{64}$/.test(url) && (await pat.locator("[aria-label='QR code du partage'] svg").count()) === 1, "lien et QR code affichés");
const over = await pat.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
ok(over <= 2, "mobile : pas de débordement sur la page des partages");

// ---------- Destinataire non connecté ----------
const anon = await (await b.newContext({ locale: "fr-FR" })).newPage();
const path = new URL(url).pathname;
await anon.goto(BASE + path, NI);
ok(!(await anon.getByText("148/92").count()), "rien n'est révélé avant l'appui sur « Afficher »");
await anon.fill("input[placeholder^='ex. Dr']", "Dr Test, CSRéf");
await anon.getByRole("button", { name: "Afficher les informations" }).click();
ok(await wait(anon.getByText(/148\/92 mmHg/)), "destinataire : mesures brutes affichées");
const body = await anon.locator("main").innerText();
ok(/Groupe sanguin/.test(body) && !/Allergies|Identité|Personne à prévenir/.test(body), "seules les rubriques choisies sont visibles");
ok(!/élevée|hypertension|normale|anormal/i.test(body), "aucune interprétation des mesures");
ok((await anon.locator("meta[name=robots]").getAttribute("content"))?.includes("noindex"), "page non indexable");

// ---------- Patient : historique, notification, retrait ----------
await pat.goto(`${BASE}/ma-sante/dossier/autorisations`, NI);
ok(await wait(pat.getByText(/Consulté 1 fois/)) && await wait(pat.getByRole("cell", { name: /Personne non connectée · Dr Test, CSRéf/ })), "consultation enregistrée et visible dans l'historique des accès");
ok(await wait(pat.getByRole("cell", { name: "Partage créé" })), "création du partage dans l'historique");
pat.on("dialog", (d) => d.accept());
await pat.getByRole("button", { name: "Retirer ce partage" }).click();
const confirm = pat.getByRole("button", { name: /Confirmer|Oui|Retirer/ }).last();
if (await confirm.isVisible().catch(() => false)) await confirm.click().catch(() => {});
ok(await wait(pat.getByRole("heading", { name: "Partages en cours (0)" })) && await wait(pat.getByRole("cell", { name: "Partage retiré" })), "partage retiré par le patient, retrait dans l'historique");
await anon.reload(NI);
await anon.getByRole("button", { name: "Afficher les informations" }).click();
ok(await wait(anon.getByText("Ce partage a été retiré par la personne concernée.")), "lien inutilisable après retrait");
await anon.goto(`${BASE}/passeport/${"0".repeat(64)}`, NI);
await anon.getByRole("button", { name: "Afficher les informations" }).click();
ok(await wait(anon.getByText("Ce lien n'est pas valide.")), "lien inconnu refusé");
await pat.goto(`${BASE}/compte/notifications`, NI).catch(() => {});
ok(/Votre passeport santé a été consulté/.test(await pat.locator("body").innerText()), "patient prévenu de la consultation");

// ---------- Rappels de mesure ----------
await pat.goto(`${BASE}/ma-sante/suivi`, NI);
const tens = pat.locator("div.rounded-xl", { has: pat.locator("input[name=kind][value=tension]") }).first();
await tens.locator("input[name=days][value='1']").check(); await tens.locator("input[name=days][value='4']").check();
await tens.getByRole("button", { name: "Activer le rappel" }).click();
ok(await wait(pat.getByText("Rappel enregistré.")), "rappel de mesure enregistré");
ok(await wait(pat.getByText(/n'est pas encore ouvert : il sera activé avec un partenaire clinique/)), "suivi par un médecin fermé par défaut, annoncé honnêtement");

// ---------- Administration : ouverture du suivi ----------
const adm = await login("admin");
await adm.goto(`${BASE}/admin/suivi`, NI);
await adm.locator("input[name=partenaire]").check();
await adm.getByRole("button", { name: "Ouvrir le suivi par un médecin" }).click();
ok(await wait(adm.getByText("Suivi par un médecin ouvert.")), "administrateur : suivi ouvert après confirmation du partenaire");

// ---------- Patient → médecin ----------
await pat.goto(`${BASE}/ma-sante/suivi`, NI);
await pat.locator("select[name=doctor_id]").selectOption({ index: 1 });
const chosen = (await pat.locator("select[name=doctor_id] option:checked").innerText()).trim();
await pat.fill("input[name=reason]", "Suivi de ma tension");
await pat.locator("form", { hasText: "Demander à un médecin" }).locator("input[name=accord]").check();
await pat.getByRole("button", { name: "Envoyer la demande" }).click();
ok(await wait(pat.getByText(/Demande envoyée/)), `patient : demande de suivi envoyée à ${chosen}`);
const docRole = /Aminata/.test(chosen) ? "doctor1" : "doctor2";
const other = docRole === "doctor1" ? "doctor2" : "doctor1";
const doc = await login(docRole);
await doc.goto(`${BASE}/medecin/suivis`, NI);
ok(await wait(doc.getByText(/motif : Suivi de ma tension/)), "médecin : demande reçue");
ok(!/148/.test(await doc.locator("main").innerText()), "médecin : aucune mesure visible avant acceptation");
await doc.getByRole("button", { name: "Accepter" }).click();
await wait(doc.getByText("Suivi accepté."));
await doc.goto(`${BASE}/medecin/suivis`, NI);
await doc.getByRole("link", { name: /Ouvrir le suivi/ }).click();
ok(await wait(doc.getByRole("cell", { name: /148\/92 mmHg/ })), "médecin : mesures du patient affichées après acceptation");
ok(!/élevée|hypertension artérielle|normale|anormal/i.test(await doc.locator("main").innerText()), "médecin : valeurs sans interprétation");
const followUrl = doc.url();
await doc.fill("#note", "Continuez à noter votre tension deux fois par semaine.");
await doc.getByRole("button", { name: "Envoyer la note" }).click();
ok(await wait(doc.getByText("Note envoyée au patient.")), "médecin : note envoyée");
const doc2 = await login(other);
await doc2.goto(followUrl, NI);
ok(await wait(doc2.getByText(/n'est pas actif ou ne vous est pas destiné/)), "un autre médecin ne peut pas ouvrir ce suivi");
const ph = await login("pharmacist1");
await ph.goto(followUrl, NI);
ok(!/148\/92/.test(await ph.locator("body").innerText()), "un pharmacien ne voit pas les mesures");

// ---------- Patient : note, historique, arrêt ----------
await pat.goto(`${BASE}/ma-sante/suivi`, NI);
ok(await wait(pat.getByText("Continuez à noter votre tension deux fois par semaine.")), "patient : note du médecin reçue");
await pat.goto(`${BASE}/ma-sante/dossier/autorisations`, NI);
ok(await wait(pat.getByRole("cell", { name: "Mesures consultées" })) && await wait(pat.getByRole("cell", { name: "Suivi accepté" })), "patient : consultations du médecin dans l'historique des accès");
await pat.goto(`${BASE}/ma-sante/suivi`, NI);
await pat.getByRole("button", { name: "Arrêter le suivi" }).click();
const c2 = pat.getByRole("button", { name: /Confirmer|Oui/ }).last();
if (await c2.isVisible().catch(() => false)) await c2.click().catch(() => {});
ok(await wait(pat.getByText("Terminé", { exact: true })), "patient : suivi arrêté");
await doc.goto(followUrl, NI);
ok(await wait(doc.getByText(/n'est pas actif ou ne vous est pas destiné/)), "médecin : plus d'accès après l'arrêt par le patient");

// ---------- Modules de contenu ----------
for (const [path, h] of [["/nutrition", "Nutrition"], ["/reeducation", "Rééducation"]]) {
  await anon.goto(BASE + path, NI);
  ok(await wait(anon.getByRole("heading", { name: h, exact: true })) && await wait(anon.getByText(/Aucune fiche n'est encore publiée/)), `${path} : page ouverte, état vide honnête`);
}
await b.close();
console.log(fails ? `${fails} ÉCHEC(S)` : "TOUT EST PASSÉ");
process.exitCode = fails ? 1 : 0;
