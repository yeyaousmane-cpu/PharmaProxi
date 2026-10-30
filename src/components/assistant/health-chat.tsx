"use client";
import { useEffect, useRef, useState } from "react";
import { Bot, Loader2, RotateCcw, Send, Siren, Square, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChatMarkdown } from "./chat-markdown";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "assistant"; content: string; urgent?: boolean; error?: boolean };

const SUGGESTIONS = [
  "J'ai mal à la tête depuis ce matin, que puis-je prendre ?",
  "Mon enfant a de la fièvre, que faire ?",
  "J'ai la diarrhée depuis hier",
  "Comment se protéger du paludisme ?",
  "J'ai le rhume et le nez bouché",
  "J'ai des brûlures d'estomac après les repas",
  "Comment éviter la déshydratation quand il fait très chaud ?",
  "J'ai mal aux dents, que faire en attendant le dentiste ?",
];

export function HealthChat({ available }: { available: boolean }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => { end.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [msgs]);
  useEffect(() => () => abort.current?.abort(), []);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    const history = [...msgs.filter((m) => !m.error), { role: "user" as const, content: q }];
    setMsgs([...history, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);
    const ctrl = new AbortController();
    abort.current = ctrl;
    const update = (patch: Partial<Msg>) =>
      setMsgs((cur) => { const c = [...cur]; c[c.length - 1] = { ...c[c.length - 1], ...patch }; return c; });
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: history.map(({ role, content }) => ({ role, content })) }),
        signal: ctrl.signal,
      });
      const urgent = res.headers.get("x-assistant") === "urgence";
      if (!res.ok || !res.body) { update({ content: (await res.text()) || "L'assistant ne répond pas pour le moment.", error: true }); return; }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        update({ content: acc, urgent });
      }
      if (!acc.trim()) update({ content: "L'assistant n'a pas pu répondre. Reformulez votre question ou réessayez.", error: true });
    } catch (e) {
      if ((e as Error).name !== "AbortError") update({ content: "Connexion impossible. Vérifiez votre connexion internet et réessayez.", error: true });
      else update({ content: "(réponse interrompue)" });
    } finally {
      setBusy(false);
      abort.current = null;
    }
  }

  if (!available) {
    return <p className="rounded-xl border bg-white p-5 text-muted-foreground">L&apos;assistant santé sera bientôt disponible. En attendant, consultez les fiches <a className="font-semibold text-primary underline" href="/sante">Santé essentielle</a> ou demandez conseil à votre pharmacien.</p>;
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="min-h-[200px] space-y-3 rounded-2xl border bg-white p-3 sm:p-4" aria-live="polite">
        {msgs.length === 0 && (
          <div className="space-y-3">
            <p className="flex items-start gap-2 text-sm text-muted-foreground"><Bot className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
              Bonjour ! Posez votre question de santé : mal de tête, fièvre, diarrhée, rhume, piqûres… Je vous explique les bons gestes, les médicaments sans ordonnance adaptés et quand consulter.</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" onClick={() => ask(s)} className="rounded-full border border-primary/30 bg-[#EAF6EE] px-3 py-1.5 text-left text-sm text-[#052D1E] hover:border-primary">{s}</button>
              ))}
            </div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={cn("flex min-w-0 gap-2", m.role === "user" && "flex-row-reverse")}>
            <span className={cn("mt-1 grid size-7 shrink-0 place-items-center rounded-full", m.role === "user" ? "bg-[#1D5FA8] text-white" : m.urgent ? "bg-red-700 text-white" : "bg-primary text-white")} aria-hidden>
              {m.role === "user" ? <User className="size-4" /> : m.urgent ? <Siren className="size-4" /> : <Bot className="size-4" />}
            </span>
            <div className={cn("min-w-0 max-w-[85%] rounded-2xl px-3 py-2 text-[15px]",
              m.role === "user" ? "bg-[#1D5FA8] text-white" : m.urgent ? "border border-red-300 bg-red-50 text-red-950" : m.error ? "border border-amber-300 bg-amber-50" : "bg-muted")}
              data-role={m.role}>
              <span className="sr-only">{m.role === "user" ? "Vous : " : "Assistant : "}</span>
              {m.role === "user" ? <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{m.content}</p>
                : m.content ? <ChatMarkdown text={m.content} />
                : <span className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" aria-hidden /> L&apos;assistant réfléchit…</span>}
            </div>
          </div>
        ))}
        <div ref={end} />
      </div>

      <form onSubmit={(e) => { e.preventDefault(); ask(input); }} className="flex items-end gap-2">
        <label htmlFor="assistant-q" className="sr-only">Votre question de santé</label>
        <textarea id="assistant-q" value={input} onChange={(e) => setInput(e.target.value)} maxLength={1000} rows={2}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(input); } }}
          placeholder="Ex. : J'ai mal à la tête, est-ce que je peux prendre du Doliprane ?"
          className="min-w-0 flex-1 resize-none rounded-xl border bg-white px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-primary" />
        {busy
          ? <Button type="button" variant="outline" onClick={() => abort.current?.abort()} aria-label="Arrêter la réponse"><Square aria-hidden /></Button>
          : <Button type="submit" disabled={!input.trim()} aria-label="Envoyer la question"><Send aria-hidden /></Button>}
      </form>
      {msgs.length > 0 && !busy && (
        <button type="button" onClick={() => setMsgs([])} className="flex items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground"><RotateCcw className="size-4" aria-hidden /> Nouvelle conversation</button>
      )}
    </div>
  );
}
