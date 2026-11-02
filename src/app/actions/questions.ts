"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { humanizeError, type ActionState } from "@/lib/errors";
import { requireUser } from "@/lib/auth";
import { detectUrgency } from "@/lib/assistant/safety";

const uuid = z.uuid();
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

export async function askPharmacist(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireUser("/questions-pharmacien");
  const question = str(fd, "question");
  if (question.length < 15) return { error: "Décrivez votre question en quelques phrases (15 caractères au moins)." };
  const urgency = detectUrgency(question);
  const supabase = await createClient();
  const { error } = await supabase.rpc("ask_pharmacist", { p_question: question, p_about: str(fd, "about") || "moi", p_public: fd.get("allow_public") === "on", p_urgent: urgency?.kind === "urgence" });
  if (error) return { error: humanizeError(error) };
  revalidatePath("/questions-pharmacien/mes-questions");
  if (urgency) return { ok: true, data: { urgent: urgency.reason }, message: `Question envoyée. Mais ce que vous décrivez (${urgency.reason}) peut être une urgence : n'attendez pas la réponse, allez immédiatement au service d'urgence le plus proche.` };
  return { ok: true, message: "Question envoyée. Vous recevrez une notification dès qu'un pharmacien aura répondu." };
}

export async function closeQuestion(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) return { error: "Requête invalide" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("close_my_question", { p_id: id.data, p_delete: fd.get("delete") === "1" });
  if (error) return { error: humanizeError(error) };
  revalidatePath("/questions-pharmacien/mes-questions");
  return { ok: true, message: fd.get("delete") === "1" ? "Question supprimée." : "Question close." };
}

export async function answerQuestion(_: ActionState, fd: FormData): Promise<ActionState> {
  const q = uuid.safeParse(fd.get("question_id")), ph = uuid.safeParse(fd.get("pharmacy_id"));
  if (!q.success || !ph.success) return { error: "Requête invalide" };
  const body = str(fd, "body");
  if (body.length < 10) return { error: "Réponse trop courte." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("answer_question", { p_question: q.data, p_pharmacy: ph.data, p_body: body });
  if (error) return { error: humanizeError(error) };
  revalidatePath("/pharmacien/questions"); revalidatePath("/questions-pharmacien");
  return { ok: true, message: "Réponse publiée. Le patient est prévenu." };
}

export async function moderateQuestion(_: ActionState, fd: FormData): Promise<ActionState> {
  const q = str(fd, "question_id"), a = str(fd, "answer_id");
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_moderate_question", { p_question: uuid.safeParse(q).success ? q : null, p_answer: uuid.safeParse(a).success ? a : null, p_hidden: fd.get("hidden") === "true" });
  if (error) return { error: humanizeError(error) };
  revalidatePath("/admin/questions"); revalidatePath("/questions-pharmacien");
  return { ok: true, message: "Mis à jour." };
}
