/**
 * Assurance maladie obligatoire (AMO, CANAM).
 * Le calcul reproduit exactement la fonction SQL public.amo_patient_share :
 *   part AMO = taux × min(prix, tarif officiel) ; reste à payer = prix − part AMO.
 * Le tarif officiel (« prix plafond ») sert de base : si la pharmacie vend plus cher,
 * l'écart reste à la charge du patient.
 */
export type AmoPharmacyStatus = "declared" | "verified";

export type AmoProduct = { amo: boolean; code: string | null; name: string | null; tariff: number | null; rate: number | null };

export type AmoResults = {
  rate: number;
  products: Record<string, AmoProduct>;
  pharmacies: Record<string, AmoPharmacyStatus>;
};

export type AmoSummary = {
  total: number; rate: number; label: string | null; reference: string | null; date: string | null; source: string | null;
  pharmacies: number; verified: number;
};

export const DEFAULT_AMO_RATE = 70;

/** Reste à payer par le patient, en FCFA (arrondi comme en base). */
export function amoPatientShare(price: number | null | undefined, tariff: number | null | undefined, rate: number | null | undefined): number | null {
  if (price === null || price === undefined || rate === null || rate === undefined || !Number.isFinite(price) || price < 0) return null;
  const base = Math.min(price, tariff ?? price);
  return Math.max(0, price - Math.round((rate / 100) * base));
}

/** Détail lisible du calcul, pour l'afficher sous le montant. */
export function amoBreakdown(price: number, tariff: number | null, rate: number) {
  const base = Math.min(price, tariff ?? price);
  const covered = Math.round((rate / 100) * base);
  return { base, covered, patient: Math.max(0, price - covered), above: tariff !== null && price > tariff ? price - tariff : 0 };
}

export const AMO_STATUS_LABEL: Record<AmoPharmacyStatus, string> = {
  verified: "Conventionnée AMO",
  declared: "Conventionnée AMO (déclarée)",
};

export function emptyAmoResults(): AmoResults {
  return { rate: DEFAULT_AMO_RATE, products: {}, pharmacies: {} };
}
