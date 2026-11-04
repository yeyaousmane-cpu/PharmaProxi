import { Languages } from "lucide-react";
import { setLanguage } from "@/app/actions/v023";
import { getLang, LANGS, type Lang } from "@/lib/i18n";

/** Choix de la langue : les textes non encore traduits et validés restent en français. */
export async function LanguageSwitch() {
  const lang = await getLang();
  return (
    <form action={setLanguage} className="mt-3 flex flex-wrap items-center gap-2 text-xs">
      <Languages className="size-4 text-muted-foreground" aria-hidden />
      <label htmlFor="lang" className="sr-only">Langue</label>
      <select id="lang" name="lang" defaultValue={lang} className="h-8 rounded-lg border bg-white px-2">
        {(Object.keys(LANGS) as Lang[]).map((l) => <option key={l} value={l}>{LANGS[l]}</option>)}
      </select>
      <button type="submit" className="h-8 rounded-lg border px-2 font-semibold hover:border-primary">OK</button>
      {lang !== "fr" && <span className="w-full text-muted-foreground">Traduction en cours : les textes pas encore relus restent en français.</span>}
    </form>
  );
}
