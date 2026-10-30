import Link from "next/link";
import { Bell, CalendarHeart, Droplet, Lightbulb, NotebookPen } from "lucide-react";
import { FemmeGate } from "@/components/femme/gate";
import { Estimate, FindCare, fmt } from "@/components/femme/bits";
import { F } from "@/components/femme/ui";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { saveFemmePeriod } from "@/app/actions/femme";
import { femmeData, femmeStatus, isTeen } from "@/lib/femme/server";
import { ancSchedule, diffDays, postnatalSchedule, pregnancy, summarize, todayIso } from "@/lib/femme/cycle";
import { DAILY_TIPS } from "@/lib/femme/content";
import { JOURNEYS, SYMPTOMS } from "@/lib/femme/labels";
import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Mon espace", description: "Espace privé de santé féminine : cycle, fertilité, grossesse, symptômes et rappels.", robots: { index: false } };

export default async function FemmeHome() {
  const st = await femmeStatus();
  const gate = FemmeGate({ st, path: "/femme" });
  if (gate) return gate;
  const today = todayIso();
  const [{ profile, periods, days }, session, supabase] = await Promise.all([femmeData(), getSession(), createClient()]);
  if (!profile) return null;
  const teen = isTeen(profile);
  const s = summarize(periods, profile.cycle_length, profile.period_length, today);
  const preg = profile.journey === "grossesse" ? pregnancy(profile.pregnancy_lmp, profile.pregnancy_due, today) : null;
  const { data: reminders } = await supabase.from("femme_reminders").select("id, label, due_at").eq("done", false).order("due_at").limit(3);
  const recent = days.filter((d) => diffDays(today, d.day) < 30);
  const counts = new Map<string, number>();
  for (const d of recent) for (const x of d.symptoms) counts.set(x, (counts.get(x) ?? 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  const pains = recent.filter((d) => d.pain !== null).map((d) => d.pain!);
  const tip = DAILY_TIPS[Math.floor(Date.parse(today) / 86_400_000) % DAILY_TIPS.length];
  const inPeriod = s.lastStart && periods[0] && !periods[0].end_date && diffDays(today, s.lastStart) < 10;
  const name = session?.fullName?.split(" ")[0];

  return (
    <div className="space-y-4">
      <section className="rounded-2xl bg-gradient-to-br from-[#D96A91] to-[#843653] p-5 text-white shadow-sm">
        <p className="text-sm opacity-90">{JOURNEYS[profile.journey].short}</p>
        <h1 className="text-2xl font-bold">Bonjour{name ? ` ${name}` : ""} 🌸</h1>
        {(profile.journey === "cycle" || profile.journey === "conception") && (
          s.lastStart ? (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-white/15 p-3"><p className="text-xs opacity-90">Aujourd&apos;hui</p><p className="text-xl font-bold">Jour {s.cycleDay}</p><p className="text-xs opacity-90">du cycle</p></div>
              <div className="rounded-xl bg-white/15 p-3">
                <p className="text-xs opacity-90">Prochaines règles (estimation)</p>
                {s.late > 0 ? <p className="text-lg font-bold">{s.late} jour{s.late > 1 ? "s" : ""} de retard</p>
                  : <p className="text-lg font-bold">{fmt(s.nextStart)}</p>}
                {s.late === 0 && <p className="text-xs opacity-90">dans {diffDays(s.nextStart!, today)} jour(s)</p>}
              </div>
              {!teen && s.fertileStart && s.fertileEnd! >= today && (
                <div className="col-span-2 rounded-xl bg-white/15 p-3 text-sm">Période fertile estimée : <strong>{fmt(s.fertileStart)} – {fmt(s.fertileEnd)}</strong> (ovulation vers le {fmt(s.ovulation)})</div>
              )}
            </div>
          ) : <p className="mt-2 text-sm">Notez le premier jour de vos prochaines règles pour obtenir vos prévisions.</p>
        )}
        {profile.journey === "grossesse" && (preg ? (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-white/15 p-3"><p className="text-xs opacity-90">Grossesse</p><p className="text-xl font-bold">{preg.weeks} SA {preg.extraDays ? `+ ${preg.extraDays} j` : ""}</p><p className="text-xs opacity-90">{preg.trimester}{preg.trimester === 1 ? "er" : "e"} trimestre</p></div>
            <div className="rounded-xl bg-white/15 p-3"><p className="text-xs opacity-90">Terme estimé</p><p className="text-lg font-bold">{fmt(preg.due, { day: "numeric", month: "long", year: "numeric" })}</p><p className="text-xs opacity-90">{preg.daysLeft > 0 ? `dans ${preg.daysLeft} jours` : "terme atteint"}</p></div>
            {(() => { const next = ancSchedule(preg.lmp).find((c) => c.date >= today); return next ? <div className="col-span-2 rounded-xl bg-white/15 p-3 text-sm">Prochaine consultation prénatale conseillée : <strong>vers le {fmt(next.date)}</strong> ({next.week} semaines)</div> : null; })()}
          </div>
        ) : <p className="mt-2 text-sm">Indiquez la date de vos dernières règles ou la date prévue d&apos;accouchement dans <Link href="/femme/reglages" className="underline">Réglages</Link>.</p>)}
        {profile.journey === "postpartum" && (profile.delivery_date ? (
          <div className="mt-3 rounded-xl bg-white/15 p-3"><p className="text-xl font-bold">{Math.floor(diffDays(today, profile.delivery_date) / 7)} semaine(s) après la naissance</p>
            {(() => { const next = postnatalSchedule(profile.delivery_date!).find((c) => c.to >= today); return next ? <p className="text-sm">Contrôle conseillé : {next.label.toLowerCase()} ({fmt(next.from)})</p> : null; })()}
          </div>
        ) : <p className="mt-2 text-sm">Indiquez la date de l&apos;accouchement dans les réglages.</p>)}
        {profile.journey === "menopause" && (
          <p className="mt-2 text-sm">{s.lastStart ? `Derniers saignements notés : ${fmt(s.lastStart, { day: "numeric", month: "long", year: "numeric" })}.` : "Notez vos symptômes et tout saignement dans le journal."}</p>
        )}
      </section>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(profile.journey === "cycle" || profile.journey === "conception" || profile.journey === "menopause") && (
          inPeriod ? (
            <ActionForm action={saveFemmePeriod}>
              <input type="hidden" name="id" value={periods[0].id} /><input type="hidden" name="start" value={periods[0].start_date} /><input type="hidden" name="end" value={today} />
              <SubmitButton className={`${F.btnOutline} h-auto w-full flex-col whitespace-normal py-3 text-center`}><Droplet className="size-5" aria-hidden /> Mes règles sont finies</SubmitButton>
            </ActionForm>
          ) : (
            <ActionForm action={saveFemmePeriod}>
              <input type="hidden" name="start" value={today} />
              <SubmitButton className={`${F.btn} h-auto w-full flex-col whitespace-normal py-3 text-center`}><Droplet className="size-5" aria-hidden /> Mes règles ont commencé</SubmitButton>
            </ActionForm>
          )
        )}
        <Link prefetch={false} href={`/femme/journal/${today}`} className={`${F.btnOutline} h-auto flex-col py-3`}><NotebookPen className="size-5" aria-hidden /> Noter ma journée</Link>
        <Link prefetch={false} href="/femme/calendrier" className={`${F.btnOutline} h-auto flex-col py-3`}><CalendarHeart className="size-5" aria-hidden /> Calendrier</Link>
        <Link prefetch={false} href="/femme/rappels" className={`${F.btnOutline} h-auto flex-col py-3`}><Bell className="size-5" aria-hidden /> Rappels</Link>
      </div>

      {s.irregular && s.cyclesCounted >= 2 && (profile.journey === "cycle" || profile.journey === "conception") && (
        <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm">Vos derniers cycles varient beaucoup (de {s.variation} jours) ou sortent de l&apos;intervalle habituel de 21 à 35 jours : les prévisions sont moins fiables. Si cela persiste, parlez-en à une sage-femme ou à un médecin.</p>
      )}
      {s.late >= 7 && profile.journey !== "grossesse" && profile.journey !== "menopause" && (
        <p className="rounded-xl border border-[#D96A91]/40 bg-white p-3 text-sm">Retard de règles d&apos;une semaine ou plus : un test de grossesse (en pharmacie) peut aider à faire le point. Le stress, une maladie ou un changement de poids peuvent aussi décaler les règles. <Link prefetch={false} href="/femme/bibliotheque" className="font-semibold text-[#843653] underline">En savoir plus</Link></p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <section className={`${F.card} space-y-2`}>
          <h2 className={F.h2}>Mes 30 derniers jours</h2>
          {recent.length === 0 ? <p className="text-sm text-muted-foreground">Rien de noté pour l&apos;instant.</p> : (
            <>
              <p className="text-sm">{recent.length} jour(s) noté(s){pains.length ? ` · douleur moyenne ${(pains.reduce((a, b) => a + b, 0) / pains.length).toFixed(1)}/10` : ""}</p>
              {top.length > 0 && <ul className="flex flex-wrap gap-1.5">{top.map(([k, n]) => <li key={k} className="rounded-full bg-[#F8E7EF] px-2.5 py-1 text-xs font-semibold text-[#843653]">{SYMPTOMS[k] ?? k} × {n}</li>)}</ul>}
              <Link prefetch={false} href="/femme/journal" className="text-sm font-semibold text-[#843653] underline">Voir l&apos;historique et les tendances</Link>
            </>
          )}
        </section>
        <section className={`${F.card} space-y-2`}>
          <h2 className={F.h2}>Prochaines échéances</h2>
          {(reminders ?? []).length === 0 ? <p className="text-sm text-muted-foreground">Aucun rappel programmé.</p> : (
            <ul className="space-y-1 text-sm">{(reminders ?? []).map((r) => <li key={r.id}><strong>{fmt(String(r.due_at).slice(0, 10))}</strong> · {r.label}</li>)}</ul>
          )}
          <Link prefetch={false} href="/femme/rappels" className="text-sm font-semibold text-[#843653] underline">Gérer mes rappels</Link>
        </section>
      </div>

      <section className="flex gap-3 rounded-2xl bg-[#F8E7EF] p-4">
        <Lightbulb className="size-6 shrink-0 text-[#D96A91]" aria-hidden />
        <div><h2 className="font-bold text-[#843653]">Conseil du jour</h2><p className="text-sm">{tip}</p></div>
      </section>

      <FindCare />
      <Estimate />
    </div>
  );
}
