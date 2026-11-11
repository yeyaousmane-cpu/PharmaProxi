/** Passeport santé : rubriques partageables et libellés de l'historique des accès. */
export const SHARE_SECTIONS: Record<string, string> = {
  identite: "Identité (nom, année de naissance, sexe)", groupe_sanguin: "Groupe sanguin", allergies: "Allergies", maladies: "Maladies déclarées",
  traitements: "Traitements en cours", vaccins: "Vaccins", contact_urgence: "Personne à prévenir", medecin_traitant: "Médecin traitant", mesures: "Dernières mesures (tension, glycémie)",
};
export const SHARE_DURATIONS: [number, string][] = [[1, "1 heure"], [24, "24 heures"], [72, "3 jours"], [168, "7 jours"], [720, "30 jours"]];

export const ACCESS_ACTIONS: Record<string, string> = {
  ouverture_dossier: "Dossier déverrouillé", document_ouvert: "Document ouvert", resume_imprime: "Résumé affiché pour un soignant",
  partage_cree: "Partage créé", partage_retire: "Partage retiré", partage_consulte: "Passeport consulté par lien",
  suivi_demande: "Demande de suivi envoyée", suivi_accepte: "Suivi accepté", suivi_termine: "Suivi terminé",
  mesures_consultees: "Mesures consultées", note_ajoutee: "Note de suivi ajoutée",
};

export type Measure = { kind: string; systolic: number | null; diastolic: number | null; pulse: number | null; glucose_gl: number | null; context: string | null; note?: string | null; measured_at: string };
export type ShareView =
  | { status: "invalide" | "retire" | "expire" | "trop" | "erreur" }
  | { status: "ok"; reference: string; expires_at: string; sections: string[];
      identite?: { nom: string; annee_naissance: number | null; sexe: string | null }; groupe_sanguin?: string | null;
      contact_urgence?: { nom: string | null; lien: string | null; telephone: string | null };
      allergies?: { titre: string; gravite: string | null; detail: string | null }[]; maladies?: { titre: string; annee: number | null }[];
      medecin_traitant?: { nom: string | null; structure: string | null; telephone: string | null; sur_santeproxi: boolean } | null;
      vaccins?: { titre: string; date: string | null }[]; traitements?: { nom: string; indication: string | null }[]; mesures?: Measure[] };

/** Valeur brute d'une mesure, sans aucune interprétation. */
export function measureValue(m: Measure) {
  if (m.kind === "tension") return `${m.systolic ?? "?"}/${m.diastolic ?? "?"} mmHg${m.pulse ? ` · pouls ${m.pulse}` : ""}`;
  return `${m.glucose_gl ?? "?"} g/L${m.context ? ` · ${m.context}` : ""}`;
}
export const WEEKDAYS: [number, string][] = [[1, "Lun"], [2, "Mar"], [3, "Mer"], [4, "Jeu"], [5, "Ven"], [6, "Sam"], [7, "Dim"]];
