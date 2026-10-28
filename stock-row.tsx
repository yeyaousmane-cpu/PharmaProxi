"use client";
import { useActionState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { updateStock } from "@/app/actions/pharmacy";
import { SubmitButton } from "@/components/ui/form-controls";
import { Input } from "@/components/ui/input";
import { FreshnessBadge } from "@/components/freshness-badge";
import type { Freshness } from "@/lib/freshness";
import type { ActionState } from "@/lib/errors";

export type StockLine = {
  id: string; catalog_id: string; label: string; quantity: number; reserved_quantity: number; price_xof: number | null;
  is_available: boolean; low_stock_threshold: number; stock_updated_at: string; freshness: Freshness; pending_review: boolean; row_version: number;
};

/** Ligne de stock éditable en place — pensée pour une mise à jour rapide sur téléphone. */
export function StockRow({ line, readOnly }: { line: StockLine; readOnly: boolean }) {
  const [state, action] = useActionState(updateStock, {} as ActionState);
  const free = line.quantity - line.reserved_quantity;
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <input type="checkbox" name="inventory_id" value={line.id} form="confirm-fresh" aria-label={`Sélectionner ${line.label}`} className="mt-1 size-4" />
          <div>
            <Link prefetch={false} href={`/pharmacien/stocks/${line.id}`} className="font-medium hover:underline">{line.label}</Link>
            {line.pending_review && <span className="ml-2 text-xs text-muted-foreground">(fiche en vérification)</span>}
            <div className="mt-1"><FreshnessBadge freshness={line.freshness} updatedAt={line.stock_updated_at} /></div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">Libre : <strong className={free <= line.low_stock_threshold ? "text-amber-700" : ""}>{free}</strong> · Réservé : {line.reserved_quantity}</p>
      </div>
      {!readOnly && (
        <form action={action} className="mt-2 grid grid-cols-[1fr_1fr_auto] items-end gap-2 sm:grid-cols-[120px_140px_auto_auto]">
          <input type="hidden" name="inventory_id" value={line.id} />
          <input type="hidden" name="row_version" value={line.row_version} />
          <label className="text-xs">Quantité
            <Input name="quantity" type="number" min={line.reserved_quantity} inputMode="numeric" defaultValue={line.quantity} className="h-9" required />
          </label>
          <label className="text-xs">Prix (FCFA)
            <Input name="price_xof" type="number" min={0} inputMode="numeric" defaultValue={line.price_xof ?? ""} className="h-9" />
          </label>
          <label className="flex h-9 items-center gap-1 text-xs"><input type="checkbox" name="is_available" defaultChecked={line.is_available} className="size-4" /> Dispo</label>
          <SubmitButton size="sm" pendingText="…" className="col-span-3 sm:col-span-1">{state.ok ? <><Check aria-hidden /> Enregistré</> : "Enregistrer"}</SubmitButton>
        </form>
      )}
      {state.error && (
        <p role="alert" className="mt-1 text-xs text-destructive">
          {state.error}{" "}
          {(state.data as { conflict?: boolean } | undefined)?.conflict ? (
            <button type="button" className="font-semibold underline" onClick={() => window.location.reload()}>Afficher la valeur actuelle</button>
          ) : null}
        </p>
      )}
    </li>
  );
}
