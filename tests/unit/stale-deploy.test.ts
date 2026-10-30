import { describe, expect, it } from "vitest";
import { isStaleDeploy } from "@/lib/stale-deploy";

describe("mise à jour du site pendant la navigation", () => {
  it("reconnaît une action d'une ancienne version", () => {
    expect(isStaleDeploy(new Error('Failed to find Server Action "60bd". This request might be from an older or newer deployment.'))).toBe(true);
    expect(isStaleDeploy(new Error("Server Action \"x\" was not found on the server."))).toBe(true);
    expect(isStaleDeploy(new Error("ChunkLoadError: Loading chunk 12 failed"))).toBe(true);
    expect(isStaleDeploy(new Error("fetch failed"))).toBe(false);
  });
});
