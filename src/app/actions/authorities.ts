"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { humanizeError, type ActionState } from "@/lib/errors";
import { requireUser } from "@/lib/auth";
import { setFlash } from "@/lib/flash";
import { allow } from "@/lib/limiter";
import { clientIp } from "@/lib/request";
import { AGES, OUTCOME, PROBLEMS, REPORTER, SEVERITY, WHERE } from "@/lib/authorities";

const uuid = z.uuid();
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const isoDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

// ---------------- Signalement d'un médicament ----------------
export async function submitDrugReport(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireUser("/signaler");
  const kind = str(fd, "kind") === "effet" ? "effet" : "suspect";
  const fe: Record<string, string> = {};
  if (str(fd, "product_name").length < 2) fe.product_name = "Indiquez le nom du médicament";
  if (kind === "effet" && !str(fd, "reaction")) fe.reaction = "Décrivez la réaction";
  if (kind === "suspect" && !fd.getAll("problems").length && !str(fd, "description")) fe.description = "Dites ce qui vous paraît suspect";
  if (fd.get("consent") !== "on") fe.consent = "Votre accord est nécessaire";
  const phone = str(fd, "contact_phone");
  if (fd.get("contact_ok") === "on" && !/^\+?[0-9 ]{8,20}$/.test(phone)) fe.contact_phone = "Numéro invalide (ex. +223 70 00 00 00)";
  const price = str(fd, "price_xof").replace(/\s/g, "");
  if (price && !/^\d{1,8}$/.test(price)) fe.price_xof = "Montant invalide";
  if (Object.keys(fe).length) return { error: "Vérifiez le formulaire.", fieldErrors: fe };
  const pick = (k: string, dict: Record<string, string>) => (str(fd, k) in dict ? str(fd, k) : null);
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_drug_report", { p: {
    kind, reporter_type: pick("reporter_type", REPORTER) ?? "patient", product_name: str(fd, "product_name"), batch_number: str(fd, "batch_number"),
    expiry: str(fd, "expiry"), manufacturer: str(fd, "manufacturer"), where_bought: pick("where_bought", WHERE), place_detail: str(fd, "place_detail"),
    region_id: uuid.safeParse(fd.get("region_id")).success ? str(fd, "region_id") : null, price_xof: price || null,
    problems: fd.getAll("problems").map(String).filter((p) => p in PROBLEMS), description: str(fd, "description"),
    reaction: kind === "effet" ? str(fd, "reaction") : null, severity: kind === "effet" ? pick("severity", SEVERITY) : null,
    outcome: kind === "effet" ? pick("outcome", OUTCOME) : null, patient_age: (AGES as readonly string[]).includes(str(fd, "patient_age")) ? str(fd, "patient_age") : null,
    patient_sex: ["F", "M"].includes(str(fd, "patient_sex")) ? str(fd, "patient_sex") : null, pregnant: fd.get("pregnant") === "on" ? true : null,
    other_meds: str(fd, "other_meds"), consent: true, contact_ok: fd.get("contact_ok") === "on", contact_phone: phone || null,
  } });
  if (error) return { error: humanizeError(error) };
  await setFlash("Merci. Votre signalement a été transmis aux autorités de santé.");
  redirect("/signaler/mes-signalements");
}

// ---------------- Autorités ----------------
export async function updateReport(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) return { error: "Requête invalide" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("authority_update_report", { p_id: id.data, p_status: str(fd, "status"), p_note: str(fd, "note") });
  if (error) return { error: humanizeError(error) };
  revalidatePath("/autorites/signalements");
  return { ok: true, message: "Signalement mis à jour." };
}

export async function saveCampaign(_: ActionState, fd: FormData): Promise<ActionState> {
  const fe: Record<string, string> = {};
  for (const [k, l] of [["title", "Titre"], ["place", "Lieu"], ["source_url", "Lien vers la source officielle"]]) if (!str(fd, k)) fe[k] = `${l} obligatoire`;
  if (!isoDate(str(fd, "starts_on"))) fe.starts_on = "Date invalide";
  if (str(fd, "source_url") && !/^https?:\/\//.test(str(fd, "source_url"))) fe.source_url = "Doit commencer par https://";
  if (Object.keys(fe).length) return { error: "Vérifiez le formulaire.", fieldErrors: fe };
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_blood_campaign", { p: {
    id: str(fd, "id") || null, title: str(fd, "title"), organizer: str(fd, "organizer"), region_id: str(fd, "region_id") || null, place: str(fd, "place"),
    starts_on: str(fd, "starts_on"), start_time: str(fd, "start_time"), end_time: str(fd, "end_time"), details: str(fd, "details"),
    source_url: str(fd, "source_url"), published: fd.get("published") === "on",
  }, p_notify: fd.get("notify") === "on" });
  if (error) return { error: humanizeError(error) };
  revalidatePath("/autorites/campagnes"); revalidatePath("/don-de-sang");
  return { ok: true, message: "Campagne enregistrée." };
}

export async function toggleAttendance(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireUser("/don-de-sang#campagnes");
  const id = uuid.safeParse(fd.get("campaign_id"));
  if (!id.success) return { error: "Requête invalide" };
  const supabase = await createClient();
  const { data: ex } = await supabase.from("blood_campaign_attendance").select("campaign_id").eq("campaign_id", id.data).eq("user_id", s.userId).maybeSingle();
  const { error } = ex
    ? await supabase.from("blood_campaign_attendance").delete().eq("campaign_id", id.data).eq("user_id", s.userId)
    : await supabase.from("blood_campaign_attendance").insert({ campaign_id: id.data });
  if (error) return { error: humanizeError(error) };
  revalidatePath("/don-de-sang");
  return { ok: true, message: ex ? "C'est noté : vous ne venez plus." : "Merci ! Vous êtes noté(e) parmi les participants." };
}

export async function setAuthority(_: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_authority", { p_email: str(fd, "email"), p_scope: str(fd, "scope"), p_organisation: str(fd, "organisation"),
    p_title: str(fd, "title") || null, p_active: fd.get("revoke") !== "1" });
  if (error) return { error: humanizeError(error) };
  revalidatePath("/admin/autorites");
  return { ok: true, message: fd.get("revoke") === "1" ? "Accès retiré." : "Accès accordé." };
}

// ---------------- Avis ----------------
export async function submitFeedback(_: ActionState, fd: FormData): Promise<ActionState> {
  if (!(await allow(`feedback:${await clientIp()}`, 10, 60 * 60_000))) return { error: "Merci, nous avons déjà reçu plusieurs avis. Réessayez plus tard." };
  const mood = ["content", "moyen", "pas_content"].includes(str(fd, "mood")) ? str(fd, "mood") : "";
  const msg = str(fd, "message").slice(0, 1000);
  if (!mood && !msg) return { error: "Choisissez un visage ou écrivez un message." };
  const page = str(fd, "page");
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_feedback", { p_page: page.startsWith("/") ? page.slice(0, 200) : "", p_mood: mood, p_category: str(fd, "category"), p_message: msg });
  if (error) return { error: humanizeError(error) };
  return { ok: true, message: "Merci pour votre avis ! Il nous aide à améliorer SantéProxi." };
}

export async function feedbackStatus(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) return { error: "Requête invalide" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_feedback_status", { p_id: id.data, p_status: str(fd, "status") });
  if (error) return { error: humanizeError(error) };
  revalidatePath("/admin/avis");
  return { ok: true };
}

// ---------------- Mode simple ----------------
export async function setSimpleMode(fd: FormData) {
  const { cookies } = await import("next/headers");
  const on = fd.get("on") === "1";
  (await cookies()).set("pp_simple", on ? "1" : "0", { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  const back = String(fd.get("back") ?? "/");
  redirect(back.startsWith("/") && !back.startsWith("//") ? back : "/");
}
