"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { humanizeError, type ActionState } from "@/lib/errors";
import { readCsv } from "@/lib/csv-import";

const uuid = z.uuid();
const refresh = () => { revalidatePath("/admin/infirmiers"); revalidatePath("/infirmiers"); };
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

const HEADERS: Record<string, string> = {
  "n ordre": "ordre", "no ordre": "ordre", ordre: "ordre", "numero d'ordre": "ordre", "n": "ordre",
  "n d'inscription": "inscription", "no d'inscription": "inscription", inscription: "inscription", "numero d'inscription": "inscription", "n cnoiim": "inscription", cnoiim: "inscription", matricule: "inscription",
  nom: "nom", prenom: "prenom", prenoms: "prenom", "nom et prenom": "nom_complet", "nom et prenoms": "nom_complet", "prenom et nom": "nom_complet",
  specialite: "specialite", qualification: "specialite", profession: "specialite", grade: "specialite",
  section: "section", "section de l'ordre": "section", "conseil regional": "section",
  region: "region", commune: "commune", ville: "commune", localite: "commune",
  structure: "structure", "lieu d'exercice": "structure", "structure d'exercice": "structure", etablissement: "structure", service: "structure",
  telephone: "telephone", tel: "telephone", contact: "telephone", "telephone professionnel": "telephone",
  "telephone autorise": "telephone_autorise", "telephone_autorise": "telephone_autorise", "publier telephone": "telephone_autorise",
  domicile: "domicile", "soins a domicile": "domicile",
};
const CHUNK = 1000;

/** « TRAORE Aminata » ou « Aminata TRAORE » : les mots en majuscules forment le nom ; sinon le premier mot. */
function splitFullName(full: string) {
  const parts = full.trim().split(/\s+/);
  const upper = parts.filter((w) => w.length > 1 && w === w.toUpperCase() && /\p{L}/u.test(w));
  if (upper.length && upper.length < parts.length) return { nom: upper.join(" "), prenom: parts.filter((w) => !upper.includes(w)).join(" ") };
  return { nom: parts[0] ?? "", prenom: parts.slice(1).join(" ") };
}
type ImportResult = { imported: number; duplicates: number; failed: number; errors: { row: number; error: string }[]; replaced?: number };

export async function importNurseRegister(_: ActionState, fd: FormData): Promise<ActionState> {
  const year = Number(fd.get("year"));
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return { error: "Indiquez l'année du Tableau (ex. 2026)." };
  const csv = await readCsv(fd.get("file"), HEADERS, 5 * 1024 * 1024);
  if ("error" in csv) return { error: csv.error };
  if (!csv.fields.includes("nom") && !csv.fields.includes("nom_complet"))
    return { error: "Colonne obligatoire : nom (ou « nom et prénom »). Colonnes reconnues : ordre, inscription, nom, prenom, specialite, section, region, commune, structure, telephone, telephone_autorise, domicile." };
  if (csv.rows.length === 0) return { error: "Le fichier ne contient aucune ligne." };
  if (csv.rows.length > 30000) return { error: "30 000 lignes maximum." };
  const rows = csv.rows.map((r, i) => {
    let nom = r.nom ?? "", prenom = r.prenom ?? "";
    if (!nom && r.nom_complet) ({ nom, prenom } = splitFullName(r.nom_complet));
    return { line: i + 2, ordre: r.ordre ?? "", inscription: r.inscription ?? "", nom, prenom, specialite: r.specialite ?? "", section: r.section ?? "",
      region: r.region ?? "", commune: r.commune ?? "", structure: r.structure ?? "", telephone: r.telephone ?? "", telephone_autorise: r.telephone_autorise ?? "", domicile: r.domicile ?? "" };
  });
  const replace = fd.get("replace") === "on";
  const supabase = await createClient();
  const total: ImportResult = { imported: 0, duplicates: 0, failed: 0, errors: [], replaced: 0 };
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { data, error } = await supabase.rpc("admin_import_nurse_register", { p_year: year, p_rows: rows.slice(i, i + CHUNK), p_replace: replace && i === 0 });
    if (error) { refresh(); return { error: `${humanizeError(error)} (arrêt à la ligne ${i + 2} ; ${total.imported} ligne(s) déjà importée(s))` }; }
    const r = data as ImportResult;
    total.imported += r.imported; total.duplicates += r.duplicates; total.failed += r.failed; total.errors.push(...r.errors); total.replaced = (total.replaced ?? 0) + (r.replaced ?? 0);
  }
  refresh();
  const errs = total.failed ? ` ${total.errors.slice(0, 15).map((e) => `Ligne ${e.row} : ${e.error}`).join(" · ")}` : "";
  return { ok: true, message: `Tableau ${year} : ${total.imported} infirmier(s) importé(s), ${total.duplicates} doublon(s) ignoré(s), ${total.failed} ligne(s) en erreur.${errs}` };
}

export async function updateNurse(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) return { error: "Requête invalide" };
  const p: Record<string, unknown> = {};
  if (fd.has("published")) p.is_published = fd.get("published") === "true";
  if (fd.has("_contact")) {
    p.phone = str(fd, "phone");
    p.phone_public = fd.get("phone_public") === "on";
    p.home_care = fd.get("home_care") === "on";
    p.verification = fd.get("verified") === "on" ? "verifie" : "tableau";
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_update_nurse", { p_id: id.data, p });
  if (error) return { error: humanizeError(error) };
  refresh();
  return { ok: true, message: "Fiche mise à jour." };
}

export async function saveHomeCare(_: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_save_home_care", { p: {
    id: str(fd, "id") || null, name: str(fd, "name"), address: str(fd, "address"), region_id: str(fd, "region_id") || null, areas: str(fd, "areas"),
    phone: str(fd, "phone"), whatsapp: str(fd, "whatsapp"), care_types: fd.getAll("care_types").map(String), activity: str(fd, "activity"),
    hours: str(fd, "hours"), prices: str(fd, "prices"), booking: str(fd, "booking"), verification: fd.get("verified") === "on" ? "verifie" : "non_verifie",
    authorization_ref: str(fd, "authorization_ref"), source: str(fd, "source"), is_published: fd.get("published") === "on",
  } });
  if (error) return { error: humanizeError(error) };
  refresh();
  return { ok: true, message: "Structure enregistrée." };
}

export async function deleteHomeCare(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) return { error: "Requête invalide" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_delete_home_care", { p_id: id.data });
  if (error) return { error: humanizeError(error) };
  refresh();
  return { ok: true, message: "Structure supprimée." };
}
