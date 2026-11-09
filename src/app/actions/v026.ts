"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { humanizeError, type ActionState } from "@/lib/errors";
import { allow } from "@/lib/limiter";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const CONFIRM_MESSAGE = "Vos préférences de confidentialité ont bien été enregistrées. Vous pouvez les consulter ou les modifier à tout moment depuis votre espace personnel.";
const tz = (fd: FormData) => { const t = str(fd, "tz"); return /^[A-Za-z_]+(\/[A-Za-z0-9_+-]+){0,2}$/.test(t) ? t : null; };

// ---------------- Choix de consentement (un, ou tous) ----------------
export async function saveConsentChoice(_: ActionState, fd: FormData): Promise<ActionState> {
  const decision = z.enum(["accorde", "refuse"]).safeParse(str(fd, "decision"));
  if (!decision.success) return { error: "Choix invalide." };
  const purposes = fd.getAll("purpose").map(String).filter((p) => /^[a-z_]{3,40}$/.test(p));
  if (!purposes.length) return { error: "Aucune finalité sélectionnée." };
  const supabase = await createClient();
  for (const p of purposes) {
    const { error } = await supabase.rpc("record_consent", { p_purpose: p, p_decision: decision.data, p_method: "centre_confidentialite", p_lang: str(fd, "lang") || "fr", p_timezone: tz(fd) });
    if (error) return { error: humanizeError(error) };
  }
  revalidatePath("/compte/confidentialite");
  return { ok: true, message: CONFIRM_MESSAGE };
}

// ---------------- Réclamation sur un consentement ----------------
export async function createConsentDispute(_: ActionState, fd: FormData): Promise<ActionState> {
  const message = str(fd, "message");
  if (message.length < 5) return { error: "Décrivez votre réclamation en quelques mots." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_consent_dispute", { p_purpose: str(fd, "purpose") || null, p_message: message.slice(0, 2000) });
  if (error) return { error: humanizeError(error) };
  revalidatePath("/compte/confidentialite");
  return { ok: true, message: `Réclamation enregistrée (référence ${data as string}). Elle sera analysée et vous serez notifié(e).` };
}

// ---------------- Changement d'adresse e-mail (mot de passe redemandé) ----------------
export async function changeEmail(_: ActionState, fd: FormData): Promise<ActionState> {
  const email = z.email().safeParse(str(fd, "email").toLowerCase());
  if (!email.success) return { error: "Adresse e-mail invalide.", fieldErrors: { email: "Adresse invalide" } };
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user?.email) return { error: "Connectez-vous de nouveau." };
  if (!(await allow(`change-email:${auth.user.id}`, 5, 60 * 60_000))) return { error: "Trop de tentatives, réessayez plus tard." };
  const check = await supabase.auth.signInWithPassword({ email: auth.user.email, password: String(fd.get("password") ?? "") });
  if (check.error) return { error: "Mot de passe incorrect.", fieldErrors: { password: "Incorrect" } };
  const { error } = await supabase.auth.updateUser({ email: email.data });
  if (error) return { error: humanizeError(error) };
  return { ok: true, message: "Demande enregistrée. Confirmez le changement en cliquant sur le lien envoyé par e-mail : l'adresse ne change qu'après cette confirmation." };
}

// ---------------- Conformité (personnes habilitées) ----------------
export async function handleDispute(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = z.uuid().safeParse(fd.get("id"));
  if (!id.success) return { error: "Réclamation invalide." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("handle_consent_dispute", { p_id: id.data, p_status: str(fd, "status"), p_shared: str(fd, "shared"), p_actions: str(fd, "actions"), p_report: str(fd, "report") });
  if (error) return { error: humanizeError(error) };
  revalidatePath("/conformite/reclamations");
  return { ok: true, message: "Réclamation mise à jour ; la personne est notifiée." };
}

export async function saveRegistry(_: ActionState, fd: FormData): Promise<ActionState> {
  const keys = ["code", "purpose", "data_categories", "data_subjects", "recipients", "legal_basis", "retention", "security_measures", "transfers", "apdp_formalities", "legal_status", "validated_by_name"];
  const p: Record<string, string> = {};
  for (const k of keys) { const v = fd.get(k); if (v !== null) p[k] = String(v).trim().slice(0, 600); }
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_registry_entry", { p });
  if (error) return { error: humanizeError(error) };
  revalidatePath("/conformite/registre");
  return { ok: true, message: "Traitement enregistré." };
}

export async function publishPolicy(_: ActionState, fd: FormData): Promise<ActionState> {
  const version = str(fd, "version");
  if (!/^[0-9A-Za-z._-]{1,20}$/.test(version)) return { error: "Numéro de version invalide (ex. 2 ou 2026-12)." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("publish_policy_version", { p_version: version, p_title: str(fd, "title"), p_body: String(fd.get("body") ?? "").trim() });
  if (error) return { error: error.code === "23505" ? "Cette version existe déjà." : humanizeError(error) };
  revalidatePath("/conformite/politique");
  return { ok: true, message: `Version ${version} publiée ; la précédente est archivée et reste consultable.` };
}

export async function savePrivacyIdentity(_: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await createClient();
  for (const k of ["privacy_controller_name", "privacy_controller_address", "privacy_controller_registration", "privacy_contact_email", "privacy_contact_phone", "privacy_dpo_name"]) {
    if (fd.get(k) === null) continue;
    const { error } = await supabase.rpc("set_privacy_setting", { p_key: k, p_value: str(fd, k) });
    if (error) return { error: humanizeError(error) };
  }
  revalidatePath("/conformite/identite"); revalidatePath("/votre-sante-vos-donnees");
  return { ok: true, message: "Informations enregistrées." };
}

export async function setComplianceMember(_: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_compliance_member", { p_email: str(fd, "email"), p_role: str(fd, "role") });
  if (error) return { error: humanizeError(error) };
  revalidatePath("/conformite/habilitations");
  return { ok: true, message: "Habilitation mise à jour." };
}

// ---------------- Favoris ----------------
export async function toggleFavorite(_: ActionState, fd: FormData): Promise<ActionState> {
  const kind = z.enum(["medecin", "pharmacie", "etablissement", "laboratoire"]).safeParse(str(fd, "kind"));
  const target = z.uuid().safeParse(fd.get("target"));
  const href = str(fd, "href");
  if (!kind.success || !target.success || !/^\/[a-z0-9/_-]{1,200}$/.test(href)) return { error: "Élément invalide." };
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: "Connectez-vous pour enregistrer des favoris." };
  if (fd.get("on") === "1") {
    const { error } = await supabase.from("favorites").delete().eq("user_id", auth.user.id).eq("kind", kind.data).eq("target_id", target.data);
    if (error) return { error: humanizeError(error) };
  } else {
    const { error } = await supabase.from("favorites").insert({ user_id: auth.user.id, kind: kind.data, target_id: target.data, label: str(fd, "label").slice(0, 160) || "Favori", href });
    if (error && error.code !== "23505") return { error: humanizeError(error) };
  }
  revalidatePath(href); revalidatePath("/compte");
  return { ok: true };
}
