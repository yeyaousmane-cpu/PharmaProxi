import { notFound } from "next/navigation";
import { FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getGeo } from "@/lib/geo";
import { ResultCard, type SearchRow } from "@/components/result-card";
import { LocationPicker } from "@/components/location-picker";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { createAlert } from "@/app/actions/services";
import { getSession } from "@/lib/auth";
import Link from "next/link";
import { BellRing, ShieldPlus } from "lucide-react";
import { emptyAmoResults, type AmoResults } from "@/lib/amo";
import { formatXof } from "@/lib/format";
import { AMM_LABEL, TIER_LABEL, canBookOnline, regulation } from "@/lib/catalog";
import { NOT_LISTED } from "@/lib/freshness";
import { cn } from "@/lib/utils";

export const metadata = { title: "Produit" };

export default async function ProductPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data: m } = await supabase
    .from("medicine_catalog")
    .select("id, brand_name, generic_name, active_ingredient, dosage, form, packaging, manufacturer, requires_prescription, merged_into, review_status, therapeutic_subfamily, regulatory_class, priority_tier, lnme_2024, lnme_reference, amm_status, cold_chain, target_public, common_names, catalog_source, therapeutic_families!medicine_catalog_therapeutic_family_fkey(label), product_categories(name, requires_prescription)")
    .eq("id", id)
    .maybeSingle();
  if (!m) notFound();
  const uuid = (v?: string) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : null);
  const [geo, session, res] = await Promise.all([
    getGeo(),
    getSession(),
    supabase.rpc("search_inventory", { p_query: "", p_catalog: m.merged_into ?? m.id, p_region: uuid(sp.region), p_commune: uuid(sp.commune), p_sort: "freshness", p_limit: 50 }),
  ]);
  const rows = (res.data as SearchRow[]) ?? [];
  const catalogId = m.merged_into ?? m.id;
  const { data: amoData } = await supabase.rpc("amo_for_results", { p_catalog: [catalogId], p_pharmacies: [...new Set(rows.map((r) => r.pharmacy_id))] });
  const amo = (amoData as AmoResults | null) ?? emptyAmoResults();
  const amoProduct = amo.products[catalogId];
  type Eq = { catalog_id: string; brand_name: string; dosage: string | null; form: string | null; packaging: string | null; manufacturer: string | null; is_same: boolean; min_price: number | null; max_price: number | null; pharmacies: number };
  const equivalents = (((await supabase.rpc("equivalent_products", { p_catalog: catalogId })).data as Eq[] | null) ?? []);
  type Brand = { brand_name: string; holder: string | null; manufacturer: string | null; status: string };
  const brands = (((await supabase.from("medicine_brands").select("brand_name, holder, manufacturer, status").eq("catalog_id", catalogId).order("brand_name")).data as Brand[] | null) ?? []);
  const fam = Array.isArray(m.therapeutic_families) ? m.therapeutic_families[0] : m.therapeutic_families;
  const reg = regulation(m.regulatory_class);
  const bookable = canBookOnline(m.regulatory_class);
  const declaring = rows.filter((r) => ["available", "low", "to_confirm"].includes(r.freshness));
  const cat = Array.isArray(m.product_categories) ? m.product_categories[0] : m.product_categories;
  const rx = m.requires_prescription || cat?.requires_prescription;
  const details: [string, string | null][] = [
    ["Nom générique", m.generic_name], ["Principe(s) actif(s)", m.active_ingredient], ["Dosage", m.dosage], ["Forme", m.form],
    ["Conditionnement", m.packaging], ["Fabricant", m.manufacturer],
    ["Famille thérapeutique", fam?.label ?? cat?.name ?? null], ["Sous-famille", m.therapeutic_subfamily],
    ["Niveau de priorité", m.priority_tier ? TIER_LABEL[m.priority_tier] ?? m.priority_tier : null],
    ["Liste des médicaments essentiels", m.lnme_2024 ? `Inscrit LNME 2024${m.lnme_reference ? ` (${m.lnme_reference})` : ""}` : null],
    ["Conservation", m.cold_chain ? "Chaîne du froid (2–8 °C)" : null],
    ["Public", m.target_public], ["Source", m.catalog_source],
  ];
  return (
    <div className="container-page space-y-6 py-6">
      <header className="rounded-2xl border bg-white p-5">
        <h1 className="text-2xl font-bold">{[m.brand_name, m.dosage].filter(Boolean).join(" ")}</h1>
        <div className="mt-2 flex flex-wrap gap-2">
          {m.regulatory_class ? (
            <Badge className={cn(reg.className)} title={reg.hint}>{m.regulatory_class !== "libre" && <FileText className="size-3" aria-hidden />} {reg.label}</Badge>
          ) : rx && <Badge className="border-sky-200 bg-sky-50 text-sky-800"><FileText className="size-3" aria-hidden /> Sur ordonnance</Badge>}
          {m.lnme_2024 && <Badge className="border-teal-200 bg-teal-50 text-teal-800">LNME 2024</Badge>}
          {m.review_status === "pending" && <Badge className="bg-white text-muted-foreground">Fiche en cours de vérification</Badge>}
        </div>
        <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {details.filter(([, v]) => v).map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 border-b py-1"><dt className="text-muted-foreground">{k}</dt><dd className="text-end font-medium">{v}</dd></div>
          ))}
        </dl>
        {m.regulatory_class && m.regulatory_class !== "libre" && (
          <Alert tone={bookable ? "warning" : "error"} className="mt-4" title={reg.label}>
            {reg.hint}{" "}
            {bookable
              ? "Le pharmacien vous demandera l'ordonnance au moment du retrait. Pas d'automédication."
              : "Ce produit ne peut pas être réservé sur SantéProxi : adressez-vous directement à la pharmacie ou à l'établissement de soins, avec votre ordonnance."}
          </Alert>
        )}
        <div className="mt-4 rounded-xl border p-4 text-sm">
          <h2 className="font-semibold">Spécialités commerciales</h2>
          {brands.length > 0 ? (
            <ul className="mt-2 divide-y">
              {brands.map((b) => (
                <li key={b.brand_name} className="flex flex-wrap justify-between gap-2 py-1.5">
                  <span className="font-medium">{b.brand_name}</span>
                  <span className="text-xs text-muted-foreground">{[b.holder, b.manufacturer].filter(Boolean).join(" · ")}{b.status === "nomenclature_2024" || b.status === "verifiee" ? " · nomenclature DPM 2024" : " · signalée, non vérifiée"}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-muted-foreground">{AMM_LABEL[m.amm_status ?? "a_verifier"] ?? AMM_LABEL.a_verifier}. Demandez au pharmacien les marques disponibles.</p>
          )}
          {m.common_names && (
            <p className="mt-2 text-xs text-muted-foreground">
              Noms courants associés à cette DCI : {m.common_names}. Ces noms aident à la recherche ; ils ne figurent pas à la nomenclature DPM 2024 et leur commercialisation au Mali n&apos;est pas vérifiée.
            </p>
          )}
        </div>
        {amoProduct?.amo && (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-brand-mint p-4 text-sm">
            <p className="flex items-center gap-2 font-semibold text-brand-deep"><ShieldPlus className="size-4" aria-hidden /> Figure sur la liste AMO</p>
            <p className="mt-1">
              Désignation officielle : <span className="font-medium">{amoProduct.name}</span>{amoProduct.code ? ` (${amoProduct.code})` : ""}
              {amoProduct.tariff !== null && <> · tarif de référence {formatXof(amoProduct.tariff)} · prise en charge {amoProduct.rate} %</>}.
            </p>
            {amoProduct.tariff !== null && amoProduct.rate !== null && (
              <p className="mt-1">Au tarif de référence, il vous resterait environ <span className="font-semibold">{formatXof(amoProduct.tariff - Math.round(amoProduct.tariff * amoProduct.rate / 100))}</span> à payer avec votre carte AMO, dans une pharmacie conventionnée et sur ordonnance.</p>
            )}
            <Link prefetch={false} href="/amo" className="mt-1 inline-block font-semibold text-primary underline">Comment fonctionne l&apos;AMO</Link>
          </div>
        )}
        <Alert tone="info" className="mt-4" title="Information, pas une recommandation">
          Cette fiche décrit le produit tel que référencé. Elle ne remplace pas la notice ni l&apos;avis d&apos;un pharmacien ou d&apos;un médecin.
        </Alert>
      </header>
      {equivalents.filter((e) => !e.is_same).length > 0 && (
        <section id="equivalents" aria-labelledby="eq-title" className="scroll-mt-24 space-y-3 rounded-2xl border bg-white p-5">
          <h2 id="eq-title" className="text-lg font-bold">Même principe actif, même dosage</h2>
          <p className="text-sm text-muted-foreground">Produits équivalents et prix déclarés par les pharmacies vérifiées (30 derniers jours). Demandez toujours l&apos;avis du pharmacien avant de changer de médicament.</p>
          <ul className="divide-y text-sm">
            {equivalents.map((e) => (
              <li key={e.catalog_id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>{e.is_same ? <strong>{e.brand_name} (ce produit)</strong> : <Link prefetch={false} href={`/produits/${e.catalog_id}`} className="font-medium text-primary hover:underline">{e.brand_name}</Link>}
                  <span className="text-muted-foreground">{[e.form, e.packaging, e.manufacturer].filter(Boolean).length ? ` · ${[e.form, e.packaging, e.manufacturer].filter(Boolean).join(" · ")}` : ""}</span></span>
                <span className="text-end">{e.min_price !== null ? <><strong>{e.min_price === e.max_price ? formatXof(e.min_price) : `${formatXof(e.min_price)} – ${formatXof(e.max_price)}`}</strong> <span className="text-xs text-muted-foreground">· {e.pharmacies} pharmacie(s)</span></> : <span className="text-xs text-muted-foreground">prix non déclaré</span>}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section aria-labelledby="dispo-title" className="space-y-3">
        <h2 id="dispo-title" className="text-lg font-bold">Pharmacies qui déclarent ce produit</h2>
        <form method="get" className="flex flex-col gap-2 rounded-xl border bg-white p-3 sm:flex-row sm:items-end">
          <LocationPicker geo={geo} compact names={{ region: "region", commune: "commune" }} defaults={{ region: sp.region, commune: sp.commune }} className="flex-1" />
          <Button type="submit">Filtrer</Button>
        </form>
        <p className="text-sm text-muted-foreground">
          Statut, prix et date de mise à jour sont déclarés par chaque pharmacie. Au-delà de 24 h, la disponibilité est « à confirmer » ; au-delà de 72 h elle n&apos;est plus considérée comme fiable.
        </p>
        {declaring.length === 0 && bookable && (
          <div id="alerte" className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="flex items-center gap-2 font-semibold"><BellRing className="size-4" aria-hidden /> Introuvable pour l&apos;instant ?</p>
              <p className="text-sm text-amber-950">
                Recevez une notification dès qu&apos;une pharmacie vérifiée {sp.commune || sp.region ? "de cette zone " : ""}le déclare disponible (pendant 30 jours).
                Les pharmacies voient seulement le nombre de personnes qui le recherchent, jamais votre identité.
              </p>
            </div>
            {session ? (
              <ActionForm action={createAlert} className="shrink-0">
                <input type="hidden" name="catalog_id" value={m.merged_into ?? m.id} />
                <input type="hidden" name="region" value={uuid(sp.region) ?? ""} />
                <input type="hidden" name="commune" value={uuid(sp.commune) ?? ""} />
                <SubmitButton size="sm" pendingText="Création…">M&apos;alerter</SubmitButton>
              </ActionForm>
            ) : (
              <Link prefetch={false} href={`/connexion?suite=${encodeURIComponent(`/produits/${m.id}`)}`} className="shrink-0 text-sm font-semibold text-primary underline">Connectez-vous pour être alerté(e)</Link>
            )}
          </div>
        )}
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground"><strong>{NOT_LISTED.label}</strong> : {NOT_LISTED.hint}</p>
        ) : (
          <div className="grid gap-3">{rows.map((r) => <ResultCard key={r.inventory_id} r={r} amo={amoProduct} pharmacyAmo={amo.pharmacies[r.pharmacy_id]} />)}</div>
        )}
      </section>
    </div>
  );
}
