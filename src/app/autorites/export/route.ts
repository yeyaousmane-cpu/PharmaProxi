import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const csv = (rows: (string | number | null)[][]) => "﻿" + rows.map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";")).join("\r\n");

/** Export CSV des médicaments cherchés sans résultat (mêmes règles que le tableau de bord : seuil de 10, accès journalisé). */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const days = [7, 30, 90, 365].includes(Number(sp.get("jours"))) ? Number(sp.get("jours")) : 30;
  const region = /^[0-9a-f-]{36}$/i.test(sp.get("region") ?? "") ? sp.get("region") : null;
  const from = new Date(Date.now() - (days - 1) * 86_400_000).toISOString().slice(0, 10);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("authority_searches", { p_region: region, p_from: from, p_to: null, p_unfound: true, p_limit: 100 });
  if (error) return new NextResponse("Accès réservé aux autorités de santé désignées.", { status: 403 });
  const rows = [["Médicament recherché", "Recherches sans résultat", "Recherches au total", "Nombre de régions"], ...((data ?? []) as { query: string; unfound: number; searches: number; regions: number }[]).map((r) => [r.query, r.unfound, r.searches, r.regions])];
  return new NextResponse(csv(rows), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="pharmaproxi-introuvables-${from}.csv"`, "cache-control": "private, no-store" } });
}
