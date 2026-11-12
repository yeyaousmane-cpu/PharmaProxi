/** Catalogue national des médicaments (nomenclature DPM 2024 + LNME 2024). */

export type RegulatoryClass = "libre" | "prescription" | "controle" | "hospitalier" | "programme" | "dispositif";

export const REGULATION: Record<RegulatoryClass, { label: string; hint: string; className: string }> = {
  libre: {
    label: "Sans ordonnance",
    hint: "Délivrable sans ordonnance. Demandez conseil au pharmacien.",
    className: "bg-emerald-50 text-emerald-800 border-emerald-200",
  },
  prescription: {
    label: "Sur ordonnance",
    hint: "Délivré uniquement sur présentation d'une ordonnance. Pas d'automédication.",
    className: "bg-amber-50 text-amber-900 border-amber-300",
  },
  controle: {
    label: "Ordonnance sécurisée",
    hint: "Stupéfiant ou psychotrope : dispensation contrôlée, réservation en ligne impossible.",
    className: "bg-red-50 text-red-800 border-red-300",
  },
  hospitalier: {
    label: "Usage hospitalier",
    hint: "Réservé aux établissements de soins : ne se réserve pas en ligne.",
    className: "bg-violet-50 text-violet-800 border-violet-300",
  },
  programme: {
    label: "Programme national",
    hint: "Distribué dans le cadre d'un programme de santé publique (souvent gratuit en centre de santé).",
    className: "bg-sky-50 text-sky-900 border-sky-300",
  },
  dispositif: {
    label: "Dispositif / diagnostic",
    hint: "Produit de diagnostic ou dispositif médical.",
    className: "bg-slate-50 text-slate-700 border-slate-300",
  },
};

export function regulation(r: string | null | undefined) {
  return REGULATION[(r ?? "prescription") as RegulatoryClass] ?? REGULATION.prescription;
}

/** Réservation en ligne impossible pour ces classes (garde-fou également appliqué par create_order). */
export function canBookOnline(r: string | null | undefined) {
  return r !== "controle" && r !== "hospitalier";
}

export const TIER_LABEL: Record<string, string> = {
  premiere_necessite: "Première nécessité",
  complementaire: "Complémentaire",
};

export const AMM_LABEL: Record<string, string> = {
  verifiee: "Spécialités inscrites à la nomenclature DPM 2024",
  a_verifier: "Spécialités commerciales non encore vérifiées",
  absente: "Aucune spécialité inscrite connue",
};

export type CatalogRow = {
  catalog_id: string; generic_name: string; brand_name: string; dosage: string | null; form: string | null;
  therapeutic_family: string | null; family_label: string | null; therapeutic_subfamily: string | null;
  regulatory_class: RegulatoryClass; priority_tier: string | null; lnme_2024: boolean; amm_status: string;
  brands: string | null; common_names: string | null; pharmacies_declaring: number; total_count: number;
};

export const FORMS = [
  "Comprimé", "Gélule", "Sirop", "Suspension", "Solution buvable", "Poudre", "Injectable", "Perfusion",
  "Suppositoire", "Crème", "Pommade", "Collyre", "Ovule", "Inhalateur", "Sachet",
] as const;
