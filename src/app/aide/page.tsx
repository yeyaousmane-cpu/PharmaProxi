import Link from "next/link";
import { Siren } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { ContactCta, HELP_ICONS, HelpSearch, type HelpArticleRow, type HelpCategory } from "@/components/help/help-ui";

export const metadata = { title: "Centre d'aide", description: "Réponses aux questions sur SantéProxi : compte, rendez-vous, médicaments, laboratoires, données de santé, professionnels." };
export const revalidate = 300;

export default async function HelpHome() {
  let cats: HelpCategory[] = []; let popular: HelpArticleRow[] = []; let titles: string[] = [];
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const [c, p] = await Promise.all([
      supabase.from("help_categories").select("slug,title,description,icon,audience").eq("active", true).order("sort"),
      supabase.from("help_articles").select("slug,title,summary,category_slug,section,views").eq("status", "publie").order("views", { ascending: false }).order("sort").limit(40),
    ]);
    cats = (c.data as HelpCategory[] | null) ?? [];
    const arts = (p.data as (HelpArticleRow & { views: number })[] | null) ?? [];
    popular = arts.slice(0, 6); titles = arts.map((a) => a.title);
  }
  const patients = cats.filter((c) => c.audience !== "professionnels");
  const pros = cats.filter((c) => c.audience === "professionnels");
  return (
    <div>
      <header className="border-b bg-[#EAF6EE]">
        <div className="container-page max-w-3xl py-10 text-center md:py-14">
          <h1 className="text-3xl font-extrabold text-[#052D1E] md:text-4xl">Comment pouvons-nous vous aider ?</h1>
          <p className="mt-2 text-muted-foreground">Cherchez une réponse ou parcourez les rubriques.</p>
          <div className="mt-6"><HelpSearch large /></div>
          <datalist id="help-suggestions">{titles.map((t) => <option key={t} value={t} />)}</datalist>
        </div>
      </header>
      <div className="container-page max-w-5xl space-y-10 py-8">
        <Link prefetch={false} href="/sos" className="flex items-center gap-3 rounded-xl bg-red-700 p-4 text-white"><Siren className="size-6 shrink-0" aria-hidden />
          <span><strong>Urgence vitale ?</strong> N&apos;attendez pas de réponse ici : ouvrez SOS Santé pour appeler les secours.</span></Link>

        {popular.length > 0 && (
          <section aria-labelledby="pop">
            <h2 id="pop" className="mb-3 text-xl font-bold text-[#052D1E]">Questions fréquentes</h2>
            <ul className="grid gap-2 md:grid-cols-2">{popular.map((a) => (
              <li key={a.slug}><Link prefetch={false} href={`/aide/article/${a.slug}`} className="block rounded-xl border bg-white p-4 hover:border-[#068132]">
                <span className="font-semibold text-[#052D1E]">{a.title}</span><span className="block text-sm text-muted-foreground">{a.summary}</span></Link></li>))}</ul>
          </section>
        )}

        {[["Patients et familles", patients], ["Professionnels et structures de santé", pros]].map(([label, list]) => (list as HelpCategory[]).length > 0 && (
          <section key={label as string} aria-label={label as string}>
            <h2 className="mb-3 text-xl font-bold text-[#052D1E]">{label as string}</h2>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{(list as HelpCategory[]).map((c) => {
              const Icon = HELP_ICONS[c.icon] ?? HELP_ICONS.help;
              return (<li key={c.slug}><Link prefetch={false} href={`/aide/${c.slug}`} className="flex h-full gap-3 rounded-2xl border bg-white p-4 transition hover:border-[#068132] hover:shadow-sm">
                <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[#EAF6EE] text-[#068132]"><Icon className="size-5" aria-hidden /></span>
                <span><span className="block font-bold text-[#052D1E]">{c.title}</span><span className="text-sm text-muted-foreground">{c.description}</span></span></Link></li>);
            })}</ul>
          </section>
        ))}
        <ContactCta />
      </div>
    </div>
  );
}
