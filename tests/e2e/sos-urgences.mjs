import { chromium, devices } from "playwright";
const BASE = "http://localhost:3000"; const out = "/tmp/claude-0/pitch/";
const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) process.exitCode = 1; };
const b = await chromium.launch();

// 1. Mobile : page SOS, liens tel:, copie
const m = await b.newContext({ ...devices["Pixel 7"], locale: "fr-FR", permissions: ["clipboard-read", "clipboard-write"] });
const p = await m.newPage();
await p.goto(`${BASE}/sos`, { waitUntil: "networkidle" });
ok(await p.getByText("Numéros d'urgence au Mali").isVisible(), "titre de la rubrique visible");
ok((await p.locator('a[href="tel:122"]').count()) === 1, "lien tel:122 présent");
ok((await p.locator('a[href="tel:+22380001201"]').count()) === 1, "numéro complémentaire avec indicatif +223");
ok(!(await p.locator('a[href="tel:15"], a[href="tel:17"], a[href="tel:18"]').count()), "aucun 15/17/18");
ok(await p.getByText("En cas d'urgence vitale, contactez immédiatement").isVisible(), "message de sécurité affiché");
ok(await p.getByText("ne remplace pas les services de secours").isVisible(), "avertissement SantéProxi affiché");
await p.getByRole("button", { name: /Copier le numéro Protection civile 122/ }).click();
ok((await p.evaluate(() => navigator.clipboard.readText())) === "122", "copie du 122 dans le presse-papiers");
ok(await p.getByText("Copié").first().isVisible(), "retour « Copié » affiché");
const overflow = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
ok(!overflow, "pas de débordement horizontal sur mobile");
await p.screenshot({ path: out + "sos_mobile.png", fullPage: true });

// 2. Accueil mobile : slogan + accès SOS
const h = await m.newPage();
await h.goto(`${BASE}/`, { waitUntil: "networkidle" });
const slogan = h.getByText("La santé, plus proche de vous.").first();
const box = await slogan.boundingBox();
ok(!!box && box.y + box.height <= 915, `slogan visible sans défiler (y=${box && Math.round(box.y)})`);
ok(await h.locator('a[href="/sos"]').filter({ hasText: "numéros d'urgence" }).count() === 1, "bandeau SOS sur l'accueil");
ok(await h.getByText("Mieux vivre, mieux se soigner.").count() >= 1, "signature secondaire dans le pied de page");
ok(!(await h.getByText("Toute la santé, près de chez vous").count()), "ancien slogan absent du texte");
await h.screenshot({ path: out + "home_mobile.png" });

// 3. Administration : modifier le statut, masquer, ajouter, supprimer
const a = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: "fr-FR" });
const ap = await a.newPage();
await ap.goto(`${BASE}/connexion`); await ap.fill("#email", "demo.admin@pharmaproxi.invalid"); await ap.fill("#password", process.env.DEMO_PASSWORD);
await ap.click("button[type=submit]"); await ap.waitForURL((u) => !u.pathname.startsWith("/connexion"), { timeout: 15000 });
await ap.goto(`${BASE}/admin/urgences`, { waitUntil: "networkidle" });
ok(await ap.getByRole("heading", { name: /numéros d'urgence/ }).isVisible(), "page d'administration accessible");
// ajout
const add = ap.locator("form").first();
await add.locator('[name=name]').fill("Test SAMU fictif"); await add.locator('[name=phone]').fill("99 99 99 99");
await add.locator('[name=mission]').fill("Ligne de test"); await add.locator('[name=tier]').selectOption("complementaire");
await add.getByRole("button", { name: "Ajouter" }).click();
await ap.getByText("Contact ajouté.").waitFor({ timeout: 8000 });
ok(true, "ajout d'un numéro");
// passage en vérifié sans source -> refus
await ap.reload({ waitUntil: "networkidle" });
const item = ap.locator("li", { hasText: "Test SAMU fictif" });
await item.locator("summary").click();
await item.locator('[name=status]').selectOption("verifie");
await item.getByRole("button", { name: "Enregistrer" }).click();
ok(await item.getByText(/doit avoir une source/).waitFor({ timeout: 8000 }).then(() => true, () => false), "« vérifié » refusé sans source");
await item.locator('[name=source_note]').fill("appel de test");
await item.getByRole("button", { name: "Enregistrer" }).click();
ok(await item.getByText("Contact mis à jour.").waitFor({ timeout: 8000 }).then(() => true, () => false), "« vérifié » accepté avec une source");
// visible côté public puis masqué
const pub = await m.newPage(); await pub.goto(`${BASE}/sos`, { waitUntil: "networkidle" });
ok(await pub.locator('a[href="tel:+22399999999"]').count() >= 1, "numéro ajouté visible sur /sos");
await ap.reload({ waitUntil: "networkidle" });
const item2 = ap.locator("li", { hasText: "Test SAMU fictif" });
await item2.locator("summary").click();
await item2.locator('[name=active]').uncheck();
await item2.getByRole("button", { name: "Enregistrer" }).click();
await item2.getByText("Contact mis à jour.").waitFor({ timeout: 8000 });
await pub.reload({ waitUntil: "networkidle" });
ok((await pub.locator('a[href="tel:+22399999999"]').count()) === 0, "numéro masqué n'apparaît plus");
// suppression
await ap.reload({ waitUntil: "networkidle" });
const item3 = ap.locator("li", { hasText: "Test SAMU fictif" });
await item3.locator("summary").click();
ap.once("dialog", (d) => d.accept());
await item3.getByRole("button", { name: "Supprimer" }).click();
await ap.getByText("Contact supprimé.").waitFor({ timeout: 8000 }).catch(() => {});
await ap.reload({ waitUntil: "networkidle" });
ok((await ap.locator("li", { hasText: "Test SAMU fictif" }).count()) === 0, "suppression");
await ap.screenshot({ path: out + "admin.png", fullPage: false });
await b.close();
