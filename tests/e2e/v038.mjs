// 0.38 : imagerie médicale (dépôt DICOM chiffré, visionneuse, partage consenti avec un médecin vérifié, révocation).
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
const DCM_PATH = process.env.DCM ?? "/home/claude/pharmaproxi/tests/fixtures/mire-test.dcm";

// Médecin : son code de partage
const doc = await login("doctor1");
await doc.goto(`${BASE}/medecin/imagerie`, NI);
const code = (await doc.locator("strong.font-mono").innerText()).trim();
ok(/^[A-Z]{2}-MD-\d+$/.test(code), `espace médecin : code de partage affiché (${code})`);

// Patient : dépôt DICOM
const pat = await login("customer", devices["Pixel 7"]);
await pat.goto(`${BASE}/ma-sante/dossier/imagerie`, NI);
ok(await wait(pat.getByRole("heading", { name: /Ranger un examen d'imagerie/ })), "dossier : page imagerie");
ok(await noOverflow(pat), "mobile : pas de débordement");
await pat.fill("#ti", "Mire de test e2e");
await pat.selectOption("#mo", "radiographie"); await pat.fill("#bp", "Fantôme");
await pat.setInputFiles("#fi", DCM_PATH);
await pat.getByRole("button", { name: "Ranger dans mon dossier" }).click();
ok(await wait(pat.getByRole("link", { name: "Mire de test e2e" }), 15000), "examen DICOM rangé (chiffré)");
ok(await pat.getByText(/Radiographie · Fantôme/).first().isVisible(), "métadonnées de l'examen affichées");
// format refusé
await pat.reload(NI);
await pat.fill("#ti", "Faux fichier"); await pat.setInputFiles("#fi", { name: "faux.dcm", mimeType: "application/dicom", buffer: Buffer.from("pas un dicom") });
await pat.getByRole("button", { name: "Ranger dans mon dossier" }).click();
ok(await wait(pat.getByText(/Format non accepté : DICOM/)), "fichier non DICOM refusé d'après son contenu");

// Visionneuse
await Promise.all([pat.waitForURL(/\/ma-sante\/dossier\/imagerie\/[0-9a-f-]{36}/), pat.getByRole("link", { name: "Mire de test e2e" }).first().click()]);
ok(await wait(pat.locator("canvas[role=img]"), 15000), "visionneuse : image DICOM dessinée");
const painted = await pat.locator("canvas[role=img]").evaluate((c) => { const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let s = new Set(); for (let i = 0; i < d.length; i += 400) s.add(d[i]); return c.width === 256 && s.size > 10; });
ok(painted, "visionneuse : pixels réels (256 × 256, niveaux de gris variés)");
ok(await pat.getByText("Mire de test SantéProxi").isVisible() && await pat.getByText("12/11/2026").isVisible(), "visionneuse : informations lues dans le fichier");
await pat.getByRole("button", { name: "Inverser" }).click();
ok(await pat.getByRole("button", { name: "Inverser" }).getAttribute("aria-pressed") === "true", "outil d'inversion");
ok(await pat.getByText(/ne remplace pas une console de diagnostic/).isVisible(), "avertissement : pas un outil de diagnostic");

// Partage consenti
await pat.goto(`${BASE}/ma-sante/dossier/imagerie`, NI);
const card = pat.locator("li", { has: pat.getByRole("link", { name: "Mire de test e2e" }) }).first();
await card.getByText("Partager avec un médecin").click();
await card.locator("input[name=doctor_code]").fill(code);
await card.locator("select[name=days]").selectOption("3");
await card.locator("input[name=consent]").check();
await card.getByRole("button", { name: "Partager cet examen" }).click();
ok(await wait(pat.getByText(/Examen partagé \(référence IMG-/)), "partage avec le médecin vérifié");
await pat.reload(NI);
ok(await wait(pat.getByText(/pas encore ouvert/)), "suivi du partage : pas encore ouvert");

// Médecin : ouvre l'examen
await doc.goto(`${BASE}/medecin/imagerie`, NI);
ok(await wait(doc.getByRole("link", { name: "Mire de test e2e" })), "médecin : examen partagé listé");
await Promise.all([doc.waitForURL(/\/medecin\/imagerie\/[0-9a-f-]{36}$/), doc.getByRole("link", { name: "Mire de test e2e" }).first().click()]);
ok(await wait(doc.locator("canvas[role=img]"), 15000), "médecin : visionneuse");
const grantUrl = doc.url();
await pat.reload(NI);
ok(await wait(pat.getByText(/ouvert 1 fois/)), "patient : ouverture enregistrée");
// Un autre compte ne peut pas lire le fichier
const other = await login("doctor2");
const r = await other.request.get(`${grantUrl}/fichier`);
ok(r.status() === 403, "autre médecin : accès refusé au fichier");

// Révocation
await pat.getByRole("button", { name: "Retirer l'accès" }).first().click();
ok(await wait(pat.getByText(/accès retiré/i)), "patient : accès retiré");
const r2 = await doc.request.get(`${grantUrl}/fichier`);
ok(r2.status() === 403, "médecin : fichier inaccessible après révocation");
await doc.goto(grantUrl, NI);
ok(await wait(doc.getByText(/a expiré ou a été retiré/)), "médecin : page indique l'accès retiré");
await b.close();
console.log(fails ? `\n${fails} échec(s)` : "\nTout est passé");
process.exit(fails ? 1 : 0);
