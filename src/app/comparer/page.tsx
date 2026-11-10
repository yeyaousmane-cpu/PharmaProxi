import Link from "next/link";
import { Info, Scale, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatXof } from "@/lib/format";

export const metadata = { title: "Génériques et prix", description: "Comparez les médicaments ayant le même principe actif et le même dosage, et les prix déclarés par les pharmacies." };
export const revalidate = 0;

type G = { ingredient: string; dosage: string | null; form: string | null; products: number; min_price: number | null; max_price: number | null; pharmacies: number; sample_catalog: string; brands: string[] };

export default async function ComparePage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 80);
  let rows: G[] = [];
  if (q.length >= 3 && isSupabaseConfigured()) {
    const supabase = await createClient();
    rows = ((await supabase.rpc("compare_prices", { p_query: q, p_limit: 20 })).data as G[] | null) ?? [];
  }
  return (
    <div className="container-page max-w-3xl space-y-5 py-6">
      <header className="space-y-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-brand-deep"><Scale className="size-7 text-primary" aria-hidden /> Génériques et prix</h1>
        <p className="text-muted-foreground">Un même médicament existe souvent sous plusieurs marques, et les génériques coûtent généralement moins cher. Tapez un nom de médicament ou un principe actif : vous voyez les produits équivalents (même principe actif, même dosage) et les prix déclarés par les pharmacies.</p>
      </header>
      <form method="get" className="flex gap-2" role="search">
        <label htmlFor="q" className="sr-only">Médicament ou principe actif</label>
        <Input id="q" name="q" defaultValue={q} placeholder="ex. paracétamol, amoxicilline, Doliprane" minLength={3} required />
        <Button type="submit"><Search aria-hidden /> Comparer</Button>
      </form>
      {q.length >= 3 && rows.length === 0 && (
        <p className="rounded-xl border bg-white p-4 text-sm">Aucun équivalent trouvé pour « {q} ». Le principe actif n&apos;est peut-être pas encore renseigné pour ce produit : demandez conseil à votre pharmacien.</p>
      )}
      {rows.length > 0 && (
        <ul className="space-y-3">
          {rows.map((g) => (
            <li key={g.sample_catalog} className="rounded-2xl border bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold text-brand-deep">{g.ingredient}{g.dosage ? ` · ${g.dosage}` : ""}{g.form ? ` · ${g.form}` : ""}</p>
                  <p className="text-sm text-muted-foreground">{g.products} produit(s) : {g.brands.slice(0, 6).join(", ")}{g.brands.length > 6 ? "…" : ""}</p>
                </div>
                <div className="text-end text-sm">
                  {g.min_price !== null ? (
                    <><p className="text-xs text-muted-foreground">Prix déclarés</p><p className="text-lg font-bold">{g.min_price === g.max_price ? formatXof(g.min_price) : `${formatXof(g.min_price)} – ${formatXof(g.max_price)}`}</p><p className="text-xs text-muted-foreground">dans {g.pharmacies} pharmacie(s)</p></>
                  ) : <p className="text-xs text-muted-foreground">Aucun prix déclaré récemment</p>}
                </div>
              </div>
              <Link prefetch={false} href={`/produits/${g.sample_catalog}#equivalents`} className="mt-2 inline-block text-sm font-semibold text-primary underline">Voir les produits et les pharmacies</Link>
            </li>
          ))}
        </ul>
      )}
      <section className="space-y-2 rounded-2xl border bg-white p-5 text-sm leading-relaxed">
        <h2 className="flex items-center gap-2 text-lg font-bold text-brand-deep"><Info className="size-5 text-primary" aria-hidden /> Bon à savoir</h2>
        <ul className="list-disc space-y-1 ps-5">
          <li>Un <strong>générique</strong> contient le même principe actif, au même dosage, que le médicament de marque.</li>
          <li><strong>Ne changez jamais de médicament sans l&apos;avis de votre pharmacien</strong> : il vérifie que le produit convient (forme, excipients, allergies, enfant, grossesse).</li>
          <li>Les prix affichés sont ceux déclarés par les pharmacies au cours des 30 derniers jours : faites-les confirmer.</li>
          <li>Vous avez l&apos;AMO ? Voyez aussi <Link prefetch={false} href="/amo" className="text-primary underline">les médicaments pris en charge</Link>.</li>
        </ul>
      </section>
    </div>
  );
}
