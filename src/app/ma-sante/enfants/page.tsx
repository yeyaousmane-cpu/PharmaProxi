import Link from "next/link";
import { Baby, ChevronRight } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SanteNav, PRIVACY_NOTE } from "@/components/sante-perso/nav";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Field, Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { addChild } from "@/app/actions/health-tools";
import { ageLabel, buildVisits, nextVisit, STATUS_LABEL, type Dose } from "@/lib/vaccines";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Carnet de vaccination" };

export default async function Children() {
  await requireUser("/ma-sante/enfants");
  const supabase = await createClient();
  const [{ data: kids }, { data: sched }, { data: vacc }] = await Promise.all([
    supabase.from("children").select("id, first_name, birth_date, sex").order("birth_date"),
    supabase.from("vaccine_schedule").select("*"),
    supabase.from("child_vaccinations").select("child_id, dose_code, done_on"),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="container-page max-w-3xl space-y-5 py-6">
      <header className="space-y-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-brand-deep"><Baby className="size-7 text-primary" aria-hidden /> Carnet de vaccination</h1>
        <p className="text-muted-foreground">Le calendrier officiel du ministère de la Santé, calculé pour chaque enfant, avec un rappel 3 jours avant chaque rendez-vous.</p>
      </header>
      <SanteNav current="/ma-sante/enfants" />
      {(kids ?? []).length > 0 && (
        <ul className="grid gap-3">
          {(kids ?? []).map((k) => {
            const done = Object.fromEntries((vacc ?? []).filter((v) => v.child_id === k.id).map((v) => [v.dose_code, v.done_on]));
            const visits = buildVisits((sched ?? []) as Dose[], k.birth_date, k.sex, done);
            const next = nextVisit(visits);
            const late = visits.filter((v) => v.status === "en_retard").length;
            return (
              <li key={k.id}>
                <Link prefetch={false} href={`/ma-sante/enfants/${k.id}`} className="flex items-center justify-between gap-3 rounded-2xl border bg-white p-4 shadow-sm hover:border-primary">
                  <span>
                    <span className="block text-lg font-bold text-brand-deep">{k.first_name} <span className="text-sm font-normal text-muted-foreground">· {ageLabel(k.birth_date)}</span></span>
                    <span className="text-sm">{next ? <>Prochain rendez-vous : <strong>{next.label}</strong>{next.due >= today ? ` le ${formatDate(next.due)}` : ""}</> : "Tous les vaccins du calendrier sont notés."}</span>
                    {late > 0 && <Badge className="ml-2 border-amber-200 bg-amber-50 text-amber-900">{late} {STATUS_LABEL.en_retard.toLowerCase()}</Badge>}
                  </span>
                  <ChevronRight className="size-5 shrink-0 text-primary" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <section className="rounded-2xl border bg-white p-5">
        <h2 className="text-lg font-bold text-brand-deep">Ajouter un enfant</h2>
        <ActionForm action={addChild} className="mt-3 grid gap-3 sm:grid-cols-3">
          <Field label="Prénom" htmlFor="fn"><Input id="fn" name="first_name" required maxLength={60} /></Field>
          <Field label="Date de naissance" htmlFor="bd"><Input id="bd" name="birth_date" type="date" required max={today} /></Field>
          <Field label="Sexe" htmlFor="sx"><Select id="sx" name="sex" defaultValue=""><option value="">—</option><option value="F">Fille</option><option value="M">Garçon</option></Select></Field>
          <label className="flex items-start gap-2 text-sm sm:col-span-3"><input type="checkbox" name="already" className="mt-0.5 size-4" /> Les vaccins passés ont déjà été faits (je les coche tous ; je pourrai corriger ensuite)</label>
          <p className="text-xs text-muted-foreground sm:col-span-3">Le sexe sert seulement à afficher le vaccin HPV, proposé aux filles de 10 ans. {PRIVACY_NOTE}</p>
          <SubmitButton className="w-fit">Créer le carnet</SubmitButton>
        </ActionForm>
      </section>
      <p className="text-xs text-muted-foreground">Calendrier : <a href="https://www.sante.gov.ml/index.php?option=com_content&view=category&id=43&Itemid=106" target="_blank" rel="noopener noreferrer" className="underline">ministère de la Santé du Mali</a>. Ce carnet ne remplace pas le carnet officiel remis par le centre de santé : apportez toujours ce dernier.</p>
    </div>
  );
}
