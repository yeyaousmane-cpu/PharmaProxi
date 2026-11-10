import { describe, expect, it } from "vitest";
import { detectLang, interpret } from "@/lib/speech/intents";
import { splitPassages } from "@/lib/speech/providers";

const hrefs = (s: string) => interpret(s).intents.map((i) => i.href);

describe("interprétation des demandes", () => {
  it("exemples du cahier des charges (français)", () => {
    expect(hrefs("Je cherche une pharmacie à Bamako")).toContain("/pharmacies?q=bamako");
    expect(hrefs("Je voudrais prendre rendez-vous avec un médecin")).toEqual(expect.arrayContaining(["/rendez-vous", "/medecins"]));
    expect(hrefs("Où se trouve le centre de santé le plus proche ?")).toContain("/cliniques");
    expect(hrefs("Je veux consulter mes rendez-vous")[0]).toBe("/compte/rendez-vous");
    expect(hrefs("Comment accéder à mon dossier de santé ?")).toContain("/ma-sante/dossier");
    expect(hrefs("Je cherche un laboratoire d'analyses")).toContain("/laboratoires");
  });
  it("anglais et arabe", () => {
    expect(hrefs("I am looking for a pharmacy")).toContain("/pharmacies");
    expect(hrefs("أبحث عن صيدلية مناوبة في باماكو")).toEqual(expect.arrayContaining(["/garde", "/pharmacies"]));
    expect(hrefs("أريد حجز موعد مع طبيب")).toEqual(expect.arrayContaining(["/rendez-vous", "/medecins"]));
    expect(hrefs("أبحث عن مختبر تحاليل")).toContain("/laboratoires");
  });
  it("recherche de médicament", () => { expect(hrefs("je cherche du paracétamol")).toContain("/recherche?q=paracetamol"); });
  it("actions sensibles signalées, jamais exécutées", () => {
    const r = interpret("je veux annuler mon rendez-vous");
    expect(r.intents[0]).toMatchObject({ href: "/compte/rendez-vous", sensitive: true });
  });
  it("urgence vitale en premier ; question médicale orientée vers un professionnel", () => {
    const u = interpret("mon père ne respire plus");
    expect(u.urgent).toBe(true); expect(u.intents[0].href).toBe("/sos");
    const m = interpret("quel médicament prendre pour la fièvre");
    expect(m.medical).toBe(true); expect(m.intents.map((i) => i.href)).toEqual(expect.arrayContaining(["/questions-pharmacien", "/medecins"]));
  });
  it("détection de langue", () => { expect(detectLang("أريد طبيبا")).toBe("ar"); expect(detectLang("I need a doctor near me")).toBe("en"); expect(detectLang("je cherche un médecin")).toBe("fr"); });
  it("découpage en passages", () => {
    expect(splitPassages("Un.\n\nDeux.")).toEqual(["Un.", "Deux."]);
    expect(splitPassages("A. ".repeat(200), 50).every((p) => p.length <= 50)).toBe(true);
  });
});
