import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Input } from "@/components/ui/input";
import { advanceOrder, confirmPayment, respondOrder } from "@/app/actions/orders";

export function AdvanceButton({ orderId, to, label, variant = "default", confirm, withPaid, paidLabel }: {
  orderId: string; to: string; label: string; variant?: "default" | "secondary" | "outline"; confirm?: string; withPaid?: boolean; paidLabel?: string;
}) {
  return (
    <ActionForm action={advanceOrder} className="space-y-2">
      <input type="hidden" name="order_id" value={orderId} />
      <input type="hidden" name="to" value={to} />
      {withPaid && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="paid" className="size-4" /> {paidLabel ?? "Paiement reçu"}</label>}
      <SubmitButton variant={variant} confirm={confirm} className="w-full sm:w-auto">{label}</SubmitButton>
    </ActionForm>
  );
}

/** Action nécessitant un motif (annulation, échec de livraison, refus). */
export function ReasonAction({ orderId, to, label, placeholder, respond = false }: { orderId: string; to?: string; label: string; placeholder: string; respond?: boolean }) {
  return (
    <ActionForm action={respond ? respondOrder : advanceOrder} className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <input type="hidden" name="order_id" value={orderId} />
      {respond ? <input type="hidden" name="decision" value="reject" /> : <input type="hidden" name="to" value={to} />}
      <label className="flex-1 text-sm">
        <span className="sr-only">{placeholder}</span>
        <Input name={respond ? "reason" : "note"} placeholder={placeholder} required minLength={3} maxLength={200} />
      </label>
      <SubmitButton variant="outline" className="border-red-300 text-destructive" confirm={`${label} ?`}>{label}</SubmitButton>
    </ActionForm>
  );
}

export function AcceptButton({ orderId }: { orderId: string }) {
  return (
    <ActionForm action={respondOrder}>
      <input type="hidden" name="order_id" value={orderId} />
      <input type="hidden" name="decision" value="accept" />
      <SubmitButton size="lg" className="w-full sm:w-auto">Confirmer la disponibilité et réserver</SubmitButton>
    </ActionForm>
  );
}

export function PaymentButton({ orderId, label = "Confirmer le paiement reçu" }: { orderId: string; label?: string }) {
  return (
    <ActionForm action={confirmPayment}>
      <input type="hidden" name="order_id" value={orderId} />
      <SubmitButton variant="outline" confirm="Confirmez-vous avoir réellement reçu le paiement ?">{label}</SubmitButton>
    </ActionForm>
  );
}
