"use client";
import { useEffect, useState } from "react";
import { addProduct } from "@/app/actions/pharmacy";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Field, Input, Select } from "@/components/ui/input";

type Suggestion = { catalog_id: string; label: string; active_ingredient: string | null };

/** Ajout d'un produit : recherche dans le catalogue partagé, sinon création d'une fiche (dédoublonnée en base). */
export function AddProductForm({ pharmacyId, categories }: { pharmacyId: string; categories: { id: string; name: string }[] }) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Suggestion[]>([]);
  const [chosen, setChosen] = useState<Suggestion | null>(null);
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    if (q.trim().length < 2 || chosen) return setItems([]);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/suggestions?q=${encodeURIComponent(q.trim())}`);
        setItems(res.ok ? ((await res.json()) as Suggestion[]) : []);
      } catch {
        setItems([]);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q, chosen]);

  return (
    <ActionForm action={addProduct} resetOnSuccess className="space-y-3" labels={{ brand_name: "Nom commercial", quantity: "Quantité", price_xof: "Prix" }}>
      <input type="hidden" name="pharmacy_id" value={pharmacyId} />
      {!creating && (
        <div className="space-y-2">
          <Field label="Rechercher dans le catalogue" htmlFor="cat-search" hint="Nom commercial ou principe actif">
            <Input id="cat-search" value={chosen ? chosen.label : q} onChange={(e) => { setChosen(null); setQ(e.target.value); }} autoComplete="off" />
          </Field>
          {chosen && <input type="hidden" name="catalog_id" value={chosen.catalog_id} />}
          {!chosen && items.length > 0 && (
            <ul className="max-h-56 divide-y overflow-auto rounded-lg border">
              {items.map((s) => (
                <li key={s.catalog_id}>
                  <button type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => setChosen(s)}>
                    {s.label}{s.active_ingredient ? <span className="block text-xs text-muted-foreground">{s.active_ingredient}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button type="button" className="text-sm font-semibold text-primary underline" onClick={() => { setCreating(true); setChosen(null); }}>
            Produit absent du catalogue ? Créer une fiche
          </button>
        </div>
      )}
      {creating && (
        <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2">
          <Field label="Nom commercial" htmlFor="brand_name" required><Input id="brand_name" name="brand_name" required defaultValue={q} /></Field>
          <Field label="Principe actif" htmlFor="active_ingredient"><Input id="active_ingredient" name="active_ingredient" /></Field>
          <Field label="Dosage" htmlFor="dosage" hint="Ex. 500 mg"><Input id="dosage" name="dosage" /></Field>
          <Field label="Forme" htmlFor="form" hint="Comprimé, sirop…"><Input id="form" name="form" /></Field>
          <Field label="Conditionnement" htmlFor="packaging"><Input id="packaging" name="packaging" /></Field>
          <Field label="Fabricant" htmlFor="manufacturer"><Input id="manufacturer" name="manufacturer" /></Field>
          <Field label="Catégorie" htmlFor="category_id">
            <Select id="category_id" name="category_id" defaultValue="">
              <option value="">Non précisée</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <p className="text-xs text-muted-foreground sm:col-span-2">La fiche sera vérifiée par l&apos;administration. Si elle existe déjà (même nom, dosage, forme), la fiche existante est réutilisée.</p>
          <button type="button" className="text-left text-sm text-primary underline" onClick={() => setCreating(false)}>Revenir à la recherche</button>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Quantité" htmlFor="quantity" required><Input id="quantity" name="quantity" type="number" min={0} inputMode="numeric" required /></Field>
        <Field label="Prix de vente (FCFA)" htmlFor="price_xof"><Input id="price_xof" name="price_xof" type="number" min={0} inputMode="numeric" /></Field>
        <Field label="Seuil d'alerte" htmlFor="low_stock_threshold"><Input id="low_stock_threshold" name="low_stock_threshold" type="number" min={0} defaultValue={5} /></Field>
        <label className="flex items-end gap-2 pb-3 text-sm"><input type="checkbox" name="is_available" defaultChecked className="size-4" /> Disponible</label>
      </div>
      <SubmitButton disabled={!chosen && !creating}>Ajouter au stock</SubmitButton>
    </ActionForm>
  );
}
