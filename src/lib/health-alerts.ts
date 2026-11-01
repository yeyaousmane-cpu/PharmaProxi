export const ALERT_KIND: Record<string, { label: string; tone: string }> = {
  faux_medicament: { label: "Faux médicament", tone: "border-red-200 bg-red-50 text-red-800" },
  rappel_lot: { label: "Rappel de lot", tone: "border-amber-200 bg-amber-50 text-amber-900" },
  campagne: { label: "Campagne", tone: "border-emerald-200 bg-emerald-50 text-emerald-800" },
  epidemie: { label: "Épidémie", tone: "border-red-200 bg-red-50 text-red-800" },
  autre: { label: "Information", tone: "border-blue-200 bg-blue-50 text-brand-blue" },
};
