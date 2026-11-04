import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarPlus, CheckCircle2, Circle, Clock, TriangleAlert } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SanteNav } from "@/components/sante-perso/nav";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Field, Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { markVisitDone, setDose, updateChild } from "@/app/actions/health-tools";
import { ageLabel, buildVisits, STATUS_LABEL, type Dose, type DoseStatus } from "@/lib/vaccines";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { GrowthSection } from "@/components/growth/growth-section";
import { AudioGuide } from "@/components/audio/audio-guide";

export const metadata = { title: "Carnet de vaccination" };

const TONE: Record<DoseStatus, string> = {
  fait: "border-emerald-200 bg-emerald-50 text-emerald-800", proche: "border-blue-200 bg-blue-50 text-brand-blue",
  a_venir: "bg-muted text-muted-foreground", en_retard: "border-amber-200 bg-amber-50 text-amber-900",
};

export default async function ChildCard({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  await requireUser(`/ma-sante/enfants/${id}`);
  const supabase = await createClient();
  const [{ data: k }, { data: sched }, { data: vacc }, { data: growth }] = await Promise.all([
    supabase.from("children").select("*").eq("id", id).maybeSingle(),
    supabase.from("vaccine_schedule").select("*"),
    supabase.from("child_vaccinations").select("dose_code, done_on").eq("child_id", id),
    supabase.from("child_growth").select("id, measured_on, weight_kg, height_cm, place").eq("child_id", id).order("measured_on"),
  ]);
  if (!k) notFound();
  const visits = buildVisits((sched ?? []) as Dose[], k.birth_date, k.sex, Object.fromEntries((vacc ?? []).map((v) => [v.dose_code, v.done_on])));
  const today = new Date().toISOString().slice(0, 10);
  const late = visits.filter((v) => v.status === "en_retard");
  return (
    <div className="container-page max-w-3xl space-y-5 py-6">
      <p className="text-sm"><Link prefetch={false} href="/ma-sante/enfants" className="text-primary underline">Carnet de vaccination</Link> › {k.first_name}</p>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand-deep">{k.first_name}</h1>
          <p className="text-muted-foreground">Né(e) le {formatDate(k.birth_date)} · {ageLabel(k.birth_date)}</p>
        </div>
        <a href={`/ma-sante/enfants/${k.id}/agenda.ics`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}><CalendarPlus aria-hidden /> Ajouter les rendez-vous à mon agenda</a>
      </header>
      <SanteNav current="/ma-sante/enfants" />
      <AudioGuide target="vaccination-enfants" />
      <p className="text-sm"><a href="#croissance" className="font-semibold text-primary underline">Voir la courbe de croissance</a></p>
      {late.length > 0 && (
        <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"><TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>Des vaccins semblent en retard ({late.map((v) => v.label).join(", ")}). <strong>Il n&apos;est pas trop tard</strong> : allez au centre de santé avec le carnet, l&apos;agent reprendra le calendrier. S&apos;ils ont été faits, cochez-les ci-dessous.</span></p>
      )}
      <ol className="space-y-3">
        {visits.map((v) => {
          const missing = v.doses.filter((d) => d.status !== "fait").map((d) => d.code);
          return (
            <li key={v.key} className="rounded-2xl border bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-bold text-brand-deep">{v.label} <span className="text-sm font-normal text-muted-foreground">· {v.due < today && v.status !== "fait" ? `prévu le ${formatDate(v.due)}` : formatDate(v.due)}</span></p>
                <Badge className={TONE[v.status]}>{STATUS_LABEL[v.status]}</Badge>
              </div>
              <ul className="mt-2 divide-y">
                {v.doses.map((d) => (
                  <li key={d.code} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <span className="flex items-start gap-2">
                      {d.status === "fait" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden /> : d.status === "en_retard" ? <Clock className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden /> : <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />}
                      <span><span className="font-medium">{d.label}</span><span className="block text-xs text-muted-foreground">{d.protects}{d.done_on ? ` · fait le ${formatDate(d.done_on)}` : ""}</span></span>
                    </span>
                    <ActionForm action={setDose}>
                      <input type="hidden" name="child_id" value={k.id} /><input type="hidden" name="dose_code" value={d.code} /><input type="hidden" name="done" value={d.done_on ? "0" : "1"} />
                      <SubmitButton size="sm" variant={d.done_on ? "ghost" : "outline"} disabled={!d.done_on && v.due > today} pendingText="…">{d.done_on ? "Annuler" : "Fait"}</SubmitButton>
                    </ActionForm>
                  </li>
                ))}
              </ul>
              {missing.length > 1 && v.due <= today && (
                <ActionForm action={markVisitDone} className="mt-2 flex flex-wrap items-end gap-2">
                  <input type="hidden" name="child_id" value={k.id} /><input type="hidden" name="codes" value={missing.join(",")} />
                  <label className="text-xs">Date<Input name="done_on" type="date" max={today} defaultValue={today} className="h-9 w-40" /></label>
                  <SubmitButton size="sm" variant="secondary">Tous les vaccins de ce rendez-vous sont faits</SubmitButton>
                </ActionForm>
              )}
            </li>
          );
        })}
      </ol>
      <GrowthSection childId={k.id} birth={k.birth_date} sex={k.sex} firstName={k.first_name} rows={growth ?? []} />
      <p className="text-sm text-muted-foreground">Après les 3 doses contre le paludisme, deux rappels sont prévus, espacés de 6 à 12 mois : l&apos;agent de santé vous indiquera les dates.</p>
      <details className="rounded-2xl border bg-white p-4">
        <summary className="cursor-pointer font-semibold">Modifier ou supprimer ce carnet</summary>
        <ActionForm action={updateChild} className="mt-3 grid gap-3 sm:grid-cols-3">
          <input type="hidden" name="id" value={k.id} />
          <Field label="Prénom" htmlFor="fn"><Input id="fn" name="first_name" defaultValue={k.first_name} required /></Field>
          <Field label="Date de naissance" htmlFor="bd"><Input id="bd" name="birth_date" type="date" defaultValue={k.birth_date} max={today} required /></Field>
          <Field label="Sexe" htmlFor="sx"><Select id="sx" name="sex" defaultValue={k.sex ?? ""}><option value="">—</option><option value="F">Fille</option><option value="M">Garçon</option></Select></Field>
          <label className="flex items-center gap-2 text-sm sm:col-span-3"><input type="checkbox" name="remind" defaultChecked={k.remind} className="size-4" /> Me rappeler 3 jours avant chaque rendez-vous</label>
          <div className="flex flex-wrap gap-2 sm:col-span-3">
            <SubmitButton size="sm">Enregistrer</SubmitButton>
            <SubmitButton size="sm" variant="ghost" name="delete" value="1" confirm={`Supprimer le carnet de ${k.first_name} ?`}>Supprimer le carnet</SubmitButton>
          </div>
        </ActionForm>
      </details>
    </div>
  );
}
