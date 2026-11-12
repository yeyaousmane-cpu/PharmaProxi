"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { humanizeError, type ActionState } from "@/lib/errors";
import { normalizePhone } from "@/lib/format";
import { CORRECTION_KINDS, LINK_RELATIONS, OFFER_TYPES } from "@/lib/national-directory";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const id = (fd: FormData, k = "id") => z.uuid().safeParse(fd.get(k));
const page = (fid: string) => { revalidatePath(`/etablissements/${fid}`); revalidatePath("/etablissements"); };

/** Signalement d'une information incorrecte, ou demande de correction par l'établissement (modérée avant publication). */
export async function submitFacilityCorrection(_: ActionState, fd: FormData): Promise<ActionState> {
  const f = id(fd); const kind = str(fd, "kind");
  if (!f.success || !(kind in CORRECTION_KINDS)) return { error: "Choisissez ce qui est incorrect." };
  if (str(fd, "message").length < 5) return { error: "Décrivez la correction en quelques mots.", fieldErrors: { message: "Obligatoire" } };
  const role = str(fd, "role") === "etablissement" ? "etablissement" : "usager";
  const supabase = await createClient();
  const { error } = await supabase.rpc("facility_correction_submit", { p_facility: f.data, p_kind: kind, p_message: str(fd, "message").slice(0, 1000), p_role: role,
    p_contact: str(fd, "contact").slice(0, 160), p_proposed: {} });
  if (error) return { error: humanizeError(error) };
  return { ok: true, message: "Merci ! Votre signalement sera examiné par l'équipe SantéProxi avant toute modification de la fiche." };
}

export async function reviewCorrection(_: ActionState, fd: FormData): Promise<ActionState> {
  const c = id(fd); const d = z.enum(["acceptee", "refusee"]).safeParse(str(fd, "decision"));
  if (!c.success || !d.success) return { error: "Requête invalide." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_review_correction", { p_id: c.data, p_decision: d.data, p_note: str(fd, "note").slice(0, 500) });
  if (error) return { error: humanizeError(error) };
  revalidatePath("/admin/referentiel");
  return { ok: true, message: d.data === "acceptee" ? "Correction acceptée. Modifiez la fiche si nécessaire." : "Correction refusée." };
}

export async function setFacilityStatus(_: ActionState, fd: FormData): Promise<ActionState> {
  const f = id(fd);
  const op = z.enum(["actif_confirme", "signale_actif", "non_confirme", "ferme"]).safeParse(str(fd, "operating"));
  const ct = z.enum(["source_officielle", "confirme_etablissement", "a_confirmer"]).safeParse(str(fd, "contacts"));
  if (!f.success || !op.success || !ct.success) return { error: "Requête invalide." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_facility_status", { p_id: f.data, p_operating: op.data, p_contacts: ct.data, p_note: str(fd, "note").slice(0, 250) });
  if (error) return { error: humanizeError(error) };
  page(f.data);
  return { ok: true, message: "Statut enregistré dans l'historique de la fiche." };
}

export async function setFacilityOffer(_: ActionState, fd: FormData): Promise<ActionState> {
  const f = id(fd); const type = str(fd, "type");
  const status = z.enum(["confirme", "a_confirmer", "indisponible", "supprimer"]).safeParse(str(fd, "status"));
  const code = str(fd, "code").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 60);
  if (!f.success || !(type in OFFER_TYPES) || !status.success || code.length < 2) return { error: "Indiquez le type, le libellé et le statut." };
  if (status.data !== "supprimer" && str(fd, "source").length < 3) return { error: "Citez la source de l'information.", fieldErrors: { source: "Obligatoire" } };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_offer", { p_facility: f.data, p_type: type, p_code: code, p_label: str(fd, "label").slice(0, 160) || code, p_status: status.data,
    p_source: str(fd, "source").slice(0, 300) || "—", p_url: str(fd, "url") || null });
  if (error) return { error: humanizeError(error) };
  page(f.data);
  return { ok: true, message: "Offre de soins mise à jour." };
}

export async function linkFacility(_: ActionState, fd: FormData): Promise<ActionState> {
  const f = id(fd); const r = id(fd, "related"); const rel = str(fd, "relation");
  if (!f.success || !r.success || !(rel in LINK_RELATIONS)) return { error: "Choisissez l'établissement associé et la relation (identifiant de sa fiche)." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_link_facilities", { p_facility: f.data, p_related: r.data, p_relation: rel, p_source: str(fd, "source").slice(0, 300), p_url: str(fd, "url") || null,
    p_remove: fd.get("remove") === "1" });
  if (error) return { error: humanizeError(error) };
  page(f.data);
  return { ok: true, message: fd.get("remove") === "1" ? "Relation retirée." : "Relation ajoutée avec sa source." };
}

export async function saveFacilityExtra(_: ActionState, fd: FormData): Promise<ActionState> {
  const f = id(fd);
  if (!f.success) return { error: "Requête invalide." };
  const wa = str(fd, "whatsapp");
  const waN = wa ? normalizePhone(wa) : "";
  if (wa && !waN) return { error: "Numéro WhatsApp invalide (format +223…).", fieldErrors: { whatsapp: "Format invalide" } };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_save_facility_extra", { p_id: f.data, p: { whatsapp: waN ?? "", locality: str(fd, "locality"), circle_id: str(fd, "circle_id"),
    commune_id: str(fd, "commune_id"), alt_names: str(fd, "alt_names"), is_published: fd.get("is_published") === "on" } });
  if (error) return { error: humanizeError(error) };
  page(f.data);
  return { ok: true, message: "Fiche enregistrée." };
}

export async function decideDuplicate(_: ActionState, fd: FormData): Promise<ActionState> {
  const a = id(fd, "a"); const b = id(fd, "b"); const d = z.enum(["distincts", "fusionnes"]).safeParse(str(fd, "decision"));
  if (!a.success || !b.success || !d.success) return { error: "Requête invalide." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_decide_duplicate", { p_a: a.data, p_b: b.data, p_decision: d.data, p_keep: a.data });
  if (error) return { error: humanizeError(error) };
  revalidatePath("/admin/referentiel");
  return { ok: true, message: d.data === "fusionnes" ? "Fiches fusionnées : la seconde est retirée de la recherche, ses sources sont conservées." : "Marquées comme établissements distincts." };
}
