import "server-only";
import { createHash } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { isLimited, rateLimit, recordFailure } from "@/lib/rate-limit";
import { log } from "@/lib/log";

/**
 * Limitation de débit partagée entre toutes les instances du serveur.
 * Utilise la table `rate_limit_events` (fonction `rate_limit_hit`, clé de service).
 * Sans clé de service, ou si la base ne répond pas, bascule sur le limiteur en
 * mémoire de l'instance (dégradé mais jamais bloquant).
 * Les clés sont hachées : ni e-mail ni adresse IP en clair dans la base.
 */
const hashKey = (key: string) => {
  const [scope] = key.split(":");
  return `${scope}:${createHash("sha256").update(key).digest("base64url").slice(0, 32)}`;
};

async function hit(key: string, limit: number, windowMs: number, record: boolean): Promise<boolean | null> {
  const svc = createServiceClient();
  if (!svc) return null;
  const { data, error } = await svc.rpc("rate_limit_hit", {
    p_key: hashKey(key), p_limit: limit, p_window_seconds: Math.ceil(windowMs / 1000), p_record: record,
  });
  if (error) {
    log.warn("rate_limit.fallback", { error: error.message });
    return null;
  }
  return Boolean(data);
}

/** Compte une tentative et indique si elle est autorisée. */
export async function allow(key: string, limit: number, windowMs: number): Promise<boolean> {
  const shared = await hit(key, limit, windowMs, true);
  return shared ?? rateLimit(key, limit, windowMs);
}

/** Indique si la limite est atteinte, sans compter de tentative. */
export async function blocked(key: string, limit: number, windowMs: number): Promise<boolean> {
  const shared = await hit(key, limit, windowMs, false);
  return shared === null ? isLimited(key, limit, windowMs) : !shared;
}

/** Enregistre un échec (ex. mot de passe erroné). */
export async function failure(key: string, windowMs: number): Promise<void> {
  const shared = await hit(key, 1_000_000, windowMs, true);
  if (shared === null) recordFailure(key);
}
