import { afterEach, describe, expect, it } from "vitest";
import { DEMO_ACTORS, isDemoEnv } from "@/lib/demo";

const keep = { ...process.env };
afterEach(() => { process.env = { ...keep }; });

describe("environnement de démonstration", () => {
  it("jamais actif sur la base de production, même si APP_ENV=demo", () => {
    process.env.APP_ENV = "demo";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://eumohajgsvxibleepfrd.supabase.co";
    expect(isDemoEnv()).toBe(false);
  });
  it("actif seulement avec APP_ENV=demo sur une autre base", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://autreprojetdemo.supabase.co";
    process.env.APP_ENV = "production"; expect(isDemoEnv()).toBe(false);
    process.env.APP_ENV = "demo"; expect(isDemoEnv()).toBe(true);
  });
  it("tous les comptes fictifs utilisent un domaine non délivrable", () => {
    for (const a of DEMO_ACTORS) expect(a.email).toMatch(/@pharmaproxi\.invalid$/);
    expect(new Set(DEMO_ACTORS.map((a) => a.key)).size).toBe(DEMO_ACTORS.length);
  });
});
