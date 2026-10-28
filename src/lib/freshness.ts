export type Freshness = "available" | "to_confirm" | "unavailable" | "stale";

/** Libellés imposés par le cahier des charges : un stock ancien n'est jamais présenté comme certain. */
export const FRESHNESS: Record<Freshness, { label: string; hint: string; className: string }> = {
  available: {
    label: "Stock déclaré disponible",
    hint: "Déclaré récemment par la pharmacie. Demandez confirmation avant de vous déplacer.",
    className: "bg-emerald-50 text-emerald-800 border-emerald-200",
  },
  to_confirm: {
    label: "Disponibilité à confirmer",
    hint: "Déclaration qui date un peu : la pharmacie doit confirmer.",
    className: "bg-amber-50 text-amber-900 border-amber-200",
  },
  unavailable: {
    label: "Indisponible",
    hint: "Déclaré indisponible par la pharmacie.",
    className: "bg-red-50 text-red-800 border-red-200",
  },
  stale: {
    label: "Information ancienne",
    hint: "Information trop ancienne pour être fiable. Contactez la pharmacie.",
    className: "bg-slate-100 text-slate-700 border-slate-300",
  },
};

export function canRequest(f: Freshness) {
  return f === "available" || f === "to_confirm" || f === "stale";
}

/** Miroir TypeScript de public.stock_freshness() (même règles, mêmes seuils). */
export function computeFreshness(
  quantity: number, reserved: number, available: boolean, updatedAt: string | Date,
  thresholds: { freshHours: number; staleHours: number }, now: Date = new Date(),
): Freshness {
  const age = now.getTime() - new Date(updatedAt).getTime();
  if (age > thresholds.staleHours * 3600_000) return "stale";
  if (!available || quantity - reserved <= 0) return "unavailable";
  if (age <= thresholds.freshHours * 3600_000) return "available";
  return "to_confirm";
}
