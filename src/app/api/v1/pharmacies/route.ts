import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { LICENSE, coord, guard, json, num, options, uuidOrNull } from "@/lib/public-api";

export const OPTIONS = options;
type Row = { kind: string; id: string; name: string; address: string | null; area: string | null; phone: string | null; latitude: number | null; longitude: number | null; distance_km: number | null; is_demo: boolean; total_count: number };
export async function GET(req: NextRequest) {
  const limited = await guard("pharmacies"); if (limited) return limited;
  const p = req.nextUrl.searchParams;
  const limit = num(p.get("limit"), 1, 100, 30), offset = num(p.get("offset"), 0, 100_000, 0);
  const lat = coord(p.get("lat"), 90), lng = coord(p.get("lng"), 180);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("pharmacy_directory", {
    p_query: p.get("q")?.trim().slice(0, 80) || null, p_region: uuidOrNull(p.get("region")), p_commune: uuidOrNull(p.get("commune")),
    p_lat: lat !== null && lng !== null ? lat : null, p_lng: lat !== null && lng !== null ? lng : null,
    p_kind: p.get("inscrites") === "1" ? "verified" : "all", p_limit: limit, p_offset: offset,
  });
  if (error) return json({ error: "Service momentanément indisponible." }, 502);
  const rows = ((data ?? []) as Row[]).filter((r) => !r.is_demo);
  const ids = rows.filter((r) => r.kind === "verified").map((r) => r.id);
  const codes = new Map<string, string>();
  if (ids.length) for (const c of (await supabase.from("pharmacies").select("id, public_code").in("id", ids)).data ?? []) codes.set(c.id, c.public_code);
  return json({
    total: rows[0] ? Number(rows[0].total_count) : 0, limit, offset, license: LICENSE,
    data: rows.map((r) => ({ id: r.id, code: codes.get(r.id) ?? null, name: r.name, registered: r.kind === "verified", address: r.address, area: r.area, phone: r.phone,
      location: r.latitude !== null && r.longitude !== null ? { lat: r.latitude, lng: r.longitude } : null, distance_km: r.distance_km !== null ? Math.round(r.distance_km * 10) / 10 : null })),
  });
}
