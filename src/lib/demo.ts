/**
 * Environnement de démonstration.
 * Actif seulement si APP_ENV=demo ET si la base n'est pas celle de production (double sécurité).
 * En démonstration : bandeau permanent, aucun e-mail réel, inscriptions et changements d'adresse désactivés,
 * connexion en un clic aux comptes fictifs. Les règles d'accès (RLS) restent strictement les mêmes.
 */
const PRODUCTION_PROJECT_REF = "eumohajgsvxibleepfrd";

export function isDemoEnv(): boolean {
  if ((process.env.APP_ENV ?? "").toLowerCase() !== "demo") return false;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return !url.includes(PRODUCTION_PROJECT_REF);
}

export type DemoActor = { key: string; email: string; label: string; description: string; start: string; tests: string[] };
const mail = (r: string) => `demo.${r}@pharmaproxi.invalid`;

/** Comptes fictifs. Le domaine .invalid garantit qu'aucun message ne peut être délivré. */
export const DEMO_ACTORS: DemoActor[] = [
  { key: "customer", email: mail("customer"), label: "Patient", description: "Recherche des soins, gère son espace santé, ses rendez-vous et sa famille.", start: "/compte",
    tests: ["Tableau de bord et favoris", "Dossier santé protégé par code", "Rendez-vous", "Réservations en pharmacie", "Famille et vaccins", "Confidentialité et consentements", "Prévention et SOS Santé", "Langues FR/EN/AR, écoute, voix"] },
  { key: "doctor1", email: mail("doctor1"), label: "Médecin", description: "Gère son profil, ses lieux de consultation et son agenda de rendez-vous.", start: "/medecin",
    tests: ["Profil et lieux de consultation", "Demandes de rendez-vous à traiter", "Agenda du jour, à venir, à clôturer", "Réglages : horaires, mode de réservation, types de consultation, absences", "Statistiques"] },
  { key: "pharmacist1", email: mail("pharmacist1"), label: "Pharmacien", description: "Gère sa pharmacie, ses horaires, ses produits et la disponibilité des médicaments.", start: "/pharmacien",
    tests: ["Fiche de la pharmacie et horaires", "Stocks et disponibilités", "Réservations des patients", "Questions des patients", "Ajout depuis le catalogue national"] },
  { key: "lab", email: mail("lab"), label: "Laboratoire", description: "Gère son établissement, ses analyses et leurs tarifs, les prélèvements à domicile.", start: "/laboratoire",
    tests: ["Analyses proposées et tarifs", "Prélèvements à domicile", "Dépôt de résultats au patient (si une demande existe)"] },
  { key: "clinic", email: mail("clinic"), label: "Clinique / établissement", description: "Gère l'établissement, ses médecins rattachés et les rendez-vous.", start: "/clinique",
    tests: ["Fiche de l'établissement", "Médecins rattachés", "Agenda des rendez-vous du secrétariat"] },
  { key: "nurse", email: mail("nurse"), label: "Infirmier", description: "Reçoit les demandes de soins à domicile, accepte ou refuse, gère sa fiche et ses justificatifs.", start: "/infirmier",
    tests: ["Fiche vérifiée et zones d'intervention", "Demandes de soins à domicile : accepter, refuser, terminer", "Justificatifs déposés", "Téléphone privé ou public"] },
  { key: "institution", email: mail("institution"), label: "Institution sanitaire", description: "Suit les indicateurs, signalements et campagnes (données agrégées).", start: "/autorites",
    tests: ["Tableau de bord des indicateurs", "Signalements", "Campagnes et communiqués", "Carte et rapports"] },
  { key: "validator", email: mail("validator"), label: "Validateur médical", description: "Relit et valide les fiches santé avant publication.", start: "/redaction-sante",
    tests: ["Fiches en attente de validation", "Valider, demander des corrections, publier", "Dates de révision et archivage"] },
  { key: "auditor", email: mail("auditor"), label: "Auditeur conformité", description: "Consulte les preuves de consentement en lecture seule.", start: "/conformite", tests: ["Registre des consentements", "Dossier de preuve", "Journal des consultations"] },
  { key: "admin", email: mail("admin"), label: "Administrateur", description: "Administre la plateforme : utilisateurs, établissements, contenus, validations, langues.", start: "/admin",
    tests: ["Utilisateurs et rôles", "Pharmacies, professionnels, établissements", "Annuaire et justificatifs", "Contenus, prévention, langues", "Statistiques", "Conformité"] },
];
