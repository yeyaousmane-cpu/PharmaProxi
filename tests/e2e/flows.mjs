/**
 * Parcours de bout en bout dans un vrai navigateur (Chromium) contre une
 * application démarrée avec les données de démonstration.
 *   BASE_URL=http://localhost:3000 CHROME_PATH=/chemin/chromium DEMO_PASSWORD=... node tests/e2e/flows.mjs
 * Produit des captures d'écran mobiles dans tests/e2e/screenshots/.
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { execSync as execSyncCp } from "node:child_process";
const execSyncText = (cmd) => execSyncCp(cmd).toString().trim();

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

// Les limites anti-abus sont partagées et conservées en base : on remet les
// compteurs à zéro avant chaque exécution (sinon les inscriptions répétées du
// banc de test depuis la même adresse IP finissent bloquées, comme prévu).
import { existsSync, readFileSync } from "node:fs";
for (const f of [".env.local", ".env"]) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
if (process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const r = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rate_limit_events?key=neq.__none__`, {
    method: "DELETE", headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!r.ok) console.log("  (impossible de réinitialiser les limites anti-abus :", r.status, ")");
}
const PW = process.env.DEMO_PASSWORD;
const SHOTS = new URL("./screenshots/", import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });
const NI = { waitUntil: "networkidle" };
const mail = (r) => `demo.${r}@pharmaproxi.invalid`;

let passed = 0;
const failures = [];
let current = null; // page active, capturée en cas d'échec
async function step(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failures.push(name);
    console.log(`  ✗ ${name}\n      ${String(e.message).split("\n")[0]}`);
    if (current && process.env.E2E_DEBUG) {
      await current.screenshot({ path: `${SHOTS}echec-${failures.length}.png`, fullPage: true }).catch(() => {});
      console.log(`      url=${current.url()}\n      ${(await current.locator("main").innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 400)}`);
    }
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
});
/**
 * Action utilisateur avec vérification de l'état enregistré.
 * Après chaque action, la page est rechargée pour contrôler que l'effet est bien
 * persisté côté serveur. Si l'interface n'affiche pas le résultat sans rechargement,
 * c'est compté comme un « blocage » et le parcours échoue à la fin (voir l'historique
 * dans docs/ETAT-DES-FONCTIONNALITES.md : défaut corrigé par la migration vers Next.js 16).
 */
let reloads = 0;
async function act(page, click, verify) {
  await click();
  if (!(await verify().waitFor({ timeout: 8000 }).then(() => true, () => false))) { reloads++; console.log("      ⚠ blocage (action) :", page.url()); }
  // Rechargement systématique : vérifie que l'effet est bien enregistré côté serveur
  // (après la fin des échanges en cours, pour ne pas interrompre une réponse)
  await page.waitForLoadState("networkidle");
  await page.reload(NI);
  await verify().waitFor({ timeout: 10000 });
}

const pageErrors = [];
const _newContext = browser.newContext.bind(browser);
async function newCtx(opts) {
  const ctx = await _newContext(opts);
  ctx.on("console", (m) => m.type() === "error" && !/ERR_TUNNEL|ERR_NAME_NOT_RESOLVED|openstreetmap|Service Worker/.test(m.text()) && pageErrors.push(`${m.text()} (${m.location()?.url ?? ""})`));
  ctx.on("weberror", (e) => pageErrors.push(`JS: ${e.error().message.slice(0, 60)} (${e.page()?.url() ?? "?"})`));
  ctx.on("response", (r) => r.status() >= 500 && pageErrors.push(`HTTP ${r.status()} ${r.url()}`));
  return ctx;
}

const mobile = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, locale: "fr-FR", timezoneId: "Africa/Bamako" };

async function login(ctx, role) {
  const page = await ctx.newPage();
  await page.goto(`${BASE}/connexion`, NI);
  await page.fill("#email", mail(role));
  await page.fill("#password", PW);
  await page.click("button[type=submit]");
  let moved = await page.waitForURL((u) => !u.pathname.startsWith("/connexion"), { timeout: 8000 }).then(() => true, () => false);
  if (!moved && /Trop de|réessayez|Réessayez/.test(await page.locator("main").innerText().catch(() => ""))) {
    // Le serveur d'authentification local limite les rafales de connexions : nouvelle tentative
    await page.waitForTimeout(5000);
    await page.click("button[type=submit]");
    moved = await page.waitForURL((u) => !u.pathname.startsWith("/connexion"), { timeout: 8000 }).then(() => true, () => false);
  }
  if (!moved) {
    reloads++; console.log("      ⚠ blocage n°2 :", current?.url?.() ?? "");
    await page.goto(`${BASE}/`, NI); // le cookie de session a été posté avec la réponse
  }
  await page.getByRole("link", { name: /Notifications/ }).waitFor({ timeout: 10000 });
  return page;
}
const shot = (page, name) => page.screenshot({ path: `${SHOTS}${name}.png`, fullPage: true });

console.log("Parcours public");
const anon = await newCtx(mobile);
const p = await anon.newPage();
const consoleErrors = [];
// Les tuiles OpenStreetMap peuvent être bloquées par le réseau de test : ignorées
p.on("console", (m) => m.type() === "error" && !/ERR_TUNNEL|ERR_NAME_NOT_RESOLVED|tile\.openstreetmap/.test(m.text()) && consoleErrors.push(`${m.text()} (${m.location()?.url ?? ""})`));
p.on("response", (r) => r.status() >= 400 && !/openstreetmap/.test(r.url()) && consoleErrors.push(`HTTP ${r.status()} ${r.url()}`));

await step("accueil : logo, barre de recherche, boutons", async () => {
  await p.goto(BASE, NI);
  assert(await p.locator("img[alt^='PharmaProxi']").first().first().waitFor({ timeout: 10000 }).then(() => true, () => false), "logo absent");
  assert(await p.getByPlaceholder("Quel médicament recherchez-vous ?").first().waitFor({ timeout: 10000 }).then(() => true, () => false), "barre de recherche absente");
  assert(await p.getByRole("button", { name: "Trouver un médicament" }).first().waitFor({ timeout: 10000 }).then(() => true, () => false), "bouton Trouver absent");
  assert(await p.getByRole("button", { name: "Pharmacies autour de moi" }).first().waitFor({ timeout: 10000 }).then(() => true, () => false), "bouton autour de moi absent");
  const width = await p.evaluate(() => document.documentElement.scrollWidth);
  assert(width <= 390, `défilement horizontal sur mobile (${width}px)`);
  await shot(p, "01-accueil-mobile");
});

await step("suggestions de recherche depuis le catalogue", async () => {
  await p.fill("#q", "parac");
  await p.waitForSelector("[role=listbox] [role=option]", { timeout: 5000 });
  assert((await p.locator("[role=option]").count()) > 0, "aucune suggestion");
});

await step("recherche insensible aux accents + indicateurs de fraîcheur", async () => {
  await p.goto(`${BASE}/recherche?q=PARACETAMOL`, NI);
  const cards = p.locator("article");
  assert((await cards.count()) >= 2, "résultats manquants");
  const text = await p.locator("main").innerText();
  assert(/Stock déclaré disponible/.test(text), "badge disponible absent");
  assert(/Mis à jour/.test(text), "date d'actualisation absente");
  await shot(p, "02-resultats-mobile");
});

await step("information ancienne jamais présentée comme disponible", async () => {
  await p.goto(`${BASE}/recherche?q=demo%20ibuprofene`, NI);
  const text = await p.locator("main").innerText();
  assert(/Information ancienne/.test(text), "information ancienne non signalée");
});

await step("filtre « disponibles uniquement » + tri par prix", async () => {
  await p.goto(`${BASE}/recherche?q=demo&dispo=1&tri=price`, NI);
  const text = await p.locator("main").innerText();
  assert(!/Information ancienne/.test(text) && !/\bIndisponible\b/.test(text), "des résultats non disponibles restent affichés");
});

await step("fiche pharmacie + carte", async () => {
  await p.goto(`${BASE}/recherche?q=demo%20paracetamol`, NI);
  await p.locator("article a[href^='/pharmacies/']").first().click();
  await p.waitForURL(/\/pharmacies\//);
  assert(await p.getByText("Pharmacie vérifiée").first().first().waitFor({ timeout: 10000 }).then(() => true, () => false), "statut vérifié absent");
  assert(await p.getByText("Se connecter pour envoyer une demande").first().waitFor({ timeout: 10000 }).then(() => true, () => false), "invitation à se connecter absente");
  await p.waitForSelector(".leaflet-container", { timeout: 10000 });
  await shot(p, "03-fiche-pharmacie-mobile");
});

await step("pages protégées : redirection vers la connexion", async () => {
  await p.goto(`${BASE}/compte`, NI);
  assert(p.url().includes("/connexion?suite=%2Fcompte"), `pas de redirection (${p.url()})`);
});

console.log("Inscription et commande client (retrait)");
const cust = await newCtx(mobile);
const c = await cust.newPage();
const newEmail = `client.${Date.now()}@exemple.invalid`;
let orderUrl = "";
const orderId = () => orderUrl.split("/").pop();

await step("inscription d'un nouveau client", async () => {
  current = c;
  await c.goto(`${BASE}/inscription`, NI);
  await c.fill("#full_name", "Awa Traoré");
  await c.fill("#email", newEmail);
  await c.fill("#phone", "70 11 22 33");
  await c.fill("#password", "motdepasse-solide");
  await c.check("input[name=accept]");
  await c.click("button[type=submit]");
  if (!(await c.waitForURL(`${BASE}/`, { timeout: 8000 }).then(() => true, () => false))) await c.goto(`${BASE}/`, NI);
  await c.getByRole("link", { name: /Notifications/ }).waitFor({ timeout: 10000 });
});

await step("validation des formulaires (erreurs explicites)", async () => {
  const c2 = await cust.newPage();
  current = c2;
  await c2.goto(`${BASE}/compte`, NI);
  await c2.fill("#phone", "123");
  await c2.getByRole("button", { name: "Enregistrer" }).first().click();
  await c2.getByText(/Numéro invalide/).first().waitFor({ timeout: 10000 });
  await c2.close();
});

await step("demande de confirmation (retrait) depuis la fiche pharmacie", async () => {
  current = c;
  await c.goto(`${BASE}/recherche?q=demo%20paracetamol`, NI);
  await c.locator("article").filter({ hasText: "Fleuve" }).getByRole("link", { name: "Demander confirmation" }).click();
  await c.waitForURL(/\/pharmacies\/.+produit=/);
  await c.waitForLoadState("networkidle");
  await c.locator("input[name^=qty_]").first().fill("2");
  await shot(c, "04-demande-mobile");
  await c.getByRole("button", { name: "Envoyer la demande de confirmation" }).click();
  if (!(await c.waitForURL(/\/compte\/commandes\/.+/, { timeout: 8000 }).then(() => true, () => false))) {
    reloads++; console.log("      ⚠ blocage n°3 :", current?.url?.() ?? "");
    await c.goto(`${BASE}/compte/commandes`, NI);
    await c.locator("a[href^='/compte/commandes/']").first().click();
    await c.waitForURL(/\/compte\/commandes\/.+/);
  }
  await c.waitForLoadState("networkidle");
  orderUrl = c.url().split("?")[0];
  await c.getByText("En attente de confirmation").first().waitFor({ timeout: 10000 });
  assert(/DÉMO Paracétamol/.test(await c.locator("main").innerText()), "produit absent");
  await shot(c, "05-suivi-commande-mobile");
});

console.log("Espace pharmacien");
const phCtx = await newCtx(mobile);
let ph;
await step("connexion pharmacien + tableau de bord", async () => {
  ph = await login(phCtx, "pharmacist1");
  current = ph;
  await ph.goto(`${BASE}/pharmacien`, NI);
  await ph.getByText("Produits référencés").waitFor({ timeout: 10000 });
  await shot(ph, "06-tableau-de-bord-pharmacien");
});

// Statut lu sur le badge de la commande (et non dans la frise, qui liste toutes les étapes)
const statusIs = (page, code) => () => page.locator(`main [data-order-status="${code}"]`).first();

await step("confirmation, préparation, remise et paiement de la commande", async () => {
  current = ph;
  await ph.goto(`${BASE}/pharmacien/commandes/${orderId()}`, NI);
  await act(ph, () => ph.getByRole("button", { name: "Confirmer la disponibilité et réserver" }).click(), statusIs(ph, "confirmed"));
  await act(ph, () => ph.getByRole("button", { name: "Commencer la préparation" }).click(), statusIs(ph, "preparing"));
  await act(ph, () => ph.getByRole("button", { name: "Marquer prête au retrait" }).click(), statusIs(ph, "ready_for_pickup"));
  await ph.check("input[name=paid]");
  ph.once("dialog", (d) => d.accept());
  await act(ph, () => ph.getByRole("button", { name: "Remise au client effectuée" }).click(), statusIs(ph, "completed"));
  await c.goto(orderUrl, NI);
  const t = await c.locator("main").innerText();
  assert(/Retirée en pharmacie/.test(t), "statut final absent côté client");
  assert(/Paiement reçu \(confirmé\)/.test(t), "paiement non confirmé");
});

await step("mise à jour rapide d'un stock depuis le téléphone", async () => {
  current = ph;
  await ph.goto(`${BASE}/pharmacien/stocks?q=ibuprofene`, NI);
  const row = () => ph.locator("li").filter({ hasText: "DÉMO Ibuprofène" }).first();
  await row().locator("input[name=quantity]").fill("12");
  await act(ph, () => row().getByRole("button", { name: "Enregistrer" }).click(), () => row().getByText(/Libre : 12/));
  await row().getByText("Stock déclaré disponible").waitFor(); // l'information devient « récente »
  await shot(ph, "07-stocks-mobile");
});

await step("refus d'une quantité inférieure au réservé (message clair)", async () => {
  current = ph;
  const c3 = await cust.newPage();
  await c3.goto(`${BASE}/recherche?q=demo%20rehydratation`, NI);
  await c3.locator("article").filter({ hasText: "Fleuve" }).getByRole("link", { name: "Demander confirmation" }).click();
  await c3.waitForURL(/produit=/);
  await c3.waitForLoadState("networkidle");
  await c3.locator("input[name^=qty_]").first().fill("5");
  await c3.getByRole("button", { name: "Envoyer la demande de confirmation" }).click();
  if (!(await c3.waitForURL(/\/compte\/commandes\/.+/, { timeout: 8000 }).then(() => true, () => false))) {
    reloads++; console.log("      ⚠ blocage n°4 :", current?.url?.() ?? "");
    await c3.goto(`${BASE}/compte/commandes`, NI);
    await c3.locator("a[href^='/compte/commandes/']").first().click();
    await c3.waitForURL(/\/compte\/commandes\/.+/);
  }
  const sroOrder = c3.url().split("?")[0].split("/").pop();
  await ph.goto(`${BASE}/pharmacien/commandes/${sroOrder}`, NI);
  assert(/réhydratation/.test(await ph.locator("main").innerText()), "commande SRO introuvable");
  await act(ph, () => ph.getByRole("button", { name: "Confirmer la disponibilité et réserver" }).click(), statusIs(ph, "confirmed"));
  await ph.goto(`${BASE}/pharmacien/stocks?q=rehydratation`, NI);
  const row = ph.locator("li").filter({ hasText: "réhydratation" }).first();
  await row.locator("input[name=quantity]").evaluate((el) => el.removeAttribute("min"));
  await row.locator("input[name=quantity]").fill("2");
  await row.getByRole("button", { name: "Enregistrer" }).click();
  await row.getByText(/ne peut pas être inférieure à la quantité réservée/).waitFor({ timeout: 10000 }).catch(async () => {
    reloads++; console.log("      ⚠ blocage n°5 :", current?.url?.() ?? "");
    await ph.reload(NI); // l'erreur n'est pas persistée : on vérifie que la quantité n'a pas changé
    assert(/Réservé : 5/.test(await ph.locator("main").innerText()) && !/Libre : -/.test(await ph.locator("main").innerText()), "réservation incohérente");
    assert(!(await ph.locator("input[name=quantity]").first().inputValue()).startsWith("2"), "la quantité a été modifiée sous le réservé");
  });
  await c3.close();
});

console.log("Livraison (activée par le jeu de démonstration)");
await step("le client ajoute une adresse puis demande une livraison", async () => {
  current = c;
  await c.goto(`${BASE}/compte`, NI);
  await c.getByText("Ajouter une adresse").click();
  await c.selectOption("#region_id-sel", { label: "District de Bamako" });
  await c.selectOption("#commune_id-sel", { label: "Commune III" });
  await c.fill("#address_line", "Rue 123, porte 45");
  await c.fill("#contact_phone", "70112233");
  await act(c, () => c.getByRole("button", { name: "Ajouter", exact: true }).click(), () => c.getByText("Rue 123, porte 45"));
  await c.goto(`${BASE}/recherche?q=demo%20paracetamol`, NI);
  await c.locator("article").filter({ hasText: "Fleuve" }).getByRole("link", { name: "Demander confirmation" }).click();
  await c.waitForURL(/produit=/);
  await c.waitForLoadState("networkidle");
  await c.check("input[value=delivery]");
  await c.getByText("Frais de livraison").first().waitFor();
  await c.getByRole("button", { name: "Envoyer la demande de confirmation" }).click();
  if (!(await c.waitForURL(/\/compte\/commandes\/.+/, { timeout: 8000 }).then(() => true, () => false))) {
    reloads++; console.log("      ⚠ blocage n°6 :", current?.url?.() ?? "");
    await c.goto(`${BASE}/compte/commandes`, NI);
    await c.locator("a[href^='/compte/commandes/']").filter({ hasText: "Livraison" }).first().click();
    await c.waitForURL(/\/compte\/commandes\/.+/);
  }
  await c.waitForLoadState("networkidle");
  orderUrl = c.url().split("?")[0];
  await c.getByText("Frais de livraison").first().waitFor({ timeout: 10000 });
});

await step("produit sur ordonnance : livraison impossible", async () => {
  current = c;
  await c.goto(`${BASE}/recherche?q=demo%20amoxicilline`, NI);
  await c.locator("article").filter({ hasText: "Fleuve" }).getByRole("link", { name: "Demander confirmation" }).click();
  await c.waitForURL(/produit=/);
  await c.waitForLoadState("networkidle");
  await c.check("input[value=delivery]");
  await c.getByText("Livraison impossible pour au moins un produit").waitFor();
  assert(await c.getByRole("button", { name: "Envoyer la demande de confirmation" }).isDisabled(), "envoi non bloqué");
});

const adminCtx = await newCtx({ viewport: { width: 1280, height: 900 }, locale: "fr-FR" });
const courierCtx = await newCtx(mobile);
let ad;
await step("pharmacie → admin (affectation) → livreur (collecte, remise, paiement)", async () => {
  current = ph;
  await ph.goto(`${BASE}/pharmacien/commandes/${orderId()}`, NI);
  await act(ph, () => ph.getByRole("button", { name: "Confirmer la disponibilité et réserver" }).click(), statusIs(ph, "confirmed"));
  await act(ph, () => ph.getByRole("button", { name: "Commencer la préparation" }).click(), statusIs(ph, "preparing"));
  await act(ph, () => ph.getByRole("button", { name: "Prête : demander un livreur" }).click(), statusIs(ph, "awaiting_courier"));

  ad = await login(adminCtx, "admin");
  current = ad;
  await ad.goto(`${BASE}/admin/commandes`, NI);
  const li = () => ad.locator("li").filter({ has: ad.locator("select[name=courier_id]") }).first();
  await li().locator("select[name=courier_id]").selectOption({ index: 1 });
  await act(ad, () => li().getByRole("button", { name: "Affecter" }).click(), () => ad.getByText("Livreur affecté").first());

  const co = await login(courierCtx, "courier");
  current = co;
  await co.goto(`${BASE}/livraison`, NI);
  await co.locator("a[href^='/livraison/']").first().click();
  await co.waitForURL(/\/livraison\/.+/);
  await co.waitForLoadState("networkidle");
  co.once("dialog", (d) => d.accept());
  await act(co, () => co.getByRole("button", { name: "Colis collecté — démarrer la livraison" }).click(), statusIs(co, "in_delivery"));
  await co.check("input[name=paid]");
  co.once("dialog", (d) => d.accept());
  await act(co, () => co.getByRole("button", { name: "Colis remis au client" }).click(), () => co.getByText(/Remis le/));
  await shot(co, "08-livraison-mobile");
  await c.goto(orderUrl, NI);
  const t = await c.locator("main").innerText();
  assert(/Livrée/.test(t) && /Paiement reçu \(confirmé\)/.test(t), "livraison non clôturée côté client");
});

console.log("Robustesse");
await step("conflit de modification : deux téléphones modifient la même ligne de stock", async () => {
  const t1 = ph; current = t1;
  const t2 = await phCtx.newPage();
  for (const t of [t1, t2]) await t.goto(`${BASE}/pharmacien/stocks?q=gel`, NI);
  const row = (t) => t.locator("li").filter({ hasText: "DÉMO Gel hydroalcoolique" }).first();
  await row(t1).locator("input[name=quantity]").fill("30");
  await act(t1, () => row(t1).getByRole("button", { name: "Enregistrer" }).click(), () => row(t1).getByText(/Libre : 30/));
  await row(t2).locator("input[name=quantity]").fill("7");
  await row(t2).getByRole("button", { name: "Enregistrer" }).click();
  await row(t2).getByText(/modifiée entre-temps/).waitFor({ timeout: 10000 });
  await t2.reload(NI);
  assert(/Libre : 30/.test(await row(t2).innerText()), "la modification la plus ancienne a écrasé la plus récente");
  await t2.close();
});

await step("équipe : le propriétaire ajoute puis retire un collaborateur", async () => {
  current = ph;
  await ph.goto(`${BASE}/pharmacien/ma-pharmacie`, NI);
  await ph.fill("#team-email", newEmail);
  await act(ph, () => ph.getByRole("button", { name: "Ajouter", exact: true }).click(), () => ph.getByText(newEmail).first());
  // Le collaborateur accède à l'espace pharmacien
  await c.goto(`${BASE}/pharmacien/stocks`, NI);
  await c.getByText("Gestion des stocks").waitFor({ timeout: 10000 });
  ph.once("dialog", (d) => d.accept());
  const member = ph.locator("li").filter({ hasText: newEmail });
  await member.getByRole("button", { name: "Retirer" }).click();
  await ph.reload(NI);
  assert(!(await ph.getByText(newEmail).count()), "collaborateur toujours présent");
  await c.goto(`${BASE}/pharmacien/stocks`, NI);
  assert(c.url().includes("/pharmacien/inscription"), `accès aux stocks toujours ouvert (${c.url()})`);
});

await step("contrôle d'intégrité et point de santé", async () => {
  if (!ad) ad = await login(adminCtx, "admin");
  current = ad;
  await ad.goto(`${BASE}/admin/integrite`, NI);
  await ad.getByText("Stocks, réservations et commandes sont cohérents.").waitFor({ timeout: 10000 });
  await act(ad, () => ad.getByRole("button", { name: "Lancer la maintenance" }).click(), () => ad.getByText(/expirée\(s\) ·/).first());
  const h = await fetch(`${BASE}/api/health`).then((r) => r.json());
  assert(h.database === "ok", `santé : ${JSON.stringify(h)}`);
});

console.log("Administration et contrôle d'accès");
await step("tableau de bord administrateur (statistiques réelles)", async () => {
  if (!ad) ad = await login(adminCtx, "admin");
  current = ad;
  await ad.goto(`${BASE}/admin`, NI);
  await ad.getByText("Pharmacies vérifiées").first().waitFor();
  await shot(ad, "09-admin-desktop");
  await ad.goto(`${BASE}/admin/pharmacies?statut=pending`, NI);
  await ad.getByText("Pharmacie DÉMO en attente").click();
  await ad.locator("input[name^=check_]").first().waitFor(); // navigation terminée
  const boxes = await ad.locator("input[name^=check_]").all();
  assert(boxes.length === 5, `${boxes.length} points de contrôle au lieu de 5`);
  for (const cb of boxes) await cb.check();
  ad.once("dialog", (d) => d.accept());
  await ad.getByRole("button", { name: "Enregistrer la décision" }).click();
  await ad.getByText("aucun justificatif déposé, validation impossible").waitFor({ timeout: 10000 }).catch(async () => {
    reloads++; console.log("      ⚠ blocage n°7 :", current?.url?.() ?? "");
    await ad.reload(NI);
    assert(/En attente de vérification/.test(await ad.locator("main").innerText()), "pharmacie validée sans justificatif");
  });
});

await step("un client ne peut pas accéder à l'administration", async () => {
  current = c;
  await c.goto(`${BASE}/admin`, NI);
  assert(c.url().endsWith("/acces-refuse"), `accès non refusé (${c.url()})`);
  await c.goto(`${BASE}/livraison/00000000-0000-0000-0000-000000000000`, NI);
  assert(c.url().endsWith("/acces-refuse"), "espace livreur accessible");
});

await step("un pharmacien ne voit pas les commandes d'une autre pharmacie", async () => {
  const ph2Ctx = await newCtx(mobile);
  const p2 = await login(ph2Ctx, "pharmacist2");
  current = p2;
  await p2.goto(`${BASE}/pharmacien/commandes/${orderId()}`, NI);
  // Avec le rendu en streaming, la page « introuvable » est servie sans code 404 : on vérifie le contenu.
  await p2.getByText("Page introuvable").first().waitFor({ timeout: 10000 });
  await ph2Ctx.close();
});

console.log("Annuaire médical");
await step("annuaire : spécialités, recherche et fiche médecin", async () => {
  current = p;
  await p.goto(`${BASE}/medecins`, NI);
  await p.getByRole("heading", { name: "Trouver un médecin spécialiste" }).waitFor({ timeout: 10000 });
  await p.getByText(/Urgence vitale/).first().waitFor({ timeout: 10000 });
  await p.getByRole("link", { name: "Cardiologie", exact: true }).first().click();
  await p.waitForURL(/specialite=/);
  await p.getByRole("link", { name: /Démo Aminata/ }).first().waitFor({ timeout: 10000 });
  const width = await p.evaluate(() => document.documentElement.scrollWidth);
  assert(width <= 390, `défilement horizontal sur mobile (${width}px)`);
  await shot(p, "10-annuaire-resultats-mobile");
  await p.getByRole("link", { name: /Démo Aminata/ }).first().click();
  await p.waitForURL(/\/medecins\/[0-9a-f-]{36}/);
  await p.getByText("Où et quand consulter").waitFor({ timeout: 10000 });
  await p.getByRole("link", { name: "Clinique DÉMO du Djoliba" }).first().waitFor({ timeout: 10000 });
  await p.getByText(/Rendez-vous : \+223 20 00 01 11/).first().waitFor({ timeout: 10000 });
  await p.getByText("Inscription à l'Ordre vérifiée").first().waitFor({ timeout: 10000 });
  await shot(p, "11-fiche-medecin-mobile");
});

await step("annuaire : établissement, urgences, médecins et pharmacies proches", async () => {
  await p.goto(`${BASE}/cliniques?urgences=1`, NI);
  const text = await p.locator("main").innerText();
  assert(/Clinique DÉMO du Djoliba/.test(text) && !/Cabinet médical DÉMO des Manguiers/.test(text), "filtre urgences incorrect");
  await p.getByRole("link", { name: "Clinique DÉMO du Djoliba" }).first().click();
  await p.waitForURL(/\/cliniques\/[0-9a-f-]{36}/);
  await p.getByText("Service d'urgence 24 h/24").first().waitFor({ timeout: 10000 });
  await p.getByRole("link", { name: /Démo Ibrahima/ }).first().waitFor({ timeout: 10000 });
  await p.getByRole("link", { name: "Pharmacie DÉMO du Fleuve" }).first().waitFor({ timeout: 10000 });
  await p.waitForSelector(".leaflet-container", { timeout: 10000 });
  await shot(p, "12-fiche-clinique-mobile");
  await p.goto(`${BASE}/specialites`, NI);
  await p.getByRole("heading", { name: "Quel spécialiste pour quoi ?" }).waitFor({ timeout: 10000 });
});

let newDoctorName = "";
await step("espace médecin : absence annoncée puis retirée, confirmation des informations", async () => {
  const dCtx = await newCtx(mobile);
  const d = await login(dCtx, "doctor1");
  current = d;
  await d.goto(`${BASE}/medecin`, NI);
  await d.getByText("Vérifiée et publiée").first().waitFor({ timeout: 10000 });
  const today = new Date().toISOString().slice(0, 10);
  const later = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  await d.fill("#starts_on", today);
  await d.fill("#ends_on", later);
  await d.fill("#note", "Congé (test)");
  await act(d, () => d.getByRole("button", { name: "Ajouter l'absence" }).click(), () => d.getByText(/Congé \(test\)/).first());
  const href = await d.getByRole("link", { name: "Voir ma fiche publique" }).getAttribute("href");
  const pub = await dCtx.newPage();
  await pub.goto(`${BASE}${href}`, NI);
  await pub.getByText(/Absent jusqu'au/).first().waitFor({ timeout: 10000 });
  await pub.close();
  await act(d, () => d.getByRole("button", { name: "Supprimer l'absence" }).first().click(), () => d.getByText("Vérifiée et publiée").first());
  assert(!(await d.getByText(/Congé \(test\)/).count()), "absence non supprimée");
  await d.getByRole("button", { name: "Mes informations sont exactes" }).click();
  await d.getByText(/confirmées pour 90 jours/).first().waitFor({ timeout: 10000 });
  assert((await d.evaluate(() => document.documentElement.scrollWidth)) <= 390, "défilement horizontal (espace médecin)");
  await shot(d, "13-espace-medecin-mobile");
  await dCtx.close();
});

await step("référencement d'un nouveau médecin et demande de rattachement", async () => {
  current = c;
  newDoctorName = `Awa Traoré ${Date.now() % 100000}`;
  await c.goto(`${BASE}/medecin/inscription`, NI);
  await c.fill("#display_name", newDoctorName);
  await c.fill("#order_number", "ML-TEST-42");
  await c.locator("input[name=specialties]").first().check();
  await c.check("input[name=consent]");
  await c.getByRole("button", { name: "Envoyer ma demande de référencement" }).click();
  if (!(await c.waitForURL(/\/medecin\?inscrit=1/, { timeout: 10000 }).then(() => true, () => false))) { reloads++; await c.goto(`${BASE}/medecin`, NI); }
  await c.getByText("En attente de vérification").first().waitFor({ timeout: 10000 });
  const opt = await c.locator("#clinic_id option", { hasText: "Cabinet médical DÉMO des Manguiers" }).getAttribute("value");
  await c.selectOption("#clinic_id", opt);
  await c.fill("#new-o-mon", "08:00");
  await c.locator("input[name=close_mon]").last().fill("12:00");
  assert((await c.evaluate(() => document.documentElement.scrollWidth)) <= 390, "défilement horizontal (formulaire de lieu)");
  await act(c, () => c.getByRole("button", { name: "Ajouter ce lieu" }).click(), () => c.getByText("En attente de l'établissement").first());
});

await step("établissement : acceptation de la demande du médecin", async () => {
  const kCtx = await newCtx(mobile);
  const k = await login(kCtx, "clinic");
  current = k;
  await k.goto(`${BASE}/clinique`, NI);
  await k.getByRole("link", { name: /Cabinet médical DÉMO des Manguiers/ }).click();
  await k.waitForURL(/\/clinique\/[0-9a-f-]{36}/);
  await k.getByText(/demande\(nt\) à être rattaché/).first().waitFor({ timeout: 10000 });
  const card = k.locator("div.rounded-lg.border", { hasText: newDoctorName });
  await act(k, () => card.getByRole("button", { name: "Accepter" }).click(), () => k.locator("div.rounded-lg.border", { hasText: newDoctorName }).getByText("Accepté : publié après vérification"));
  assert((await k.evaluate(() => document.documentElement.scrollWidth)) <= 390, "défilement horizontal (espace établissement)");
  await shot(k, "14-espace-clinique-mobile");
  await kCtx.close();
});

await step("administration : file de l'annuaire, justificatifs exigés, spécialités", async () => {
  const aCtx = await newCtx(mobile);
  const a = await login(aCtx, "admin");
  current = a;
  await a.goto(`${BASE}/admin/annuaire`, NI);
  await a.getByRole("link", { name: new RegExp(newDoctorName) }).click();
  await a.waitForURL(/\/admin\/annuaire\/medecins\//);
  await a.getByText("Aucun justificatif déposé : validation impossible.").first().waitFor({ timeout: 10000 });
  await a.getByText("ML-TEST-42").first().waitFor({ timeout: 10000 });
  await a.goto(`${BASE}/admin/annuaire?vue=specialites`, NI);
  await a.getByText("Anesthésie-réanimation").first().waitFor({ timeout: 10000 });
  await a.goto(`${BASE}/admin`, NI);
  await a.getByText("Médecins publiés").first().waitFor({ timeout: 10000 });
  await aCtx.close();
});

console.log("Pharmacies non inscrites");
await step("administration : import CSV (point-virgule, Windows-1252), doublons et erreurs ligne par ligne", async () => {
  const aCtx = await newCtx(mobile);
  const a = await login(aCtx, "admin");
  current = a;
  await a.goto(`${BASE}/admin/pharmacies-non-inscrites`, NI);
  // Fichier tel qu'Excel l'enregistre en français : « ; » et encodage Windows-1252
  const csv = "Nom;Région;Commune;Quartier;Adresse;Téléphone;Latitude;Longitude\r\n"
    + "Officine Étoile du Nord;Bamako;Commune 3;;Face au marché;76-32-23-41;12,655;-8,0\r\n"
    + "OFFICINE ETOILE DU NORD;District de Bamako;Commune III;;;;;\r\n"
    + "Officine de Massigui;Koulikoro;Massigui;Centre;;63 43 32 73;;\r\n"
    + "Sans région;Atlantide;;;;;;\r\n";
  const bytes = Buffer.from(csv, "latin1");
  await a.setInputFiles("#l-file", { name: "pharmacies.csv", mimeType: "text/csv", buffer: bytes });
  await a.getByRole("button", { name: "Importer" }).click();
  await a.getByText(/2 fiche\(s\) importée\(s\), 1 doublon\(s\) ignoré\(s\), 1 ligne\(s\) en erreur/).waitFor({ timeout: 15000 });
  await a.getByText(/Ligne 5 : région inconnue/).first().waitFor({ timeout: 5000 });
  await a.reload(NI);
  await a.getByText("Officine Étoile du Nord").first().waitFor({ timeout: 10000 });
  assert((await a.evaluate(() => document.documentElement.scrollWidth)) <= 390, "défilement horizontal (admin pharmacies non inscrites)");
  await shot(a, "15-admin-pharmacies-non-inscrites");
  await aCtx.close();
});

await step("annuaire public : pharmacies inscrites et non inscrites, appel, carte", async () => {
  const c = await newCtx(mobile);
  const v = await c.newPage();
  current = v;
  await v.goto(`${BASE}/pharmacies`, NI);
  const card = v.locator("li", { hasText: "Officine Étoile du Nord" });
  await card.getByText("Pas encore inscrite : stocks non disponibles").waitFor({ timeout: 10000 });
  assert((await card.locator("a[href='tel:+22376322341']").count()) === 1, "lien d'appel absent");
  await v.getByText("Inscrite et vérifiée : stocks et réservation").first().waitFor({ timeout: 10000 });
  await v.fill("input[name=q]", "etoile");
  await v.getByRole("button", { name: "Rechercher" }).click();
  await v.waitForURL(/q=etoile/);
  await v.getByText("1 pharmacie").first().waitFor({ timeout: 10000 });
  assert((await v.evaluate(() => document.documentElement.scrollWidth)) <= 390, "défilement horizontal (annuaire des pharmacies)");
  await shot(v, "16-annuaire-pharmacies-mobile");
  await v.goto(`${BASE}/carte`, NI);
  await v.getByText(/autre pharmacie \(pas encore inscrite\)/).waitFor({ timeout: 10000 });
  await c.close();
});

await step("administration : masquer puis republier une fiche", async () => {
  const aCtx = await newCtx(mobile);
  const a = await login(aCtx, "admin");
  current = a;
  await a.goto(`${BASE}/admin/pharmacies-non-inscrites?q=Massigui`, NI);
  await a.getByRole("link", { name: /Officine de Massigui/ }).click();
  await a.waitForURL(/\/admin\/pharmacies-non-inscrites\/[0-9a-f-]{36}/);
  await act(a, () => a.getByRole("button", { name: "Masquer du public" }).click(), () => a.getByRole("button", { name: "Publier" }));
  const pub = await newCtx(mobile);
  const v = await pub.newPage();
  await v.goto(`${BASE}/pharmacies?q=massigui`, NI);
  await v.getByText("Aucune pharmacie trouvée avec ces critères.").waitFor({ timeout: 10000 });
  await act(a, () => a.getByRole("button", { name: "Publier" }).click(), () => a.getByRole("button", { name: "Masquer du public" }));
  await v.reload(NI);
  await v.getByText("Officine de Massigui").first().waitFor({ timeout: 10000 });
  await pub.close();
  await aCtx.close();
});

console.log("Rendez-vous");
const nextMonday = (() => { const d = new Date(); d.setUTCDate(d.getUTCDate() + 1); while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); })();
await step("médecin : ouverture des demandes de rendez-vous en ligne", async () => {
  const dCtx = await newCtx(mobile);
  const d = await login(dCtx, "doctor1");
  current = d;
  await d.goto(`${BASE}/medecin/rendez-vous?vue=reglages`, NI);
  const row = d.locator("li", { hasText: "Clinique DÉMO du Djoliba" }).first();
  await act(d, () => row.getByRole("button", { name: "Ouvrir la prise de rendez-vous" }).click(),
    () => d.locator("li", { hasText: "Clinique DÉMO du Djoliba" }).first().getByRole("button", { name: "Fermer la prise de rendez-vous" }));
  assert((await d.evaluate(() => document.documentElement.scrollWidth)) <= 390, "défilement horizontal (agenda médecin)");
  await dCtx.close();
});

await step("patient : demande de rendez-vous depuis la fiche du médecin", async () => {
  const cCtx = await newCtx(mobile);
  const c = await login(cCtx, "customer");
  current = c;
  await c.goto(`${BASE}/medecins`, NI);
  await c.fill("#q", "Aminata");
  await c.getByRole("button", { name: "Rechercher" }).click();
  await c.getByRole("link", { name: /Démo Aminata/ }).first().click();
  await c.waitForURL(/\/medecins\/[0-9a-f-]{36}$/);
  await c.getByRole("link", { name: "Demander un rendez-vous" }).first().click();
  await c.waitForURL(/\/rendez-vous/);
  await c.fill("#date", nextMonday);
  await c.getByLabel("Le matin").check();
  await c.fill("#reason", "Consultation de suivi");
  await c.getByRole("checkbox", { name: /J'ai compris/ }).check();
  assert((await c.evaluate(() => document.documentElement.scrollWidth)) <= 390, "défilement horizontal (formulaire de rendez-vous)");
  await shot(c, "19-demande-rendez-vous-mobile");
  await c.getByRole("button", { name: "Envoyer la demande" }).click();
  await c.waitForURL(/\/compte\/rendez-vous/, { timeout: 15000 });
  await c.getByText("En attente de réponse").first().waitFor({ timeout: 10000 });
  await cCtx.close();
});

await step("secrétariat : confirmation avec une heure ; le patient voit le rendez-vous confirmé", async () => {
  const kCtx = await newCtx(mobile);
  const k = await login(kCtx, "clinic");
  current = k;
  await k.goto(`${BASE}/clinique`, NI);
  await k.getByRole("link", { name: /Clinique DÉMO du Djoliba/ }).first().click();
  await k.waitForURL(/\/clinique\/[0-9a-f-]{36}$/);
  await k.locator("main").getByRole("link", { name: "Rendez-vous", exact: true }).click();
  await k.waitForURL(/\/rendez-vous/);
  await k.getByText("Consultation de suivi").waitFor({ timeout: 10000 });
  await k.fill("input[name=time]", "09:30");
  await act(k, () => k.getByRole("button", { name: "Confirmer", exact: true }).click(), () => k.getByText("Aucune demande en attente."));
  await k.goto(`${k.url().split("?")[0]}?vue=a_venir`, NI);
  await k.getByText(/fixé :.*09 h 30/).waitFor({ timeout: 10000 });
  assert((await k.evaluate(() => document.documentElement.scrollWidth)) <= 390, "défilement horizontal (agenda établissement)");
  await shot(k, "20-agenda-etablissement-mobile");
  await kCtx.close();
  const cCtx = await newCtx(mobile);
  const c = await login(cCtx, "customer");
  await c.goto(`${BASE}/compte/rendez-vous`, NI);
  await c.getByText("Confirmé", { exact: true }).first().waitFor({ timeout: 10000 });
  await c.getByText(/à 09 h 30/).first().waitFor({ timeout: 10000 });
  await shot(c, "21-mes-rendez-vous-mobile");
  await cCtx.close();
});

let bookedDay = null;
await step("médecin : motif de consultation et réservation immédiate", async () => {
  const dCtx = await newCtx(mobile);
  const d = await login(dCtx, "doctor1");
  current = d;
  await d.goto(`${BASE}/medecin/rendez-vous?vue=reglages`, NI);
  await d.fill("#tn-new", "Consultation");
  await d.fill("#td-new", "30");
  await d.fill("#tf-new", "10 000 FCFA");
  await d.getByRole("button", { name: "Ajouter", exact: true }).click();
  await d.getByText("Motif enregistré.").first().waitFor({ timeout: 10000 });
  await d.reload(NI);
  const row = d.locator("li", { hasText: "Clinique DÉMO du Djoliba" }).first();
  await row.getByText("Réglages du lieu").click();
  await row.getByLabel("Réservation immédiate d'un créneau libre").check();
  await row.getByLabel("Informations d'accès").fill("Bâtiment B, 1er étage");
  await row.getByRole("button", { name: "Enregistrer" }).click();
  await d.getByText("Réglages enregistrés.").first().waitFor({ timeout: 10000 });
  await d.reload(NI);
  await d.locator("li", { hasText: "Clinique DÉMO du Djoliba" }).getByText("Réservation immédiate", { exact: true }).waitFor({ timeout: 10000 });
  assert((await d.evaluate(() => document.documentElement.scrollWidth)) <= 390, "défilement horizontal (réglages)");
  await shot(d, "22-reglages-medecin-mobile");
  await dCtx.close();
});

await step("patient : prochaine disponibilité, choix du motif et du créneau, réservation confirmée, fichier agenda", async () => {
  const cCtx = await newCtx(mobile);
  const c = await login(cCtx, "customer");
  current = c;
  await c.goto(`${BASE}/medecins?q=Aminata`, NI);
  await c.getByText(/Prochaine disponibilité/).first().click();
  await c.waitForURL(/\/rendez-vous\?lieu=/);
  await c.getByRole("link", { name: /Consultation\s.*30 min/ }).first().click();
  await c.getByText("2. Choisissez un horaire").waitFor({ timeout: 10000 });
  await shot(c, "23-creneaux-mobile");
  // Le patient a déjà un rendez-vous ce lundi-là avec ce médecin : il choisit un autre jour
  const pick = async () => (await c.locator("a[href*='creneau=']").evaluateAll((els) => els.map((e) => e.getAttribute("href"))))
    .find((h) => !decodeURIComponent(h.split("creneau=")[1]).startsWith(nextMonday));
  let slotHref = await pick();
  if (!slotHref) {
    await c.getByRole("link", { name: /Suivant/ }).click();
    await c.waitForURL(/debut=/);
    slotHref = await pick();
  }
  assert(slotHref, "aucun créneau un autre jour");
  const slot = c.locator(`a[href="${slotHref}"]`);
  bookedDay = decodeURIComponent(slotHref.split("creneau=")[1]).slice(0, 10);
  await slot.click();
  await c.getByText("3. Confirmez votre rendez-vous").waitFor({ timeout: 10000 });
  await c.getByRole("checkbox", { name: /Je confirme ce rendez-vous/ }).check();
  assert((await c.evaluate(() => document.documentElement.scrollWidth)) <= 390, "défilement horizontal (confirmation)");
  await c.getByRole("button", { name: "Confirmer le rendez-vous" }).click();
  await c.waitForURL(/\/compte\/rendez-vous/, { timeout: 15000 });
  const card = c.locator("li", { hasText: "Motif : Consultation" }).first();
  await card.getByText("Confirmé", { exact: true }).waitFor({ timeout: 10000 });
  await card.getByText("Bâtiment B, 1er étage").waitFor({ timeout: 10000 });
  const ics = await card.getByRole("link", { name: "Ajouter à mon agenda" }).getAttribute("href");
  const res = await c.request.get(`${BASE}${ics}`);
  assert(res.status() === 200 && (await res.text()).includes("BEGIN:VEVENT"), "fichier agenda invalide");
  await shot(c, "24-rendez-vous-confirme-mobile");
  await cCtx.close();
});

await step("agenda du jour : rendez-vous en ligne, rendez-vous téléphonique et plage bloquée", async () => {
  const dCtx = await newCtx(mobile);
  const d = await login(dCtx, "doctor1");
  current = d;
  await d.goto(`${BASE}/medecin/rendez-vous?vue=jour&date=${bookedDay}`, NI);
  await d.getByText("pris en ligne").first().waitFor({ timeout: 10000 });
  await d.getByText("+ Ajouter un rendez-vous (patient au téléphone)").click();
  await d.fill("#pa-time", "19:00");
  await d.fill("#pa-name", "Patient Téléphone");
  await d.fill("#pa-phone", "76 55 44 33");
  await d.getByRole("button", { name: "Ajouter", exact: true }).click();
  await d.getByText(/Rendez-vous ajouté à l'agenda/).first().waitFor({ timeout: 10000 });
  await d.getByText("+ Bloquer une plage (réunion, garde…)").click();
  await d.fill("#pb-from", "20:00");
  await d.fill("#pb-to", "21:00");
  await d.fill("#pb-note", "Réunion");
  await d.getByRole("button", { name: "Bloquer" }).click();
  await d.getByText(/Plage bloquée/).first().waitFor({ timeout: 10000 });
  await d.reload(NI);
  await d.getByText("Patient Téléphone").waitFor({ timeout: 10000 });
  await d.getByText(/Bloqué.*Réunion/).waitFor({ timeout: 10000 });
  assert((await d.evaluate(() => document.documentElement.scrollWidth)) <= 390, "défilement horizontal (agenda du jour)");
  await shot(d, "25-agenda-du-jour-mobile");
  await dCtx.close();
});

await step("patient : rubrique « Prendre rendez-vous », créneau en un clic, puis déplacement du rendez-vous", async () => {
  const pCtx = await newCtx(mobile);
  const c = await login(pCtx, "pharmacist2"); // un autre patient, sans rendez-vous avec ce médecin
  current = c;
  c.on("dialog", (dlg) => dlg.accept());
  await c.getByRole("navigation", { name: "Navigation mobile" }).getByRole("link", { name: "Rendez-vous", exact: true }).click();
  await c.waitForURL(/\/rendez-vous$/);
  await c.getByRole("heading", { name: "Prendre rendez-vous" }).waitFor({ timeout: 10000 });
  const card = c.locator("li", { hasText: "Dr Démo Aminata" }).first();
  await card.getByText("Réservation immédiate").waitFor({ timeout: 10000 });
  assert((await c.evaluate(() => document.documentElement.scrollWidth)) <= 390, "défilement horizontal (prendre rendez-vous)");
  await shot(c, "26-prendre-rendez-vous-mobile");
  await card.locator("a[href*='creneau=']").first().click();
  await c.getByText("3. Confirmez votre rendez-vous").waitFor({ timeout: 10000 });
  await c.getByRole("checkbox", { name: /Je confirme ce rendez-vous/ }).check();
  await c.getByRole("button", { name: "Confirmer le rendez-vous" }).click();
  await c.waitForURL(/\/compte\/rendez-vous/, { timeout: 15000 });
  const mine = c.locator("li", { hasText: "Motif : Consultation" }).first();
  const before = await mine.innerText();
  await mine.getByRole("link", { name: "Déplacer" }).click();
  await c.waitForURL(/\/deplacer/);
  await c.getByText("Choisissez le nouveau créneau").waitFor({ timeout: 10000 });
  await shot(c, "27-deplacer-rendez-vous-mobile");
  await c.locator("main form button").first().click();
  await c.waitForURL(/\/compte\/rendez-vous$/, { timeout: 15000 });
  await c.getByText(/Rendez-vous déplacé/).first().waitFor({ timeout: 10000 });
  const after = await c.locator("li", { hasText: "Motif : Consultation" }).first().innerText();
  assert(after !== before, "l'horaire du rendez-vous n'a pas changé");
  await pCtx.close();
});

await step("médecin : statistiques d'activité (remplissage, annulations, visibilité)", async () => {
  const dCtx = await newCtx(mobile);
  const d = await login(dCtx, "doctor1");
  current = d;
  await d.goto(`${BASE}/medecin/rendez-vous?vue=statistiques`, NI);
  await d.getByText("Remplissage des 7 prochains jours").waitFor({ timeout: 10000 });
  await d.getByText("Consultations de la fiche").waitFor({ timeout: 10000 });
  await d.getByText("Repère de votre spécialité").waitFor({ timeout: 10000 });
  assert((await d.evaluate(() => document.documentElement.scrollWidth)) <= 390, "défilement horizontal (statistiques)");
  await shot(d, "28-statistiques-medecin-mobile");
  await dCtx.close();
});

console.log("Registres publics");
const DATA = process.env.E2E_DATA_DIR; // fichiers réels (Tableau de l'Ordre, établissements, pharmacies partenaires)
await step("administration : import du Tableau de l'Ordre et des établissements", async () => {
  const aCtx = await newCtx({ viewport: { width: 1280, height: 900 }, locale: "fr-FR" });
  const a = await login(aCtx, "admin");
  current = a;
  await a.goto(`${BASE}/admin/annuaire?vue=tableau`, NI);
  const tableau = DATA ? `${DATA}/tableau-ordre-medecins-2025.csv` : { name: "t.csv", mimeType: "text/csv",
    buffer: Buffer.from("N° ordre;N° d'inscription;Nom;Prénom;Spécialité;Structure;CROM\n1;2010001;TRAORE;Awa;Pédiatrie;CHU Gabriel TOURE;CROM BAMAKO\n2;2010002;BAH;Sékou;Cardiologie;Hôpital du Mali;CROM BAMAKO\n", "utf8") };
  await a.setInputFiles("#reg-file", tableau);
  await a.fill("#reg-year", "2025");
  await a.getByRole("button", { name: "Importer" }).click();
  await a.getByText(/Tableau 2025 : \d+ médecin\(s\) importé\(s\)/).waitFor({ timeout: 90000 });
  await a.goto(`${BASE}/admin/annuaire?vue=etablissements`, NI);
  const fac = DATA ? `${DATA}/etablissements-sante.csv` : { name: "e.csv", mimeType: "text/csv",
    buffer: Buffer.from("nom;categorie;region;ville;telephone\nClinique Aldi;Clinique;District de Bamako;Bamako;20 21 14 34\n", "utf8") };
  await a.setInputFiles("#fac-file", fac);
  await a.getByRole("button", { name: "Importer" }).click();
  await a.getByText(/établissement\(s\) importé\(s\)/).waitFor({ timeout: 20000 });
  if (DATA) {
    await a.goto(`${BASE}/admin/pharmacies-non-inscrites`, NI);
    await a.setInputFiles("#l-file", `${DATA}/pharmacies-partenaires.csv`);
    await a.getByRole("button", { name: "Importer" }).click();
    await a.getByText(/fiche\(s\) importée\(s\)/).waitFor({ timeout: 20000 });
  }
  await aCtx.close();
});

await step("public : médecins du Tableau par spécialité, établissements non vérifiés", async () => {
  const c = await newCtx(mobile);
  const v = await c.newPage();
  current = v;
  await v.goto(`${BASE}/medecins`, NI);
  await v.getByText(/médecins inscrits au Tableau 2025/).first().waitFor({ timeout: 10000 });
  await v.getByRole("link", { name: "Pédiatrie", exact: true }).first().click();
  await v.waitForURL(/specialite=/);
  await v.getByRole("heading", { name: /Médecins inscrits au Tableau de l'Ordre \(\d+\)/ }).waitFor({ timeout: 10000 });
  await v.getByText(/Inscrit au Tableau 2025 de l'Ordre/).first().waitFor({ timeout: 10000 });
  assert((await v.evaluate(() => document.documentElement.scrollWidth)) <= 390, "défilement horizontal (médecins du Tableau)");
  await shot(v, "17-tableau-ordre-mobile");
  await v.goto(`${BASE}/cliniques?q=aldi`, NI);
  await v.getByText("Clinique Aldi").first().waitFor({ timeout: 10000 });
  await v.getByText("Non vérifié").first().waitFor({ timeout: 10000 });
  await v.goto(`${BASE}/cliniques`, NI);
  assert((await v.evaluate(() => document.documentElement.scrollWidth)) <= 390, "défilement horizontal (établissements)");
  await shot(v, "18-etablissements-mobile");
  await c.close();
});

await step("administration : garde, laboratoires (masqué si à confirmer), examens et tarifs communiqués", async () => {
  const aCtx = await newCtx({ viewport: { width: 1280, height: 900 }, locale: "fr-FR" });
  const a = await login(aCtx, "admin");
  current = a;
  await a.goto(`${BASE}/admin/annuaire?vue=etablissements`, NI);
  await a.setInputFiles("#fac-file", { name: "labs.csv", mimeType: "text/csv", buffer: Buffer.from(
    "nom;type;region;ville;telephone;telephone2;publie;urgences_24h\n" +
    "Laboratoire Essai Alpha;laboratoire;District de Bamako;Bamako;20 22 00 01;76 00 11 22;oui;\n" +
    "Laboratoire Essai Beta;laboratoire;District de Bamako;Bamako;20 22 00 02;;oui;\n" +
    "Laboratoire Essai Gamma;laboratoire;District de Bamako;Bamako;20 22 00 03;;non;\n" +
    "Urgences Essai;urgences;District de Bamako;Bamako;20 22 00 04;;oui;oui\n", "utf8") });
  await a.getByRole("button", { name: "Importer" }).click();
  await a.getByText(/4 établissement\(s\) importé\(s\)/).waitFor({ timeout: 20000 });
  if (DATA) {
    await a.setInputFiles("#fac-file", `${DATA}/laboratoires-dpm-2023.csv`);
    await a.getByRole("button", { name: "Importer" }).click();
    await a.getByText(/19 établissement\(s\) importé\(s\), 0 doublon\(s\) ignoré\(s\), 0 ligne\(s\) en erreur/).waitFor({ timeout: 20000 });
  }
  await a.goto(`${BASE}/admin/services?vue=examens`, NI);
  await a.setInputFiles("#ex-file", { name: "examens.csv", mimeType: "text/csv", buffer: Buffer.from(
    "etablissement;examen;prix;delai;source\nLaboratoire Essai Alpha;nfs;5 000;24 h;Appel au laboratoire\nLaboratoire Essai Beta;nfs;4000;;Appel au laboratoire\n" +
    "Laboratoire Essai Beta;glycemie;;;Appel au laboratoire\nLaboratoire Inconnu;nfs;1000;;x\n", "utf8") });
  await a.getByRole("button", { name: "Importer" }).click();
  await a.getByText(/3 examen\(s\) proposé\(s\) importé\(s\), 1 ligne\(s\) en erreur.*introuvable/).waitFor({ timeout: 20000 });
  await a.goto(`${BASE}/admin/services?vue=garde`, NI);
  await a.selectOption("#duty-target", { label: "Pharmacie DÉMO des Collines — Commune IV" });
  const iso = (d) => new Date(d).toISOString().slice(0, 16);
  await a.fill("#duty-s", iso(Date.now() - 3600_000));
  await a.fill("#duty-e", iso(Date.now() + 20 * 3600_000));
  await a.fill("#duty-so", "Tableau de garde de test");
  await a.getByRole("button", { name: "Ajouter" }).click();
  await a.getByText("Garde enregistrée.").first().waitFor({ timeout: 10000 });
  await a.getByText(/Tableau de garde de test/).first().waitFor({ timeout: 10000 });
  await aCtx.close();
});

await step("public : pharmacies de garde, comparaison des tarifs de laboratoire, urgences (mobile)", async () => {
  const c = await newCtx(mobile);
  const v = await c.newPage();
  current = v;
  await v.goto(`${BASE}/garde`, NI);
  await v.getByText("Pharmacie DÉMO des Collines").first().waitFor({ timeout: 10000 });
  await v.getByText(/Source : Tableau de garde de test/).first().waitFor({ timeout: 10000 });
  assert((await v.evaluate(() => document.documentElement.scrollWidth)) <= 390, "défilement horizontal (garde)");
  await shot(v, "19-garde-mobile");
  await v.getByRole("link", { name: "Pharmacie DÉMO des Collines" }).first().click();
  await v.getByText("De garde en ce moment").first().waitFor({ timeout: 10000 });
  await v.goto(`${BASE}/laboratoires`, NI);
  await v.getByText("Laboratoire Essai Alpha").first().waitFor({ timeout: 10000 });
  assert(!(await v.getByText("Laboratoire Essai Gamma").count()), "un laboratoire non publié est visible");
  if (DATA) {
    await v.goto(`${BASE}/laboratoires?q=algi`, NI);
    await v.getByText("Autorisé — liste DPM").first().waitFor({ timeout: 10000 });
    await v.goto(`${BASE}/laboratoires?q=bio%207`, NI);
    assert(!(await v.getByText("BIO 7", { exact: true }).count()), "un laboratoire dont l'autorisation est en cours est publié");
    await v.goto(`${BASE}/laboratoires`, NI);
  }
  await v.selectOption("select[name=examen]", { label: "Numération formule sanguine (NFS)" });
  await v.getByRole("button", { name: "Rechercher" }).click();
  await v.waitForURL(/examen=/);
  await v.getByRole("link", { name: "Comparer les tarifs communiqués" }).click();
  await v.waitForURL(/tri=prix/);
  await v.waitForLoadState("networkidle");
  const names = await v.locator("main li p.text-base").allInnerTexts();
  assert(names[0] === "Laboratoire Essai Beta" && names[1] === "Laboratoire Essai Alpha", `ordre des tarifs inattendu : ${names.join(", ")}`);
  await v.getByText("4 000 FCFA").first().waitFor();
  await v.getByText("Résultat : 24 h").first().waitFor();
  assert((await v.evaluate(() => document.documentElement.scrollWidth)) <= 390, "défilement horizontal (laboratoires)");
  await shot(v, "20-laboratoires-mobile");
  await v.goto(`${BASE}/urgences`, NI);
  await v.getByText("Urgences Essai").first().waitFor({ timeout: 10000 });
  await v.getByText(/pharmacie\(s\) de garde en ce moment/).first().waitFor({ timeout: 10000 });
  assert((await v.evaluate(() => document.documentElement.scrollWidth)) <= 390, "défilement horizontal (urgences)");
  await shot(v, "21-urgences-mobile");
  // Consultés récemment : la pharmacie ouverte plus haut est retrouvée sur l'accueil et hors connexion
  await v.goto(`${BASE}/offline`, NI);
  await v.getByText("Vos contacts consultés récemment").waitFor({ timeout: 10000 });
  await v.getByText("Pharmacie DÉMO des Collines").first().waitFor({ timeout: 10000 });
  await c.close();
});

await step("alerte de disponibilité : demande anonyme visible du pharmacien, notification au retour en stock", async () => {
  const cCtx2 = await newCtx(mobile);
  const c = await login(cCtx2, "customer");
  current = c;
  await c.goto(`${BASE}/recherche?q=demo%20gel`, NI);
  await c.getByRole("link", { name: /DÉMO Gel hydroalcoolique/ }).first().click();
  await c.waitForURL(/\/produits\//);
  await c.waitForLoadState("networkidle");
  await c.selectOption("select[name=region]", { label: "District de Bamako" });
  await c.selectOption("select[name=commune]", { label: "Commune III" });
  await c.getByRole("button", { name: "Filtrer" }).click();
  await c.waitForURL(/commune=/);
  await c.getByText("Introuvable pour l'instant ?").waitFor({ timeout: 10000 });
  await c.getByRole("button", { name: "M'alerter" }).click();
  await c.getByText(/Alerte créée/).first().waitFor({ timeout: 10000 });
  await c.goto(`${BASE}/compte/alertes`, NI);
  await c.getByText(/En attente/).first().waitFor({ timeout: 10000 });
  await shot(c, "22-alertes-mobile");

  const pCtx = await newCtx(mobile);
  const p = await login(pCtx, "pharmacist1");
  current = p;
  await p.goto(`${BASE}/pharmacien`, NI);
  await p.getByText("Recherchés dans votre zone").waitFor({ timeout: 10000 });
  await p.locator("li").filter({ hasText: "DÉMO Gel hydroalcoolique" }).getByText("1 personne").waitFor({ timeout: 10000 });
  await p.goto(`${BASE}/pharmacien/stocks?q=gel`, NI);
  const row = () => p.locator("li").filter({ hasText: "DÉMO Gel hydroalcoolique" }).first();
  await row().locator("input[name=quantity]").fill("6");
  await row().locator("input[name=is_available]").check();
  await act(p, () => row().getByRole("button", { name: "Enregistrer" }).click(), () => row().getByText(/Libre : 6/));
  await pCtx.close();

  current = c;
  await c.goto(`${BASE}/compte/notifications`, NI);
  await c.getByText("Médicament disponible").first().waitFor({ timeout: 10000 });
  await c.getByText(/DÉMO Gel hydroalcoolique 100 ml est déclaré disponible chez Pharmacie DÉMO du Fleuve/).first().waitFor({ timeout: 10000 });
  await c.goto(`${BASE}/compte/alertes`, NI);
  await c.getByText(/Disponibilité signalée/).first().waitFor({ timeout: 10000 });
  await cCtx2.close();
});

await step("contact : un visiteur écrit, l'administration reçoit et traite le message", async () => {
  const c = await newCtx(mobile);
  const v = await c.newPage();
  current = v;
  await v.goto(`${BASE}/garde`, NI);
  await v.getByRole("link", { name: "Signalez-la-nous" }).click();
  await v.waitForURL(/\/infos\/contact\?sujet=erreur/);
  await v.getByText("Écrire à PharmaProxi").waitFor({ timeout: 10000 });
  assert((await v.locator("#c-topic").inputValue()) === "erreur", "sujet non prérempli");
  await v.fill("#c-name", "Visiteur Test");
  await v.fill("#c-phone", "76 12 34 56");
  await v.fill("#c-message", "La pharmacie de garde indiquée cette nuit était fermée.");
  await v.getByRole("button", { name: "Envoyer le message" }).click();
  await v.getByText(/votre message a bien été envoyé/).first().waitFor({ timeout: 10000 });
  assert((await v.evaluate(() => document.documentElement.scrollWidth)) <= 390, "défilement horizontal (contact)");
  await shot(v, "29-contact-mobile");
  await c.close();
  const aCtx = await newCtx({ viewport: { width: 1280, height: 900 }, locale: "fr-FR" });
  const a = await login(aCtx, "admin");
  current = a;
  await a.goto(`${BASE}/admin/messages`, NI);
  const card = a.locator("li", { hasText: "Visiteur Test" }).first();
  await card.getByText("La pharmacie de garde indiquée cette nuit était fermée.").waitFor({ timeout: 10000 });
  await card.getByPlaceholder(/Note interne/).fill("Rappelé, garde corrigée");
  await card.getByRole("button", { name: "Traité" }).click();
  await a.getByText("Message mis à jour.").first().waitFor({ timeout: 10000 });
  await a.goto(`${BASE}/admin/messages?statut=closed`, NI);
  await a.locator("li", { hasText: "Visiteur Test" }).first().waitFor({ timeout: 10000 });
  await aCtx.close();
});

await step("annonces : e-mail de bienvenue à l'inscription, annonce à tous (compte + e-mail), bienvenue jamais en double", async () => {
  const { readdirSync, readFileSync: rf } = await import("node:fs");
  const MAILDIR = process.env.E2E_MAIL_DIR;
  const mails = () => (MAILDIR ? readdirSync(MAILDIR).map((f) => rf(`${MAILDIR}/${f}`, "utf8")) : []);
  if (MAILDIR) {
    const welcome = mails().find((m) => m.includes(newEmail) && /Bienvenue sur PharmaProxi/.test(m));
    assert(welcome, "e-mail de bienvenue non envoyé à l'inscription");
  }
  const aCtx = await newCtx({ viewport: { width: 1280, height: 900 }, locale: "fr-FR" });
  const a = await login(aCtx, "admin");
  current = a;
  a.on("dialog", (dlg) => dlg.accept());
  await a.goto(`${BASE}/admin/annonces?modele=bienvenue`, NI);
  await a.getByRole("button", { name: "Envoyer l'annonce" }).click();
  await a.getByText(/Annonce envoyée : 0 notification\(s\)/).first().waitFor({ timeout: 30000 }); // déjà reçue à l'inscription
  if (MAILDIR) assert(!mails().filter((m) => m.includes(newEmail) && /Bienvenue sur PharmaProxi/.test(m)).slice(1).length, "bienvenue envoyée deux fois par e-mail");
  await a.goto(`${BASE}/admin/annonces?modele=libre`, NI);
  await a.fill("#an-title", "Nouveau : pharmacies de garde");
  await a.fill("#an-body", "Retrouvez désormais les pharmacies de garde de votre commune.");
  await a.fill("#an-link", "/garde");
  await a.getByRole("button", { name: "Envoyer l'annonce" }).click();
  await a.getByText(/Annonce envoyée : [1-9]\d* notification\(s\)/).first().waitFor({ timeout: 30000 });
  if (MAILDIR) {
    await a.getByText(/E-mails : [1-9]\d* envoyé\(s\)/).first().waitFor({ timeout: 5000 });
    const m = mails().find((x) => x.includes(newEmail) && x.includes("Nouveau : pharmacies de garde"));
    assert(m && m.includes("/garde"), "e-mail d'annonce non reçu");
    assert(!mails().some((x) => /^X-RCPT: .*pharmaproxi\.invalid/m.test(x)), "un compte de démonstration a reçu un e-mail");
  }
  await a.locator("li", { hasText: "Nouveau : pharmacies de garde" }).getByText(/1 e-mail\(s\)|notification/).first().waitFor({ timeout: 10000 }); // historique
  await shot(a, "30-annonces-admin");
  await aCtx.close();
});

await step("santé essentielle : accueil, rubrique mariage, groupes sanguins, simulateur drépanocytose (mobile, sans compte)", async () => {
  const c = await newCtx(mobile);
  const v = await c.newPage();
  current = v;
  await v.goto(`${BASE}/sante`, NI);
  await v.getByRole("heading", { name: "Santé essentielle", level: 1 }).waitFor({ timeout: 10000 });
  await v.getByText("Comprendre sa santé, prévenir les risques et prendre les bonnes décisions.").waitFor();
  await v.getByText("Les fiches essentielles sont en cours de relecture").waitFor();
  assert((await v.evaluate(() => document.documentElement.scrollWidth)) <= 390, "défilement horizontal (santé)");
  await shot(v, "31-sante-accueil-mobile");
  await v.getByRole("link", { name: /Avant le mariage : les examens de santé à connaître/ }).click();
  await v.waitForURL(/\/sante\/mariage/);
  await v.getByText("En cours de validation médicale").waitFor({ timeout: 10000 });
  await v.getByText("Drépanocytose : comprendre les profils AA, AS et SS").waitFor();
  // Groupes sanguins : transfusion puis grossesse
  await v.getByRole("button", { name: "O-", exact: true }).first().click();
  await v.getByText("Une personne O- peut recevoir des globules rouges de :").waitFor();
  await v.getByRole("tab", { name: "Grossesse et Rhésus" }).click();
  await v.getByText("Ce n'est pas une raison de ne pas se marier ni de renoncer à avoir des enfants.").waitFor();
  // Simulateur : AS × AS par défaut, puis SS × AA
  const sim = v.locator("section", { has: v.getByRole("heading", { name: /comment se transmet-elle/ }) });
  await sim.getByText("SS — drépanocytose (forme SS)").waitFor();
  const pcts = await sim.locator("li span.tabular-nums").allInnerTexts();
  assert(pcts.join(",") === "25 %,50 %,25 %", `probabilités AS×AS inattendues : ${pcts}`);
  await sim.getByRole("radiogroup", { name: "Profil du premier parent" }).getByText("SS", { exact: true }).click();
  await sim.getByRole("radiogroup", { name: "Profil du second parent" }).getByText("AA", { exact: true }).click();
  await sim.getByText("100 %").waitFor();
  await sim.getByText("AS — porteur du trait drépanocytaire").waitFor();
  assert((await v.evaluate(() => document.documentElement.scrollWidth)) <= 390, "défilement horizontal (mariage)");
  await shot(v, "32-sante-mariage-mobile");
  // Brouillon non publié : introuvable pour le public
  await v.goto(`${BASE}/sante/fiche/avant-mariage-groupe-sanguin-abo`, NI);
  await v.getByText("Page introuvable").first().waitFor({ timeout: 10000 });
  assert(!(await v.getByText("Connaître son groupe sanguin").count()), "brouillon visible du public");
  await c.close();
});

await step("santé essentielle : rôle validateur, soumission, validation par un médecin, publication, recherche, signalement", async () => {
  const aCtx = await newCtx({ viewport: { width: 1280, height: 900 }, locale: "fr-FR" });
  const a = await login(aCtx, "admin");
  current = a;
  a.on("dialog", (dlg) => dlg.accept());
  await a.goto(`${BASE}/redaction-sante`, NI);
  await a.fill("#hs-email", mail("doctor1"));
  await a.fill("#hs-name", "Dr Démo Aminata, cardiologue");
  await a.getByRole("button", { name: "Attribuer" }).click();
  await a.getByText("Rôle attribué.").first().waitFor({ timeout: 10000 });
  await a.goto(`${BASE}/redaction-sante?statut=draft`, NI);
  await a.getByRole("link", { name: "Groupe sanguin ABO", exact: true }).click();
  await a.waitForURL(/\/redaction-sante\/[0-9a-f-]{36}$/);
  const url = a.url();
  await a.getByRole("button", { name: "Soumettre à la validation médicale" }).click();
  await a.getByText("Fiche soumise à la validation médicale.").first().waitFor({ timeout: 10000 });
  await shot(a, "33-redaction-sante");
  await aCtx.close();

  const dCtx = await newCtx(mobile);
  const d = await login(dCtx, "doctor1");
  current = d;
  d.on("dialog", (dlg) => dlg.accept());
  await d.goto(`${BASE}/redaction-sante?statut=in_review`, NI);
  await d.getByRole("link", { name: "Groupe sanguin ABO", exact: true }).click();
  await d.waitForURL(url);
  await d.getByRole("button", { name: "Valider la fiche" }).click();
  await d.getByText(/Fiche validée/).first().waitFor({ timeout: 10000 });
  await d.getByRole("button", { name: "Publier la fiche" }).click();
  await d.getByText(/Fiche publiée/).first().waitFor({ timeout: 10000 });
  await dCtx.close();

  const c = await newCtx(mobile);
  const v = await c.newPage();
  current = v;
  await v.goto(`${BASE}/sante/recherche?q=groupe%20sanguin`, NI);
  await v.getByText("Comprendre les groupes sanguins").waitFor({ timeout: 10000 });
  await v.getByRole("link", { name: "Groupe sanguin ABO" }).first().click();
  await v.waitForURL(/\/sante\/fiche\/avant-mariage-groupe-sanguin-abo/);
  await v.getByText("Validée par Dr Démo Aminata, cardiologue").waitFor({ timeout: 10000 });
  await v.getByRole("heading", { name: "Sources médicales" }).waitFor();
  await v.getByText("Manuel MSD").first().waitFor();
  await v.getByText("Deux personnes de groupes sanguins différents ne peuvent pas se marier.", { exact: false }).waitFor();
  assert((await v.evaluate(() => document.documentElement.scrollWidth)) <= 390, "défilement horizontal (fiche)");
  await shot(v, "34-sante-fiche-mobile");
  await v.getByText("Signaler une information obsolète ou erronée").click();
  await v.fill("#report-reason", "Le lien vers la deuxième source ne s'ouvre plus.");
  await v.getByRole("button", { name: "Envoyer le signalement" }).click();
  await v.getByText(/l'équipe éditoriale va vérifier/).first().waitFor({ timeout: 10000 });
  await v.goto(`${BASE}/sante`, NI);
  await v.getByRole("link", { name: "Groupe sanguin ABO" }).first().waitFor({ timeout: 10000 }); // informations essentielles
  // Un client ne peut pas entrer dans l'espace de rédaction
  await c.close();
  const cu = await newCtx(mobile);
  const cp = await login(cu, "customer");
  current = cp;
  await cp.goto(`${BASE}/redaction-sante`, NI);
  await cp.waitForURL(/acces-refuse/);
  await cu.close();
});

await step("guides audio : administration (avancement, kit), lecteur multilingue sur l'accueil", async () => {
  const aCtx = await newCtx({ viewport: { width: 1280, height: 900 }, locale: "fr-FR" });
  const a = await login(aCtx, "admin");
  current = a;
  await a.goto(`${BASE}/admin/audio`, NI);
  await a.getByRole("heading", { name: "Guides audio en langues nationales" }).waitFor({ timeout: 10000 });
  for (const l of ["Bambara", "Peul", "Soninké", "Songhaï", "Tamasheq", "Dogon"]) await a.getByRole("columnheader", { name: l }).waitFor();
  await a.locator("table").getByRole("link", { name: "Urgences" }).click();
  await a.waitForURL(/\/admin\/audio\/urgences/);
  await a.getByText("Texte à faire traduire oralement").waitFor();
  await a.getByText("Vérifiée par (second locuteur)").first().waitFor();
  await a.goto(`${BASE}/admin/audio/kit`, NI);
  await a.getByText("Consignes pour la personne qui enregistre").waitFor();
  await a.getByText(/Bienvenue sur PharmaProxi\. Ce site vous aide/).waitFor();
  await aCtx.close();
  // Le stockage de fichiers n'est pas émulé localement : enregistrements publiés insérés directement
  const { execSync } = await import("node:child_process");
  execSync(`psql postgres://postgres@localhost:54322/pp_e2e -qc "insert into public.audio_clips (target_key, lang, storage_path, mime, size_bytes, duration_s, speaker, reviewer, status, published_at) values ('accueil', 'francais', 'accueil/francais-test.mp3', 'audio/mpeg', 1000, 75, 'Voix test', null, 'published', now()), ('accueil', 'bambara', 'accueil/bambara-test.mp3', 'audio/mpeg', 1000, 80, 'Kumabaga test', 'Relecteur', 'published', now()) on conflict do nothing"`);
  const c = await newCtx(mobile);
  const v = await c.newPage();
  current = v;
  await v.goto(`${BASE}/`, NI);
  await v.getByRole("button", { name: /Écouter cette page/ }).click();
  await v.getByRole("radio", { name: /Bambara/ }).click();
  const src = await v.locator("audio").getAttribute("src");
  assert(/\/storage\/v1\/object\/public\/audio-guides\/accueil\/bambara-test\.mp3$/.test(src ?? ""), `adresse audio inattendue : ${src}`);
  await v.getByText(/Voix : Kumabaga test/).waitFor();
  await v.reload(NI);
  await v.getByRole("button", { name: /Écouter cette page/ }).click();
  assert((await v.getByRole("radio", { name: /Bambara/ }).getAttribute("aria-checked")) === "true", "la langue choisie n'est pas mémorisée");
  assert((await v.evaluate(() => document.documentElement.scrollWidth)) <= 390, "défilement horizontal (lecteur audio)");
  await shot(v, "35-audio-accueil-mobile");
  await v.goto(`${BASE}/garde`, NI);
  assert(!(await v.getByRole("button", { name: /Écouter cette page/ }).count()), "lecteur affiché sans enregistrement publié");
  await c.close();
});

await step("assistant santé : réponse en flux, urgence détectée sans IA, liens sûrs (mobile, sans compte)", async () => {
  const c = await newCtx(mobile);
  const v = await c.newPage();
  current = v;
  await v.goto(`${BASE}/`, NI);
  await v.getByRole("link", { name: /Assistant santé : posez votre question/ }).click();
  await v.waitForURL(/\/assistant$/);
  await v.getByText("L'assistant ne remplace pas un médecin ni un pharmacien.").waitFor({ timeout: 10000 });
  await v.getByRole("button", { name: /J'ai mal à la tête depuis ce matin/ }).click();
  await v.getByText(/Réponse de test à : « J'ai mal à la tête/).waitFor({ timeout: 15000 });
  const link = v.getByRole("link", { name: "Trouver du paracétamol près de chez moi" });
  await link.waitFor();
  assert((await link.getAttribute("href")) === "/recherche?q=paracetamol", "lien de recherche inattendu");
  // Signe de gravité : réponse fixe d'orientation vers les urgences
  await v.getByLabel("Votre question de santé").fill("Mon père a une forte douleur dans la poitrine et il transpire");
  await v.getByRole("button", { name: "Envoyer la question" }).click();
  await v.getByText(/peut être une urgence/).waitFor({ timeout: 10000 });
  await v.getByText(/rendez-vous immédiatement au service d'urgence le plus proche/).waitFor();
  assert((await v.locator("[data-role=assistant]").count()) === 2, "nombre de réponses inattendu");
  assert((await v.evaluate(() => document.documentElement.scrollWidth)) <= 390, "défilement horizontal (assistant)");
  await shot(v, "36-assistant-mobile");
  await v.getByRole("button", { name: "Nouvelle conversation" }).click();
  await v.getByRole("button", { name: /Comment se protéger du paludisme/ }).waitFor();
  // Contrôles côté serveur
  const r1 = await v.request.post(`${BASE}/api/assistant`, { data: { messages: [] } });
  assert(r1.status() === 400, `conversation vide acceptée (${r1.status()})`);
  const r2 = await v.request.post(`${BASE}/api/assistant`, { data: { messages: [{ role: "user", content: "x".repeat(1200) }] } });
  assert(r2.status() === 400, `question trop longue acceptée (${r2.status()})`);
  const r3 = await v.request.post(`${BASE}/api/assistant`, { data: { messages: [{ role: "user", content: "J'ai pris trop de comprimés" }] } });
  assert(r3.headers()["x-assistant"] === "urgence", "intoxication non détectée");
  const n = execSyncText(`psql postgres://postgres@localhost:54322/pp_e2e -tAc "select requests || ',' || emergencies from public.assistant_usage"`);
  assert(n === "1,2", `compteur inattendu : ${n}`);
  await c.close();
  // Bureau (1280 px) : en-tête sur une ligne, menus « Santé » et « Services », menu du compte
  const dCtx = await newCtx({ viewport: { width: 1280, height: 900 }, locale: "fr-FR" });
  const d = await login(dCtx, "admin");
  current = d;
  await d.goto(`${BASE}/assistant`, NI);
  const nav = d.getByRole("navigation", { name: "Navigation principale" });
  await nav.getByRole("button", { name: "Santé" }).click();
  await nav.getByRole("link", { name: /PharmaProxi Femme/ }).waitFor();
  await nav.getByRole("link", { name: /Assistant santé/ }).waitFor();
  await d.keyboard.press("Escape");
  await nav.getByRole("button", { name: "Services" }).click();
  await nav.getByRole("link", { name: /Pharmacies de garde/ }).waitFor();
  await d.keyboard.press("Escape");
  const navBox = await nav.boundingBox();
  const bell = await d.getByRole("link", { name: /^Notifications/ }).first().boundingBox();
  assert(navBox.height < 60 && navBox.x + navBox.width <= bell.x, "en-tête qui déborde (administrateur, 1280 px)");
  await d.locator("header").getByRole("button", { name: /Admin|Démo/ }).click();
  await d.getByRole("link", { name: "Administration", exact: true }).waitFor();
  assert((await d.evaluate(() => document.documentElement.scrollWidth)) <= 1280, "défilement horizontal (bureau)");
  await shot(d, "37-assistant-bureau");
  await dCtx.close();
});

await step("menu mobile : toutes les rubriques classées, sans bande à faire défiler", async () => {
  const c = await newCtx(mobile);
  const v = await c.newPage();
  current = v;
  await v.goto(`${BASE}/`, NI);
  await v.getByRole("button", { name: "Menu" }).click();
  const menu = v.getByRole("navigation", { name: "Menu", exact: true });
  for (const l of ["Médicaments", "Rendez-vous", "Santé essentielle", "Assistant santé", "PharmaProxi Femme", "Pharmacies de garde", "Laboratoires et examens", "Urgences", "Se connecter"])
    await menu.getByRole("link", { name: new RegExp(l) }).first().waitFor();
  assert((await v.evaluate(() => document.documentElement.scrollWidth)) <= 390, "défilement horizontal (menu)");
  await shot(v, "38-menu-mobile");
  await menu.getByRole("link", { name: /Pharmacies de garde/ }).click();
  await v.waitForURL(/\/garde/);
  await v.getByRole("heading", { level: 1 }).first().waitFor({ timeout: 10000 });
  assert(!(await v.getByRole("navigation", { name: "Menu", exact: true }).count()), "le menu reste ouvert après navigation");
  await c.close();
});

await step("PharmaProxi Femme : activation, cycle, journal, code secret, partage sans données, export, suppression (mobile)", async () => {
  const c = await newCtx(mobile);
  const v = await c.newPage();
  current = v;
  await v.goto(`${BASE}/femme`, NI);
  await v.getByText("Un espace privé pour votre santé de femme").waitFor({ timeout: 10000 });
  await c.close();
  const cc = await newCtx(mobile);
  const f = await login(cc, "customer");
  current = f;
  await f.goto(`${BASE}/femme`, NI);
  await f.getByRole("heading", { name: "Créer votre espace" }).waitFor({ timeout: 10000 });
  await f.getByText("25 à 34 ans").click();
  await f.getByText("Suivre mon cycle").click();
  const tenDaysAgo = new Date(Date.now() - 10 * 86400000).toISOString().slice(0, 10);
  await f.locator("input[name=last_period]").fill(tenDaysAgo);
  await f.locator("input[name=cycle_length]").fill("28");
  // Sans la déclaration, le navigateur bloque l'envoi
  await f.locator("input[name=consent]").check();
  await f.getByRole("button", { name: "Créer mon espace privé" }).click();
  assert(f.url().endsWith("/femme"), "envoi sans déclaration");
  await f.locator("input[name=declared_woman]").check();
  await f.getByRole("button", { name: "Créer mon espace privé" }).click();
  await f.getByText("Jour 11").waitFor({ timeout: 10000 });
  await f.getByText(/Période fertile estimée/).waitFor();
  assert((await f.evaluate(() => document.documentElement.scrollWidth)) <= 390, "défilement horizontal (accueil Femme)");
  await shot(f, "39-femme-accueil-mobile");
  // Journal du jour
  await f.getByRole("link", { name: /Noter ma journée/ }).click();
  await f.getByText("Crampes", { exact: true }).click();
  await f.getByText("Fatigue", { exact: true }).click();
  await f.locator("label", { hasText: /^6$/ }).click();
  await f.locator("textarea[name=note]").fill("Note privée de test");
  await f.getByRole("button", { name: "Enregistrer ma journée" }).click();
  await f.getByText("Journée enregistrée.").waitFor({ timeout: 10000 });
  await shot(f, "40-femme-journal-mobile");
  await f.getByRole("navigation", { name: "Mon espace" }).getByRole("link", { name: "Calendrier" }).click();
  await f.getByText("Règles prévues").waitFor({ timeout: 10000 });
  assert((await f.evaluate(() => document.documentElement.scrollWidth)) <= 390, "défilement horizontal (calendrier)");
  await shot(f, "41-femme-calendrier-mobile");
  // Code secret puis verrouillage : la base refuse les données
  await f.goto(`${BASE}/femme/reglages`, NI);
  await f.locator("input[name=pin]").fill("2468");
  await f.locator("input[name=confirm]").first().fill("2468");
  await f.getByRole("button", { name: "Activer le code" }).click();
  await f.getByText(/Code secret enregistré/).waitFor({ timeout: 10000 });
  await f.getByRole("button", { name: "Verrouiller" }).click();
  await f.getByRole("heading", { name: "Espace verrouillé" }).waitFor({ timeout: 10000 });
  await f.goto(`${BASE}/femme/journal`, NI);
  await f.getByRole("heading", { name: "Espace verrouillé" }).waitFor();
  assert(!(await f.getByText("Crampes").count()), "données visibles alors que l'espace est verrouillé");
  const locked = await f.request.get(`${BASE}/femme/export`);
  assert(locked.status() === 403, `export possible verrouillé (${locked.status()})`);
  await shot(f, "42-femme-verrou-mobile");
  await f.locator("#pin").fill("1111");
  await f.getByRole("button", { name: "Ouvrir" }).click();
  await f.getByText(/Code incorrect/).waitFor({ timeout: 10000 });
  await f.locator("#pin").fill("2468");
  await f.getByRole("button", { name: "Ouvrir" }).click();
  await f.getByText("Symptômes les plus fréquents").waitFor({ timeout: 10000 });
  // Export (note déchiffrée, aucun secret)
  const ex = await (await f.request.get(`${BASE}/femme/export`)).json();
  assert(ex.journal[0].note === "Note privée de test" && ex.regles.length === 1 && !("pin_hash" in ex.profil), "export inattendu");
  // Note chiffrée dans la base si la clé est configurée
  const stored = execSyncText(`psql postgres://postgres@localhost:54322/pp_e2e -tAc "select note from public.femme_days limit 1"`);
  assert(process.env.FEMME_ENCRYPTION_KEY ? stored.startsWith("v1:") : stored === "Note privée de test", `note stockée inattendue : ${stored.slice(0, 20)}`);
  // Partage partenaire : contenus choisis, aucune donnée personnelle
  await f.goto(`${BASE}/femme/reglages`, NI);
  await f.locator("label", { hasText: "Accompagner une femme enceinte" }).click();
  await f.getByRole("button", { name: "Créer le lien de partage" }).click();
  await f.getByText(/Lien à envoyer/).waitFor({ timeout: 10000 });
  const link = (await f.locator("span.select-all").innerText()).trim();
  const pc = await newCtx(mobile);
  const pp = await pc.newPage();
  await pp.goto(link.replace(/^https?:\/\/[^/]+/, BASE), NI);
  await pp.getByText("Accompagner une femme enceinte").waitFor({ timeout: 10000 });
  const txt = await pp.locator("main").innerText();
  assert(!/Crampes|Jour 11|Note privée|Démo/.test(txt), "données personnelles sur la page partenaire");
  await pc.close();
  // Suppression totale
  await f.locator("summary", { hasText: "Supprimer définitivement" }).click();
  await f.locator("input[name=confirm]").last().fill("SUPPRIMER");
  await f.getByRole("button", { name: "Tout supprimer" }).click();
  await f.getByRole("heading", { name: "Créer votre espace" }).waitFor({ timeout: 10000 });
  const left = execSyncText(`psql postgres://postgres@localhost:54322/pp_e2e -tAc "select (select count(*) from public.femme_days) + (select count(*) from public.femme_periods) + (select count(*) from public.femme_profiles)"`);
  assert(left === "0", `données restantes après suppression : ${left}`);
  await cc.close();
});

await step("aucune erreur JavaScript ni erreur serveur, dans tous les espaces", async () => {
  const all = [...consoleErrors, ...pageErrors];
  assert(all.length === 0, all.slice(0, 5).join(" | "));
});

await browser.close();
console.log(`\n${passed} étape(s) réussie(s), ${failures.length} échec(s), ${reloads} blocage(s) d'interface.`);
process.exit(failures.length || reloads ? 1 : 0);
