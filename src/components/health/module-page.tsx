import Link from "next/link";
import { BadgeCheck, BookOpen, ExternalLink } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { formatDate } from "@/lib/format";
import { StateMessage } from "@/components/ui/state-message";

export type Reference = { title: string; points: string[]; source: { label: string; url: string; date: string } };

/** Page d'un module de contenu (nutrition, rééducation…) : fiches passées par la validation médicale,
 *  et repères généraux repris fidèlement de sources officielles, chacun avec son lien. */
export async function ModulePage({ slug, title, intro, links, references = [], checkedOn }: { slug: string; title: string; intro: string; links: [string, string][]; references?: Reference[]; checkedOn?: string }) {
  let fiches: { slug: string; title: string; summary: string; validator_name: string | null; validated_at: string | null }[] = [];
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const { data } = await supabase.from("health_articles").select("slug, title, summary, validator_name, validated_at, health_categories!inner(slug)").eq("status", "published").eq("health_categories.slug", slug).order("title").limit(60);
    fiches = (data ?? []) as unknown as typeof fiches;
  }
  return (
    <div className="container-page max-w-4xl space-y-5 py-6">
      <header><h1 className="text-3xl font-extrabold text-[#052D1E]">{title}</h1><p className="mt-2 text-muted-foreground">{intro}</p></header>
      <section className="space-y-3 rounded-2xl border bg-white p-5">
        <h2 className="flex items-center gap-2 text-lg font-bold text-[#052D1E]"><BadgeCheck className="size-5 text-[#068132]" aria-hidden /> Fiches validées par des professionnels</h2>
        {fiches.length === 0 ? (
          <StateMessage state="empty">Aucune fiche n&apos;est encore publiée dans cette rubrique. SantéProxi ne publie que des contenus relus et validés par un professionnel nommé, avec leurs sources : les premières fiches apparaîtront ici après cette validation.</StateMessage>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">{fiches.map((f) => (
            <li key={f.slug}><Link prefetch={false} href={`/sante/fiche/${f.slug}`} className="block rounded-xl border p-3 hover:border-[#068132]"><span className="font-semibold text-[#052D1E]">{f.title}</span>
              <span className="mt-1 block text-sm text-muted-foreground">{f.summary}</span>
              {f.validator_name && f.validated_at && <span className="mt-1 block text-xs text-emerald-800">Validée par {f.validator_name} le {formatDate(f.validated_at)}</span>}</Link></li>))}</ul>
        )}
      </section>
      {references.length > 0 && (
        <section className="space-y-3" aria-labelledby="reperes">
          <h2 id="reperes" className="flex items-center gap-2 text-lg font-bold text-[#052D1E]"><BookOpen className="size-5 text-[#068132]" aria-hidden /> Repères des organismes officiels</h2>
          <p className="text-sm text-muted-foreground">Informations générales reprises fidèlement des documents cités, sans ajout. Elles ne remplacent pas une consultation et ne s&apos;appliquent pas telles quelles à une personne malade, enceinte ou à un enfant suivi : demandez conseil à un professionnel.{checkedOn ? ` Sources consultées le ${checkedOn}.` : ""}</p>
          <div className="grid gap-3 md:grid-cols-2">{references.map((r) => (
            <article key={r.title} className="flex flex-col rounded-2xl border bg-white p-4">
              <h3 className="font-bold text-[#052D1E]">{r.title}</h3>
              <ul className="mt-2 list-disc space-y-1 ps-5 text-sm">{r.points.map((pt) => <li key={pt}>{pt}</li>)}</ul>
              <p className="mt-auto pt-3 text-xs text-muted-foreground">Source : <a href={r.source.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-primary underline">{r.source.label}<ExternalLink className="size-3" aria-hidden /></a> ({r.source.date})</p>
            </article>))}</div>
        </section>
      )}
      <section className="grid gap-3 sm:grid-cols-2">{links.map(([href, label]) => <Link key={href} prefetch={false} href={href} className="rounded-2xl border bg-white p-4 font-semibold text-[#052D1E] hover:border-[#068132]">{label}</Link>)}</section>
      <p className="text-xs text-muted-foreground">Ces informations ne remplacent pas l&apos;avis d&apos;un professionnel de santé.</p>
    </div>
  );
}
