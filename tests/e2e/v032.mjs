// 0.32 : Mon espace donneur — profil, carte (PNG + QR), distinctions, calendrier, historique, validation, certificat.
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

// ---------- Public ----------
const anon = await (await b.newContext({ ...devices["Pixel 7"], locale: "fr-FR" })).newPage();
await anon.goto(`${BASE}/don-de-sang`, NI);
ok(await wait(anon.getByRole("link", { name: "Ouvrir mon espace donneur" })), "page don de sang : accès à « Mon espace donneur »");
await anon.goto(`${BASE}/don-de-sang/mon-espace`, NI);
ok(await wait(anon.getByRole("link", { name: "Se connecter" })), "espace donneur : connexion proposée aux visiteurs");

// ---------- Donneur (patient de démonstration) ----------
const pat = await login("customer", devices["Pixel 7"]);
await pat.goto(`${BASE}/don-de-sang/mon-espace`, NI);
ok(await wait(pat.getByRole("heading", { name: "Mon espace donneur" })), "espace donneur ouvert");
const card = pat.getByTestId("donor-card");
ok(await wait(card) && /O\+/.test(await card.innerText()) && /DSP-[0-9A-F]{8}/.test(await card.innerText()), "carte : groupe confirmé et identifiant");
ok((await card.locator("svg").count()) >= 1, "carte : QR code affiché");
ok(await wait(pat.getByText("Donneur fidèle").first()), "distinction « Donneur fidèle » (3 dons validés)");
ok(await wait(pat.getByText(/Date indicative de prochain don\. Votre aptitude au don doit être confirmée par un professionnel de santé\./)), "calendrier : mention obligatoire affichée");
ok(await wait(pat.getByText("En attente de validation").first()), "historique : don en attente visible");
ok(await noOverflow(pat), "mobile : pas de débordement");
const png = await pat.request.get(`${BASE}/don-de-sang/mon-espace/carte?partage=1`);
ok(png.ok() && png.headers()["content-type"] === "image/png", "carte téléchargeable en image PNG");
const qrHref = await pat.evaluate(() => [...document.querySelectorAll("a")].map((a) => a.href).find((h) => /\/don-de-sang\/carte\//.test(h)) ?? null);
const html = await pat.content();
const token = (html.match(/don-de-sang\/carte\/([0-9a-f]{32})/) ?? [])[1] ?? (qrHref?.split("/").pop());
const cardPng = await pat.request.get(`${BASE}/don-de-sang/mon-espace/carte?groupe=1`);
ok(cardPng.ok(), "carte avec groupe téléchargeable");

// Déclarer un don
await pat.locator("summary", { hasText: "Enregistrer un don" }).click();
const d = new Date(Date.now() - 5 * 86400_000).toISOString().slice(0, 10);
await pat.fill("#dd", d); await pat.fill("#dc", "Collecte test e2e");
await pat.getByRole("button", { name: "Enregistrer", exact: true }).first().click();
ok(await wait(pat.getByText(/Don DON-\d{8}-[0-9A-F]{5} enregistré|déjà enregistré/)), "don déclaré, en attente de validation");

// ---------- QR code : connexion exigée, pas de groupe pour un tiers ----------
if (token) {
  await anon.goto(`${BASE}/don-de-sang/carte/${token}`, NI);
  ok(anon.url().includes("/connexion"), "QR code : connexion exigée");
  const nur = await login("nurse");
  await nur.goto(`${BASE}/don-de-sang/carte/${token}`, NI);
  ok(await wait(nur.getByText("Carte de donneur authentique")) && !/Groupe sanguin/.test(await nur.locator("main").innerText()), "QR code : tiers connecté — authentique, sans groupe sanguin");
  await nur.goto(`${BASE}/don-de-sang/validation`, NI);
  ok(await wait(nur.getByRole("heading", { name: "Accès refusé" })), "validation refusée à un compte non habilité");
} else ok(false, "jeton de carte trouvé dans la page");

// ---------- Validation par l'administration ----------
const adm = await login("admin");
await adm.goto(`${BASE}/don-de-sang/validation`, NI);
const item = adm.locator("li", { hasText: "Collecte test e2e" }).first();
ok(await wait(item), "validation : don déclaré listé");
await item.getByRole("button", { name: "Valider le don" }).click();
ok(await wait(adm.getByText(/Don validé : le donneur est prévenu/)) || await item.waitFor({ state: "detached", timeout: 8000 }).then(() => true, () => false), "don validé par l'administration");

// ---------- Certificat ----------
await pat.goto(`${BASE}/don-de-sang/mon-espace#certificat`, NI);
await pat.getByRole("button", { name: "Obtenir mon certificat" }).click();
await pat.waitForURL(/\/don-de-sang\/certificat\/CDS-/, { timeout: 15000 }).catch(() => {});
const ref = pat.url().split("/").pop();
ok(/^CDS-[0-9A-F]{10}$/.test(ref) && await wait(pat.getByRole("heading", { name: "Certificat de reconnaissance" })), "certificat émis avec identifiant de vérification");
ok(/4 dons de sang validés/.test(await pat.locator("main").innerText()), "certificat : dons validés seulement (3 + celui validé à l'instant)");
await anon.goto(`${BASE}/don-de-sang/certificat/${ref}`, NI);
ok(await wait(anon.getByRole("heading", { name: "Certificat de reconnaissance" })), "certificat vérifiable sans connexion");
await anon.goto(`${BASE}/don-de-sang/certificat/CDS-0000000000`, NI);
ok(await wait(anon.getByRole("heading", { name: "Certificat introuvable" })), "référence inconnue : certificat introuvable");

await b.close();
console.log(fails ? `\n${fails} échec(s)` : "\nTout est passé");
process.exit(fails ? 1 : 0);
