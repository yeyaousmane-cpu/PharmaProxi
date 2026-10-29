/** Fiches consultées récemment, gardées uniquement sur ce téléphone (coordonnées publiques, pas de stock). */
export type RecentItem = { kind: "pharmacie" | "medecin" | "etablissement"; id: string; name: string; phone: string | null; place: string | null; href: string; at: number };
const KEY = "pp_recent";
const MAX = 15;

export function readRecent(): RecentItem[] {
  try {
    const v = JSON.parse(window.localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? (v as RecentItem[]).filter((x) => x && typeof x.id === "string" && typeof x.name === "string").slice(0, MAX) : [];
  } catch {
    return [];
  }
}

export function pushRecent(item: Omit<RecentItem, "at">) {
  try {
    const list = readRecent().filter((x) => !(x.kind === item.kind && x.id === item.id));
    list.unshift({ ...item, at: Date.now() });
    window.localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    /* stockage indisponible : sans conséquence */
  }
}

export function clearRecent() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
