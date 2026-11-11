"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { humanizeError, type ActionState } from "@/lib/errors";
import { normalizePhone } from "@/lib/format";
import { CARE_TYPES } from "@/lib/nurses";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const uuid = (fd: FormData, k: string) => z.uuid().safeParse(fd.get(k));
const ALLOWED_MIME = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const EXT: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const NURSE_DOCS = ["inscription_ordre", "diplome", "piece_identite", "autre"] as const;

// ---------------- Espace infirmier ----------------
export async function registerNurse(_: ActionState, fd: FormData): Promise<ActionState> {
  const name = str(fd, "display_name"); const num = str(fd, "registration_number");
  if (name.length < 3) return { error: "Indiquez vos nom et prénom.", fieldErrors: { display_name: "Obligatoire" } };
  if (num.length < 2) return { error: "Indiquez votre numéro d'inscription à l'Ordre.", fieldErrors: { registration_number: "Obligatoire" } };
  if (fd.get("consent") !== "on") return { error: "Cochez la case pour accepter la publication de votre fiche après vérification." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("nurse_register_self", { p: { display_name: name, registration_number: num, specialty: str(fd, "specialty"), region_id: str(fd, "region_id"), commune_id: str(fd, "commune_id"), consent: "true" } });
  if (error) return { error: humanizeError(error) };
  revalidatePath("/infirmier");
  return { ok: true, message: "Inscription enregistrée. Déposez maintenant vos justificatifs : l'équipe les vérifie avant de publier votre fiche." };
}

export async function updateNurseSelf(_: ActionState, fd: FormData): Promise<ActionState> {
  const raw = str(fd, "phone");
  const phone = raw ? normalizePhone(raw) : null;
  if (raw && !phone) return { error: "Numéro de téléphone invalide.", fieldErrors: { phone: "Invalide" } };
  const supabase = await createClient();
  const { error } = await supabase.rpc("nurse_update_self", { p: {
    specialty: str(fd, "specialty"), region_id: str(fd, "region_id"), commune_id: str(fd, "commune_id"), areas: str(fd, "areas").slice(0, 300),
    care_types: fd.getAll("care_types").map(String).filter((c) => c in CARE_TYPES), hours: str(fd, "hours").slice(0, 200), prices: str(fd, "prices").slice(0, 300),
    phone, phone_public: fd.get("phone_public") === "on", accepts_requests: fd.get("accepts_requests") === "on", published: fd.get("published") === "on",
  } });
  if (error) return { error: humanizeError(error) };
  revalidatePath("/infirmier"); revalidatePath("/infirmiers");
  return { ok: true, message: "Fiche enregistrée." };
}

export async function uploadNurseDocument(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = uuid(fd, "nurse_id");
  const type = z.enum(NURSE_DOCS).safeParse(fd.get("doc_type"));
  const file = fd.get("file");
  if (!id.success || !type.success) return { error: "Requête invalide." };
  if (!(file instanceof File) || file.size === 0) return { error: "Choisissez un fichier." };
  if (file.size > 5 * 1024 * 1024) return { error: "Fichier trop volumineux (5 Mo maximum)." };
  if (!ALLOWED_MIME.includes(file.type)) return { error: "Formats acceptés : PDF, JPEG, PNG, WebP." };
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: "Connectez-vous de nouveau." };
  const path = `nurse/${id.data}/${type.data}-${crypto.randomUUID()}.${EXT[file.type]}`;
  const { error: up } = await supabase.storage.from("directory-documents").upload(path, file, { contentType: file.type, upsert: false });
  if (up) return { error: humanizeError(up) };
  const { error } = await supabase.from("nurse_documents").insert({ nurse_id: id.data, doc_type: type.data, storage_path: path, file_name: file.name.slice(0, 200), uploaded_by: auth.user.id });
  if (error) { await supabase.storage.from("directory-documents").remove([path]); return { error: humanizeError(error) }; }
  revalidatePath("/infirmier");
  return { ok: true, message: "Justificatif déposé." };
}

export async function reviewNurse(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = uuid(fd, "id");
  const decision = z.enum(["verified", "rejected", "suspended"]).safeParse(str(fd, "decision"));
  if (!id.success || !decision.success) return { error: "Décision invalide." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_review_nurse", { p_id: id.data, p_decision: decision.data, p_reason: str(fd, "reason") });
  if (error) return { error: humanizeError(error) };
  revalidatePath("/admin/infirmiers/comptes"); revalidatePath("/infirmiers");
  return { ok: true, message: decision.data === "verified" ? "Infirmier vérifié : sa fiche est publiée." : "Décision enregistrée ; l'infirmier est prévenu." };
}

// ---------------- Demandes de soins à domicile ----------------
export async function requestHomeCare(_: ActionState, fd: FormData): Promise<ActionState> {
  const nurse = uuid(fd, "nurse_id");
  const care = str(fd, "care_type"); const slot = str(fd, "preferred_slot"); const date = str(fd, "preferred_date");
  const phone = normalizePhone(str(fd, "contact_phone"));
  if (!nurse.success || !(care in CARE_TYPES) || !["matin", "apres_midi", "soir"].includes(slot) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Vérifiez le type de soin, la date et le moment." };
  if (!phone) return { error: "Indiquez un numéro où l'infirmier peut vous rappeler.", fieldErrors: { contact_phone: "Invalide" } };
  if (str(fd, "area").length < 2) return { error: "Indiquez le quartier où les soins auront lieu.", fieldErrors: { area: "Obligatoire" } };
  if (fd.get("accord") !== "on") return { error: "Cochez la case pour transmettre votre demande à cet infirmier." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("request_home_care", { p: { nurse_id: nurse.data, care_type: care, preferred_date: date, preferred_slot: slot, area: str(fd, "area").slice(0, 160),
    contact_phone: phone, message: str(fd, "message").slice(0, 500), has_prescription: fd.get("has_prescription") === "on", accord: "true" } });
  if (error) return { error: humanizeError(error) };
  revalidatePath("/compte/soins-domicile");
  return { ok: true, message: `Demande ${data as string} envoyée. L'infirmier vous répondra dans votre espace ; rien n'est confirmé tant qu'il n'a pas accepté.` };
}

export async function setHomeCareStatus(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = uuid(fd, "id");
  const status = z.enum(["acceptee", "refusee", "terminee", "annulee"]).safeParse(str(fd, "status"));
  if (!id.success || !status.success) return { error: "Demande invalide." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("home_care_set_status", { p_id: id.data, p_status: status.data, p_reply: str(fd, "reply").slice(0, 500) });
  if (error) return { error: humanizeError(error) };
  revalidatePath("/infirmier"); revalidatePath("/compte/soins-domicile");
  const msg = { acceptee: "Demande acceptée : le patient est prévenu.", refusee: "Demande refusée : le patient est prévenu.", terminee: "Soins marqués comme effectués.", annulee: "Demande annulée." };
  return { ok: true, message: msg[status.data] };
}

// ---------------- Médecin traitant ----------------
export async function setTreatingDoctor(_: ActionState, fd: FormData): Promise<ActionState> {
  const person = uuid(fd, "person_id");
  if (!person.success) return { error: "Dossier invalide." };
  const mode = str(fd, "mode");
  const raw = str(fd, "free_phone");
  const phone = raw ? normalizePhone(raw) : null;
  if (mode === "libre" && str(fd, "free_name").length < 3) return { error: "Indiquez le nom du médecin.", fieldErrors: { free_name: "Obligatoire" } };
  if (mode === "annuaire" && !z.uuid().safeParse(fd.get("doctor_id")).success) return { error: "Choisissez un médecin dans la liste." };
  if (raw && !phone) return { error: "Numéro de téléphone invalide.", fieldErrors: { free_phone: "Invalide" } };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_treating_doctor", { p: mode === "annuaire"
    ? { person_id: person.data, doctor_id: str(fd, "doctor_id"), notify_doctor: fd.get("notify_doctor") === "on", since: str(fd, "since") }
    : { person_id: person.data, free_name: str(fd, "free_name"), free_structure: str(fd, "free_structure"), free_phone: phone, since: str(fd, "since") } });
  if (error) return { error: humanizeError(error) };
  revalidatePath("/ma-sante/dossier/contacts");
  return { ok: true, message: "Médecin traitant enregistré." };
}

export async function removeTreatingDoctor(_: ActionState, fd: FormData): Promise<ActionState> {
  const person = uuid(fd, "person_id");
  if (!person.success) return { error: "Dossier invalide." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_treating_doctor", { p_person: person.data });
  if (error) return { error: humanizeError(error) };
  revalidatePath("/ma-sante/dossier/contacts");
  return { ok: true, message: "Médecin traitant retiré." };
}
