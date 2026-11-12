import Link from "next/link";
import { Pill, Store } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { regulation, TIER_LABEL, type CatalogRow } from "@/lib/catalog";
import { NOT_LISTED } from "@/lib/freshness";
import { cn } from "@/lib/utils";

/** Fiche résumée d'une présentation du catalogue national, indépendante des stocks. */
export function CatalogCard({ c }: { c: CatalogRow }) {
  const reg = regulation(c.regulatory_class);
  const n = Number(c.pharmacies_declaring);
  return (
    <Link
      prefetch={false}
      href={`/produits/${c.catalog_id}`}
      className="block rounded-xl border bg-white p-4 shadow-sm transition hover:border-primary focus-visible:outline-2 focus-visible:outline-primary"
    >
      <div className="flex items-start gap-3">
        <Pill className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-snug">
            {c.generic_name}
            {c.dosage ? <span className="font-normal"> {c.dosage}</span> : null}
          </p>
          <p className="text-sm text-muted-foreground">
            {c.form}
            {c.family_label ? <> · {c.family_label}</> : null}
          </p>
          {c.brands || c.common_names ? (
            <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
              {c.brands ? <>Spécialités : {c.brands}</> : <>Appelé aussi : {c.common_names}</>}
            </p>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge className={cn(reg.className)} title={reg.hint}>{reg.label}</Badge>
            {c.priority_tier ? <Badge className="border-slate-200 bg-slate-50 text-slate-700">{TIER_LABEL[c.priority_tier] ?? c.priority_tier}</Badge> : null}
            {c.lnme_2024 ? <Badge className="border-teal-200 bg-teal-50 text-teal-800" title="Inscrit sur la Liste nationale des médicaments essentiels 2024">LNME 2024</Badge> : null}
          </div>
          <p className="mt-2 flex items-center gap-1 text-xs">
            <Store className="size-3.5" aria-hidden />
            {n > 0
              ? <span className="text-emerald-800">Déclaré par {n} pharmacie{n > 1 ? "s" : ""} vérifiée{n > 1 ? "s" : ""}, à confirmer</span>
              : <span className="text-muted-foreground" title={NOT_LISTED.hint}>{NOT_LISTED.label} par les pharmacies inscrites</span>}
          </p>
        </div>
      </div>
    </Link>
  );
}
