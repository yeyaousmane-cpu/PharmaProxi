import Papa from "papaparse";

/** Colonnes attendues pour l'import du catalogue / stock d'une pharmacie. */
export const CSV_COLUMNS = [
  "nom_commercial", "principe_actif", "nom_generique", "dosage", "forme", "conditionnement", "fabricant", "quantite", "prix_fcfa", "disponible",
] as const;
export const CSV_REQUIRED = ["nom_commercial", "quantite"] as const;

export type CsvRow = {
  brand_name: string; active_ingredient?: string; generic_name?: string; dosage?: string; form?: string;
  packaging?: string; manufacturer?: string; quantity: number; price_xof?: number | ""; is_available: boolean;
};

export type CsvParseResult = { rows: CsvRow[]; errors: { row: number; error: string }[]; missingColumns: string[] };

const truthy = new Set(["", "1", "oui", "o", "yes", "y", "true", "vrai", "x"]);
const falsy = new Set(["0", "non", "n", "no", "false", "faux"]);

function clean(v: unknown) {
  return typeof v === "string" ? v.trim() : "";
}

/** Analyse et valide un CSV (séparateur « ; » ou « , » détecté automatiquement). */
export function parseInventoryCsv(text: string, maxRows = 2000): CsvParseResult {
  const parsed = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ""), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "_"),
  });
  const headers = parsed.meta.fields ?? [];
  const missingColumns = CSV_REQUIRED.filter((c) => !headers.includes(c));
  const rows: CsvRow[] = [];
  const errors: { row: number; error: string }[] = [];
  if (missingColumns.length) return { rows, errors, missingColumns };
  if (parsed.data.length > maxRows) {
    errors.push({ row: 0, error: `Fichier trop volumineux : ${maxRows} lignes maximum` });
    return { rows, errors, missingColumns };
  }

  parsed.data.forEach((r, i) => {
    const line = i + 2; // ligne 1 = en-têtes
    const brand = clean(r.nom_commercial);
    const qtyRaw = clean(r.quantite).replace(/\s/g, "");
    const priceRaw = clean(r.prix_fcfa).replace(/[\s.]/g, "").replace(/fcfa|xof|f$/i, "");
    const dispo = clean(r.disponible).toLowerCase();
    const problems: string[] = [];
    if (brand.length < 2 || brand.length > 150) problems.push("nom_commercial invalide");
    if (!/^\d+$/.test(qtyRaw)) problems.push("quantite doit être un entier positif");
    if (priceRaw && !/^\d+$/.test(priceRaw)) problems.push("prix_fcfa doit être un entier");
    if (dispo && !truthy.has(dispo) && !falsy.has(dispo)) problems.push("disponible : oui/non");
    if (problems.length) {
      errors.push({ row: line, error: problems.join(", ") });
      return;
    }
    rows.push({
      brand_name: brand,
      active_ingredient: clean(r.principe_actif) || undefined,
      generic_name: clean(r.nom_generique) || undefined,
      dosage: clean(r.dosage) || undefined,
      form: clean(r.forme) || undefined,
      packaging: clean(r.conditionnement) || undefined,
      manufacturer: clean(r.fabricant) || undefined,
      quantity: Number(qtyRaw),
      price_xof: priceRaw ? Number(priceRaw) : "",
      is_available: !falsy.has(dispo),
    });
  });
  return { rows, errors, missingColumns };
}

export function toCsv(rows: Record<string, unknown>[], columns: string[]) {
  return "﻿" + Papa.unparse({ fields: columns, data: rows.map((r) => columns.map((c) => r[c] ?? "")) }, { delimiter: ";" });
}
