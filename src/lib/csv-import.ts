import "server-only";
import Papa from "papaparse";

/** Normalise un en-tête : minuscules, sans accents ni ponctuation finale. */
export const normHeader = (h: string) =>
  h.replace(/^﻿/, "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[°º]/g, "").replace(/\.$/, "").replace(/\s+/g, " ");

export type CsvResult = { rows: Record<string, string>[]; fields: string[] } | { error: string };

/**
 * Lit un fichier CSV déposé : UTF-8 ou Windows-1252 (Excel), séparateur « ; » ou « , »
 * détecté automatiquement, en-têtes ramenés à des noms canoniques via `aliases`.
 */
export async function readCsv(file: FormDataEntryValue | null, aliases: Record<string, string>, maxBytes = 3 * 1024 * 1024): Promise<CsvResult> {
  if (!(file instanceof File) || file.size === 0) return { error: "Choisissez un fichier CSV." };
  if (file.size > maxBytes) return { error: `${Math.round(maxBytes / 1024 / 1024)} Mo maximum.` };
  if (/\.xlsx?$/i.test(file.name)) {
    return { error: "Ce fichier est au format Excel. Dans Excel : Fichier › Enregistrer sous › « CSV UTF-8 (délimité par des virgules) », puis importez le fichier .csv." };
  }
  const buf = new Uint8Array(await file.arrayBuffer());
  let text = new TextDecoder("utf-8").decode(buf);
  if (text.includes("�")) text = new TextDecoder("windows-1252").decode(buf);
  const parsed = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ""), {
    header: true, skipEmptyLines: "greedy", transformHeader: (h) => aliases[normHeader(h)] ?? normHeader(h),
  });
  return { rows: parsed.data, fields: parsed.meta.fields ?? [] };
}
