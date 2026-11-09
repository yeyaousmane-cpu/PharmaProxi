"use server";
import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { humanizeError, type ActionState } from "@/lib/errors";
import { clientIp } from "@/lib/request";
import { allow } from "@/lib/limiter";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

// ---------------- Avis sur un article ----------------
export async function voteHelp(_: ActionState, fd: FormData): Promise<ActionState> {
  const slug = str(fd, "slug");
  if (!/^[a-z0-9-]{3,90}$/.test(slug)) return { error: "Article invalide." };
  const ip = (await clientIp()) ?? "inconnu";
  if (!(await allow(`help-vote:${ip}`, 30, 60 * 60_000))) return { error: "Trop d'avis envoyés, réessayez plus tard." };
  // Clé anonyme : empreinte de l'adresse IP et de l'article, l'adresse elle-même n'est pas conservée
  const voter = createHash("sha256").update(`${ip}|${slug}|${process.env.CRON_SECRET ?? "pp"}`).digest("hex");
  const supabase = await createClient();
  const { error } = await supabase.rpc("vote_help_article", { p_slug: slug, p_useful: fd.get("useful") === "1", p_voter: voter });
  if (error) return { error: humanizeError(error) };
  return { ok: true, message: fd.get("useful") === "1" ? "Merci pour votre avis !" : "Merci. Vous pouvez aussi contacter l'équipe ci-dessous." };
}

// ---------------- Tickets ----------------
export async function createTicket(_: ActionState, fd: FormData): Promise<ActionState> {
  const ip = (await clientIp()) ?? "inconnu";
  if (!(await allow(`ticket:${ip}`, 10, 60 * 60_000))) return { error: "Trop de demandes envoyées, réessayez plus tard." };
  if (str(fd, "website")) return { ok: true, message: "Demande envoyée." }; // pot de miel anti-robots
  const email = str(fd, "email");
  if (email && !z.email().safeParse(email).success) return { error: "Adresse e-mail invalide.", fieldErrors: { email: "Adresse invalide" } };
  const name = str(fd, "name");
  if (name.length < 2) return { error: "Indiquez votre nom.", fieldErrors: { name: "Obligatoire" } };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_support_ticket", {
    p_name: name, p_email: email || null, p_phone: str(fd, "phone") || null, p_category: str(fd, "category") || null,
    p_subject: str(fd, "subject"), p_body: str(fd, "body"), p_page: str(fd, "page") || null,
  });
  if (error) return { error: humanizeError(error) };
  revalidatePath("/compte/aide");
  return { ok: true, message: `Demande envoyée. Votre numéro de suivi : ${data as string}. Conservez-le pour toute relance.` };
}

export async function replyTicket(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = z.uuid().safeParse(fd.get("id"));
  if (!id.success) return { error: "Demande invalide." };
  const body = str(fd, "body");
  const staff = fd.get("staff") === "1";
  if (!staff && body.length < 2) return { error: "Écrivez votre message." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("reply_support_ticket", {
    p_ticket: id.data, p_body: body || null, p_internal: staff && fd.get("internal") === "on",
    p_status: staff ? str(fd, "status") || null : null, p_priority: staff ? str(fd, "priority") || null : null,
  });
  if (error) return { error: humanizeError(error) };
  revalidatePath(`/compte/aide/${id.data}`); revalidatePath(`/admin/aide/tickets/${id.data}`); revalidatePath("/admin/aide/tickets");
  return { ok: true, message: staff ? "Demande mise à jour." : "Message envoyé." };
}

// ---------------- Rédaction (administration) ----------------
const article = z.object({
  slug: z.string().regex(/^[a-z0-9-]{3,90}$/, "Adresse : minuscules, chiffres et tirets (3 à 90 caractères)."),
  category_slug: z.string().regex(/^[a-z0-9-]{2,60}$/, "Choisissez une catégorie."),
  section: z.string().min(2, "Section obligatoire.").max(80),
  title: z.string().min(5, "Titre trop court.").max(140),
  summary: z.string().min(10, "Résumé trop court.").max(300),
  body: z.string().min(20, "Contenu trop court.").max(20000),
  keywords: z.string().max(500),
  status: z.enum(["brouillon", "publie"]),
  sort: z.coerce.number().int().min(0).max(9999),
});

export async function saveHelpArticle(_: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = article.safeParse({
    slug: str(fd, "slug").toLowerCase(), category_slug: str(fd, "category_slug"), section: str(fd, "section"), title: str(fd, "title"),
    summary: str(fd, "summary"), body: String(fd.get("body") ?? "").trim(), keywords: str(fd, "keywords"), status: str(fd, "status") || "brouillon", sort: str(fd, "sort") || "100",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide." };
  const id = z.uuid().safeParse(fd.get("id"));
  const supabase = await createClient();
  const { error } = id.success
    ? await supabase.from("help_articles").update(parsed.data).eq("id", id.data)
    : await supabase.from("help_articles").insert(parsed.data);
  if (error) return { error: error.code === "23505" ? "Cette adresse d'article existe déjà." : humanizeError(error) };
  revalidatePath("/aide", "layout"); revalidatePath("/admin/aide");
  return { ok: true, message: id.success ? "Article enregistré." : "Article créé." };
}

export async function deleteHelpArticle(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = z.uuid().safeParse(fd.get("id"));
  if (!id.success) return { error: "Article invalide." };
  const supabase = await createClient();
  const { error } = await supabase.from("help_articles").delete().eq("id", id.data);
  if (error) return { error: humanizeError(error) };
  revalidatePath("/aide", "layout"); revalidatePath("/admin/aide");
  return { ok: true, message: "Article supprimé." };
}
