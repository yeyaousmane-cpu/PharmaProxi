import { Check, Circle, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DELIVERY_STEPS, ORDER_STATUS_LABEL, PICKUP_STEPS, TERMINAL, statusTone, type OrderStatus, PAYMENT_LABEL, PAYMENT_METHOD_LABEL } from "@/lib/order-status";
import { formatDateTime, formatXof } from "@/lib/format";
import { cn } from "@/lib/utils";

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Badge className={statusTone(status)} data-order-status={status}>{ORDER_STATUS_LABEL[status]}</Badge>;
}

export type OrderItem = { id: string; product_label: string; quantity: number; unit_price_xof: number; requires_prescription: boolean };
export type HistoryRow = { id: number; from_status: OrderStatus | null; to_status: OrderStatus; note: string | null; created_at: string };

/** Progression visuelle + journal horodaté des statuts. */
export function OrderTimeline({ status, fulfillment, history }: { status: OrderStatus; fulfillment: "pickup" | "delivery"; history: HistoryRow[] }) {
  const steps = fulfillment === "delivery" ? DELIVERY_STEPS : PICKUP_STEPS;
  const failed = TERMINAL.includes(status) && !["delivered", "completed"].includes(status);
  const reached = new Set(history.map((h) => h.to_status));
  return (
    <div className="space-y-4">
      <ol className="space-y-2" aria-label="Étapes de la commande">
        {steps.map((s) => {
          const done = reached.has(s);
          const current = s === status;
          return (
            <li key={s} className={cn("flex items-center gap-2 text-sm", done ? "text-foreground" : "text-muted-foreground")} aria-current={current ? "step" : undefined}>
              {done ? <Check className="size-4 text-brand-green" aria-hidden /> : <Circle className="size-4" aria-hidden />}
              <span className={current ? "font-semibold" : undefined}>{ORDER_STATUS_LABEL[s]}</span>
            </li>
          );
        })}
        {failed && (
          <li className="flex items-center gap-2 text-sm font-semibold text-destructive"><XCircle className="size-4" aria-hidden />{ORDER_STATUS_LABEL[status]}</li>
        )}
      </ol>
      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground">Historique détaillé</summary>
        <ul className="mt-2 space-y-1">
          {history.map((h) => (
            <li key={h.id}>
              <span className="text-muted-foreground">{formatDateTime(h.created_at)}</span> — {h.from_status === h.to_status ? "" : ORDER_STATUS_LABEL[h.to_status]}
              {h.note ? <span className="italic"> {h.from_status === h.to_status ? h.note : `(${h.note})`}</span> : null}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

export function OrderItems({ items, subtotal, fee, total, paymentMethod, paymentStatus }: {
  items: OrderItem[]; subtotal: number; fee: number; total: number; paymentMethod: string; paymentStatus: string;
}) {
  return (
    <div className="text-sm">
      <table className="w-full">
        <caption className="sr-only">Produits de la commande</caption>
        <thead><tr className="border-b text-left text-muted-foreground"><th className="py-1 font-medium">Produit</th><th className="py-1 text-right font-medium">Qté</th><th className="py-1 text-right font-medium">Montant</th></tr></thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.id} className="border-b">
              <td className="py-2">{i.product_label}{i.requires_prescription ? <span className="ml-1 text-xs text-sky-700">(ordonnance)</span> : null}</td>
              <td className="py-2 text-right">{i.quantity}</td>
              <td className="py-2 text-right">{formatXof(i.quantity * i.unit_price_xof)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr><td colSpan={2} className="pt-2">Sous-total</td><td className="pt-2 text-right">{formatXof(subtotal)}</td></tr>
          {fee > 0 && <tr><td colSpan={2}>Frais de livraison</td><td className="text-right">{formatXof(fee)}</td></tr>}
          <tr className="font-bold"><td colSpan={2}>Total</td><td className="text-right">{formatXof(total)}</td></tr>
        </tfoot>
      </table>
      <p className="mt-2 text-muted-foreground">{PAYMENT_METHOD_LABEL[paymentMethod]} · <span className="font-medium text-foreground">{PAYMENT_LABEL[paymentStatus]}</span></p>
    </div>
  );
}
