import "server-only";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { openNote } from "@/lib/femme/crypto";
import { SEALED, type ItemKind } from "./config";

export type DossierStatus = { signed_in: boolean; has_pin?: boolean; locked?: boolean; blocked_until?: string | null };
export type Person = { id: string; is_self: boolean; display_name: string; relation: string | null; birth_year: number | null; sex: string | null };
export type Item = {
  id: string; person_id: string; kind: ItemKind; title: string; category: string | null; severity: string | null; detail: string | null; notes: string | null;
  result: string | null; year: number | null; event_date: string | null; event_time: string | null; next_date: string | null; place: string | null;
  who: string | null; phone: string | null; treatment_id: string | null; created_at: string;
};
export type Essentials = {
  person_id: string; blood_group: string | null; height_cm: number | null; weight_kg: number | null; pregnant: boolean; breastfeeding: boolean;
  emergency_name: string | null; emergency_relation: string | null; emergency_phone: string | null; coverage: string | null; insurer: string | null;
  insured_number: string | null; last_donation: string | null; updated_at: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ouvre le dossier : statut du code, personnes, personne choisie (?p=). `locked` = afficher l'écran de code. */
export async function dossierContext(p: string | undefined, path: string) {
  const s = await requireUser(path);
  const supabase = await createClient();
  const { data: st } = await supabase.rpc("record_status");
  const status = (st ?? { signed_in: true }) as DossierStatus;
  if (status.locked) return { locked: true as const, status, userId: s.userId };
  const { data: selfId, error } = await supabase.rpc("record_ensure_self");
  if (error) return { locked: true as const, status: { ...status, locked: true }, userId: s.userId };
  const { data: persons } = await supabase.from("record_persons").select("id, is_self, display_name, relation, birth_year, sex").order("is_self", { ascending: false }).order("created_at");
  const list = (persons ?? []) as Person[];
  const person = list.find((x) => p && UUID.test(p) && x.id === p) ?? list.find((x) => x.id === selfId) ?? list[0];
  await supabase.rpc("record_touch");
  return { locked: false as const, status, userId: s.userId, supabase, persons: list, person };
}

export async function loadItems(supabase: Awaited<ReturnType<typeof createClient>>, personId: string, kinds?: ItemKind[]) {
  let qb = supabase.from("record_items").select("*").eq("person_id", personId);
  if (kinds) qb = qb.in("kind", kinds);
  const { data } = await qb.order("created_at", { ascending: false }).limit(600);
  return ((data ?? []) as Item[]).map((i) => {
    const o = { ...i };
    for (const f of SEALED) (o as Record<string, unknown>)[f] = openNote(i[f as "detail"]);
    return o;
  });
}

export async function loadEssentials(supabase: Awaited<ReturnType<typeof createClient>>, personId: string) {
  const { data } = await supabase.from("record_essentials").select("*").eq("person_id", personId).maybeSingle();
  return (data as Essentials | null) ?? null;
}

export const personQuery = (person: Person) => (person.is_self ? "" : `?p=${person.id}`);
