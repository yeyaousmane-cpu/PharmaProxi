import { notFound } from "next/navigation";
import Link from "next/link";
import { Phone } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { OrderItems, OrderStatusBadge, OrderTimeline, type HistoryRow, type OrderItem } from "@/components/orders/order-bits";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { ReportForm } from "@/components/report-form";
import { advanceOrder } from "@/app/actions/orders";
import { CUSTOMER_CANCELLABLE, type OrderStatus } from "@/lib/order-status";
import { formatDateTime, formatPhone } from "@/lib/format";

export const metadata = { title: "Suivi de commande" };

export default async function OrderDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ nouvelle?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  await requireUser(`/compte/commandes/${id}`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data: o } = await supabase
    .from("orders")
    .select("*, pharmacies(id, name, phone, address), order_items(id, product_label, quantity, unit_price_xof, requires_prescription), order_status_history(id, from_status, to_status, note, created_at), deliveries(status, dropoff_address)")
    .eq("id", id)
    .maybeSingle();
  if (!o) notFound();
  const ph = Array.isArray(o.pharmacies) ? o.pharmacies[0] : o.pharmacies;
  const history = ((o.order_status_history ?? []) as HistoryRow[]).sort((a, b) => a.id - b.id);
  const status = o.status as OrderStatus;
  return (
    <div className="container-page max-w-3xl space-y-4 py-6">
      {sp.nouvelle && (
        <Alert tone="success" title="Demande envoyée à la pharmacie">
          Vous serez notifié dès qu&apos;elle aura confirmé ou refusé. Sans réponse avant le {formatDateTime(o.confirmation_expires_at)}, la demande expirera automatiquement.
        </Alert>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Commande {o.reference}</h1>
        <OrderStatusBadge status={status} />
      </div>
      <Card>
        <CardHeader><CardTitle><Link prefetch={false} href={`/pharmacies/${ph?.id}`} className="hover:underline">{ph?.name}</Link></CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>{ph?.address}</p>
          <a href={`tel:${ph?.phone}`} className="inline-flex items-center gap-1 font-semibold text-primary"><Phone className="size-4" aria-hidden />{formatPhone(ph?.phone)}</a>
          <p>{o.fulfillment === "delivery" ? "Livraison" : "Retrait en pharmacie"}{o.reservation_expires_at && ["confirmed", "preparing", "ready_for_pickup"].includes(status) ? ` · réservé jusqu'au ${formatDateTime(o.reservation_expires_at)}` : ""}</p>
          {o.has_prescription_items && <Alert tone="info" title="Ordonnance à présenter lors du retrait." />}
          {o.rejection_reason && <Alert tone="error" title={`Motif du refus : ${o.rejection_reason}`} />}
          {o.cancellation_reason && status === "cancelled" && <Alert tone="warning" title={`Motif de l'annulation : ${o.cancellation_reason}`} />}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Détail</CardTitle></CardHeader>
        <CardContent>
          <OrderItems items={o.order_items as OrderItem[]} subtotal={o.subtotal_xof} fee={o.delivery_fee_xof} total={o.total_xof} paymentMethod={o.payment_method} paymentStatus={o.payment_status} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Suivi</CardTitle></CardHeader>
        <CardContent><OrderTimeline status={status} fulfillment={o.fulfillment} history={history} /></CardContent>
      </Card>
      {CUSTOMER_CANCELLABLE.includes(status) && (
        <ActionForm action={advanceOrder} className="flex flex-col gap-2 rounded-xl border bg-white p-4 sm:flex-row sm:items-end">
          <input type="hidden" name="order_id" value={o.id} />
          <input type="hidden" name="to" value="cancelled" />
          <div className="flex-1 space-y-1">
            <label htmlFor="note" className="text-sm font-medium">Motif d&apos;annulation (facultatif)</label>
            <Input id="note" name="note" maxLength={200} />
          </div>
          <SubmitButton variant="destructive" confirm="Annuler cette commande ? Les produits réservés seront libérés.">Annuler la commande</SubmitButton>
        </ActionForm>
      )}
      <ReportForm pharmacyId={ph?.id} orderId={o.id} />
    </div>
  );
}
