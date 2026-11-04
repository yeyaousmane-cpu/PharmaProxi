import Link from "next/link";
import { BellRing, ExternalLink, Siren } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ALERT_KIND } from "@/lib/health-alerts";

export const metadata = { title: "Alertes sanitaires", description: "Alertes officielles : faux médicaments, rappels de lots, campagnes de santé, épidémies au Mali." };
export const revalidate = 0;


type A = { id: string; kind: string; title: string; body: string; source_name: string; source_url: string; published_at: string; regions: { name: string } | null };

export default async function AlertsPage() {
  let list: A[] = [];
  let official: { id: string; organisation: string; title: string; body: string; link: string | null; published_at: string; regions: { name: string } | null }[] = [];
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    official = ((await supabase.from("official_communiques").select("id, organisation, title, body, link, published_at, regions(name)").eq("status", "publie").order("published_at", { ascending: false }).limit(20)).data as unknown as typeof official | null) ?? [];
    list = ((await supabase.from("health_alerts").select("id, kind, title, body, source_name, source_url, published_at, regions(name)").order("published_at", { ascending: false }).limit(50)).data as unknown as A[] | null) ?? [];
  }
  return (
    <div className="container-page max-w-3xl space-y-5 py-6">
      <header className="space-y-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-brand-deep"><Siren className="size-7 text-red-600" aria-hidden /> Alertes sanitaires</h1>
        <p className="text-muted-foreground">Faux médicaments, rappels de lots, campagnes de vaccination ou de moustiquaires, épidémies. Uniquement des informations publiées par les autorités sanitaires, avec le lien vers la source.</p>
        <Link prefetch={false} href="/ma-sante#alertes" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}><BellRing aria-hidden /> Recevoir les alertes</Link>
      </header>
      {official.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-brand-deep">Communiqués officiels</h2>
          <ul className="space-y-3">{official.map((c) => (
            <li key={c.id} className="rounded-2xl border-2 border-brand-blue/30 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-blue">{c.organisation} · {formatDate(c.published_at)}{c.regions ? ` · ${c.regions.name}` : " · tout le Mali"}</p>
              <h3 className="mt-1 text-lg font-bold text-brand-deep">{c.title}</h3>
              <p className="mt-1 whitespace-pre-line text-sm">{c.body}</p>
              {c.link && <a href={c.link} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-sm font-semibold text-primary underline">Document officiel</a>}
            </li>))}</ul>
        </section>
      )}
      {list.length === 0 ? (
        <p className="rounded-xl border bg-white p-4 text-sm text-muted-foreground">Aucune alerte en cours.</p>
      ) : (
        <ul className="space-y-3">
          {list.map((a) => (
            <li key={a.id} className="rounded-2xl border bg-white p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={ALERT_KIND[a.kind]?.tone}>{ALERT_KIND[a.kind]?.label ?? a.kind}</Badge>
                <span className="text-xs text-muted-foreground">{formatDate(a.published_at)}{a.regions ? ` · ${a.regions.name}` : " · tout le Mali"}</span>
              </div>
              <h2 className="mt-2 text-lg font-bold text-brand-deep">{a.title}</h2>
              <p className="mt-1 whitespace-pre-line text-sm leading-relaxed">{a.body}</p>
              <a href={a.source_url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-primary underline">Source : {a.source_name} <ExternalLink className="size-3.5" aria-hidden /></a>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">Un médicament vous semble suspect ? Ne le prenez pas et montrez-le à un pharmacien. Voir aussi <Link prefetch={false} href="/droits/medicaments-de-la-rue" className="underline">Médicaments de la rue : attention</Link>.</p>
    </div>
  );
}
