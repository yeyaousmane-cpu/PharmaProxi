import { describe, expect, it } from "vitest";
import { amoBreakdown, amoPatientShare } from "@/lib/amo";

describe("AMO : reste à payer (identique à public.amo_patient_share)", () => {
  it("prix = tarif : 30 % à payer", () => expect(amoPatientShare(1000, 1000, 70)).toBe(300));
  it("prix au-dessus du tarif : l'écart reste à charge", () => expect(amoPatientShare(1200, 1000, 70)).toBe(500));
  it("prix en dessous du tarif : base = prix", () => expect(amoPatientShare(800, 1000, 70)).toBe(240));
  it("sans tarif connu : base = prix", () => expect(amoPatientShare(1000, null, 70)).toBe(300));
  it("arrondi au franc", () => expect(amoPatientShare(1175, 1175, 70)).toBe(352));
  it("valeurs absentes", () => {
    expect(amoPatientShare(null, 1000, 70)).toBeNull();
    expect(amoPatientShare(1000, 1000, null)).toBeNull();
  });
  it("détail du calcul", () => expect(amoBreakdown(1200, 1000, 70)).toEqual({ base: 1000, covered: 700, patient: 500, above: 200 }));
});

import { VOLUNTARY_CLASSES, VOLUNTARY_RATES, voluntaryContribution } from "@/lib/amo-guide";
describe("Assurance volontaire INPS : cotisations trimestrielles", () => {
  it("classe 1, AMO 6,56 % de 125 000", () => expect(voluntaryContribution(125_000, VOLUNTARY_RATES.amo)).toBe(8200));
  it("classe 5, trois branches (23,56 %)", () => expect(voluntaryContribution(1_000_000, 23.56)).toBe(235_600));
  it("5 classes croissantes, de 125 000 à 1 000 000", () => {
    expect(VOLUNTARY_CLASSES.map((c) => c.base)).toEqual([125_000, 400_000, 675_000, 900_000, 1_000_000]);
  });
});
