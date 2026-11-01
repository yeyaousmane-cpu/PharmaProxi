import { describe, expect, it } from "vitest";
import { addDays, ageLabel, buildVisits, nextVisit, type Dose } from "@/lib/vaccines";
import { buildIcs } from "@/lib/ics";

const S: Dose[] = [
  { code: "BCG", label: "BCG", protects: "", visit_key: "naissance", visit_label: "À la naissance", age_days: 0, girls_only: false, sort: 1 },
  { code: "PENTA1", label: "Penta 1", protects: "", visit_key: "s6", visit_label: "6 semaines", age_days: 42, girls_only: false, sort: 2 },
  { code: "VPO1", label: "VPO 1", protects: "", visit_key: "s6", visit_label: "6 semaines", age_days: 42, girls_only: false, sort: 3 },
  { code: "HPV1", label: "HPV 1", protects: "", visit_key: "a10", visit_label: "10 ans", age_days: 3653, girls_only: true, sort: 4 },
];

describe("carnet de vaccination", () => {
  it("dates, statuts et doses réservées aux filles", () => {
    const v = buildVisits(S, "2026-09-01", "M", { BCG: "2026-09-01" }, "2026-10-20");
    expect(v.map((x) => [x.key, x.due, x.status])).toEqual([["naissance", "2026-09-01", "fait"], ["s6", "2026-10-13", "en_retard"]]);
    expect(nextVisit(v)?.key).toBe("s6");
    expect(buildVisits(S, "2026-09-01", "F", {}, "2026-09-02").map((x) => x.key)).toContain("a10");
    expect(buildVisits(S, "2026-09-10", null, { BCG: "2026-09-10" }, "2026-10-10")[1].status).toBe("proche");
  });
  it("âge lisible", () => {
    expect(ageLabel("2026-10-01", "2026-10-22")).toBe("3 semaines");
    expect(ageLabel("2025-10-01", "2026-10-22")).toBe("12 mois");
    expect(ageLabel("2020-01-01", "2026-10-22")).toBe("6 ans");
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
  });
  it("fichier d'agenda valide avec alarme et répétition", () => {
    const ics = buildIcs("Test", [{ uid: "a", start: "2026-11-02T08:00", title: "Médicament, matin", rrule: "FREQ=DAILY;COUNT=30" }]);
    expect(ics).toContain("DTSTART:20261102T080000Z");
    expect(ics).toContain("RRULE:FREQ=DAILY;COUNT=30");
    expect(ics).toContain("SUMMARY:Médicament\\, matin");
    expect(ics).toContain("BEGIN:VALARM");
  });
});
