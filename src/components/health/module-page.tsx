import Link from "next/link";
import { BadgeCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { formatDate } from "@/lib/format";
import { StateMessage } from "@/components/ui/state-message";

/** Page d'un module de contenu (nutrition, rééducation…) : n'affiche que des fiches passées par la validation médicale. */
export async function ModulePage({ slug, title, intro, links }: { slug: string; title: string; intro: string; links: [string, string][] }) {
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
      <section className="grid gap-3 sm:grid-cols-2">{links.map(([href, label]) => <Link key={href} prefetch={false} href={href} className="rounded-2xl border bg-white p-4 font-semibold text-[#052D1E] hover:border-[#068132]">{label}</Link>)}</section>
      <p className="text-xs text-muted-foreground">Ces informations ne remplacent pas l&apos;avis d&apos;un professionnel de santé.</p>
    </div>
  );
}
