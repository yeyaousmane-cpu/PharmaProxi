import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { toCsv } from "@/lib/csv";

/** Rapport agrégé non sensible (aucune donnée personnelle). Réservé aux administrateurs (vérifié en base). */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const to = sp.get("au") ? new Date(`${sp.get("au")}T23:59:59Z`) : new Date();
  const from = sp.get("du") ? new Date(`${sp.get("du")}T00:00:00Z`) : new Date(to.getTime() - 30 * 86400_000);
  const region = sp.get("region");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_stats", { p_from: from.toISOString(), p_to: to.toISOString(), p_region: region && /^[0-9a-f-]{36}$/i.test(region) ? region : null });
  if (error) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  const s = data as Record<string, unknown>;
  const rows: Record<string, unknown>[] = [];
  for (const [k, v] of Object.entries(s)) {
    if (typeof v === "number") rows.push({ indicateur: k, cle: "", valeur: v });
  }
  for (const [k, v] of Object.entries((s.orders_by_status as Record<string, number>) ?? {})) rows.push({ indicateur: "commandes_par_statut", cle: k, valeur: v });
  for (const r of (s.pharmacies_by_region as { region: string; verified: number; registered: number }[]) ?? []) {
    rows.push({ indicateur: "pharmacies_verifiees_par_region", cle: r.region, valeur: r.verified });
    rows.push({ indicateur: "pharmacies_inscrites_par_region", cle: r.region, valeur: r.registered });
  }
  for (const q of (s.top_no_result_queries as { query: string; n: number }[]) ?? []) rows.push({ indicateur: "recherche_sans_resultat", cle: q.query, valeur: q.n });
  const csv = toCsv([{ indicateur: "periode", cle: `${from.toISOString().slice(0, 10)} → ${to.toISOString().slice(0, 10)}`, valeur: "" }, ...rows], ["indicateur", "cle", "valeur"]);
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="rapport-pharmaproxi.csv"`, "Cache-Control": "no-store" } });
}
