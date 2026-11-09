import "server-only";
import type { createClient } from "@/lib/supabase/server";

/** Enregistre dans le registre de preuves les consentements choisis à l'inscription, à la première session ouverte. */
export async function applyPendingConsents(supabase: Awaited<ReturnType<typeof createClient>>) {
  try {
    const { data } = await supabase.auth.getUser();
    const pending = data.user?.user_metadata?.consents_pending;
    if (!Array.isArray(pending)) return;
    for (const code of pending) if (code === "communications" || code === "enquetes") await supabase.rpc("set_consent", { p_purpose: code, p_granted: true, p_method: "inscription" });
    await supabase.auth.updateUser({ data: { consents_pending: null } });
  } catch { /* jamais bloquant pour la connexion */ }
}
