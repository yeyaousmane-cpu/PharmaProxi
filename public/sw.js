/*
 * Service worker SantéProxi.
 * Règle de sécurité : on ne met JAMAIS en cache les pages de recherche, de stock,
 * de commande, de compte ni les réponses de l'API Supabase — un stock ancien ne doit pas
 * être présenté comme récent, et aucune donnée personnelle ne doit rester sur l'appareil.
 * Exception : les pages d'information générale (premiers secours, fiches santé, urgences,
 * droits, don de sang, guide AMO) sont gardées pour être lisibles sans réseau. Elles sont
 * enregistrées dans leur version anonyme (sans cookie de connexion).
 */
const VERSION = "sp-v8";
const STATIC = ["/offline", "/logo-santeproxi.webp", "/emblem.webp", "/icons/icon-192.png"];
const OFFLINE_PAGES = ["/sos", "/premiers-secours", "/urgences", "/droits", "/don-de-sang", "/don-de-sang/suis-je-apte", "/don-de-sang/apres-le-don", "/don-de-sang/groupes-rares", "/amo/guide", "/sante-mentale", "/laboratoires/lexique", "/prevention", "/langues"];
const OFFLINE_PREFIXES = ["/premiers-secours", "/sante/fiche/", "/droits/", "/sante/urgences"];

// Pages personnelles jamais mises en cache (badge, demandes, espace formateur), même sous un préfixe autorisé
const NEVER_CACHE = ["/premiers-secours/badge", "/premiers-secours/espace-formateur", "/premiers-secours/formations"];
const offlineAllowed = (path) => !NEVER_CACHE.some((p) => path.startsWith(p)) && (OFFLINE_PAGES.includes(path) || OFFLINE_PREFIXES.some((p) => path.startsWith(p)));

async function storeAnonymous(path) {
  try {
    const res = await fetch(new Request(path, { credentials: "omit", headers: { "X-PP-Offline": "1" } }));
    if (res.ok && (res.headers.get("content-type") || "").includes("text/html")) await (await caches.open(VERSION)).put(path, res);
  } catch { /* hors ligne : rien à faire */ }
}

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(VERSION).then((c) => c.addAll(STATIC))
      .then(() => Promise.all(OFFLINE_PAGES.map(storeAnonymous)))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // API Supabase, tuiles : réseau uniquement

  // Fichiers statiques versionnés de Next.js : cache d'abord
  if (url.pathname.startsWith("/_next/static/") || /\.(webp|png|svg|ico|woff2?)$/.test(url.pathname)) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(req, copy));
        return res;
      })),
    );
    return;
  }

  if (req.mode === "navigate") {
    if (offlineAllowed(url.pathname)) {
      // Pages d'information : réseau d'abord ; une copie anonyme est gardée pour la lecture hors ligne
      e.respondWith(
        fetch(req).then((res) => {
          if (res.ok) e.waitUntil(storeAnonymous(url.pathname));
          return res;
        }).catch(() => caches.match(url.pathname).then((hit) => hit || caches.match("/offline"))),
      );
      return;
    }
    // Autres pages : réseau uniquement, page hors ligne en secours (aucune donnée de stock en cache)
    e.respondWith(fetch(req).catch(() => caches.match("/offline")));
  }
});
