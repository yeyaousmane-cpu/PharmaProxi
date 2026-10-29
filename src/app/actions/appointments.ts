"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { humanizeError, type ActionState } from "@/lib/errors";
import { setFlash } from "@/lib/flash";
import { allow } from "@/lib/limiter";
import { clientIp } from "@/lib/request";

const uuid = z.uuid();
const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

function refresh(clinic?: string) {
  revalidatePath("/compte/rendez-vous");
  revalidatePath("/medecin/rendez-vous");
  if (clinic) revalidatePath(`/clinique/${clinic}/rendez-vous`);
}

const requestSchema = z.object({
  site_id: uuid,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choisissez une date"),
  period: z.enum(["matin", "apres_midi", "indifferent"]),
  patient_name: z.string().trim().min(2, "Indiquez le nom du patient").max(120),
  phone: z.string().trim().min(8, "Indiquez un numéro de téléphone").max(30),
  reason: z.string().trim().max(300, "300 caractères maximum").optional(),
  key: z.string().max(80).optional(),
});

export async function requestAppointment(_: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = requestSchema.safeParse({
    site_id: s(fd, "site_id"), date: s(fd, "date"), period: s(fd, "period") || "indifferent",
    patient_name: s(fd, "patient_name"), phone: s(fd, "phone"), reason: s(fd, "reason") || undefined, key: s(fd, "key") || undefined,
  });
  if (!parsed.success) {
    return { error: "Vérifiez le formulaire", fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])) };
  }
  if (fd.get("consent") !== "on") return { error: "Cochez la case pour confirmer que vous avez compris le fonctionnement de la demande.", fieldErrors: { consent: "Obligatoire" } };
  if (!(await allow(`appt:${await clientIp()}`, 10, 60 * 60_000))) return { error: "Trop de demandes depuis ce réseau. Réessayez plus tard." };
  const p = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("request_appointment", {
    p_site: p.site_id, p_date: p.date, p_period: p.period, p_patient_name: p.patient_name, p_phone: p.phone, p_reason: p.reason ?? null, p_key: p.key ?? null,
  });
  if (error) return { error: humanizeError(error) };
  refresh();
  await setFlash("Demande envoyée. Le médecin ou son secrétariat va vous répondre ; vous serez notifié ici.");
  redirect("/compte/rendez-vous");
}

export async function setSiteAppointments(_: ActionState, fd: FormData): Promise<ActionState> {
  const site = uuid.safeParse(fd.get("site_id"));
  if (!site.success) return { error: "Requête invalide" };
  const on = fd.get("on") === "true";
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_site_appointments", { p_site: site.data, p_on: on });
  if (error) return { error: humanizeError(error) };
  refresh(s(fd, "clinic_id") || undefined);
  revalidatePath("/medecins", "layout");
  const msg = on ? "Les patients peuvent maintenant demander un rendez-vous en ligne sur ce lieu." : "Demandes en ligne désactivées sur ce lieu.";
  await setFlash(msg);
  return { ok: true, message: msg };
}

/** Champ « datetime-local » ou date + heure → instant UTC (heure du Mali = UTC). */
function toInstant(date: string, time: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  return `${date}T${time}:00Z`;
}

export async function respondAppointment(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = uuid.safeParse(fd.get("id"));
  const action = z.enum(["confirm", "propose", "decline"]).safeParse(fd.get("action"));
  if (!id.success || !action.success) return { error: "Requête invalide" };
  let at: string | null = null;
  if (action.data === "confirm") {
    at = toInstant(s(fd, "date"), s(fd, "time"));
    if (!at) return { error: "Indiquez l'heure du rendez-vous." };
  } else if (action.data === "propose") {
    const v = s(fd, "at");
    at = toInstant(v.slice(0, 10), v.slice(11, 16));
    if (!at) return { error: "Indiquez la date et l'heure proposées." };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("respond_appointment", { p_id: id.data, p_action: action.data, p_at: at, p_note: s(fd, "note") || null });
  if (error) return { error: humanizeError(error) };
  refresh(s(fd, "clinic_id") || undefined);
  const msg = { confirm: "Rendez-vous confirmé : le patient est prévenu.", propose: "Proposition envoyée au patient.", decline: "Demande refusée : le patient est prévenu." }[action.data];
  await setFlash(msg);
  return { ok: true, message: msg };
}

export async function answerProposal(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) return { error: "Requête invalide" };
  const accept = fd.get("accept") === "true";
  const supabase = await createClient();
  const { error } = await supabase.rpc("answer_appointment_proposal", { p_id: id.data, p_accept: accept });
  if (error) return { error: humanizeError(error) };
  refresh();
  const msg = accept ? "Rendez-vous confirmé." : "Proposition refusée.";
  await setFlash(msg);
  return { ok: true, message: msg };
}

export async function cancelAppointment(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) return { error: "Requête invalide" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_appointment", { p_id: id.data, p_reason: s(fd, "reason") || null });
  if (error) return { error: humanizeError(error) };
  refresh(s(fd, "clinic_id") || undefined);
  await setFlash("Rendez-vous annulé.");
  return { ok: true, message: "Rendez-vous annulé." };
}

export async function closeAppointment(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = uuid.safeParse(fd.get("id"));
  const outcome = z.enum(["completed", "no_show"]).safeParse(fd.get("outcome"));
  if (!id.success || !outcome.success) return { error: "Requête invalide" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("close_appointment", { p_id: id.data, p_outcome: outcome.data });
  if (error) return { error: humanizeError(error) };
  refresh(s(fd, "clinic_id") || undefined);
  await setFlash("Rendez-vous clôturé.");
  return { ok: true, message: "Rendez-vous clôturé." };
}

// ---------------------------------------------------------------------------
// Réservation par créneaux (patient)
// ---------------------------------------------------------------------------
const bookSchema = z.object({
  site_id: uuid, type_id: uuid, start: z.iso.datetime({ offset: true }),
  who: z.string().max(40), patient_name: z.string().trim().max(120).optional(), phone: z.string().trim().max(30).optional(),
  reason: z.string().trim().max(300, "300 caractères maximum").optional(), key: z.string().max(80).optional(),
});

export async function bookAppointment(_: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = bookSchema.safeParse({
    site_id: s(fd, "site_id"), type_id: s(fd, "type_id"), start: s(fd, "start"), who: s(fd, "who") || "me",
    patient_name: s(fd, "patient_name") || undefined, phone: s(fd, "phone") || undefined, reason: s(fd, "reason") || undefined, key: s(fd, "key") || undefined,
  });
  if (!parsed.success) return { error: "Vérifiez le formulaire", fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])) };
  if (fd.get("consent") !== "on") return { error: "Cochez la case de confirmation.", fieldErrors: { consent: "Obligatoire" } };
  if (!(await allow(`book:${await clientIp()}`, 20, 60 * 60_000))) return { error: "Trop de réservations depuis ce réseau. Réessayez plus tard." };
  const p = parsed.data;
  const relative = p.who !== "me" && uuid.safeParse(p.who).success ? p.who : null;
  const supabase = await createClient();
  const { error } = await supabase.rpc("book_appointment", {
    p_site: p.site_id, p_type: p.type_id, p_start: p.start, p_patient_name: p.patient_name ?? "", p_phone: p.phone ?? "",
    p_reason: p.reason ?? null, p_relative: relative, p_key: p.key ?? null,
  });
  if (error) return { error: humanizeError(error) };
  refresh();
  await setFlash("Rendez-vous confirmé ! Vous recevrez un rappel la veille.");
  redirect("/compte/rendez-vous");
}

export async function joinWaitlist(_: ActionState, fd: FormData): Promise<ActionState> {
  const site = uuid.safeParse(fd.get("site_id"));
  const until = s(fd, "until");
  if (!site.success || !/^\d{4}-\d{2}-\d{2}$/.test(until)) return { error: "Choisissez une date limite." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("join_waitlist", { p_site: site.data, p_until: until });
  if (error) return { error: humanizeError(error) };
  refresh();
  return { ok: true, message: "C'est noté : vous serez prévenu si un créneau se libère d'ici là." };
}

export async function leaveWaitlist(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) return { error: "Requête invalide" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("leave_waitlist", { p_id: id.data });
  if (error) return { error: humanizeError(error) };
  refresh();
  await setFlash("Alerte supprimée.");
  return { ok: true, message: "Alerte supprimée." };
}

export async function addRelative(_: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_relative", { p_name: s(fd, "full_name"), p_relation: s(fd, "relation") || "autre", p_phone: s(fd, "phone") || null });
  if (error) return { error: humanizeError(error) };
  revalidatePath("/compte/proches");
  return { ok: true, message: "Proche ajouté." };
}

export async function removeRelative(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) return { error: "Requête invalide" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_relative", { p_id: id.data });
  if (error) return { error: humanizeError(error) };
  revalidatePath("/compte/proches");
  await setFlash("Proche retiré.");
  return { ok: true, message: "Proche retiré." };
}

// ---------------------------------------------------------------------------
// Praticien : motifs, réglages, infos pratiques, rendez-vous téléphoniques, plages bloquées
// ---------------------------------------------------------------------------
export async function saveAppointmentType(_: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_appointment_type", {
    p: {
      id: s(fd, "id"), site_id: s(fd, "site_id"), name: s(fd, "name"), duration_min: s(fd, "duration_min"), audience: s(fd, "audience") || "all",
      instructions: s(fd, "instructions"), fee: s(fd, "fee"), sort_order: s(fd, "sort_order") || null,
      is_active: fd.has("is_active_field") ? fd.get("is_active") === "on" : null,
    },
  });
  if (error) return { error: humanizeError(error) };
  refresh(s(fd, "clinic_id") || undefined);
  await setFlash("Motif enregistré.");
  return { ok: true, message: "Motif enregistré." };
}

export async function updateSiteBooking(_: ActionState, fd: FormData): Promise<ActionState> {
  const site = uuid.safeParse(fd.get("site_id"));
  if (!site.success) return { error: "Requête invalide" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_site_booking", {
    p_site: site.data, p_mode: s(fd, "booking_mode"), p_min_notice: Number(s(fd, "min_notice_hours") || 2),
    p_cancel_notice: Number(s(fd, "cancel_notice_hours") || 2), p_access_info: s(fd, "access_info") || null,
  });
  if (error) return { error: humanizeError(error) };
  refresh(s(fd, "clinic_id") || undefined);
  revalidatePath("/medecins", "layout");
  await setFlash("Réglages enregistrés.");
  return { ok: true, message: "Réglages enregistrés." };
}

export async function updatePracticeInfo(_: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_doctor_practice_info", {
    p: {
      presentation: s(fd, "presentation"), fee_info: s(fd, "fee_info"), payment_methods: fd.getAll("payment_methods").map(String),
      accepts_new_patients: fd.get("accepts_new_patients") === "on",
    },
  });
  if (error) return { error: humanizeError(error) };
  refresh();
  revalidatePath("/medecins", "layout");
  await setFlash("Informations pratiques enregistrées.");
  return { ok: true, message: "Informations pratiques enregistrées." };
}

export async function practiceAddAppointment(_: ActionState, fd: FormData): Promise<ActionState> {
  const site = uuid.safeParse(fd.get("site_id"));
  const at = toInstant(s(fd, "date"), s(fd, "time"));
  if (!site.success || !at) return { error: "Indiquez le lieu, la date et l'heure." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("practice_add_appointment", {
    p_site: site.data, p_start: at, p_duration_min: Number(s(fd, "duration_min") || 15), p_patient_name: s(fd, "patient_name"),
    p_phone: s(fd, "phone"), p_note: s(fd, "note") || null, p_type: uuid.safeParse(s(fd, "type_id")).success ? s(fd, "type_id") : null,
  });
  if (error) return { error: humanizeError(error) };
  refresh(s(fd, "clinic_id") || undefined);
  await setFlash("Rendez-vous ajouté à l'agenda : le créneau n'est plus proposé en ligne.");
  return { ok: true, message: "Rendez-vous ajouté à l'agenda : le créneau n'est plus proposé en ligne." };
}

export async function addPracticeBlock(_: ActionState, fd: FormData): Promise<ActionState> {
  const site = uuid.safeParse(fd.get("site_id"));
  const date = s(fd, "date");
  const from = toInstant(date, s(fd, "from"));
  const to = toInstant(date, s(fd, "to"));
  if (!site.success || !from || !to) return { error: "Indiquez le lieu, la date et les heures." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_practice_block", { p_site: site.data, p_start: from, p_end: to, p_note: s(fd, "note") || null });
  if (error) return { error: humanizeError(error) };
  refresh(s(fd, "clinic_id") || undefined);
  await setFlash("Plage bloquée : aucun créneau ne sera proposé pendant ce temps.");
  return { ok: true, message: "Plage bloquée : aucun créneau ne sera proposé pendant ce temps." };
}

export async function removePracticeBlock(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) return { error: "Requête invalide" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_practice_block", { p_id: id.data });
  if (error) return { error: humanizeError(error) };
  refresh(s(fd, "clinic_id") || undefined);
  await setFlash("Plage débloquée.");
  return { ok: true, message: "Plage débloquée." };
}

export async function moveAppointment(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = uuid.safeParse(fd.get("id"));
  const start = s(fd, "start");
  if (!id.success || Number.isNaN(new Date(start).getTime())) return { error: "Requête invalide" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("move_appointment", { p_id: id.data, p_new_start: new Date(start).toISOString() });
  if (error) return { error: humanizeError(error) };
  refresh();
  await setFlash("Rendez-vous déplacé : le cabinet est prévenu.");
  redirect("/compte/rendez-vous");
}
