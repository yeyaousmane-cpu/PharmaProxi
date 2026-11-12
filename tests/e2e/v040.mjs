// 0.40 : collectes proposées par une organisation, validation, créneaux, calendrier, observatoire.
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
const day = new Date(Date.now() + 12 * 86400_000).toISOString().slice(0, 10);
const TITLE = `Collecte e2e ${Date.now() % 100000}`;

const org = await login("customer", devices["Pixel 7"]);
await org.goto(`${BASE}/don-de-sang/collectes/organiser`, NI);
ok(await wait(org.getByText(/Le prélèvement est toujours réalisé par une structure habilitée/)), "organiser : SantéProxi ne prélève pas");
ok(await noOverflow(org), "mobile : pas de débordement");
await org.fill("#on", "Association Démo Solidarité"); await org.fill("#cp", "70 00 00 09"); await org.fill("#ti", TITLE);
const reg = await org.locator("#rg").evaluate((el) => [...el.options].find((o) => o.text === "District de Bamako")?.value);
await org.selectOption("#rg", reg); await org.fill("#pl", "Maison des jeunes, Commune IV"); await org.fill("#da", day);
await org.fill("#st", "08:00"); await org.fill("#et", "10:00"); await org.fill("#cs", "CNTS de Bamako"); await org.selectOption("#ca", "confirme");
await org.selectOption("#sm", "60"); await org.fill("#sc", "1");
await org.locator("input[name=engagement]").check();
await org.getByRole("button", { name: "Envoyer la proposition" }).click();
ok(await wait(org.getByText(/Proposition COL-/), 15000), "proposition envoyée");
const anon = await (await b.newContext({ ...devices["Pixel 7"], locale: "fr-FR" })).newPage();
await anon.goto(`${BASE}/don-de-sang/collectes`, NI);
ok(!(await anon.getByText(TITLE).count()), "non publiée avant validation");

const adm = await login("admin");
await adm.goto(`${BASE}/don-de-sang/collectes/validation`, NI);
const card = adm.locator("li", { hasText: TITLE }).first();
ok(await wait(card), "validation : proposition listée");
await card.getByRole("button", { name: "Valider et publier" }).click();
ok(await wait(adm.getByText(/Collecte validée et publiée|Aucune proposition en attente/)), "validée et publiée");

await anon.goto(`${BASE}/don-de-sang/collectes`, NI);
ok(await wait(anon.getByText(TITLE)), "calendrier : collecte publiée");
await Promise.all([anon.waitForURL(/\/don-de-sang\/collectes\/[0-9a-f-]{36}/), anon.getByText(TITLE).first().click()]);
ok(await anon.getByText(/prélèvements réalisés par/).isVisible() && await anon.getByText(/validée le/).isVisible(), "détail : structure de collecte et validation");
const url = anon.url();

const donor = await login("pharmacist1", devices["Pixel 7"]);
await donor.goto(url, NI);
await donor.getByRole("button", { name: /08:00 · 1 place/ }).click();
await wait(donor.getByText(/Créneau de 08:00 réservé/)); await donor.reload(NI);
ok(await wait(donor.getByRole("button", { name: /08:00 · mon créneau/ })), "créneau réservé");
await org.goto(url, NI);
ok(await wait(org.getByRole("button", { name: /08:00 · complet/ })), "créneau complet pour les autres");
await org.goto(`${BASE}/don-de-sang/collectes/organiser`, NI);
ok(await wait(org.getByText(/1 inscrit\(s\) sur un créneau/)), "organisateur : nombre d'inscrits sans nom");

await anon.goto(`${BASE}/don-de-sang/observatoire`, NI);
ok(await wait(anon.getByText(/Ces chiffres ne sont pas des statistiques officielles/)), "observatoire : avertissement");
ok(await anon.getByText(/moins de 10/).first().isVisible(), "observatoire : petits nombres masqués");
ok(await anon.getByRole("cell", { name: "District de Bamako" }).isVisible(), "observatoire : tableau par région");
ok(await noOverflow(anon), "observatoire mobile : pas de débordement");
await b.close();
console.log(fails ? `\n${fails} échec(s)` : "\nTout est passé");
process.exit(fails ? 1 : 0);
