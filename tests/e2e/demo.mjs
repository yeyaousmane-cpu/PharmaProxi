// Espace de démonstration : connexion de chaque acteur, bon tableau de bord, cloisonnement des rôles,
// envois désactivés, ordinateur et mobile. À lancer sur un serveur démarré avec APP_ENV=demo (sans PP_MFA_OPTIONAL).
import { chromium, devices } from "playwright";
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
let fails = 0;
const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
const b = await chromium.launch();
const ACTORS = { customer: "/compte", doctor1: "/medecin", pharmacist1: "/pharmacien", lab: "/laboratoire", clinic: "/clinique", courier: "/livraison", nurse: "/infirmier", institution: "/autorites", validator: "/redaction-sante", auditor: "/conformite", admin: "/admin" };
const SPACES = ["/medecin", "/pharmacien", "/laboratoire", "/clinique", "/livraison", "/autorites", "/redaction-sante", "/conformite", "/admin"];

async function enter(ctx, key) {
  const p = await ctx.newPage();
  await p.goto(`${BASE}/demo`);
  await p.locator("li", { has: p.locator(`input[name=actor][value=${key}]`) }).getByRole("button", { name: "Accéder à la démonstration" }).click();
  await p.waitForURL((u) => u.pathname !== "/demo", { timeout: 20000 });
  await p.waitForLoadState("networkidle").catch(() => {});
  return p;
}
const h1 = async (p) => (await p.locator("main h1, h1").first().innerText().catch(() => "")).trim();
const bodyText = (p) => p.locator("body").innerText();
const refused = async (p, path) => {
  const u = new URL(p.url());
  if (!u.pathname.startsWith(path)) return true;
  const t = await h1(p);
  if (/^(Accès refusé|Inscription réservée|Devenir livreur|Espace réservé aux autorités|Espace laboratoire)/.test(t)) return true;
  if (path === "/clinique") return !(await p.locator("main a[href^='/clinique/']").evaluateAll((as) => as.some((a) => /\/clinique\/[0-9a-f-]{36}/.test(a.getAttribute("href")))));
  return false;
};

// Page publique de démonstration
{
  const p = await b.newPage();
  await p.goto(`${BASE}/demo`, { waitUntil: "networkidle" });
  ok(await p.getByRole("heading", { name: "Espace de démonstration – Découvrir SantéProxi" }).waitFor({ timeout: 10000 }).then(() => true, () => false), "page « Espace de démonstration » affichée");
  ok((await p.getByRole("button", { name: "Accéder à la démonstration" }).count()) === Object.keys(ACTORS).length, `${Object.keys(ACTORS).length} cartes d'acteurs avec bouton d'accès`);
  ok(await p.getByText("Environnement de démonstration — données fictives").first().isVisible(), "bandeau « démonstration » permanent");
  ok(await p.locator("input[name=actor][value=nurse]").count() === 1, "infirmier : espace de démonstration disponible");
  await p.close();
}

// Chaque acteur : connexion, tableau de bord, puis tentative d'entrer dans les autres espaces
const dash = {};
for (const [key, start] of Object.entries(ACTORS)) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: "fr-FR" });
  const p = await enter(ctx, key);
  const u = new URL(p.url());
  dash[key] = await h1(p);
  ok(u.pathname.startsWith(start) && !(await refused(p, start)), `${key} : connecté et arrivé sur ${start} (« ${dash[key].slice(0, 50)} »)`);
  if (key !== "admin") {
    const leaks = [];
    for (const s of SPACES.filter((x) => x !== start)) {
      await p.goto(BASE + s, { waitUntil: "networkidle" }).catch(() => {}); await p.waitForLoadState("networkidle").catch(() => {});
      if (!(await refused(p, s))) leaks.push(s);
    }
    ok(leaks.length === 0, `${key} : aucun accès aux espaces des autres rôles${leaks.length ? " — ouverts : " + leaks.join(", ") : ""}`);
  }
  await ctx.close();
}

// Données fictives visibles et cohérentes (patient), envois désactivés
{
  const ctx = await b.newContext({ ...devices["Pixel 7"], locale: "fr-FR" });
  const p = await enter(ctx, "customer");
  ok(new URL(p.url()).pathname === "/compte", "mobile : patient connecté sur son espace");
  await p.goto(`${BASE}/compte/notifications`).catch(() => {});
  ok(/\(Démo\) Bienvenue/.test(await bodyText(p)), "patient : notifications fictives visibles");
  await p.goto(`${BASE}/prevention`);
  ok(/\(Démonstration\) Journée fictive de dépistage/.test(await bodyText(p)), "prévention : événements marqués comme fictifs");
  await p.goto(`${BASE}/pharmacies`);
  ok((await p.locator("a[href^='/pharmacies/']").count()) > 0, "pharmacies fictives dans l'annuaire");
  await p.goto(`${BASE}/compte/confidentialite`);
  await p.getByText("Changer mon adresse e-mail").click();
  await p.fill("#ne", "autre@exemple.invalid");
  await p.fill("#np", "Demo-Pass-2026");
  await p.getByRole("button", { name: "Changer l'adresse" }).click();
  ok(await p.getByText(/désactivé en démonstration/).first().waitFor({ timeout: 8000 }).then(() => true, () => false) || /désactivé en démonstration/.test(await bodyText(p)), "changement d'e-mail désactivé (aucun e-mail envoyé)");
  await ctx.close();
  const c2 = await b.newContext({ ...devices["Pixel 7"], locale: "fr-FR" });
  const q = await c2.newPage();
  await q.goto(`${BASE}/inscription`);
  await q.fill("#full_name", "Test Démo"); await q.fill("#email", "nouveau@exemple.invalid"); await q.fill("#password", "Un-Mot-De-Passe-2026!");
  await q.locator("input[name=accept]").check();
  await q.getByRole("button", { name: "Créer mon compte" }).click();
  ok(await q.getByText(/Inscription désactivée dans l'environnement de démonstration/).first().waitFor({ timeout: 8000 }).then(() => true, () => false), "inscription désactivée en démonstration");
  await q.goto(`${BASE}/mot-de-passe-oublie`);
  await q.fill("#email", "demo.customer@pharmaproxi.invalid");
  await q.locator("form button[type=submit]").first().click();
  ok(await q.getByText(/Aucun e-mail n'est envoyé en démonstration/).first().waitFor({ timeout: 8000 }).then(() => true, () => false), "mot de passe oublié : aucun e-mail envoyé");
  await c2.close();
}

// Mobile : chaque professionnel peut aussi entrer depuis un téléphone
for (const key of ["doctor1", "pharmacist1", "lab", "institution", "admin"]) {
  const ctx = await b.newContext({ ...devices["Pixel 7"], locale: "fr-FR" });
  const p = await enter(ctx, key);
  const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(new URL(p.url()).pathname.startsWith(ACTORS[key]) && over <= 2, `mobile : ${key} sur ${ACTORS[key]} sans débordement`);
  await ctx.close();
}
await b.close();
console.log(fails ? `${fails} ÉCHEC(S)` : "TOUT EST PASSÉ");
process.exitCode = fails ? 1 : 0;
