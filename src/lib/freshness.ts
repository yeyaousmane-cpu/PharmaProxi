/**
 * Statut d'une ligne de stock, calculé côté base par public.stock_status().
 * « Non référencé » (la pharmacie ne liste pas le produit) n'est pas un statut
 * de ligne : c'est l'absence de ligne. Il est affiché par NOT_LISTED.
 */
export type Freshness =
  | "available" | "low" | "to_confirm" | "on_order" | "unavailable" | "stale" | "non_declare";

/** Un stock ancien ou non confirmé n'est jamais présenté comme disponible. */
export const FRESHNESS: Record<Freshness, { label: string; hint: string; className: string }> = {
  available: {
    label: "Disponible",
    hint: "Déclaré disponible par la pharmacie il y a moins de 24 h. Appelez pour confirmer avant de vous déplacer.",
    className: "bg-emerald-50 text-emerald-800 border-emerald-200",
  },
  low: {
    label: "Stock faible",
    hint: "Déclaré il y a moins de 24 h, en petite quantité. Appelez avant de vous déplacer.",
    className: "bg-lime-50 text-lime-900 border-lime-300",
  },
  to_confirm: {
    label: "À confirmer",
    hint: "Déclaration de 24 à 72 h : la pharmacie doit confirmer la disponibilité.",
    className: "bg-amber-50 text-amber-900 border-amber-200",
  },
  on_order: {
    label: "Sur commande",
    hint: "En rupture, mais la pharmacie indique pouvoir le commander. Délai à demander à la pharmacie.",
    className: "bg-sky-50 text-sky-900 border-sky-200",
  },
  unavailable: {
    label: "Rupture",
    hint: "Déclaré en rupture par la pharmacie.",
    className: "bg-red-50 text-red-800 border-red-200",
  },
  stale: {
    label: "À confirmer (information de plus de 72 h)",
    hint: "Information trop ancienne pour être fiable. Contactez la pharmacie.",
    className: "bg-slate-100 text-slate-700 border-slate-300",
  },
  non_declare: {
    label: "Non renseigné",
    hint: "Produit ajouté à l'inventaire, quantité et disponibilité pas encore saisies. Invisible du public.",
    className: "bg-slate-50 text-slate-600 border-dashed border-slate-300",
  },
};

export const NOT_LISTED = {
  label: "Non référencé",
  hint: "Aucune pharmacie vérifiée ne déclare actuellement ce produit sur SantéProxi. Cela ne veut pas dire qu'il est introuvable : appelez votre pharmacie.",
};

/** Ancienneté de la déclaration, pour l'affichage (< 24 h, 24–72 h, > 72 h). */
export function ageBucket(updatedAt: string | Date, now: Date = new Date()): "lt24" | "24to72" | "gt72" {
  const h = (now.getTime() - new Date(updatedAt).getTime()) / 3600_000;
  return h < 24 ? "lt24" : h <= 72 ? "24to72" : "gt72";
}

export const AGE_LABEL = { lt24: "moins de 24 h", "24to72": "entre 24 et 72 h", gt72: "plus de 72 h" } as const;

/** Une demande de réservation reste possible tant que la rupture n'est pas déclarée : la pharmacie confirme. */
export function canRequest(f: Freshness) {
  return f === "available" || f === "low" || f === "to_confirm" || f === "stale" || f === "on_order";
}

/** Miroir TypeScript de public.stock_status() (mêmes règles, mêmes seuils). */
export function computeFreshness(
  quantity: number, reserved: number, available: boolean, updatedAt: string | Date,
  thresholds: { freshHours: number; staleHours: number },
  now: Date = new Date(),
  extra: { lowThreshold?: number; onOrder?: boolean; declared?: boolean } = {},
): Freshness {
  if (extra.declared === false) return "non_declare";
  const age = now.getTime() - new Date(updatedAt).getTime();
  if (age > thresholds.staleHours * 3600_000) return "stale";
  if (!available || quantity - reserved <= 0) return extra.onOrder ? "on_order" : "unavailable";
  if (age > thresholds.freshHours * 3600_000) return "to_confirm";
  if (quantity - reserved <= (extra.lowThreshold ?? 0)) return "low";
  return "available";
}
