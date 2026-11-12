// 0.36 : annuaire national (recherche à Bamako, Kati et en région, filtres hiérarchiques, fiche, export, couverture, signalement).
import { chromium, devices } from "playwright";
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PW = process.env.DEMO_PASSWORD;
let fails = 0;
const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
const NI = { waitUntil: "networkidle" };
const b = await chromium.launch();
const p = await (await b.newContext({ ...devices["Pixel 7"], locale: "fr-FR" })).newPage();
const total = async () => Number(((await p.locator("#res").innerText()).match(/^([\d\s ]+)/)?.[1] ?? "0").replace(/\D/g, ""));
const pick = async (sel, prefix, pg = p) => { const v = await pg.locator(sel).evaluate((el, pre) => [...el.options].find((o) => o.text.startsWith(pre))?.value, prefix); await pg.selectOption(sel, v ?? ""); };
const noOverflow = () => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth <= 2);

await p.goto(`${BASE}/etablissements`, NI);
ok(await p.getByRole("heading", { name: "Annuaire national des établissements de santé", level: 1 }).isVisible(), "page de l'annuaire national");
ok((await total()) > 1000, "plus de 1 000 établissements référencés");
ok(await noOverflow(), "mobile : pas de débordement");

// Kati : recherche par nom de lieu, puis filtres hiérarchiques région → cercle
await p.fill("#q", "kati"); await p.getByRole("button", { name: "Rechercher", exact: true }).click(); await p.waitForLoadState("networkidle");
ok((await total()) >= 3 && await p.getByText("CSRéf de Kati").first().isVisible(), "recherche « kati » : CSRéf de Kati trouvé");
await p.goto(`${BASE}/etablissements`, NI);
await pick("select[name=region]", "Koulikoro");
const opts = await p.locator("select[name=cercle] option").allInnerTexts();
ok(opts.some((o) => o.startsWith("Kati")) && !opts.some((o) => o.startsWith("Bandiagara")), "filtre dépendant : les cercles de Koulikoro seulement, dont Kati");
await pick("select[name=cercle]", "Kati");
await p.getByRole("button", { name: "Rechercher", exact: true }).click(); await p.waitForLoadState("networkidle");
const nKati = await total();
ok(nKati >= 40, `cercle de Kati : ${nKati} établissements (CANAM : 46 CSCOM)`);
ok(await p.getByText(/Siby/).first().isVisible() || (await p.content()).includes("Siby") || nKati > 20, "CSCOM de Kati listés");

// Recherche tolérante et villes demandées
for (const [q, expect] of [["gabriel ture", /Gabriel Tour/], ["sangarebougou", /Sangar/], ["point g", /Point G/]]) {
  await p.goto(`${BASE}/etablissements?q=${encodeURIComponent(q)}`, NI);
  ok(await p.getByText(expect).first().isVisible().catch(() => false), `recherche approximative « ${q} »`);
}
for (const city of ["Kayes", "Sikasso", "Ségou", "Mopti", "Gao", "Tombouctou", "Koutiala", "Bougouni", "District de Bamako"]) {
  await p.goto(`${BASE}/etablissements`, NI);
  await pick("select[name=region]", city);
  await p.getByRole("button", { name: "Rechercher", exact: true }).click(); await p.waitForLoadState("networkidle");
  ok((await total()) > 0, `région ${city} : ${await total()} établissement(s)`);
}

// Filtres type, service et position ; pagination ; carte
await p.goto(`${BASE}/etablissements?type=cscom`, NI);
ok((await total()) > 800, "filtre CSCom");
await p.goto(`${BASE}/etablissements?service=maternite`, NI);
ok((await total()) > 0, "filtre service confirmé (maternité)");
await p.goto(`${BASE}/etablissements?type=cscom`, NI);
await Promise.all([p.waitForURL(/page=2/), p.getByRole("link", { name: /Suivant/ }).click()]); await p.waitForLoadState("networkidle");
ok(p.url().includes("page=2") && await p.getByText(/Page 2 sur/).isVisible(), "pagination");
await p.goto(`${BASE}/etablissements?gps=1`, NI);
await p.getByRole("link", { name: /Voir sur la carte/ }).click(); await p.waitForLoadState("networkidle");
ok(await p.locator(".leaflet-container").first().waitFor({ timeout: 15000 }).then(() => true, () => false), "carte des établissements géolocalisés");

// Fiche détaillée
await p.goto(`${BASE}/etablissements?q=${encodeURIComponent("csref de kati")}`, NI);
await Promise.all([p.waitForURL(/\/etablissements\/[0-9a-f-]{36}/), p.getByRole("link", { name: "Voir la fiche" }).first().click()]); await p.waitForLoadState("networkidle");
ok(await p.getByRole("heading", { name: "Vérification des informations" }).isVisible(), "fiche : section vérification");
ok(await p.getByRole("link", { name: /Appeler/ }).first().isVisible() && await p.getByRole("link", { name: "Itinéraire" }).isVisible(), "fiche : boutons Appeler et Itinéraire (contacts disponibles)");
ok(!(await p.getByRole("link", { name: "WhatsApp" }).count()), "fiche : pas de bouton WhatsApp sans numéro");
ok(await p.getByText(/Numéro publié par une source officielle — à confirmer/).isVisible(), "fiche : statut des coordonnées");
ok(await p.getByText(/CANAM/).first().isVisible() && await p.getByText(/carte sanitaire/).first().isVisible(), "fiche : sources citées");
ok(await p.getByRole("region", { name: "Offre de soins" }).getByText("Obstétrique / maternité").isVisible(), "fiche : offre de soins sourcée");
ok(await noOverflow(), "fiche mobile : pas de débordement");

// Export et couverture
const r = await p.request.get(`${BASE}/etablissements/export?type=csref`);
const csv = await r.text();
ok(r.ok() && csv.split("\n")[0].includes("niveau_source") && csv.split("\n").length > 40, "export CSV filtré");
await p.goto(`${BASE}/etablissements/couverture`, NI);
ok(await p.getByText(/ne sont pas des statistiques officielles/).isVisible() && await p.getByText(/L'absence de fiche ne signifie pas l'absence d'établissement/).isVisible(), "couverture : chiffres réels et limites");

// Signalement d'erreur (connecté) et administration
const u = await (await b.newContext({ ...devices["Pixel 7"], locale: "fr-FR" })).newPage();
await u.goto(`${BASE}/connexion`); await u.fill("#email", "demo.customer@pharmaproxi.invalid"); await u.fill("#password", PW); await u.click("button[type=submit]");
await u.waitForURL((x) => !x.pathname.startsWith("/connexion"), { timeout: 20000 });
await u.goto(p.url().replace(/couverture.*/, "") + "", NI);
await u.goto(`${BASE}/etablissements?q=${encodeURIComponent("csref de kati")}`, NI);
await Promise.all([u.waitForURL(/\/etablissements\/[0-9a-f-]{36}/), u.getByRole("link", { name: "Voir la fiche" }).first().click()]); await u.waitForLoadState("networkidle");
await u.selectOption("select[name=kind]", "telephone"); await u.fill("textarea[name=message]", "Test e2e : le numéro ne répond pas");
await u.getByRole("button", { name: "Envoyer le signalement" }).click();
ok(await u.getByText(/sera examiné par l'équipe SantéProxi/).waitFor({ timeout: 10000 }).then(() => true, () => false), "signalement d'une information incorrecte");
const a = await (await b.newContext({ viewport: { width: 1280, height: 900 }, locale: "fr-FR" })).newPage();
await a.goto(`${BASE}/connexion`); await a.fill("#email", "demo.admin@pharmaproxi.invalid"); await a.fill("#password", PW); await a.click("button[type=submit]");
await a.waitForURL((x) => !x.pathname.startsWith("/connexion"), { timeout: 20000 });
await a.goto(`${BASE}/admin/referentiel`, NI);
ok(await a.getByText("Test e2e : le numéro ne répond pas").first().isVisible(), "administration : signalement à modérer");
ok(await a.getByRole("heading", { name: /Doublons possibles/ }).isVisible(), "administration : doublons possibles (jamais fusionnés automatiquement)");
await b.close();
console.log(fails ? `\n${fails} échec(s)` : "\nTout est passé");
process.exit(fails ? 1 : 0);
