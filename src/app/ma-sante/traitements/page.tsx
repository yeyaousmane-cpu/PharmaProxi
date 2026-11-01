import Link from "next/link";
import { CalendarPlus, Check, Pill, Search } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SanteNav, PRIVACY_NOTE } from "@/components/sante-perso/nav";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Field, Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { saveTreatment, treatmentAction } from "@/app/actions/health-tools";
import { addDays } from "@/lib/vaccines";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Mes traitements" };

type T = { id: string; name: string; dose_note: string | null; times: string[]; start_date: string; duration_days: number | null; units_in_stock: number | null;
  units_per_intake: number; stock_date: string; remind_intake: boolean; remind_renewal: boolean; active: boolean };

function daysLeft(t: T, today: string) {
  if (t.units_in_stock === null) return null;
  const perDay = Number(t.units_per_intake) * t.times.length;
  const elapsed = Math.max(0, Math.round((Date.parse(today) - Date.parse(t.stock_date)) / 86_400_000));
  return Math.max(0, Math.floor(Number(t.units_in_stock) / perDay) - elapsed);
}

function TreatmentForm({ t }: { t?: T }) {
  const times = t?.times ?? ["08:00"];
  return (
    <ActionForm action={saveTreatment} className="grid gap-3 sm:grid-cols-2" resetOnSuccess={!t}>
      {t && <input type="hidden" name="id" value={t.id} />}
      <Field label="Médicament (nom et dosage)" htmlFor={`n-${t?.id ?? "new"}`}><Input id={`n-${t?.id ?? "new"}`} name="name" defaultValue={t?.name} placeholder="ex. Amlodipine 5 mg" required /></Field>
      <Field label="Quantité par prise" htmlFor={`d-${t?.id ?? "new"}`}><Input id={`d-${t?.id ?? "new"}`} name="dose_note" defaultValue={t?.dose_note ?? ""} placeholder="ex. 1 comprimé" /></Field>
      <fieldset className="sm:col-span-2">
        <legend className="mb-1 text-sm font-medium">Heures de prise</legend>
        <div className="flex flex-wrap gap-2">
          {[0, 1, 2, 3].map((i) => <Input key={i} type="time" name="times" defaultValue={times[i] ?? ""} className="h-10 w-32" aria-label={`Heure de prise ${i + 1}`} required={i === 0} />)}
        </div>
      </fieldset>
      <Field label="Début" htmlFor={`s-${t?.id ?? "new"}`}><Input id={`s-${t?.id ?? "new"}`} name="start_date" type="date" defaultValue={t?.start_date ?? new Date().toISOString().slice(0, 10)} /></Field>
      <fieldset>
        <legend className="mb-1 text-sm font-medium">Durée</legend>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label className="flex items-center gap-1.5"><input type="radio" name="duration_mode" value="days" defaultChecked={!t || t.duration_days !== null} /> pendant</label>
          <Input name="duration_days" type="number" min={1} max={730} defaultValue={t?.duration_days ?? 30} className="h-9 w-20" aria-label="Nombre de jours" /> jours
          <label className="flex items-center gap-1.5"><input type="radio" name="duration_mode" value="long" defaultChecked={t?.duration_days === null} /> au long cours</label>
        </div>
      </fieldset>
      <Field label="Comprimés (ou doses) en ma possession" htmlFor={`k-${t?.id ?? "new"}`}><Input id={`k-${t?.id ?? "new"}`} name="units_in_stock" type="number" min={0} step="0.5" defaultValue={t?.units_in_stock ?? ""} placeholder="ex. 30" /></Field>
      <Field label="Comprimés (ou doses) par prise" htmlFor={`u-${t?.id ?? "new"}`}><Input id={`u-${t?.id ?? "new"}`} name="units_per_intake" type="number" min={0.25} step="0.25" defaultValue={t?.units_per_intake ?? 1} /></Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="remind_intake" defaultChecked={t?.remind_intake ?? true} className="size-4" /> Rappel à chaque prise</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="remind_renewal" defaultChecked={t?.remind_renewal ?? true} className="size-4" /> Me prévenir 5 jours avant la fin de la boîte</label>
      <SubmitButton className="w-fit">{t ? "Enregistrer" : "Ajouter le traitement"}</SubmitButton>
    </ActionForm>
  );
}

export default async function Treatments() {
  await requireUser("/ma-sante/traitements");
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const [{ data }, { data: intakes }] = await Promise.all([
    supabase.from("treatments").select("*").order("active", { ascending: false }).order("created_at"),
    supabase.from("treatment_intakes").select("treatment_id, slot, taken_at").eq("day", today),
  ]);
  const list = (data as T[] | null) ?? [];
  const taken = new Set((intakes ?? []).filter((i) => i.taken_at).map((i) => `${i.treatment_id}|${i.slot}`));
  const running = (t: T) => t.active && t.start_date <= today && (t.duration_days === null || addDays(t.start_date, t.duration_days) > today);
  const slots = list.filter(running).flatMap((t) => t.times.map((s) => ({ t, s }))).sort((a, b) => a.s.localeCompare(b.s));
  return (
    <div className="container-page max-w-3xl space-y-5 py-6">
      <header className="space-y-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-brand-deep"><Pill className="size-7 text-primary" aria-hidden /> Mes traitements</h1>
        <p className="text-muted-foreground">Un rappel à chaque prise, et une alerte avant la fin de la boîte avec les pharmacies qui ont votre médicament.</p>
      </header>
      <SanteNav current="/ma-sante/traitements" />

      {slots.length > 0 && (
        <section className="rounded-2xl border border-emerald-200 bg-brand-mint p-4">
          <h2 className="font-bold text-brand-deep">Aujourd&apos;hui</h2>
          <ul className="mt-2 divide-y divide-emerald-200">
            {slots.map(({ t, s }) => {
              const ok = taken.has(`${t.id}|${s}`);
              return (
                <li key={`${t.id}${s}`} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <span><strong className="mr-2 tabular-nums">{s}</strong>{t.name}{t.dose_note ? ` · ${t.dose_note}` : ""}</span>
                  <ActionForm action={treatmentAction}>
                    <input type="hidden" name="id" value={t.id} /><input type="hidden" name="slot" value={s} /><input type="hidden" name="op" value={ok ? "untaken" : "taken"} />
                    <SubmitButton size="sm" variant={ok ? "ghost" : "secondary"} pendingText="…">{ok ? <><Check aria-hidden /> Pris</> : "Je l'ai pris"}</SubmitButton>
                  </ActionForm>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {list.map((t) => {
        const left = daysLeft(t, today);
        const end = t.duration_days !== null ? addDays(t.start_date, t.duration_days) : null;
        return (
          <article key={t.id} className="space-y-3 rounded-2xl border bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-lg font-bold text-brand-deep">{t.name}</p>
                <p className="text-sm text-muted-foreground">{t.dose_note ? `${t.dose_note} · ` : ""}{t.times.join(", ")} · {end ? `jusqu'au ${formatDate(addDays(end, -1))}` : "au long cours"}</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {!t.active && <Badge className="bg-muted text-muted-foreground">En pause</Badge>}
                {end && end <= today && <Badge className="bg-muted text-muted-foreground">Terminé</Badge>}
                {left !== null && <Badge className={left <= 5 ? "border-amber-200 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-800"}>{left} jour(s) de stock</Badge>}
              </div>
            </div>
            {left !== null && left <= 5 && (
              <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-950">Bientôt la fin de la boîte : pensez à renouveler l&apos;ordonnance si besoin. <Link prefetch={false} href={`/recherche?q=${encodeURIComponent(t.name)}`} className="font-semibold underline">Voir les pharmacies qui l&apos;ont</Link></p>
            )}
            <div className="flex flex-wrap gap-2">
              <a href={`/ma-sante/traitements/${t.id}/agenda.ics`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}><CalendarPlus aria-hidden /> Rappels dans l&apos;agenda du téléphone</a>
              <Link prefetch={false} href={`/recherche?q=${encodeURIComponent(t.name)}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}><Search aria-hidden /> Trouver en pharmacie</Link>
              <ActionForm action={treatmentAction} className="flex items-center gap-1.5">
                <input type="hidden" name="id" value={t.id} /><input type="hidden" name="op" value="restock" />
                <Input name="units_in_stock" type="number" min={0} step="0.5" placeholder="J'en ai…" className="h-9 w-24" aria-label="Nouveau stock" />
                <SubmitButton size="sm" variant="ghost">J&apos;ai racheté</SubmitButton>
              </ActionForm>
            </div>
            <details>
              <summary className="cursor-pointer text-sm font-semibold text-primary">Modifier</summary>
              <div className="mt-3 space-y-3">
                <TreatmentForm t={t} />
                <div className="flex gap-2">
                  <ActionForm action={treatmentAction}><input type="hidden" name="id" value={t.id} /><input type="hidden" name="op" value={t.active ? "pause" : "resume"} /><SubmitButton size="sm" variant="outline">{t.active ? "Mettre en pause" : "Reprendre"}</SubmitButton></ActionForm>
                  <ActionForm action={treatmentAction}><input type="hidden" name="id" value={t.id} /><input type="hidden" name="op" value="delete" /><SubmitButton size="sm" variant="ghost" confirm={`Supprimer ${t.name} ?`}>Supprimer</SubmitButton></ActionForm>
                </div>
              </div>
            </details>
          </article>
        );
      })}

      <section className="rounded-2xl border bg-white p-5">
        <h2 className="text-lg font-bold text-brand-deep">Ajouter un traitement</h2>
        <p className="mb-3 text-sm text-muted-foreground">Recopiez votre ordonnance : PharmaProxi ne modifie jamais un traitement et ne donne pas de conseil de dose.</p>
        <TreatmentForm />
      </section>
      <p className="text-xs text-muted-foreground">Les rappels apparaissent dans vos notifications PharmaProxi. Pour une sonnerie même sans connexion, utilisez « Rappels dans l&apos;agenda du téléphone ». {PRIVACY_NOTE}</p>
    </div>
  );
}
