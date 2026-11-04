"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { humanizeError, type ActionState } from "@/lib/errors";
import { readCsv } from "@/lib/csv-import";

const uuid = z.uuid();
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const refresh = () => { revalidatePath("/admin/amo"); revalidatePath("/amo"); revalidatePath("/recherche"); };

const HEADERS: Record<string, string> = {
  code: "code", codes: "code", "code amo": "code", "code canam": "code",
  designation: "designation", libelle: "designation", "nom commercial": "nom", nom: "nom", medicament: "designation", produit: "designation",
  dci: "dci", "denomination commune": "dci", "principe actif": "dci",
  dosage: "dosage", forme: "forme", presentation: "presentation", conditionnement: "presentation",
  categorie: "categorie", type: "categorie",
  tarif: "tarif", "prix plafond": "tarif", prix_plafond: "tarif", "prix de reference": "tarif", "tarif de reference": "tarif", "tarif de responsabilite": "tarif", prix: "tarif",
  taux: "taux", "taux de prise en charge": "taux",
};
const CHUNK = 1500;
type ImportResult = { imported: number; duplicates: number; failed: number; errors: { row: number; error: string }[]; replaced?: number };

export async function importAmoList(_: ActionState, fd: FormData): Promise<ActionState> {
  const version = str(fd, "version");
  if (version.length < 3) return { error: "Indiquez la version de la liste (ex. « CANAM 2022 »)." };
  const csv = await readCsv(fd.get("file"), HEADERS, 8 * 1024 * 1024);
  if ("error" in csv) return { error: csv.error };
  if (!csv.fields.includes("nom") && !csv.fields.includes("designation"))
    return { error: "Colonne obligatoire : designation (ou nom). Colonnes reconnues : code, designation, dci, dosage, forme, presentation, categorie, tarif (ou prix plafond), taux." };
  if (csv.rows.length === 0) return { error: "Le fichier ne contient aucune ligne." };
  if (csv.rows.length > 20000) return { error: "20 000 lignes maximum." };
  const rows = csv.rows.map((r, i) => ({
    line: i + 2, code: r.code ?? "", nom: r.nom || r.designation || "", dci: r.dci ?? "", dosage: r.dosage ?? "", forme: r.forme ?? "",
    presentation: r.presentation ?? "", categorie: r.categorie ?? "", tarif: r.tarif ?? "", taux: r.taux ?? "",
  }));
  const replace = fd.get("replace") === "on";
  const supabase = await createClient();
  const total: ImportResult = { imported: 0, duplicates: 0, failed: 0, errors: [], replaced: 0 };
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { data, error } = await supabase.rpc("admin_import_amo", { p_version: version, p_rows: rows.slice(i, i + CHUNK), p_replace: replace && i === 0 });
    if (error) { refresh(); return { error: `${humanizeError(error)} (arrêt à la ligne ${i + 2} ; ${total.imported} ligne(s) déjà importée(s))` }; }
    const r = data as ImportResult;
    total.imported += r.imported; total.duplicates += r.duplicates; total.failed += r.failed; total.errors.push(...r.errors); total.replaced = (total.replaced ?? 0) + (r.replaced ?? 0);
  }
  const { data: fin, error: e2 } = await supabase.rpc("admin_amo_finish_import");
  refresh();
  if (e2) return { error: humanizeError(e2) };
  const matched = (fin as { matched: number } | null)?.matched ?? 0;
  const errs = total.failed ? ` ${total.errors.slice(0, 15).map((e) => `Ligne ${e.row} : ${e.error}`).join(" · ")}` : "";
  return { ok: true, message: `${version} : ${total.imported} produit(s) importé(s), ${total.duplicates} doublon(s) ignoré(s), ${total.failed} ligne(s) en erreur${total.replaced ? `, ${total.replaced} ancienne(s) ligne(s) remplacée(s)` : ""}. ${matched} produit(s) du catalogue relié(s) automatiquement.${errs}` };
}

export async function saveAmoConfig(_: ActionState, fd: FormData): Promise<ActionState> {
  const rate = Number(str(fd, "rate_medicines").replace(",", "."));
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) return { error: "Le taux doit être compris entre 0 et 100." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_amo_config", {
    p: { rate_medicines: rate, list_label: str(fd, "list_label"), list_reference: str(fd, "list_reference"), list_date: str(fd, "list_date"), source_url: str(fd, "source_url") },
  });
  if (error) return { error: humanizeError(error) };
  refresh();
  return { ok: true, message: "Paramètres AMO enregistrés." };
}

export async function rematchAmo(): Promise<ActionState> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_amo_finish_import");
  if (error) return { error: humanizeError(error) };
  refresh();
  return { ok: true, message: `${(data as { matched: number }).matched} produit(s) du catalogue relié(s) automatiquement.` };
}

export async function linkAmo(_: ActionState, fd: FormData): Promise<ActionState> {
  const catalog = uuid.safeParse(fd.get("catalog_id"));
  if (!catalog.success) return { error: "Requête invalide" };
  const mode = str(fd, "mode");
  const amoId = str(fd, "amo_id");
  const supabase = await createClient();
  let p_amo: string | null = null;
  if (mode === "link") {
    // Accepte l'identifiant interne ou le code officiel (ex. PTM1493)
    if (uuid.safeParse(amoId).success) p_amo = amoId;
    else if (amoId) {
      const { data } = await supabase.from("amo_medicines").select("id").ilike("code", amoId).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (!data) return { error: `Code AMO « ${amoId} » introuvable dans la liste importée.` };
      p_amo = data.id;
    } else return { error: "Indiquez le code AMO (ex. PTM1493)." };
  }
  const { error } = await supabase.rpc("admin_amo_link", { p_catalog: catalog.data, p_amo, p_none: mode === "none" });
  if (error) return { error: humanizeError(error) };
  refresh();
  return { ok: true, message: mode === "link" ? "Produit relié à la liste AMO." : mode === "none" ? "Produit marqué « non pris en charge »." : "Retour au rapprochement automatique." };
}

export async function setPharmacyAmo(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = uuid.safeParse(fd.get("pharmacy_id"));
  const status = str(fd, "status");
  if (!id.success || !["verified", "rejected", "declared", "none"].includes(status)) return { error: "Requête invalide" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_pharmacy_amo", { p_pharmacy: id.data, p_status: status, p_note: str(fd, "note") || null });
  if (error) return { error: humanizeError(error) };
  refresh();
  revalidatePath(`/pharmacies/${id.data}`);
  return { ok: true, message: status === "verified" ? "Convention vérifiée." : status === "rejected" ? "Déclaration refusée." : "Statut mis à jour." };
}

export async function declarePharmacyAmo(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = uuid.safeParse(fd.get("pharmacy_id"));
  if (!id.success) return { error: "Requête invalide" };
  const on = fd.get("conventioned") === "on";
  if (on && fd.get("certify") !== "on") return { error: "Cochez la case pour certifier que la pharmacie a signé la convention avec la CANAM." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("pharmacy_declare_amo", { p_pharmacy: id.data, p_conventioned: on });
  if (error) return { error: humanizeError(error) };
  revalidatePath("/pharmacien/ma-pharmacie");
  revalidatePath(`/pharmacies/${id.data}`);
  revalidatePath("/admin/amo");
  return { ok: true, message: on ? "Déclaration enregistrée : l'équipe SantéProxi la vérifiera." : "Convention AMO retirée de votre fiche." };
}
