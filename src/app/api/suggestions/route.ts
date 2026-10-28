import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request";

/**
 * Suggestions de recherche (catalogue public uniquement — aucune information de stock).
 * Route légère : évite de charger le client Supabase dans le navigateur sur les pages publiques.
 */
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 100);
  if (q.length < 2) return NextResponse.json([]);
  if (!rateLimit(`suggest:${await clientIp()}`, 120, 60_000)) return NextResponse.json([], { status: 429 });
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("suggest_medicines", { p_query: q, p_limit: 8 });
  if (error) return NextResponse.json([], { status: 502 });
  return NextResponse.json(data ?? [], { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } });
}
