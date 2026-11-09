import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { highlight, markFor } from "@/components/help/help-markdown";
import { Breadcrumb, ContactCta, HelpSearch, NO_RESULT } from "@/components/help/help-ui";

export const metadata = { title: "Recherche — Centre d'aide", robots: { index: false } };
export const dynamic = "force-dynamic";

type Hit = { slug: string; title: string; summary: string; category_slug: string; section: string; score: number };

export default async function HelpSearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = ((await searchParams).q ?? "").trim().slice(0, 100);
  let hits: Hit[] = [];
  if (q.length >= 2) {
    const supabase = await createClient();
    const { data } = await supabase.rpc("search_help", { p_q: q, p_limit: 20 });
    hits = (data as Hit[] | null) ?? [];
  }
  const mark = markFor(q);
  return (
    <div className="container-page max-w-3xl space-y-6 py-6">
      <Breadcrumb items={[["Centre d'aide", "/aide"], ["Recherche", null]]} />
      <h1 className="text-2xl font-extrabold text-[#052D1E]">{q ? <>Résultats pour « {q} »</> : "Rechercher dans l'aide"}</h1>
      <HelpSearch q={q} />
      {q.length >= 2 && hits.length === 0 && <p className="rounded-2xl border bg-white p-5 text-[#052D1E]" role="status">{NO_RESULT}</p>}
      {q.length > 0 && q.length < 2 && <p className="text-muted-foreground">Saisissez au moins 2 caractères.</p>}
      {hits.length > 0 && (
        <ul className="divide-y rounded-2xl border bg-white" aria-label={`${hits.length} résultat(s)`}>{hits.map((h) => (
          <li key={h.slug}><Link prefetch={false} href={`/aide/article/${h.slug}?q=${encodeURIComponent(q)}`} className="block p-4 hover:bg-[#EAF6EE]/60">
            <span className="block font-semibold text-[#052D1E]">{highlight(h.title, mark)}</span>
            <span className="block text-sm text-muted-foreground">{highlight(h.summary, mark)}</span>
            <span className="text-xs text-[#068132]">{h.section}</span></Link></li>))}</ul>
      )}
      <ContactCta />
    </div>
  );
}
