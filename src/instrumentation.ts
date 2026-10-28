/**
 * Exécuté une fois au démarrage du serveur : signale clairement dans les journaux
 * une configuration incomplète, au lieu d'un dysfonctionnement silencieux.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { log } = await import("@/lib/log");
  const missing = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"].filter((k) => !process.env[k]);
  if (missing.length) log.error("config.missing", { variables: missing, impact: "application inutilisable" });
  const prod = process.env.APP_ENV === "production" || process.env.VERCEL_ENV === "production";
  const warn = (variable: string, impact: string) => log.warn("config.incomplete", { variable, impact });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY)
    warn("SUPABASE_SERVICE_ROLE_KEY", "limitation de débit par instance seulement, maintenance par /api/cron indisponible, suppression de compte partielle");
  if (!process.env.CRON_SECRET) warn("CRON_SECRET", "la route /api/cron/maintenance refuse tous les appels (utiliser pg_cron)");
  if (prod && (process.env.NEXT_PUBLIC_SITE_URL ?? "").startsWith("http://"))
    warn("NEXT_PUBLIC_SITE_URL", "les liens des e-mails doivent être en https en production");
}
