import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isDemoEnv } from "@/lib/demo";

/**
 * Double authentification des espaces sensibles.
 * - Si l'utilisateur l'a activée, la session doit avoir été confirmée par un code (aal2).
 * - `mandatory` : l'activation est exigée (administration, autorités) — sauf dans l'environnement de
 *   démonstration isolé (données fictives), pour que chaque profil soit testable sans téléphone.
 */
export async function enforceMfa(path: string, mandatory = false) {
  const supabase = await createClient();
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (!data) return { enrolled: false };
  const enrolled = data.nextLevel === "aal2";
  if (enrolled && data.currentLevel !== "aal2") redirect(`/connexion/verification?suite=${encodeURIComponent(path)}`);
  if (mandatory && !enrolled && process.env.PP_MFA_OPTIONAL !== "1" && !isDemoEnv()) redirect(`/compte/securite?obligatoire=1&suite=${encodeURIComponent(path)}`);
  return { enrolled };
}
