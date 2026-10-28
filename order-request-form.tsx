"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { FileText } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Field, Select, Textarea, Input } from "@/components/ui/input";
import { createOrder } from "@/app/actions/orders";
import { formatXof } from "@/lib/format";
import { FRESHNESS, type Freshness } from "@/lib/freshness";

export type OrderableItem = {
  inventory_id: string; label: string; price_xof: number; freshness: Freshness; requires_prescription: boolean; delivery_allowed: boolean;
};

export function OrderRequestForm({
  pharmacyId, items, preselected, addresses, deliveryEnabled, offersDelivery, offersPickup, deliveryFee, maxQty,
}: {
  pharmacyId: string; items: OrderableItem[]; preselected?: string; addresses: { id: string; label: string; address_line: string }[];
  deliveryEnabled: boolean; offersDelivery: boolean; offersPickup: boolean; deliveryFee: number; maxQty: number;
}) {
  // Clé d'idempotence générée une fois par formulaire : un double clic ou un renvoi réseau ne crée pas deux commandes.
  const [key] = useState(() => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`));
  const [selected, setSelected] = useState<Record<string, number>>(preselected ? { [preselected]: 1 } : {});
  const canDeliver = deliveryEnabled && offersDelivery;
  const [mode, setMode] = useState<"pickup" | "delivery">(offersPickup || !canDeliver ? "pickup" : "delivery");

  const chosen = items.filter((i) => selected[i.inventory_id]);
  const subtotal = chosen.reduce((s, i) => s + i.price_xof * selected[i.inventory_id], 0);
  const blocksDelivery = chosen.some((i) => !i.delivery_allowed);
  const hasRx = chosen.some((i) => i.requires_prescription);
  const fee = mode === "delivery" ? deliveryFee : 0;
  const sorted = useMemo(() => [...items].sort((a, b) => (a.inventory_id === preselected ? -1 : b.inventory_id === preselected ? 1 : 0)), [items, preselected]);

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

      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-semibold">Mode de remise</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className={`flex items-center gap-2 rounded-lg border p-3 ${!offersPickup ? "opacity-50" : ""}`}>
            <input type="radio" name="fulfillment" value="pickup" checked={mode === "pickup"} disabled={!offersPickup} onChange={() => setMode("pickup")} />
            Retrait en pharmacie
          </label>
          <label className={`flex items-center gap-2 rounded-lg border p-3 ${!canDeliver ? "opacity-50" : ""}`}>
            <input type="radio" name="fulfillment" value="delivery" checked={mode === "delivery"} disabled={!canDeliver} onChange={() => setMode("delivery")} />
            Livraison {!deliveryEnabled ? "(bientôt)" : !offersDelivery ? "(non proposée)" : ""}
          </label>
        </div>
        {mode === "delivery" && blocksDelivery && (
          <Alert tone="warning" title="Livraison impossible pour au moins un produit">Les médicaments sur ordonnance et certaines catégories ne sont jamais livrés. Choisissez le retrait.</Alert>
        )}
        {mode === "delivery" && (
          addresses.length ? (
            <>
              <Field label="Adresse de livraison" htmlFor="address_id" required>
                <Select id="address_id" name="address_id" required>
                  {addresses.map((a) => <option key={a.id} value={a.id}>{a.label} — {a.address_line}</option>)}
                </Select>
              </Field>
              <Field label="Instructions pour le livreur" htmlFor="instructions" hint="Point de repère, étage… (pas d'information médicale)">
                <Input id="instructions" name="instructions" maxLength={300} />
              </Field>
            </>
          ) : (
            <Alert tone="info" title="Aucune adresse enregistrée"><Link prefetch={false} href="/compte#adresses" className="underline">Ajoutez une adresse</Link> pour demander une livraison.</Alert>
          )
        )}
      </fieldset>

      <Field label="Message à la pharmacie (facultatif)" htmlFor="note" hint="N'indiquez pas d'informations médicales personnelles.">
        <Textarea id="note" name="note" maxLength={500} rows={2} />
      </Field>

      {hasRx && <Alert tone="info" title="Ordonnance requise">Le produit sera délivré uniquement en pharmacie, sur présentation de l&apos;ordonnance originale.</Alert>}

      <div className="rounded-lg bg-muted p-3 text-sm">
        <div className="flex justify-between"><span>Produits</span><span>{formatXof(subtotal)}</span></div>
        {mode === "delivery" && <div className="flex justify-between"><span>Frais de livraison</span><span>{formatXof(fee)}</span></div>}
        <div className="mt-1 flex justify-between border-t pt-1 font-bold"><span>Total estimé</span><span>{formatXof(subtotal + fee)}</span></div>
        <p className="mt-2 text-xs text-muted-foreground">
          Rien n&apos;est encore réservé ni payé : la pharmacie doit d&apos;abord confirmer la disponibilité réelle. Paiement {mode === "delivery" ? "au livreur à la livraison" : "à la pharmacie au retrait"}.
        </p>
      </div>
      <SubmitButton className="w-full" size="lg" disabled={chosen.length === 0 || (mode === "delivery" && (blocksDelivery || !addresses.length))} pendingText="Envoi de la demande…">
        Envoyer la demande de confirmation
      </SubmitButton>
    </ActionForm>
  );
}
