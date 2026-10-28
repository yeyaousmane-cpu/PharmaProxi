import { describe, expect, it } from "vitest";
import { parseInventoryCsv, toCsv } from "@/lib/csv";

describe("import CSV du stock", () => {
  it("valide les colonnes obligatoires", () => {
    const r = parseInventoryCsv("nom;prix\nX;1");
    expect(r.missingColumns).toEqual(["nom_commercial", "quantite"]);
  });
  it("accepte « ; » ou « , », accents et BOM, et signale les lignes invalides", () => {
    const text = "﻿Nom commercial;Quantité;Prix FCFA;Disponible\nParacétamol;10;1 500;oui\nIbu;abc;100;\nZinc;5;;non\nAmox;3;12,5;peut-être";
    const r = parseInventoryCsv(text);
    expect(r.missingColumns).toEqual([]);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toMatchObject({ brand_name: "Paracétamol", quantity: 10, price_xof: 1500, is_available: true });
    expect(r.rows[1]).toMatchObject({ brand_name: "Zinc", quantity: 5, price_xof: "", is_available: false });
    expect(r.errors.map((e) => e.row)).toEqual([3, 5]);
    expect(r.errors[0].error).toMatch(/nom_commercial|quantite/);
  });
  it("limite la taille de l'import", () => {
    const text = "nom_commercial,quantite\n" + Array.from({ length: 5 }, (_, i) => `P${i}xx,1`).join("\n");
    expect(parseInventoryCsv(text, 3).errors[0].error).toMatch(/3 lignes maximum/);
  });
  it("produit un CSV exploitable par Excel (BOM, « ; »)", () => {
    const csv = toCsv([{ a: "x;y", b: 2 }], ["a", "b"]);
    expect(csv.startsWith("﻿a;b")).toBe(true);
    expect(csv).toContain('"x;y";2');
  });
});
