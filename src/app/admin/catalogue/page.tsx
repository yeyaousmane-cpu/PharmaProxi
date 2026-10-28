import { createClient } from "@/lib/supabase/server";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { addCategory, mergeCatalog, reviewCatalog, updateCategory } from "@/app/actions/admin";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Catalogue — administration" };

export default async function AdminCatalog() {
  const supabase = await createClient();
  const [{ data: pending }, { data: dups }, { data: cats }] = await Promise.all([
    supabase.from("medicine_catalog").select("id, brand_name, active_ingredient, dosage, form, packaging, manufacturer, created_at").eq("review_status", "pending").is("merged_into", null).order("created_at").limit(100),
    supabase.rpc("catalog_duplicate_candidates", { p_threshold: 0.55, p_limit: 50 }),
    supabase.from("product_categories").select("*").order("name"),
  ]);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Catalogue de médicaments</h1>
      <Card><CardHeader><CardTitle>Fiches à vérifier ({pending?.length ?? 0})</CardTitle><CardDescription>Fiches créées par les pharmacies. Elles restent utilisables pendant la vérification.</CardDescription></CardHeader>
        <CardContent>{!pending?.length ? <p className="text-sm text-muted-foreground">Aucune fiche en attente.</p> : (
          <ul className="divide-y">{pending.map((m) => (
            <li key={m.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm"><p className="font-semibold">{[m.brand_name, m.dosage, m.form, m.packaging].filter(Boolean).join(" · ")}</p>
                <p className="text-muted-foreground">{[m.active_ingredient, m.manufacturer].filter(Boolean).join(" — ")} · {formatDateTime(m.created_at)}</p></div>
              <div className="flex gap-2">
                <ActionForm action={reviewCatalog}><input type="hidden" name="catalog_id" value={m.id} /><input type="hidden" name="status" value="approved" /><SubmitButton size="sm">Approuver</SubmitButton></ActionForm>
                <ActionForm action={reviewCatalog}><input type="hidden" name="catalog_id" value={m.id} /><input type="hidden" name="status" value="rejected" /><SubmitButton size="sm" variant="outline" confirm="Rejeter cette fiche ? Elle ne sera plus visible.">Rejeter</SubmitButton></ActionForm>
              </div>
            </li>))}</ul>)}
        </CardContent></Card>

      <Card><CardHeader><CardTitle>Doublons probables</CardTitle><CardDescription>Fusionner déplace les stocks des pharmacies vers la fiche conservée.</CardDescription></CardHeader>
        <CardContent>{!(dups as unknown[])?.length ? <p className="text-sm text-muted-foreground">Aucun doublon détecté.</p> : (
          <ul className="divide-y">{(dups as { a_id: string; a_label: string; b_id: string; b_label: string; score: number }[]).map((d) => (
            <li key={`${d.a_id}-${d.b_id}`} className="flex flex-col gap-2 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
              <p><strong>{d.a_label}</strong> ↔ <strong>{d.b_label}</strong> <span className="text-muted-foreground">(similarité {Math.round(d.score * 100)} %)</span></p>
              <div className="flex gap-2">
                <ActionForm action={mergeCatalog}><input type="hidden" name="keep" value={d.a_id} /><input type="hidden" name="remove" value={d.b_id} /><SubmitButton size="sm" variant="outline" confirm={`Conserver « ${d.a_label} » ?`}>Garder la 1re</SubmitButton></ActionForm>
                <ActionForm action={mergeCatalog}><input type="hidden" name="keep" value={d.b_id} /><input type="hidden" name="remove" value={d.a_id} /><SubmitButton size="sm" variant="outline" confirm={`Conserver « ${d.b_label} » ?`}>Garder la 2e</SubmitButton></ActionForm>
              </div>
            </li>))}</ul>)}
        </CardContent></Card>

      <Card><CardHeader><CardTitle>Catégories de produits</CardTitle><CardDescription>N&apos;activez la livraison d&apos;une catégorie qu&apos;après vérification réglementaire. Les catégories sur ordonnance ne peuvent jamais être livrées.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <ul className="divide-y">{(cats ?? []).map((c) => (
            <li key={c.id} className="py-3">
              <ActionForm action={updateCategory} className="flex flex-col gap-2 text-sm lg:flex-row lg:items-center lg:justify-between">
                <input type="hidden" name="category_id" value={c.id} />
                <div><p className="font-semibold">{c.name}</p>{c.description && <p className="text-muted-foreground">{c.description}</p>}</div>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-1"><input type="checkbox" name="is_authorized" defaultChecked={c.is_authorized} className="size-4" /> Autorisée</label>
                  <label className="flex items-center gap-1"><input type="checkbox" name="requires_prescription" defaultChecked={c.requires_prescription} className="size-4" /> Ordonnance</label>
                  <label className="flex items-center gap-1"><input type="checkbox" name="delivery_allowed" defaultChecked={c.delivery_allowed} className="size-4" /> Livraison</label>
                  <SubmitButton size="sm" variant="outline">Enregistrer</SubmitButton>
                </div>
              </ActionForm>
            </li>))}</ul>
          <ActionForm action={addCategory} resetOnSuccess className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
            <Field label="Nouvelle catégorie" htmlFor="cat-name" required><Input id="cat-name" name="name" required /></Field>
            <Field label="Description" htmlFor="cat-desc"><Input id="cat-desc" name="description" /></Field>
            <label className="flex items-center gap-1 pb-3 text-sm"><input type="checkbox" name="requires_prescription" className="size-4" /> Ordonnance</label>
            <SubmitButton size="sm">Créer</SubmitButton>
          </ActionForm>
        </CardContent></Card>
    </div>
  );
}
