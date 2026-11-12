export const MODALITY: Record<string, string> = {
  radiographie: "Radiographie", echographie: "Échographie", scanner: "Scanner (TDM)", irm: "IRM", mammographie: "Mammographie",
  panoramique_dentaire: "Panoramique dentaire", doppler: "Doppler", osteodensitometrie: "Ostéodensitométrie", autre: "Autre examen",
};
export const SHARE_DAYS = [1, 3, 7, 14, 30] as const;
export const mimeLabel = (m: string) => (m === "application/dicom" ? "DICOM" : m === "application/pdf" ? "PDF" : "Image");
