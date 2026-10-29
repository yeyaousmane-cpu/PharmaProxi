"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { humanizeError, type ActionState } from "@/lib/errors";
import { readCsv } from "@/lib/csv-import";
import { setFlash } from "@/lib/flash";

const uuid = z.uuid();
const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
type ImportResult = { imported: number; failed: number; errors: { row: number; error: string }[] };
function summarize(res: ImportResult, noun: string) {
  const base = `${res.imported} ${noun} importé(s), ${res.failed} ligne(s) en erreur.`;
  if (!res.failed) return base;
  return `${base} ${res.errors.slice(0, 15).map((e) => `Ligne ${e.row} : ${e.error}`).join(" · ")}${res.failed > 15 ? " · …" : ""}`;
}
/** « 2026-11-02T20:00 » (heure de Bamako = UTC) → ISO. */
function localToIso(v: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return null;
  const d = new Date(`${v}:00Z`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function refreshDuty() {
  revalidatePath("/garde");
  revalidatePath("/admin/services");
  revalidatePath("/pharmacien");
}

// ---------------------------------------------------------------------------
// Pharmacies de garde
// ---------------------------------------------------------------------------
const DUTY_HEADERS: Record<string, string> = {
  pharmacie: "pharmacie", nom: "pharmacie", officine: "pharmacie", region: "region", commune: "commune",
  debut: "debut", "date debut": "debut", date: "debut", du: "debut", fin: "fin", "date fin": "fin", au: "fin", source: "source",
};

export async function importDuty(_: ActionState, fd: FormData): Promise<ActionState> {
  const csv = await readCsv(fd.get("file"), DUTY_HEADERS);
  if ("error" in csv) return { error: csv.error };
  for (const f of ["pharmacie", "region", "debut"]) {
    if (!csv.fields.includes(f)) return { error: "Colonnes obligatoires : pharmacie, region, debut. Facultatives : commune, fin, source." };
  }
  if (csv.rows.length === 0) return { error: "Le fichier ne contient aucune ligne." };
  const source = s(fd, "source");
  const rows = csv.rows.map((r, i) => ({
    line: i + 2, pharmacie: r.pharmacie ?? "", region: r.region ?? "", commune: r.commune ?? "", debut: r.debut ?? "", fin: r.fin ?? "",
    source: (r.source ?? "").trim() || source,
  }));
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_import_duty", { p_rows: rows });
  if (error) return { error: humanizeError(error) };
  refreshDuty();
  return { ok: true, message: summarize(data as ImportResult, "garde(s)") };
}

export async function addDuty(_: ActionState, fd: FormData): Promise<ActionState> {
  const target = s(fd, "target"); // "p:<uuid>" ou "l:<uuid>"
  const m = /^(p|l):([0-9a-f-]{36})$/i.exec(target);
  if (!m) return { error: "Choisissez une pharmacie." };
  const start = localToIso(s(fd, "start"));
  const end = localToIso(s(fd, "end"));
  if (!start || !end) return { error: "Indiquez le début et la fin de la garde." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_add_duty", {
    p_pharmacy: m[1] === "p" ? m[2] : null, p_listing: m[1] === "l" ? m[2] : null, p_start: start, p_end: end, p_source: s(fd, "source") || null,
  });
  if (error) return { error: humanizeError(error) };
  refreshDuty();
  await setFlash("Garde enregistrée.");
  return { ok: true, message: "Garde enregistrée." };
}

export async function declareDuty(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = uuid.safeParse(fd.get("pharmacy_id"));
  const start = localToIso(s(fd, "start"));
  const end = localToIso(s(fd, "end"));
  if (!id.success) return { error: "Requête invalide" };
  if (!start || !end) return { error: "Indiquez le début et la fin de la garde." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("pharmacy_declare_duty", { p_pharmacy: id.data, p_start: start, p_end: end });
  if (error) return { error: humanizeError(error) };
  refreshDuty();
  revalidatePath(`/pharmacies/${id.data}`);
  await setFlash("Garde déclarée : elle apparaît sur la page « Pharmacies de garde ».");
  return { ok: true, message: "Garde déclarée." };
}

export async function deleteDuty(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) return { error: "Requête invalide" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_duty", { p_id: id.data });
  if (error) return { error: humanizeError(error) };
  refreshDuty();
  await setFlash("Garde supprimée.");
  return { ok: true, message: "Garde supprimée." };
}

// ---------------------------------------------------------------------------
// Examens proposés par les établissements
// ---------------------------------------------------------------------------
const EXAM_HEADERS: Record<string, string> = {
  etablissement: "etablissement", laboratoire: "etablissement", nom: "etablissement", region: "region",
  examen: "examen", "code examen": "examen", prix: "prix", tarif: "prix", "prix (fcfa)": "prix", "tarif (fcfa)": "prix",
  "note prix": "note_prix", note_prix: "note_prix", delai: "delai", "delai de rendu": "delai", source: "source",
  "verifie le": "verifie_le", verifie_le: "verifie_le", "date de verification": "verifie_le",
};

export async function importExams(_: ActionState, fd: FormData): Promise<ActionState> {
  const csv = await readCsv(fd.get("file"), EXAM_HEADERS);
  if ("error" in csv) return { error: csv.error };
  if (!csv.fields.includes("etablissement") || !csv.fields.includes("examen")) {
    return { error: "Colonnes obligatoires : etablissement, examen. Facultatives : region, prix, note_prix, delai, source, verifie_le (AAAA-MM-JJ)." };
  }
  if (csv.rows.length === 0) return { error: "Le fichier ne contient aucune ligne." };
  const source = s(fd, "source");
  const rows = csv.rows.map((r, i) => ({
    line: i + 2, etablissement: r.etablissement ?? "", region: r.region ?? "", examen: r.examen ?? "", prix: r.prix ?? "",
    note_prix: r.note_prix ?? "", delai: r.delai ?? "", source: (r.source ?? "").trim() || source,
    verifie_le: /^\d{4}-\d{2}-\d{2}$/.test((r.verifie_le ?? "").trim()) ? r.verifie_le.trim() : "",
  }));
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_import_facility_exams", { p_rows: rows });
  if (error) return { error: humanizeError(error) };
  revalidatePath("/laboratoires");
  revalidatePath("/admin/services");
  return { ok: true, message: summarize(data as ImportResult, "examen(s) proposé(s)") };
}

export async function setFacilityEmergency(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) return { error: "Requête invalide" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_facility_emergency", { p_id: id.data, p_on: fd.get("on") === "true" });
  if (error) return { error: humanizeError(error) };
  revalidatePath("/urgences");
  revalidatePath("/admin/annuaire");
  await setFlash("Établissement mis à jour.");
  return { ok: true, message: "Établissement mis à jour." };
}

// ---------------------------------------------------------------------------
// Alertes de disponibilité
// ---------------------------------------------------------------------------
export async function createAlert(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = uuid.safeParse(fd.get("catalog_id"));
  if (!id.success) return { error: "Requête invalide" };
  const region = uuid.safeParse(fd.get("region"));
  const commune = uuid.safeParse(fd.get("commune"));
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_medicine_alert", {
    p_catalog: id.data, p_region: region.success ? region.data : null, p_commune: commune.success ? commune.data : null,
  });
  if (error) return { error: humanizeError(error) };
  revalidatePath("/compte/alertes");
  const msg = "Alerte créée : vous serez prévenu(e) dès qu'une pharmacie vérifiée déclarera ce produit disponible (30 jours).";
  await setFlash(msg);
  return { ok: true, message: msg };
}

export async function deleteAlert(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) return { error: "Requête invalide" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_medicine_alert", { p_id: id.data });
  if (error) return { error: humanizeError(error) };
  revalidatePath("/compte/alertes");
  await setFlash("Alerte supprimée.");
  return { ok: true, message: "Alerte supprimée." };
}
