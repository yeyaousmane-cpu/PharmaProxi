// 0.35 : SOS Besoin de sang (vérification, mise en relation, signalement), besoins des centres, rendez-vous de don.
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
const stamp = `E2E-${Date.now().toString(36)}`;

// Visiteur : page publique, aucune coordonnée
const v = await (await b.newContext({ ...devices["Pixel 7"], locale: "fr-FR" })).newPage();
await v.goto(`${BASE}/don-de-sang/sos`, NI);
ok(await wait(v.getByRole("heading", { name: "SOS Besoin de sang", level: 1 })), "page SOS publique");
ok(await wait(v.getByText(/Ne versez jamais d'argent/)) && await wait(v.getByText(/Compatibilité théorique ABO\/Rh seulement/)), "avertissements (argent, compatibilité théorique)");
ok(await wait(v.getByText(/Connectez-vous/)), "signalement réservé aux personnes connectées");
ok(await noOverflow(v), "mobile : pas de débordement (SOS)");

// Famille : dépôt d'une demande (non publiée)
const fam = await login("nurse");
await fam.goto(`${BASE}/don-de-sang/sos`, NI);
await fam.selectOption("#bg", "O+"); await fam.fill("#fn", `Hôpital ${stamp}`);
const t = new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 16);
await fam.fill("#na", t); await fam.selectOption("#ur", "critique");
await fam.fill("#cn", "Famille de test"); await fam.fill("#cp", "70 00 00 99");
await fam.locator("input[name=accord]").check();
await fam.getByRole("button", { name: "Transmettre au CNTS pour vérification" }).click();
ok(await wait(fam.getByText(/Demande SOS-\d{8}-[0-9A-F]{5} transmise/)), "demande transmise, en attente de vérification");
await fam.goto(`${BASE}/don-de-sang/sos`, NI);
ok(await wait(fam.getByRole("heading", { name: "Mes demandes" })) && await wait(fam.getByText("En attente de vérification")), "le demandeur voit sa demande et son statut");
await v.reload(NI);
ok(!(await v.content()).includes(stamp), "demande non vérifiée invisible du public");

// CNTS : vérification puis mobilisation
const adm = await login("admin", { viewport: { width: 1280, height: 900 } });
await adm.goto(`${BASE}/don-de-sang/validation#sos`, NI);
ok(await wait(adm.getByRole("heading", { name: /SOS Besoin de sang — demandes à vérifier/ })), "CNTS : liste des demandes à vérifier");
const row = adm.locator("li", { hasText: stamp });
await row.getByRole("link", { name: "Vérifier" }).click(); await adm.waitForLoadState("networkidle");
ok(await wait(adm.getByText("+223 70 00 00 99").or(adm.getByText(/70 00 00 99/))), "CNTS : contact privé visible");
await adm.getByRole("button", { name: "Mettre à jour" }).click();
ok(await wait(adm.getByText(/Statut mis à jour/)), "CNTS : demande vérifiée");
await adm.reload(NI);
await adm.getByRole("button", { name: "Prévenir les donneurs volontaires" }).click();
ok(await wait(adm.getByText(/donneur\(s\) volontaire\(s\) prévenu\(s\)|Aucun nouveau donneur volontaire/)), "CNTS : mise en relation (sans SMS)");
const reqUrl = adm.url();

// Public : la demande vérifiée apparaît, sans numéro
await v.goto(`${BASE}/don-de-sang/sos`, NI);
ok(await wait(v.getByText(`Hôpital ${stamp}`)), "demande vérifiée publiée");
await v.goto(reqUrl, NI);
ok(!(await v.content()).includes("70 00 00 99"), "numéro du demandeur jamais public");

// Donneur : « Je suis disponible », signalement
const don = await login("customer");
await don.goto(reqUrl, NI);
if (await wait(don.getByRole("button", { name: "Je suis disponible", exact: true }), 5000)) {
  await don.getByRole("button", { name: "Je suis disponible", exact: true }).click();
  ok(await wait(don.getByText(/Le demandeur et le CNTS sont prévenus/)), "donneur : disponibilité transmise");
} else ok(await wait(don.getByText(/espace donneur|Vous avez indiqué être disponible/)), "donneur : disponibilité (déjà indiquée ou espace à créer)");
await don.getByText("Signaler une demande suspecte").click();
await don.fill("input[name=reason]", "Test e2e : vérification du signalement");
await don.getByRole("button", { name: "Signaler", exact: true }).click();
ok(await wait(don.getByText(/Signalement transmis au CNTS/)), "signalement d'une demande suspecte");
await fam.goto(reqUrl, NI);
ok(await wait(fam.getByText(/Donneurs qui se sont manifestés/)), "le demandeur voit les donneurs qui se manifestent");
await fam.getByRole("button", { name: "Le besoin est satisfait" }).click();
ok(await wait(fam.getByText("Besoin satisfait")), "le demandeur déclare le besoin satisfait");

// Besoins des centres et rendez-vous (données fictives de démonstration clairement libellées)
await v.goto(`${BASE}/don-de-sang/disponibilites`, NI);
ok(await wait(v.getByText(/niveaux fictifs de démonstration|Aucune information actualisée/)), "besoins des centres : déclarations datées ou « aucune information actualisée »");
ok(await noOverflow(v), "mobile : pas de débordement (besoins)");
await don.goto(`${BASE}/don-de-sang/rendez-vous`, NI);
ok(await wait(don.getByText(/créneaux fictifs de démonstration/)), "créneaux publiés par le centre");
if (await wait(don.getByRole("button", { name: "Réserver ce créneau" }), 4000)) {
  await don.getByRole("button", { name: "Réserver ce créneau" }).first().click();
  ok(await wait(don.getByText(/Rendez-vous RDD-[0-9A-F]{8} réservé|déjà/)), "réservation d'un créneau");
}
await don.reload(NI);
ok(await wait(don.getByRole("heading", { name: "Mes rendez-vous" })), "mes rendez-vous");
ok(!(await don.content()).includes("Publier le créneau"), "publication de créneaux cachée aux donneurs");
await adm.goto(`${BASE}/don-de-sang/rendez-vous`, NI);
ok(await wait(adm.getByRole("heading", { name: /Espace centre : publier un créneau/ })), "CNTS : publication de créneaux");
await b.close();
console.log(fails ? `\n${fails} échec(s)` : "\nTout est passé");
process.exit(fails ? 1 : 0);
