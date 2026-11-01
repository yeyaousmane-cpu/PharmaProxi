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
