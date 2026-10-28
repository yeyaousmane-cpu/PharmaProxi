export const PAGE_SIZE = 25;

/** Lit ?page= et calcule la plage à demander à la base (bornée). */
export function pageRange(raw: string | undefined, size = PAGE_SIZE) {
  const page = Math.max(1, Math.min(10_000, Number.parseInt(raw ?? "1", 10) || 1));
  return { page, from: (page - 1) * size, to: page * size - 1, size };
}
