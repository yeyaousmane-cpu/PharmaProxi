"use client";
import { useEffect, useRef, useState } from "react";
import { Headphones, Pause, Play, RotateCcw, Square } from "lucide-react";
import { browserTts, type TtsVoice } from "@/lib/speech/providers";
import { LANGUAGES, isLang } from "@/i18n/core";
import { useLang, useT } from "@/i18n/client";
import { cn } from "@/lib/utils";

type Status = "idle" | "playing" | "paused";
const RATES = [0.75, 1, 1.25, 1.5];
const BLOCKS = "h1,h2,h3,h4,p,li,dt,dd,blockquote,td";

/**
 * « Écouter » : lit à voix haute le texte d'une partie de la page avec les voix installées sur l'appareil.
 * À réserver aux contenus publics (fiches validées, aide, SOS…) : jamais aux données personnelles.
 * Rien n'est envoyé à SantéProxi ; selon la voix choisie, le navigateur peut utiliser une voix en ligne.
 */
export function ListenButton({ targetId, lang: contentLang, className }: { targetId: string; lang?: string; className?: string }) {
  const t = useT();
  const ui = useLang();
  const lang = contentLang ?? ui;
  const langLabel = isLang(lang) ? LANGUAGES[lang].label : lang;
  const [open, setOpen] = useState(false);
  const [supported, setSupported] = useState(true);
  const [voices, setVoices] = useState<TtsVoice[] | null>(null);
  const [voice, setVoice] = useState<string>("");
  const [rate, setRate] = useState(1);
  const [status, setStatus] = useState<Status>("idle");
  const [idx, setIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const parts = useRef<{ el: HTMLElement | null; text: string }[]>([]);
  const run = useRef(0);

  useEffect(() => () => { browserTts.cancel(); }, []);

  const collect = () => {
    const root = document.getElementById(targetId);
    if (!root) return [];
    const els = Array.from(root.querySelectorAll<HTMLElement>(BLOCKS)).filter((el) => !el.closest("[data-no-listen]") && !el.parentElement?.closest(BLOCKS) && el.innerText.trim().length > 1);
    const list = els.length ? els.map((el) => ({ el, text: el.innerText.replace(/\s+/g, " ").trim() })) : [{ el: root, text: root.innerText.replace(/\s+/g, " ").trim() }];
    return list.filter((p) => p.text);
  };
  const mark = (i: number | null) => {
    parts.current.forEach((p, j) => p.el?.classList.toggle("sp-reading", j === i));
    if (i !== null) parts.current[i]?.el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };

  const openPlayer = async () => {
    setOpen(true);
    if (!browserTts.supported()) { setSupported(false); return; }
    const v = await browserTts.voices(lang);
    setVoices(v);
    if (v[0]) setVoice(v[0].name);
  };

  const playFrom = (i: number) => {
    browserTts.cancel();
    parts.current = collect();
    if (!parts.current.length) return;
    const my = ++run.current;
    const v = voices?.find((x) => x.name === voice);
    const step = (j: number) => {
      if (my !== run.current) return;
      if (j >= parts.current.length) { setStatus("idle"); mark(null); setIdx(0); return; }
      setIdx(j); mark(j);
      browserTts.speak(parts.current[j].text, { lang, voice: v, rate, onEnd: () => step(j + 1), onError: () => { setError(t("listen.error")); setStatus("idle"); mark(null); } });
    };
    setError(null); setStatus("playing"); step(i);
  };
  const stop = () => { run.current++; browserTts.cancel(); setStatus("idle"); mark(null); };
  const pause = () => { browserTts.pause(); setStatus("paused"); };
  const resume = () => { browserTts.resume(); setStatus("playing"); };

  if (!open) {
    return (
      <button type="button" onClick={openPlayer} className={cn("inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-[#068132]/30 bg-white px-4 text-sm font-semibold text-[#052D1E] hover:border-[#068132] print:hidden", className)}>
        <Headphones className="size-5 text-[#068132]" aria-hidden /> {t("listen.button")}
      </button>
    );
  }
  const total = parts.current.length || collect().length;
  return (
    <div role="region" aria-label={t("listen.player")} data-no-listen className={cn("rounded-2xl border bg-white p-3 text-sm shadow-sm print:hidden", className)}>
      <p className="flex items-center gap-2 font-semibold text-[#052D1E]"><Headphones className="size-5 text-[#068132]" aria-hidden /> {t("listen.lang", { lang: langLabel })}</p>
      {!supported ? <p className="mt-2 text-muted-foreground">{t("listen.unsupported")}</p>
        : voices === null ? <p className="mt-2 text-muted-foreground">{t("state.loading")}</p>
        : voices.length === 0 ? <p className="mt-2 rounded-lg bg-amber-50 p-2 text-amber-900">{t("listen.no_voice", { lang: langLabel })}</p>
        : (
          <>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {status === "playing" ? (
                <button type="button" onClick={pause} className="inline-flex min-h-11 items-center gap-1 rounded-full bg-[#052D1E] px-4 font-semibold text-white"><Pause className="size-4" aria-hidden /> {t("listen.pause")}</button>
              ) : status === "paused" ? (
                <button type="button" onClick={resume} className="inline-flex min-h-11 items-center gap-1 rounded-full bg-[#052D1E] px-4 font-semibold text-white"><Play className="size-4 rtl:-scale-x-100" aria-hidden /> {t("listen.resume")}</button>
              ) : (
                <button type="button" onClick={() => playFrom(idx)} className="inline-flex min-h-11 items-center gap-1 rounded-full bg-[#052D1E] px-4 font-semibold text-white"><Play className="size-4 rtl:-scale-x-100" aria-hidden /> {t("listen.button")}</button>
              )}
              <button type="button" onClick={stop} disabled={status === "idle"} className="inline-flex min-h-11 items-center gap-1 rounded-full border px-3 font-semibold disabled:opacity-40"><Square className="size-4" aria-hidden /> {t("listen.stop")}</button>
              <button type="button" onClick={() => playFrom(0)} className="inline-flex min-h-11 items-center gap-1 rounded-full border px-3 font-semibold"><RotateCcw className="size-4" aria-hidden /> {t("listen.repeat")}</button>
              <label className="inline-flex items-center gap-1">{t("listen.speed")}
                <select value={rate} onChange={(e) => setRate(Number(e.target.value))} className="h-11 rounded-lg border bg-white px-2" dir="ltr">
                  {RATES.map((r) => <option key={r} value={r}>{r}×</option>)}
                </select>
              </label>
            </div>
            <label className="mt-3 block">
              <span className="text-xs text-muted-foreground" aria-live="polite">
                {status === "playing" ? t("listen.status_playing") : status === "paused" ? t("listen.status_paused") : t("listen.status_idle")} · {t("listen.progress", { n: Math.min(idx + 1, Math.max(total, 1)), total: Math.max(total, 1) })}
              </span>
              <input type="range" min={0} max={Math.max(total - 1, 0)} value={idx} aria-label={t("listen.from")}
                onChange={(e) => { const i = Number(e.target.value); setIdx(i); if (status !== "idle") playFrom(i); }} className="mt-1 w-full accent-[#068132]" />
            </label>
            {voices.length > 1 && (
              <label className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>{t("listen.voice", { voice: "" })}</span>
                <select value={voice} onChange={(e) => setVoice(e.target.value)} className="h-9 max-w-full rounded-lg border bg-white px-2">
                  {voices.map((v) => <option key={v.name} value={v.name}>{v.name} — {v.local ? t("listen.device_voice") : t("listen.online_voice")}</option>)}
                </select>
              </label>
            )}
            {voices.length === 1 && <p className="mt-2 text-xs text-muted-foreground">{t("listen.voice", { voice: `${voices[0].name} — ${voices[0].local ? t("listen.device_voice") : t("listen.online_voice")}` })}</p>}
          </>
        )}
      {error && <p role="alert" className="mt-2 text-red-800">{error}</p>}
    </div>
  );
}
