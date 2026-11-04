import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("chiffrement des fichiers de santé", () => {
  beforeAll(() => { process.env.FEMME_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64"); });
  it("chiffre puis déchiffre à l'identique, et le stockage ne contient pas le fichier en clair", async () => {
    const { sealFile, openFile } = await import("@/lib/health-crypto");
    const pdf = Buffer.from("%PDF-1.4 résultat confidentiel");
    const sealed = sealFile(pdf);
    expect(sealed.includes(Buffer.from("confidentiel"))).toBe(false);
    expect(openFile(sealed).equals(pdf)).toBe(true);
    sealed[sealed.length - 1] ^= 1;
    expect(() => openFile(sealed)).toThrow();
  });
  it("reconnaît le vrai type du fichier", async () => {
    const { sniffMime } = await import("@/lib/health-crypto");
    expect(sniffMime(Buffer.from("%PDF-1.7"))).toBe("application/pdf");
    expect(sniffMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffMime(Buffer.from("<html>"))).toBeNull();
  });
});
