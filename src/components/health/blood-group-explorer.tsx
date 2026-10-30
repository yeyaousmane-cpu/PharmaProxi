"use client";
import { useState } from "react";
import { HeartHandshake, Info, Syringe } from "lucide-react";
import { ABO, BLOOD_GROUPS, aboPossibleChildren, redCellDonors, redCellRecipients, rhPossibleChildren, rhPregnancyWatch, type Abo, type BloodGroup, type Rh } from "@/lib/health/genetics";

const Chip = ({ g, active }: { g: string; active?: boolean }) => (
  <span className={`inline-flex min-w-11 justify-center rounded-md border px-2 py-1 text-sm font-bold ${active ? "border-[#068132] bg-[#068132] text-white" : "bg-white text-[#052D1E]"}`}>{g}</span>
);

type Tab = "transfusion" | "grossesse" | "heredite";

/** Groupes sanguins : transfusion, grossesse (Rhésus) et transmission — trois questions bien distinctes. */
export function BloodGroupExplorer() {
  const [tab, setTab] = useState<Tab>("transfusion");
  const [group, setGroup] = useState<BloodGroup>("O+");
  const [mother, setMother] = useState<Rh>("-");
  const [father, setFather] = useState<Rh | "?">("+");
  const [a1, setA1] = useState<Abo>("A");
  const [a2, setA2] = useState<Abo>("B");
  const [r1, setR1] = useState<Rh>("+");
  const [r2, setR2] = useState<Rh>("-");
  const tabs: [Tab, string][] = [["transfusion", "Transfusion"], ["grossesse", "Grossesse et Rhésus"], ["heredite", "Transmission aux enfants"]];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Thème">
        {tabs.map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`rounded-full border px-4 py-2 text-sm font-semibold ${tab === k ? "border-[#1D5FA8] bg-[#1D5FA8] text-white" : "bg-white hover:bg-muted"}`}>{l}</button>
        ))}
      </div>

      {tab === "transfusion" && (
        <div className="space-y-3" role="tabpanel">
          <p className="text-sm">Le <strong>système ABO</strong> (A, B, AB, O) et le <strong>facteur Rhésus</strong> (+ ou −) déterminent quel sang peut être transfusé. Choisissez un groupe :</p>
          <div className="flex flex-wrap gap-2">
            {BLOOD_GROUPS.map((g) => <button type="button" key={g} onClick={() => setGroup(g)} aria-pressed={group === g}><Chip g={g} active={group === g} /></button>)}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border bg-white p-3">
              <p className="mb-2 flex items-center gap-2 text-sm font-semibold"><Syringe className="size-4 text-[#068132]" aria-hidden /> Une personne {group} peut recevoir des globules rouges de :</p>
              <div className="flex flex-wrap gap-1.5">{redCellDonors(group).map((g) => <Chip key={g} g={g} />)}</div>
            </div>
            <div className="rounded-xl border bg-white p-3">
              <p className="mb-2 text-sm font-semibold">Ses globules rouges peuvent être donnés à :</p>
              <div className="flex flex-wrap gap-1.5">{redCellRecipients(group).map((g) => <Chip key={g} g={g} />)}</div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Règle générale pour les globules rouges. À l&apos;hôpital, la compatibilité est toujours vérifiée par des tests avant chaque transfusion. Ces règles concernent la transfusion, <strong>pas le mariage</strong>.</p>
        </div>
      )}

      {tab === "grossesse" && (
        <div className="space-y-3" role="tabpanel">
          <div className="grid gap-3 sm:grid-cols-2">
            <fieldset><legend className="mb-1 text-sm font-semibold">Rhésus de la future mère</legend>
              <div className="flex gap-2">{(["+", "-"] as Rh[]).map((r) => <button type="button" key={r} onClick={() => setMother(r)} aria-pressed={mother === r}><Chip g={`Rh${r === "+" ? "+" : "−"}`} active={mother === r} /></button>)}</div>
            </fieldset>
            <fieldset><legend className="mb-1 text-sm font-semibold">Rhésus du futur père</legend>
              <div className="flex gap-2">{(["+", "-", "?"] as (Rh | "?")[]).map((r) => <button type="button" key={r} onClick={() => setFather(r)} aria-pressed={father === r}><Chip g={r === "?" ? "Inconnu" : `Rh${r === "+" ? "+" : "−"}`} active={father === r} /></button>)}</div>
            </fieldset>
          </div>
          {rhPregnancyWatch(mother, father) ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950" aria-live="polite">
              <p className="font-semibold">Situation à signaler dès le début de la grossesse</p>
              <p className="mt-1">Le bébé peut être Rh+. Le corps de la mère Rh− peut alors fabriquer des anticorps, surtout pour une grossesse suivante. Cela se prévient : surveillance (recherche d&apos;anticorps) et, si nécessaire, injection d&apos;immunoglobulines anti-D au moment indiqué par le médecin ou la sage-femme.</p>
              <p className="mt-2 font-semibold">Ce n&apos;est pas une raison de ne pas se marier ni de renoncer à avoir des enfants.</p>
            </div>
          ) : (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950" aria-live="polite">
              {mother === "+" ? "Lorsque la mère est Rh+, il n'y a pas de risque d'incompatibilité Rhésus." : "Lorsque les deux parents sont Rh−, le bébé est Rh− : pas d'incompatibilité Rhésus."} Le suivi de grossesse habituel reste nécessaire.
            </div>
          )}
          <p className="flex items-start gap-2 text-xs text-muted-foreground"><Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />Une différence de groupe ABO entre la mère et le bébé peut parfois causer une jaunisse du nouveau-né, en général surveillée et traitée à la maternité. Elle n&apos;empêche pas non plus un mariage.</p>
        </div>
      )}

      {tab === "heredite" && (
        <div className="space-y-3" role="tabpanel">
          <p className="text-sm">Chaque parent transmet un gène ABO et un gène Rhésus. Selon les groupes des parents, voici les groupes <strong>possibles</strong> pour un enfant :</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {([["Parent 1", a1, setA1, r1, setR1], ["Parent 2", a2, setA2, r2, setR2]] as const).map(([label, a, setA, r, setR]) => (
              <fieldset key={label} className="rounded-xl border bg-white p-3"><legend className="px-1 text-sm font-semibold">{label}</legend>
                <div className="flex flex-wrap gap-1.5">{ABO.map((x) => <button type="button" key={x} onClick={() => setA(x)} aria-pressed={a === x}><Chip g={x} active={a === x} /></button>)}</div>
                <div className="mt-2 flex gap-1.5">{(["+", "-"] as Rh[]).map((x) => <button type="button" key={x} onClick={() => setR(x)} aria-pressed={r === x}><Chip g={`Rh${x === "+" ? "+" : "−"}`} active={r === x} /></button>)}</div>
              </fieldset>
            ))}
          </div>
          <div className="rounded-xl border bg-[#EAF6EE] p-4 text-sm" aria-live="polite">
            <p className="mb-2 font-semibold">Groupes possibles pour un enfant</p>
            <div className="flex flex-wrap gap-1.5">
              {aboPossibleChildren(a1, a2).flatMap((x) => rhPossibleChildren(r1, r2).map((y) => `${x}${y}`)).map((g) => <Chip key={g} g={g.replace("-", "−")} />)}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Les probabilités exactes dépendent de gènes invisibles sur la carte de groupe (un parent A peut porter un gène O). Cet outil montre seulement les possibilités.</p>
          </div>
        </div>
      )}
      <p className="flex items-start gap-2 rounded-xl border bg-white p-3 text-sm"><HeartHandshake className="mt-0.5 size-4 shrink-0 text-[#068132]" aria-hidden />
        <span><strong>Aucune différence de groupe sanguin n&apos;interdit un mariage.</strong> Les groupes servent à sécuriser les transfusions et à bien suivre une grossesse.</span></p>
    </div>
  );
}
