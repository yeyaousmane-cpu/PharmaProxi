export const SLOTS: Record<string, string> = { matin: "Le matin", apres_midi: "L'après-midi", soir: "Le soir" };
export const HCR_STATUS: Record<string, [string, string]> = {
  demande: ["En attente de réponse", "bg-amber-100 text-amber-900"], acceptee: ["Acceptée", "bg-emerald-100 text-emerald-900"],
  refusee: ["Refusée", "bg-slate-200 text-slate-800"], annulee: ["Annulée", "bg-slate-200 text-slate-800"], terminee: ["Soins effectués", "bg-sky-100 text-sky-900"],
};
export const NURSE_STATUS: Record<string, string> = { pending: "En cours de vérification", verified: "Vérifié", rejected: "Non validé", suspended: "Suspendu" };
export const NURSE_DOC_LABELS: Record<string, string> = { inscription_ordre: "Attestation d'inscription à l'Ordre", diplome: "Diplôme", piece_identite: "Pièce d'identité", autre: "Autre" };
export type HomeCareRequest = { id: string; reference: string; care_type: string; preferred_date: string; preferred_slot: string; area: string; contact_phone: string;
  message: string | null; has_prescription: boolean; status: string; nurse_reply: string | null; created_at: string };
