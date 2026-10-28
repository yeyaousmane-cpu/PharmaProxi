/*
 * Service worker PharmaProxi.
 * Règle de sécurité : on ne met JAMAIS en cache les pages de recherche, de stock,
 * de commande ni les réponses de l'API Supabase — un stock ancien ne doit pas
 * être présenté comme récent. Seuls les fichiers statiques et la page hors ligne
 * sont mis en cache.
 */
const VERSION = "pp-v1";
const STATIC = ["/offline", "/logo.webp", "/emblem.webp", "/icons/icon-192.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(STATIC)).then(() => self.skipWaiting()));
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
  if (url.pathname.startsWith("/_next/static/") || /\.(webp|png|svg|ico)$/.test(url.pathname)) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(req, copy));
        return res;
      })),
    );
    return;
  }

  // Pages : réseau uniquement, page hors ligne en secours (aucune donnée de stock en cache)
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).catch(() => caches.match("/offline")));
  }
});
