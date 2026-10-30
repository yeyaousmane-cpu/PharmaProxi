import { describe, expect, it } from "vitest";
import { formatFaq, formatMyths, formatSources, parseFaq, parseMyths, parseSources, slugify } from "@/lib/health/parse";

describe("format de rédaction", () => {
  it("FAQ : aller-retour, réponses sur plusieurs lignes, blocs invalides comptés", () => {
    const t = "Q : Le palu est-il contagieux ?\nR : Non.\nIl se transmet par le moustique.\n\nQ: Faut-il dormir sous moustiquaire ?\nR: Oui.\n\nUne ligne sans format";
    const r = parseFaq(t);
    expect(r.items).toEqual([{ q: "Le palu est-il contagieux ?", r: "Non.\nIl se transmet par le moustique." }, { q: "Faut-il dormir sous moustiquaire ?", r: "Oui." }]);
    expect(r.errors).toBe(1);
    expect(parseFaq(formatFaq(r.items)).items).toEqual(r.items);
  });
  it("idées reçues avec ou sans accents", () => {
    const r = parseMyths("Idee : Le groupe O est meilleur.\nVerite : Faux.\n\nIdée : X\nVérité : Y");
    expect(r.items).toEqual([{ idee: "Le groupe O est meilleur.", verite: "Faux." }, { idee: "X", verite: "Y" }]);
    expect(parseMyths(formatMyths(r.items)).items).toEqual(r.items);
  });
  it("sources : colonnes, date du jour par défaut, erreurs explicites", () => {
    const r = parseSources("Aide-mémoire | OMS | https://who.int/x | 2024 |\nTitre | Org | ftp://x\nSeul\nA | B |  |  | 29/10/2026", "2026-10-29");
    expect(r.items).toEqual([{ title: "Aide-mémoire", organization: "OMS", url: "https://who.int/x", published_on: "2024", accessed_on: "2026-10-29" }]);
    expect(r.errors).toHaveLength(3);
    expect(formatSources([{ ...r.items[0], url: null, published_on: null }])).toBe("Aide-mémoire | OMS |  |  | 2026-10-29");
  });
  it("identifiant d'adresse", () => {
    expect(slugify("Électrophorèse de l'hémoglobine")).toBe("electrophorese-de-l-hemoglobine");
    expect(slugify("  VIH : dépistage ? ")).toBe("vih-depistage");
  });
});
