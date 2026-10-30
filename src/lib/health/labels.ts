/** Libellés du module Santé essentielle (français ; architecture prête pour le bambara via la colonne lang). */
export const HEALTH_KIND: Record<string, string> = {
  fiche: "Fiche", faq: "Questions fréquentes", idee_recue: "Idées reçues", prevention: "Prévention", actualite: "Information vérifiée",
};
export const HEALTH_RECO: Record<string, { label: string; className: string; hint: string }> = {
  recommande: { label: "Généralement recommandé", className: "border-emerald-200 bg-emerald-50 text-emerald-800", hint: "Proposé à la plupart des personnes concernées." },
  selon_risque: { label: "Selon votre situation", className: "border-amber-200 bg-amber-50 text-amber-900", hint: "Proposé selon les risques, les antécédents ou la situation." },
  sur_indication: { label: "Sur avis médical", className: "border-sky-200 bg-sky-50 text-sky-800", hint: "Réalisé seulement si un professionnel l'indique." },
};
export const HEALTH_AUDIENCE: Record<string, string> = {
  tous: "Tout le monde", enfant: "Enfants", adolescent: "Adolescents", adulte: "Adultes", senior: "Personnes âgées", femme_enceinte: "Femmes enceintes", couple: "Couples",
};
export const HEALTH_STATUS: Record<string, { label: string; className: string }> = {
  draft: { label: "Brouillon", className: "bg-muted text-muted-foreground" },
  in_review: { label: "En validation", className: "border-amber-200 bg-amber-50 text-amber-900" },
  changes_requested: { label: "Correction demandée", className: "border-orange-200 bg-orange-50 text-orange-900" },
  rejected: { label: "Rejetée", className: "border-red-200 bg-red-50 text-red-800" },
  validated: { label: "Validée, non publiée", className: "border-sky-200 bg-sky-50 text-sky-800" },
  published: { label: "Publiée", className: "border-emerald-200 bg-emerald-50 text-emerald-800" },
  unpublished: { label: "Dépubliée", className: "bg-muted text-muted-foreground" },
};
/** Ordre et titres des sections du modèle standard de fiche. */
export const HEALTH_SECTIONS: [string, string][] = [
  ["definition", "Définition"],
  ["importance", "Pourquoi c'est important"],
  ["situations", "Situations ou signes concernés"],
  ["prevention", "Prévention"],
  ["examens", "Examens ou dépistages"],
  ["deroulement", "Comment se déroule l'examen"],
  ["preparation", "Préparation"],
  ["resultats", "Comprendre les résultats"],
  ["quand_consulter", "Quand consulter"],
  ["urgence", "Signes d'urgence"],
  ["ou_au_mali", "Où s'adresser au Mali"],
];
export type HealthArticle = {
  id: string; slug: string; title: string; summary: string; kind: string; keywords: string | null; audiences: string[];
  recommendation: string | null; body: Record<string, string>; myths: { idee: string; verite: string }[]; faq: { q: string; r: string }[];
  exam_codes: string[]; specialty_codes: string[]; is_featured: boolean; status: string; author_name: string | null;
  validator_name: string | null; validator_credentials: string | null; validated_at: string | null; published_at: string | null;
  reviewed_at: string | null; review_note: string | null; created_at: string; updated_at: string; category_id: string;
};
export type HealthSource = { id: string; title: string; organization: string; url: string | null; published_on: string | null; accessed_on: string; sort_order: number };
