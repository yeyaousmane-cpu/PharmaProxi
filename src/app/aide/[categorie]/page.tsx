import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Breadcrumb, ContactCta, HELP_ICONS, HelpSearch, type HelpArticleRow, type HelpCategory } from "@/components/help/help-ui";

export const revalidate = 300;

async function load(slug: string) {
  if (!/^[a-z0-9-]{2,60}$/.test(slug)) return null;
  const supabase = await createClient();
  const { data: cat } = await supabase.from("help_categories").select("slug,title,description,icon,audience").eq("slug", slug).eq("active", true).maybeSingle();
  if (!cat) return null;
  const { data } = await supabase.from("help_articles").select("slug,title,summary,category_slug,section,sort").eq("category_slug", slug).eq("status", "publie").order("section").order("sort");
  return { cat: cat as HelpCategory, arts: (data as HelpArticleRow[] | null) ?? [] };
}

export async function generateMetadata({ params }: { params: Promise<{ categorie: string }> }) {
  const r = await load((await params).categorie);
  return { title: r ? `${r.cat.title} — Centre d'aide` : "Centre d'aide", description: r?.cat.description };
}

export default async function HelpCategoryPage({ params }: { params: Promise<{ categorie: string }> }) {
  const r = await load((await params).categorie);
  if (!r) notFound();
  const Icon = HELP_ICONS[r.cat.icon] ?? HELP_ICONS.help;
  const sections = [...new Set(r.arts.map((a) => a.section))];
  return (
    <div className="container-page max-w-4xl space-y-6 py-6">
      <Breadcrumb items={[["Centre d'aide", "/aide"], [r.cat.title, null]]} />
      <header className="flex items-start gap-4">
        <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-[#EAF6EE] text-[#068132]"><Icon className="size-7" aria-hidden /></span>
        <div><h1 className="text-3xl font-extrabold text-[#052D1E]">{r.cat.title}</h1><p className="text-muted-foreground">{r.cat.description}</p></div>
      </header>
      <HelpSearch />
      {sections.length === 0 && <p className="rounded-xl border bg-white p-4 text-muted-foreground">Les articles de cette rubrique sont en cours de rédaction. Contactez l&apos;équipe pour toute question.</p>}
      {sections.map((s) => (
        <section key={s} aria-label={s} className="space-y-2">
          <h2 className="text-lg font-bold text-[#052D1E]">{s}</h2>
          <ul className="divide-y rounded-2xl border bg-white">{r.arts.filter((a) => a.section === s).map((a) => (
            <li key={a.slug}><Link prefetch={false} href={`/aide/article/${a.slug}`} className="flex items-center gap-3 p-4 hover:bg-[#EAF6EE]/60">
              <span className="flex-1"><span className="block font-semibold text-[#052D1E]">{a.title}</span><span className="text-sm text-muted-foreground">{a.summary}</span></span>
              <ChevronRight className="size-5 shrink-0 text-[#068132]" aria-hidden /></Link></li>))}</ul>
        </section>
      ))}
      <ContactCta />
    </div>
  );
}
