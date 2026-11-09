"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { humanizeError, type ActionState } from "@/lib/errors";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

// ---------------- Consentements ----------------
export async function setConsent(_: ActionState, fd: FormData): Promise<ActionState> {
  const purpose = str(fd, "purpose");
  if (!/^[a-z_]{3,40}$/.test(purpose)) return { error: "Finalité invalide." };
  const granted = fd.get("granted") === "1";
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_consent", { p_purpose: purpose, p_granted: granted, p_method: "centre_confidentialite" });
  if (error) return { error: humanizeError(error) };
  revalidatePath("/compte/confidentialite");
  return { ok: true, message: granted ? "Consentement enregistré." : "Consentement retiré. Vos données déjà enregistrées ne sont pas supprimées automatiquement." };
}

// ---------------- Demandes d'exercice des droits ----------------
const KINDS = ["acces", "rectification", "export", "suppression", "opposition", "autre"] as const;
export async function createPrivacyRequest(_: ActionState, fd: FormData): Promise<ActionState> {
  const kind = z.enum(KINDS).safeParse(str(fd, "kind"));
  if (!kind.success) return { error: "Choisissez le type de demande." };
  const message = str(fd, "message");
  if (message.length > 2000) return { error: "Message trop long (2 000 caractères maximum)." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_privacy_request", { p_kind: kind.data, p_message: message });
  if (error) return { error: humanizeError(error) };
  revalidatePath("/compte/confidentialite");
  return { ok: true, message: "Demande envoyée. Vous serez notifié(e) de son traitement." };
}

export async function handlePrivacyRequest(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = z.uuid().safeParse(fd.get("id"));
  const status = z.enum(["nouvelle", "en_cours", "traitee", "refusee"]).safeParse(str(fd, "status"));
  if (!id.success || !status.success) return { error: "Formulaire invalide." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("handle_privacy_request", { p_id: id.data, p_status: status.data, p_note: str(fd, "note") });
  if (error) return { error: humanizeError(error) };
  revalidatePath("/admin/confidentialite");
  return { ok: true, message: "Demande mise à jour, l'utilisateur est notifié." };
}

// ---------------- Sessions ----------------
export async function signOutOtherDevices(_: ActionState): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut({ scope: "others" });
  if (error) return { error: humanizeError(error) };
  await supabase.rpc("log_privacy_event", { p_action: "privacy.signout_others" });
  return { ok: true, message: "Vos autres appareils ont été déconnectés." };
}
