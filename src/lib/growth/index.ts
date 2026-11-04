/**
 * Courbe de croissance : z-scores selon les normes de l'OMS (méthode LMS, avec la correction
 * de l'OMS au-delà de ±3 pour les indicateurs de poids). Repères d'orientation uniquement :
 * seul un soignant peut évaluer l'état nutritionnel d'un enfant.
 */
import { LHFA_BOYS, LHFA_GIRLS, WFA_BOYS, WFA_GIRLS, WFH_BOYS, WFH_GIRLS, WFL_BOYS, WFL_GIRLS, type Lms } from "./who-tables";

export type Sex = "F" | "M";
export type Indicator = "wfa" | "lhfa" | "wfh";

export function ageMonths(birth: string, on: string) {
  return (Date.parse(`${on}T00:00:00Z`) - Date.parse(`${birth}T00:00:00Z`)) / 86_400_000 / 30.4375;
}

function lmsAt(table: Lms[], x: number): [number, number, number] | null {
  if (x < table[0][0] || x > table[table.length - 1][0]) return null;
  let i = 0;
  while (i < table.length - 1 && table[i + 1][0] < x) i++;
  const a = table[i], b = table[Math.min(i + 1, table.length - 1)];
  if (b[0] === a[0]) return [a[1], a[2], a[3]];
  const k = (x - a[0]) / (b[0] - a[0]);
  return [a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k, a[3] + (b[3] - a[3]) * k];
}

const valueAt = (L: number, M: number, S: number, z: number) => (L === 0 ? M * Math.exp(S * z) : M * (1 + L * S * z) ** (1 / L));

export function zscore(x: number, lms: [number, number, number], restricted: boolean) {
  const [L, M, S] = lms;
  let z = L === 0 ? Math.log(x / M) / S : ((x / M) ** L - 1) / (S * L);
  if (restricted && z > 3) { const sd3 = valueAt(L, M, S, 3); z = 3 + (x - sd3) / (sd3 - valueAt(L, M, S, 2)); }
  if (restricted && z < -3) { const sd3 = valueAt(L, M, S, -3); z = -3 + (x - sd3) / (valueAt(L, M, S, -2) - sd3); }
  return Math.round(z * 100) / 100;
}

export function tableFor(ind: Indicator, sex: Sex, months: number): Lms[] {
  if (ind === "wfa") return sex === "F" ? WFA_GIRLS : WFA_BOYS;
  if (ind === "lhfa") return sex === "F" ? LHFA_GIRLS : LHFA_BOYS;
  return months < 24 ? (sex === "F" ? WFL_GIRLS : WFL_BOYS) : (sex === "F" ? WFH_GIRLS : WFH_BOYS);
}

export type Measure = { measured_on: string; weight_kg: number | null; height_cm: number | null };
export type Scored = Measure & { months: number; wfa: number | null; lhfa: number | null; wfh: number | null };

export function scoreMeasure(m: Measure, birth: string, sex: Sex): Scored {
  const months = ageMonths(birth, m.measured_on);
  const ok = months >= 0 && months <= 60;
  const w = m.weight_kg !== null ? Number(m.weight_kg) : null, h = m.height_cm !== null ? Number(m.height_cm) : null;
  const at = (ind: Indicator, x: number) => (ok ? lmsAt(tableFor(ind, sex, months), x) : null);
  const lw = w !== null ? at("wfa", months) : null, lh = h !== null ? at("lhfa", months) : null, lwh = w !== null && h !== null ? at("wfh", h) : null;
  return { ...m, months, wfa: lw ? zscore(w!, lw, true) : null, lhfa: lh ? zscore(h!, lh, false) : null, wfh: lwh ? zscore(w!, lwh, true) : null };
}

export type Advice = { tone: "ok" | "attention" | "urgent"; text: string };

/** Repères à partir des seuils de l'OMS (−2 et −3 écarts-types). Jamais un diagnostic. */
export function growthAdvice(scored: Scored[]): Advice[] {
  if (!scored.length) return [];
  const last = scored[scored.length - 1], prev = scored.length > 1 ? scored[scored.length - 2] : null;
  const out: Advice[] = [];
  const low3 = (last.wfh !== null && last.wfh < -3) || (last.wfa !== null && last.wfa < -3);
  const low2 = (last.wfh !== null && last.wfh < -2) || (last.wfa !== null && last.wfa < -2);
  if (low3) out.push({ tone: "urgent", text: "Le poids est très en dessous de la zone habituelle pour cet âge, selon les normes de l'OMS. Montrez cette courbe au centre de santé sans attendre." });
  else if (low2) out.push({ tone: "attention", text: "Le poids est en dessous de la zone habituelle, selon les normes de l'OMS. Parlez-en au centre de santé à la prochaine pesée, ou plus tôt si l'enfant mange peu ou est malade." });
  if (last.lhfa !== null && last.lhfa < -2) out.push({ tone: "attention", text: "La taille est en dessous de la zone habituelle pour cet âge, selon les normes de l'OMS. Parlez-en au centre de santé." });
  if (last.wfh !== null && last.wfh > 2) out.push({ tone: "attention", text: "Le poids est au-dessus de la zone habituelle pour la taille, selon les normes de l'OMS. Parlez-en au centre de santé." });
  if (prev && prev.weight_kg !== null && last.weight_kg !== null && Number(last.weight_kg) < Number(prev.weight_kg))
    out.push({ tone: "attention", text: "Le poids a baissé depuis la pesée précédente. Parlez-en au centre de santé." });
  if (!out.length) out.push({ tone: "ok", text: "La dernière mesure est dans la zone habituelle des normes de l'OMS. Continuez les pesées au centre de santé." });
  return out;
}

/** Lignes de référence (−3, −2, médiane, +2) pour dessiner la courbe : [x, valeur]. */
export function referenceLines(ind: "wfa" | "lhfa", sex: Sex, maxMonths = 60) {
  const t = tableFor(ind, sex, 0).filter((r) => r[0] <= maxMonths);
  const line = (z: number) => t.map((r) => [r[0], valueAt(r[1], r[2], r[3], z)] as [number, number]);
  return { m3: line(-3), m2: line(-2), med: line(0), p2: line(2) };
}
