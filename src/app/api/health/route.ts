import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isSupabaseConfigured, SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/env";
import { createServiceClient } from "@/lib/supabase/service";
import { fetchWithTimeout } from "@/lib/supabase/fetch";

export const dynamic = "force-dynamic";

/**
 * Point de contrôle pour la surveillance (UptimeRobot, Better Stack…).
 * 200 = service opérationnel ; 503 = base injoignable.
 * Ne renvoie aucune donnée sensible. Le détail de la maintenance n'est inclus
 * que si la clé de service est configurée.
 */
export async function GET() {
  const t0 = Date.now();
  const body: Record<string, unknown> = { status: "ok", time: new Date().toISOString() };
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ status: "misconfigured", detail: "Variables Supabase manquantes" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false }, global: { fetch: fetchWithTimeout } });
  const { error } = await anon.from("platform_settings").select("key").limit(1);
  body.database = error ? "unreachable" : "ok";
  body.latency_ms = Date.now() - t0;
  const svc = createServiceClient();
  if (svc && !error) {
    const { data } = await svc.from("maintenance_runs").select("ran_at, critical_issues").order("ran_at", { ascending: false }).limit(1).maybeSingle();
    const age = data ? Math.round((Date.now() - new Date(data.ran_at).getTime()) / 60000) : null;
    body.maintenance = data ? { last_run_minutes_ago: age, critical_issues: data.critical_issues } : "never";
    if (age === null || age > 60) body.warnings = ["La tâche de maintenance planifiée ne s'exécute pas (voir README §4)"];
    if (data?.critical_issues) body.warnings = [...((body.warnings as string[]) ?? []), "Incohérences critiques détectées (Administration › Intégrité)"];
  }
  if (error) body.status = "degraded";
  return NextResponse.json(body, { status: error ? 503 : 200, headers: { "Cache-Control": "no-store" } });
}
