import Link from "next/link";
import { Download } from "lucide-react";
import { requireCurrentPharmacy } from "@/lib/pharmacy";
import { createClient } from "@/lib/supabase/server";
import type { Freshness } from "@/lib/freshness";
import { Pagination, pageRange } from "@/components/pagination";
import { Alert } from "@/components/ui/alert";
import { humanizeError } from "@/lib/errors";
import { PharmacyHeader } from "@/components/pharmacy/pharmacy-header";
import { StockRow, type StockLine } from "@/components/pharmacy/stock-row";
import { AddProductForm } from "@/components/pharmacy/add-product-form";
import { ImportForm } from "@/components/pharmacy/import-form";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { buttonVariants } from "@/components/ui/button";
import { confirmAllFresh } from "@/app/actions/pharmacy";
import { cn } from "@/lib/utils";

export const metadata = { title: "Gestion des stocks" };

const STOCK_PAGE = 100;
const VIEWS = { tous: "Tous", a_renseigner: "À renseigner", disponibles: "Disponibles", faibles: "Stock faible", indisponibles: "Rupture", sur_commande: "Sur commande", anciens: "À actualiser" } as const;

export default async function StocksPage({ searchParams }: { searchParams: Promise<{ vue?: string; q?: string; page?: string }> }) {
  const sp = await searchParams;
  const view = (sp.vue && sp.vue in VIEWS ? sp.vue : "tous") as keyof typeof VIEWS;
  const ph = await requireCurrentPharmacy();
  const readOnly = ph.status === "suspended";
  const supabase = await createClient();
  const range = pageRange(sp.page, STOCK_PAGE);
  const [{ data, error }, { data: categories }, { count: totalAll }] = await Promise.all([
    supabase.rpc("pharmacy_stock_page", { p_pharmacy: ph.id, p_view: view, p_query: (sp.q ?? "").trim() || null, p_limit: STOCK_PAGE, p_offset: range.from }),
    supabase.from("product_categories").select("id, name").eq("is_authorized", true).order("name"),
    supabase.from("pharmacy_inventory").select("id", { count: "exact", head: true }).eq("pharmacy_id", ph.id),
  ]);
  type Row = { id: string; catalog_id: string; quantity: number; reserved_quantity: number; price_xof: number | null; is_available: boolean;
    low_stock_threshold: number; stock_updated_at: string; row_version: number; brand_name: string; dosage: string | null; form: string | null;
    packaging: string | null; review_status: string; freshness: Freshness; total_count: number };
  const rows = (data as Row[]) ?? [];
  const onOrder = new Set<string>();
  if (rows.length) {
    const { data: oo } = await supabase.from("pharmacy_inventory").select("id").in("id", rows.map((r) => r.id)).eq("on_order", true);
    for (const o of oo ?? []) onOrder.add(o.id as string);
  }
  const total = Number(rows[0]?.total_count ?? 0);
  const filtered: StockLine[] = rows.map((r) => ({
    id: r.id, catalog_id: r.catalog_id, quantity: r.quantity, reserved_quantity: r.reserved_quantity, price_xof: r.price_xof,
    is_available: r.is_available, low_stock_threshold: r.low_stock_threshold, stock_updated_at: r.stock_updated_at, row_version: r.row_version,
    label: [r.brand_name, r.dosage, r.form, r.packaging].filter(Boolean).join(" · "),
    pending_review: r.review_status === "pending",
    freshness: r.freshness,
    on_order: onOrder.has(r.id),
  }));
  const lines = { length: totalAll ?? 0 };

  return (
    <>
      <PharmacyHeader current={ph} title="Gestion des stocks" />
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader className="gap-3">
            <div className="flex flex-wrap gap-1">
              {Object.entries(VIEWS).map(([k, v]) => (
                <Link prefetch={false} key={k} href={`/pharmacien/stocks?vue=${k}${sp.q ? `&q=${encodeURIComponent(sp.q)}` : ""}`}
                  className={cn("rounded-full border px-3 py-1 text-xs font-medium", view === k ? "border-primary bg-primary text-white" : "bg-white")}>{v}</Link>
              ))}
            </div>
            <form method="get" className="flex gap-2">
              <input type="hidden" name="vue" value={view} />
              <label htmlFor="q" className="sr-only">Rechercher dans mon stock</label>
              <Input id="q" name="q" placeholder="Rechercher dans mon stock…" defaultValue={sp.q} className="h-9" />
            </form>
          </CardHeader>
          <CardContent>
            {!readOnly && filtered.length > 0 && (
              <ActionForm action={confirmAllFresh} id="confirm-fresh" className="mb-2 flex flex-wrap items-center gap-2 rounded-lg bg-muted p-2 text-sm">
                <span>Cochez les produits inchangés puis :</span>
                <SubmitButton size="sm" variant="secondary">Confirmer le stock à l&apos;identique</SubmitButton>
              </ActionForm>
            )}
            {error && <Alert tone="error" title={humanizeError(error)} className="mb-2" />}
            {filtered.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">{lines.length === 0 ? "Aucun produit. Ajoutez-en depuis le catalogue national ou importez un fichier Excel." : "Aucun produit dans cette vue."}</p>
            ) : (
              <ul className="divide-y">{filtered.map((l) => <StockRow key={`${l.id}-${l.row_version}`} line={l} readOnly={readOnly} />)}</ul>
            )}
            <Pagination basePath="/pharmacien/stocks" params={{ vue: view, q: sp.q }} page={range.page} total={total} size={STOCK_PAGE} />
          </CardContent>
        </Card>
        <div className="space-y-6">
          {!readOnly && (
            <>
              <Card>
                <CardHeader><CardTitle>Depuis le catalogue national</CardTitle></CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <p className="text-muted-foreground">Parcourez les présentations par famille et ajoutez-en plusieurs d&apos;un coup, puis renseignez quantité et prix.</p>
                  <Link prefetch={false} href="/pharmacien/stocks/catalogue" className={cn(buttonVariants({ variant: "secondary" }), "w-full")}>Parcourir le catalogue</Link>
                </CardContent>
              </Card>
              <Card><CardHeader><CardTitle>Ajouter un produit</CardTitle></CardHeader><CardContent><AddProductForm pharmacyId={ph.id} categories={categories ?? []} /></CardContent></Card>
              <Card><CardHeader><CardTitle>Importer un catalogue</CardTitle></CardHeader><CardContent><ImportForm pharmacyId={ph.id} /></CardContent></Card>
            </>
          )}
          <div className="grid grid-cols-2 gap-2">
            <a href={`/api/pharmacien/export?pharmacy=${ph.id}&format=xlsx`} className={cn(buttonVariants({ variant: "outline" }), "w-full")}><Download aria-hidden /> Excel</a>
            <a href={`/api/pharmacien/export?pharmacy=${ph.id}`} className={cn(buttonVariants({ variant: "outline" }), "w-full")}><Download aria-hidden /> CSV</a>
          </div>
          <Link prefetch={false} href="/pharmacien/mouvements" className="block text-center text-sm underline">Historique des modifications</Link>
        </div>
      </div>
    </>
  );
}
