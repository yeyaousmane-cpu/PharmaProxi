// 0.33 : SantéProxi Orientation — recherche par besoin / mot, filtres, fiche, fiabilité, mobile, administration.
import { chromium, devices } from "playwright";
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PW = process.env.DEMO_PASSWORD;
let fails = 0;
const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
const wait = (loc, t = 10000) => loc.first().waitFor({ timeout: t }).then(() => true, () => false);
const NI = { waitUntil: "networkidle" };
const b = await chromium.launch();
const p = await (await b.newContext({ ...devices["Pixel 7"], locale: "fr-FR" })).newPage();
const noOverflow = () => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth <= 2);

await p.goto(`${BASE}/centres-specialises`, NI);
ok(await wait(p.getByRole("heading", { name: "Trouver le bon établissement" })), "page d'orientation affichée");
ok((await p.locator("nav[aria-label=Besoins] a").count()) === 16, "16 besoins proposés");
ok(await noOverflow(), "mobile : pas de débordement (accueil)");

// Les 16 besoins s'ouvrent sans erreur
const codes = await p.locator("nav[aria-label=Besoins] a").evaluateAll((as) => as.map((a) => new URL(a.href).searchParams.get("besoin")));
let allOk = true;
for (const c of codes) { const r = await p.request.get(`${BASE}/centres-specialises?besoin=${c}`); if (!r.ok()) allOk = false; }
ok(allOk, "les 16 catégories répondent");

await p.goto(`${BASE}/centres-specialises?besoin=rein_dialyse`, NI);
ok(await wait(p.getByRole("link", { name: "Centre de dialyse de la Commune IV" })), "dialyse : centre de la Commune IV listé");
ok(await wait(p.getByText("Confirmé par une source").first()), "dialyse : service confirmé par une source signalé");
ok(await wait(p.getByText(/Kayes, Sikasso, Ségou et Mopti/)), "dialyse : note sur les régions");
ok(await wait(p.getByRole("link", { name: "Appeler" }).first()), "bouton Appeler quand un numéro existe");
ok(!(await p.content()).includes("Le Relais"), "structure non établie absente");
ok(await noOverflow(), "mobile : pas de débordement (résultats)");

// Recherche par mot courant
await p.goto(`${BASE}/centres-specialises?q=${encodeURIComponent("insuffisance rénale")}`, NI);
ok(await wait(p.getByText(/besoin « Reins et dialyse »/)), "« insuffisance rénale » → besoin Reins et dialyse");
await p.goto(`${BASE}/centres-specialises?q=Badalabougou`, NI);
ok(await wait(p.getByRole("link", { name: "Golden Life American Hospital" })), "recherche par quartier");

// VIH : aucune liste inventée
await p.goto(`${BASE}/centres-specialises?besoin=vih`, NI);
ok(await wait(p.getByText(/liste officielle actualisée du programme national/)), "VIH : explication, pas de liste inventée");

// Filtre région (Kayes) + type
const kayes = await p.locator("select[name=region] option", { hasText: "Kayes" }).first().getAttribute("value");
await p.goto(`${BASE}/centres-specialises?region=${kayes}&type=hopital`, NI);
ok(await wait(p.getByRole("link", { name: "Hôpital Fousseyni Daou" })), "filtre région + type : hôpital de Kayes");
ok(await wait(p.locator("main li span", { hasText: "Information incomplète" })), "fiche incomplète signalée");

// Fiche détaillée
await p.getByRole("link", { name: "Hôpital Fousseyni Daou" }).first().click(); await p.waitForLoadState("networkidle");
ok(await wait(p.getByText("Information non renseignée").first()), "fiche : champs inconnus « Information non renseignée »");
ok(await wait(p.getByText(/Aucune spécialité n'est encore confirmée/)), "fiche : aucune spécialité attribuée sans confirmation");
await p.goto(`${BASE}/centres-specialises?q=Golden`, NI);
await p.getByRole("link", { name: "Golden Life American Hospital" }).first().click(); await p.waitForLoadState("networkidle");
ok(await wait(p.getByRole("link", { name: /glahospital\.com/ })) && await wait(p.getByText("Hémodialyse ; disponibilité 24 h/24 en cas de besoin urgent selon l'établissement")), "fiche : site officiel et service avec sa source");
ok(await noOverflow(), "mobile : pas de débordement (fiche)");

// Administration
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: "fr-FR" });
const a = await ctx.newPage();
await a.goto(`${BASE}/connexion`); await a.fill("#email", "demo.admin@pharmaproxi.invalid"); await a.fill("#password", PW);
await a.click("button[type=submit]"); await a.waitForURL((u) => !u.pathname.startsWith("/connexion"), { timeout: 20000 });
await a.goto(`${BASE}/admin/centres`, NI);
ok(await wait(a.getByRole("heading", { name: /Fiches de l'annuaire d'orientation/ })), "administration : fiches listées");
const item = a.locator("li", { hasText: "CHU CNOS" }).first();
await item.locator("summary").click();
await item.locator("select[name=reliability]").selectOption("verifie");
await item.getByRole("button", { name: "Enregistrer", exact: true }).click();
ok(await wait(a.getByText(/indiquez comment l'information a été vérifiée/)), "administration : « Vérifié » refusé sans note");
await b.close();
console.log(fails ? `\n${fails} échec(s)` : "\nTout est passé");
process.exit(fails ? 1 : 0);
