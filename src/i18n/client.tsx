"use client";
import { createContext, useContext, useMemo } from "react";
import { DEFAULT_LANG, LANGUAGES, makeT, type Lang, type Messages, type T } from "./core";

const Ctx = createContext<{ lang: Lang; t: T }>({ lang: DEFAULT_LANG, t: makeT({}) });

/** Fournit la langue et les textes aux composants exécutés dans le navigateur. */
export function I18nProvider({ lang, messages, children }: { lang: Lang; messages: Messages; children: React.ReactNode }) {
  const value = useMemo(() => ({ lang, t: makeT(messages) }), [lang, messages]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useT = () => useContext(Ctx).t;
export const useLang = () => useContext(Ctx).lang;
export const useBcp47 = () => LANGUAGES[useContext(Ctx).lang].bcp47;
