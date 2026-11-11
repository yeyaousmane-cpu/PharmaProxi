"use client";
import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, RotateCcw } from "lucide-react";
import { OUTCOMES, QUESTIONS, evaluate } from "@/lib/eligibility";
import { cn } from "@/lib/utils";

/** Questionnaire progressif : une question à la fois, retour possible, résultat pédagogique. Rien n'est envoyé. */
export function EligibilityQuiz() {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [step, setStep] = useState(0);
  const visible = useMemo(() => QUESTIONS.filter((q) => !q.showIf || q.showIf(answers)), [answers]);
  const done = step >= visible.length;
  const q = visible[Math.min(step, visible.length - 1)];
  const result = done ? evaluate(answers) : null;
  const pick = (v: string) => {
    const next = { ...answers, [q.id]: v };
    // Effacer les réponses des questions qui ne s'affichent plus
    for (const x of QUESTIONS) if (x.showIf && !x.showIf(next)) delete next[x.id];
    setAnswers(next); setStep(step + 1);
  };
  const progress = Math.round((Math.min(step, visible.length) / visible.length) * 100);
  return (
    <div className="space-y-4 rounded-2xl border bg-white p-4 sm:p-6">
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-muted-foreground"><span>{done ? "Terminé" : `Question ${step + 1} sur ${visible.length}`}</span><span>{progress} %</span></div>
        <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}><div className="h-full rounded-full bg-red-600 transition-all" style={{ width: `${progress}%` }} /></div>
      </div>
      {!done ? (
        <fieldset className="space-y-3">
          <legend className="text-lg font-bold text-brand-deep">{q.text}</legend>
          {q.help && <p className="text-sm text-muted-foreground">{q.help}</p>}
          <div className="grid gap-2">{q.choices.map((c) => (
            <button key={c.value} type="button" onClick={() => pick(c.value)} aria-pressed={answers[q.id] === c.value}
              className={cn("min-h-12 rounded-xl border-2 px-4 py-2 text-start font-medium hover:border-red-400", answers[q.id] === c.value ? "border-red-600 bg-red-50" : "bg-white")}>{c.label}</button>))}</div>
          {step > 0 && <button type="button" onClick={() => setStep(step - 1)} className="inline-flex items-center gap-1 text-sm text-primary"><ArrowLeft className="size-4 rtl:-scale-x-100" aria-hidden /> Question précédente</button>}
        </fieldset>
      ) : result && (
        <div className="space-y-3" role="status" aria-live="polite">
          <div className={cn("rounded-xl border-2 p-4", OUTCOMES[result.outcome].className)}>
            <p className="text-lg font-bold">{OUTCOMES[result.outcome].title}</p>
            <p className="mt-1 text-sm">{OUTCOMES[result.outcome].text}</p>
          </div>
          {result.reasons.length > 0 && <div className="text-sm"><p className="font-semibold">Réponses à discuter avec un professionnel :</p><ul className="mt-1 list-disc space-y-0.5 ps-5">{result.reasons.map((r) => <li key={r}>{r}</li>)}</ul></div>}
          <p className="text-xs text-muted-foreground">Ce résultat n&apos;est pas un avis médical : il ne dit pas si vous êtes apte ou inapte. Seul un professionnel de santé du centre de collecte peut le décider. Vos réponses ne sont pas enregistrées.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setStep(visible.length - 1)} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border-2 px-4 font-semibold"><ArrowLeft className="size-4 rtl:-scale-x-100" aria-hidden /> Modifier une réponse</button>
            <button type="button" onClick={() => { setAnswers({}); setStep(0); }} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border-2 px-4 font-semibold"><RotateCcw className="size-4" aria-hidden /> Recommencer</button>
            <a href="/don-de-sang#ou-donner" className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-[#052D1E] px-4 font-semibold text-white">Où donner <ArrowRight className="size-4 rtl:-scale-x-100" aria-hidden /></a>
          </div>
        </div>
      )}
    </div>
  );
}
