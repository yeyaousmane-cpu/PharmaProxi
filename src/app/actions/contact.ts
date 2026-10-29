"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { humanizeError, type ActionState } from "@/lib/errors";
import { setFlash } from "@/lib/flash";
import { allow } from "@/lib/limiter";
import { clientIp } from "@/lib/request";

const TOPICS = ["question", "erreur", "donnees", "pharmacie", "medecin", "partenariat", "autre"] as const;
const schema = z.object({
  topic: z.enum(TOPICS, { message: "Choisissez un sujet" }),
  name: z.string().trim().min(2, "Indiquez votre nom").max(120),
  email: z.union([z.literal(""), z.email("Adresse e-mail invalide").max(200)]),
  phone: z.string().trim().max(30),
  message: z.string().trim().min(10, "Votre message est trop court (10 caractères minimum)").max(3000, "3 000 caractères maximum"),
  page: z.string().max(300).optional(),
});

export async function sendContactMessage(_: ActionState, fd: FormData): Promise<ActionState> {
  // Champ piège invisible : rempli uniquement par les robots
  if (String(fd.get("website") ?? "") !== "") return { ok: true, message: "Message envoyé." };
  const parsed = schema.safeParse(Object.fromEntries(["topic", "name", "email", "phone", "message", "page"].map((k) => [k, String(fd.get(k) ?? "")])));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    return { error: Object.values(fieldErrors)[0], fieldErrors };
  }
  const v = parsed.data;
  if (!v.email && !v.phone) return { error: "Indiquez un e-mail ou un téléphone pour que nous puissions vous répondre.", fieldErrors: { email: "E-mail ou téléphone requis" } };
  if (!(await allow(`contact:${await clientIp()}`, 5, 60 * 60_000))) return { error: "Trop de messages envoyés depuis ce réseau. Réessayez plus tard." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("send_contact_message", {
    p_topic: v.topic, p_name: v.name, p_email: v.email || null, p_phone: v.phone || null, p_message: v.message, p_page: v.page || null,
  });
  if (error) return { error: humanizeError(error) };
  revalidatePath("/admin/messages");
  return { ok: true, message: "Merci, votre message a bien été envoyé. Nous vous répondons dès que possible." };
}

export async function updateContactMessage(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = z.uuid().safeParse(fd.get("id"));
  const status = z.enum(["new", "in_progress", "closed"]).safeParse(fd.get("status"));
  if (!id.success || !status.success) return { error: "Requête invalide" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_update_contact_message", { p_id: id.data, p_status: status.data, p_note: String(fd.get("note") ?? "") });
  if (error) return { error: humanizeError(error) };
  revalidatePath("/admin/messages");
  await setFlash("Message mis à jour.");
  return { ok: true, message: "Message mis à jour." };
}
