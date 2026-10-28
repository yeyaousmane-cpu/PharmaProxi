"use server";
/**
 * Annuaire médical : actions des médecins, des cliniques, du public (signalements)
 * et de l'administration. Toutes les règles sont imposées en base ; ces actions
 * valident les saisies et traduisent les erreurs.
 */
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { humanizeError, type ActionState } from "@/lib/errors";
import { clinicSchema, doctorSchema, fieldErrors, formObject } from "@/lib/validation";
import { parseSchedule } from "@/lib/directory";
import { normalizePhone } from "@/lib/format";
import { setFlash } from "@/lib/flash";

const uuid = z.uuid();
const ALLOWED_MIME = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const EXT: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const DOCTOR_DOCS = ["inscription_ordre", "diplome_specialite", "piece_identite", "autre"] as const;
const CLINIC_DOCS = ["autorisation_ouverture", "rccm", "nif", "piece_identite", "autre"] as const;
const SERVICES = ["laboratoire", "imagerie", "maternite", "hospitalisation", "bloc_operatoire", "pharmacie_interne"];

function doctorPayload(fd: FormData) {
  return doctorSchema.safeParse({
    ...formObject(fd),
    languages: fd.getAll("languages").map(String),
    specialties: fd.getAll("specialties").map(String),
  });
}

function revalidateDirectory() {
  revalidatePath("/medecins", "layout");
  revalidatePath("/cliniques", "layout");
  revalidatePath("/medecin", "layout");
  revalidatePath("/clinique", "layout");
}

// ---------------------------------------------------------------------------
// Médecin
// ---------------------------------------------------------------------------
export async function registerDoctor(_: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = doctorPayload(fd);
  if (!parsed.success) return { error: "Vérifiez le formulaire", fieldErrors: fieldErrors(parsed.error) };
  if (fd.get("consent") !== "on") {
    return { error: "Votre accord est nécessaire", fieldErrors: { consent: "Cochez la case pour autoriser la publication de vos coordonnées professionnelles." } };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("register_doctor", { p: { ...parsed.data, consent: true } });
  if (error) return { error: humanizeError(error) };
  revalidatePath("/", "layout");
  redirect("/medecin?inscrit=1#justificatifs");
}

export async function updateDoctor(_: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = doctorPayload(fd);
  if (!parsed.success) return { error: "Vérifiez le formulaire", fieldErrors: fieldErrors(parsed.error) };
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_doctor", { p: parsed.data });
  if (error) return { error: humanizeError(error) };
  revalidateDirectory();
  return { ok: true, message: "Fiche enregistrée." };
}

export async function confirmDoctorInfo(_: ActionState): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("confirm_doctor_info");
  if (error) return { error: humanizeError(error) };
  revalidateDirectory();
  return { ok: true, message: "Merci : vos informations sont confirmées pour 90 jours." };
}

export async function setDoctorPublished(fd: FormData) {
  const supabase = await createClient();
  const pub = fd.get("published") === "1";
  const { error } = await supabase.rpc("set_doctor_published", { p_published: pub });
  await setFlash(error ? humanizeError(error) : pub ? "Votre fiche est de nouveau publiée." : "Votre fiche est retirée de l'annuaire.");
  revalidateDirectory();
}

export async function resubmitDoctor() {
  const supabase = await createClient();
  const { error } = await supabase.rpc("resubmit_doctor");
  await setFlash(error ? humanizeError(error) : "Demande soumise à nouveau.");
  revalidateDirectory();
}

async function uploadTo(kind: "doctor" | "clinic", ownerId: string, docType: string, file: FormDataEntryValue | null) {
  if (!(file instanceof File) || file.size === 0) return { error: "Choisissez un fichier." };
  if (file.size > 5 * 1024 * 1024) return { error: "Fichier trop volumineux (5 Mo maximum)." };
  if (!ALLOWED_MIME.includes(file.type)) return { error: "Formats acceptés : PDF, JPEG, PNG, WebP." };
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: "Session expirée" };
  const path = `${kind}/${ownerId}/${docType}-${crypto.randomUUID()}.${EXT[file.type]}`;
  const { error: upErr } = await supabase.storage.from("directory-documents").upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) return { error: humanizeError(upErr) };
  const row = { doc_type: docType, storage_path: path, file_name: file.name.slice(0, 200), uploaded_by: auth.user.id };
  const { error } = kind === "doctor"
    ? await supabase.from("doctor_documents").insert({ ...row, doctor_id: ownerId })
    : await supabase.from("clinic_documents").insert({ ...row, clinic_id: ownerId });
  if (error) {
    await supabase.storage.from("directory-documents").remove([path]);
    return { error: humanizeError(error) };
  }
  return null;
}

export async function uploadDoctorDocument(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = uuid.safeParse(fd.get("doctor_id"));
  const type = z.enum(DOCTOR_DOCS).safeParse(fd.get("doc_type"));
  if (!id.success || !type.success) return { error: "Requête invalide" };
  const err = await uploadTo("doctor", id.data, type.data, fd.get("file"));
  if (err) return err;
  revalidatePath("/medecin");
  return { ok: true, message: "Justificatif déposé." };
}

export async function deleteDirectoryDocument(fd: FormData) {
  const id = uuid.safeParse(fd.get("document_id"));
  const kind = fd.get("kind") === "clinic" ? "clinic" : "doctor";
  if (!id.success) return;
  const supabase = await createClient();
  const table = kind === "doctor" ? "doctor_documents" : "clinic_documents";
  const { data: doc } = await supabase.from(table).select("storage_path").eq("id", id.data).maybeSingle();
  if (!doc) return;
  const { error } = await supabase.from(table).delete().eq("id", id.data);
  if (!error) await supabase.storage.from("directory-documents").remove([doc.storage_path]);
  revalidatePath(kind === "doctor" ? "/medecin" : "/clinique", "layout");
}

function sitePhone(fd: FormData) {
  const raw = String(fd.get("appointment_phone") ?? "").trim();
  if (!raw) return { phone: null as string | null };
  const p = normalizePhone(raw);
  return p ? { phone: p } : { error: "Numéro de rendez-vous invalide (ex. 70 00 00 00)." };
}

export async function proposeSite(_: ActionState, fd: FormData): Promise<ActionState> {
  const clinic = uuid.safeParse(fd.get("clinic_id"));
  if (!clinic.success) return { error: "Choisissez un établissement." };
  let schedule;
  try {
    schedule = parseSchedule(fd);
  } catch (e) {
    return { error: (e as Error).message };
  }
  if (!Object.keys(schedule).length) return { error: "Indiquez au moins un jour de consultation." };
  const ph = sitePhone(fd);
  if (ph.error) return { error: ph.error };
  const supabase = await createClient();
  const { error } = await supabase.rpc("doctor_propose_site", { p_clinic: clinic.data, p_schedule: schedule, p_phone: ph.phone });
  if (error) return { error: humanizeError(error) };
  revalidateDirectory();
  return { ok: true, message: "Lieu ajouté. Il sera publié dès que l'établissement l'aura accepté." };
}

export async function updateSite(_: ActionState, fd: FormData): Promise<ActionState> {
  const site = uuid.safeParse(fd.get("site_id"));
  if (!site.success) return { error: "Requête invalide" };
  let schedule;
  try {
    schedule = parseSchedule(fd);
  } catch (e) {
    return { error: (e as Error).message };
  }
  if (!Object.keys(schedule).length) return { error: "Indiquez au moins un jour de consultation." };
  const ph = sitePhone(fd);
  if (ph.error) return { error: ph.error };
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_practice_site", { p_site: site.data, p_schedule: schedule, p_phone: ph.phone });
  if (error) return { error: humanizeError(error) };
  revalidateDirectory();
  return { ok: true, message: "Planning enregistré." };
}

export async function acceptSite(fd: FormData) {
  const site = uuid.safeParse(fd.get("site_id"));
  if (!site.success) return;
  const supabase = await createClient();
  const { error } = await supabase.rpc("accept_practice_site", { p_site: site.data });
  await setFlash(error ? humanizeError(error) : "Planning accepté : il est publié dès que les deux fiches sont vérifiées.");
  revalidateDirectory();
}

export async function removeSite(fd: FormData) {
  const site = uuid.safeParse(fd.get("site_id"));
  if (!site.success) return;
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_practice_site", { p_site: site.data });
  await setFlash(error ? humanizeError(error) : "Lieu de consultation retiré.");
  revalidateDirectory();
}

export async function addAbsence(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = z.object({ starts_on: z.iso.date("Date de début invalide"), ends_on: z.iso.date("Date de fin invalide"), note: z.string().trim().max(120).optional() })
    .safeParse(formObject(fd));
  if (!s.success) return { error: Object.values(fieldErrors(s.error))[0] };
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_doctor_absence", { p_starts: s.data.starts_on, p_ends: s.data.ends_on, p_note: s.data.note ?? null });
  if (error) return { error: humanizeError(error) };
  revalidateDirectory();
  return { ok: true, message: "Absence enregistrée : elle s'affiche sur votre fiche." };
}

export async function removeAbsence(fd: FormData) {
  const id = uuid.safeParse(fd.get("absence_id"));
  if (!id.success) return;
  const supabase = await createClient();
  await supabase.rpc("remove_doctor_absence", { p_absence: id.data });
  revalidateDirectory();
}

// ---------------------------------------------------------------------------
// Clinique
// ---------------------------------------------------------------------------
function clinicPayload(fd: FormData) {
  const parsed = clinicSchema.safeParse(formObject(fd));
  if (!parsed.success) return { error: { error: "Vérifiez le formulaire", fieldErrors: fieldErrors(parsed.error) } as ActionState };
  let hours;
  try {
    hours = parseSchedule(fd);
  } catch (e) {
    return { error: { error: (e as Error).message } as ActionState };
  }
  const services = fd.getAll("services").map(String).filter((s) => SERVICES.includes(s));
  return { data: { ...parsed.data, opening_hours: hours, services } };
}

export async function registerClinic(_: ActionState, fd: FormData): Promise<ActionState> {
  const p = clinicPayload(fd);
  if (p.error) return p.error;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("register_clinic", { p: p.data });
  if (error) return { error: humanizeError(error) };
  revalidatePath("/", "layout");
  redirect(`/clinique/${data as string}?inscrite=1#justificatifs`);
}

export async function updateClinic(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = uuid.safeParse(fd.get("clinic_id"));
  if (!id.success) return { error: "Requête invalide" };
  const p = clinicPayload(fd);
  if (p.error) return p.error;
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_clinic", { p_clinic: id.data, p: p.data });
  if (error) return { error: humanizeError(error) };
  revalidateDirectory();
  return { ok: true, message: "Informations enregistrées." };
}

export async function confirmClinicInfo(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = uuid.safeParse(fd.get("clinic_id"));
  if (!id.success) return { error: "Requête invalide" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("confirm_clinic_info", { p_clinic: id.data });
  if (error) return { error: humanizeError(error) };
  revalidateDirectory();
  return { ok: true, message: "Merci : les informations de l'établissement sont confirmées pour 90 jours." };
}

export async function resubmitClinic(fd: FormData) {
  const id = uuid.safeParse(fd.get("clinic_id"));
  if (!id.success) return;
  const supabase = await createClient();
  const { error } = await supabase.rpc("resubmit_clinic", { p_clinic: id.data });
  await setFlash(error ? humanizeError(error) : "Demande soumise à nouveau.");
  revalidateDirectory();
}

export async function uploadClinicDocument(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = uuid.safeParse(fd.get("clinic_id"));
  const type = z.enum(CLINIC_DOCS).safeParse(fd.get("doc_type"));
  if (!id.success || !type.success) return { error: "Requête invalide" };
  const err = await uploadTo("clinic", id.data, type.data, fd.get("file"));
  if (err) return err;
  revalidatePath(`/clinique/${id.data}`);
  return { ok: true, message: "Justificatif déposé." };
}

export async function inviteDoctor(_: ActionState, fd: FormData): Promise<ActionState> {
  const clinic = uuid.safeParse(fd.get("clinic_id"));
  const doctor = uuid.safeParse(fd.get("doctor_id"));
  if (!clinic.success || !doctor.success) return { error: "Requête invalide" };
  let schedule;
  try {
    schedule = parseSchedule(fd);
  } catch (e) {
    return { error: (e as Error).message };
  }
  if (!Object.keys(schedule).length) return { error: "Indiquez au moins un jour de consultation." };
  const ph = sitePhone(fd);
  if (ph.error) return { error: ph.error };
  const supabase = await createClient();
  const { error } = await supabase.rpc("clinic_invite_doctor", { p_clinic: clinic.data, p_doctor: doctor.data, p_schedule: schedule, p_phone: ph.phone });
  if (error) return { error: humanizeError(error) };
  revalidateDirectory();
  return { ok: true, message: "Invitation envoyée : le planning sera publié dès que le médecin l'aura accepté." };
}

export async function clinicAddMember(_: ActionState, fd: FormData): Promise<ActionState> {
  const clinic = uuid.safeParse(fd.get("clinic_id"));
  const email = z.string().trim().toLowerCase().pipe(z.email("Adresse e-mail invalide")).safeParse(fd.get("email"));
  if (!clinic.success) return { error: "Requête invalide" };
  if (!email.success) return { error: "Adresse e-mail invalide" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("clinic_add_member", { p_clinic: clinic.data, p_email: email.data });
  if (error) return { error: humanizeError(error) };
  revalidatePath(`/clinique/${clinic.data}`);
  return { ok: true, message: "Membre ajouté à l'équipe." };
}

export async function clinicRemoveMember(fd: FormData) {
  const clinic = uuid.safeParse(fd.get("clinic_id"));
  const user = uuid.safeParse(fd.get("user_id"));
  if (!clinic.success || !user.success) return;
  const supabase = await createClient();
  await supabase.rpc("clinic_remove_member", { p_clinic: clinic.data, p_user: user.data });
  revalidatePath(`/clinique/${clinic.data}`);
}

// ---------------------------------------------------------------------------
// Public : signalement d'une fiche
// ---------------------------------------------------------------------------
const reportSchema = z.object({
  doctor_id: z.preprocess((v) => (v === "" ? undefined : v), z.uuid().optional()),
  clinic_id: z.preprocess((v) => (v === "" ? undefined : v), z.uuid().optional()),
  reason: z.enum(["numero_errone", "ne_consulte_plus", "informations_erronees", "comportement", "autre"]),
  description: z.string().trim().max(1000).optional(),
});

export async function submitDirectoryReport(_: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = reportSchema.safeParse(formObject(fd));
  if (!parsed.success || (!parsed.data.doctor_id && !parsed.data.clinic_id)) return { error: "Signalement invalide" };
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: "Connectez-vous pour signaler un problème." };
  const { error } = await supabase.from("reports").insert({ ...parsed.data, reporter_id: auth.user.id });
  if (error) return { error: humanizeError(error) };
  return { ok: true, message: "Merci, votre signalement a été transmis à l'équipe PharmaProxi." };
}

// ---------------------------------------------------------------------------
// Administration
// ---------------------------------------------------------------------------
const reviewSchema = z.object({
  decision: z.enum(["verified", "rejected", "suspended"]),
  reason: z.string().trim().max(1000).optional(),
});

function checklist(fd: FormData, keys: string[]) {
  return Object.fromEntries(keys.map((k) => [k, fd.get(`check_${k}`) === "on"]));
}

export async function reviewDoctor(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = uuid.safeParse(fd.get("doctor_id"));
  const r = reviewSchema.safeParse(formObject(fd));
  if (!id.success || !r.success) return { error: "Requête invalide" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_review_doctor", {
    p_doctor: id.data, p_decision: r.data.decision, p_reason: r.data.reason || null,
    p_checklist: checklist(fd, ["ordre", "diplome", "identite", "lieu", "telephone"]),
  });
  if (error) return { error: humanizeError(error) };
  revalidatePath("/admin/annuaire", "layout");
  revalidateDirectory();
  return { ok: true, message: "Décision enregistrée et notifiée au médecin." };
}

export async function reviewClinic(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = uuid.safeParse(fd.get("clinic_id"));
  const r = reviewSchema.safeParse(formObject(fd));
  if (!id.success || !r.success) return { error: "Requête invalide" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_review_clinic", {
    p_clinic: id.data, p_decision: r.data.decision, p_reason: r.data.reason || null,
    p_checklist: checklist(fd, ["autorisation", "existence_legale", "responsable", "adresse", "telephone"]),
  });
  if (error) return { error: humanizeError(error) };
  revalidatePath("/admin/annuaire", "layout");
  revalidateDirectory();
  return { ok: true, message: "Décision enregistrée et notifiée à l'établissement." };
}

export async function saveSpecialty(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = z.object({
    id: z.preprocess((v) => (v === "" ? undefined : v), z.uuid().optional()),
    code: z.string().trim().regex(/^[a-z0-9_]{2,40}$/, "Code : lettres minuscules, chiffres et _").optional(),
    name: z.string().trim().min(2, "Nom requis").max(80),
    family: z.string().trim().min(2, "Famille requise").max(80),
    description: z.string().trim().max(400).optional(),
    sort_order: z.coerce.number().int().min(0).max(10000).default(100),
  }).safeParse(formObject(fd));
  if (!s.success) return { error: Object.values(fieldErrors(s.error))[0] };
  if (!s.data.id && !s.data.code) return { error: "Code requis pour une nouvelle spécialité" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_save_specialty", {
    p_id: s.data.id ?? null, p_code: s.data.code ?? null, p_name: s.data.name, p_family: s.data.family,
    p_description: s.data.description ?? null, p_sort: s.data.sort_order, p_active: fd.get("is_active") === "on",
  });
  if (error) return { error: humanizeError(error) };
  revalidatePath("/admin/annuaire", "layout");
  revalidatePath("/specialites");
  return { ok: true, message: "Spécialité enregistrée." };
}

export async function transferPharmacyOwner(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = uuid.safeParse(fd.get("pharmacy_id"));
  const email = z.string().trim().toLowerCase().pipe(z.email()).safeParse(fd.get("email"));
  const reason = String(fd.get("reason") ?? "").trim().slice(0, 500);
  if (!id.success) return { error: "Requête invalide" };
  if (!email.success) return { error: "Adresse e-mail invalide" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_transfer_pharmacy_owner", { p_pharmacy: id.data, p_email: email.data, p_reason: reason });
  if (error) return { error: humanizeError(error) };
  revalidatePath(`/admin/pharmacies/${id.data}`);
  return { ok: true, message: "Titularité transférée. L'ancien titulaire reste collaborateur : retirez-le de l'équipe si nécessaire." };
}
