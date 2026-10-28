import "server-only";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "@/lib/env";
import { fetchWithTimeout } from "@/lib/supabase/fetch";

/**
 * Client « service_role » : contourne la RLS. À n'utiliser que dans des
 * routes serveur protégées (tâche planifiée, suppression définitive de compte).
 * Retourne null si la clé n'est pas configurée.
 */
export function createServiceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key || !SUPABASE_URL) return null;
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: fetchWithTimeout } });
}
