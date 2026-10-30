import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Period } from "./cycle";

export type FemmeStatus = { signed_in: boolean; enabled?: boolean; has_pin?: boolean; locked?: boolean; discreet?: boolean; blocked_until?: string | null; partner?: boolean };
export type FemmeProfile = {
  user_id: string; age_band: string; journey: "cycle" | "conception" | "grossesse" | "postpartum" | "menopause"; cycle_length: number; period_length: number;
  regularity: string; pregnancy_lmp: string | null; pregnancy_due: string | null; delivery_date: string | null; discreet: boolean;
  remind_period: boolean; remind_days_before: number; remind_log: boolean; partner_topics: string[];
};
export type FemmeDay = {
  day: string; flow: string | null; symptoms: string[]; mood: string | null; pain: number | null; sleep: number | null;
  mucus: string | null; temperature: number | null; intercourse: string | null; test_result: string | null; note: string | null;
};

export async function femmeStatus(): Promise<FemmeStatus> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("femme_status");
  return (data as FemmeStatus) ?? { signed_in: false };
}

/** Données de l'utilisatrice (la base ne renvoie rien si l'espace est verrouillé). */
export async function femmeData(opts: { daysFrom?: string; daysTo?: string } = {}) {
  const supabase = await createClient();
  let daysQ = supabase.from("femme_days").select("day, flow, symptoms, mood, pain, sleep, mucus, temperature, intercourse, test_result, note").order("day", { ascending: false });
  if (opts.daysFrom) daysQ = daysQ.gte("day", opts.daysFrom);
  if (opts.daysTo) daysQ = daysQ.lte("day", opts.daysTo);
  const [p, per, days] = await Promise.all([
    supabase.from("femme_profiles").select("user_id, age_band, journey, cycle_length, period_length, regularity, pregnancy_lmp, pregnancy_due, delivery_date, discreet, remind_period, remind_days_before, remind_log, partner_topics").maybeSingle(),
    supabase.from("femme_periods").select("id, start_date, end_date").order("start_date", { ascending: false }).limit(60),
    daysQ.limit(400),
  ]);
  return {
    profile: (p.data as FemmeProfile | null) ?? null,
    periods: (per.data as Period[] | null) ?? [],
    days: ((days.data as FemmeDay[] | null) ?? []).map((d) => ({ ...d, temperature: d.temperature === null ? null : Number(d.temperature) })),
  };
}

export const isTeen = (p: FemmeProfile | null) => p?.age_band === "13-17";
