/**
 * Cœur du système de langues (utilisable côté serveur et côté navigateur).
 *
 * - Trois langues d'interface complètes : français (référence), anglais, arabe (droite à gauche).
 * - Langues nationales : seules les traductions VALIDÉES par un relecteur humain (table ui_translations)
 *   s'affichent ; tout le reste retombe sur le français.
 * - Ordre de résolution d'un texte : traduction validée en base → dictionnaire de la langue → français → clé.
 * - Ajouter une langue = l'ajouter à LANGUAGES puis compléter les dictionnaires (ou la saisir dans
 *   Administration → Traductions) ; aucun composant n'est à réécrire.
 */
import { DICTIONARIES } from "./dictionaries";

export const LANGUAGES = {
  fr: { label: "Français", short: "FR", dir: "ltr", bcp47: "fr-FR", ui: "complete" },
  en: { label: "English", short: "EN", dir: "ltr", bcp47: "en-GB", ui: "complete" },
  ar: { label: "العربية", short: "AR", dir: "rtl", bcp47: "ar", ui: "complete" },
  bm: { label: "Bamanankan", short: "BM", dir: "ltr", bcp47: "bm", ui: "validated_only" },
  snk: { label: "Soninké", short: "SNK", dir: "ltr", bcp47: "snk", ui: "validated_only" },
  ff: { label: "Fulfulde (peul)", short: "FF", dir: "ltr", bcp47: "ff", ui: "validated_only" },
  son: { label: "Songhay", short: "SON", dir: "ltr", bcp47: "son", ui: "validated_only" },
} as const;
export type Lang = keyof typeof LANGUAGES;
export const MAIN_LANGS: readonly Lang[] = ["fr", "en", "ar"];
export const DEFAULT_LANG: Lang = "fr";
export const LANG_COOKIE = "sp_lang";
export const PREV_LANG_COOKIE = "sp_lang_prev";

export const isLang = (v: unknown): v is Lang => typeof v === "string" && Object.prototype.hasOwnProperty.call(LANGUAGES, v);
export const dirOf = (l: Lang) => LANGUAGES[l].dir;

export type MessageKey = keyof typeof DICTIONARIES.fr;
export type Messages = Record<string, string>;

/** Remplace {nom} par la valeur fournie. */
export function format(text: string, vars?: Record<string, string | number>) {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/** Dictionnaire effectif d'une langue : français en socle, puis la langue, puis les traductions validées. */
export function messagesFor(lang: Lang, validated: Messages = {}): Messages {
  const base = DICTIONARIES.fr as Messages;
  const own = (DICTIONARIES as Record<string, Messages | undefined>)[lang] ?? {};
  return { ...base, ...own, ...validated };
}

/** Clés absentes d'une langue (sert aux tests et à la page d'administration des traductions). */
export function missingKeys(lang: Lang): string[] {
  const own = (DICTIONARIES as Record<string, Messages | undefined>)[lang] ?? {};
  return Object.keys(DICTIONARIES.fr).filter((k) => !own[k]?.trim());
}

export function makeT(messages: Messages) {
  return (key: MessageKey | string, vars?: Record<string, string | number>) => format(messages[key] ?? (DICTIONARIES.fr as Messages)[key] ?? key, vars);
}
export type T = ReturnType<typeof makeT>;
