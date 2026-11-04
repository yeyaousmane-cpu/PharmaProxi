import { describe, expect, it } from "vitest";
import { ageMonths, growthAdvice, referenceLines, scoreMeasure, zscore } from "@/lib/growth";
import { WFA_BOYS, WFA_GIRLS, WFH_GIRLS } from "@/lib/growth/who-tables";

const lms = (t: number[][], x: number) => { const r = t.find((v) => v[0] === x)!; return [r[1], r[2], r[3]] as [number, number, number]; };

describe("Courbe de croissance (normes OMS)", () => {
  it("les z-scores retrouvent les valeurs publiées par l'OMS", () => {
    // Garçon à la naissance : médiane 3,3 kg ; −2 ET = 2,5 kg ; +2 ET = 4,4 kg (tables OMS arrondies)
    expect(zscore(3.3464, lms(WFA_BOYS, 0), true)).toBe(0);
    expect(zscore(2.5, lms(WFA_BOYS, 0), true)).toBeCloseTo(-2, 0);
    expect(zscore(4.4, lms(WFA_BOYS, 0), true)).toBeCloseTo(2, 0);
    // Fille de 12 mois : −3 ET ≈ 6,3 kg
    expect(zscore(6.3, lms(WFA_GIRLS, 12), true)).toBeCloseTo(-3, 0);
    // Poids pour la taille, fille de 85 cm : médiane ≈ 11,5 kg
    expect(Math.abs(zscore(11.5, lms(WFH_GIRLS, 85), true))).toBeLessThan(0.3);
  });
  it("âge en mois et choix de la table couchée/debout", () => {
    expect(Math.round(ageMonths("2025-01-15", "2026-01-15"))).toBe(12);
    const s = scoreMeasure({ measured_on: "2026-01-15", weight_kg: 9.0, height_cm: 74 }, "2025-01-15", "F");
    expect(s.wfa).not.toBeNull(); expect(s.lhfa).not.toBeNull(); expect(s.wfh).not.toBeNull();
    expect(scoreMeasure({ measured_on: "2031-01-15", weight_kg: 20, height_cm: 110 }, "2025-01-15", "F").wfa).toBeNull();   // > 5 ans
  });
  it("repères : orientation vers le centre de santé, jamais de diagnostic", () => {
    const birth = "2025-05-01";
    const low = scoreMeasure({ measured_on: "2026-05-01", weight_kg: 6.0, height_cm: 70 }, birth, "F");
    const a = growthAdvice([low]);
    expect(a[0].tone).toBe("urgent");
    expect(a.map((x) => x.text).join(" ")).toMatch(/centre de santé/);
    expect(a.map((x) => x.text).join(" ")).not.toMatch(/malnutrition|malade|diagnostic/i);
    const ok = growthAdvice([scoreMeasure({ measured_on: "2026-05-01", weight_kg: 8.9, height_cm: 74 }, birth, "F")]);
    expect(ok[0].tone).toBe("ok");
    const drop = growthAdvice([scoreMeasure({ measured_on: "2026-04-01", weight_kg: 9.2, height_cm: null }, birth, "F"), scoreMeasure({ measured_on: "2026-05-01", weight_kg: 8.9, height_cm: null }, birth, "F")]);
    expect(drop.some((x) => /baissé/.test(x.text))).toBe(true);
  });
  it("lignes de référence ordonnées", () => {
    const r = referenceLines("wfa", "M", 24);
    expect(r.m3[0][1]).toBeLessThan(r.m2[0][1]); expect(r.m2[0][1]).toBeLessThan(r.med[0][1]); expect(r.med[0][1]).toBeLessThan(r.p2[0][1]);
    expect(r.med.at(-1)![0]).toBe(24);
  });
});
