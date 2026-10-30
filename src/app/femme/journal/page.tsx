import Link from "next/link";
import { FemmeGate } from "@/components/femme/gate";
import { fmt } from "@/components/femme/bits";
import { F } from "@/components/femme/ui";
import { femmeData, femmeStatus } from "@/lib/femme/server";
import { addDays, diffDays, todayIso } from "@/lib/femme/cycle";
import { FLOWS, MOODS, SYMPTOMS } from "@/lib/femme/labels";

export const metadata = { title: "Journal", robots: { index: false } };

export default async function JournalPage() {
  const st = await femmeStatus();
  const gate = FemmeGate({ st, path: "/femme/journal" });
  if (gate) return gate;
  const today = todayIso();
  const from = addDays(today, -89);
  const { profile, days } = await femmeData({ daysFrom: from });
  if (!profile) return null;
  const counts = new Map<string, number>();
  const moods = new Map<string, number>();
  for (const d of days) { for (const s of d.symptoms) counts.set(s, (counts.get(s) ?? 0) + 1); if (d.mood) moods.set(d.mood, (moods.get(d.mood) ?? 0) + 1); }
  const sym = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const maxSym = Math.max(1, ...sym.map(([, n]) => n));
  const byDay = new Map(days.map((d) => [d.day, d]));
  const last60 = Array.from({ length: 60 }, (_, i) => addDays(today, i - 59));
  const temps = days.filter((d) => d.temperature !== null).sort((a, b) => a.day.localeCompare(b.day));
  const tMin = Math.min(...temps.map((t) => t.temperature!), 36), tMax = Math.max(...temps.map((t) => t.temperature!), 37.2);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-[#843653]">Mon journal (90 derniers jours)</h1>
        <Link prefetch={false} href={`/femme/journal/${today}`} className={F.btn}>Noter aujourd&apos;hui</Link>
      </div>
      {days.length === 0 ? <p className={F.card}>Aucune journée notée. Touchez « Noter aujourd&apos;hui » pour commencer.</p> : (
        <>
          <section className={`${F.card} space-y-2`}>
            <h2 className={F.h2}>Douleur et saignements (60 jours)</h2>
            <div className="flex h-32 items-end gap-px border-b" role="img" aria-label="Douleur notée sur 60 jours">
              {last60.map((day) => {
                const d = byDay.get(day);
                const bleed = d?.flow && d.flow !== "aucun";
                return (
                  <div key={day} className="flex h-full flex-1 flex-col justify-end" title={`${fmt(day)}${d?.pain != null ? ` · douleur ${d.pain}/10` : ""}${bleed ? ` · ${FLOWS[d!.flow!]}` : ""}`}>
                    <div className={bleed ? "bg-[#D96A91]" : "bg-[#843653]/60"} style={{ height: `${d?.pain != null ? Math.max(4, d.pain * 10) : bleed ? 4 : 0}%` }} />
                  </div>
                );
              })}
            </div>
            <p className="flex justify-between text-[11px] text-muted-foreground"><span>{fmt(last60[0])}</span><span>aujourd&apos;hui</span></p>
            <p className="text-xs text-muted-foreground"><span className="inline-block size-2 rounded-sm bg-[#D96A91]" /> jour de saignement · <span className="inline-block size-2 rounded-sm bg-[#843653]/60" /> autre jour · hauteur = douleur</p>
          </section>
          <div className="grid gap-4 md:grid-cols-2">
            <section className={`${F.card} space-y-2`}>
              <h2 className={F.h2}>Symptômes les plus fréquents</h2>
              {sym.length === 0 ? <p className="text-sm text-muted-foreground">Aucun symptôme noté.</p> : (
                <ul className="space-y-1.5">{sym.slice(0, 8).map(([k, n]) => (
                  <li key={k} className="text-sm"><div className="flex justify-between"><span>{SYMPTOMS[k] ?? k}</span><span className="font-semibold">{n} j</span></div>
                    <div className="h-2 rounded-full bg-[#F8E7EF]"><div className="h-2 rounded-full bg-[#D96A91]" style={{ width: `${(n / maxSym) * 100}%` }} /></div></li>
                ))}</ul>
              )}
            </section>
            <section className={`${F.card} space-y-2`}>
              <h2 className={F.h2}>Humeur</h2>
              {moods.size === 0 ? <p className="text-sm text-muted-foreground">Aucune humeur notée.</p> : (
                <ul className="flex flex-wrap gap-1.5">{[...moods.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => <li key={k} className="rounded-full bg-[#F8E7EF] px-2.5 py-1 text-sm">{MOODS[k] ?? k} × {n}</li>)}</ul>
              )}
            </section>
          </div>
          {temps.length >= 2 && (
            <section className={`${F.card} space-y-2`}>
              <h2 className={F.h2}>Température au réveil</h2>
              <svg viewBox="0 0 300 100" className="h-32 w-full" role="img" aria-label="Courbe de température">
                <polyline fill="none" stroke="#D96A91" strokeWidth="2" points={temps.map((t) => `${(diffDays(t.day, temps[0].day) / Math.max(1, diffDays(temps[temps.length - 1].day, temps[0].day))) * 290 + 5},${95 - ((t.temperature! - tMin) / (tMax - tMin)) * 90}`).join(" ")} />
              </svg>
              <p className="text-xs text-muted-foreground">Une hausse durable d&apos;environ 0,2 à 0,5 °C indique en général que l&apos;ovulation a eu lieu, elle ne la prévoit pas.</p>
            </section>
          )}
          <section className={`${F.card} space-y-2`}>
            <h2 className={F.h2}>Journées notées</h2>
            <ul className="divide-y text-sm">
              {days.slice(0, 40).map((d) => (
                <li key={d.day}><Link prefetch={false} href={`/femme/journal/${d.day}`} className="flex flex-wrap gap-x-2 py-2 hover:text-[#843653]">
                  <strong className="w-28 shrink-0">{fmt(d.day, { weekday: "short", day: "numeric", month: "short" })}</strong>
                  <span className="text-muted-foreground">{[d.flow && d.flow !== "aucun" ? FLOWS[d.flow] : null, d.pain != null ? `douleur ${d.pain}/10` : null, ...d.symptoms.map((s) => SYMPTOMS[s]), d.mood ? MOODS[d.mood] : null].filter(Boolean).join(" · ") || "note"}</span>
                </Link></li>
              ))}
            </ul>
          </section>
        </>
      )}
      <p className="text-xs text-muted-foreground">Les tendances ne sont pas un diagnostic. Montrez-les à votre sage-femme ou à votre médecin si quelque chose vous inquiète.</p>
    </div>
  );
}
