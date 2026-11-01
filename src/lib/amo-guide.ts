/**
 * Guide AMO / INPS (Mali uniquement). Chaque chiffre provient d'une source citée dans SOURCES.
 * Vérifié en octobre 2026 : à relire à chaque changement de réglementation.
 */
export const GUIDE_CHECKED = "octobre 2026";

/** Assurance volontaire INPS : classes de revenus trimestriels et revenu de calcul (plafond) — Cleiss, cotisations au 1er janvier 2025. */
export const VOLUNTARY_CLASSES = [
  { cls: 1, income: "moins de 150 000", base: 125_000 },
  { cls: 2, income: "150 000 à 450 000", base: 400_000 },
  { cls: 3, income: "450 000 à 750 000", base: 675_000 },
  { cls: 4, income: "750 000 à 1 500 000", base: 900_000 },
  { cls: 5, income: "plus de 1 500 000", base: 1_000_000 },
] as const;

/** Taux de l'assurance volontaire (en %), par branche. */
export const VOLUNTARY_RATES = { amo: 6.56, famille: 8, vieillesse: 9 } as const;

/** Cotisation trimestrielle estimée pour une branche, arrondie au franc. */
export function voluntaryContribution(base: number, ratePct: number) {
  return Math.round((base * ratePct) / 100);
}

export const SOURCES = [
  { label: "Cleiss — Le régime malien de sécurité sociale", url: "https://www.cleiss.fr/docs/regimes/regime_mali.html" },
  { label: "Cleiss — Les cotisations au Mali (au 1er janvier 2025)", url: "https://www.cleiss.fr/docs/cotisations/mali.html" },
  { label: "Démarches administratives du Mali — Obtenir une carte d'assuré social (INPS)", url: "https://demarchesadministratives.gouv.ml/demarches/afficher/Obtenir-une-carte-d-assure-social-INPS" },
  { label: "INPS — Immatriculation", url: "https://inps.site/procedure/" },
  { label: "INPS — Assurance volontaire", url: "https://inps.site/ova_doc/assurance-volontaire-2/" },
  { label: "Le Régime d'assurance maladie universelle (RAMU) au Mali — présentation, AIM 2019", url: "https://www.aim-mutual.org/wp-content/uploads/2019/02/22-janv_TRAORE_LE-RAMU-AU-MALI-janv-version-2-1.pdf" },
] as const;
