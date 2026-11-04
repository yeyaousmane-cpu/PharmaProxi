"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { humanizeError, type ActionState } from "@/lib/errors";
import { allow } from "@/lib/limiter";
import { clientIp } from "@/lib/request";
import { normalizePhone } from "@/lib/format";

const KINDS = ["pharmacie", "medecin", "clinique", "laboratoire", "autre"] as const;
const contactSchema = z.object({
  kind: z.enum(KINDS, { message: "Choisissez votre profession" }),
  full_name: z.string().trim().min(2, "Indiquez votre nom").max(120),
  structure: z.string().trim().min(2, "Indiquez le nom de la structure").max(160),
  region_id: z.union([z.literal(""), z.uuid()]),
  phone: z.string().trim().min(8, "Indiquez un téléphone").max(30),
  email: z.union([z.literal(""), z.email("Adresse e-mail invalide").max(200)]),
  authorization_ref: z.string().trim().max(160),
  message: z.string().trim().max(1000),
});

/** Demande d'un professionnel : aucun compte, aucun accès n'est créé. L'administrateur traite la demande. */
export async function submitProContact(_: ActionState, fd: FormData): Promise<ActionState> {
  if (String(fd.get("website") ?? "") !== "") return { ok: true, message: "Demande envoyée." };
  const raw = Object.fromEntries(Object.keys(contactSchema.shape).map((k) => [k, String(fd.get(k) ?? "")]));
  const parsed = contactSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    return { error: Object.values(fieldErrors)[0], fieldErrors };
  }
  const phone = normalizePhone(parsed.data.phone);
  if (!phone) return { error: "Numéro de téléphone invalide", fieldErrors: { phone: "Format malien accepté : 70 00 00 00" } };
  if (!(await allow(`procontact:${await clientIp()}`, 5, 60 * 60_000))) return { error: "Trop de demandes envoyées depuis ce réseau. Réessayez plus tard." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_pro_contact", { p: { ...parsed.data, phone } });
  if (error) return { error: humanizeError(error) };
  revalidatePath("/admin/professionnels");
  return { ok: true, message: "Merci, votre demande est envoyée. L'équipe SantéProxi vérifie votre autorisation d'exercer puis vous recontacte." };
}

// ---------------- Administration ----------------
const PRO_KINDS = ["pharmacie", "medecin", "clinique"] as const;

export async function authorizePro(_: ActionState, fd: FormData): Promise<ActionState> {
  const kind = z.enum(PRO_KINDS).safeParse(fd.get("kind"));
  const email = z.email().safeParse(String(fd.get("email") ?? "").trim());
  if (!kind.success) return { error: "Choisissez le type de professionnel." };
  if (!email.success) return { error: "Adresse e-mail invalide", fieldErrors: { email: "Adresse e-mail invalide" } };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_authorize_pro", { p_email: email.data, p_kind: kind.data, p_note: String(fd.get("note") ?? "").slice(0, 300) || null });
  if (error) return { error: humanizeError(error) };
  const req = z.uuid().safeParse(fd.get("request_id"));
  if (req.success) await supabase.rpc("admin_pro_contact_status", { p_id: req.data, p_status: "traitee", p_note: "Inscription autorisée" });
  revalidatePath("/admin/professionnels");
  return { ok: true, message: "Autorisation donnée. La personne est prévenue et peut maintenant compléter son inscription." };
}

export async function revokePro(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = z.uuid().safeParse(fd.get("user_id"));
  const kind = z.enum(PRO_KINDS).safeParse(fd.get("kind"));
  if (!user.success || !kind.success) return { error: "Demande invalide" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_revoke_pro_authorization", { p_user: user.data, p_kind: kind.data });
  if (error) return { error: humanizeError(error) };
  revalidatePath("/admin/professionnels");
  return { ok: true, message: "Autorisation retirée." };
}

export async function setProContactStatus(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = z.uuid().safeParse(fd.get("id"));
  const status = z.enum(["nouvelle", "en_cours", "traitee", "refusee"]).safeParse(fd.get("status"));
  if (!id.success || !status.success) return { error: "Demande invalide" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_pro_contact_status", { p_id: id.data, p_status: status.data, p_note: String(fd.get("note") ?? "").slice(0, 500) || null });
  if (error) return { error: humanizeError(error) };
  revalidatePath("/admin/professionnels");
  return { ok: true, message: "Demande mise à jour." };
}
