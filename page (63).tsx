import { notFound } from "next/navigation";
import Link from "next/link";
import { Phone } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { OrderItems, OrderStatusBadge, OrderTimeline, type HistoryRow, type OrderItem } from "@/components/orders/order-bits";
import { AcceptButton, AdvanceButton, PaymentButton, ReasonAction } from "@/components/orders/status-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import type { OrderStatus } from "@/lib/order-status";
import { formatDateTime, formatPhone } from "@/lib/format";

export const metadata = { title: "Commande" };

export default async function PharmacyOrderDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireUser(`/pharmacien/commandes/${id}`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data: o } = await supabase.from("orders")
    .select("*, order_items(id, product_label, quantity, unit_price_xof, requires_prescription), order_status_history(id, from_status, to_status, note, created_at), order_private_notes(customer_note), deliveries(dropoff_address, dropoff_landmark, instructions, status)")
    .eq("id", id).maybeSingle();
  if (!o) notFound();
  const { data: member } = await supabase.from("pharmacy_members").select("pharmacy_id").eq("pharmacy_id", o.pharmacy_id).maybeSingle();
  if (!member) notFound();
  const { data: contact } = await supabase.rpc("order_customer_contact", { p_order: id });
  const c = (contact as { full_name: string | null; phone: string | null }[] | null)?.[0];
  const status = o.status as OrderStatus;
  const note = (Array.isArray(o.order_private_notes) ? o.order_private_notes[0] : o.order_private_notes)?.customer_note;
  const d = Array.isArray(o.deliveries) ? o.deliveries[0] : o.deliveries;
  const history = ((o.order_status_history ?? []) as HistoryRow[]).sort((a, b) => a.id - b.id);
  const cancellable = ["confirmed", "preparing", "ready_for_pickup", "awaiting_courier"].includes(status);

  return (
    <div className="space-y-4">
      <Link prefetch={false} href="/pharmacien/commandes" className="text-sm text-primary underline">← Toutes les commandes</Link>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Commande {o.reference}</h1>
        <OrderStatusBadge status={status} />
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Actions</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {status === "pending_confirmation" && (
                <>
                  <p className="text-sm">Vérifiez physiquement le stock avant de confirmer. La confirmation réserve les quantités{o.fulfillment === "pickup" ? " pour une durée limitée" : ""}. À traiter avant le {formatDateTime(o.confirmation_expires_at)}.</p>
                  <AcceptButton orderId={o.id} />
                  <ReasonAction orderId={o.id} respond label="Refuser" placeholder="Motif du refus (ex. rupture constatée)" />
                </>
              )}
              {status === "confirmed" && <AdvanceButton orderId={o.id} to="preparing" label="Commencer la préparation" />}
              {status === "preparing" && o.fulfillment === "pickup" && <AdvanceButton orderId={o.id} to="ready_for_pickup" label="Marquer prête au retrait" />}
              {status === "preparing" && o.fulfillment === "delivery" && <AdvanceButton orderId={o.id} to="awaiting_courier" label="Prête : demander un livreur" />}
              {status === "ready_for_pickup" && (
                <>
                  {o.has_prescription_items && <Alert tone="warning" title="Vérifiez l'ordonnance originale avant la remise." />}
                  <AdvanceButton orderId={o.id} to="completed" label="Remise au client effectuée" withPaid={o.payment_status !== "paid"} paidLabel="Paiement reçu à la pharmacie" confirm="Confirmer la remise du produit au client ?" />
                </>
              )}
              {(status === "ready_for_pickup" || status === "completed") && o.payment_status === "unpaid" && o.payment_method === "pay_at_pharmacy" && <PaymentButton orderId={o.id} />}
              {["awaiting_courier", "courier_assigned", "in_delivery"].includes(status) && <p className="text-sm text-muted-foreground">La suite est gérée par l&apos;équipe de livraison.</p>}
              {cancellable && <ReasonAction orderId={o.id} to="cancelled" label="Annuler la commande" placeholder="Motif (ex. rupture constatée, client injoignable)" />}
              {["completed", "delivered", "cancelled", "rejected", "expired", "delivery_failed"].includes(status) && <p className="text-sm text-muted-foreground">Commande clôturée.</p>}
            </CardContent>
          </Card>
          <Card><CardHeader><CardTitle>Produits</CardTitle></CardHeader>
            <CardContent><OrderItems items={o.order_items as OrderItem[]} subtotal={o.subtotal_xof} fee={o.delivery_fee_xof} total={o.total_xof} paymentMethod={o.payment_method} paymentStatus={o.payment_status} /></CardContent>
          </Card>
        </div>
        <div className="space-y-4">
          <Card><CardHeader><CardTitle>Client</CardTitle></CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p>{c?.full_name ?? "Nom non renseigné"}</p>
              {c?.phone ? <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1 font-semibold text-primary"><Phone className="size-4" aria-hidden />{formatPhone(c.phone)}</a> : <p className="text-muted-foreground">Téléphone non renseigné</p>}
              {note && <p className="mt-2 rounded bg-muted p-2"><span className="font-medium">Message : </span>{note}</p>}
              {d && <p className="mt-2"><span className="font-medium">Livraison : </span>{d.dropoff_address}{d.dropoff_landmark ? ` (${d.dropoff_landmark})` : ""}</p>}
            </CardContent>
          </Card>
          <Card><CardHeader><CardTitle>Suivi</CardTitle></CardHeader><CardContent><OrderTimeline status={status} fulfillment={o.fulfillment} history={history} /></CardContent></Card>
        </div>
      </div>
    </div>
  );
}
