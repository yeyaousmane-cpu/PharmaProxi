import { describe, expect, it } from "vitest";
import { GROUPS, TOPICS } from "@/lib/droits";

const texts = (t: (typeof TOPICS)[number]) => [t.summary, ...t.keyFacts, ...t.blocks.flatMap((b) => ("p" in b ? [b.p] : "ul" in b ? b.ul : "ol" in b ? b.ol : "note" in b ? [b.note] : "h" in b ? [b.h] : b.table.rows.flat()))];

describe("Rubrique « Vos droits »", () => {
  it("slugs uniques et groupes connus", () => {
    expect(new Set(TOPICS.map((t) => t.slug)).size).toBe(TOPICS.length);
    for (const t of TOPICS) expect(GROUPS.map((g) => g.key)).toContain(t.group);
  });
  it("chaque fiche juridique ou chiffrée cite au moins une source", () => {
    for (const t of TOPICS) if (texts(t).some((x) => /\d/.test(x))) expect(t.sources.length, t.slug).toBeGreaterThan(0);
  });
  it("gras équilibré", () => {
    for (const t of TOPICS) for (const x of texts(t)) expect((x.match(/\*\*/g) ?? []).length % 2, `${t.slug}: ${x}`).toBe(0);
  });
  it("lignes de tableau complètes", () => {
    for (const t of TOPICS) for (const b of t.blocks) if ("table" in b) for (const r of b.table.rows) expect(r.length).toBe(b.table.head.length);
  });
});
