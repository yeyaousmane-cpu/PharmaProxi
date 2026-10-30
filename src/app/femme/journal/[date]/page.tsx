import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { FemmeGate } from "@/components/femme/gate";
import { fmt } from "@/components/femme/bits";
import { F } from "@/components/femme/ui";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { saveFemmeDay } from "@/app/actions/femme";
import { femmeData, femmeStatus, isTeen } from "@/lib/femme/server";
import { openNote } from "@/lib/femme/crypto";
import { addDays, todayIso } from "@/lib/femme/cycle";
import { FLOWS, MOODS, MUCUS, SLEEP, SYMPTOMS, TESTS } from "@/lib/femme/labels";

export const metadata = { title: "Ma journée", robots: { index: false } };

function Radios({ name, options, value, legend }: { name: string; options: Record<string, string>; value: string | null; legend: string }) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-bold text-[#843653]">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        <label className={F.chip}><input type="radio" name={name} value="" defaultChecked={!value} className="sr-only" />—</label>
        {Object.entries(options).map(([k, v]) => <label key={k} className={F.chip}><input type="radio" name={name} value={k} defaultChecked={value === k} className="sr-only" />{v}</label>)}
      </div>
    </fieldset>
  );
}

export default async function DayPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) notFound();
  const st = await femmeStatus();
  const gate = FemmeGate({ st, path: `/femme/journal/${date}` });
  if (gate) return gate;
  const today = todayIso();
  const { profile, days } = await femmeData({ daysFrom: date, daysTo: date });
  if (!profile) return null;
  const d = days[0];
  const teen = isTeen(profile);
  const fertility = !teen && (profile.journey === "cycle" || profile.journey === "conception");
  const tests = Object.fromEntries(Object.entries(TESTS).filter(([k]) => !(teen && k.startsWith("ovulation"))));
  const future = date > today;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link prefetch={false} href={`/femme/journal/${addDays(date, -1)}`} className="rounded-full p-2 hover:bg-[#F8E7EF]" aria-label="Jour précédent"><ChevronLeft aria-hidden /></Link>
        <h1 className="text-lg font-bold capitalize text-[#843653]">{date === today ? "Aujourd'hui, " : ""}{fmt(date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</h1>
        {date < today ? <Link prefetch={false} href={`/femme/journal/${addDays(date, 1)}`} className="rounded-full p-2 hover:bg-[#F8E7EF]" aria-label="Jour suivant"><ChevronRight aria-hidden /></Link> : <span className="w-10" />}
      </div>
      {future ? <p className={F.card}>Vous ne pouvez pas encore noter cette journée.</p> : (
        <section className={F.card}>
          <ActionForm action={saveFemmeDay} className="space-y-5">
            <input type="hidden" name="day" value={date} />
            <Radios name="flow" legend="Saignements" options={FLOWS} value={d?.flow ?? null} />
            {profile.journey === "grossesse" && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-900">Pendant la grossesse, tout saignement doit faire consulter rapidement une sage-femme ou un médecin.</p>}
            <fieldset className="space-y-2">
              <legend className="text-sm font-bold text-[#843653]">Symptômes</legend>
              <div className="flex flex-wrap gap-2">
                {Object.entries(SYMPTOMS).map(([k, v]) => <label key={k} className={F.chip}><input type="checkbox" name="symptoms" value={k} defaultChecked={d?.symptoms.includes(k)} className="sr-only" />{v}</label>)}
              </div>
            </fieldset>
            <fieldset className="space-y-2">
              <legend className="text-sm font-bold text-[#843653]">Douleur (0 = aucune, 10 = insupportable)</legend>
              <div className="flex flex-wrap gap-1.5">
                <label className={F.chip}><input type="radio" name="pain" value="" defaultChecked={d?.pain == null} className="sr-only" />—</label>
                {Array.from({ length: 11 }, (_, i) => <label key={i} className={`${F.chip} min-w-10 justify-center`}><input type="radio" name="pain" value={i} defaultChecked={d?.pain === i} className="sr-only" />{i}</label>)}
              </div>
            </fieldset>
            <Radios name="mood" legend="Humeur" options={MOODS} value={d?.mood ?? null} />
            <Radios name="sleep" legend="Sommeil" options={SLEEP} value={d?.sleep != null ? String(d.sleep) : null} />
            {fertility && <Radios name="mucus" legend="Glaire cervicale" options={MUCUS} value={d?.mucus ?? null} />}
            {fertility && (
              <label className="block max-w-xs space-y-1 text-sm font-bold text-[#843653]">Température au réveil (°C)
                <input type="text" inputMode="decimal" name="temperature" placeholder="36,5" defaultValue={d?.temperature != null ? String(d.temperature).replace(".", ",") : ""} className={F.input} />
                <span className="block text-xs font-normal text-muted-foreground">Prise le matin avant de vous lever, toujours de la même façon.</span>
              </label>
            )}
            {!teen && (
              <fieldset className="space-y-2">
                <legend className="text-sm font-bold text-[#843653]">Rapport sexuel (facultatif)</legend>
                <div className="flex flex-wrap gap-2">
                  {[["", "—"], ["protege", "Protégé"], ["non_protege", "Non protégé"]].map(([k, v]) => <label key={k} className={F.chip}><input type="radio" name="intercourse" value={k} defaultChecked={(d?.intercourse ?? "") === k} className="sr-only" />{v}</label>)}
                </div>
              </fieldset>
            )}
            <Radios name="test_result" legend="Test" options={tests} value={d?.test_result ?? null} />
            <label className="block space-y-1 text-sm font-bold text-[#843653]">Note personnelle
              <textarea name="note" maxLength={1000} rows={3} defaultValue={openNote(d?.note ?? null) ?? ""} className="w-full rounded-xl border border-input bg-white p-3 text-base font-normal text-[#29232A] focus:outline-none focus:ring-2 focus:ring-[#D96A91]" />
            </label>
            <SubmitButton className={`${F.btn} w-full sm:w-auto`} pendingText="Enregistrement…">Enregistrer ma journée</SubmitButton>
          </ActionForm>
        </section>
      )}
      {d?.symptoms.includes("saignement_inhabituel") && (
        <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm">Vous avez noté un saignement inhabituel. S&apos;il se répète, est abondant, survient après un rapport ou après la ménopause, consultez une sage-femme ou un médecin.</p>
      )}
      <p className="text-xs text-muted-foreground">Ce journal vous aide à suivre vos ressentis et à en parler avec un professionnel. Il ne pose aucun diagnostic.</p>
    </div>
  );
}
