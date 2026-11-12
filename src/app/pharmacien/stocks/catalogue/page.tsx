import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireCurrentPharmacy } from "@/lib/pharmacy";
import { createClient } from "@/lib/supabase/server";
import { humanizeError } from "@/lib/errors";
import { PharmacyHeader } from "@/components/pharmacy/pharmacy-header";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { addFromCatalog } from "@/app/actions/pharmacy";
import { FORMS, REGULATION, TIER_LABEL, regulation, type CatalogRow, type RegulatoryClass } from "@/lib/catalog";
import { cn } from "@/lib/utils";

export const metadata = { title: "Ajouter depuis le catalogue national" };

const PAGE_SIZE = 60;
type SP = Record<string, string | undefined>;

export default async function PharmacyCataloguePage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const ph = await requireCurrentPharmacy();
  const readOnly = ph.status === "suspended";
  const q = (sp.q ?? "").trim().slice(0, 100);
  const family = sp.famille && /^[a-z_]{2,40}$/.test(sp.famille) ? sp.famille : null;
  const reg = sp.statut && sp.statut in REGULATION ? (sp.statut as RegulatoryClass) : null;
  const tier = sp.niveau && sp.niveau in TIER_LABEL ? sp.niveau : null;
  const form = FORMS.includes(sp.forme as (typeof FORMS)[number]) ? sp.forme! : null;
  const page = Math.max(1, Math.min(30, Number(sp.page) || 1));

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
  const already = new Set<string>();
  if (rows.length) {
    const { data: inv } = await supabase.from("pharmacy_inventory").select("catalog_id").eq("pharmacy_id", ph.id).in("catalog_id", rows.map((r) => r.catalog_id));
    for (const i of inv ?? []) already.add(i.catalog_id as string);
  }
  const link = (patch: SP) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, ...patch })) if (v) p.set(k, v);
    return `/pharmacien/stocks/catalogue?${p}`;
  };

  return (
    <>
      <PharmacyHeader current={ph} title="Ajouter depuis le catalogue national" />
      <Link prefetch={false} href="/pharmacien/stocks" className="mb-4 inline-flex items-center gap-1 text-sm underline"><ArrowLeft className="size-4" aria-hidden /> Retour à mes stocks</Link>
      <Card>
        <CardHeader>
          <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-1 lg:col-span-2">
              <Label htmlFor="q">DCI, marque, dosage</Label>
              <Input id="q" name="q" defaultValue={q} maxLength={100} />
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
              <Label htmlFor="niveau">Priorité</Label>
              <Select id="niveau" name="niveau" defaultValue={tier ?? ""}>
                <option value="">Toutes</option>
                {Object.entries(TIER_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </div>
            <div className="flex items-end sm:col-span-2 lg:col-span-5"><Button type="submit" variant="secondary">Filtrer</Button></div>
          </form>
        </CardHeader>
        <CardContent>
          {error && <Alert tone="error" title={humanizeError(error)} className="mb-3" />}
          <p className="mb-3 text-sm text-muted-foreground">
            {total} présentation{total > 1 ? "s" : ""}. Les produits ajoutés arrivent « à renseigner » (quantité 0) et restent invisibles du public jusqu&apos;à votre première saisie.
          </p>
          {readOnly ? (
            <Alert tone="warning" title="Pharmacie suspendue : ajout impossible." />
          ) : (
            <ActionForm action={addFromCatalog}>
              <input type="hidden" name="pharmacy_id" value={ph.id} />
              <ul className="divide-y">
                {rows.map((c) => {
                  const has = already.has(c.catalog_id);
                  const r = regulation(c.regulatory_class);
                  return (
                    <li key={c.catalog_id} className="py-2">
                      <label className={cn("flex items-start gap-3", has && "opacity-60")}>
                        <input type="checkbox" name="catalog_id" value={c.catalog_id} disabled={has} className="mt-1 size-4" />
                        <span className="min-w-0 flex-1">
                          <span className="font-medium">{c.generic_name}{c.dosage ? ` ${c.dosage}` : ""}</span>
                          <span className="text-muted-foreground"> · {c.form}</span>
                          {c.brands && <span className="block truncate text-xs text-muted-foreground">Spécialités : {c.brands}</span>}
                          <span className="mt-1 flex flex-wrap gap-1">
                            <Badge className={r.className}>{r.label}</Badge>
                            {c.family_label && <Badge className="border-slate-200 bg-slate-50 text-slate-700">{c.family_label}</Badge>}
                            {has && <Badge className="border-emerald-200 bg-emerald-50 text-emerald-800">Déjà dans mon inventaire</Badge>}
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
              {rows.length > 0 && (
                <div className="sticky bottom-0 mt-3 border-t bg-white py-3">
                  <SubmitButton pendingText="Ajout…">Ajouter la sélection à mon inventaire</SubmitButton>
                </div>
              )}
            </ActionForm>
          )}
          {pages > 1 && (
            <nav aria-label="Pagination" className="mt-4 flex items-center justify-center gap-2">
              {page > 1 && <Link prefetch={false} className={cn(buttonVariants({ variant: "outline", size: "sm" }))} href={link({ page: String(page - 1) })}>Précédent</Link>}
              <span className="text-sm">Page {page} / {pages}</span>
              {page < pages && <Link prefetch={false} className={cn(buttonVariants({ variant: "outline", size: "sm" }))} href={link({ page: String(page + 1) })}>Suivant</Link>}
            </nav>
          )}
        </CardContent>
      </Card>
    </>
  );
}
