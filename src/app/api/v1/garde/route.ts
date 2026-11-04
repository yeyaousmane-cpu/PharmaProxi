import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { LICENSE, coord, guard, json, options, uuidOrNull } from "@/lib/public-api";

export const OPTIONS = options;
type Row = { kind: string; id: string; name: string; address: string | null; area: string | null; phone: string | null; latitude: number | null; longitude: number | null; starts_at: string; ends_at: string; status: string; source: string; distance_km: number | null };
export async function GET(req: NextRequest) {
  const limited = await guard("garde"); if (limited) return limited;
  const p = req.nextUrl.searchParams;
  const lat = coord(p.get("lat"), 90), lng = coord(p.get("lng"), 180);
  const now = new Date();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("duty_pharmacies", {
    p_from: now.toISOString(), p_to: p.get("semaine") === "1" ? new Date(now.getTime() + 7 * 86_400_000).toISOString() : null,
    p_region: uuidOrNull(p.get("region")), p_commune: uuidOrNull(p.get("commune")),
    p_lat: lat !== null && lng !== null ? lat : null, p_lng: lat !== null && lng !== null ? lng : null,
  });
  if (error) return json({ error: "Service momentanément indisponible." }, 502);
  return json({
    generated_at: now.toISOString(), license: LICENSE,
    notice: "Les gardes affichées sont celles enregistrées sur PharmaProxi. Appelez la pharmacie avant de vous déplacer.",
    data: ((data ?? []) as Row[]).map((r) => ({ id: r.id, name: r.name, registered: r.kind === "verified", address: r.address, area: r.area, phone: r.phone,
      location: r.latitude !== null && r.longitude !== null ? { lat: r.latitude, lng: r.longitude } : null,
      starts_at: r.starts_at, ends_at: r.ends_at, status: r.status, source: r.source, distance_km: r.distance_km !== null ? Math.round(r.distance_km * 10) / 10 : null })),
  }, 200, 60);
}
