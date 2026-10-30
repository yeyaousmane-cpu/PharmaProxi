"use client";
import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { activateFemme } from "@/app/actions/femme";
import { AGE_BANDS, AGE_LABEL, JOURNEYS, REGULARITY } from "@/lib/femme/labels";
import { F } from "./ui";

export function OnboardingForm({ today }: { today: string }) {
  const [age, setAge] = useState("");
  const [journey, setJourney] = useState("cycle");
  const teen = age === "13-17";
  const journeys = Object.entries(JOURNEYS).filter(([k]) => !(teen && (k === "conception" || k === "menopause")));
  return (
    <ActionForm action={activateFemme} className="space-y-5">
      <fieldset className="space-y-2">
        <legend className={F.h2}>1. Votre tranche d&apos;âge</legend>
        <p className="text-sm text-muted-foreground">Elle suffit : nous ne demandons pas votre date de naissance.</p>
        <div className="flex flex-wrap gap-2">
          {AGE_BANDS.map((a) => (
            <label key={a} className={F.chip}><input type="radio" name="age_band" value={a} required className="sr-only" onChange={() => { setAge(a); if (a === "13-17" && (journey === "conception" || journey === "menopause")) setJourney("cycle"); }} />{AGE_LABEL[a]}</label>
          ))}
        </div>
        {teen && <p className="rounded-xl bg-[#F8E7EF] p-3 text-sm">Pour les 13-17 ans, l&apos;espace est adapté : suivi des règles, journal, conseils et contacts utiles. Certaines fonctions sont réservées aux adultes.</p>}
      </fieldset>

      <fieldset className="space-y-2">
        <legend className={F.h2}>2. Votre situation</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {journeys.map(([k, v]) => (
            <label key={k} className={`${F.chip} justify-start rounded-xl py-3`}><input type="radio" name="journey" value={k} checked={journey === k} onChange={() => setJourney(k)} className="sr-only" />{v.label}</label>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Vous pourrez changer à tout moment.</p>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className={F.h2}>3. Quelques repères (facultatif)</legend>
        {(journey === "cycle" || journey === "conception") && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm font-medium">Premier jour de vos dernières règles<input type="date" name="last_period" max={today} className={F.input} /></label>
            <label className="space-y-1 text-sm font-medium">Régularité<select name="regularity" className={F.input} defaultValue="ne_sait_pas">{Object.entries(REGULARITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <label className="space-y-1 text-sm font-medium">Durée habituelle du cycle (jours)<input type="number" name="cycle_length" min={15} max={60} defaultValue={28} className={F.input} /></label>
            <label className="space-y-1 text-sm font-medium">Durée habituelle des règles (jours)<input type="number" name="period_length" min={1} max={15} defaultValue={5} className={F.input} /></label>
          </div>
        )}
        {journey === "grossesse" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm font-medium">Premier jour des dernières règles<input type="date" name="pregnancy_lmp" max={today} className={F.input} /></label>
            <label className="space-y-1 text-sm font-medium">Ou date prévue d&apos;accouchement (donnée par la sage-femme)<input type="date" name="pregnancy_due" className={F.input} /></label>
          </div>
        )}
        {journey === "postpartum" && (
          <label className="block space-y-1 text-sm font-medium">Date de l&apos;accouchement<input type="date" name="delivery_date" max={today} className={F.input} /></label>
        )}
        {journey === "menopause" && <p className="text-sm text-muted-foreground">Vous pourrez noter vos symptômes (bouffées de chaleur, sommeil…) et d&apos;éventuels saignements.</p>}
      </fieldset>

      <fieldset className="space-y-3 rounded-2xl border border-[#D96A91]/30 bg-[#F8E7EF]/50 p-4">
        <legend className="sr-only">Accord</legend>
        <label className="flex items-start gap-3 text-sm"><input type="checkbox" name="declared_woman" required className="mt-0.5 size-5 accent-[#D96A91]" />
          <span>Je confirme être une femme ou une jeune fille. <span className="text-muted-foreground">Cet espace leur est réservé.</span></span></label>
        <label className="flex items-start gap-3 text-sm"><input type="checkbox" name="consent" required className="mt-0.5 size-5 accent-[#D96A91]" />
          <span>J&apos;accepte que PharmaProxi enregistre ces informations pour moi seule. Elles ne sont visibles par personne d&apos;autre (ni l&apos;équipe, ni les pharmacies, ni les médecins), jamais vendues ni utilisées pour de la publicité, et je peux les exporter ou les supprimer à tout moment.</span></label>
      </fieldset>
      <SubmitButton className={F.btn} pendingText="Création…">Créer mon espace privé</SubmitButton>
    </ActionForm>
  );
}
