import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { LICENSE, guard, json, num, options, uuidOrNull } from "@/lib/public-api";

export const OPTIONS = options;
type Row = { facility_id: string; name: string; kind: string; region_name: string | null; city_label: string | null; address: string | null; phone: string | null; latitude: number | null; longitude: number | null; price_xof: number | null; price_note: string | null; delay: string | null; source: string | null; verified_at: string | null; exams_count: number; total_count: number };
export async function GET(req: NextRequest) {
  const limited = await guard("labs"); if (limited) return limited;
  const p = req.nextUrl.searchParams;
  const limit = num(p.get("limit"), 1, 100, 30), offset = num(p.get("offset"), 0, 100_000, 0);
  const exam = uuidOrNull(p.get("examen"));
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_labs", { p_exam: exam, p_query: p.get("q")?.trim().slice(0, 80) || null, p_region: uuidOrNull(p.get("region")), p_sort: exam ? "price" : "name", p_limit: limit, p_offset: offset });
  if (error) return json({ error: "Service momentanément indisponible." }, 502);
  const rows = (data ?? []) as Row[];
  const ids = rows.map((r) => r.facility_id);
  const [codes, home] = ids.length ? await Promise.all([
    supabase.from("facility_listings").select("id, public_code").in("id", ids),
    supabase.from("lab_home_service").select("facility_id, fee_xof, areas").eq("enabled", true).in("facility_id", ids),
  ]) : [{ data: [] }, { data: [] }];
  const code = new Map((codes.data ?? []).map((c) => [c.id, c.public_code as string]));
  const hs = new Map((home.data ?? []).map((h) => [h.facility_id, h]));
  return json({
    total: rows[0] ? Number(rows[0].total_count) : 0, limit, offset, license: LICENSE,
    data: rows.map((r) => ({ id: r.facility_id, code: code.get(r.facility_id) ?? null, name: r.name, kind: r.kind, region: r.region_name, city: r.city_label, address: r.address, phone: r.phone,
      location: r.latitude !== null && r.longitude !== null ? { lat: r.latitude, lng: r.longitude } : null, exams_count: Number(r.exams_count),
      exam: exam ? { price_xof: r.price_xof, price_note: r.price_note, delay: r.delay, source: r.source, verified_at: r.verified_at } : undefined,
      home_sampling: hs.has(r.facility_id) ? { fee_xof: hs.get(r.facility_id)!.fee_xof, areas: hs.get(r.facility_id)!.areas } : null })),
  });
}
