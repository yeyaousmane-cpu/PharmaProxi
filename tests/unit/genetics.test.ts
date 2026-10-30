import { describe, expect, it } from "vitest";
import { aboPossibleChildren, hbGrid, hbOffspring, redCellDonors, redCellRecipients, rhPossibleChildren, rhPregnancyWatch, HB_PROFILES } from "@/lib/health/genetics";

const pct = (p1: Parameters<typeof hbOffspring>[0], p2: Parameters<typeof hbOffspring>[1]) =>
  Object.fromEntries(hbOffspring(p1, p2).map((x) => [x.profile, x.percent]));

describe("transmission de l'hémoglobine (modèle mendélien)", () => {
  it("couples demandés", () => {
    expect(pct("AA", "AA")).toEqual({ AA: 100 });
    expect(pct("AA", "AS")).toEqual({ AA: 50, AS: 50 });
    expect(pct("AS", "AS")).toEqual({ AA: 25, AS: 50, SS: 25 });
    expect(pct("AS", "SS")).toEqual({ AS: 50, SS: 50 });
    expect(pct("SS", "AA")).toEqual({ AS: 100 });
    expect(pct("SS", "SS")).toEqual({ SS: 100 });
  });
  it("hémoglobine C (fréquente en Afrique de l'Ouest)", () => {
    expect(pct("AS", "AC")).toEqual({ AA: 25, AS: 25, AC: 25, SC: 25 });
    expect(pct("AC", "AC")).toEqual({ AA: 25, AC: 50, CC: 25 });
    expect(pct("SC", "AA")).toEqual({ AS: 50, AC: 50 });
  });
  it("les probabilités font toujours 100 % et sont symétriques", () => {
    for (const a of HB_PROFILES) for (const b of HB_PROFILES) {
      expect(hbOffspring(a, b).reduce((s, x) => s + x.percent, 0)).toBe(100);
      expect(pct(a, b)).toEqual(pct(b, a));
    }
  });
  it("tableau de croisement 2 × 2", () => {
    expect(hbGrid("AS", "AS")).toEqual([["AA", "AS"], ["AS", "SS"]]);
  });
});

describe("groupes sanguins", () => {
  it("groupes ABO possibles de l'enfant", () => {
    expect(aboPossibleChildren("O", "O")).toEqual(["O"]);
    expect(aboPossibleChildren("A", "B")).toEqual(["A", "B", "AB", "O"]);
    expect(aboPossibleChildren("AB", "O")).toEqual(["A", "B"]);
    expect(aboPossibleChildren("AB", "AB")).toEqual(["A", "B", "AB"]);
    expect(aboPossibleChildren("A", "O")).toEqual(["A", "O"]);
  });
  it("rhésus possibles", () => {
    expect(rhPossibleChildren("-", "-")).toEqual(["-"]);
    expect(rhPossibleChildren("+", "-")).toEqual(["+", "-"]);
  });
  it("compatibilité transfusionnelle (globules rouges)", () => {
    expect(redCellDonors("O-")).toEqual(["O-"]);
    expect(redCellDonors("AB+")).toHaveLength(8);
    expect(redCellDonors("A-")).toEqual(["A-", "O-"]);
    expect(redCellRecipients("O-")).toHaveLength(8);
    expect(redCellRecipients("AB+")).toEqual(["AB+"]);
  });
  it("vigilance rhésus pendant la grossesse", () => {
    expect(rhPregnancyWatch("-", "+")).toBe(true);
    expect(rhPregnancyWatch("-", "?")).toBe(true);
    expect(rhPregnancyWatch("-", "-")).toBe(false);
    expect(rhPregnancyWatch("+", "-")).toBe(false);
  });
});
