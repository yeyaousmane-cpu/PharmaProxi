"use client";
import { useMemo, useState } from "react";
import { FileText } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Field, Textarea, Input } from "@/components/ui/input";
import { createOrder } from "@/app/actions/orders";
import { formatXof } from "@/lib/format";
import { FRESHNESS, type Freshness } from "@/lib/freshness";

export type OrderableItem = {
  inventory_id: string; label: string; price_xof: number; freshness: Freshness; requires_prescription: boolean;
};

/** Demande de réservation, à retirer en pharmacie (SantéProxi ne livre pas). */
export function OrderRequestForm({
  pharmacyId, items, preselected, offersPickup, maxQty,
}: {
  pharmacyId: string; items: OrderableItem[]; preselected?: string; offersPickup: boolean; maxQty: number;
}) {
  // Clé d'idempotence générée une fois par formulaire : un double clic ou un renvoi réseau ne crée pas deux commandes.
  const [key] = useState(() => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`));
  const [selected, setSelected] = useState<Record<string, number>>(preselected ? { [preselected]: 1 } : {});

  const chosen = items.filter((i) => selected[i.inventory_id]);
  const subtotal = chosen.reduce((s, i) => s + i.price_xof * selected[i.inventory_id], 0);
  const hasRx = chosen.some((i) => i.requires_prescription);
  const sorted = useMemo(() => [...items].sort((a, b) => (a.inventory_id === preselected ? -1 : b.inventory_id === preselected ? 1 : 0)), [items, preselected]);

  if (!offersPickup) return <Alert tone="info" title="Cette pharmacie ne propose pas le retrait de réservations.">Appelez-la directement.</Alert>;
  if (items.length === 0) return <Alert tone="info" title="Aucun produit ne peut être demandé en ligne pour le moment.">Appelez directement la pharmacie.</Alert>;

  return (
    <ActionForm action={createOrder} className="space-y-4">
      <input type="hidden" name="pharmacy_id" value={pharmacyId} />
      <input type="hidden" name="idempotency_key" value={key} />
      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-semibold">Produits</legend>
        <ul className="max-h-80 divide-y overflow-auto rounded-lg border">
          {sorted.map((i) => {
            const on = Boolean(selected[i.inventory_id]);
            return (
              <li key={i.inventory_id} className="flex flex-wrap items-center gap-3 p-3">
                <label className="flex flex-1 items-start gap-2">
                  <input type="checkbox" name="item" value={i.inventory_id} checked={on} className="mt-1 size-4"
                    onChange={(e) => setSelected((s) => { const n = { ...s }; if (e.target.checked) n[i.inventory_id] = 1; else delete n[i.inventory_id]; return n; })} />
                  <span>
                    <span className="font-medium">{i.label}</span>
                    <span className="block text-xs text-muted-foreground">{formatXof(i.price_xof)} · {FRESHNESS[i.freshness].label}</span>
                    {i.requires_prescription && <Badge className="mt-1 border-sky-200 bg-sky-50 text-sky-800"><FileText className="size-3" aria-hidden /> Ordonnance à présenter</Badge>}
                  </span>
                </label>
                {on && (
                  <label className="flex items-center gap-2 text-sm">
                    Qté
                    <Input type="number" name={`qty_${i.inventory_id}`} min={1} max={maxQty} value={selected[i.inventory_id]} className="h-9 w-20"
                      onChange={(e) => setSelected((s) => ({ ...s, [i.inventory_id]: Math.max(1, Math.min(maxQty, Number(e.target.value) || 1)) }))} />
                  </label>
                )}
              </li>
            );
          })}
        </ul>
      </fieldset>

      <input type="hidden" name="fulfillment" value="pickup" />
      <p className="rounded-lg border p-3 text-sm"><strong>Retrait en pharmacie.</strong> SantéProxi ne livre pas de médicaments.</p>

      <Field label="Message à la pharmacie (facultatif)" htmlFor="note" hint="N'indiquez pas d'informations médicales personnelles.">
        <Textarea id="note" name="note" maxLength={500} rows={2} />
      </Field>

      {hasRx && <Alert tone="info" title="Ordonnance requise">Le produit sera délivré uniquement en pharmacie, sur présentation de l&apos;ordonnance originale.</Alert>}

      <div className="rounded-lg bg-muted p-3 text-sm">
        <div className="flex justify-between"><span>Produits</span><span>{formatXof(subtotal)}</span></div>
        <div className="mt-1 flex justify-between border-t pt-1 font-bold"><span>Total estimé</span><span>{formatXof(subtotal)}</span></div>
        <p className="mt-2 text-xs text-muted-foreground">
          Rien n&apos;est encore réservé ni payé : la pharmacie doit d&apos;abord confirmer la disponibilité réelle. Paiement à la pharmacie au retrait.
        </p>
      </div>
      <SubmitButton className="w-full" size="lg" disabled={chosen.length === 0} pendingText="Envoi de la demande…">
        Envoyer la demande de confirmation
      </SubmitButton>
    </ActionForm>
  );
}
