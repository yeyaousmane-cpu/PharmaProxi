"use client";
import { useState } from "react";
import Link from "next/link";
import { Info } from "lucide-react";
import { HB_LABEL, HB_PROFILES, hbGrid, hbOffspring, type HbProfile } from "@/lib/health/genetics";

const TONE = {
  ok: "border-emerald-200 bg-emerald-50 text-emerald-900",
  carrier: "border-amber-200 bg-amber-50 text-amber-950",
  disease: "border-rose-200 bg-rose-50 text-rose-950",
} as const;
const BAR = { ok: "bg-emerald-500", carrier: "bg-amber-400", disease: "bg-rose-500" } as const;

function ProfilePicker({ label, value, onChange, id }: { label: string; value: HbProfile | ""; onChange: (v: HbProfile | "") => void; id: string }) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-2 text-sm font-semibold">{label}</legend>
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={label}>
        {HB_PROFILES.map((p) => (
          <label key={p} className={`flex cursor-pointer items-center justify-center rounded-lg border px-2 py-2.5 text-base font-bold transition ${value === p ? "border-[#068132] bg-[#EAF6EE] text-[#052D1E] ring-2 ring-[#068132]/30" : "bg-white hover:border-[#068132]/50"}`}>
            <input type="radio" name={id} value={p} checked={value === p} onChange={() => onChange(p)} className="sr-only" />{p}
          </label>
        ))}
      </div>
      <button type="button" onClick={() => onChange("")} className="mt-2 text-xs text-muted-foreground underline">Profil inconnu ou autre résultat</button>
    </fieldset>
  );
}

/** Simulateur pédagogique : probabilités théoriques à chaque grossesse. Aucun enregistrement, aucun envoi. */
export function HbSimulator() {
  const [p1, setP1] = useState<HbProfile | "">("AS");
  const [p2, setP2] = useState<HbProfile | "">("AS");
  const ready = p1 !== "" && p2 !== "";
  const res = ready ? hbOffspring(p1, p2) : [];
  const grid = ready ? hbGrid(p1, p2) : [];
  const atRisk = res.some((r) => HB_LABEL[r.profile].tone === "disease");
  return (
    <div className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <ProfilePicker id="hb-p1" label="Profil du premier parent" value={p1} onChange={setP1} />
        <ProfilePicker id="hb-p2" label="Profil du second parent" value={p2} onChange={setP2} />
      </div>
      {!ready ? (
        <p className="flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          Le modèle simplifié ne couvre que les profils AA, AS, AC, SS, SC et CC. Pour un profil inconnu, une thalassémie ou un autre variant, demandez conseil à un médecin ou à un spécialiste en génétique.
        </p>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[auto_1fr] lg:items-start" aria-live="polite">
          <div>
            <p className="mb-2 text-sm font-semibold">Les 4 combinaisons possibles</p>
            <table className="border-separate border-spacing-1 text-center text-sm">
              <thead>
                <tr><th className="sr-only">Parent 1 / Parent 2</th>{[...p2].map((b, j) => <th key={j} scope="col" className="h-8 w-14 rounded-md bg-[#1D5FA8]/10 font-bold text-[#1D5FA8]">{b}</th>)}</tr>
              </thead>
              <tbody>
                {grid.map((row, i) => (
                  <tr key={i}>
                    <th scope="row" className="h-12 w-8 rounded-md bg-[#068132]/10 font-bold text-[#068132]">{p1[i]}</th>
                    {row.map((g, j) => <td key={j} className={`h-12 w-14 rounded-md border font-bold ${TONE[HB_LABEL[g].tone]}`}>{g}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-1 max-w-[16rem] text-xs text-muted-foreground">Chaque parent transmet au hasard l&apos;un de ses deux gènes.</p>
          </div>
          <div className="space-y-3">
            <p className="text-sm font-semibold">Probabilités théoriques pour chaque grossesse</p>
            <ul className="space-y-2">
              {res.map((r) => {
                const l = HB_LABEL[r.profile];
                return (
                  <li key={r.profile} className={`rounded-xl border p-3 ${TONE[l.tone]}`}>
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-semibold">{l.title}</span>
                      <span className="text-xl font-bold tabular-nums">{r.percent} %</span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/70" aria-hidden><div className={`h-full ${BAR[l.tone]}`} style={{ width: `${r.percent}%` }} /></div>
                    <p className="mt-1 text-xs">{l.text}</p>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
      <div className="space-y-2 rounded-xl border bg-white p-4 text-sm">
        <p><strong>Ces pourcentages s&apos;appliquent à chaque grossesse, de façon indépendante.</strong> Ils ne prédisent pas le profil d&apos;un enfant en particulier : avec 25 %, un couple peut avoir plusieurs enfants SS, ou aucun.</p>
        <p>Cet outil est pédagogique : ce n&apos;est ni un diagnostic, ni un avis sur un mariage. Aucun couple n&apos;est « incompatible » : un risque se comprend et s&apos;accompagne.
          {ready && atRisk ? " Avec ces profils, une consultation (médecin, hématologue, conseil génétique) est recommandée avant une grossesse." : ""}</p>
        <p className="text-xs text-muted-foreground">Le profil d&apos;une personne se connaît uniquement par un examen (électrophorèse de l&apos;hémoglobine), jamais par l&apos;apparence, le groupe sanguin ou les antécédents familiaux. Les choix faits ici ne sont ni enregistrés ni envoyés.</p>
        <div className="flex flex-wrap gap-3 pt-1">
          <Link prefetch={false} href="/laboratoires" className="font-semibold text-[#068132] underline">Où faire l&apos;électrophorèse</Link>
          <Link prefetch={false} href="/medecins" className="font-semibold text-[#1D5FA8] underline">Trouver un médecin ou un hématologue</Link>
        </div>
      </div>
    </div>
  );
}
