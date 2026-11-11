// 0.31 : espace infirmier (fiche vérifiée, demandes de soins à domicile, accepter/refuser) et médecin traitant (dossier, passeport).
import { chromium, devices } from "playwright";
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PW = process.env.DEMO_PASSWORD;
let fails = 0;
const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
const wait = (loc, t = 10000) => loc.first().waitFor({ timeout: t }).then(() => true, () => false);
const NI = { waitUntil: "networkidle" };
const b = await chromium.launch();
async function login(role, opts = { viewport: { width: 1280, height: 900 } }) {
  const ctx = await b.newContext({ ...opts, locale: "fr-FR" });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/connexion`); await p.fill("#email", `demo.${role}@pharmaproxi.invalid`); await p.fill("#password", PW);
  await p.click("button[type=submit]"); await p.waitForURL((u) => !u.pathname.startsWith("/connexion"), { timeout: 20000 });
  return p;
}
const noOverflow = (p) => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth <= 2);

// ---------- Public : annuaire ----------
const anon = await (await b.newContext({ ...devices["Pixel 7"], locale: "fr-FR" })).newPage();
await anon.goto(`${BASE}/infirmiers`, NI);
ok(await wait(anon.getByText(/Adama Démo/)), "annuaire : infirmier vérifié visible");
ok(!(await anon.content()).includes("DEMO-INF-0001"), "annuaire : numéro d'Ordre non exposé");
ok(await noOverflow(anon), "mobile : pas de débordement sur l'annuaire");
await anon.goto(`${BASE}/professionnels`, NI);
ok(await wait(anon.getByRole("link", { name: "Espace infirmier" })), "page professionnels : accès à l'espace infirmier");

// ---------- Patient : demande ----------
const pat = await login("customer", devices["Pixel 7"]);
await pat.goto(`${BASE}/infirmiers`, NI);
await pat.getByRole("link", { name: /Demander des soins/ }).first().click();
await pat.waitForLoadState("networkidle");
ok(await wait(pat.locator("#ct")), "formulaire de demande ouvert");
await pat.fill("#ar", "Hamdallaye (test)"); await pat.fill("#tel", "+22370000001");
await pat.locator("input[name=accord]").check();
await pat.getByRole("button", { name: "Envoyer la demande" }).click();
ok(await wait(pat.getByText(/Demande SAD-\d{8}-[0-9A-Z]{5} envoyée/)), "demande envoyée avec référence");
await pat.goto(`${BASE}/compte/soins-domicile`, NI);
ok(await wait(pat.getByText(/En attente/)), "patient : demande en attente dans son espace");
ok(await noOverflow(pat), "mobile : pas de débordement sur « Soins à domicile »");

// ---------- Infirmier : accepte ----------
const nur = await login("nurse");
await nur.goto(`${BASE}/infirmier`, NI);
ok(await wait(nur.getByText(/Hamdallaye \(test\)/)), "infirmier : demande reçue");
await nur.getByRole("button", { name: "Accepter" }).first().click();
ok(await wait(nur.getByText(/Demande acceptée/), 4000) || await wait(nur.getByRole("button", { name: "Soins effectués" })), "infirmier : demande acceptée");
await pat.goto(`${BASE}/compte/soins-domicile`, NI);
ok(await wait(pat.getByText(/Acceptée/)), "patient : demande vue comme acceptée");

// ---------- Admin : ne lit pas les demandes, voit la liste des comptes ----------
const adm = await login("admin");
await adm.goto(`${BASE}/admin/infirmiers/comptes`, NI);
ok(await wait(adm.getByText(/Adama Démo/)), "admin : compte infirmier listé");
ok(!(await adm.content()).includes("Hamdallaye (test)"), "admin : contenu des demandes non visible");

// ---------- Médecin traitant ----------
await pat.goto(`${BASE}/ma-sante/dossier/contacts`, NI);
ok(await wait(pat.getByRole("heading", { name: "Mon médecin traitant" })), "dossier : section médecin traitant");
const sel = pat.locator("select[name=doctor_id]").first();
const opt = await sel.locator("option").nth(1).getAttribute("value");
await sel.selectOption(opt);
await pat.locator("input[name=notify_doctor]").first().check();
await pat.locator("form:has(select[name=doctor_id])").getByRole("button", { name: "Enregistrer" }).click();
ok(await wait(pat.getByText("Médecin traitant enregistré."), 4000) || await wait(pat.getByRole("link", { name: "Voir sa fiche et prendre rendez-vous" })), "médecin traitant choisi dans l'annuaire");
await pat.goto(`${BASE}/ma-sante/dossier/contacts`, NI);
ok(await wait(pat.getByText(/Ce médecin a été prévenu/)), "médecin prévenu (nom seulement)");
ok(await noOverflow(pat), "mobile : pas de débordement sur la page contacts");
await pat.goto(`${BASE}/ma-sante/dossier/autorisations`, NI);
ok(await wait(pat.locator("input[name=sections][value=medecin_traitant]")), "passeport : rubrique « Médecin traitant » proposée");

await b.close();
console.log(fails ? `\n${fails} échec(s)` : "\nTout est passé");
process.exit(fails ? 1 : 0);
