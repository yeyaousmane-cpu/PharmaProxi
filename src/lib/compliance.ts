import "server-only";

export type ProofRow = { id: number; user_id: string; user_name: string | null; purpose_code: string; purpose_title: string; purpose_version: number; decision: string; method: string;
  policy_version: string | null; lang: string | null; timezone: string | null; text_sha256: string | null; created_at: string; text_ok: boolean };
export const DECISION: Record<string, string> = { accorde: "Accepté", refuse: "Refusé", retire: "Retiré" };
export const METHOD: Record<string, string> = { centre_confidentialite: "Espace personnel", inscription: "Inscription", parcours_service: "Parcours de service" };
export const bamako = (s: string) => new Date(s).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "medium", timeZone: "Africa/Bamako" });

export function parseFilters(sp: Record<string, string | undefined>) {
  const d = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  return {
    p_user: sp.user && /^[0-9a-f-]{36}$/i.test(sp.user) ? sp.user : null,
    p_from: d(sp.du), p_to: d(sp.au),
    p_purpose: sp.finalite && /^[a-z_]{3,40}$/.test(sp.finalite) ? sp.finalite : null,
    p_decision: sp.statut && ["accorde", "refuse", "retire"].includes(sp.statut) ? sp.statut : null,
  };
}
