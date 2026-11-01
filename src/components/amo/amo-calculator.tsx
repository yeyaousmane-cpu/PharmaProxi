"use client";
import { useId, useState } from "react";
import { Calculator } from "lucide-react";
import { Input } from "@/components/ui/input";
import { amoBreakdown } from "@/lib/amo";
import { formatXof } from "@/lib/format";

const toInt = (v: string) => {
  if (!v.trim()) return null;
  const n = Number(v.replace(/[\s  ]/g, "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
};

/** Calculatrice du reste à payer : prix en pharmacie, tarif de référence AMO, taux. */
export function AmoCalculator({ rate, initialTariff, initialName }: { rate: number; initialTariff?: number | null; initialName?: string | null }) {
  const id = useId();
  const [price, setPrice] = useState(initialTariff ? String(initialTariff) : "");
  const [tariff, setTariff] = useState(initialTariff ? String(initialTariff) : "");
  const p = toInt(price);
  const t = tariff.trim() ? toInt(tariff) : null;
  const r = p !== null ? amoBreakdown(p, t, rate) : null;
  return (
    <section id="calcul" aria-labelledby={`${id}-t`} className="rounded-2xl border bg-white p-5 shadow-sm">
      <h2 id={`${id}-t`} className="flex items-center gap-2 text-lg font-bold text-brand-deep"><Calculator className="size-5 text-primary" aria-hidden /> Calculer mon reste à payer</h2>
      {initialName && <p className="mt-1 text-sm text-muted-foreground">Produit : <span className="font-medium text-foreground">{initialName}</span></p>}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm font-medium" htmlFor={`${id}-p`}>
          Prix demandé par la pharmacie (FCFA)
          <Input id={`${id}-p`} inputMode="numeric" placeholder="ex. 1000" value={price} onChange={(e) => setPrice(e.target.value)} />
        </label>
        <label className="space-y-1 text-sm font-medium" htmlFor={`${id}-t2`}>
          Tarif de référence AMO (FCFA)
          <Input id={`${id}-t2`} inputMode="numeric" placeholder="si vous le connaissez" value={tariff} onChange={(e) => setTariff(e.target.value)} />
        </label>
      </div>
      {r ? (
        <div className="mt-4 grid gap-2 rounded-xl bg-brand-mint p-4 text-sm" aria-live="polite">
          <p className="flex justify-between"><span>Base de remboursement</span><span className="font-medium">{formatXof(r.base)}</span></p>
          <p className="flex justify-between"><span>Part AMO ({rate} %)</span><span className="font-medium">− {formatXof(r.covered)}</span></p>
          <p className="flex justify-between border-t border-emerald-200 pt-2 text-base"><span className="font-semibold">Vous payez environ</span><span className="font-bold text-brand-deep">{formatXof(r.patient)}</span></p>
          {r.above > 0 && <p className="text-xs text-amber-900">Le prix dépasse le tarif de référence de {formatXof(r.above)} : cet écart reste entièrement à votre charge.</p>}
          {t === null && <p className="text-xs text-muted-foreground">Sans tarif de référence, le calcul suppose que le prix de la pharmacie est le tarif officiel.</p>}
        </div>
      ) : <p className="mt-4 text-sm text-muted-foreground">Saisissez un prix pour voir l&apos;estimation.</p>}
      <p className="mt-3 text-xs text-muted-foreground">Estimation indicative. Le montant exact est calculé par la pharmacie conventionnée au moment de la délivrance, sur présentation de votre carte AMO et de l&apos;ordonnance.</p>
    </section>
  );
}
