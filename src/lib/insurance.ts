export const PROVIDER_CATEGORIES = {
  pharmacie: "Pharmacies",
  clinique: "Cliniques et cabinets médicaux",
  laboratoire: "Laboratoires",
  imagerie: "Imagerie médicale",
  dentaire: "Cabinets dentaires",
  optique: "Ophtalmologie et optique",
  reeducation: "Rééducation",
  hopital: "Hôpitaux et CSRéf",
  autre: "Autres",
} as const;
export type ProviderCategory = keyof typeof PROVIDER_CATEGORIES;
export const isProviderCategory = (v: unknown): v is ProviderCategory => typeof v === "string" && v in PROVIDER_CATEGORIES;

export const PROVIDER_SINGULAR: Record<ProviderCategory, string> = {
  pharmacie: "Pharmacie", clinique: "Clinique / cabinet", laboratoire: "Laboratoire", imagerie: "Imagerie", dentaire: "Dentaire",
  optique: "Optique", reeducation: "Rééducation", hopital: "Hôpital / CSRéf", autre: "Autre",
};

/** Statut public d'une convention (calculé en base par convention_public_status). */
export type ConventionStatus = "tiers_payant_confirme" | "remboursement" | "a_verifier";

export const CONVENTION_STATUS: Record<ConventionStatus, { label: string; hint: string; className: string }> = {
  tiers_payant_confirme: {
    label: "Tiers payant confirmé",
    hint: "Convention active et tiers payant confirmés par une source vérifiée, à la date indiquée.",
    className: "border-emerald-300 bg-emerald-50 text-emerald-900",
  },
  remboursement: {
    label: "Remboursement sur justificatifs",
    hint: "Vous avancez les frais, puis demandez le remboursement à votre assureur avec les justificatifs.",
    className: "border-sky-300 bg-sky-50 text-sky-900",
  },
  a_verifier: {
    label: "Convention à vérifier",
    hint: "Établissement cité dans une liste de l'organisme, convention pas encore confirmée. Appelez avant de vous déplacer.",
    className: "border-amber-300 bg-amber-50 text-amber-900",
  },
};

export const asConventionStatus = (s: string | null | undefined): ConventionStatus =>
  s === "tiers_payant_confirme" || s === "remboursement" ? s : "a_verifier";

/** Statuts administratifs (visibles uniquement dans l'administration). */
export const ADMIN_CONVENTION_STATUS: Record<string, string> = {
  tiers_payant_confirme: "Tiers payant confirmé",
  remboursement: "Remboursement sur justificatifs",
  en_attente: "En attente de validation",
  a_verifier: "Convention à vérifier",
  non_confirmee: "Convention non confirmée",
  expiree: "Convention expirée",
  suspendue: "Convention suspendue",
};

export const ORG_TYPE: Record<string, string> = {
  assurance_privee: "Assurance privée",
  regime_public: "Régime public",
  mutuelle: "Mutuelle",
  autre: "Autre organisme",
};

export const CONFIRM_BEFORE_VISIT = "Contactez l'établissement pour confirmer votre prise en charge avant de vous déplacer.";

export type EstablishmentInsurance = {
  insurer_name: string; insurer_slug: string; insurer_kind: string; public_status: string; tiers_payant: boolean | null;
  services_covered: string | null; conditions: string | null; documents_required: string | null;
  verified_at: string | null; source_label: string | null; source_date: string | null;
};

export type InsuranceBadge = { entity_id: string; insurer_name: string; insurer_slug: string; public_status: string };

/** Regroupe les badges par établissement. */
export function groupBadges(rows: InsuranceBadge[] | null | undefined) {
  const m = new Map<string, InsuranceBadge[]>();
  for (const r of rows ?? []) m.set(r.entity_id, [...(m.get(r.entity_id) ?? []), r]);
  return m;
}
