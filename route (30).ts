import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { log } from "@/lib/log";

/**
 * Tâche planifiée de maintenance : expire les demandes sans réponse et les
 * réservations non retirées (libère le stock), purge les données périmées et
 * compte les incohérences. À appeler toutes les 5 à 15 minutes par Vercel Cron
 * (en-tête Authorization: Bearer CRON_SECRET) ou par pg_cron (voir README).
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const given = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const supabase = createServiceClient();
  if (!supabase) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY non configurée" }, { status: 503 });
  const { data, error } = await supabase.rpc("run_maintenance");
  if (error) {
    log.error("cron.maintenance_failed", { message: error.message });
    return NextResponse.json({ error: "Échec de la maintenance" }, { status: 500 });
  }
  log.info("cron.maintenance", data as Record<string, unknown>);
  return NextResponse.json(data);
}
