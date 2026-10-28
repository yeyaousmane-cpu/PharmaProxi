import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";

export type GeoData = {
  regions: { id: string; name: string }[];
  circles: { id: string; name: string; region_id: string }[];
  communes: { id: string; name: string; region_id: string; circle_id: string | null }[];
  localities: { id: string; name: string; commune_id: string }[];
};

/** Référentiel géographique public (régions, cercles, communes, quartiers). */
export const getGeo = cache(async (): Promise<GeoData> => {
  if (!isSupabaseConfigured()) return { regions: [], circles: [], communes: [], localities: [] };
  const supabase = await createClient();
  const [r, c, cm, l] = await Promise.all([
    supabase.from("regions").select("id, name, is_district").order("is_district", { ascending: false }).order("name"),
    supabase.from("circles").select("id, name, region_id").order("name"),
    supabase.from("communes").select("id, name, region_id, circle_id").order("name").limit(5000),
    supabase.from("localities").select("id, name, commune_id").order("name").limit(20000),
  ]);
  return {
    regions: (r.data ?? []).map(({ id, name }) => ({ id, name })),
    circles: c.data ?? [],
    communes: cm.data ?? [],
    localities: l.data ?? [],
  };
});
