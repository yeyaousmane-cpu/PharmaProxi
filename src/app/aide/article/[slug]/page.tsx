import Link from "next/link";
import { ListenButton } from "@/components/speech/listen-button";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { HelpMarkdown } from "@/components/help/help-markdown";
import { Breadcrumb, ContactCta, type HelpArticleRow } from "@/components/help/help-ui";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { voteHelp } from "@/app/actions/help";
import { formatDate } from "@/lib/format";

export const revalidate = 300;
type Art = HelpArticleRow & { id: string; body: string; keywords: string; updated_at: string };

async function load(slug: string) {
  if (!/^[a-z0-9-]{3,90}$/.test(slug)) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("help_articles").select("id,slug,title,summary,body,keywords,category_slug,section,updated_at").eq("slug", slug).eq("status", "publie").maybeSingle();
  if (!data) return null;
  const a = data as Art;
  const [{ data: cat }, { data: rel }] = await Promise.all([
    supabase.from("help_categories").select("title").eq("slug", a.category_slug).maybeSingle(),
    supabase.from("help_articles").select("slug,title,summary,category_slug,section").eq("category_slug", a.category_slug).eq("status", "publie").neq("slug", a.slug).order("sort").limit(5),
  ]);
  return { a, catTitle: (cat as { title: string } | null)?.title ?? "Aide", related: (rel as HelpArticleRow[] | null) ?? [] };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const r = await load((await params).slug);
  return { title: r ? r.a.title : "Article introuvable", description: r?.a.summary };
}

export default async function HelpArticlePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ q?: string }> }) {
  const { slug } = await params; const { q } = await searchParams;
  const r = await load(slug);
  if (!r) notFound();
  const supabase = await createClient();
  await supabase.rpc("count_help_view", { p_slug: slug });
  return (
    <div className="container-page max-w-3xl space-y-6 py-6">
      <Breadcrumb items={[["Centre d'aide", "/aide"], [r.catTitle, `/aide/${r.a.category_slug}`], [r.a.section, null]]} />
      <ListenButton targetId="aide-texte" lang="fr" />
      <article id="aide-texte" lang="fr" dir="ltr" className="space-y-4 rounded-2xl border bg-white p-5 md:p-8">
        <h1 className="text-2xl font-extrabold text-[#052D1E] md:text-3xl">{r.a.title}</h1>
        <p className="text-lg text-muted-foreground">{r.a.summary}</p>
        <HelpMarkdown text={r.a.body} q={q} />
        <p className="pt-2 text-xs text-muted-foreground">Mis à jour le {formatDate(r.a.updated_at)}</p>
      </article>
      <section aria-label="Avis" className="flex flex-wrap items-center gap-3 rounded-2xl border bg-white p-4">
        <p className="font-semibold">Cet article vous a-t-il aidé ?</p>
        <ActionForm action={voteHelp} className="flex gap-2">
          <input type="hidden" name="slug" value={r.a.slug} />
          <SubmitButton size="sm" name="useful" value="1" variant="outline">Oui</SubmitButton>
          <SubmitButton size="sm" name="useful" value="0" variant="outline">Non</SubmitButton>
        </ActionForm>
      </section>
      {r.related.length > 0 && (
        <section aria-labelledby="rel" className="space-y-2">
          <h2 id="rel" className="text-lg font-bold text-[#052D1E]">Articles liés</h2>
          <ul className="divide-y rounded-2xl border bg-white">{r.related.map((x) => (
            <li key={x.slug}><Link prefetch={false} href={`/aide/article/${x.slug}`} className="block p-3 font-semibold text-[#052D1E] hover:bg-[#EAF6EE]/60">{x.title}</Link></li>))}</ul>
        </section>
      )}
      <ContactCta />
    </div>
  );
}
