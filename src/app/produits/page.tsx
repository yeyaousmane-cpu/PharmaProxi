import Link from "next/link";
import { BookOpen, Search } from "lucide-react";
import { CatalogCard } from "@/components/catalog-card";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/server";
import { humanizeError } from "@/lib/errors";
import { FORMS, REGULATION, TIER_LABEL, type CatalogRow, type RegulatoryClass } from "@/lib/catalog";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "Catalogue national des médicaments",
  description: "Médicaments du Mali classés par famille thérapeutique : DCI, dosages, formes, statut réglementaire et pharmacies qui les déclarent.",
};

const PAGE_SIZE = 30;
type SP = Record<string, string | undefined>;
const slug = (v?: string) => (v && /^[a-z_]{2,40}$/.test(v) ? v : null);

export default async function CataloguePage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 100);
  const family = slug(sp.famille);
  const reg = sp.statut && sp.statut in REGULATION ? (sp.statut as RegulatoryClass) : null;
  const tier = sp.niveau && sp.niveau in TIER_LABEL ? sp.niveau : null;
  const form = FORMS.includes(sp.forme as (typeof FORMS)[number]) ? sp.forme! : null;
  const page = Math.max(1, Math.min(70, Number(sp.page) || 1));

  const supabase = await createClient();
  const [{ data: fams }, { data, error }] = await Promise.all([
    supabase.from("therapeutic_families").select("slug,label").order("label"),
    supabase.rpc("catalog_search", {
      p_query: q || null, p_family: family, p_form: form, p_regulation: reg, p_tier: tier,
      p_limit: PAGE_SIZE, p_offset: (page - 1) * PAGE_SIZE,
    }),
  ]);
  const rows = (data as CatalogRow[] | null) ?? [];
  const total = Number(rows[0]?.total_count ?? 0);
  const pages = Math.ceil(total / PAGE_SIZE);
  const familyLabel = fams?.find((f) => f.slug === family)?.label;
  const link = (patch: SP) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, ...patch })) if (v) p.set(k, v);
    return `/produits?${p}`;
  };

  return (
    <div className="container-page py-6">
      <header className="mb-4">
        <h1 className="flex items-center gap-2 text-2xl font-bold"><BookOpen className="size-6 text-primary" aria-hidden /> Catalogue national des médicaments</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Présentations issues de la nomenclature nationale (DPM, 2024) et de la Liste nationale des médicaments essentiels 2024.
          Ce catalogue informe ; il ne remplace pas l&apos;avis d&apos;un médecin ou d&apos;un pharmacien. La disponibilité réelle dépend de chaque pharmacie.
        </p>
      </header>

      <form method="get" action="/produits" className="grid gap-3 rounded-2xl border bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-6">
        <div className="space-y-1 lg:col-span-2">
          <Label htmlFor="q">Nom, DCI, marque, dosage</Label>
          <Input id="q" name="q" defaultValue={q} placeholder="ex. amoxicilline 500, Doliprane, sirop" maxLength={100} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="famille">Famille</Label>
          <Select id="famille" name="famille" defaultValue={family ?? ""}>
            <option value="">Toutes</option>
            {fams?.map((f) => <option key={f.slug} value={f.slug}>{f.label}</option>)}
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="forme">Forme</Label>
          <Select id="forme" name="forme" defaultValue={form ?? ""}>
            <option value="">Toutes</option>
            {FORMS.map((f) => <option key={f} value={f}>{f}</option>)}
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="statut">Délivrance</Label>
          <Select id="statut" name="statut" defaultValue={reg ?? ""}>
            <option value="">Toutes</option>
            {Object.entries(REGULATION).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="niveau">Priorité</Label>
          <Select id="niveau" name="niveau" defaultValue={tier ?? ""}>
            <option value="">Toutes</option>
            {Object.entries(TIER_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </div>
        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-6">
          <Button type="submit"><Search className="size-4" aria-hidden /> Rechercher</Button>
          {(q || family || form || reg || tier) && <Link prefetch={false} href="/produits" className="text-sm underline">Effacer les filtres</Link>}
        </div>
      </form>

      {!q && !family && fams && (
        <nav aria-label="Familles thérapeutiques" className="mt-6">
          <h2 className="mb-2 text-lg font-bold">Parcourir par famille</h2>
          <ul className="flex flex-wrap gap-2">
            {fams.map((f) => (
              <li key={f.slug}>
                <Link prefetch={false} href={`/produits?famille=${f.slug}`} className="inline-block rounded-full border bg-white px-3 py-1 text-sm hover:border-primary hover:text-primary">{f.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
      )}

      <section className="mt-6" aria-live="polite">
        {error && <Alert tone="error" title={humanizeError(error)} />}
        {!error && (
          <p className="mb-3 text-sm text-muted-foreground">
            {total} présentation{total > 1 ? "s" : ""}{familyLabel ? <> · {familyLabel}</> : null}{q ? <> pour « {q} »</> : null}
          </p>
        )}
        {!error && rows.length === 0 && (
          <p className="rounded-xl border border-dashed bg-white p-6 text-center text-sm text-muted-foreground">
            Aucune présentation ne correspond. Essayez la DCI (principe actif) ou retirez un filtre.
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{rows.map((c) => <CatalogCard key={c.catalog_id} c={c} />)}</div>
        {pages > 1 && (
          <nav aria-label="Pagination" className="mt-6 flex items-center justify-center gap-2">
            {page > 1 && <Link prefetch={false} className={cn(buttonVariants({ variant: "outline", size: "sm" }))} href={link({ page: String(page - 1) })}>Précédent</Link>}
            <span className="text-sm">Page {page} / {pages}</span>
            {page < pages && <Link prefetch={false} className={cn(buttonVariants({ variant: "outline", size: "sm" }))} href={link({ page: String(page + 1) })}>Suivant</Link>}
          </nav>
        )}
      </section>
    </div>
  );
}
