import Link from "next/link";
import { AudioGuide } from "@/components/audio/audio-guide";
import { ArrowRight, BookOpenCheck, CircleHelp, Dna, Droplets, HeartHandshake, Lightbulb, ShieldCheck } from "lucide-react";
import { HealthIcon } from "@/components/health/health-icon";
import { ArticleCard, FindProfessionals, HealthSearchBar, MedicalDisclaimer, type ArticleRow } from "@/components/health/health-bits";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { HEALTH_AUDIENCE, HEALTH_KIND } from "@/lib/health/labels";
import { Pagination } from "@/components/pagination";

export const metadata = {
  title: "Santé essentielle",
  description: "Comprendre sa santé, prévenir les risques et prendre les bonnes décisions : fiches d'information validées par des professionnels de santé.",
};
export const revalidate = 0;

type Cat = { id: string; slug: string; name: string; description: string | null; icon: string; is_priority: boolean };
type Count = { category_id: string; published: number; upcoming: number };
const SIZE = 12;

function Section({ id, title, Icon, children, more }: { id: string; title: string; Icon: typeof Lightbulb; children: React.ReactNode; more?: { href: string; label: string } }) {
  return (
    <section aria-labelledby={id} className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <h2 id={id} className="flex items-center gap-2 text-xl font-bold text-[#052D1E]"><Icon className="size-5 text-[#068132]" aria-hidden /> {title}</h2>
        {more && <Link prefetch={false} href={more.href} className="shrink-0 text-sm font-semibold text-[#068132] hover:underline">{more.label}</Link>}
      </div>
      {children}
    </section>
  );
}
const Empty = ({ text }: { text: string }) => <p className="rounded-xl border border-dashed bg-white p-5 text-sm text-muted-foreground">{text}</p>;

export default async function HealthHome({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const filtered = Boolean(sp.categorie || sp.public || sp.type);
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  let cats: Cat[] = [], counts: Count[] = [], featured: ArticleRow[] = [], faqs: ArticleRow[] = [], myths: ArticleRow[] = [], prevention: ArticleRow[] = [], latest: ArticleRow[] = [], results: ArticleRow[] = [];
  let total = 0;
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const search = (args: Record<string, unknown>) => supabase.rpc("health_search", { p_query: null, p_category: null, p_audience: null, p_kind: null, p_limit: 6, p_offset: 0, ...args });
    const [c, n, f, q, m, p, l, r] = await Promise.all([
      supabase.from("health_categories").select("id, slug, name, description, icon, is_priority").eq("is_active", true).order("sort_order"),
      supabase.rpc("health_category_counts"),
      supabase.from("health_articles").select("id, slug, title, summary, kind, recommendation, reviewed_at, validated_at, validator_name").eq("status", "published").eq("is_featured", true).order("published_at", { ascending: false }).limit(6),
      search({ p_kind: "faq" }),
      search({ p_kind: "idee_recue" }),
      search({ p_category: "depistage-prevention" }),
      supabase.from("health_articles").select("id, slug, title, summary, kind, recommendation, reviewed_at, validated_at, validator_name").eq("status", "published").order("published_at", { ascending: false }).limit(6),
      filtered ? search({ p_category: sp.categorie || null, p_audience: sp.public || null, p_kind: sp.type || null, p_limit: SIZE, p_offset: (page - 1) * SIZE }) : Promise.resolve({ data: [] }),
    ]);
    cats = (c.data as Cat[]) ?? [];
    counts = (n.data as Count[]) ?? [];
    const fix = (rows: unknown) => ((rows as (ArticleRow & { validated_at?: string })[]) ?? []).map((x) => ({ ...x, reviewed_at: x.reviewed_at ?? x.validated_at ?? null }));
    featured = fix(f.data); faqs = fix(q.data); myths = fix(m.data); prevention = fix(p.data); latest = fix(l.data); results = fix(r.data);
    total = Number((r.data as { total_count?: number }[] | null)?.[0]?.total_count ?? 0);
  }
  const count = (id: string) => counts.find((x) => x.category_id === id);
  const priority = cats.find((c) => c.is_priority);
  const published = counts.reduce((s, x) => s + Number(x.published), 0);

  return (
    <div className="bg-[#EAF6EE]/60">
      <section className="border-b bg-gradient-to-b from-[#EAF6EE] to-white">
        <div className="container-page py-8 sm:py-12">
          <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-[#068132]"><BookOpenCheck className="size-4" aria-hidden /> Bibliothèque santé PharmaProxi</p>
          <h1 className="mt-1 text-3xl font-bold text-[#052D1E] sm:text-4xl">Santé essentielle</h1>
          <p className="mt-2 max-w-2xl text-lg text-muted-foreground">Comprendre sa santé, prévenir les risques et prendre les bonnes décisions.</p>
          <div className="mt-5 max-w-2xl"><HealthSearchBar /></div>
          <AudioGuide target="sante" className="mt-4 max-w-2xl" />
          <p className="mt-3 text-xs text-muted-foreground">
            Chaque fiche affiche ses sources, le professionnel qui l&apos;a validée et la date de sa dernière révision. {published === 0 ? "Les premières fiches sont en cours de validation médicale." : `${published} fiche(s) validée(s) publiée(s).`}
          </p>
        </div>
      </section>

      <div className="container-page space-y-10 py-8">
        {priority && (
          <Link prefetch={false} href={`/sante/${priority.slug}`} className="group grid gap-4 overflow-hidden rounded-2xl border border-[#068132]/30 bg-white p-5 shadow-sm transition hover:shadow-md sm:grid-cols-[auto_1fr_auto] sm:items-center">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-[#068132] text-white"><HeartHandshake className="size-7" aria-hidden /></span>
            <span>
              <span className="text-xs font-bold uppercase tracking-wide text-[#068132]">Rubrique prioritaire</span>
              <span className="block text-xl font-bold text-[#052D1E]">Avant le mariage : les examens de santé à connaître</span>
              <span className="mt-1 block text-sm text-muted-foreground">Groupes sanguins, Rhésus, drépanocytose (AA, AS, SS), infections, vaccins, fertilité — avec deux outils pédagogiques pour comprendre.</span>
              <span className="mt-2 flex flex-wrap gap-2 text-xs">
                <span className="inline-flex items-center gap-1 rounded-full bg-[#EAF6EE] px-2.5 py-1 font-semibold text-[#052D1E]"><Droplets className="size-3.5" aria-hidden /> Groupes sanguins</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-[#EAF6EE] px-2.5 py-1 font-semibold text-[#052D1E]"><Dna className="size-3.5" aria-hidden /> Simulateur drépanocytose</span>
              </span>
            </span>
            <ArrowRight className="hidden size-6 text-[#068132] transition group-hover:translate-x-1 sm:block" aria-hidden />
          </Link>
        )}

        <Section id="categories" title="Catégories de santé" Icon={BookOpenCheck}>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {cats.map((c) => {
              const n = count(c.id);
              return (
                <li key={c.id}>
                  <Link prefetch={false} href={`/sante/${c.slug}`} className="flex h-full gap-3 rounded-xl border bg-white p-4 transition hover:border-[#068132]/50 hover:shadow-sm">
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#EAF6EE] text-[#068132]"><HealthIcon name={c.icon} className="size-5" /></span>
                    <span className="min-w-0">
                      <span className="block font-bold text-[#052D1E]">{c.name}</span>
                      <span className="line-clamp-2 block text-sm text-muted-foreground">{c.description}</span>
                      <span className="mt-1 block text-xs font-medium text-[#1D5FA8]">
                        {Number(n?.published ?? 0) > 0 ? `${n?.published} fiche(s)` : Number(n?.upcoming ?? 0) > 0 ? "Fiches en cours de validation" : "Bientôt disponible"}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Section>

        <section aria-label="Filtrer les fiches" className="rounded-2xl border bg-white p-4">
          <form method="get" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto] lg:items-end">
            <label className="text-sm"><span className="mb-1 block font-medium">Catégorie</span>
              <select name="categorie" defaultValue={sp.categorie ?? ""} className="h-11 w-full rounded-lg border bg-white px-3">
                <option value="">Toutes</option>{cats.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
              </select></label>
            <label className="text-sm"><span className="mb-1 block font-medium">Pour qui</span>
              <select name="public" defaultValue={sp.public ?? ""} className="h-11 w-full rounded-lg border bg-white px-3">
                <option value="">Tout le monde</option>{Object.entries(HEALTH_AUDIENCE).filter(([k]) => k !== "tous").map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select></label>
            <label className="text-sm"><span className="mb-1 block font-medium">Type d&apos;information</span>
              <select name="type" defaultValue={sp.type ?? ""} className="h-11 w-full rounded-lg border bg-white px-3">
                <option value="">Tous</option>{Object.entries(HEALTH_KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select></label>
            <button type="submit" className="h-11 rounded-lg bg-[#068132] px-5 font-semibold text-white hover:bg-[#02A934]">Filtrer</button>
          </form>
          <p className="mt-2 text-xs text-muted-foreground">Les filtres servent à trouver une information ; ils n&apos;évaluent ni un risque ni une maladie.</p>
        </section>

        {filtered ? (
          <Section id="resultats" title={`${total} fiche(s)`} Icon={BookOpenCheck} more={{ href: "/sante", label: "Retirer les filtres" }}>
            {results.length === 0 ? <Empty text="Aucune fiche validée ne correspond pour le moment. La bibliothèque s'enrichit au fur et à mesure des validations médicales." /> : (
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{results.map((a) => <li key={a.id}><ArticleCard a={a} showCategory /></li>)}</ul>
            )}
            <Pagination basePath="/sante" params={sp} page={page} total={total} size={SIZE} />
          </Section>
        ) : (
          <>
            <Section id="essentiel" title="Informations essentielles" Icon={ShieldCheck}>
              {featured.length === 0 ? <Empty text="Les fiches essentielles sont en cours de relecture par des professionnels de santé. Elles apparaîtront ici dès leur validation." /> : (
                <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{featured.map((a) => <li key={a.id}><ArticleCard a={a} /></li>)}</ul>
              )}
            </Section>
            <div className="grid gap-10 lg:grid-cols-2">
              <Section id="questions" title="Questions les plus recherchées" Icon={CircleHelp} more={faqs.length ? { href: "/sante?type=faq", label: "Toutes" } : undefined}>
                {faqs.length === 0 ? <Empty text="Les réponses aux questions fréquentes sont en cours de validation." /> : <ul className="grid gap-3">{faqs.map((a) => <li key={a.id}><ArticleCard a={a} /></li>)}</ul>}
              </Section>
              <Section id="idees-recues" title="Idées reçues et vérités médicales" Icon={Lightbulb} more={myths.length ? { href: "/sante?type=idee_recue", label: "Toutes" } : undefined}>
                {myths.length === 0 ? <Empty text="Les fiches « vrai ou faux » sont en cours de validation." /> : <ul className="grid gap-3">{myths.map((a) => <li key={a.id}><ArticleCard a={a} /></li>)}</ul>}
              </Section>
            </div>
            <Section id="prevention" title="Prévention et dépistage" Icon={ShieldCheck} more={{ href: "/sante/depistage-prevention", label: "La rubrique" }}>
              {prevention.length === 0 ? <Empty text="Les fiches de prévention et de dépistage sont en préparation. Aucun calendrier de dépistage n'est publié sans source fiable et validation médicale." /> : (
                <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{prevention.map((a) => <li key={a.id}><ArticleCard a={a} /></li>)}</ul>
              )}
            </Section>
            <Section id="recentes" title="Dernières informations vérifiées" Icon={BookOpenCheck}>
              {latest.length === 0 ? <Empty text="Aucune fiche publiée pour le moment." /> : <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{latest.map((a) => <li key={a.id}><ArticleCard a={a} /></li>)}</ul>}
            </Section>
          </>
        )}

        <FindProfessionals />
        <MedicalDisclaimer />
        <p className="text-xs text-muted-foreground">
          Vous êtes professionnel de santé et souhaitez relire ou rédiger des fiches ? <Link prefetch={false} href="/infos/contact?sujet=medecin#formulaire" className="underline">Contactez l&apos;équipe PharmaProxi</Link>.
        </p>
      </div>
    </div>
  );
}
