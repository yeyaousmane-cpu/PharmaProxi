/**
 * Services de voix, séparés et interchangeables :
 *   - TTS (lecture à voix haute) : interface TtsProvider ;
 *   - STT (reconnaissance vocale) : interface SttProvider.
 * Fournisseur actuel : les capacités natives du navigateur (Web Speech API). Aucun compte, aucune clé,
 * aucun coût. Pour changer de fournisseur (service hébergé, voix enregistrées…), il suffit d'écrire une
 * autre implémentation de ces interfaces, appelée depuis le serveur si elle nécessite une clé :
 * aucune clé ne doit jamais se trouver dans le navigateur.
 */

export type TtsVoice = { name: string; lang: string; local: boolean };
export interface TtsProvider {
  id: string;
  supported(): boolean;
  /** Voix disponibles sur l'appareil pour une langue (code court : fr, en, ar…). */
  voices(lang: string): Promise<TtsVoice[]>;
  speak(text: string, o: { lang: string; voice?: TtsVoice; rate: number; onEnd: () => void; onError: (e: string) => void }): void;
  pause(): void;
  resume(): void;
  cancel(): void;
}

export type SttError = "not-allowed" | "no-speech" | "network" | "language-not-supported" | "aborted" | "unsupported" | "failed";
export interface SttSession { stop(): void }
export interface SttProvider {
  id: string;
  supported(): boolean;
  /** Une seule phrase, micro coupé automatiquement à la fin ; l'utilisateur peut arrêter à tout moment. */
  listen(o: { lang: string; onInterim: (t: string) => void; onFinal: (t: string) => void; onError: (e: SttError) => void; onEnd: () => void }): SttSession;
}

// ----------------------------------------------------------------------------------------------
// Implémentation navigateur
// ----------------------------------------------------------------------------------------------
const synth = () => (typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis : null);

function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  const s = synth();
  if (!s) return Promise.resolve([]);
  const now = s.getVoices();
  if (now.length) return Promise.resolve(now);
  return new Promise((resolve) => {
    const done = () => resolve(s.getVoices());
    s.addEventListener("voiceschanged", done, { once: true });
    setTimeout(done, 1200); // certains navigateurs n'émettent jamais l'événement
  });
}

const native = new Map<string, SpeechSynthesisVoice>();
export const browserTts: TtsProvider = {
  id: "navigateur",
  supported: () => synth() !== null,
  async voices(lang) {
    const all = await loadVoices();
    const out = all.filter((v) => v.lang.toLowerCase().replace("_", "-").split("-")[0] === lang.toLowerCase());
    out.forEach((v) => native.set(v.name, v));
    // Voix de l'appareil d'abord : rien ne sort du téléphone
    return out.sort((a, b) => Number(b.localService) - Number(a.localService)).map((v) => ({ name: v.name, lang: v.lang, local: v.localService }));
  },
  speak(text, o) {
    const s = synth();
    if (!s) return o.onError("unsupported");
    const u = new SpeechSynthesisUtterance(text);
    u.lang = o.voice?.lang ?? o.lang;
    if (o.voice && native.get(o.voice.name)) u.voice = native.get(o.voice.name)!;
    u.rate = o.rate;
    u.onend = () => o.onEnd();
    u.onerror = (e) => { if (e.error !== "interrupted" && e.error !== "canceled") o.onError(e.error); };
    s.speak(u);
  },
  pause: () => synth()?.pause(),
  resume: () => synth()?.resume(),
  cancel: () => synth()?.cancel(),
};

type Rec = { lang: string; interimResults: boolean; continuous: boolean; maxAlternatives: number; start: () => void; stop: () => void; abort: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean } & ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null; onend: (() => void) | null };
const recCtor = () => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

export const browserStt: SttProvider = {
  id: "navigateur",
  supported: () => recCtor() !== null,
  listen(o) {
    const C = recCtor();
    if (!C) { o.onError("unsupported"); o.onEnd(); return { stop() {} }; }
    const r = new C();
    r.lang = o.lang; r.interimResults = true; r.continuous = false; r.maxAlternatives = 1;
    let finalText = "";
    r.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finalText += res[0].transcript; else interim += res[0].transcript;
      }
      if (interim) o.onInterim(interim);
      if (finalText) o.onFinal(finalText.trim());
    };
    r.onerror = (e) => {
      const map: Record<string, SttError> = { "not-allowed": "not-allowed", "service-not-allowed": "not-allowed", "no-speech": "no-speech", network: "network", "language-not-supported": "language-not-supported", aborted: "aborted" };
      o.onError(map[e.error] ?? "failed");
    };
    // Le micro ne reste jamais ouvert : arrêt automatique au bout de 15 secondes
    const guard = setTimeout(() => { try { r.stop(); } catch { /* déjà arrêté */ } }, 15_000);
    r.onend = () => { clearTimeout(guard); o.onEnd(); };
    r.start();
    return { stop: () => { clearTimeout(guard); try { r.stop(); } catch { /* déjà arrêté */ } } };
  },
};

/** Découpe un texte en passages lisibles (paragraphes, puis phrases si un paragraphe est trop long). */
export function splitPassages(text: string, max = 280): string[] {
  const paras = text.split(/\n+/).map((p) => p.replace(/\s+/g, " ").trim()).filter((p) => p.length > 1);
  const out: string[] = [];
  for (const p of paras) {
    if (p.length <= max) { out.push(p); continue; }
    let cur = "";
    for (const s of p.split(/(?<=[.!?؟。])\s+/)) {
      if ((cur + " " + s).trim().length > max && cur) { out.push(cur.trim()); cur = s; } else cur = (cur + " " + s).trim();
    }
    if (cur) out.push(cur);
  }
  return out;
}
