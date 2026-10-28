import { describe, expect, it } from "vitest";
import { computeFreshness, canRequest } from "@/lib/freshness";

const th = { freshHours: 24, staleHours: 72 };
const now = new Date("2026-10-10T12:00:00Z");
const ago = (h: number) => new Date(now.getTime() - h * 3600_000);

describe("fraîcheur du stock (miroir de la fonction SQL)", () => {
  it("disponible si récent et quantité libre", () => expect(computeFreshness(10, 2, true, ago(2), th, now)).toBe("available"));
  it("à confirmer entre 24 h et 72 h", () => expect(computeFreshness(10, 0, true, ago(30), th, now)).toBe("to_confirm"));
  it("ancienne au-delà de 72 h, même si déclarée disponible", () => expect(computeFreshness(10, 0, true, ago(80), th, now)).toBe("stale"));
  it("indisponible si tout est réservé", () => expect(computeFreshness(5, 5, true, ago(1), th, now)).toBe("unavailable"));
  it("indisponible si déclaré indisponible", () => expect(computeFreshness(5, 0, false, ago(1), th, now)).toBe("unavailable"));
  it("une information indisponible mais ancienne reste « ancienne »", () => expect(computeFreshness(0, 0, false, ago(100), th, now)).toBe("stale"));
  it("on ne peut pas demander un produit indisponible", () => {
    expect(canRequest("unavailable")).toBe(false);
    expect(canRequest("stale")).toBe(true);
  });
});
