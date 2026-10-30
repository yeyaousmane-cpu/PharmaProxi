/**
 * Calculs du cycle et de la grossesse (estimations, jamais une méthode de contraception).
 * Dates manipulées en « AAAA-MM-JJ » (UTC) pour éviter les décalages de fuseau.
 */
export type Period = { id?: string; start_date: string; end_date: string | null };

const DAY = 86_400_000;
export const toDate = (s: string) => new Date(`${s}T00:00:00Z`);
export const iso = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (s: string, n: number) => iso(new Date(toDate(s).getTime() + n * DAY));
export const diffDays = (a: string, b: string) => Math.round((toDate(a).getTime() - toDate(b).getTime()) / DAY);
export const todayIso = () => iso(new Date());

/** Écarts (jours) entre débuts de règles successifs, les plus récents d'abord ; écarts aberrants ignorés. */
export function cycleGaps(periods: Period[], max = 6): number[] {
  const s = [...periods].map((p) => p.start_date).sort().reverse();
  const gaps: number[] = [];
  for (let i = 0; i < s.length - 1 && gaps.length < max; i++) {
    const g = diffDays(s[i], s[i + 1]);
    if (g >= 15 && g <= 60) gaps.push(g);
  }
  return gaps;
}

export type CycleSummary = {
  lastStart: string | null;
  avgCycle: number;          // durée retenue pour les prévisions
  fromHistory: boolean;      // calculée sur l'historique (au moins 1 écart) ou valeur déclarée
  cyclesCounted: number;
  variation: number | null;  // écart entre le cycle le plus court et le plus long
  irregular: boolean;        // variation supérieure à 7 jours, ou cycle < 21 j ou > 35 j
  avgPeriod: number;
  nextStart: string | null;
  ovulation: string | null;
  fertileStart: string | null;
  fertileEnd: string | null;
  cycleDay: number | null;   // jour du cycle en cours (1 = premier jour des règles)
  late: number;              // jours de retard par rapport à la prévision (0 sinon)
};

export function summarize(periods: Period[], declaredCycle: number, declaredPeriod: number, today = todayIso()): CycleSummary {
  const gaps = cycleGaps(periods);
  const avgCycle = gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : declaredCycle;
  const durations = periods.filter((p) => p.end_date).slice(0, 6).map((p) => diffDays(p.end_date!, p.start_date) + 1);
  const avgPeriod = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : declaredPeriod;
  const variation = gaps.length >= 2 ? Math.max(...gaps) - Math.min(...gaps) : null;
  const irregular = (variation !== null && variation > 7) || avgCycle < 21 || avgCycle > 35;
  const lastStart = periods.length ? [...periods].map((p) => p.start_date).sort().reverse()[0] : null;
  if (!lastStart) {
    return { lastStart, avgCycle, fromHistory: false, cyclesCounted: 0, variation, irregular, avgPeriod, nextStart: null, ovulation: null, fertileStart: null, fertileEnd: null, cycleDay: null, late: 0 };
  }
  let nextStart = addDays(lastStart, avgCycle);
  const late = Math.max(0, diffDays(today, nextStart));
  // Ovulation estimée environ 14 jours avant les règles suivantes ; fenêtre fertile : 5 jours avant à 1 jour après
  const ovulation = addDays(nextStart, -14);
  const sinceLast = diffDays(today, lastStart);
  if (late > 0) nextStart = today;
  return {
    lastStart, avgCycle, fromHistory: gaps.length > 0, cyclesCounted: gaps.length, variation, irregular, avgPeriod,
    nextStart, ovulation, fertileStart: addDays(ovulation, -5), fertileEnd: addDays(ovulation, 1),
    cycleDay: sinceLast >= 0 ? sinceLast + 1 : null, late,
  };
}

/** Prévisions sur plusieurs cycles (pour le calendrier). */
export function forecast(s: CycleSummary, count = 3) {
  if (!s.lastStart) return [];
  const base = s.late > 0 ? s.nextStart! : addDays(s.lastStart, s.avgCycle);
  return Array.from({ length: count }, (_, i) => {
    const start = addDays(base, i * s.avgCycle);
    const ov = addDays(start, s.avgCycle - 14);
    return { start, end: addDays(start, s.avgPeriod - 1), ovulation: ov, fertileStart: addDays(ov, -5), fertileEnd: addDays(ov, 1) };
  }).concat(
    // Fenêtre fertile du cycle en cours
    [{ start: "", end: "", ovulation: s.ovulation!, fertileStart: s.fertileStart!, fertileEnd: s.fertileEnd! }],
  );
}

export type DayKind = "regles" | "regles_prevues" | "ovulation" | "fertile" | null;

export function dayKind(day: string, periods: Period[], s: CycleSummary, showFertility: boolean): DayKind {
  for (const p of periods) {
    const end = p.end_date ?? (diffDays(todayIso(), p.start_date) < s.avgPeriod ? todayIso() : addDays(p.start_date, s.avgPeriod - 1));
    if (day >= p.start_date && day <= end) return "regles";
  }
  const f = forecast(s);
  for (const c of f) {
    if (c.start && day >= c.start && day <= c.end && day >= todayIso()) return "regles_prevues";
    if (showFertility && c.ovulation === day) return "ovulation";
    if (showFertility && day >= c.fertileStart && day <= c.fertileEnd) return "fertile";
  }
  return null;
}

/** Grille d'un mois (semaines commençant le lundi). */
export function monthGrid(month: string): (string | null)[][] {
  const first = toDate(`${month}-01`);
  const lead = (first.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`)];
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
}
export const shiftMonth = (month: string, n: number) => {
  const d = toDate(`${month}-01`);
  return iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1))).slice(0, 7);
};

// ---------------------------------------------------------------------------
// Grossesse et post-partum
// ---------------------------------------------------------------------------
export type Pregnancy = { lmp: string; due: string; days: number; weeks: number; extraDays: number; trimester: 1 | 2 | 3; daysLeft: number };

/** Âge de la grossesse en semaines d'aménorrhée (depuis les dernières règles) ; terme estimé = règles + 280 jours. */
export function pregnancy(lmp: string | null, due: string | null, today = todayIso()): Pregnancy | null {
  const start = due ? addDays(due, -280) : lmp;
  if (!start) return null;
  const end = due ?? addDays(start, 280);
  const days = diffDays(today, start);
  if (days < 0 || days > 44 * 7) return null;
  const weeks = Math.floor(days / 7);
  return { lmp: start, due: end, days, weeks, extraDays: days % 7, trimester: weeks < 14 ? 1 : weeks < 28 ? 2 : 3, daysLeft: diffDays(end, today) };
}

/** Contacts prénatals recommandés par l'OMS (2016) : au moins 8, à 12, 20, 26, 30, 34, 36, 38 et 40 semaines. */
export const WHO_ANC_WEEKS = [12, 20, 26, 30, 34, 36, 38, 40];
export function ancSchedule(lmp: string) {
  return WHO_ANC_WEEKS.map((w, i) => ({ n: i + 1, week: w, date: addDays(lmp, w * 7) }));
}

/** Contacts postnatals recommandés par l'OMS (2022) : 24 h, jour 3, jours 7 à 14, 6 semaines. */
export function postnatalSchedule(delivery: string) {
  return [
    { label: "Dans les 24 heures après la naissance", from: delivery, to: addDays(delivery, 1) },
    { label: "Au 3e jour (48 à 72 heures)", from: addDays(delivery, 2), to: addDays(delivery, 3) },
    { label: "Entre le 7e et le 14e jour", from: addDays(delivery, 7), to: addDays(delivery, 14) },
    { label: "À 6 semaines", from: addDays(delivery, 42), to: addDays(delivery, 42) },
  ];
}
