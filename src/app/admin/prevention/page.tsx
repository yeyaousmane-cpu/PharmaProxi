import { CalendarDays } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { savePreventionEvent } from "@/app/actions/v027";
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

export default async function AdminPrevention() {
  const supabase = await createClient();
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
          </details></li>))}</ul>
      )}
    </div>
  );
}
