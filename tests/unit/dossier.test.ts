import { describe, expect, it } from "vitest";
import { KINDS, SEALED, allergyMatches, nextDonationDate, sortItems } from "@/lib/dossier/config";

describe("Mon dossier santé", () => {
  it("rappel d'allergie : nom exact, famille de la pénicilline, aspirine ; pas de faux positif", () => {
    expect(allergyMatches("Amoxicilline 500 mg", ["Pénicilline"])).toEqual(["Pénicilline"]);
    expect(allergyMatches("Augmentin 1 g", ["penicilline"])).toEqual(["penicilline"]);
    expect(allergyMatches("Kardégic 75", ["Aspirine"])).toEqual(["Aspirine"]);
    expect(allergyMatches("Bactrim forte", ["Sulfamides"])).toEqual(["Sulfamides"]);
    expect(allergyMatches("Ibuprofène 400", ["ibuprofene"])).toEqual(["ibuprofene"]);
    expect(allergyMatches("Paracétamol 500 mg", ["Pénicilline", "Arachide"])).toEqual([]);
    expect(allergyMatches("Amlodipine 5 mg", ["Aspirine"])).toEqual([]);
    expect(allergyMatches("ab", ["ab"])).toEqual([]);
  });
  it("don de sang : 3 mois pour un homme, 4 mois sinon", () => {
    expect(nextDonationDate("2026-01-15", "M")).toBe("2026-04-15");
    expect(nextDonationDate("2026-01-15", "F")).toBe("2026-05-15");
    expect(nextDonationDate("2026-01-15", null)).toBe("2026-05-15");
    expect(nextDonationDate(null, "M")).toBeNull();
  });
  it("rubriques : chaque champ chiffrable est du texte libre, chaque rubrique a un titre obligatoire", () => {
    for (const k of Object.values(KINDS)) {
      expect(k.fields.find((f) => f.name === "title")?.required).toBe(true);
      for (const f of k.fields) if (SEALED.includes(f.name)) expect(["text", "textarea"]).toContain(f.type);
    }
  });
  it("tri : plus récent d'abord", () => {
    const l = sortItems([{ year: null, event_date: "2025-01-01", created_at: "a" }, { year: null, event_date: "2026-03-01", created_at: "b" }], "date");
    expect(l[0].event_date).toBe("2026-03-01");
  });
});
