/**
 * Format texte simple pour l'espace de rédaction (pas de JSON à écrire) :
 *  - FAQ : blocs séparés par une ligne vide, « Q : question » puis « R : réponse »
 *  - Idées reçues : blocs « Idée : … » puis « Vérité : … »
 *  - Sources : une par ligne, « Titre | Organisme | Lien | Date de publication | Date de consultation (AAAA-MM-JJ) »
 */
export type Faq = { q: string; r: string };
export type Myth = { idee: string; verite: string };
export type Source = { title: string; organization: string; url: string; published_on: string; accessed_on: string };

const blocks = (t: string) => t.replace(/\r/g, "").split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
function pair(block: string, a: RegExp, b: RegExp): [string, string] | null {
  const ia = block.search(a);
  const ib = block.search(b);
  if (ia < 0 || ib < 0 || ib < ia) return null;
  const first = block.slice(ia, ib).replace(a, "").trim();
  const second = block.slice(ib).replace(b, "").trim();
  return first && second ? [first, second] : null;
}

export function parseFaq(t: string): { items: Faq[]; errors: number } {
  let errors = 0;
  const items = blocks(t).flatMap((bl) => {
    const p = pair(bl, /^\s*Q\s*[:：]\s*/im, /^\s*R\s*[:：]\s*/im);
    if (!p) { errors++; return []; }
    return [{ q: p[0], r: p[1] }];
  });
  return { items, errors };
}
export const formatFaq = (items: Faq[]) => items.map((x) => `Q : ${x.q}\nR : ${x.r}`).join("\n\n");

export function parseMyths(t: string): { items: Myth[]; errors: number } {
  let errors = 0;
  const items = blocks(t).flatMap((bl) => {
    const p = pair(bl, /^\s*Id[ée]e\s*[:：]\s*/im, /^\s*V[ée]rit[ée]\s*[:：]\s*/im);
    if (!p) { errors++; return []; }
    return [{ idee: p[0], verite: p[1] }];
  });
  return { items, errors };
}
export const formatMyths = (items: Myth[]) => items.map((x) => `Idée : ${x.idee}\nVérité : ${x.verite}`).join("\n\n");

export function parseSources(t: string, today: string): { items: Source[]; errors: string[] } {
  const errors: string[] = [];
  const items = t.replace(/\r/g, "").split("\n").map((l) => l.trim()).filter(Boolean).flatMap((line, i) => {
    const [title = "", organization = "", url = "", published_on = "", accessed_on = ""] = line.split("|").map((x) => x.trim());
    if (title.length < 3 || organization.length < 2) { errors.push(`ligne ${i + 1} : titre et organisme obligatoires`); return []; }
    if (url && !/^https?:\/\//i.test(url)) { errors.push(`ligne ${i + 1} : le lien doit commencer par http`); return []; }
    if (accessed_on && !/^\d{4}-\d{2}-\d{2}$/.test(accessed_on)) { errors.push(`ligne ${i + 1} : date de consultation au format AAAA-MM-JJ`); return []; }
    return [{ title, organization, url, published_on, accessed_on: accessed_on || today }];
  });
  return { items, errors };
}
export const formatSources = (items: { title: string; organization: string; url: string | null; published_on: string | null; accessed_on: string }[]) =>
  items.map((s) => [s.title, s.organization, s.url ?? "", s.published_on ?? "", s.accessed_on].join(" | ")).join("\n");

/** Identifiant d'adresse à partir d'un titre : « Groupe sanguin ABO » → « groupe-sanguin-abo ». */
export const slugify = (t: string) =>
  t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/['’]/g, "-").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 90);
