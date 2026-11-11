"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { humanizeError, type ActionState } from "@/lib/errors";
import { BLOOD_GROUPS, DONATION_TYPES } from "@/lib/donor";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const on = (fd: FormData, k: string) => fd.get(k) === "on";
const PATH = "/don-de-sang/mon-espace";

export async function saveDonorProfile(_: ActionState, fd: FormData): Promise<ActionState> {
  const group = str(fd, "blood_group");
  if (group && !BLOOD_GROUPS.includes(group as (typeof BLOOD_GROUPS)[number])) return { error: "Groupe sanguin invalide." };
  const sex = str(fd, "sex");
  if (sex && !["M", "F"].includes(sex)) return { error: "Choix invalide." };
  const creating = fd.get("creating") === "1";
  if (creating && !on(fd, "consent")) return { error: "Cochez la case pour accepter la création de votre espace donneur." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("donor_save_profile", { p: {
    blood_group: group, sex, usual_center: str(fd, "usual_center").slice(0, 160), region_id: str(fd, "region_id"),
    status: str(fd, "status") || undefined, card_show_name: on(fd, "card_show_name"), card_show_last_donation: on(fd, "card_show_last_donation"),
    reminders: on(fd, "reminders"), accepts_solicitations: on(fd, "accepts_solicitations"), consent: creating ? "true" : undefined,
  } });
  if (error) return { error: humanizeError(error) };
  revalidatePath(PATH);
  return { ok: true, message: creating ? "Votre espace donneur est créé. Merci pour votre engagement !" : "Profil donneur enregistré." };
}

export async function declareDonation(_: ActionState, fd: FormData): Promise<ActionState> {
  const date = str(fd, "donated_on"); const type = str(fd, "donation_type") || "sang_total";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Indiquez la date du don.", fieldErrors: { donated_on: "Obligatoire" } };
  if (str(fd, "center").length < 3) return { error: "Indiquez le centre ou le lieu de collecte.", fieldErrors: { center: "Obligatoire" } };
  if (!(type in DONATION_TYPES)) return { error: "Type de don invalide." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("donor_declare_donation", { p: { donated_on: date, center: str(fd, "center").slice(0, 160), donation_type: type, campaign_id: str(fd, "campaign_id") } });
  if (error) return { error: humanizeError(error) };
  revalidatePath(PATH);
  return { ok: true, message: `Don ${data as string} enregistré. Il sera compté après sa validation par le centre de collecte.` };
}

export async function cancelDonation(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = z.uuid().safeParse(fd.get("id"));
  if (!id.success) return { error: "Requête invalide." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("donor_cancel_donation", { p_id: id.data });
  if (error) return { error: humanizeError(error) };
  revalidatePath(PATH);
  return { ok: true, message: "Don retiré." };
}

export async function renewCardToken(_: ActionState): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("donor_renew_card_token");
  if (error) return { error: humanizeError(error) };
  revalidatePath(PATH);
  return { ok: true, message: "Nouveau QR code créé : l'ancien ne fonctionne plus." };
}

export async function issueCertificate(_: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("donor_issue_certificate", { p_show_name: on(fd, "show_name") });
  if (error) return { error: humanizeError(error) };
  redirect(`/don-de-sang/certificat/${data as string}`);
}

export async function deleteDonorSpace(_: ActionState, fd: FormData): Promise<ActionState> {
  if (str(fd, "confirm").toUpperCase() !== "SUPPRIMER") return { error: "Écrivez SUPPRIMER pour confirmer." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("donor_delete_space");
  if (error) return { error: humanizeError(error) };
  revalidatePath(PATH);
  return { ok: true, message: "Votre espace donneur et tout son historique ont été supprimés." };
}

// ---------------- Validation (CNTS, administration) ----------------
export async function decideDonation(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = z.uuid().safeParse(fd.get("id"));
  const decision = z.enum(["valide", "refuse"]).safeParse(str(fd, "decision"));
  if (!id.success || !decision.success) return { error: "Décision invalide." };
  const group = str(fd, "confirm_group");
  const supabase = await createClient();
  const { error } = await supabase.rpc("blood_decide_donation", { p_id: id.data, p_decision: decision.data, p_note: str(fd, "note").slice(0, 300), p_confirm_group: group || null });
  if (error) return { error: humanizeError(error) };
  revalidatePath("/don-de-sang/validation");
  return { ok: true, message: decision.data === "valide" ? "Don validé : le donneur est prévenu." : "Don refusé : le donneur est prévenu du motif." };
}

export async function setBadgeThreshold(_: ActionState, fd: FormData): Promise<ActionState> {
  const n = Number(str(fd, "threshold"));
  if (!Number.isInteger(n) || n < 1 || n > 500) return { error: "Seuil entre 1 et 500." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_badge_threshold", { p_code: str(fd, "code"), p_threshold: n });
  if (error) return { error: humanizeError(error) };
  revalidatePath("/don-de-sang/validation");
  return { ok: true, message: "Palier enregistré." };
}
