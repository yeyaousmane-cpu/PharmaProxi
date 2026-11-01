/** Carnet de vaccination : calcul des rendez-vous à partir du calendrier officiel (table vaccine_schedule). */
export type Dose = { code: string; label: string; protects: string; visit_key: string; visit_label: string; age_days: number; girls_only: boolean; sort: number };
export type DoseStatus = "fait" | "a_venir" | "proche" | "en_retard";
export type Visit = { key: string; label: string; due: string; doses: (Dose & { status: DoseStatus; done_on: string | null })[]; status: DoseStatus };

const DAY = 86_400_000;
export const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
export const todayUtc = () => new Date().toISOString().slice(0, 10);

export function buildVisits(schedule: Dose[], birth: string, sex: "F" | "M" | null, done: Record<string, string>, today = todayUtc()): Visit[] {
  const map = new Map<string, Visit>();
  for (const d of [...schedule].sort((a, b) => a.sort - b.sort)) {
    if (d.girls_only && sex !== "F") continue;
    const due = addDays(birth, d.age_days);
    const doneOn = done[d.code] ?? null;
    const status: DoseStatus = doneOn ? "fait" : due < today ? "en_retard" : due <= addDays(today, 14) ? "proche" : "a_venir";
    const v = map.get(d.visit_key) ?? { key: d.visit_key, label: d.visit_label, due, doses: [], status: "fait" as DoseStatus };
    v.doses.push({ ...d, status, done_on: doneOn });
    map.set(d.visit_key, v);
  }
  const rank: Record<DoseStatus, number> = { en_retard: 3, proche: 2, a_venir: 1, fait: 0 };
  for (const v of map.values()) v.status = v.doses.reduce<DoseStatus>((s, d) => (rank[d.status] > rank[s] ? d.status : s), "fait");
  return [...map.values()];
}

export function nextVisit(visits: Visit[]) {
  return visits.find((v) => v.status === "en_retard") ?? visits.find((v) => v.status === "proche" || v.status === "a_venir") ?? null;
}

export function ageLabel(birth: string, today = todayUtc()) {
  const days = Math.round((Date.parse(today) - Date.parse(birth)) / DAY);
  if (days < 0) return "à naître";
  if (days < 60) return `${Math.floor(days / 7)} semaine${days >= 14 ? "s" : ""}`;
  const months = Math.floor(days / 30.44);
  if (months < 24) return `${months} mois`;
  const years = Math.floor(days / 365.25);
  return `${years} an${years > 1 ? "s" : ""}`;
}

export const STATUS_LABEL: Record<DoseStatus, string> = { fait: "Fait", a_venir: "À venir", proche: "Bientôt", en_retard: "En retard" };
