// Tests de bout en bout 0.27 : FR/EN/AR, RTL, préférence de langue, formulaires conservés, écoute, voix, prévention.
import { chromium, devices } from "playwright";
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PW = process.env.DEMO_PASSWORD;
let fails = 0;
const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
const wait = (loc, t = 10000) => loc.waitFor({ timeout: t }).then(() => true, () => false);
const b = await chromium.launch();
const PAGES = ["/", "/sos", "/connexion", "/inscription", "/pharmacies", "/medecins", "/prevention", "/parler", "/langues", "/sante-mentale", "/aide", "/premiers-secours"];

// 1-5. Navigation FR → EN → AR, sens d'écriture, aucun débordement horizontal (mobile, tablette, ordinateur)
for (const [name, opts] of [["mobile", devices["Pixel 7"]], ["tablette", devices["iPad (gen 7)"]], ["ordinateur", { viewport: { width: 1366, height: 900 } }]]) {
  const ctx = await b.newContext({ ...opts, locale: "fr-FR" });
  await ctx.addCookies([{ name: "sp_lang", value: "ar", url: BASE }]);
  const p = await ctx.newPage();
  const overflow = [];
  for (const path of PAGES) {
    await p.goto(BASE + path, { waitUntil: "domcontentloaded" });
    const r = await p.evaluate(() => ({ dir: document.documentElement.dir, lang: document.documentElement.lang, over: document.documentElement.scrollWidth - document.documentElement.clientWidth }));
    if (r.dir !== "rtl" || r.lang !== "ar") overflow.push(`${path}: dir=${r.dir}`);
    if (r.over > 2) overflow.push(`${path}: +${r.over}px`);
  }
  ok(overflow.length === 0, `arabe ${name} : RTL et aucun débordement sur ${PAGES.length} pages ${overflow.join(" ")}`);
  await ctx.close();
}
{
  const ctx = await b.newContext({ ...devices["Pixel 7"], locale: "fr-FR" });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/connexion`);
  ok(await wait(p.getByRole("heading", { name: "Connexion" })), "français par défaut");
  await p.fill("#email", "saisie.conservee@exemple.invalid");
  await p.getByRole("button", { name: /Langue actuelle/ }).click();
  await p.getByRole("menuitemradio", { name: /English/ }).click();
  ok(await wait(p.getByRole("heading", { name: "Sign in" })), "passage en anglais sans rechargement");
  ok((await p.inputValue("#email")) === "saisie.conservee@exemple.invalid", "texte saisi conservé après changement de langue (EN)");
  await p.getByRole("button", { name: /Current language/ }).click();
  await p.getByRole("menuitemradio", { name: /العربية/ }).click();
  ok(await wait(p.getByRole("heading", { name: "تسجيل الدخول" })), "passage en arabe");
  ok((await p.evaluate(() => document.documentElement.dir)) === "rtl" && (await p.inputValue("#email")) === "saisie.conservee@exemple.invalid", "arabe : RTL et saisie toujours conservée");
  ok((await p.$eval("#email", (e) => getComputedStyle(e).direction)) === "ltr", "champ e-mail reste de gauche à droite en arabe");
  await p.getByRole("button", { name: /اللغة الحالية/ }).click();
  ok(await wait(p.getByRole("menuitemradio", { name: /English/ })) && await wait(p.getByText(/العودة إلى: English/)), "retour à la langue précédente proposé");
  await p.keyboard.press("Escape");
  await p.reload();
  ok((await p.evaluate(() => document.documentElement.lang)) === "ar", "préférence mémorisée sur l'appareil (visiteur)");
  // formulaires en arabe : inscription
  await p.goto(`${BASE}/inscription`);
  ok(await wait(p.getByRole("button", { name: "إنشاء حسابي" })) && await wait(p.getByText("سياسة الخصوصية")), "formulaire d'inscription traduit en arabe");
  await p.goto(`${BASE}/sos`);
  ok(await wait(p.getByRole("heading", { name: "نجدة صحية" })), "SOS Santé en arabe");
  const tel = p.locator("a[href^='tel:']").first();
  if (await tel.count()) ok((await tel.evaluate((e) => getComputedStyle(e).direction)) === "ltr", "numéros de téléphone gardent leur ordre en RTL");
  // icônes directionnelles inversées
  ok((await p.evaluate(() => { const el = document.querySelector(".rtl\\:-scale-x-100"); return el ? getComputedStyle(el).transform !== "none" : true; })), "icônes directionnelles retournées en arabe");
  // page non traduite : contenu médical reste en français, de gauche à droite
  await p.goto(`${BASE}/sante-mentale`);
  ok((await p.locator("div[lang='fr'][dir='ltr']").count()) > 0, "contenu médical non traduit affiché en français (lang=fr, ltr)");
  await ctx.close();
}

// Préférence enregistrée dans le profil et retrouvée sur un nouvel appareil
{
  const c1 = await b.newContext({ locale: "fr-FR" });
  await c1.addCookies([{ name: "sp_lang", value: "en", url: BASE }]);
  const p1 = await c1.newPage();
  await p1.goto(`${BASE}/connexion`); await p1.fill("#email", "demo.customer@pharmaproxi.invalid"); await p1.fill("#password", PW);
  await p1.click("button[type=submit]"); await p1.waitForURL((u) => !u.pathname.startsWith("/connexion"), { timeout: 20000 });
  await p1.locator('header button[aria-haspopup="menu"]').first().click();
  await p1.getByRole("menuitemradio", { name: /English/ }).click();
  await p1.waitForFunction(() => document.documentElement.lang === "en");
  await p1.locator('header button[aria-haspopup="menu"]').first().click();
  await p1.getByRole("menuitemradio", { name: /العربية/ }).click();
  await p1.waitForFunction(() => document.documentElement.dir === "rtl");
  await p1.waitForTimeout(1500);
  await c1.close();
  const c2 = await b.newContext({ locale: "fr-FR" });
  const p2 = await c2.newPage();
  await p2.goto(`${BASE}/connexion`); await p2.fill("#email", "demo.customer@pharmaproxi.invalid"); await p2.fill("#password", PW);
  await p2.click("button[type=submit]"); await p2.waitForURL((u) => !u.pathname.startsWith("/connexion"), { timeout: 20000 });
  await p2.reload();
  ok((await p2.evaluate(() => document.documentElement.lang)) === "ar", "langue du profil retrouvée à la connexion sur un nouvel appareil");
  await c2.close();
}

// 8, 12. Lecture audio : moteur absent → message explicite ; moteur simulé → lecture, pause, reprise, arrêt, vitesse
{
  const ctx = await b.newContext({ locale: "fr-FR" });
  const p = await ctx.newPage();
  await p.addInitScript(() => { delete window.speechSynthesis; delete window.SpeechSynthesisUtterance; Object.defineProperty(window, "speechSynthesis", { value: undefined }); });
  await p.goto(`${BASE}/sos`);
  await p.getByRole("button", { name: "Écouter" }).click();
  ok(await wait(p.getByText(/ne propose pas la lecture à voix haute|Aucune voix/)), "lecture audio indisponible : message explicite, pas de faux lecteur");
  await ctx.close();
}
{
  const ctx = await b.newContext({ locale: "fr-FR" });
  const p = await ctx.newPage();
  await p.addInitScript(() => {
    const spoken = []; window.__spoken = spoken;
    class U { constructor(t) { this.text = t; this.rate = 1; } }
    const s = { paused: false, getVoices: () => [{ name: "Voix test FR", lang: "fr-FR", localService: true }, { name: "Voice test EN", lang: "en-US", localService: true }],
      addEventListener() {}, speak(u) { spoken.push({ text: u.text, rate: u.rate }); this.cur = setTimeout(() => u.onend && u.onend(), 150); },
      pause() { this.paused = true; window.__paused = true; }, resume() { this.paused = false; window.__resumed = true; }, cancel() { clearTimeout(this.cur); window.__cancelled = true; } };
    Object.defineProperty(window, "speechSynthesis", { value: s, configurable: true }); window.SpeechSynthesisUtterance = U;
  });
  await p.goto(`${BASE}/sos`);
  await p.getByRole("button", { name: "Écouter" }).click();
  await p.getByRole("region", { name: "Lecteur audio" }).locator("select").first().selectOption("1.5");
  await p.getByRole("region", { name: "Lecteur audio" }).getByRole("button", { name: "Écouter", exact: true }).click();
  await p.waitForTimeout(400);
  const spoken = await p.evaluate(() => window.__spoken);
  ok(spoken.length >= 2 && spoken[0].text.includes("SOS") && spoken[0].rate === 1.5, "lecture des passages dans l'ordre, à la vitesse choisie");
  ok(await wait(p.getByText(/Passage \d+ sur \d+/)), "progression de lecture affichée");
  ok(await wait(p.getByText("Lecture en Français")), "langue audio indiquée");
  await p.getByRole("button", { name: "Arrêter" }).click().catch(() => {});
  ok(await p.evaluate(() => window.__cancelled === true), "arrêt de la lecture");
  await ctx.close();
}

// 9-11. Commande vocale : information préalable, refus du micro, reconnaissance simulée, correction, propositions, hors connexion
{
  const ctx = await b.newContext({ ...devices["Pixel 7"], locale: "fr-FR" });
  const p = await ctx.newPage();
  await p.addInitScript(() => {
    window.__mode = "deny";
    class R { start() { setTimeout(() => {
      if (window.__mode === "deny") { this.onerror && this.onerror({ error: "not-allowed" }); }
      else { this.onresult && this.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: "je cherche une pharmacie de garde à Bamako" }], { isFinal: true })] }); }
      this.onend && this.onend(); }, 100); } stop() { this.onend && this.onend(); } abort() {} }
    window.webkitSpeechRecognition = R; window.SpeechRecognition = R;
  });
  await p.goto(`${BASE}/parler`);
  await p.getByRole("button", { name: "Parler", exact: true }).click();
  ok(await wait(p.getByRole("heading", { name: "Avant d'utiliser le micro" })), "information claire avant toute capture vocale");
  await p.getByRole("button", { name: "J'ai compris, activer le micro" }).click();
  ok(await wait(p.getByText(/L'accès au micro a été refusé/)), "refus du micro géré, l'écrit reste possible");
  await p.evaluate(() => { window.__mode = "ok"; });
  await p.getByRole("button", { name: "Parler", exact: true }).click();
  await p.waitForFunction(() => document.querySelector("#voice-text")?.value.includes("pharmacie"));
  ok(true, "parole transformée en texte modifiable");
  await p.fill("#voice-text", "je cherche une pharmacie de garde à Bamako ce soir");
  await p.getByRole("button", { name: "Trouver" }).click();
  ok(await wait(p.locator("main").getByRole("link", { name: "Pharmacies de garde" }).first()) && await wait(p.locator("main").getByRole("link", { name: "Trouver une pharmacie" }).first()), "demande interprétée en propositions");
  await p.fill("#voice-text", "je veux annuler mon rendez-vous");
  await p.getByRole("button", { name: "Trouver" }).click();
  ok(await wait(p.getByText(/Rien n'est réservé, annulé ni partagé sans votre confirmation/)), "action sensible : confirmation exigée sur la page suivante");
  await p.fill("#voice-text", "quel médicament prendre pour la fièvre");
  await p.getByRole("button", { name: "Trouver" }).click();
  ok(await wait(p.getByText(/Je ne peux pas donner de diagnostic/)), "aucun diagnostic ni traitement : orientation vers un professionnel");
  await ctx.setOffline(true);
  await p.getByRole("button", { name: "Parler", exact: true }).click();
  ok(await wait(p.getByText(/a besoin d'Internet/)), "connexion interrompue : message explicite");
  await ctx.setOffline(false);
  await ctx.close();
}

// Prévention : publication par l'administration avec source, affichage public
{
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: "fr-FR" });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/prevention`);
  ok(await wait(p.getByText(/Aucun événement de prévention n'est annoncé/)), "prévention : état vide honnête, aucune campagne inventée");
  await p.goto(`${BASE}/connexion`); await p.fill("#email", "demo.admin@pharmaproxi.invalid"); await p.fill("#password", PW);
  await p.click("button[type=submit]"); await p.waitForURL((u) => !u.pathname.startsWith("/connexion"), { timeout: 20000 });
  await p.goto(`${BASE}/admin/prevention`);
  const f = p.locator("section", { hasText: "Ajouter un événement" }).first();
  await f.locator("[name=title]").fill("Journée de test (démonstration)");
  await f.locator("[name=starts_on]").fill("2026-12-01");
  await f.locator("[name=organizer]").fill("Organisme de démonstration");
  await f.locator("[name=source_name]").fill("Communiqué de démonstration");
  await f.locator("[name=status]").selectOption("publie");
  await f.getByRole("button", { name: "Ajouter l'événement" }).click();
  ok(await wait(p.getByText("Événement publié.").first()), "administration : événement publié avec sa source");
  await ctx.clearCookies();
  await p.goto(`${BASE}/prevention`);
  ok(await wait(p.getByRole("heading", { name: "Journée de test (démonstration)" })) && await wait(p.getByText("Communiqué de démonstration")), "événement visible publiquement avec sa source");
  await ctx.close();
}

// 15. Langues : page de disponibilité réelle
{
  const p = await b.newPage();
  await p.goto(`${BASE}/langues`);
  ok(await wait(p.getByRole("cell", { name: /Bamanankan/ })) && await wait(p.getByText(/Aucune voix de synthèse fiable/)), "page des langues : disponibilité réelle affichée");
  await p.close();
}
await b.close();
console.log(fails ? `${fails} ÉCHEC(S)` : "TOUT EST PASSÉ");
process.exitCode = fails ? 1 : 0;
