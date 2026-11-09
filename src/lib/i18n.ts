import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";

/**
 * Langues nationales. Une traduction ne s'affiche que lorsqu'elle a été VALIDÉE par un relecteur
 * (table ui_translations) ; sinon, le texte français reste affiché.
 */
export const LANGS = { fr: "Français", en: "English", ar: "العربية", bm: "Bamanankan", snk: "Soninké", ff: "Fulfulde (peul)", son: "Songhay" } as const;
/** Langues qui s'écrivent de droite à gauche. */
export const RTL_LANGS: readonly string[] = ["ar"];
export type Lang = keyof typeof LANGS;
export const LANG_COOKIE = "sp_lang";

/** Textes de l'interface ouverts à la traduction (clé → français). */
export const UI_TEXTS: Record<string, string> = {
  "nav.medicaments": "Médicaments",
  "nav.pharmacies": "Pharmacies",
  "nav.medecins": "Médecins",
  "nav.rendez_vous": "Rendez-vous",
  "nav.sante": "Santé",
  "nav.services": "Services",
  "nav.urgences": "Urgences",
  "nav.sos": "SOS Santé",
  "home.question": "Quel médicament recherchez-vous ?",
  "home.intro": "Pharmacies et médicaments, médecins, laboratoires, urgences et votre dossier santé : trouvez le bon soin près de chez vous.",
  "sos.title": "SOS Santé",
  "sos.intro": "En cas d'urgence vitale, allez immédiatement au service d'urgence le plus proche ou appelez les secours.",
  "sos.call": "Appeler les urgences",
  "sos.first_aid": "Gestes de premiers secours",
  "sos.duty": "Pharmacies de garde",
  "sos.card": "Ma fiche d'urgence",
  "sos.blood": "Besoin urgent de sang",
  "sos.nearest": "Services d'urgence et ambulances",
  "espace.title": "Mon espace santé",
  "famille.title": "Santé de ma famille",
};

export async function getLang(): Promise<Lang> {
  const v = (await cookies()).get(LANG_COOKIE)?.value;
  return v && v in LANGS ? (v as Lang) : "fr";
}

const loadValidated = cache(async (lang: Lang): Promise<Record<string, string>> => {
  if (lang === "fr" || !isSupabaseConfigured()) return {};
  const supabase = await createClient();
  const { data } = await supabase.from("ui_translations").select("key, text").eq("lang", lang).eq("status", "valide");
  return Object.fromEntries((data ?? []).map((r) => [r.key as string, r.text as string]));
});

/** Renvoie la traduction validée dans la langue choisie, sinon le français. */
export async function getT() {
  const lang = await getLang();
  const tr = await loadValidated(lang);
  return (key: keyof typeof UI_TEXTS | string) => tr[key] ?? UI_TEXTS[key] ?? key;
}

/** Langues ajoutées en 0.26 : proposées seulement quand assez de textes ont été validés par un traducteur humain. */
export const GATED_LANGS: readonly string[] = ["en", "ar"];
export const GATE_MIN_VALIDATED = 10;

/** Nombre de textes validés par langue (pour décider de proposer une langue et le sens de lecture). */
export const validatedCounts = cache(async (): Promise<Record<string, number>> => {
  if (!isSupabaseConfigured()) return {};
  const supabase = await createClient();
  const { data } = await supabase.from("ui_translations").select("lang").eq("status", "valide");
  const out: Record<string, number> = {};
  for (const r of data ?? []) out[r.lang as string] = (out[r.lang as string] ?? 0) + 1;
  return out;
});

/** Langue effective et sens d'écriture pour la balise <html>. */
export async function htmlLangDir() {
  const lang = await getLang();
  const counts = await validatedCounts();
  const usable = !GATED_LANGS.includes(lang) || (counts[lang] ?? 0) >= GATE_MIN_VALIDATED;
  const effective = usable ? lang : "fr";
  return { lang: effective, dir: RTL_LANGS.includes(effective) ? "rtl" as const : "ltr" as const };
}
