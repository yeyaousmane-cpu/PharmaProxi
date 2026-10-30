/** Assistant santé : compteur journalier anonyme et plafond. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildWorld, createTestDb, Db, expectError, hasDb, q, sys, World } from "./helpers";

describe.skipIf(!hasDb)("Assistant santé", () => {
  let db: Db;
  let w: World;
  beforeAll(async () => { db = await createTestDb(); w = await buildWorld(db); }, 120_000);
  afterAll(async () => db?.close());

  it("compte les questions, applique le plafond, réserve le compteur au serveur et la lecture à l'administration", async () => {
    const count = (kind: string, limit: number) => sys(db, "select public.assistant_count($1, $2) as ok", [kind, limit]).then((r) => r.rows[0].ok);
    expect(await count("ai", 2)).toBe(true);
    expect(await count("ai", 2)).toBe(true);
    expect(await count("ai", 2)).toBe(false);
    expect(await count("emergency", 0)).toBe(true);
    const row = (await sys(db, "select requests, emergencies, refused from public.assistant_usage")).rows[0];
    expect(row).toEqual({ requests: 2, emergencies: 1, refused: 1 });
    await expectError(q(db, null, "select public.assistant_count('ai', 100)"), /permission denied/);
    await expectError(q(db, w.customerA, "select public.assistant_count('ai', 100)"), /permission denied/);
    expect((await q(db, w.customerA, "select count(*)::int as n from public.assistant_usage")).rows[0].n).toBe(0);
    expect((await q(db, w.admin, "select count(*)::int as n from public.assistant_usage")).rows[0].n).toBe(1);
    // Aucune colonne ne peut contenir de texte de conversation
    const cols = (await sys(db, "select column_name from information_schema.columns where table_schema='public' and table_name='assistant_usage' order by 1")).rows.map((r) => r.column_name);
    expect(cols).toEqual(["day", "emergencies", "refused", "requests"]);
  });
});
