export const JOURNEYS = {
  cycle: { label: "Suivre mon cycle", short: "Suivi du cycle" },
  conception: { label: "J'aimerais avoir un enfant", short: "Projet de grossesse" },
  grossesse: { label: "Je suis enceinte", short: "Grossesse" },
  postpartum: { label: "J'ai accouché récemment", short: "Après l'accouchement" },
  menopause: { label: "Ménopause ou préménopause", short: "Ménopause" },
} as const;
export type Journey = keyof typeof JOURNEYS;

export const AGE_BANDS = ["13-17", "18-24", "25-34", "35-44", "45-54", "55+"] as const;
export const AGE_LABEL: Record<string, string> = {
  "13-17": "13 à 17 ans", "18-24": "18 à 24 ans", "25-34": "25 à 34 ans", "35-44": "35 à 44 ans", "45-54": "45 à 54 ans", "55+": "55 ans et plus",
};
export const REGULARITY: Record<string, string> = { regulier: "Plutôt régulier", irregulier: "Irrégulier", ne_sait_pas: "Je ne sais pas" };

export const FLOWS: Record<string, string> = { aucun: "Aucun", traces: "Quelques traces", leger: "Léger", moyen: "Moyen", abondant: "Abondant" };
export const SYMPTOMS: Record<string, string> = {
  crampes: "Crampes", douleur_ventre: "Douleur au ventre", mal_tete: "Mal de tête", fatigue: "Fatigue", acne: "Acné",
  ballonnements: "Ballonnements", seins_sensibles: "Seins sensibles", nausees: "Nausées", mal_dos: "Mal de dos", pertes: "Pertes vaginales",
  saignement_inhabituel: "Saignement inhabituel", bouffees_chaleur: "Bouffées de chaleur", insomnie: "Insomnie", vertiges: "Vertiges",
  envies: "Envies alimentaires", autre: "Autre",
};
export const MOODS: Record<string, string> = {
  bien: "Bien", calme: "Calme", energique: "Pleine d'énergie", fatiguee: "Fatiguée", irritable: "Irritable", triste: "Triste", anxieuse: "Anxieuse",
};
export const MUCUS: Record<string, string> = {
  aucune: "Aucune / sèche", collante: "Collante", cremeuse: "Crémeuse", aqueuse: "Aqueuse", blanc_oeuf: "Comme du blanc d'œuf (étirable)",
};
export const SLEEP: Record<string, string> = { "1": "Très mauvais", "2": "Mauvais", "3": "Moyen", "4": "Bon", "5": "Très bon" };
export const TESTS: Record<string, string> = {
  ovulation_positif: "Test d'ovulation positif", ovulation_negatif: "Test d'ovulation négatif",
  grossesse_positif: "Test de grossesse positif", grossesse_negatif: "Test de grossesse négatif",
};
export const REMINDER_KINDS: Record<string, string> = {
  consultation_prenatale: "Consultation prénatale", examen: "Examen", traitement: "Prise d'un traitement prescrit", rendez_vous: "Rendez-vous médical", autre: "Autre",
};
export const REPEATS: Record<string, string> = { aucune: "Une seule fois", quotidienne: "Chaque jour", hebdomadaire: "Chaque semaine", mensuelle: "Chaque mois" };
export const PARTNER_TOPICS: Record<string, string> = {
  general: "Santé des femmes : notions générales", cycle: "Comprendre le cycle menstruel", fertilite: "Fertilité et projet d'enfant",
  grossesse: "Accompagner une femme enceinte", postpartum: "Après l'accouchement", menopause: "La ménopause",
};
