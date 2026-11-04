/** Libellés de l'espace Autorités et des signalements de médicaments. */
export const SCOPES: Record<string, string> = {
  ministere: "Ministère de la Santé", dpm: "Direction de la pharmacie et du médicament (DPM)", cnts: "Centre national de transfusion sanguine (CNTS)",
  ordre_pharmaciens: "Ordre national des pharmaciens", ordre_medecins: "Ordre national des médecins", canam: "CANAM", autre: "Autre institution",
};
/** Qui voit quoi (doit correspondre aux contrôles de la base de données). */
export const CAN = {
  reports: ["ministere", "dpm", "ordre_pharmaciens"],
  blood: ["ministere", "cnts"],
  campaigns: ["ministere", "cnts"],
};
export const REPORT_KIND: Record<string, string> = { suspect: "Médicament suspect", effet: "Effet indésirable" };
export const REPORTER: Record<string, string> = { patient: "Patient", proche: "Un proche du patient", pharmacien: "Pharmacien", medecin: "Médecin ou soignant", autre: "Autre" };
export const WHERE: Record<string, string> = { pharmacie: "Pharmacie", depot: "Dépôt de médicaments", centre_sante: "Centre de santé", rue: "Vendeur dans la rue", marche: "Marché", internet: "Internet ou réseaux sociaux", autre: "Autre" };
export const PROBLEMS: Record<string, string> = {
  emballage: "Emballage abîmé ou différent", etiquette: "Étiquette ou notice étrange (fautes, langue, absente)", aspect: "Aspect, couleur ou odeur inhabituels",
  prix: "Prix anormalement bas", non_autorise: "Vendu hors pharmacie", inefficace: "Le médicament ne semble pas agir", perime: "Périmé ou date effacée", autre: "Autre",
};
export const SEVERITY: Record<string, string> = { legere: "Légère", moderee: "Gênante", grave: "Grave (hospitalisation, danger)" };
export const OUTCOME: Record<string, string> = { gueri: "Guéri(e)", en_cours: "Toujours en cours", sequelles: "Avec des séquelles", inconnu: "Je ne sais pas" };
export const AGES = ["0-4", "5-14", "15-24", "25-49", "50-64", "65+"] as const;
export const REPORT_STATUS: Record<string, string> = { nouveau: "Nouveau", en_cours: "En cours d'examen", transmis: "Transmis au service compétent", clos: "Clos" };
export const QUESTION_ABOUT: Record<string, string> = { moi: "Pour soi-même", enfant: "Pour un enfant", femme_enceinte: "Femme enceinte", personne_agee: "Personne âgée", autre: "Autre" };
export const PERIODS = [["7", "7 derniers jours"], ["30", "30 derniers jours"], ["90", "3 derniers mois"], ["365", "12 derniers mois"]] as const;
export const fmtN = (n: number | string | null | undefined) => (n === null || n === undefined ? "moins de 10" : Number(n).toLocaleString("fr-FR"));
