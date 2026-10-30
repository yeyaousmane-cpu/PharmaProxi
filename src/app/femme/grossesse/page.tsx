import Link from "next/link";
import { BellPlus, Siren } from "lucide-react";
import { FemmeGate } from "@/components/femme/gate";
import { FindCare, fmt } from "@/components/femme/bits";
import { F } from "@/components/femme/ui";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { saveFemmeReminder, updateFemmeProfile } from "@/app/actions/femme";
import { femmeData, femmeStatus, isTeen } from "@/lib/femme/server";
import { ancSchedule, postnatalSchedule, pregnancy, todayIso } from "@/lib/femme/cycle";
import { FERTILITY_INFO, MENOPAUSE_INFO, POSTPARTUM_DANGER, POSTPARTUM_INFO, PREGNANCY_DANGER, SOURCES, TRIMESTERS } from "@/lib/femme/content";
import { getSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";

export const metadata = { title: "Grossesse", robots: { index: false } };

function Danger({ items, title, numbers }: { items: string[]; title: string; numbers: string | null }) {
  return (
    <section className="space-y-2 rounded-2xl border border-red-300 bg-red-50 p-4 text-red-950">
      <h2 className="flex items-center gap-2 text-lg font-bold"><Siren className="size-5" aria-hidden /> {title}</h2>
      <ul className="list-disc space-y-1 pl-5 text-sm">{items.map((i) => <li key={i}>{i}</li>)}</ul>
      <p className="text-sm font-semibold">Dans ces cas, allez immédiatement au centre de santé ou à la maternité la plus proche{numbers ? `, ou appelez le ${numbers}` : ""}. <Link prefetch={false} href="/urgences" className="underline">Voir les urgences</Link></p>
    </section>
  );
}

function Sources() {
  return (
    <section className="text-xs text-muted-foreground">
      <p className="font-semibold">Sources</p>
      <ul className="list-disc pl-5">{SOURCES.map((s) => <li key={s.url}><a href={s.url} target="_blank" rel="noopener noreferrer" className="underline">{s.title}</a> — {s.org}, {s.year}</li>)}</ul>
      <p className="mt-1">Informations générales résumées de ces recommandations ; elles n&apos;ont pas encore été relues par un professionnel de santé de PharmaProxi et ne remplacent pas le suivi par une sage-femme ou un médecin.</p>
    </section>
  );
}

export default async function PregnancyPage() {
  const st = await femmeStatus();
  const gate = FemmeGate({ st, path: "/femme/grossesse" });
  if (gate) return gate;
  const today = todayIso();
  const [{ profile }, settings] = await Promise.all([femmeData({ daysFrom: today }), getSettings()]);
  if (!profile) return null;
  const numbers = settings.emergency_numbers?.trim() || null;
  const preg = pregnancy(profile.pregnancy_lmp, profile.pregnancy_due, today);

  if (profile.journey === "grossesse") {
    if (!preg) return (
      <section className={`${F.card} space-y-3`}>
        <h1 className="text-xl font-bold text-[#843653]">Suivi de grossesse</h1>
        <p className="text-sm">Indiquez le premier jour de vos dernières règles, ou la date prévue d&apos;accouchement donnée par la sage-femme.</p>
        <ActionForm action={updateFemmeProfile} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="space-y-1 text-sm font-medium">Dernières règles<input type="date" name="pregnancy_lmp" max={today} className={F.input} /></label>
          <label className="space-y-1 text-sm font-medium">Date prévue d&apos;accouchement<input type="date" name="pregnancy_due" className={F.input} /></label>
          <SubmitButton className={F.btn}>Calculer</SubmitButton>
        </ActionForm>
      </section>
    );
    const t = TRIMESTERS[preg.trimester];
    const anc = ancSchedule(preg.lmp);
    const next = anc.find((c) => c.date >= today);
    return (
      <div className="space-y-4">
        <section className={`${F.card} space-y-3`}>
          <h1 className="text-xl font-bold text-[#843653]">{preg.weeks} semaines d&apos;aménorrhée{preg.extraDays ? ` et ${preg.extraDays} jour(s)` : ""}</h1>
          <div className="h-3 overflow-hidden rounded-full bg-[#F8E7EF]" role="progressbar" aria-valuemin={0} aria-valuemax={40} aria-valuenow={preg.weeks} aria-label="Avancement de la grossesse">
            <div className="h-3 rounded-full bg-[#D96A91]" style={{ width: `${Math.min(100, (preg.days / 280) * 100)}%` }} />
          </div>
          <p className="text-sm">Terme estimé : <strong>{fmt(preg.due, { day: "numeric", month: "long", year: "numeric" })}</strong>{profile.pregnancy_due ? " (date donnée par votre sage-femme ou médecin)" : " (calculé : dernières règles + 280 jours ; l'échographie précise cette date)"}.</p>
          <p className="text-xs text-muted-foreground">Les semaines sont comptées depuis le premier jour des dernières règles (semaines d&apos;aménorrhée, comme sur le carnet de grossesse).</p>
        </section>
        <section className={`${F.card} space-y-2`}>
          <h2 className={F.h2}>{t.title}</h2>
          <p className="text-sm"><strong>Le bébé : </strong>{t.baby}</p>
          <p className="text-sm"><strong>Votre corps : </strong>{t.mother}</p>
          <h3 className="pt-1 text-sm font-bold">À faire pendant ce trimestre</h3>
          <ul className="list-disc space-y-1 pl-5 text-sm">{t.todo.map((x) => <li key={x}>{x}</li>)}</ul>
        </section>
        <section className={`${F.card} space-y-3`}>
          <h2 className={F.h2}>Consultations prénatales</h2>
          <p className="text-sm">L&apos;OMS recommande au moins 8 contacts pendant la grossesse. Dates indicatives pour vous :</p>
          <ol className="grid gap-1.5 sm:grid-cols-2">
            {anc.map((c) => (
              <li key={c.n} className={cn("flex items-center justify-between rounded-xl border px-3 py-2 text-sm", c.date < today ? "border-transparent bg-muted text-muted-foreground" : c === next ? "border-[#D96A91] bg-[#F8E7EF] font-semibold" : "border-[#D96A91]/20")}>
                <span>{c.n}. {c.week} semaines</span><span>{fmt(c.date)}</span>
              </li>
            ))}
          </ol>
          {next && (
            <ActionForm action={saveFemmeReminder}>
              <input type="hidden" name="kind" value="consultation_prenatale" /><input type="hidden" name="label" value={`Consultation prénatale (${next.week} semaines)`} />
              <input type="hidden" name="date" value={next.date} /><input type="hidden" name="time" value="08:00" />
              <SubmitButton className={F.btnOutline}><BellPlus className="size-4" aria-hidden /> Me rappeler la prochaine consultation</SubmitButton>
            </ActionForm>
          )}
          <p className="text-xs text-muted-foreground">Votre sage-femme ou votre médecin peut fixer un autre calendrier : suivez ses indications.</p>
        </section>
        <Danger items={PREGNANCY_DANGER} title="Signes qui imposent d'aller immédiatement à la maternité" numbers={numbers} />
        <FindCare title="Sages-femmes, gynécologues, maternités" />
        <Sources />
      </div>
    );
  }

  if (profile.journey === "postpartum") {
    return (
      <div className="space-y-4">
        <section className={`${F.card} space-y-3`}>
          <h1 className="text-xl font-bold text-[#843653]">Après l&apos;accouchement</h1>
          {profile.delivery_date ? (
            <>
              <p className="text-sm">L&apos;OMS recommande au moins 4 contrôles pour la maman et le bébé :</p>
              <ul className="space-y-1.5">{postnatalSchedule(profile.delivery_date).map((c) => (
                <li key={c.label} className={cn("flex justify-between rounded-xl border px-3 py-2 text-sm", c.to < today ? "bg-muted text-muted-foreground" : "border-[#D96A91]/30")}><span>{c.label}</span><span>{fmt(c.from)}</span></li>
              ))}</ul>
            </>
          ) : <p className="text-sm">Indiquez la date de l&apos;accouchement dans les <Link prefetch={false} href="/femme/reglages" className="underline">réglages</Link>.</p>}
          <ul className="list-disc space-y-1 pl-5 text-sm">{POSTPARTUM_INFO.map((x) => <li key={x}>{x}</li>)}</ul>
        </section>
        <Danger items={POSTPARTUM_DANGER} title="Signes d'alerte après l'accouchement" numbers={numbers} />
        <FindCare />
        <Sources />
      </div>
    );
  }

  const info = profile.journey === "menopause" ? MENOPAUSE_INFO : FERTILITY_INFO;
  return (
    <div className="space-y-4">
      <section className={`${F.card} space-y-3`}>
        <h1 className="text-xl font-bold text-[#843653]">{profile.journey === "menopause" ? "Ménopause" : isTeen(profile) ? "Grossesse : bien s'informer" : "Préparer une grossesse"}</h1>
        {!isTeen(profile) && <ul className="list-disc space-y-1 pl-5 text-sm">{info.map((x) => <li key={x}>{x}</li>)}</ul>}
        {isTeen(profile) && <p className="text-sm">Si tu penses être enceinte, parles-en à une personne de confiance et rends-toi dans un centre de santé : une sage-femme peut t&apos;aider en toute confidentialité.</p>}
        <div className="rounded-xl bg-[#F8E7EF] p-3">
          <p className="text-sm font-semibold">Vous êtes enceinte ?</p>
          <ActionForm action={updateFemmeProfile} className="mt-2 flex flex-wrap items-end gap-2">
            <input type="hidden" name="journey" value="grossesse" />
            <label className="space-y-1 text-sm">Premier jour des dernières règles<input type="date" name="pregnancy_lmp" max={today} className={F.input} /></label>
            <SubmitButton className={F.btn}>Passer au suivi de grossesse</SubmitButton>
          </ActionForm>
        </div>
      </section>
      <FindCare />
    </div>
  );
}
