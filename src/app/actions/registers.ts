"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { humanizeError, type ActionState } from "@/lib/errors";
import { readCsv } from "@/lib/csv-import";
import { setFlash } from "@/lib/flash";

const uuid = z.uuid();

function refresh() {
  revalidatePath("/admin/annuaire");
  revalidatePath("/medecins");
  revalidatePath("/cliniques");
}

type ImportResult = { imported: number; duplicates: number; failed: number; errors: { row: number; error: string }[]; replaced?: number };
function summarize(res: ImportResult, noun: string) {
  const s = `${res.imported} ${noun} importé(s), ${res.duplicates} doublon(s) ignoré(s), ${res.failed} ligne(s) en erreur.`;
  if (!res.failed) return s;
  return `${s} ${res.errors.slice(0, 15).map((e) => `Ligne ${e.row} : ${e.error}`).join(" · ")}${res.failed > 15 ? " · …" : ""}`;
}

// ---------------------------------------------------------------------------
// Tableau de l'Ordre des médecins
// ---------------------------------------------------------------------------
const REGISTER_HEADERS: Record<string, string> = {
  "n ordre": "ordre", "no ordre": "ordre", ordre: "ordre", "numero d'ordre": "ordre",
  "n d'inscription": "inscription", "no d'inscription": "inscription", inscription: "inscription", "numero d'inscription": "inscription",
  nom: "nom", prenom: "prenom", prenoms: "prenom",
  specialite: "specialite", "specialite(s)": "specialite",
  structure: "structure", "lieu d'exercice": "structure", etablissement: "structure",
  crom: "crom", "conseil regional": "crom", region: "crom",
};
const CHUNK = 1000;

export async function importDoctorRegister(_: ActionState, fd: FormData): Promise<ActionState> {
  const year = Number(fd.get("year"));
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return { error: "Indiquez l'année du Tableau (ex. 2025)." };
  const csv = await readCsv(fd.get("file"), REGISTER_HEADERS, 5 * 1024 * 1024);
  if ("error" in csv) return { error: csv.error };
  if (!csv.fields.includes("nom")) return { error: "Colonne obligatoire : nom. Colonnes reconnues : ordre, inscription, nom, prenom, specialite, structure, crom." };
  if (csv.rows.length === 0) return { error: "Le fichier ne contient aucune ligne." };
  if (csv.rows.length > 20000) return { error: "20 000 lignes maximum." };
  const replace = fd.get("replace") === "on";
  const rows = csv.rows.map((r, i) => ({
    line: i + 2, ordre: r.ordre ?? "", inscription: r.inscription ?? "", nom: r.nom ?? "", prenom: r.prenom ?? "",
    specialite: r.specialite ?? "", structure: r.structure ?? "", crom: r.crom ?? "",
  }));
  const supabase = await createClient();
  const total: ImportResult = { imported: 0, duplicates: 0, failed: 0, errors: [], replaced: 0 };
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { data, error } = await supabase.rpc("admin_import_doctor_register", { p_year: year, p_rows: rows.slice(i, i + CHUNK), p_replace: replace && i === 0 });
    if (error) {
      refresh();
      return { error: `${humanizeError(error)} (arrêt à la ligne ${i + 2} ; ${total.imported} ligne(s) déjà importée(s))` };
    }
    const r = data as ImportResult;
    total.imported += r.imported; total.duplicates += r.duplicates; total.failed += r.failed; total.errors.push(...r.errors);
    total.replaced = (total.replaced ?? 0) + (r.replaced ?? 0);
  }
  refresh();
  const replaced = total.replaced ? ` ${total.replaced} entrée(s) de l'édition précédente ${year} remplacée(s).` : "";
  return { ok: true, message: `Tableau ${year} : ${summarize(total, "médecin(s)")}${replaced}` };
}

export async function setRegisterPublished(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) return { error: "Requête invalide" };
  const published = fd.get("published") === "true";
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_register_published", { p_id: id.data, p_published: published });
  if (error) return { error: humanizeError(error) };
  refresh();
  const msg = published ? "Entrée de nouveau visible." : "Entrée masquée du public.";
  await setFlash(msg);
  return { ok: true, message: msg };
}

// ---------------------------------------------------------------------------
// Établissements de santé non vérifiés
// ---------------------------------------------------------------------------
const FACILITY_HEADERS: Record<string, string> = {
  nom: "nom", etablissement: "nom", "nom de l'etablissement": "nom", type: "type", categorie: "categorie", category: "categorie",
  region: "region", ville: "ville", localite: "ville", adresse: "adresse", telephone: "telephone", tel: "telephone",
  telephone2: "telephone2", "telephone 2": "telephone2", latitude: "latitude", longitude: "longitude", source: "source",
};
/** Type déduit de la catégorie ou du nom quand la colonne « type » est vide. */
function inferKind(name: string, cat: string) {
  const t = `${cat} ${name}`.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (/dentaire|odonto/.test(t)) return "cabinet_dentaire";
  if (/reference|csref/.test(t)) return "csref";
  if (/hopital|hospitalier|chu\b/.test(t)) return "hopital";
  if (/radiolog|imagerie|scanner/.test(t)) return "imagerie";
  if (/laboratoire|analyses/.test(t)) return "laboratoire";
  if (/clinique|polyclinique/.test(t)) return "clinique";
  if (/cabinet/.test(t)) return "cabinet";
  return "centre_sante";
}

export async function importFacilities(_: ActionState, fd: FormData): Promise<ActionState> {
  const csv = await readCsv(fd.get("file"), FACILITY_HEADERS);
  if ("error" in csv) return { error: csv.error };
  if (!csv.fields.includes("nom")) return { error: "Colonne obligatoire : nom. Facultatives : type, categorie, region, ville, adresse, telephone, telephone2, latitude, longitude, source." };
  if (csv.rows.length === 0) return { error: "Le fichier ne contient aucune ligne." };
  const source = String(fd.get("source") ?? "").trim();
  const rows = csv.rows.map((r, i) => ({
    line: i + 2, nom: r.nom ?? "", type: (r.type ?? "").trim() || inferKind(r.nom ?? "", r.categorie ?? ""), categorie: r.categorie ?? "",
    region: r.region ?? "", ville: r.ville ?? "", adresse: r.adresse ?? "", telephone: r.telephone ?? "", telephone2: r.telephone2 ?? "",
    latitude: r.latitude ?? "", longitude: r.longitude ?? "", source: (r.source ?? "").trim() || source,
  }));
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_import_facility_listings", { p_rows: rows });
  if (error) return { error: humanizeError(error) };
  refresh();
  return { ok: true, message: summarize(data as ImportResult, "établissement(s)") };
}

export async function setFacilityPublished(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) return { error: "Requête invalide" };
  const published = fd.get("published") === "true";
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_facility_published", { p_id: id.data, p_published: published });
  if (error) return { error: humanizeError(error) };
  refresh();
  const msg = published ? "Établissement publié." : "Établissement masqué du public.";
  await setFlash(msg);
  return { ok: true, message: msg };
}

export async function deleteFacility(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) return { error: "Requête invalide" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_delete_facility", { p_id: id.data });
  if (error) return { error: humanizeError(error) };
  refresh();
  await setFlash("Établissement supprimé.");
  return { ok: true, message: "Établissement supprimé." };
}
