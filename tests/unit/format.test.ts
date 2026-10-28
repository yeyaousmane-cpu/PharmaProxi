import { describe, expect, it } from "vitest";
import { formatAge, formatDistance, formatPhone, formatXof, normalizePhone } from "@/lib/format";

describe("formatage malien", () => {
  it("formate les montants en FCFA", () => {
    expect(formatXof(1500)).toBe("1 500 FCFA");
    expect(formatXof(0)).toBe("0 FCFA");
    expect(formatXof(null)).toBe("Prix non renseigné");
  });
  it("normalise les numéros maliens au format international", () => {
    expect(normalizePhone("70 12 34 56")).toBe("+22370123456");
    expect(normalizePhone("0022370123456")).toBe("+22370123456");
    expect(normalizePhone("+223 70-12-34-56")).toBe("+22370123456");
    expect(normalizePhone("+33 6 12 34 56 78")).toBe("+33612345678");
    expect(normalizePhone("1234")).toBeNull();
    expect(normalizePhone("abc")).toBeNull();
    expect(formatPhone("+22370123456")).toBe("+223 70 12 34 56");
  });
  it("affiche l'âge d'une information", () => {
    const now = new Date("2026-10-10T12:00:00Z");
    expect(formatAge("2026-10-10T11:30:00Z", now)).toBe("il y a 30 min");
    expect(formatAge("2026-10-10T09:00:00Z", now)).toBe("il y a 3 h");
    expect(formatAge("2026-10-06T12:00:00Z", now)).toBe("il y a 4 j");
  });
  it("affiche les distances", () => {
    expect(formatDistance(0.42)).toBe("420 m");
    expect(formatDistance(3.25)).toBe("3,3 km");
    expect(formatDistance(null)).toBeNull();
  });
});
