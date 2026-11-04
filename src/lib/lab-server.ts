import "server-only";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type LabMembership = { facility_id: string; name: string; public_code: string | null; region: string | null };

/** Laboratoires dont l'utilisateur est membre ; `current` choisi par ?labo=. */
export async function labContext(path: string, labo?: string) {
  const s = await requireUser(path);
  const supabase = await createClient();
  const { data } = await supabase.from("facility_members").select("facility_id, facility_listings(name, public_code, regions(name))").eq("user_id", s.userId);
  type F = { name: string; public_code: string | null; regions: { name: string } | { name: string }[] | null };
  const labs: LabMembership[] = (data ?? []).map((m) => {
    const f = (Array.isArray(m.facility_listings) ? m.facility_listings[0] : m.facility_listings) as F | null;
    const r = f ? (Array.isArray(f.regions) ? f.regions[0] : f.regions) : null;
    return { facility_id: m.facility_id, name: f?.name ?? "Laboratoire", public_code: f?.public_code ?? null, region: r?.name ?? null };
  });
  const current = labs.find((l) => l.facility_id === labo) ?? labs[0] ?? null;
  return { session: s, supabase, labs, current };
}
