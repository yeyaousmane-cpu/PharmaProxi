"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { humanizeError, type ActionState } from "@/lib/errors";
import { requireUser } from "@/lib/auth";

const uuid = z.uuid();
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const run = async (path: string[], fn: (s: Awaited<ReturnType<typeof createClient>>) => PromiseLike<{ error: unknown }>, message: string): Promise<ActionState> => {
  const supabase = await createClient();
  const { error } = await fn(supabase);
  if (error) return { error: humanizeError(error) };
  for (const p of path) revalidatePath(p);
  return { ok: true, message };
};

export async function designatePartner(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireUser("/admin/referentiel");
  const id = uuid.safeParse(fd.get("id")); if (!id.success) return { error: "Fiche invalide" };
  return run([`/etablissements/${id.data}`], (s) => s.rpc("admin_facility_partner", { p_facility: id.data, p_email: str(fd, "email"), p_role: str(fd, "role") || null, p_note: str(fd, "note"), p_active: fd.get("remove") !== "1" }), fd.get("remove") === "1" ? "Accès partenaire retiré." : "Membre partenaire désigné.");
}

export async function setAccessInfo(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireUser("/etablissements/espace");
  const id = uuid.safeParse(fd.get("id")); if (!id.success) return { error: "Fiche invalide" };
  return run([`/etablissements/${id.data}`, "/etablissements/espace"], (s) => s.rpc("facility_set_access", { p_facility: id.data, p_field: str(fd, "field"), p_value: str(fd, "value"), p_source_url: str(fd, "source_url") || null }), "Information enregistrée et datée.");
}

export async function declareServiceStatus(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireUser("/etablissements/espace");
  const id = uuid.safeParse(fd.get("id")); if (!id.success) return { error: "Fiche invalide" };
  return run([`/etablissements/${id.data}`, "/etablissements/espace"], (s) => s.rpc("facility_declare_service", { p_facility: id.data, p_service: str(fd, "service"), p_status: str(fd, "status"), p_hours: Number(str(fd, "hours")) || 24, p_message: str(fd, "message") || null }), "État du service publié jusqu'à son expiration.");
}

export async function endServiceStatus(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireUser("/etablissements/espace");
  const id = uuid.safeParse(fd.get("id")); if (!id.success) return { error: "Requête invalide" };
  return run(["/etablissements/espace"], (s) => s.rpc("facility_end_service_status", { p_id: id.data }), "Information retirée.");
}

export async function requestFacilityAppointment(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = uuid.safeParse(fd.get("id"));
  await requireUser(`/etablissements/${id.success ? id.data : ""}`);
  if (!id.success) return { error: "Fiche invalide" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("facility_request_appointment", { p_facility: id.data, p_service: str(fd, "service"), p_preferred: str(fd, "preferred"), p_reason: str(fd, "reason") || null, p_share_phone: fd.get("share_phone") === "on" });
  if (error) return { error: humanizeError(error) };
  revalidatePath("/compte/rendez-vous-etablissements");
  return { ok: true, message: `Demande ${data} envoyée. L'établissement vous proposera un créneau dans l'application (aucun SMS).` };
}

export async function facilityAppointmentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireUser("/compte/rendez-vous-etablissements");
  const id = uuid.safeParse(fd.get("id")); const action = str(fd, "action");
  if (!id.success || !["proposer", "refuser", "honoree", "non_venu", "confirmer", "annuler"].includes(action)) return { error: "Requête invalide" };
  const at = str(fd, "at");
  const when = at ? new Date(`${at}:00+00:00`).toISOString() : null;
  return run(["/compte/rendez-vous-etablissements", "/etablissements/espace"], (s) => s.rpc("facility_appointment_action", { p_id: id.data, p_action: action, p_at: when, p_message: str(fd, "message") || null }),
    { proposer: "Créneau proposé au patient.", refuser: "Réponse envoyée au patient.", honoree: "Rendez-vous marqué honoré.", non_venu: "Absence enregistrée.", confirmer: "Rendez-vous confirmé.", annuler: "Demande annulée." }[action]!);
}
