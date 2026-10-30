"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { humanizeError, type ActionState } from "@/lib/errors";
import { setFlash } from "@/lib/flash";
import { allow } from "@/lib/limiter";
import { clientIp } from "@/lib/request";
import { HEALTH_SECTIONS, HEALTH_AUDIENCE } from "@/lib/health/labels";
import { parseFaq, parseMyths, parseSources, slugify } from "@/lib/health/parse";

const uuid = z.uuid();
const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
function refresh(id?: string) {
  revalidatePath("/sante", "layout");
  revalidatePath("/redaction-sante", "layout");
  if (id) revalidatePath(`/redaction-sante/${id}`);
}

export async function saveHealthArticle(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = s(fd, "id");
  const title = s(fd, "title");
  const slug = s(fd, "slug") || slugify(title);
  if (title.length < 3) return { error: "Indiquez un titre.", fieldErrors: { title: "Titre obligatoire" } };
  if (!/^[a-z0-9-]{3,90}$/.test(slug)) return { error: "Identifiant d'adresse : minuscules, chiffres et tirets (3 à 90).", fieldErrors: { slug: "Format invalide" } };
  const faq = parseFaq(s(fd, "faq"));
  const myths = parseMyths(s(fd, "myths"));
  const sources = parseSources(s(fd, "sources"), new Date().toISOString().slice(0, 10));
  if (faq.errors) return { error: `Questions fréquentes : ${faq.errors} bloc(s) mal formé(s). Chaque bloc commence par « Q : » puis « R : ».`, fieldErrors: { faq: "Format à corriger" } };
  if (myths.errors) return { error: `Idées reçues : ${myths.errors} bloc(s) mal formé(s). Chaque bloc commence par « Idée : » puis « Vérité : ».`, fieldErrors: { myths: "Format à corriger" } };
  if (sources.errors.length) return { error: `Sources : ${sources.errors.join(" ; ")}`, fieldErrors: { sources: "Format à corriger" } };
  const body = Object.fromEntries(HEALTH_SECTIONS.map(([k]) => [k, s(fd, `body_${k}`)]).filter(([, v]) => v));
  const list = (k: string) => s(fd, k).split(/[,\s]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);
  const payload = {
    id: id || undefined, slug, title, category_slug: s(fd, "category_slug"), kind: s(fd, "kind") || "fiche",
    summary: s(fd, "summary"), keywords: s(fd, "keywords"),
    audiences: fd.getAll("audiences").map(String).filter((a) => a in HEALTH_AUDIENCE),
    recommendation: s(fd, "recommendation") || null, body, faq: faq.items, myths: myths.items,
    exam_codes: list("exam_codes"), specialty_codes: list("specialty_codes"), is_featured: fd.get("is_featured") === "on",
    sources: sources.items,
  };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("health_save_article", { p: payload });
  if (error) return { error: humanizeError(error) };
  refresh(data as string);
  await setFlash(id ? "Fiche enregistrée." : "Fiche créée en brouillon.");
  if (!id) redirect(`/redaction-sante/${data}`);
  return { ok: true, message: "Fiche enregistrée." };
}

async function simple(rpc: string, args: Record<string, unknown>, msg: string, id?: string): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc(rpc, args);
  if (error) return { error: humanizeError(error) };
  refresh(id);
  await setFlash(msg);
  return { ok: true, message: msg };
}

export async function submitHealthArticle(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) return { error: "Requête invalide" };
  return simple("health_submit", { p_id: id.data }, "Fiche soumise à la validation médicale.", id.data);
}

export async function reviewHealthArticle(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = uuid.safeParse(fd.get("id"));
  const decision = z.enum(["approve", "changes", "reject"]).safeParse(fd.get("decision"));
  if (!id.success || !decision.success) return { error: "Requête invalide" };
  const msg = decision.data === "approve" ? "Fiche validée : elle peut maintenant être publiée." : decision.data === "changes" ? "Correction demandée au rédacteur." : "Fiche rejetée.";
  return simple("health_review", { p_id: id.data, p_decision: decision.data, p_note: s(fd, "note") || null }, msg, id.data);
}

export async function publishHealthArticle(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) return { error: "Requête invalide" };
  const on = fd.get("publish") === "true";
  return simple("health_publish", { p_id: id.data, p_publish: on }, on ? "Fiche publiée : elle est visible de tous." : "Fiche retirée du public.", id.data);
}

export async function deleteHealthArticle(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) return { error: "Requête invalide" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("health_delete_article", { p_id: id.data });
  if (error) return { error: humanizeError(error) };
  refresh();
  await setFlash("Brouillon supprimé.");
  redirect("/redaction-sante");
}

export async function setHealthStaff(_: ActionState, fd: FormData): Promise<ActionState> {
  const role = z.enum(["editor", "validator"]).safeParse(fd.get("role"));
  if (!role.success) return { error: "Choisissez un rôle." };
  const grant = fd.get("grant") !== "false";
  return simple("health_set_staff", { p_email: s(fd, "email"), p_role: role.data, p_display_name: s(fd, "display_name"), p_credentials: s(fd, "credentials") || null, p_grant: grant },
    grant ? "Rôle attribué." : "Rôle retiré.");
}

export async function reportHealthArticle(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = uuid.safeParse(fd.get("article_id"));
  if (!id.success) return { error: "Requête invalide" };
  if (String(fd.get("website") ?? "") !== "") return { ok: true, message: "Merci." };
  if (!(await allow(`health_report:${await clientIp()}`, 5, 60 * 60_000))) return { error: "Trop de signalements depuis ce réseau. Réessayez plus tard." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("health_report", { p_article: id.data, p_reason: s(fd, "reason") });
  if (error) return { error: humanizeError(error) };
  revalidatePath("/redaction-sante");
  return { ok: true, message: "Merci : l'équipe éditoriale va vérifier cette information." };
}

export async function closeHealthReport(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) return { error: "Requête invalide" };
  return simple("health_close_report", { p_id: id.data }, "Signalement traité.");
}
