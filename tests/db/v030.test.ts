/** 0.30 : arrondissements du District de Bamako (loi n°2023-005) — renommage sans perte de rattachement, quartiers codés. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, Db, sys, hasDb } from "./helpers";

describe.skipIf(!hasDb)("Version 0.30 — arrondissements de Bamako", () => {
  let db: Db;
  beforeAll(async () => { db = await createTestDb(); }, 120_000);
  afterAll(async () => db?.close());
  it("sept arrondissements codés, anciens noms conservés, 102 quartiers officiels", async () => {
    const a = (await sys(db, "select official_code c, name, former_name f from public.communes where official_code is not null order by 1")).rows;
    expect(a.map((r) => r.c)).toEqual(["01", "02", "03", "04", "05", "06", "07"]);
    expect(a[3]).toMatchObject({ name: "Quatrième Arrondissement", f: "Commune IV" });
    expect(a[6]).toMatchObject({ name: "Septième Arrondissement", f: null });
    expect((await sys(db, "select count(*)::int n from public.communes where name like 'Commune %' and region_id = (select id from public.regions where is_district)")).rows[0].n).toBe(0);
    expect((await sys(db, "select count(*)::int n, count(distinct official_code)::int d from public.localities where official_code ~ '^000[1-7][0-9]{4}$'")).rows[0]).toEqual({ n: 102, d: 102 });
    expect((await sys(db, "select c.official_code from public.localities l join public.communes c on c.id = l.commune_id where l.official_code = '00070003'")).rows[0].official_code).toBe("07");
  });
  it("anciennes et nouvelles écritures reconnues", async () => {
    const r = async (t: string) => (await sys(db, "select (select official_code from public.communes where id = public.resolve_commune((select id from public.regions where is_district), $1)) c", [t])).rows[0].c;
    for (const [t, c] of [["Commune IV", "04"], ["C4", "04"], ["CIV", "04"], ["commune 6", "06"], ["4e arrondissement", "04"], ["7ème Arrondissement", "07"], ["Premier Arrondissement", "01"], ["Arrondissement 2", "02"]]) expect(await r(t), t).toBe(c);
    expect(await r("Commune IX")).toBeNull();
  });
  it("migration rejouable sans doublon", async () => {
    const before = (await sys(db, "select count(*)::int n from public.localities")).rows[0].n;
    const sql = (await import("node:fs")).readFileSync("supabase/migrations/20261111000100_v030_bamako_arrondissements.sql", "utf8");
    await sys(db, sql);
    expect((await sys(db, "select count(*)::int n from public.localities")).rows[0].n).toBe(before);
    expect((await sys(db, "select count(*)::int n from public.communes where official_code is not null")).rows[0].n).toBe(7);
  });
});
