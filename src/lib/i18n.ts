import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { DICTIONARIES } from "@/i18n/dictionaries";
import { DEFAULT_LANG, LANG_COOKIE, LANGUAGES, PREV_LANG_COOKIE, dirOf, isLang, makeT, messagesFor, type Lang, type Messages } from "@/i18n/core";

export { LANG_COOKIE, PREV_LANG_COOKIE, type Lang } from "@/i18n/core";

/** Libellés des langues (compatibilité 0.23–0.26). */
export const LANGS: Record<Lang, string> = Object.fromEntries(Object.entries(LANGUAGES).map(([k, v]) => [k, v.label])) as Record<Lang, string>;
export const RTL_LANGS: readonly string[] = (Object.keys(LANGUAGES) as Lang[]).filter((l) => dirOf(l) === "rtl");
/** Tous les textes de l'interface (clé → français), proposés à la traduction dans Administration → Traductions. */
export const UI_TEXTS: Record<string, string> = DICTIONARIES.fr;

export const getLang = cache(async (): Promise<Lang> => {
  const v = (await cookies()).get(LANG_COOKIE)?.value;
  return isLang(v) ? v : DEFAULT_LANG;
});
export const getPrevLang = cache(async (): Promise<Lang | null> => {
  const v = (await cookies()).get(PREV_LANG_COOKIE)?.value;
  return isLang(v) ? v : null;
});

/** Traductions validées par un relecteur humain : elles priment sur les dictionnaires. */
const loadValidated = cache(async (lang: Lang): Promise<Messages> => {
  if (lang === "fr" || !isSupabaseConfigured()) return {};
  try {
    const supabase = await createClient();
    const { data } = await supabase.from("ui_translations").select("key, text").eq("lang", lang).eq("status", "valide");
    return Object.fromEntries((data ?? []).map((r) => [r.key as string, r.text as string]));
  } catch { return {}; }
});

export const getMessages = cache(async (): Promise<{ lang: Lang; messages: Messages }> => {
  const lang = await getLang();
  return { lang, messages: messagesFor(lang, await loadValidated(lang)) };
});

/** Fonction de traduction côté serveur. */
export async function getT() {
  const { messages } = await getMessages();
  return makeT(messages);
}

/** Nombre de textes validés par langue (administration des traductions). */
export const validatedCounts = cache(async (): Promise<Record<string, number>> => {
  if (!isSupabaseConfigured()) return {};
  const supabase = await createClient();
  const { data } = await supabase.from("ui_translations").select("lang").eq("status", "valide");
  const out: Record<string, number> = {};
  for (const r of data ?? []) out[r.lang as string] = (out[r.lang as string] ?? 0) + 1;
  return out;
});

/** Langue et sens d'écriture pour la balise <html>. */
export async function htmlLangDir() {
  const lang = await getLang();
  return { lang, dir: dirOf(lang) };
}
