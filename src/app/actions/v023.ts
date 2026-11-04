"use server";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { humanizeError, type ActionState } from "@/lib/errors";
import { requireUser } from "@/lib/auth";
import { allow } from "@/lib/limiter";
import { clientIp } from "@/lib/request";
import { LANGS, LANG_COOKIE, UI_TEXTS } from "@/lib/i18n";

const uuid = z.uuid();
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

// ---------------- Centres spécialisés (administration) ----------------
export async function addFocus(_: ActionState, fd: FormData): Promise<ActionState> {
  const code = str(fd, "focus_code");
  const target = str(fd, "target"); // « clinic:<uuid> » ou « facility:<uuid> »
  const [kind, id] = target.split(":");
  if (!uuid.safeParse(id).success || !["clinic", "facility"].includes(kind)) return { error: "Choisissez l'établissement." };
  const source = str(fd, "source");
  if (source.length < 3) return { error: "Indiquez la source de l'information (ex. confirmé par téléphone le …).", fieldErrors: { source: "Source obligatoire" } };
  const supabase = await createClient();
  const { error } = await supabase.from("facility_focus").insert({ focus_code: code, clinic_id: kind === "clinic" ? id : null, facility_id: kind === "facility" ? id : null, source, verified_at: new Date().toISOString().slice(0, 10) });
  if (error) return { error: error.code === "23505" ? "Ce centre a déjà cette spécialité." : humanizeError(error) };
  revalidatePath("/admin/centres"); revalidatePath("/centres-specialises");
  return { ok: true, message: "Spécialité ajoutée." };
}

export async function removeFocus(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) return { error: "Élément invalide" };
  const supabase = await createClient();
  const { error } = await supabase.from("facility_focus").delete().eq("id", id.data);
  if (error) return { error: humanizeError(error) };
  revalidatePath("/admin/centres"); revalidatePath("/centres-specialises");
  return { ok: true, message: "Retiré." };
}

// ---------------- Lexique des analyses ----------------
export async function saveLexicon(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = uuid.safeParse(fd.get("exam_id"));
  if (!id.success) return { error: "Analyse invalide" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_save_lexicon", { p_exam: id.data, p_text: str(fd, "text").slice(0, 900), p_validated_by: str(fd, "validated_by") || null });
  if (error) return { error: humanizeError(error) };
  revalidatePath("/admin/lexique"); revalidatePath("/laboratoires/lexique");
  return { ok: true, message: str(fd, "validated_by") ? "Texte validé et publié." : "Brouillon enregistré (non publié)." };
}

// ---------------- Lignes d'écoute ----------------
export async function addSupportLine(_: ActionState, fd: FormData): Promise<ActionState> {
  const row = { name: str(fd, "name"), phone: str(fd, "phone"), hours: str(fd, "hours") || null, description: str(fd, "description") || null,
    topic: str(fd, "topic") || "sante_mentale", source: str(fd, "source") };
  if (row.source.length < 3) return { error: "Indiquez la source (site officiel, appel de vérification…)." };
  const supabase = await createClient();
  const { error } = await supabase.from("support_lines").insert(row);
  if (error) return { error: humanizeError(error) };
  revalidatePath("/admin/lignes-ecoute"); revalidatePath("/sante-mentale");
  return { ok: true, message: "Ligne ajoutée." };
}

export async function toggleSupportLine(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) return { error: "Élément invalide" };
  const supabase = await createClient();
  const { error } = await supabase.from("support_lines").update({ active: fd.get("active") === "1", verified_at: new Date().toISOString().slice(0, 10) }).eq("id", id.data);
  if (error) return { error: humanizeError(error) };
  revalidatePath("/admin/lignes-ecoute"); revalidatePath("/sante-mentale");
  return { ok: true, message: "Mis à jour." };
}

// ---------------- Langues ----------------
export async function setLanguage(fd: FormData) {
  const lang = str(fd, "lang");
  const jar = await cookies();
  if (lang in LANGS && lang !== "fr") jar.set(LANG_COOKIE, lang, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  else jar.delete(LANG_COOKIE);
  revalidatePath("/", "layout");
}

export async function saveTranslation(_: ActionState, fd: FormData): Promise<ActionState> {
  const key = str(fd, "key"); const lang = str(fd, "lang"); const text = str(fd, "text");
  if (!(key in UI_TEXTS) || !(lang in LANGS) || lang === "fr") return { error: "Texte ou langue invalide." };
  if (!text) return { error: "Saisissez la traduction." };
  const validated = str(fd, "validated_by");
  const supabase = await createClient();
  const { error } = await supabase.from("ui_translations").upsert({ key, lang, text, proposed_by: str(fd, "proposed_by") || null,
    status: validated ? "valide" : "propose", validated_by: validated || null, updated_at: new Date().toISOString() });
  if (error) return { error: humanizeError(error) };
  revalidatePath("/admin/traductions"); revalidatePath("/", "layout");
  return { ok: true, message: validated ? "Traduction validée : elle s'affiche sur le site." : "Proposition enregistrée (non affichée tant qu'elle n'est pas validée)." };
}

// ---------------- Scanner de médicaments ----------------
export type ScanResult = { status: "found"; product: { id: string; brand_name: string; generic_name: string | null; dosage: string | null; form: string | null; packaging: string | null; manufacturer: string | null; requires_prescription: boolean } }
  | { status: "unknown"; code: string } | { status: "invalid" };

export async function lookupBarcode(code: string): Promise<ScanResult> {
  const c = String(code ?? "").replace(/\D/g, "");
  if (!/^[0-9]{8,14}$/.test(c)) return { status: "invalid" };
  if (!(await allow(`scan:${await clientIp()}`, 60, 60_000))) return { status: "invalid" };
  const supabase = await createClient();
  const { data } = await supabase.from("medicine_identifiers").select("catalog_id, medicine_catalog(id, brand_name, generic_name, dosage, form, packaging, manufacturer, requires_prescription, review_status)").eq("id_type", "gtin").eq("value", c).maybeSingle();
  const p = (Array.isArray(data?.medicine_catalog) ? data?.medicine_catalog[0] : data?.medicine_catalog) as (ScanResult & { status: "found" })["product"] & { review_status: string } | null | undefined;
  if (!p || p.review_status !== "approved") return { status: "unknown", code: c };
  return { status: "found", product: { id: p.id, brand_name: p.brand_name, generic_name: p.generic_name, dosage: p.dosage, form: p.form, packaging: p.packaging, manufacturer: p.manufacturer, requires_prescription: p.requires_prescription } };
}

export async function searchCatalog(q: string) {
  const t = String(q ?? "").trim().slice(0, 60);
  if (t.length < 2) return [];
  const supabase = await createClient();
  const { data } = await supabase.from("medicine_catalog").select("id, brand_name, dosage, form").eq("review_status", "approved").ilike("brand_name", `%${t.replace(/[%_]/g, "")}%`).order("brand_name").limit(8);
  return data ?? [];
}

export async function suggestGtin(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireUser("/scanner");
  const id = uuid.safeParse(fd.get("catalog_id"));
  if (!id.success) return { error: "Choisissez le médicament correspondant." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("suggest_gtin", { p_code: str(fd, "code"), p_catalog: id.data });
  if (error) return { error: humanizeError(error) };
  revalidatePath("/admin/scanner");
  return { ok: true, message: "Merci ! Votre proposition sera vérifiée par l'équipe avant d'être ajoutée." };
}

export async function reviewGtin(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) return { error: "Proposition invalide" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_review_gtin", { p_id: id.data, p_accept: fd.get("accept") === "1" });
  if (error) return { error: humanizeError(error) };
  revalidatePath("/admin/scanner");
  return { ok: true, message: "Proposition traitée." };
}
