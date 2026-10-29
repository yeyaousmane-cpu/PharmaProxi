/** Rendez-vous : libellés partagés (heure du Mali = UTC). */
export const APPT_STATUS: Record<string, { label: string; className: string }> = {
  pending: { label: "En attente de réponse", className: "border-amber-200 bg-amber-50 text-amber-900" },
  proposed: { label: "Autre moment proposé", className: "border-sky-200 bg-brand-sky text-brand-blue" },
  confirmed: { label: "Confirmé", className: "border-emerald-200 bg-emerald-50 text-emerald-900" },
  declined: { label: "Non retenu", className: "bg-muted text-muted-foreground" },
  cancelled: { label: "Annulé", className: "bg-muted text-muted-foreground" },
  expired: { label: "Expiré (sans réponse)", className: "bg-muted text-muted-foreground" },
  completed: { label: "Honoré", className: "bg-muted text-muted-foreground" },
  no_show: { label: "Patient absent", className: "bg-muted text-muted-foreground" },
};

export const APPT_PERIODS: Record<string, string> = { matin: "Le matin", apres_midi: "L'après-midi", indifferent: "Peu importe" };

const TZ = "Africa/Bamako";
export function formatApptDay(d: string | Date) {
  const date = typeof d === "string" && d.length === 10 ? new Date(`${d}T12:00:00Z`) : new Date(d);
  const t = new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" }).format(date);
  return t.charAt(0).toUpperCase() + t.slice(1);
}
export function formatApptTime(d: string | Date) {
  return new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(d)).replace(":", " h ");
}

/** Date du jour au Mali (AAAA-MM-JJ). */
export const todayMali = () => new Date().toISOString().slice(0, 10);
export const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export const AUDIENCE_LABEL: Record<string, string> = { all: "Tous les patients", new: "Nouveaux patients", returning: "Patients déjà suivis" };
export const RELATION_LABEL: Record<string, string> = { enfant: "enfant", parent: "parent", conjoint: "conjoint(e)", frere_soeur: "frère ou sœur", autre: "proche" };
export const PAYMENT_LABEL: Record<string, string> = {
  especes: "Espèces", orange_money: "Orange Money", moov_money: "Moov Money", carte: "Carte bancaire", assurance: "Assurance / mutuelle", cheque: "Chèque",
};
