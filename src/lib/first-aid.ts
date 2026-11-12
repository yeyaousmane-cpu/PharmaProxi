/** Premiers secours & citoyens sauveteurs : libellés partagés. */
export const PARTNERSHIP: Record<string, [string, string]> = {
  potentiel: ["Partenaire potentiel — aucun accord signé", "bg-slate-100 text-slate-800"], en_discussion: ["Échanges en cours — aucun accord signé", "bg-amber-100 text-amber-900"],
  accord_signe: ["Partenaire (accord signé)", "bg-emerald-100 text-emerald-900"],
};
export const REG_STATUS: Record<string, string> = { envoyee: "Envoyée", en_attente: "En attente", confirmee: "Confirmée", terminee: "Terminée", annulee: "Annulée" };
export const AUDIENCE: Record<string, string> = { individuel: "Particulier", etudiant: "Étudiant(e)", eleve: "Élève", entreprise: "Entreprise", administration: "Administration", association: "Association", autre: "Autre" };
export const CERT_STATUS: Record<string, [string, string]> = {
  declaree: ["Formation déclarée, en attente de vérification", "bg-amber-100 text-amber-900"], verifiee: ["Formation vérifiée", "bg-emerald-100 text-emerald-900"],
  expiree: ["Expirée — recyclage nécessaire", "bg-slate-200 text-slate-800"], non_confirmee: ["Formation non confirmée", "bg-red-100 text-red-900"],
};
export const CAMPAIGN_AUDIENCE: Record<string, string> = { universites: "Universités et grandes écoles", lycees: "Établissements secondaires", entreprises: "Entreprises", administrations: "Administrations", quartiers: "Quartiers et communes", tous: "Tout public" };
