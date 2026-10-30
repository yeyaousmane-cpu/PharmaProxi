import Link from "next/link";
import { ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { FemmeGate } from "@/components/femme/gate";
import { Estimate, fmt } from "@/components/femme/bits";
import { F } from "@/components/femme/ui";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { deleteFemmePeriod, saveFemmePeriod } from "@/app/actions/femme";
import { femmeData, femmeStatus, isTeen } from "@/lib/femme/server";
import { cycleGaps, dayKind, diffDays, monthGrid, shiftMonth, summarize, todayIso } from "@/lib/femme/cycle";
import { cn } from "@/lib/utils";

export const metadata = { title: "Calendrier", robots: { index: false } };

const STYLE: Record<string, string> = {
  regles: "bg-[#D96A91] text-white font-bold",
  regles_prevues: "border-2 border-dashed border-[#D96A91] text-[#843653]",
  fertile: "bg-[#E6F4EA] text-[#068132]",
  ovulation: "bg-[#068132] text-white font-bold",
};

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const sp = await searchParams;
  const st = await femmeStatus();
  const gate = FemmeGate({ st, path: "/femme/calendrier" });
  if (gate) return gate;
  const today = todayIso();
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.m ?? "") ? sp.m! : today.slice(0, 7);
  const { profile, periods, days } = await femmeData();
  if (!profile) return null;
  const s = summarize(periods, profile.cycle_length, profile.period_length, today);
  const showFertility = !isTeen(profile) && (profile.journey === "cycle" || profile.journey === "conception");
  const logged = new Set(days.map((d) => d.day));
  const gaps = cycleGaps(periods, 12);
  const title = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`));

  return (
    <div className="space-y-4">
      <section className={`${F.card} space-y-3`}>
        <div className="flex items-center justify-between">
          <Link prefetch={false} href={`/femme/calendrier?m=${shiftMonth(month, -1)}`} className="rounded-full p-2 hover:bg-[#F8E7EF]" aria-label="Mois précédent"><ChevronLeft aria-hidden /></Link>
          <h1 className="text-lg font-bold capitalize text-[#843653]">{title}</h1>
          <Link prefetch={false} href={`/femme/calendrier?m=${shiftMonth(month, 1)}`} className="rounded-full p-2 hover:bg-[#F8E7EF]" aria-label="Mois suivant"><ChevronRight aria-hidden /></Link>
        </div>
        <table className="w-full table-fixed text-center">
          <thead><tr>{["L", "M", "M", "J", "V", "S", "D"].map((d, i) => <th key={i} className="pb-1 text-xs font-semibold text-muted-foreground">{d}</th>)}</tr></thead>
          <tbody>
            {monthGrid(month).map((w, i) => (
              <tr key={i}>
                {w.map((d, j) => {
                  if (!d) return <td key={j} />;
                  const k = dayKind(d, periods, s, showFertility);
                  const label = k ? ({ regles: "règles", regles_prevues: "règles prévues", fertile: "période fertile estimée", ovulation: "ovulation estimée" } as Record<string, string>)[k] : "";
                  return (
                    <td key={j} className="p-0.5">
                      <Link prefetch={false} href={`/femme/journal/${d}`} aria-label={`${fmt(d)}${label ? `, ${label}` : ""}${logged.has(d) ? ", journée notée" : ""}`}
                        className={cn("relative mx-auto grid aspect-square w-full max-w-11 place-items-center rounded-full text-sm hover:ring-2 hover:ring-[#D96A91]/50", k && STYLE[k], d === today && "ring-2 ring-[#29232A]")}>
                        {Number(d.slice(8))}
                        {logged.has(d) && <span className="absolute bottom-1 size-1 rounded-full bg-current opacity-70" aria-hidden />}
                      </Link>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          <li className="flex items-center gap-1.5"><span className="size-3 rounded-full bg-[#D96A91]" /> Règles</li>
          <li className="flex items-center gap-1.5"><span className="size-3 rounded-full border-2 border-dashed border-[#D96A91]" /> Règles prévues</li>
          {showFertility && <><li className="flex items-center gap-1.5"><span className="size-3 rounded-full bg-[#E6F4EA] ring-1 ring-[#068132]/30" /> Période fertile estimée</li>
          <li className="flex items-center gap-1.5"><span className="size-3 rounded-full bg-[#068132]" /> Ovulation estimée</li></>}
          <li className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-[#29232A]" /> Journée notée</li>
        </ul>
        <p className="text-xs text-muted-foreground">Touchez un jour pour noter vos symptômes.</p>
      </section>

      <section className={`${F.card} space-y-3`}>
        <h2 className={F.h2}>Ajouter des règles</h2>
        <ActionForm action={saveFemmePeriod} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end" resetOnSuccess>
          <label className="space-y-1 text-sm font-medium">Premier jour<input type="date" name="start" required max={today} className={F.input} /></label>
          <label className="space-y-1 text-sm font-medium">Dernier jour (si terminé)<input type="date" name="end" max={today} className={F.input} /></label>
          <SubmitButton className={F.btn}>Enregistrer</SubmitButton>
        </ActionForm>
      </section>

      <section className={`${F.card} space-y-3`}>
        <h2 className={F.h2}>Historique</h2>
        <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <div className="rounded-xl bg-[#F8E7EF] p-3"><dt className="text-xs">Cycle moyen</dt><dd className="text-lg font-bold">{s.avgCycle} j</dd><dd className="text-[11px] text-muted-foreground">{s.fromHistory ? `sur ${s.cyclesCounted} cycle(s)` : "valeur déclarée"}</dd></div>
          <div className="rounded-xl bg-[#F8E7EF] p-3"><dt className="text-xs">Règles moyennes</dt><dd className="text-lg font-bold">{s.avgPeriod} j</dd></div>
          <div className="rounded-xl bg-[#F8E7EF] p-3"><dt className="text-xs">Variation</dt><dd className="text-lg font-bold">{s.variation ?? "—"}{s.variation !== null ? " j" : ""}</dd></div>
          <div className="rounded-xl bg-[#F8E7EF] p-3"><dt className="text-xs">Régularité</dt><dd className="text-lg font-bold">{s.cyclesCounted < 2 ? "—" : s.irregular ? "Irrégulier" : "Régulier"}</dd></div>
        </dl>
        {gaps.length > 1 && (
          <div aria-label="Durée des derniers cycles" className="flex h-28 items-end gap-1.5 border-b pt-2">
            {[...gaps].reverse().map((g, i) => (
              <div key={i} className="flex flex-1 flex-col items-center justify-end gap-1">
                <span className="text-[10px]">{g}</span>
                <div className={cn("w-full max-w-8 rounded-t", g < 21 || g > 35 ? "bg-amber-400" : "bg-[#D96A91]")} style={{ height: `${Math.min(100, (g / 45) * 100)}%` }} />
              </div>
            ))}
          </div>
        )}
        {periods.length === 0 ? <p className="text-sm text-muted-foreground">Aucune règle enregistrée.</p> : (
          <ul className="divide-y text-sm">
            {periods.slice(0, 24).map((p) => (
              <li key={p.id} className="flex items-center gap-2 py-2">
                <span className="flex-1">{fmt(p.start_date, { day: "numeric", month: "short", year: "numeric" })} → {p.end_date ? `${fmt(p.end_date, { day: "numeric", month: "short" })} (${diffDays(p.end_date, p.start_date) + 1} j)` : "en cours / fin non notée"}</span>
                <ActionForm action={deleteFemmePeriod}><input type="hidden" name="id" value={p.id} />
                  <SubmitButton variant="ghost" size="sm" aria-label={`Supprimer les règles du ${fmt(p.start_date)}`} confirm="Supprimer cet enregistrement ?"><Trash2 className="size-4" aria-hidden /></SubmitButton>
                </ActionForm>
              </li>
            ))}
          </ul>
        )}
      </section>
      <Estimate />
    </div>
  );
}
