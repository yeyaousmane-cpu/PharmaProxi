import { describe, expect, it } from "vitest";
import { addressSchema, parseOpeningHours, pharmacySchema, signUpSchema, stockSchema } from "@/lib/validation";
import { humanizeError } from "@/lib/errors";
import { safeNext } from "@/lib/redirect";

const uuid = "8a6e0804-2bd0-4672-b79d-d97027f9071a";

describe("validation des entrées", () => {
  it("inscription : e-mail, mot de passe, conditions", () => {
    expect(signUpSchema.safeParse({ full_name: "Awa", email: "AWA@Ex.ml ", password: "12345678", accept: "on" }).success).toBe(true);
    const bad = signUpSchema.safeParse({ full_name: "A", email: "x", password: "123", accept: undefined });
    expect(bad.success).toBe(false);
    expect(bad.error!.issues.length).toBeGreaterThanOrEqual(4);
  });
  it("pharmacie : téléphone normalisé, coordonnées par paire", () => {
    const base = { name: "Pharmacie A", address: "Rue 1", region_id: uuid, phone: "70 00 00 00" };
    const ok = pharmacySchema.safeParse(base);
    expect(ok.success && ok.data.phone).toBe("+22370000000");
    expect(pharmacySchema.safeParse({ ...base, latitude: "12.6" }).success).toBe(false);
    expect(pharmacySchema.safeParse({ ...base, latitude: "120", longitude: "1" }).success).toBe(false);
  });
  it("adresse : région obligatoire", () => {
    expect(addressSchema.safeParse({ label: "Maison", address_line: "Porte 3", contact_phone: "70000000" }).success).toBe(false);
  });
  it("stock : quantités entières positives", () => {
    expect(stockSchema.safeParse({ quantity: "5", price_xof: "", is_available: "on" }).success).toBe(true);
    expect(stockSchema.safeParse({ quantity: "-1" }).success).toBe(false);
    expect(stockSchema.safeParse({ quantity: "2.5" }).success).toBe(false);
  });
  it("horaires d'ouverture", () => {
    const fd = new FormData();
    fd.set("open_mon", "08:00");
    fd.set("close_mon", "20:00");
    expect(parseOpeningHours(fd)).toEqual({ mon: [["08:00", "20:00"]] });
    fd.set("close_tue", "20:00");
    fd.set("open_tue", "8h");
    expect(() => parseOpeningHours(fd)).toThrow(/Mardi/);
  });
  it("messages d'erreur compréhensibles", () => {
    expect(humanizeError({ message: "PP409: stock insuffisant pour X" })).toBe("stock insuffisant pour X");
    expect(humanizeError({ message: "TypeError: fetch failed" })).toMatch(/réseau/);
    expect(humanizeError({ message: "new row violates row-level security policy" })).toBe("Action non autorisée.");
  });
  it("empêche les redirections ouvertes", () => {
    expect(safeNext("/compte")).toBe("/compte");
    expect(safeNext("//evil.com")).toBe("/");
    expect(safeNext("https://evil.com")).toBe("/");
    expect(safeNext("/\\evil.com")).toBe("/");
  });
});

import { isLimited, rateLimit, recordFailure } from "@/lib/rate-limit";
describe("limitation de débit", () => {
  it("bloque au-delà de la limite dans la fenêtre", () => {
    const k = `t-${Math.random()}`;
    expect([1, 2, 3].map(() => rateLimit(k, 2, 60_000))).toEqual([true, true, false]);
  });
  it("seuls les échecs comptent pour la connexion", () => {
    const k = `f-${Math.random()}`;
    for (let i = 0; i < 3; i++) recordFailure(k);
    expect(isLimited(k, 3, 60_000)).toBe(true);
    expect(isLimited(`${k}-autre`, 3, 60_000)).toBe(false);
  });
});
