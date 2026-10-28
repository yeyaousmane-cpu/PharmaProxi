import { describe, expect, it } from "vitest";
import { buildCsp, makeNonce } from "@/lib/csp";
import { pageRange } from "@/lib/paging";

describe("politique de sécurité du contenu", () => {
  it("n'autorise que les scripts porteurs du jeton, sans 'unsafe-inline'", () => {
    const csp = buildCsp("abc123", "https://projet.supabase.co", false);
    const script = csp.split("; ").find((d) => d.startsWith("script-src"))!;
    expect(script).toBe("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("connect-src 'self' https://projet.supabase.co");
  });
  it("autorise eval uniquement en développement", () => {
    expect(buildCsp("n", "", true)).toContain("'unsafe-eval'");
    expect(buildCsp("n", "", false)).not.toContain("'unsafe-eval'");
  });
  it("génère un jeton différent à chaque requête", () => {
    const set = new Set(Array.from({ length: 100 }, makeNonce));
    expect(set.size).toBe(100);
    expect([...set][0]).toMatch(/^[A-Za-z0-9+/]{22}==$/);
  });
});

describe("pagination", () => {
  it("borne la page demandée", () => {
    expect(pageRange(undefined)).toMatchObject({ page: 1, from: 0, to: 24 });
    expect(pageRange("3", 10)).toMatchObject({ page: 3, from: 20, to: 29 });
    expect(pageRange("-5")).toMatchObject({ page: 1 });
    expect(pageRange("abc")).toMatchObject({ page: 1 });
    expect(pageRange("999999999")).toMatchObject({ page: 10000 });
  });
});
