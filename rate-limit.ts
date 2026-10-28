/**
 * Limiteur de débit simple en mémoire (fenêtre glissante par clé).
 * Suffisant sur une instance unique ; en déploiement serverless multi-instances,
 * il complète les limites intégrées de Supabase Auth. Pour une limite globale,
 * remplacer par un stockage partagé (Redis/Upstash) — voir README.
 */
const buckets = new Map<string, number[]>();

function recent(key: string, windowMs: number, now: number) {
  const arr = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  buckets.set(key, arr);
  return arr;
}

function gc(windowMs: number, now: number) {
  if (buckets.size <= 10_000) return;
  for (const [k, v] of buckets) if (!v.some((t) => now - t < windowMs)) buckets.delete(k);
}

/** Enregistre une tentative et indique si elle est autorisée. */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const arr = recent(key, windowMs, now);
  if (arr.length >= limit) return false;
  arr.push(now);
  gc(windowMs, now);
  return true;
}

/** Indique si la limite est atteinte, sans compter de tentative (ex. échecs de connexion). */
export function isLimited(key: string, limit: number, windowMs: number): boolean {
  return recent(key, windowMs, Date.now()).length >= limit;
}

/** Compte un échec (ex. mot de passe erroné). */
export function recordFailure(key: string) {
  const now = Date.now();
  const arr = buckets.get(key) ?? [];
  arr.push(now);
  buckets.set(key, arr);
}
