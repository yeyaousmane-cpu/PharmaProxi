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

/** Libellé lisible et empreinte de l'appareil (navigateur + système), sans adresse IP ni identifiant persistant. */
export function deviceFromUserAgent(ua: string) {
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /SamsungBrowser/.test(ua) ? "Samsung Internet" : /Firefox\//.test(ua) ? "Firefox"
    : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Navigateur";
  const os = /Android/.test(ua) ? "Android" : /iPhone|iPad|iPod/.test(ua) ? "iPhone / iPad" : /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "Système inconnu";
  return { label: `${browser} · ${os}`, key: `${browser}|${os}` };
}

/** Journalise une connexion réussie et déclenche l'alerte « nouvel appareil » (jamais bloquant). */
export async function recordLogin(supabase: Awaited<ReturnType<typeof createClient>>) {
  try {
    const { headers } = await import("next/headers");
    const { createHash } = await import("node:crypto");
    const ua = (await headers()).get("user-agent") ?? "";
    const d = deviceFromUserAgent(ua);
    const hash = createHash("sha256").update(`pp-device|${d.key}`).digest("hex");
    await supabase.rpc("record_login", { p_device_hash: hash, p_device_label: d.label });
  } catch { /* la connexion ne dépend jamais de ce journal */ }
}
