export const RX_STATUS: Record<string, { label: string; tone: string }> = {
  envoyee: { label: "Envoyée", tone: "bg-blue-50 text-blue-900" },
  vue: { label: "Ouverte par la pharmacie", tone: "bg-blue-50 text-blue-900" },
  repondue: { label: "Réponse reçue", tone: "bg-emerald-50 text-emerald-900" },
  reservee: { label: "Réservée", tone: "bg-emerald-50 text-emerald-900" },
  prete: { label: "Prête au comptoir", tone: "bg-emerald-100 text-emerald-950" },
  retiree: { label: "Retirée", tone: "bg-muted text-foreground" },
  refusee: { label: "Refusée", tone: "bg-red-50 text-red-900" },
  annulee: { label: "Annulée", tone: "bg-muted text-foreground" },
  expiree: { label: "Expirée", tone: "bg-muted text-foreground" },
};
export const AVAILABILITY: Record<string, string> = { disponible: "Disponible", partiel: "Quantité partielle", a_commander: "À commander", indisponible: "Indisponible" };
export type RxLine = { id: string; position: number; label: string; availability: string; quantity_available: number | null; unit_price_xof: number | null; delay_days: number | null; note: string | null };
