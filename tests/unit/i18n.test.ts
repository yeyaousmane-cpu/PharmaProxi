import { describe, expect, it } from "vitest";
import { DICTIONARIES } from "@/i18n/dictionaries";
import { LANGUAGES, dirOf, format, makeT, messagesFor, missingKeys } from "@/i18n/core";

describe("dictionnaires", () => {
  it("anglais et arabe couvrent toutes les clés françaises", () => {
    expect(missingKeys("en")).toEqual([]);
    expect(missingKeys("ar")).toEqual([]);
  });
  it("aucune clé en trop (faute de frappe) hors du français", () => {
    const fr = new Set(Object.keys(DICTIONARIES.fr));
    for (const l of ["en", "ar"] as const) expect(Object.keys(DICTIONARIES[l]).filter((k) => !fr.has(k))).toEqual([]);
  });
  it("les variables {x} sont conservées dans chaque traduction", () => {
    const vars = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(",");
    for (const [k, v] of Object.entries(DICTIONARIES.fr)) {
      expect(vars(DICTIONARIES.en[k as keyof typeof DICTIONARIES.en]), `en:${k}`).toBe(vars(v));
      expect(vars(DICTIONARIES.ar[k as keyof typeof DICTIONARIES.ar]), `ar:${k}`).toBe(vars(v));
    }
  });
  it("l'arabe contient bien de l'écriture arabe", () => {
    expect(Object.values(DICTIONARIES.ar).filter((s) => /[؀-ۿ]/.test(s)).length).toBeGreaterThan(Object.keys(DICTIONARIES.ar).length * 0.9);
  });
});

describe("résolution", () => {
  it("sens d'écriture", () => { expect(dirOf("ar")).toBe("rtl"); expect(dirOf("fr")).toBe("ltr"); expect(dirOf("en")).toBe("ltr"); });
  it("langue nationale : français par défaut, traduction validée prioritaire", () => {
    const m = messagesFor("bm", { "nav.pharmacies": "Furakɛsow" });
    expect(m["nav.pharmacies"]).toBe("Furakɛsow");
    expect(m["nav.medecins"]).toBe(DICTIONARIES.fr["nav.medecins"]);
  });
  it("clé inconnue : repli sur la clé ; variables remplacées", () => {
    const t = makeT(messagesFor("en"));
    expect(t("inexistante.cle")).toBe("inexistante.cle");
    expect(t("listen.progress", { n: 2, total: 5 })).toBe("Passage 2 of 5");
    expect(format("{a}-{b}", { a: 1 })).toBe("1-{b}");
  });
  it("toutes les langues déclarées ont un code BCP 47", () => { for (const l of Object.values(LANGUAGES)) expect(l.bcp47).toBeTruthy(); });
});
