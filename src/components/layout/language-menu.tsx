"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Languages, Undo2 } from "lucide-react";
import { chooseLanguage } from "@/app/actions/v027";
import { LANGUAGES, MAIN_LANGS, dirOf, type Lang } from "@/i18n/core";
import { useLang, useT } from "@/i18n/client";
import { cn } from "@/lib/utils";

const NATIONAL: Lang[] = ["bm", "snk", "ff", "son"];

/**
 * Sélecteur de langue. Le changement est immédiat (sens d'écriture compris), sans rechargement complet :
 * la page est simplement re-rendue, la session et ce que vous avez déjà saisi dans les formulaires sont conservés.
 */
export function LanguageMenu({ prev, compact = false }: { prev?: Lang | null; compact?: boolean }) {
  const lang = useLang();
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const onClick = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("keydown", onKey); window.addEventListener("mousedown", onClick);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("mousedown", onClick); };
  }, [open]);

  const pick = (l: Lang) => {
    setOpen(false);
    if (l === lang) return;
    document.documentElement.lang = l;
    document.documentElement.dir = dirOf(l);
    start(async () => { await chooseLanguage(l); router.refresh(); });
  };

  const item = (l: Lang, sub?: string) => (
    <li key={l}>
      <button type="button" role="menuitemradio" aria-checked={l === lang} lang={l} dir={dirOf(l)} onClick={() => pick(l)}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-start text-sm hover:bg-muted">
        <span className="w-9 shrink-0 font-mono text-xs font-bold text-muted-foreground" dir="ltr">{LANGUAGES[l].short}</span>
        <span className="flex-1"><span className="font-medium">{LANGUAGES[l].label}</span>{sub && <span className="block text-xs text-muted-foreground">{sub}</span>}</span>
        {l === lang && <Check className="size-4 text-primary" aria-hidden />}
      </button>
    </li>
  );

  return (
    <div ref={box} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} aria-label={t("lang.current", { lang: LANGUAGES[lang].label })}
        className={cn("flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold hover:bg-muted", pending && "opacity-60")}>
        <Languages className="size-5" aria-hidden />
        <span dir="ltr" className={compact ? "sr-only sm:not-sr-only" : undefined}>{LANGUAGES[lang].short}</span>
      </button>
      {open && (
        <div role="menu" aria-label={t("lang.choose")} className="absolute end-0 top-full z-50 mt-1 w-72 rounded-2xl border bg-white p-2 shadow-lg">
          <ul>{MAIN_LANGS.map((l) => item(l))}</ul>
          <p className="mt-2 border-t px-3 pb-1 pt-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">{t("lang.national")}</p>
          <ul>{NATIONAL.map((l) => item(l))}</ul>
          {prev && prev !== lang && (
            <button type="button" onClick={() => pick(prev)} className="mt-1 flex w-full items-center gap-2 rounded-lg border-t px-3 py-2 text-start text-sm text-primary hover:bg-muted">
              <Undo2 className="size-4 rtl:-scale-x-100" aria-hidden /> {t("lang.back", { lang: LANGUAGES[prev].label })}
            </button>
          )}
          <a href="/langues" className="block rounded-lg px-3 py-2 text-xs text-muted-foreground underline hover:bg-muted">{t("lang.more")}</a>
        </div>
      )}
    </div>
  );
}
