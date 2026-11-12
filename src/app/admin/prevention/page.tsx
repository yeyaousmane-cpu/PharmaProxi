import { CalendarDays } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { savePreventionEvent } from "@/app/actions/v027";
import { saveProgramNational, linkToProgram } from "@/app/actions/v042";
import type { Program } from "@/lib/prevention-programs";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { formatDate } from "@/lib/format";
import { PREVENTION_KINDS, type PreventionEvent } from "@/lib/prevention";

export const metadata = { title: "Prévention — administration" };

const KIND: Record<string, string> = { campagne: "Campagne", depistage: "Dépistage", vaccination: "Vaccination", sensibilisation: "Sensibilisation", journee_mondiale: "Journée mondiale" };
const STATUS: Record<string, string> = { brouillon: "Brouillon (non visible)", publie: "Publié", annule: "Annulé (affiché comme annulé)" };

function EventForm({ e, regions }: { e?: PreventionEvent; regions: { id: string; name: string }[] }) {
  const k = e?.id ?? "new";
  return (
    <ActionForm action={savePreventionEvent} className="grid gap-3 sm:grid-cols-2">
      {e && <input type="hidden" name="id" value={e.id} />}
      <Field label="Type" htmlFor={`kind-${k}`} required><Select id={`kind-${k}`} name="kind" defaultValue={e?.kind ?? "campagne"}>{PREVENTION_KINDS.map((x) => <option key={x} value={x}>{KIND[x]}</option>)}</Select></Field>
      <Field label="Statut" htmlFor={`status-${k}`} required><Select id={`status-${k}`} name="status" defaultValue={e?.status ?? "brouillon"}>{Object.entries(STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
      <Field label="Titre" htmlFor={`title-${k}`} required className="sm:col-span-2"><Input id={`title-${k}`} name="title" defaultValue={e?.title} required minLength={5} maxLength={160} /></Field>
      <Field label="Description" htmlFor={`desc-${k}`} className="sm:col-span-2"><Textarea id={`desc-${k}`} name="description" defaultValue={e?.description} rows={3} maxLength={1500} /></Field>
      <Field label="Début" htmlFor={`start-${k}`} required><Input id={`start-${k}`} type="date" name="starts_on" defaultValue={e?.starts_on} required /></Field>
      <Field label="Fin (facultatif)" htmlFor={`end-${k}`}><Input id={`end-${k}`} type="date" name="ends_on" defaultValue={e?.ends_on ?? ""} /></Field>
      <Field label="Région" htmlFor={`region-${k}`}><Select id={`region-${k}`} name="region_id" defaultValue={e?.region_id ?? ""}><option value="">Tout le pays</option>{regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></Field>
      <Field label="Lieu" htmlFor={`place-${k}`}><Input id={`place-${k}`} name="place" defaultValue={e?.place ?? ""} maxLength={200} /></Field>
      <Field label="Public concerné" htmlFor={`pub-${k}`}><Input id={`pub-${k}`} name="public_concerned" defaultValue={e?.public_concerned ?? ""} maxLength={200} placeholder="Ex. enfants de 0 à 5 ans" /></Field>
      <Field label="Gratuit ?" htmlFor={`free-${k}`}><Select id={`free-${k}`} name="is_free" defaultValue={e?.is_free === null || e?.is_free === undefined ? "" : String(e.is_free)}><option value="">Non précisé</option><option value="true">Oui</option><option value="false">Non</option></Select></Field>
      <Field label="Organisateur" htmlFor={`org-${k}`} required><Input id={`org-${k}`} name="organizer" defaultValue={e?.organizer} required maxLength={160} placeholder="Ex. Ministère de la Santé, ONG…" /></Field>
      <Field label="Source officielle" htmlFor={`src-${k}`} required hint="Communiqué, site officiel, courrier : d'où vient l'information ?"><Input id={`src-${k}`} name="source_name" defaultValue={e?.source_name} required maxLength={200} /></Field>
      <Field label="Lien de la source (https://)" htmlFor={`url-${k}`} className="sm:col-span-2"><Input id={`url-${k}`} name="source_url" type="url" defaultValue={e?.source_url ?? ""} dir="ltr" /></Field>
      <div className="sm:col-span-2"><SubmitButton>{e ? "Enregistrer" : "Ajouter l'événement"}</SubmitButton></div>
    </ActionForm>
  );
}

function LinkForm({ kind, id, current, programs }: { kind: "event" | "article"; id: string; current: string | null; programs: Program[] }) {
  return (
    <ActionForm action={linkToProgram} className="mt-2 flex flex-wrap items-end gap-2"><input type="hidden" name="kind" value={kind} /><input type="hidden" name="id" value={id} />
      <Select name="program" defaultValue={current ?? ""} aria-label="Programme de prévention" className="h-9"><option value="">Aucun programme</option>{programs.map((p) => <option key={p.slug} value={p.slug}>{p.title}</option>)}</Select>
      <SubmitButton size="sm" variant="ghost">Rattacher</SubmitButton>
    </ActionForm>
  );
}

export default async function AdminPrevention() {
  const supabase = await createClient();
  const [{ data: progs }, { data: arts }] = await Promise.all([
    supabase.from("prevention_programs").select("*").order("sort_order"),
    supabase.from("health_articles").select("id, title, status, program_slug").eq("kind", "prevention").order("title").limit(100),
  ]);
  const programs = (progs ?? []) as Program[];
  const [{ data: ev }, { data: regions }] = await Promise.all([
    supabase.from("prevention_events").select("*, regions(name)").order("starts_on", { ascending: false }).limit(200),
    supabase.from("regions").select("id, name").order("name"),
  ]);
  const events = (ev ?? []) as PreventionEvent[];
  return (
    <div className="space-y-5">
      <h1 className="flex items-center gap-2 text-2xl font-bold"><CalendarDays className="size-6 text-brand-green" aria-hidden /> Calendrier de prévention</h1>
      <p className="max-w-3xl text-sm text-muted-foreground">Campagnes, dépistages, vaccinations, sensibilisation, journées mondiales. Publiez uniquement un événement annoncé par l&apos;organisme responsable, avec sa source : SantéProxi n&apos;invente aucune campagne. Un brouillon n&apos;est pas visible du public.</p>
      <section className="rounded-2xl border bg-white p-4" aria-labelledby="prev-new">
        <h2 id="prev-new" className="font-semibold">Ajouter un événement</h2>
        <div className="mt-3"><EventForm regions={regions ?? []} /></div>
      </section>
      {events.length === 0 ? <p className="text-sm text-muted-foreground">Aucun événement enregistré.</p> : (
        <ul className="space-y-2">{events.map((e) => (
          <li key={e.id}><details className="rounded-2xl border bg-white p-4">
            <summary className="cursor-pointer"><span className="font-semibold">{e.title}</span> <span className="text-sm text-muted-foreground">· {KIND[e.kind]} · {formatDate(e.starts_on)} · {STATUS[e.status]}</span></summary>
            <div className="mt-3"><EventForm e={e} regions={regions ?? []} /></div>
            <LinkForm kind="event" id={e.id} current={(e as PreventionEvent & { program_slug?: string | null }).program_slug ?? null} programs={programs} />
          </details></li>))}</ul>
      )}
      <section className="space-y-3 rounded-2xl border bg-white p-4" aria-labelledby="prog">
        <h2 id="prog" className="font-semibold">Les 8 programmes de prévention</h2>
        <p className="text-xs text-muted-foreground">Le nom du programme national n&apos;est affiché qu&apos;avec le lien vers sa source officielle. Les fiches se rédigent et se valident dans la <a href="/redaction-sante" className="underline">rédaction santé</a> ; seules les fiches publiées apparaissent.</p>
        <ul className="space-y-2">{programs.map((p) => (
          <li key={p.slug}><ActionForm action={saveProgramNational} className="grid gap-2 rounded-xl bg-muted/40 p-3 sm:grid-cols-[10rem_1fr_1fr_auto] sm:items-end"><input type="hidden" name="slug" value={p.slug} />
            <a href={`/prevention/programmes/${p.slug}`} className="font-semibold underline">{p.title}</a>
            <Input name="national" defaultValue={p.national_program ?? ""} maxLength={200} placeholder="Nom du programme national" aria-label={`Programme national — ${p.title}`} />
            <Input name="url" type="url" defaultValue={p.national_program_url ?? ""} placeholder="https://… (source officielle)" aria-label={`Source — ${p.title}`} />
            <SubmitButton size="sm" variant="outline">Enregistrer</SubmitButton></ActionForm></li>))}</ul>
        <h3 className="pt-2 text-sm font-semibold">Fiches de prévention et programme</h3>
        <ul className="space-y-1 text-sm">{((arts ?? []) as { id: string; title: string; status: string; program_slug: string | null }[]).map((a) => (
          <li key={a.id} className="flex flex-wrap items-center gap-2"><span>{a.title} <span className="text-xs text-muted-foreground">({a.status})</span></span><LinkForm kind="article" id={a.id} current={a.program_slug} programs={programs} /></li>))}</ul>
      </section>
    </div>
  );
}
