"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { humanizeError, type ActionState } from "@/lib/errors";
import { LANG_COOKIE, PREV_LANG_COOKIE, isLang, type Lang } from "@/i18n/core";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const YEAR = 60 * 60 * 24 * 365;

/** Mémorise la langue (appareil + profil si connecté) et garde la précédente pour pouvoir y revenir. */
export async function chooseLanguage(lang: string): Promise<{ ok: boolean }> {
  if (!isLang(lang)) return { ok: false };
  const jar = await cookies();
  const prev = jar.get(LANG_COOKIE)?.value ?? "fr";
  if (prev !== lang) jar.set(PREV_LANG_COOKIE, prev, { path: "/", maxAge: YEAR, sameSite: "lax" });
  jar.set(LANG_COOKIE, lang, { path: "/", maxAge: YEAR, sameSite: "lax" });
  if (isSupabaseConfigured()) {
    try {
      const supabase = await createClient();
      const { data } = await supabase.auth.getUser();
      if (data.user) await supabase.rpc("set_preferred_lang", { p_lang: lang });
    } catch { /* la préférence reste au moins sur l'appareil */ }
  }
  return { ok: true };
}

/** À la connexion : reprendre la langue enregistrée dans le profil (nouvel appareil). */
export async function applyProfileLanguage(): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return;
  const { data } = await supabase.from("profiles").select("preferred_lang").eq("id", auth.user.id).maybeSingle();
  const pl = data?.preferred_lang as Lang | null | undefined;
  const jar = await cookies();
  if (pl && isLang(pl)) jar.set(LANG_COOKIE, pl, { path: "/", maxAge: YEAR, sameSite: "lax" });
  else {
    const current = jar.get(LANG_COOKIE)?.value;
    if (isLang(current)) await supabase.rpc("set_preferred_lang", { p_lang: current });
  }
}

// ---------------- Circuit de validation médicale ----------------
export async function setReviewDate(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = z.uuid().safeParse(fd.get("id"));
  const date = str(fd, "date");
  if (!id.success || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Date invalide." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("health_set_review_date", { p_id: id.data, p_date: date });
  if (error) return { error: humanizeError(error) };
  revalidatePath(`/redaction-sante/${id.data}`);
  return { ok: true, message: "Date de révision enregistrée." };
}

export async function archiveArticle(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = z.uuid().safeParse(fd.get("id"));
  if (!id.success) return { error: "Fiche invalide." };
  const archive = fd.get("archive") === "1";
  const supabase = await createClient();
  const { error } = await supabase.rpc("health_archive", { p_id: id.data, p_archive: archive });
  if (error) return { error: humanizeError(error) };
  revalidatePath(`/redaction-sante/${id.data}`); revalidatePath("/redaction-sante"); revalidatePath("/sante", "layout");
  return { ok: true, message: archive ? "Fiche archivée : elle n'est plus visible sur le site et reste conservée avec son historique." : "Fiche sortie des archives : elle repasse en brouillon et devra être validée à nouveau." };
}

// ---------------- Calendrier de prévention ----------------
const eventSchema = z.object({
  id: z.string().optional(), kind: z.enum(["campagne", "depistage", "vaccination", "sensibilisation", "journee_mondiale"]),
  title: z.string().min(5).max(160), description: z.string().max(1500), starts_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  ends_on: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/), region_id: z.string(), place: z.string().max(200), organizer: z.string().min(2).max(160),
  source_name: z.string().min(2).max(200), source_url: z.string().regex(/^(https:\/\/\S+)?$/), public_concerned: z.string().max(200),
  is_free: z.enum(["", "true", "false"]), status: z.enum(["brouillon", "publie", "annule"]),
});
export async function savePreventionEvent(_: ActionState, fd: FormData): Promise<ActionState> {
  const raw = Object.fromEntries(["id", "kind", "title", "description", "starts_on", "ends_on", "region_id", "place", "organizer", "source_name", "source_url", "public_concerned", "is_free", "status"].map((k) => [k, str(fd, k)]));
  const p = eventSchema.safeParse(raw);
  if (!p.success) {
    const f = p.error.issues[0]?.path[0];
    const label: Record<string, string> = { title: "le titre (5 caractères minimum)", organizer: "l'organisateur", source_name: "la source officielle", source_url: "le lien de la source (https://…)", starts_on: "la date de début", kind: "le type" };
    return { error: `Vérifiez ${label[String(f)] ?? "le formulaire"}.` };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_prevention_event", { p: p.data });
  if (error) return { error: humanizeError(error) };
  revalidatePath("/prevention"); revalidatePath("/admin/prevention");
  return { ok: true, message: p.data.status === "publie" ? "Événement publié." : "Événement enregistré." };
}
