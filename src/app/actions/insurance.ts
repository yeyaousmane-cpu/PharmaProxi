"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { humanizeError, type ActionState } from "@/lib/errors";
import { readCsv } from "@/lib/csv-import";

const uuid = z.uuid();
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const refresh = () => { revalidatePath("/admin/assurances"); revalidatePath("/assurances", "layout"); };

const HEADERS: Record<string, string> = {
  type: "categorie", categorie: "categorie", "type de prestataire": "categorie",
  structure: "nom", nom: "nom", "nom de la structure": "nom", prestataire_structure: "nom",
  "region/commune": "zone", zone: "zone", commune: "zone", ville: "zone", localite: "zone", region: "zone",
  region_nom: "region_nom", "region administrative": "region_nom",
  "situation geographique": "adresse", adresse: "adresse", localisation: "adresse",
  contact: "telephone", telephone: "telephone", tel: "telephone", contact2: "telephone2", telephone2: "telephone2", contact3: "telephone3", telephone3: "telephone3",
};

export async function saveInsurer(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = str(fd, "id");
  if (id && !uuid.safeParse(id).success) return { error: "Requête invalide" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_save_insurer", { p: {
    id: id || null, name: str(fd, "name"), slug: str(fd, "slug"), kind: str(fd, "kind") || "assurance", phone: str(fd, "phone"), website: str(fd, "website"),
    network_date: str(fd, "network_date"), network_source: str(fd, "network_source"), notes: str(fd, "notes"), is_published: fd.get("is_published") === "on",
  } });
  if (error) return { error: humanizeError(error) };
  refresh();
  return { ok: true, message: "Assureur enregistré." };
}

export async function deleteInsurer(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) return { error: "Requête invalide" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_delete_insurer", { p_id: id.data });
  if (error) return { error: humanizeError(error) };
  refresh();
  return { ok: true, message: "Assureur supprimé." };
}

type ImportResult = { imported: number; duplicates: number; failed: number; errors: { row: number; error: string }[]; replaced?: number };

export async function importInsurerNetwork(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = uuid.safeParse(fd.get("insurer_id"));
  if (!id.success) return { error: "Choisissez l'assureur." };
  const csv = await readCsv(fd.get("file"), HEADERS, 4 * 1024 * 1024);
  if ("error" in csv) return { error: csv.error };
  if (!csv.fields.includes("nom")) return { error: "Colonne obligatoire : structure (ou nom). Colonnes reconnues : type, structure, region/commune, region_nom, situation geographique (adresse), contact, contact2, contact3." };
  if (csv.rows.length === 0) return { error: "Le fichier ne contient aucune ligne." };
  if (csv.rows.length > 5000) return { error: "5 000 lignes maximum." };
  const rows = csv.rows.map((r, i) => ({ line: i + 2, categorie: r.categorie ?? "", nom: r.nom ?? "", zone: r.zone ?? "", region_nom: r.region_nom ?? "",
    adresse: r.adresse ?? "", telephone: r.telephone ?? "", telephone2: r.telephone2 ?? "", telephone3: r.telephone3 ?? "" }));
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_import_insurer_network", { p_insurer: id.data, p_rows: rows, p_replace: fd.get("replace") === "on" });
  refresh();
  if (error) return { error: humanizeError(error) };
  const r = data as ImportResult;
  const errs = r.failed ? ` ${r.errors.slice(0, 15).map((e) => `Ligne ${e.row} : ${e.error}`).join(" · ")}` : "";
  return { ok: true, message: `${r.imported} partenaire(s) importé(s), ${r.duplicates} doublon(s) ignoré(s), ${r.failed} ligne(s) en erreur${r.replaced ? `, ${r.replaced} ancienne(s) ligne(s) remplacée(s)` : ""}.${errs}` };
}

export async function linkProvider(_: ActionState, fd: FormData): Promise<ActionState> {
  const prov = uuid.safeParse(fd.get("provider_id"));
  if (!prov.success) return { error: "Requête invalide" };
  const mode = str(fd, "mode");
  const ph = str(fd, "pharmacy_id");
  if (mode === "link" && !uuid.safeParse(ph).success) return { error: "Choisissez la pharmacie inscrite correspondante." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_link_provider", { p_provider: prov.data, p_pharmacy: mode === "link" ? ph : null, p_none: mode === "none" });
  if (error) return { error: humanizeError(error) };
  refresh();
  if (mode === "link") revalidatePath(`/pharmacies/${ph}`);
  return { ok: true, message: mode === "link" ? "Pharmacie reliée." : mode === "none" ? "Lien retiré." : "Retour au rapprochement automatique." };
}

export async function toggleProvider(_: ActionState, fd: FormData): Promise<ActionState> {
  const prov = uuid.safeParse(fd.get("provider_id"));
  if (!prov.success) return { error: "Requête invalide" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_provider_published", { p_provider: prov.data, p_published: fd.get("published") === "true" });
  if (error) return { error: humanizeError(error) };
  refresh();
  return { ok: true, message: "Partenaire mis à jour." };
}
