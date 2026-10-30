"use client";
import { useEffect, useRef, useState } from "react";
import { Headphones, X } from "lucide-react";

export type Clip = { lang: string; name: string; native: string | null; url: string; duration: string | null; speaker: string | null };
const KEY = "pp_audio_lang";

/** Lecteur des guides audio : choix de la langue, lecture à la demande (rien n'est téléchargé avant le clic). */
export function AudioPlayer({ clips, label }: { clips: Clip[]; label: string }) {
  const [open, setOpen] = useState(false);
  const [lang, setLang] = useState(clips[0]?.lang);
  const audio = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(KEY);
      if (saved && clips.some((c) => c.lang === saved)) setLang(saved);
    } catch { /* stockage indisponible */ }
  }, [clips]);
  const choose = (l: string) => {
    setLang(l);
    try { window.localStorage.setItem(KEY, l); } catch { /* ignore */ }
    requestAnimationFrame(() => audio.current?.play().catch(() => {}));
  };
  const clip = clips.find((c) => c.lang === lang) ?? clips[0];
  if (!clip) return null;
  return (
    <div className="rounded-xl border border-[#068132]/30 bg-white p-3 shadow-sm">
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="flex w-full items-center gap-3 text-left">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#068132] text-white"><Headphones className="size-5" aria-hidden /></span>
          <span>
            <span className="block font-semibold text-[#052D1E]">Écouter cette page</span>
            <span className="block text-xs text-muted-foreground">{clips.length === 1 ? clips[0].name : `En ${clips.length} langues : ${clips.slice(0, 4).map((c) => c.name).join(", ")}${clips.length > 4 ? "…" : ""}`}</span>
          </span>
        </button>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-sm font-semibold text-[#052D1E]"><Headphones className="size-4 text-[#068132]" aria-hidden /> {label}</p>
            <button type="button" onClick={() => { audio.current?.pause(); setOpen(false); }} aria-label="Fermer le lecteur" className="rounded p-1 hover:bg-muted"><X className="size-4" aria-hidden /></button>
          </div>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Langue">
            {clips.map((c) => (
              <button key={c.lang} type="button" role="radio" aria-checked={c.lang === clip.lang} onClick={() => choose(c.lang)}
                className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${c.lang === clip.lang ? "border-[#068132] bg-[#068132] text-white" : "bg-white hover:bg-[#EAF6EE]"}`}>
                {c.name}{c.native ? <span className="font-normal opacity-80"> · {c.native}</span> : null}
              </button>
            ))}
          </div>
          <audio ref={audio} key={clip.url} controls preload="none" src={clip.url} className="w-full" />
          <p className="text-xs text-muted-foreground">
            {[clip.duration, clip.speaker ? `Voix : ${clip.speaker}` : null].filter(Boolean).join(" · ")}
            {clip.duration || clip.speaker ? " · " : ""}Le son se télécharge seulement quand vous appuyez sur lecture.
          </p>
        </div>
      )}
    </div>
  );
}
