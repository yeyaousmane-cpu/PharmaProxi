import Link from "next/link";
import { Search } from "lucide-react";
import { FemmeGate } from "@/components/femme/gate";
import { F } from "@/components/femme/ui";
import { femmeStatus } from "@/lib/femme/server";
import { createClient } from "@/lib/supabase/server";
import { CONSULT_CYCLE, LIBRARY } from "@/lib/femme/content";

export const metadata = { title: "Bibliothèque", robots: { index: false } };
type A = { slug: string; title: string; summary: string; validator_name: string | null; category_name: string };

export default async function LibraryPage() {
  const st = await femmeStatus();
  const gate = FemmeGate({ st, path: "/femme/bibliotheque" });
  if (gate) return gate;
  const supabase = await createClient();
  const res = await Promise.all(["sante-femme", "sante-reproductive", "grossesse-enfant"].map((c) => supabase.rpc("health_search", { p_category: c, p_limit: 12 })));
  const seen = new Set<string>();
  const articles = res.flatMap((r) => (r.data as A[] | null) ?? []).filter((a) => !seen.has(a.slug) && seen.add(a.slug));
  return (
    <div className="space-y-4">
      <section className={`${F.card} space-y-3`}>
        <h1 className="text-xl font-bold text-[#843653]">Bibliothèque santé de la femme</h1>
        <form action="/sante/recherche" className="flex gap-2">
          <label htmlFor="q" className="sr-only">Rechercher</label>
          <input id="q" name="q" placeholder="Ex. : règles douloureuses, contraception…" className={F.input} />
          <button className={F.btn} aria-label="Rechercher"><Search className="size-4" aria-hidden /></button>
        </form>
        {articles.length > 0 ? (
          <ul className="grid gap-2 sm:grid-cols-2">
            {articles.map((a) => (
              <li key={a.slug}><Link prefetch={false} href={`/sante/fiche/${a.slug}`} className="block h-full rounded-xl border border-[#D96A91]/20 p-3 hover:bg-[#F8E7EF]">
                <span className="block text-xs text-[#843653]">{a.category_name}</span><span className="block font-semibold">{a.title}</span>
                <span className="line-clamp-2 block text-sm text-muted-foreground">{a.summary}</span>
                {a.validator_name && <span className="mt-1 block text-xs text-[#068132]">Validée par {a.validator_name}</span>}
              </Link></li>
            ))}
          </ul>
        ) : <p className="rounded-xl bg-[#F8E7EF] p-3 text-sm">Les fiches de santé de la femme sont en cours de rédaction et de validation par des professionnels de santé. Elles apparaîtront ici dès leur publication, avec leurs sources, leur validateur et leur date de révision.</p>}
      </section>
      <section className={`${F.card} space-y-3`}>
        <h2 className={F.h2}>Thèmes</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {LIBRARY.map((g) => (
            <div key={g.title}><h3 className="mb-1.5 text-sm font-bold">{g.title}</h3>
              <ul className="flex flex-wrap gap-1.5">{g.topics.map((t) => <li key={t}><Link prefetch={false} href={`/sante/recherche?q=${encodeURIComponent(t)}`} className="inline-block rounded-full bg-[#F8E7EF] px-2.5 py-1 text-sm text-[#843653] hover:bg-[#D96A91] hover:text-white">{t}</Link></li>)}</ul>
            </div>
          ))}
        </div>
      </section>
      <section className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
        <h2 className="mb-2 font-bold">Quand consulter pour vos règles ?</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm">{CONSULT_CYCLE.map((c) => <li key={c}>{c}</li>)}</ul>
      </section>
    </div>
  );
}
