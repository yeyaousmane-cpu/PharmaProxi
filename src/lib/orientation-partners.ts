export const ACCESS_FIELDS: Record<string, string> = {
  tarif_consultation: "Tarif de consultation (indicatif)", tarif_urgence: "Tarif aux urgences (indicatif)", canam_amo: "AMO / CANAM", autres_assurances: "Autres assurances acceptées",
  accessibilite_fauteuil: "Accès en fauteuil roulant", langues: "Langues parlées à l'accueil", horaires: "Horaires", conditions_acces: "Conditions d'accès (ticket, carnet, référence…)",
};
export const SERVICE_STATUS: Record<string, { label: string; tone: string }> = {
  fonctionne: { label: "Fonctionne normalement", tone: "bg-emerald-50 text-emerald-900" }, perturbe: { label: "Fonctionnement perturbé", tone: "bg-amber-50 text-amber-950" },
  ferme_temporairement: { label: "Fermé temporairement", tone: "bg-red-50 text-red-900" }, sature: { label: "Saturé", tone: "bg-red-50 text-red-900" },
};
export const APPT_STATUS: Record<string, string> = { envoyee: "Envoyée", proposee: "Créneau proposé", confirmee: "Confirmé", refusee: "Refusée", annulee: "Annulée", honoree: "Honoré", non_venu: "Absent" };
