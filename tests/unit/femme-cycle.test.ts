import { describe, expect, it } from "vitest";
import { ancSchedule, cycleGaps, dayKind, monthGrid, postnatalSchedule, pregnancy, shiftMonth, summarize } from "@/lib/femme/cycle";

const P = (s: string, e: string | null = null) => ({ start_date: s, end_date: e });

describe("cycle", () => {
  it("moyenne des cycles, écarts aberrants ignorés, irrégularité", () => {
    const per = [P("2026-10-01", "2026-10-05"), P("2026-09-03", "2026-09-07"), P("2026-08-05", "2026-08-09"), P("2026-05-01")];
    expect(cycleGaps(per)).toEqual([28, 29]); // 96 jours ignorés
    const s = summarize(per, 30, 4, "2026-10-10");
    expect(s).toMatchObject({ avgCycle: 29, fromHistory: true, avgPeriod: 5, irregular: false, cycleDay: 10, nextStart: "2026-10-30", ovulation: "2026-10-16", fertileStart: "2026-10-11", fertileEnd: "2026-10-17", late: 0 });
    const irr = summarize([P("2026-10-01"), P("2026-09-01"), P("2026-08-12")], 28, 5, "2026-10-02");
    expect(irr.irregular).toBe(true); // 30 et 20 jours
  });
  it("valeurs déclarées sans historique, retard", () => {
    const s = summarize([P("2026-09-01")], 28, 5, "2026-10-05");
    expect(s).toMatchObject({ fromHistory: false, avgCycle: 28, late: 6, nextStart: "2026-10-05" });
    expect(summarize([], 28, 5).nextStart).toBeNull();
  });
  it("calendrier : règles notées, prévues, fertilité masquée si demandé", () => {
    const per = [P("2026-10-01", "2026-10-05")];
    const s = summarize(per, 28, 5, "2026-10-10");
    expect(dayKind("2026-10-03", per, s, true)).toBe("regles");
    expect(dayKind(s.ovulation!, per, s, true)).toBe("ovulation");
    expect(dayKind(s.ovulation!, per, s, false)).toBeNull();
    expect(monthGrid("2026-10")[0]).toEqual([null, null, null, "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]);
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  });
  it("grossesse : semaines d'aménorrhée, terme, consultations OMS, post-partum", () => {
    expect(pregnancy("2026-06-01", null, "2026-10-30")).toMatchObject({ weeks: 21, extraDays: 4, trimester: 2, due: "2027-03-08" });
    expect(pregnancy(null, "2027-03-08", "2026-10-30")?.lmp).toBe("2026-06-01");
    expect(pregnancy(null, null)).toBeNull();
    expect(ancSchedule("2026-06-01").map((c) => c.week)).toEqual([12, 20, 26, 30, 34, 36, 38, 40]);
    expect(postnatalSchedule("2026-10-01").map((c) => c.from)).toEqual(["2026-10-01", "2026-10-03", "2026-10-08", "2026-11-12"]);
  });
});
