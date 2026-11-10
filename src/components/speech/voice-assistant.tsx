"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Loader2, Mic, ShieldCheck, Siren, Square, Volume2 } from "lucide-react";
import { browserStt, browserTts, type SttError, type SttSession } from "@/lib/speech/providers";
import { interpret, type Interpretation } from "@/lib/speech/intents";
import { LANGUAGES } from "@/i18n/core";
import { useBcp47, useLang, useT } from "@/i18n/client";
import { cn } from "@/lib/utils";

const ACK = "sp_voice_notice_v1";
const readAck = () => { try { return localStorage.getItem(ACK) === "1"; } catch { return false; } };
const writeAck = () => { try { localStorage.setItem(ACK, "1"); } catch { /* navigation privée : on redemandera */ } };

const EXAMPLES: Record<string, string[]> = {
  fr: ["Je cherche une pharmacie de garde à Bamako", "Je voudrais prendre rendez-vous avec un médecin", "Je cherche un laboratoire d'analyses", "Je veux consulter mes rendez-vous"],
  en: ["I am looking for an on-duty pharmacy in Bamako", "I would like to book an appointment with a doctor", "I am looking for a testing laboratory", "I want to see my appointments"],
  ar: ["أبحث عن صيدلية مناوبة في باماكو", "أريد حجز موعد مع طبيب", "أبحث عن مختبر تحاليل", "أريد الاطلاع على مواعيدي"],
};

/**
 * « Parler à SantéProxi » : l'utilisateur parle (ou écrit), corrige le texte reconnu, puis choisit une proposition.
 * Le micro ne s'ouvre qu'après un appui explicite et se coupe à la fin de la phrase ou sur « Arrêter ».
 * Aucune voix ni aucun texte n'est enregistré par SantéProxi. Tout est faisable sans micro.
 */
export function VoiceAssistant() {
  const t = useT();
  const lang = useLang();
  const bcp = useBcp47();
  const [text, setText] = useState("");
  const [interim, setInterim] = useState("");
  const [listening, setListening] = useState(false);
  const [notice, setNotice] = useState(false);
  const [sttOk, setSttOk] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Interpretation | null>(null);
  const session = useRef<SttSession | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setSttOk(browserStt.supported()); return () => { session.current?.stop(); browserTts.cancel(); }; }, []);

  const errText = (e: SttError) => ({
    "not-allowed": t("speak.denied"), "no-speech": t("speak.no_speech"), network: t("speak.network"), "language-not-supported": t("speak.lang_unsupported", { lang: LANGUAGES[lang].label }),
    unsupported: t("speak.no_mic"), aborted: null, failed: t("speak.failed"),
  } as Record<SttError, string | null>)[e];

  const startMic = () => {
    if (!readAck()) { setNotice(true); return; }
    if (typeof navigator !== "undefined" && !navigator.onLine) { setError(t("speak.network")); return; }
    setError(null); setInterim(""); setResult(null); setListening(true);
    session.current = browserStt.listen({
      lang: bcp,
      onInterim: (s) => setInterim(s),
      onFinal: (s) => { setText(s); setInterim(""); },
      onError: (e) => { const m = errText(e); if (m) setError(m); },
      onEnd: () => { setListening(false); session.current = null; },
    });
  };
  const stopMic = () => { session.current?.stop(); setListening(false); };

  const submit = (value = text) => {
    if (!value.trim()) return;
    const r = interpret(value);
    setResult(r);
    setTimeout(() => resultRef.current?.focus(), 0);
  };

  const answerText = () => {
    if (!result) return "";
    const lines = [result.intents.length ? t("speak.result") : t("speak.unknown")];
    if (result.urgent) lines.unshift(t("speak.urgent"));
    if (result.medical) lines.push(t("speak.no_medical"));
    for (const i of result.intents) lines.push(t(i.key, i.vars));
    return lines.join(". ");
  };
  const readAloud = async () => {
    const voices = await browserTts.voices(lang);
    browserTts.cancel();
    browserTts.speak(answerText(), { lang: bcp, voice: voices[0], rate: 1, onEnd: () => {}, onError: () => {} });
  };

  return (
    <div className="space-y-4">
      {notice && (
        <div role="dialog" aria-modal="false" aria-labelledby="voice-notice" className="rounded-2xl border-2 border-[#068132]/30 bg-[#EAF6EE] p-4">
          <h2 id="voice-notice" className="flex items-center gap-2 font-bold text-[#052D1E]"><ShieldCheck className="size-5" aria-hidden /> {t("speak.consent_title")}</h2>
          <p className="mt-2 text-sm text-[#052D1E]">{t("speak.consent_text")}</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <button type="button" onClick={() => { writeAck(); setNotice(false); startMic(); }} className="min-h-11 rounded-xl border-2 border-[#052D1E] bg-[#052D1E] px-4 text-sm font-semibold text-white">{t("speak.consent_ok")}</button>
            <button type="button" onClick={() => { setNotice(false); document.getElementById("voice-text")?.focus(); }} className="min-h-11 rounded-xl border-2 border-[#052D1E]/25 bg-white px-4 text-sm font-semibold text-[#052D1E]">{t("speak.consent_no")}</button>
          </div>
        </div>
      )}

      <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="space-y-3 rounded-2xl border bg-white p-4">
        <div className="flex flex-wrap items-center gap-3">
          {sttOk ? (
            listening ? (
              <button type="button" onClick={stopMic} className="inline-flex min-h-14 items-center gap-2 rounded-full bg-red-600 px-6 text-base font-bold text-white">
                <Square className="size-5" aria-hidden /> {t("speak.stop")}
              </button>
            ) : (
              <button type="button" onClick={startMic} className="inline-flex min-h-14 items-center gap-2 rounded-full bg-[#068132] px-6 text-base font-bold text-white hover:bg-[#052D1E]">
                <Mic className="size-6" aria-hidden /> {t("speak.mic")}
              </button>
            )
          ) : <p className="text-sm text-muted-foreground">{t("speak.no_mic")}</p>}
          <p aria-live="polite" className={cn("text-sm font-semibold", listening ? "text-red-700" : "text-muted-foreground")}>
            {listening && <span className="me-2 inline-block size-3 animate-pulse rounded-full bg-red-600 align-middle" aria-hidden />}
            {listening ? (interim ? <>{t("speak.processing")} <span className="font-normal" dir="auto">« {interim} »</span></> : t("speak.recording")) : ""}
          </p>
        </div>
        <label htmlFor="voice-text" className="block text-sm font-semibold">{t("speak.textarea")}</label>
        <textarea id="voice-text" value={text} onChange={(e) => setText(e.target.value)} rows={2} dir="auto" maxLength={300} placeholder={t("speak.placeholder")}
          className="w-full rounded-xl border px-3 py-2 text-base" />
        <button type="submit" disabled={!text.trim()} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#052D1E] px-5 font-semibold text-white disabled:opacity-50">
          {t("speak.go")} <ArrowRight className="size-4 rtl:-scale-x-100" aria-hidden />
        </button>
        {error && <p role="alert" className="rounded-lg bg-amber-50 p-2 text-sm text-amber-900">{error}</p>}
      </form>

      {result && (
        <div ref={resultRef} tabIndex={-1} aria-live="polite" className="space-y-3 rounded-2xl border bg-white p-4 outline-none">
          {result.detected !== lang && <p className="text-xs text-muted-foreground">{t("speak.detected", { lang: LANGUAGES[result.detected].label })}</p>}
          {result.urgent && (
            <Link prefetch={false} href="/sos" className="flex items-center gap-2 rounded-xl bg-red-700 p-3 font-bold text-white"><Siren className="size-5" aria-hidden /> {t("speak.urgent")}</Link>
          )}
          {result.medical && <p className="text-sm">{t("speak.no_medical")}</p>}
          <p className="font-semibold">{result.intents.length ? t("speak.result") : t("speak.unknown")}</p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {(result.intents.length ? result.intents : [{ key: "nav.medicaments", href: "/recherche" }, { key: "nav.medecins", href: "/medecins" }, { key: "nav.sos", href: "/sos" }, { key: "link.aide", href: "/aide" }]).map((i) => (
              <li key={i.key + i.href}>
                <Link prefetch={false} href={i.href} className="flex min-h-12 items-center justify-between gap-2 rounded-xl border-2 border-[#068132]/25 px-3 font-semibold text-[#052D1E] hover:border-[#068132]">
                  <span dir="auto">{t(i.key, "vars" in i ? i.vars : undefined)}</span> <ArrowRight className="size-4 shrink-0 rtl:-scale-x-100" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
          {result.intents.some((i) => i.sensitive) && <p className="text-xs text-muted-foreground">{t("speak.confirm_note")}</p>}
          <button type="button" onClick={readAloud} className="inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-semibold"><Volume2 className="size-4" aria-hidden /> {t("speak.read")}</button>
        </div>
      )}

      <div className="rounded-2xl bg-muted/50 p-4 text-sm">
        <p className="font-semibold">{t("speak.examples")}</p>
        <ul className="mt-2 flex flex-wrap gap-2">
          {(EXAMPLES[lang] ?? EXAMPLES.fr).map((ex) => (
            <li key={ex}><button type="button" onClick={() => { setText(ex); submit(ex); }} className="rounded-full border bg-white px-3 py-1.5 text-start hover:border-primary" dir="auto">{ex}</button></li>
          ))}
        </ul>
      </div>
      {listening && <Loader2 className="sr-only" aria-hidden />}
    </div>
  );
}
