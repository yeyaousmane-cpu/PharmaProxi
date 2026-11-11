/** Espace donneur de sang : constantes et types partagés. */
export const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;
export const DONATION_TYPES: Record<string, string> = { sang_total: "Sang total", plasma: "Plasma", plaquettes: "Plaquettes" };
export const DONATION_STATUS: Record<string, [string, string]> = {
  en_attente: ["En attente de validation", "bg-amber-100 text-amber-900"],
  valide: ["Validé", "bg-emerald-100 text-emerald-900"],
  refuse: ["Non validé", "bg-red-100 text-red-900"],
};
/** Phrase obligatoire à côté de toute date de prochain don. */
export const NEXT_DATE_NOTICE = "Date indicative de prochain don. Votre aptitude au don doit être confirmée par un professionnel de santé.";
export const CARD_NOTICE = "Carte de reconnaissance SantéProxi. Ce n'est pas une carte officielle de donneur délivrée par le CNTS.";

export type Badge = { code: string; label: string; threshold: number } | null;
export type DonorSummary =
  | { exists: false }
  | { exists: true; donor_code: string; validated_count: number; pending_count: number; last_validated: string | null; last_declared: string | null; last_type?: string | null;
      next_indicative: string | null; interval_months: number; interval_sex_known: boolean; intervals_confirmed: boolean; badge: { current: Badge; next: Badge } };
export type Donation = { id: string; reference: string; donated_on: string; center: string; donation_type: string; status: string; decision_note: string | null; decided_at: string | null; blood_campaigns: { title: string } | null };
export type DonorProfile = { donor_code: string; card_token: string; blood_group: string | null; blood_group_verified: boolean; sex: string | null; usual_center: string | null;
  region_id: string | null; status: string; card_show_name: boolean; card_show_last_donation: boolean; reminders: boolean; accepts_solicitations: boolean; created_at: string };

/** Couleur d'un palier (du plus simple au plus élevé). */
export const BADGE_STYLE: Record<string, string> = {
  premier_geste: "from-rose-100 to-rose-200 text-rose-900", donneur_fidele: "from-red-100 to-red-200 text-red-900",
  donneur_solidaire: "from-red-200 to-red-300 text-red-950", donneur_engage: "from-red-500 to-red-600 text-white",
  ambassadeur: "from-red-700 to-red-800 text-white", heros_solidarite: "from-amber-400 to-red-700 text-white",
};
