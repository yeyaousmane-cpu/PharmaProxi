import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";

export type Specialty = { id: string; code: string; name: string; family: string; description: string | null; sort_order: number };

/** Référentiel des spécialités actives, triées par famille puis ordre d'affichage. */
export const getSpecialties = cache(async (): Promise<Specialty[]> => {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  const { data } = await supabase.from("medical_specialties").select("id, code, name, family, description, sort_order").eq("is_active", true).order("sort_order");
  return (data as Specialty[]) ?? [];
});

export function groupByFamily(list: Specialty[]) {
  const out = new Map<string, Specialty[]>();
  for (const s of list) out.set(s.family, [...(out.get(s.family) ?? []), s]);
  return [...out.entries()];
}

export const uuidOrNull = (v?: string) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : null);
export const numOrNull = (v?: string) => (v && v.trim() !== "" && !Number.isNaN(Number(v)) ? Number(v) : null);
