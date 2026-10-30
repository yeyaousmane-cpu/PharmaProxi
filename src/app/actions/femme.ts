"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { humanizeError, type ActionState } from "@/lib/errors";
import { setFlash } from "@/lib/flash";
import { allow } from "@/lib/limiter";
import { clientIp } from "@/lib/request";
import { sealNote } from "@/lib/femme/crypto";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const done = (message: string): ActionState => { revalidatePath("/femme", "layout"); return { ok: true, message }; };

export async function activateFemme(_: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("femme_activate", { p: {
    declared_woman: fd.get("declared_woman") === "on", consent: fd.get("consent") === "on",
    age_band: str(fd, "age_band") || null, journey: str(fd, "journey") || "cycle",
    cycle_length: str(fd, "cycle_length") || null, period_length: str(fd, "period_length") || null, regularity: str(fd, "regularity") || null,
    last_period: str(fd, "last_period") || null, pregnancy_lmp: str(fd, "pregnancy_lmp") || null, pregnancy_due: str(fd, "pregnancy_due") || null,
    delivery_date: str(fd, "delivery_date") || null,
  } });
  if (error) return { error: humanizeError(error) };
  await setFlash("Votre espace est prêt. Pensez à le protéger par un code secret dans les réglages.");
  revalidatePath("/femme", "layout");
  redirect("/femme");
}

export async function unlockFemme(_: ActionState, fd: FormData): Promise<ActionState> {
  if (!(await allow(`femme-pin:${await clientIp()}`, 20, 15 * 60_000))) return { error: "Trop d'essais. Réessayez dans quelques minutes." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("femme_unlock", { p_pin: str(fd, "pin") });
  if (error) return { error: humanizeError(error) };
  if (!data) return { error: "Code incorrect. Après 5 erreurs, l'espace est bloqué 15 minutes." };
  revalidatePath("/femme", "layout");
  redirect(str(fd, "suite").startsWith("/femme") ? str(fd, "suite") : "/femme");
}

export async function lockFemme() {
  const supabase = await createClient();
  await supabase.rpc("femme_lock");
  revalidatePath("/femme", "layout");
  redirect("/femme");
}

export async function updateFemmeProfile(_: ActionState, fd: FormData): Promise<ActionState> {
  const p: Record<string, unknown> = {};
  for (const k of ["age_band", "journey", "cycle_length", "period_length", "regularity", "remind_days_before"]) if (fd.has(k)) p[k] = str(fd, k) || null;
  for (const k of ["pregnancy_lmp", "pregnancy_due", "delivery_date"]) if (fd.has(k)) p[k] = str(fd, k);
  if (fd.has("_prefs")) for (const k of ["discreet", "remind_period", "remind_log"]) p[k] = fd.get(k) === "on";
  const supabase = await createClient();
  const { error } = await supabase.rpc("femme_update_profile", { p });
  if (error) return { error: humanizeError(error) };
  return done("Enregistré.");
}

export async function setFemmePin(_: ActionState, fd: FormData): Promise<ActionState> {
  const pin = str(fd, "pin");
  if (fd.get("remove") !== "1") {
    if (!/^\d{4,6}$/.test(pin)) return { error: "Le code doit contenir 4 à 6 chiffres.", fieldErrors: { pin: "4 à 6 chiffres" } };
    if (pin !== str(fd, "confirm")) return { error: "Les deux codes ne sont pas identiques.", fieldErrors: { confirm: "Codes différents" } };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("femme_set_pin", { p_pin: fd.get("remove") === "1" ? null : pin });
  if (error) return { error: humanizeError(error) };
  return done(fd.get("remove") === "1" ? "Code secret retiré." : "Code secret enregistré. Votre espace se verrouille après 30 minutes sans activité.");
}

export async function saveFemmePeriod(_: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("femme_save_period", { p_id: str(fd, "id") || null, p_start: str(fd, "start") || null, p_end: str(fd, "end") || null });
  if (error) return { error: humanizeError(error) };
  return done("Règles enregistrées.");
}

export async function deleteFemmePeriod(_: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("femme_delete_period", { p_id: str(fd, "id") });
  if (error) return { error: humanizeError(error) };
  return done("Supprimé.");
}

export async function saveFemmeDay(_: ActionState, fd: FormData): Promise<ActionState> {
  const note = str(fd, "note");
  if (note.length > 1000) return { error: "Note trop longue (1 000 caractères maximum).", fieldErrors: { note: "1 000 caractères maximum" } };
  const supabase = await createClient();
  const { error } = await supabase.rpc("femme_save_day", { p: {
    day: str(fd, "day"), flow: str(fd, "flow"), symptoms: fd.getAll("symptoms").map(String), mood: str(fd, "mood"), pain: str(fd, "pain"),
    sleep: str(fd, "sleep"), mucus: str(fd, "mucus"), temperature: str(fd, "temperature"), intercourse: str(fd, "intercourse"),
    test_result: str(fd, "test_result"), note: sealNote(note || null),
  } });
  if (error) return { error: humanizeError(error) };
  return done("Journée enregistrée.");
}

export async function saveFemmeReminder(_: ActionState, fd: FormData): Promise<ActionState> {
  const date = str(fd, "date"), time = str(fd, "time") || "08:00";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Choisissez une date.", fieldErrors: { date: "Date requise" } };
  const supabase = await createClient();
  const { error } = await supabase.rpc("femme_save_reminder", { p: {
    id: str(fd, "id") || null, kind: str(fd, "kind"), label: str(fd, "label"), due_at: `${date}T${time}:00Z`, repeat: str(fd, "repeat") || "aucune",
  } });
  if (error) return { error: humanizeError(error) };
  return done("Rappel enregistré.");
}

export async function femmeReminderAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("femme_reminder_action", { p_id: str(fd, "id"), p_action: str(fd, "op") });
  if (error) return { error: humanizeError(error) };
  return done("C'est fait.");
}

export async function setFemmePartner(_: ActionState, fd: FormData): Promise<ActionState> {
  const enable = fd.get("enable") === "1";
  const supabase = await createClient();
  const { error } = await supabase.rpc("femme_set_partner", { p_enable: enable, p_topics: enable ? fd.getAll("topics").map(String) : null });
  if (error) return { error: humanizeError(error) };
  return done(enable ? "Lien de partage prêt." : "Partage désactivé : l'ancien lien ne fonctionne plus.");
}

export async function deleteFemmeAll(_: ActionState, fd: FormData): Promise<ActionState> {
  if (str(fd, "confirm").toUpperCase() !== "SUPPRIMER") return { error: "Écrivez SUPPRIMER pour confirmer.", fieldErrors: { confirm: "Écrivez SUPPRIMER" } };
  const supabase = await createClient();
  const { error } = await supabase.rpc("femme_delete_all");
  if (error) return { error: humanizeError(error) };
  await setFlash("Toutes les données de votre espace ont été supprimées définitivement.");
  revalidatePath("/femme", "layout");
  redirect("/femme");
}
