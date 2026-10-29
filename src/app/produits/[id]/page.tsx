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
import { BellRing } from "lucide-react";

export const metadata = { title: "Produit" };

export default async function ProductPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data: m } = await supabase
    .from("medicine_catalog")
    .select("id, brand_name, generic_name, active_ingredient, dosage, form, packaging, manufacturer, requires_prescription, merged_into, review_status, product_categories(name, requires_prescription)")
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
  const cat = Array.isArray(m.product_categories) ? m.product_categories[0] : m.product_categories;
  const rx = m.requires_prescription || cat?.requires_prescription;
  const details: [string, string | null][] = [
    ["Nom générique", m.generic_name], ["Principe(s) actif(s)", m.active_ingredient], ["Dosage", m.dosage], ["Forme", m.form],
    ["Conditionnement", m.packaging], ["Fabricant", m.manufacturer], ["Catégorie", cat?.name ?? null],
  ];
  return (
    <div className="container-page space-y-6 py-6">
      <header className="rounded-2xl border bg-white p-5">
        <h1 className="text-2xl font-bold">{[m.brand_name, m.dosage].filter(Boolean).join(" ")}</h1>
        <div className="mt-2 flex flex-wrap gap-2">
          {rx && <Badge className="border-sky-200 bg-sky-50 text-sky-800"><FileText className="size-3" aria-hidden /> Sur ordonnance</Badge>}
          {m.review_status === "pending" && <Badge className="bg-white text-muted-foreground">Fiche en cours de vérification</Badge>}
        </div>
        <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {details.filter(([, v]) => v).map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 border-b py-1"><dt className="text-muted-foreground">{k}</dt><dd className="text-right font-medium">{v}</dd></div>
          ))}
        </dl>
        <Alert tone="info" className="mt-4" title="Information, pas une recommandation">
          Cette fiche décrit le produit tel que référencé. Elle ne remplace pas la notice ni l&apos;avis d&apos;un pharmacien ou d&apos;un médecin.
        </Alert>
      </header>
      <section aria-labelledby="dispo-title" className="space-y-3">
        <h2 id="dispo-title" className="text-lg font-bold">Pharmacies qui déclarent ce produit</h2>
        <form method="get" className="flex flex-col gap-2 rounded-xl border bg-white p-3 sm:flex-row sm:items-end">
          <LocationPicker geo={geo} compact names={{ region: "region", commune: "commune" }} defaults={{ region: sp.region, commune: sp.commune }} className="flex-1" />
          <Button type="submit">Filtrer</Button>
        </form>
        {rows.filter((r) => r.freshness !== "unavailable").length === 0 && (
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
          <p className="text-sm text-muted-foreground">Aucune pharmacie vérifiée ne déclare ce produit dans cette zone.</p>
        ) : (
          <div className="grid gap-3">{rows.map((r) => <ResultCard key={r.inventory_id} r={r} />)}</div>
        )}
      </section>
    </div>
  );
}
