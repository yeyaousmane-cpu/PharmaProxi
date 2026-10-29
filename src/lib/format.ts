/** Formatage adapté au Mali : FCFA (XOF), heure de Bamako (UTC+0), téléphones +223. */
export const TIMEZONE = "Africa/Bamako";

const xof = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

export function formatXof(amount: number | null | undefined) {
  if (amount === null || amount === undefined) return "Prix non renseigné";
  return `${xof.format(amount).replace(/ | /g, " ")} FCFA`;
}

export function formatDateTime(iso: string | Date | null | undefined) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("fr-FR", { timeZone: TIMEZONE, dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

export function formatDate(iso: string | Date | null | undefined) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("fr-FR", { timeZone: TIMEZONE, dateStyle: "medium" }).format(new Date(iso));
}

/** « il y a 3 h », « il y a 2 j » — utilisé pour la fraîcheur des stocks. */
export function formatAge(iso: string | Date, now: Date = new Date()) {
  const diff = Math.max(0, now.getTime() - new Date(iso).getTime());
  const min = Math.round(diff / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `il y a ${h} h`;
  return `il y a ${Math.round(h / 24)} j`;
}

/**
 * Normalise un numéro au format international E.164.
 * Un numéro malien à 8 chiffres reçoit l'indicatif +223.
 * Retourne null si le numéro est invalide.
 */
export function normalizePhone(input: string | null | undefined, defaultCountry = "223"): string | null {
  if (!input) return null;
  let s = input.replace(/[\s.\-()]/g, "");
  if (s.startsWith("00")) s = "+" + s.slice(2);
  if (/^\d{8}$/.test(s)) s = `+${defaultCountry}${s}`;
  if (!s.startsWith("+")) s = "+" + s;
  return /^\+[1-9]\d{7,14}$/.test(s) ? s : null;
}

export function formatPhone(e164: string | null | undefined) {
  if (!e164) return "";
  const m = e164.match(/^\+223(\d{2})(\d{2})(\d{2})(\d{2})$/);
  return m ? `+223 ${m[1]} ${m[2]} ${m[3]} ${m[4]}` : e164;
}

export function formatDistance(km: number | null | undefined) {
  if (km === null || km === undefined) return null;
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(km < 10 ? 1 : 0).replace(".", ",")} km`;
}

/** Lien WhatsApp avec un message prérempli (le numéro doit être au format +223…). */
export function whatsappUrl(phone: string | null | undefined, text: string) {
  const digits = (phone ?? "").replace(/[^0-9]/g, "");
  if (digits.length < 8) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
