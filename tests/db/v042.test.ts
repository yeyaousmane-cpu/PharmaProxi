/** 0.42 : 8 programmes de prévention ; fiches de départ en relecture, jamais publiques sans validation. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildWorld, createTestDb, Db, expectError, q, sys, World, hasDb } from "./helpers";

describe.skipIf(!hasDb)("Version 0.42 — programmes de prévention", () => {
  let db: Db; let w: World;
  beforeAll(async () => { db = await createTestDb(); w = await buildWorld(db); }, 120_000);
  afterAll(async () => db?.close());

  it("8 programmes publics avec leur source de référence ; nom national seulement avec source", async () => {
    const r = (await q(db, null, "select slug, reference_url, national_program from public.prevention_programs order by sort_order")).rows;
    expect(r.map((x) => x.slug)).toEqual(["paludisme", "vaccination", "grossesse-nouveau-ne", "nutrition-enfant", "hypertension-diabete", "vih-ist-hepatites", "tuberculose", "eau-hygiene-cholera"]);
    expect(r.every((x) => x.reference_url.startsWith("https://www.who.int/") && x.national_program === null)).toBe(true);
    await expectError(q(db, w.admin, "select public.admin_prevention_program('paludisme', 'Programme national', null)"), /lien vers sa source/);
    await expectError(q(db, w.customerA, "select public.admin_prevention_program('paludisme', 'X', 'https://x.ml')"), /administrat|réservé|PP403/);
  });

  it("fiches de départ en relecture, sourcées, invisibles du public", async () => {
    const s = (await sys(db, "select count(*)::int n, count(*) filter (where status = 'in_review')::int r from public.health_articles where program_slug is not null")).rows[0];
    expect(s).toEqual({ n: 8, r: 8 });
    expect((await sys(db, "select count(*)::int n from public.health_sources s join public.health_articles a on a.id = s.article_id where a.program_slug is not null")).rows[0].n).toBe(8);
    expect((await q(db, null, "select count(*)::int n from public.health_articles where program_slug is not null")).rows[0].n).toBe(0);
    const o = (await q(db, null, "select public.prevention_program_overview('paludisme') o")).rows[0].o;
    expect(o.fiches_publiees).toEqual([]); expect(o.fiches_en_validation).toBe(1);
  });
});
