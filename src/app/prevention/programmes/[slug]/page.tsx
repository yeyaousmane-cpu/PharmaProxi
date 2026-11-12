import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheck, CalendarDays, ExternalLink, MapPin } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PROGRAM_EMOJI, type Program } from "@/lib/prevention-programs";
import { formatDate } from "@/lib/format";

export const revalidate = 600;

type O = { fiches_publiees: { slug: string; title: string; summary: string; validator_name: string | null; validated_at: string | null }[]; fiches_en_validation: number;
  evenements: { id: string; title: string; kind: string; starts_on: string; ends_on: string | null; place: string | null; organizer: string; source_name: string; source_url: string | null }[] };

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("prevention_programs").select("title, audience").eq("slug", slug).maybeSingle();
  return data ? { title: `Prévention : ${data.title}`, description: `Fiches validées, campagnes et lieux de soins — ${data.audience}.` } : {};
}

export default async function ProgramPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9-]{3,60}$/.test(slug)) notFound();
  const supabase = await createClient();
  const [{ data: p }, { data: o }] = await Promise.all([
    supabase.from("prevention_programs").select("*").eq("slug", slug).maybeSingle(),
    supabase.rpc("prevention_program_overview", { p_slug: slug }),
  ]);
  if (!p) notFound();
  const pr = p as Program; const ov = (o ?? { fiches_publiees: [], fiches_en_validation: 0, evenements: [] }) as O;
  return (
    <div className="container-page max-w-3xl space-y-5 py-6">
      <p className="text-sm"><Link prefetch={false} href="/prevention/programmes" className="text-primary underline">← Programmes de prévention</Link></p>
      <h1 className="flex items-center gap-2 text-2xl font-bold"><span aria-hidden>{PROGRAM_EMOJI[pr.slug] ?? "🛡️"}</span> {pr.title}</h1>
      <p className="text-sm text-muted-foreground">Pour : {pr.audience}.</p>
      {pr.national_program && pr.national_program_url ? <p className="text-sm">Programme national : <a href={pr.national_program_url} target="_blank" rel="noopener noreferrer" className="underline">{pr.national_program}</a></p> : null}

      <section className="space-y-2 rounded-2xl border bg-white p-4" aria-labelledby="fi">
        <h2 id="fi" className="flex items-center gap-2 font-bold text-brand-deep"><BadgeCheck className="size-5 text-primary" aria-hidden /> Fiches validées</h2>
        {ov.fiches_publiees.length === 0 ? (
          <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-950">Aucune fiche n&apos;est encore publiée pour ce programme : {ov.fiches_en_validation > 0 ? `${ov.fiches_en_validation} fiche(s) attendent la relecture et la validation d'un professionnel de santé.` : "les fiches sont en préparation."} En attendant, demandez conseil à un soignant de votre centre de santé.</p>
        ) : (
          <ul className="space-y-2">{ov.fiches_publiees.map((f) => (
            <li key={f.slug} className="rounded-xl border p-3 text-sm"><Link prefetch={false} href={`/sante/fiche/${f.slug}`} className="font-semibold text-primary underline">{f.title}</Link>
              <span className="block text-muted-foreground">{f.summary}</span>
              {f.validator_name ? <span className="block text-xs">Validée par {f.validator_name}{f.validated_at ? ` le ${formatDate(f.validated_at)}` : ""}</span> : null}</li>))}</ul>
        )}
      </section>

      <section className="space-y-2 rounded-2xl border bg-white p-4" aria-labelledby="ca">
        <h2 id="ca" className="flex items-center gap-2 font-bold text-brand-deep"><CalendarDays className="size-5 text-primary" aria-hidden /> Campagnes et dépistages à venir</h2>
        {ov.evenements.length === 0 ? <p className="text-sm text-muted-foreground">Aucune campagne publiée pour le moment. <Link prefetch={false} href="/prevention" className="underline">Calendrier complet de la prévention</Link></p> : (
          <ul className="space-y-2">{ov.evenements.map((e) => (
            <li key={e.id} className="rounded-xl border p-3 text-sm"><strong>{e.title}</strong><span className="block">{formatDate(e.starts_on)}{e.ends_on && e.ends_on !== e.starts_on ? ` → ${formatDate(e.ends_on)}` : ""}{e.place ? ` · ${e.place}` : ""} · {e.organizer}</span>
              <span className="block text-xs text-muted-foreground">Source : {e.source_url ? <a href={e.source_url} target="_blank" rel="noopener noreferrer" className="underline">{e.source_name}</a> : e.source_name}</span></li>))}</ul>
        )}
      </section>

      <section className="space-y-2 rounded-2xl border bg-white p-4" aria-labelledby="ou">
        <h2 id="ou" className="flex items-center gap-2 font-bold text-brand-deep"><MapPin className="size-5 text-primary" aria-hidden /> Où aller</h2>
        <div className="flex flex-wrap gap-2 text-sm">
          <Link prefetch={false} href="/orientation" className="rounded-lg border px-3 py-2 font-semibold">Où me faire soigner ? (CSCom, CSRéf, hôpital)</Link>
          {pr.focus_code ? <Link prefetch={false} href={`/centres-specialises?besoin=${pr.focus_code}`} className="rounded-lg border px-3 py-2 font-semibold">Centres pour ce besoin</Link> : null}
          <Link prefetch={false} href="/urgences" className="rounded-lg border border-red-300 px-3 py-2 font-semibold text-red-800">Urgences</Link>
        </div>
      </section>

      <p className="text-xs text-muted-foreground">Référence internationale utilisée pour préparer les fiches : <a href={pr.reference_url} target="_blank" rel="noopener noreferrer" className="underline">{pr.reference_title}<ExternalLink className="ms-0.5 inline size-3" aria-hidden /></a>{pr.reference_date ? ` (mis à jour le ${pr.reference_date})` : ""}. Les fiches sont adaptées et validées par des professionnels de santé ; SantéProxi ne donne pas de diagnostic ni de traitement.</p>
    </div>
  );
}
