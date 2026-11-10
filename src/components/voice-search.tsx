"use client";
import { useEffect, useRef, useState } from "react";
import { Mic, MicOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { useBcp47, useT } from "@/i18n/client";

type Rec = { lang: string; interimResults: boolean; maxAlternatives: number; start: () => void; stop: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onerror: ((e: { error: string }) => void) | null; onend: (() => void) | null };

/**
 * Recherche vocale (français) avec la reconnaissance vocale du navigateur. Rien n'est enregistré
 * par SantéProxi : la phrase reconnue remplit simplement la recherche.
 * « pharmacie de garde » → pharmacies de garde ; « médecin … » → annuaire des médecins ;
 * « urgence » → SOS Santé ; sinon, recherche de médicament.
 */
export function VoiceSearch({ onText, className }: { onText: (text: string) => void; className?: string }) {
  const bcp = useBcp47();
  const t = useT();
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const rec = useRef<Rec | null>(null);
  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
    setSupported(Boolean(w.SpeechRecognition || w.webkitSpeechRecognition));
  }, []);
  if (!supported) return null;
  const start = () => {
    // Information préalable obligatoire (le navigateur peut envoyer la voix à son éditeur) : affichée sur /parler
    let ack = false; try { ack = localStorage.getItem("sp_voice_notice_v1") === "1"; } catch { /* stockage indisponible */ }
    if (!ack) { window.location.href = "/parler"; return; }
    const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
    const C = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!C) return;
    const r = new C();
    r.lang = bcp; r.interimResults = false; r.maxAlternatives = 1;
    r.onresult = (e) => {
      const text = e.results[0]?.[0]?.transcript?.trim() ?? "";
      if (!text) return;
      const t = text.toLowerCase();
      if (/\burgence|ambulance|sos\b/.test(t)) { window.location.href = "/sos"; return; }
      if (/\bgarde\b|ouverte? (la nuit|maintenant)/.test(t)) { window.location.href = "/garde"; return; }
      if (/\bpharmacie/.test(t) && /(près|proche|autour)/.test(t)) { window.location.href = "/pharmacies"; return; }
      if (/\b(médecin|docteur|pédiatre|gynécologue|dentiste)\b/.test(t)) { window.location.href = `/medecins?q=${encodeURIComponent(text)}`; return; }
      onText(text.replace(/^(je cherche|je veux|trouver|chercher)\s+(du |de la |de l'|des |le |la |les |un |une )?/i, ""));
    };
    r.onerror = (e) => { setMsg(e.error === "not-allowed" ? t("speak.denied") : t("speak.failed")); setListening(false); };
    r.onend = () => setListening(false);
    rec.current = r; setMsg(null); setListening(true); r.start();
  };
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <button type="button" onClick={() => (listening ? rec.current?.stop() : start())} aria-label={listening ? t("speak.stop") : t("speak.mic")}
        className={cn("grid size-10 place-items-center rounded-full border-2", listening ? "animate-pulse border-red-500 bg-red-50 text-red-600" : "border-primary/30 bg-white text-primary hover:border-primary")}>
        {listening ? <MicOff className="size-5" aria-hidden /> : <Mic className="size-5" aria-hidden />}
      </button>
      <span className="sr-only" aria-live="polite">{listening ? t("speak.recording") : msg ?? ""}</span>
      {msg && <span className="absolute end-0 top-12 z-40 whitespace-nowrap rounded-lg bg-white px-2 py-1 text-xs text-muted-foreground shadow">{msg}</span>}
    </span>
  );
}
