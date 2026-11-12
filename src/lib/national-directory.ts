/** Annuaire national des établissements de santé : libellés, statuts de fiabilité et filtres. */
export const DIRECTORY_KINDS: Record<string, string> = {
  hopital: "Hôpital / CHU", csref: "CSRéf (centre de santé de référence)", cscom: "CSCom (centre de santé communautaire)", clinique: "Clinique privée",
  polyclinique: "Polyclinique", cabinet: "Cabinet médical", cabinet_dentaire: "Cabinet dentaire", laboratoire: "Laboratoire d'analyses",
  imagerie: "Imagerie médicale", centre_specialise: "Centre spécialisé", centre_sante: "Centre de santé",
};

/** Services filtrables : uniquement ceux qu'une source a confirmés (codes de facility_offers). */
export const DIRECTORY_SERVICES: Record<string, string> = {
  maternite: "Maternité / accouchement", pediatrie: "Pédiatrie", planification_familiale: "Planification familiale", laboratoire: "Laboratoire d'analyses",
  imagerie: "Imagerie (radio, échographie, scanner)", urgences: "Urgences", urgences_pediatriques: "Urgences pédiatriques", pharmacie: "Pharmacie",
  chirurgie_generale: "Chirurgie", gynecologie: "Gynécologie", cardiologie: "Cardiologie", banque_de_sang: "Banque de sang",
};

/** D'où viennent les informations de la fiche (affiché sur chaque fiche). */
export const SOURCE_LEVEL: Record<string, { label: string; className: string; help: string }> = {
  officielle: { label: "Source officielle", className: "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200", help: "L'établissement figure dans une liste publiée par une institution (ministère de la Santé, CANAM, DPM)." },
  recoupee: { label: "Recoupé par plusieurs sources", className: "bg-emerald-100 text-emerald-950 ring-1 ring-emerald-300", help: "L'établissement figure dans au moins deux sources indépendantes." },
  etablissement: { label: "Confirmé par l'établissement", className: "bg-emerald-600 text-white", help: "Les informations ont été confirmées directement auprès de l'établissement." },
  secondaire: { label: "Source secondaire", className: "bg-amber-50 text-amber-950 ring-1 ring-amber-200", help: "Information trouvée dans un annuaire ou une publication non officielle : à confirmer." },
  editeur: { label: "Transmis à SantéProxi", className: "bg-amber-50 text-amber-950 ring-1 ring-amber-200", help: "Information transmise à SantéProxi, pas encore recoupée avec une source officielle." },
};

/** Affichage simplifié demandé : « Vérifié officiellement », « Informations recoupées », « Informations à confirmer ». */
export function trustLabel(reliability: string, level: string): { label: string; className: string } {
  if (reliability === "verifie" || level === "etablissement") return { label: "Vérifié", className: "bg-emerald-600 text-white" };
  if (level === "recoupee") return { label: "Informations recoupées", className: "bg-emerald-100 text-emerald-950" };
  if (level === "officielle") return { label: "Listé par une source officielle", className: "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200" };
  return { label: "Informations à confirmer", className: "bg-amber-100 text-amber-950" };
}

export const OPERATING: Record<string, string> = {
  actif_confirme: "Activité confirmée par SantéProxi", signale_actif: "Listé comme actif par une source officielle (date de la source à prendre en compte)",
  non_confirme: "Activité non confirmée", ferme: "Fermé ou activité arrêtée",
};
export const CONTACTS: Record<string, { label: string; className: string }> = {
  source_officielle: { label: "Numéro publié par une source officielle — à confirmer auprès de l'établissement", className: "text-amber-900" },
  confirme_etablissement: { label: "Coordonnées confirmées par l'établissement", className: "text-emerald-800" },
  a_confirmer: { label: "Coordonnées à confirmer", className: "text-amber-900" },
};
export const OFFER_TYPES: Record<string, string> = { service: "Services", specialite: "Spécialités", examen: "Examens", equipement: "Équipements" };
export const LINK_RELATIONS: Record<string, string> = {
  laboratoire_integre: "Laboratoire intégré", imagerie_integree: "Imagerie intégrée", pharmacie_integree: "Pharmacie intégrée",
  laboratoire_partenaire: "Laboratoire partenaire", imagerie_partenaire: "Centre d'imagerie partenaire", reference_vers: "Oriente les patients vers",
};
export const CORRECTION_KINDS: Record<string, string> = {
  ferme: "L'établissement est fermé", telephone: "Numéro de téléphone faux ou manquant", adresse: "Adresse fausse ou imprécise", position: "Position sur la carte fausse",
  services: "Services ou spécialités inexacts", horaires: "Horaires", nom: "Nom de l'établissement", autre: "Autre",
};

export type DirectoryRow = { id: string; name: string; kind: string; category_label: string | null; ownership: string | null; region: string | null; circle: string | null; commune: string | null;
  locality: string | null; quarter: string | null; address: string | null; phone: string | null; phone2: string | null; whatsapp: string | null; email: string | null; website: string | null;
  latitude: number | null; longitude: number | null; emergency_24h: boolean; source_level: string; operating_status: string; contacts_status: string; reliability: string;
  verified_at: string | null; offers: { code: string; label: string; type: string }[]; score: number; total: number };
export type Place = { level: "region" | "cercle" | "commune"; id: string; parent_id: string | null; name: string; n: number };

export const waUrl = (phone: string) => `https://wa.me/${phone.replace(/\D/g, "")}`;
