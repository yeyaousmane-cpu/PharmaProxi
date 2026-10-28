import { notFound } from "next/navigation";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { requireCurrentPharmacy } from "@/lib/pharmacy";
import { createClient } from "@/lib/supabase/server";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { addBatch, deleteBatch } from "@/app/actions/pharmacy";
import { formatDate, formatDateTime, formatXof } from "@/lib/format";

export const metadata = { title: "Détail du stock" };
const KIND: Record<string, string> = { adjustment: "Ajustement", import: "Import CSV", reservation: "Réservation", release: "Libération", sale: "Vente", return: "Retour", expiry: "Péremption", correction: "Confirmation / correction" };

export default async function StockDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ph = await requireCurrentPharmacy();
  const supabase = await createClient();
  const { data: inv } = await supabase.from("pharmacy_inventory")
    .select("id, pharmacy_id, quantity, reserved_quantity, price_xof, is_available, stock_updated_at, medicine_catalog(brand_name, dosage, form, packaging, active_ingredient)")
    .eq("id", id).maybeSingle();
  if (!inv || inv.pharmacy_id !== ph.id) notFound();
  const [{ data: batches }, { data: moves }] = await Promise.all([
    supabase.from("inventory_batches").select("id, lot_number, expiry_date, quantity").eq("inventory_id", id).order("expiry_date"),
    supabase.from("inventory_movements").select("id, kind, quantity_delta, reserved_delta, quantity_after, reserved_after, price_after, note, created_at, order_id").eq("inventory_id", id).order("created_at", { ascending: false }).limit(200),
  ]);
  const c = Array.isArray(inv.medicine_catalog) ? inv.medicine_catalog[0] : inv.medicine_catalog;
  const today = new Date().toISOString().slice(0, 10);
  const soon = new Date(Date.now() + 90 * 86400_000).toISOString().slice(0, 10);
  const readOnly = ph.status === "suspended";
  return (
    <div className="space-y-6">
      <Link prefetch={false} href="/pharmacien/stocks" className="text-sm text-primary underline">← Retour aux stocks</Link>
      <h1 className="text-2xl font-bold">{[c?.brand_name, c?.dosage, c?.form].filter(Boolean).join(" · ")}</h1>
      <p className="text-sm text-muted-foreground">Quantité : {inv.quantity} · Réservée : {inv.reserved_quantity} · Prix : {formatXof(inv.price_xof)} · Mise à jour : {formatDateTime(inv.stock_updated_at)}</p>
      <Card>
        <CardHeader><CardTitle>Lots et dates de péremption</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {!batches?.length ? <p className="text-sm text-muted-foreground">Aucun lot enregistré.</p> : (
            <ul className="divide-y text-sm">
              {batches.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-2 py-2">
                  <span>Lot <strong>{b.lot_number}</strong> · {b.quantity} unité(s) · péremption {formatDate(b.expiry_date)}
                    {b.expiry_date < today ? <Badge className="ml-2 border-red-200 bg-red-50 text-red-800">Périmé</Badge> : b.expiry_date < soon ? <Badge className="ml-2 border-amber-200 bg-amber-50 text-amber-900">&lt; 3 mois</Badge> : null}
                  </span>
                  {!readOnly && <form action={deleteBatch}><input type="hidden" name="batch_id" value={b.id} /><input type="hidden" name="inventory_id" value={id} />
                    <button className="rounded p-2 text-destructive hover:bg-red-50" aria-label={`Supprimer le lot ${b.lot_number}`}><Trash2 className="size-4" /></button></form>}
                </li>
              ))}
            </ul>
          )}
          {!readOnly && (
            <ActionForm action={addBatch} resetOnSuccess className="grid gap-3 sm:grid-cols-4 sm:items-end" labels={{ lot_number: "Lot", expiry_date: "Péremption", quantity: "Quantité" }}>
              <input type="hidden" name="inventory_id" value={id} />
              <Field label="N° de lot" htmlFor="lot_number" required><Input id="lot_number" name="lot_number" required /></Field>
              <Field label="Péremption" htmlFor="expiry_date" required><Input id="expiry_date" name="expiry_date" type="date" required /></Field>
              <Field label="Quantité" htmlFor="bq" required><Input id="bq" name="quantity" type="number" min={0} required /></Field>
              <SubmitButton>Ajouter le lot</SubmitButton>
            </ActionForm>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Historique des modifications</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead><tr className="border-b text-left text-muted-foreground"><th className="py-1">Date</th><th>Type</th><th className="text-right">Δ qté</th><th className="text-right">Δ réservé</th><th className="text-right">Qté après</th><th className="text-right">Prix</th></tr></thead>
            <tbody>
              {(moves ?? []).map((m) => (
                <tr key={m.id} className="border-b">
                  <td className="py-1">{formatDateTime(m.created_at)}</td>
                  <td>{KIND[m.kind] ?? m.kind}{m.note ? <span className="text-muted-foreground"> — {m.note}</span> : null}</td>
                  <td className="text-right">{m.quantity_delta > 0 ? `+${m.quantity_delta}` : m.quantity_delta}</td>
                  <td className="text-right">{m.reserved_delta > 0 ? `+${m.reserved_delta}` : m.reserved_delta}</td>
                  <td className="text-right">{m.quantity_after}</td>
                  <td className="text-right">{m.price_after ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
