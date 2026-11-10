"use client";
import { useEffect, useState } from "react";
import { browserStt, browserTts } from "@/lib/speech/providers";
import { useT } from "@/i18n/client";

/** Vérifie réellement, sur l'appareil de la personne, si une voix de lecture et la reconnaissance vocale existent. */
export function DeviceCheck({ lang, kind }: { lang: string; kind: "tts" | "stt" }) {
  const t = useT();
  const [state, setState] = useState<"checking" | "yes" | "no">("checking");
  useEffect(() => {
    let alive = true;
    if (kind === "stt") setState(browserStt.supported() ? "yes" : "no");
    else if (!browserTts.supported()) setState("no");
    else browserTts.voices(lang).then((v) => { if (alive) setState(v.length ? "yes" : "no"); });
    return () => { alive = false; };
  }, [lang, kind]);
  if (state === "checking") return <span className="text-muted-foreground">{t("state.loading")}</span>;
  return state === "yes" ? <span className="font-semibold text-emerald-800">✓ {t("langs.yes")}</span> : <span className="text-muted-foreground">✗ {t("langs.no")}</span>;
}
