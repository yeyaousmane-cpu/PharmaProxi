/**
 * Transforme une erreur Supabase/PostgreSQL en message compréhensible.
 * Les fonctions SQL lèvent des messages « PPxxx: texte » destinés à l'utilisateur.
 */
import { errorRef, log } from "@/lib/log";

export function humanizeError(error: unknown): string {
  const raw = typeof error === "string" ? error : (error as { message?: string })?.message ?? "";
  const pp = raw.match(/PP\d{3}:\s*(.+)$/s);
  if (pp) return pp[1].trim();
  if (/fetch failed|Failed to fetch|NetworkError|ECONNREFUSED|ETIMEDOUT/i.test(raw))
    return "Connexion impossible. Vérifiez votre réseau puis réessayez.";
  if (/Invalid login credentials/i.test(raw)) return "Identifiants incorrects.";
  if (/Email not confirmed/i.test(raw)) return "Adresse e-mail non confirmée : consultez le lien reçu par e-mail.";
  if (/User already registered/i.test(raw)) return "Un compte existe déjà avec cette adresse.";
  if (/rate limit|too many/i.test(raw)) return "Trop de tentatives. Patientez quelques minutes.";
  if (/Password should be/i.test(raw)) return "Mot de passe trop faible (8 caractères minimum).";
  if (/row-level security|permission denied/i.test(raw)) return "Action non autorisée.";
  if (/duplicate key/i.test(raw)) return "Cet élément existe déjà.";
  if (/check constraint/i.test(raw)) return "Certaines valeurs saisies sont invalides.";
  if (/JWT|session/i.test(raw)) return "Votre session a expiré. Reconnectez-vous.";
  if (/statement timeout|canceling statement/i.test(raw)) return "Le service met trop de temps à répondre. Réessayez dans un instant.";
  if (/aborted|timeout/i.test(raw)) return "Le service ne répond pas pour le moment. Vérifiez votre connexion puis réessayez.";
  // Erreur inattendue : journalisée avec une référence communiquée à l'utilisateur
  const ref = errorRef();
  log.error("unexpected_error", { ref, message: raw.slice(0, 500), code: (error as { code?: string })?.code });
  return `Une erreur est survenue. Réessayez dans un instant (référence ${ref}).`;
}

export type ActionState = { ok?: boolean; error?: string; message?: string; fieldErrors?: Record<string, string>; data?: unknown };
