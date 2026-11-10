import { Languages } from "lucide-react";
import { setLanguage } from "@/app/actions/v023";
import { getLang, getT } from "@/lib/i18n";
import { LANGUAGES, type Lang } from "@/i18n/core";

/** Choix de la langue dans le pied de page (fonctionne aussi sans JavaScript). */
export async function LanguageSwitch() {
  const [lang, t] = await Promise.all([getLang(), getT()]);
  return (
    <form action={setLanguage} className="mt-3 flex flex-wrap items-center gap-2 text-xs">
      <Languages className="size-4 text-muted-foreground" aria-hidden />
      <label htmlFor="lang" className="sr-only">{t("lang.label")}</label>
      <select id="lang" name="lang" defaultValue={lang} className="h-8 rounded-lg border bg-white px-2">
        {(Object.keys(LANGUAGES) as Lang[]).map((l) => <option key={l} value={l} lang={l}>{LANGUAGES[l].short} · {LANGUAGES[l].label}</option>)}
      </select>
      <button type="submit" className="h-8 rounded-lg border px-2 font-semibold hover:border-primary">OK</button>
      {lang !== "fr" && <span className="w-full text-muted-foreground">{t("lang.partial")}</span>}
    </form>
  );
}
