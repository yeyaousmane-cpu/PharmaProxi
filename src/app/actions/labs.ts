"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { humanizeError, type ActionState } from "@/lib/errors";
import { requireUser } from "@/lib/auth";
import { setFlash } from "@/lib/flash";
import { normalizePhone } from "@/lib/format";

const uuid = z.uuid();
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const isoDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
const int = (v: string) => { const d = v.replace(/[\s.]/g, ""); return d === "" ? null : /^\d{1,8}$/.test(d) ? Number(d) : NaN; };

export async function setAccountType(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireUser("/compte");
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_account_type", { p_type: str(fd, "account_type") });
  if (error) return { error: humanizeError(error) };
  revalidatePath("/", "layout");
  return { ok: true, message: "Profil enregistré." };
}

// ---------------- Demande d'accès laboratoire ----------------
export async function requestLabAccess(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireUser("/laboratoire/inscription");
  const phone = normalizePhone(str(fd, "phone"));
  const fe: Record<string, string> = {};
  if (str(fd, "lab_name").length < 2) fe.lab_name = "Obligatoire";
  if (!phone) fe.phone = "Numéro invalide";
  if (str(fd, "authorization_ref").length < 2) fe.authorization_ref = "Obligatoire";
  if (Object.keys(fe).length) return { error: "Vérifiez le formulaire.", fieldErrors: fe };
  const supabase = await createClient();
  const { error } = await supabase.from("lab_access_requests").insert({
    user_id: s.userId, lab_name: str(fd, "lab_name").slice(0, 160), region_id: uuid.safeParse(fd.get("region_id")).success ? str(fd, "region_id") : null,
    address: str(fd, "address").slice(0, 300) || null, phone, authorization_ref: str(fd, "authorization_ref").slice(0, 120),
    role_in_lab: str(fd, "role_in_lab").slice(0, 120) || null, message: str(fd, "message").slice(0, 1000) || null,
    facility_id: uuid.safeParse(fd.get("facility_id")).success ? str(fd, "facility_id") : null,
  });
  if (error) return { error: humanizeError(error) };
  await supabase.rpc("set_account_type", { p_type: "laboratoire" });
  return { ok: true, message: "Demande envoyée. L'équipe vérifie l'autorisation du laboratoire puis ouvre votre espace ; vous recevrez une notification." };
}

// ---------------- Espace laboratoire ----------------
export async function saveLabExam(_: ActionState, fd: FormData): Promise<ActionState> {
  const fac = uuid.safeParse(fd.get("facility_id")), exam = uuid.safeParse(fd.get("exam_id"));
  if (!fac.success || !exam.success) return { error: "Choisissez une analyse." };
  const supabase = await createClient();
  if (fd.get("remove") === "1") {
    const { error } = await supabase.rpc("lab_remove_exam", { p_facility: fac.data, p_exam: exam.data });
    if (error) return { error: humanizeError(error) };
  } else {
    const price = int(str(fd, "price_xof"));
    if (Number.isNaN(price)) return { error: "Prix invalide.", fieldErrors: { price_xof: "Nombre entier en FCFA" } };
    const { error } = await supabase.rpc("lab_save_exam", { p_facility: fac.data, p_exam: exam.data, p_price: price, p_note: str(fd, "price_note").slice(0, 80), p_delay: str(fd, "delay").slice(0, 60) });
    if (error) return { error: humanizeError(error) };
  }
  revalidatePath("/laboratoire"); revalidatePath("/laboratoires");
  return { ok: true, message: fd.get("remove") === "1" ? "Analyse retirée." : "Analyse enregistrée." };
}

export async function suggestExam(_: ActionState, fd: FormData): Promise<ActionState> {
  const fac = uuid.safeParse(fd.get("facility_id"));
  if (!fac.success || str(fd, "name").length < 2) return { error: "Indiquez le nom de l'analyse." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("lab_suggest_exam", { p_facility: fac.data, p_name: str(fd, "name").slice(0, 120), p_category: str(fd, "category") });
  if (error) return { error: humanizeError(error) };
  return { ok: true, message: "Merci : l'équipe ajoutera cette analyse au catalogue après vérification." };
}

export async function saveHomeService(_: ActionState, fd: FormData): Promise<ActionState> {
  const fac = uuid.safeParse(fd.get("facility_id"));
  if (!fac.success) return { error: "Requête invalide" };
  const fee = int(str(fd, "fee_xof"));
  if (Number.isNaN(fee)) return { error: "Frais invalides.", fieldErrors: { fee_xof: "Nombre entier en FCFA" } };
  const supabase = await createClient();
  const { error } = await supabase.rpc("lab_save_home_service", { p_facility: fac.data, p: {
    enabled: fd.get("enabled") === "on", fee_xof: fee === null ? "" : String(fee), partner_name: str(fd, "partner_name"),
    partner_provider_id: uuid.safeParse(fd.get("partner_provider_id")).success ? str(fd, "partner_provider_id") : "", areas: str(fd, "areas"),
    hours: str(fd, "hours"), conditions: str(fd, "conditions"),
  } });
  if (error) return { error: humanizeError(error) };
  revalidatePath("/laboratoire/domicile"); revalidatePath("/laboratoires/domicile");
  return { ok: true, message: "Enregistré." };
}

export async function updateSampling(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) return { error: "Requête invalide" };
  const date = str(fd, "date"), time = str(fd, "time");
  let scheduled: string | null = null;
  if (date) { if (!isoDate(date) || (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))) return { error: "Date ou heure invalide." }; scheduled = `${date}T${time || "08:00"}:00Z`; }
  if (str(fd, "status") === "planifiee" && !scheduled) return { error: "Indiquez la date et l'heure du passage.", fieldErrors: { date: "Obligatoire" } };
  const supabase = await createClient();
  const { error } = await supabase.rpc("lab_update_sampling", { p_id: id.data, p_status: str(fd, "status"), p_scheduled: scheduled, p_note: str(fd, "note").slice(0, 500) });
  if (error) return { error: humanizeError(error) };
  revalidatePath("/laboratoire/prelevements");
  return { ok: true, message: "Demande mise à jour, le patient est prévenu." };
}

// ---------------- Patient ----------------
export async function requestSampling(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireUser("/laboratoires/domicile");
  const fac = uuid.safeParse(fd.get("facility_id"));
  if (!fac.success) return { error: "Requête invalide" };
  const phone = normalizePhone(str(fd, "phone"));
  const exams = fd.getAll("exam_ids").map(String).filter((x) => uuid.safeParse(x).success).slice(0, 30);
  const fe: Record<string, string> = {};
  if (!exams.length && !str(fd, "other_exams")) fe.exam_ids = "Choisissez au moins une analyse";
  if (str(fd, "patient_name").length < 2) fe.patient_name = "Obligatoire";
  if (str(fd, "address").length < 5) fe.address = "Indiquez l'adresse précise (quartier, rue, porte, repère)";
  if (!phone) fe.phone = "Numéro invalide";
  const d = str(fd, "preferred_date");
  if (!isoDate(d) || d < new Date().toISOString().slice(0, 10)) fe.preferred_date = "Date invalide";
  const age = str(fd, "patient_age");
  if (age && !(/^\d{1,3}$/.test(age) && Number(age) <= 120)) fe.patient_age = "Âge invalide";
  if (Object.keys(fe).length) return { error: "Vérifiez le formulaire.", fieldErrors: fe };
  const supabase = await createClient();
  const { error } = await supabase.rpc("request_home_sampling", { p: {
    facility_id: fac.data, exam_ids: exams, other_exams: str(fd, "other_exams").slice(0, 300), patient_name: str(fd, "patient_name").slice(0, 120),
    patient_age: age, for_relative: fd.get("for_relative") === "on", address: str(fd, "address").slice(0, 300), region_id: str(fd, "region_id"), phone,
    preferred_date: d, slot: ["matin", "midi", "apres_midi"].includes(str(fd, "slot")) ? str(fd, "slot") : "matin",
    has_prescription: fd.get("has_prescription") === "on", fasting_known: fd.get("fasting_known") === "on", notes: str(fd, "notes").slice(0, 500),
  } });
  if (error) return { error: humanizeError(error) };
  await setFlash("Demande envoyée au laboratoire. Vous serez prévenu(e) dès qu'il répond.");
  redirect("/compte/prelevements");
}

export async function cancelSampling(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) return { error: "Requête invalide" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_home_sampling", { p_id: id.data });
  if (error) return { error: humanizeError(error) };
  revalidatePath("/compte/prelevements");
  return { ok: true, message: "Demande annulée." };
}

// ---------------- Administration ----------------
export async function grantLab(_: ActionState, fd: FormData): Promise<ActionState> {
  const fac = uuid.safeParse(fd.get("facility_id"));
  if (!fac.success) return { error: "Choisissez le laboratoire dans l'annuaire." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_grant_lab", { p_email: str(fd, "email"), p_facility: fac.data, p_request: uuid.safeParse(fd.get("request_id")).success ? str(fd, "request_id") : null, p_role: "responsable" });
  if (error) return { error: humanizeError(error) };
  revalidatePath("/admin/laboratoires");
  return { ok: true, message: "Accès accordé." };
}
