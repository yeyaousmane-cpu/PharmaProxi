/**
 * Parcours de bout en bout dans un vrai navigateur (Chromium) contre une
 * application démarrée avec les données de démonstration.
 *   BASE_URL=http://localhost:3000 CHROME_PATH=/chemin/chromium DEMO_PASSWORD=... node tests/e2e/flows.mjs
 * Produit des captures d'écran mobiles dans tests/e2e/screenshots/.
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

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
  const moved = await page.waitForURL((u) => !u.pathname.startsWith("/connexion"), { timeout: 8000 }).then(() => true, () => false);
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

await step("aucune erreur JavaScript ni erreur serveur, dans tous les espaces", async () => {
  const all = [...consoleErrors, ...pageErrors];
  assert(all.length === 0, all.slice(0, 5).join(" | "));
});

await browser.close();
console.log(`\n${passed} étape(s) réussie(s), ${failures.length} échec(s), ${reloads} blocage(s) d'interface.`);
process.exit(failures.length || reloads ? 1 : 0);
