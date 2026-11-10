"use client";
import { useActionState, useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { saveConsentChoice } from "@/app/actions/v026";
import type { ActionState } from "@/lib/errors";

export type PurposeView = { code: string; title: string; description: string; data_categories: string; recipients: string; withdrawal_effect: string | null; version: number;
  state: "accorde" | "refuse" | "retire" | null; since: string | null };

const STATE: Record<string, [string, string]> = {
  accorde: ["Accepté", "bg-emerald-100 text-emerald-900"], refuse: ["Refusé", "bg-slate-200 text-slate-800"], retire: ["Retiré", "bg-amber-100 text-amber-900"],
};

/** Un bouton qui envoie un choix ; les deux choix ont exactement le même poids visuel. */
function ChoiceButton({ purposes, decision, children, pending, action, active }: { purposes: string[]; decision: "accorde" | "refuse"; children: React.ReactNode; pending: boolean; action: (fd: FormData) => void; active?: boolean }) {
  const [tz, setTz] = useState("");
  useEffect(() => { try { setTz(Intl.DateTimeFormat().resolvedOptions().timeZone ?? ""); } catch { /* inconnu */ } }, []);
  return (
    <form action={action}>
      {purposes.map((p) => <input key={p} type="hidden" name="purpose" value={p} />)}
      <input type="hidden" name="decision" value={decision} /><input type="hidden" name="tz" value={tz} /><input type="hidden" name="lang" value="fr" />
      <button disabled={pending} aria-pressed={active}
        className={`min-h-11 w-full rounded-xl border-2 px-4 text-sm font-semibold transition disabled:opacity-60 ${active ? "border-[#052D1E] bg-[#052D1E] text-white" : "border-[#052D1E]/25 bg-white text-[#052D1E] hover:border-[#052D1E]"}`}>
        {children}
      </button>
    </form>
  );
}

export function ConsentChoices({ purposes }: { purposes: PurposeView[] }) {
  const [state, action, pending] = useActionState(saveConsentChoice, {} as ActionState);
  const all = purposes.map((p) => p.code);
  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-[#EAF6EE] p-4">
        <p className="text-sm text-[#052D1E]">Chaque choix est facultatif et indépendant. Refuser n&apos;empêche pas d&apos;utiliser SantéProxi. Rien n&apos;est accepté tant que vous n&apos;avez pas cliqué.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <ChoiceButton purposes={all} decision="accorde" pending={pending} action={action}>J&apos;accepte tout</ChoiceButton>
          <ChoiceButton purposes={all} decision="refuse" pending={pending} action={action}>Je refuse tout</ChoiceButton>
          <a href="#personnaliser" className="flex min-h-11 items-center justify-center rounded-xl border-2 border-[#052D1E]/25 bg-white px-4 text-sm font-semibold text-[#052D1E] hover:border-[#052D1E]">Personnaliser mes choix</a>
        </div>
      </div>
      <div role="status" aria-live="polite">
        {state.ok && state.message && <p className="flex items-start gap-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900"><CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />{state.message}</p>}
        {state.error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-900">{state.error}</p>}
      </div>
      <ul id="personnaliser" className="scroll-mt-24 space-y-3">{purposes.map((p) => {
        const [label, tone] = p.state ? STATE[p.state] : ["Pas encore choisi", "bg-muted text-muted-foreground"];
        return (
          <li key={p.code} className="rounded-2xl border p-4">
            <p className="font-semibold text-[#052D1E]">{p.title} <span className={`ms-1 rounded-full px-2 py-0.5 text-xs ${tone}`}>{label}</span></p>
            <p className="mt-1 text-sm">{p.description}</p>
            <details className="mt-2 text-sm">
              <summary className="cursor-pointer font-semibold text-[#068132]">Ce que cela implique</summary>
              <ul className="mt-2 space-y-1 text-muted-foreground">
                <li><strong>Données :</strong> {p.data_categories}</li>
                <li><strong>Destinataires :</strong> {p.recipients}</li>
                <li><strong>Si vous refusez :</strong> le service correspondant n&apos;est pas activé ; le reste de SantéProxi reste accessible.</li>
                {p.withdrawal_effect && <li><strong>Si vous retirez votre accord :</strong> {p.withdrawal_effect}</li>}
                <li>Texte version {p.version}{p.since ? ` · dernier choix le ${p.since}` : ""}</li>
              </ul>
            </details>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:max-w-sm">
              <ChoiceButton purposes={[p.code]} decision="accorde" pending={pending} action={action} active={p.state === "accorde"}>J&apos;accepte</ChoiceButton>
              <ChoiceButton purposes={[p.code]} decision="refuse" pending={pending} action={action} active={p.state === "refuse" || p.state === "retire"}>Je refuse</ChoiceButton>
            </div>
          </li>);
      })}</ul>
      <p className="text-xs text-muted-foreground">Chaque clic enregistre immédiatement vos préférences. Le retrait d&apos;un consentement ne remet pas en cause les traitements effectués avant ce retrait, et ne met pas fin aux traitements qui reposent sur une autre base (par exemple vos rendez-vous en cours).</p>
    </div>
  );
}
