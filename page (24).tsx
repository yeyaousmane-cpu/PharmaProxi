import { notFound } from "next/navigation";
import Link from "next/link";
import { Navigation, Phone } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AdvanceButton, PaymentButton, ReasonAction } from "@/components/orders/status-actions";
import { OrderStatusBadge } from "@/components/orders/order-bits";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { buttonVariants } from "@/components/ui/button";
import { reportIncident } from "@/app/actions/account";
import { directionsUrl } from "@/components/result-card";
import { formatPhone, formatXof, formatDateTime } from "@/lib/format";
import { PAYMENT_LABEL, type OrderStatus } from "@/lib/order-status";
import { cn } from "@/lib/utils";

export const metadata = { title: "Livraison" };

export default async function DeliveryDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireRole("courier", `/livraison/${id}`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data: d } = await supabase.from("deliveries")
    .select("*, orders(id, reference, status, total_xof, payment_status, payment_method, order_items(product_label, quantity), pharmacies(name, address, phone, latitude, longitude))")
    .eq("id", id).maybeSingle();
  if (!d) notFound();
  const o = Array.isArray(d.orders) ? d.orders[0] : d.orders;
  const ph = Array.isArray(o.pharmacies) ? o.pharmacies[0] : o.pharmacies;
  const { data: contact } = await supabase.rpc("order_customer_contact", { p_order: o.id });
  const c = (contact as { full_name: string | null }[] | null)?.[0];
  const st = o.status as OrderStatus;
  return (
    <div className="container-page max-w-2xl space-y-4 py-6">
      <Link prefetch={false} href="/livraison" className="text-sm text-primary underline">← Mes livraisons</Link>
      <div className="flex items-center justify-between"><h1 className="text-2xl font-bold">Livraison {o.reference}</h1><OrderStatusBadge status={st} /></div>
      <Card><CardHeader><CardTitle>1. Collecte</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className="font-semibold">{ph.name}</p><p>{ph.address}</p>
          <div className="flex flex-wrap gap-2">
            <a href={`tel:${ph.phone}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}><Phone aria-hidden /> {formatPhone(ph.phone)}</a>
            {ph.latitude !== null && <a href={directionsUrl(ph.latitude, ph.longitude)} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}><Navigation aria-hidden /> Itinéraire</a>}
          </div>
          <ul className="list-disc pl-5">{(o.order_items ?? []).map((i: { product_label: string; quantity: number }, k: number) => <li key={k}>{i.quantity} × {i.product_label}</li>)}</ul>
          {st === "courier_assigned" && <AdvanceButton orderId={o.id} to="in_delivery" label="Colis collecté — démarrer la livraison" confirm="Confirmez-vous avoir collecté le colis scellé ?" />}
        </CardContent></Card>
      <Card><CardHeader><CardTitle>2. Remise</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className="font-semibold">{c?.full_name ?? "Client"}</p>
          <p>{d.dropoff_address}{d.dropoff_landmark ? ` — repère : ${d.dropoff_landmark}` : ""}</p>
          {d.instructions && <p className="rounded bg-muted p-2">{d.instructions}</p>}
          <a href={`tel:${d.dropoff_contact_phone}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}><Phone aria-hidden /> {formatPhone(d.dropoff_contact_phone)}</a>
          {d.dropoff_latitude !== null && <a href={directionsUrl(d.dropoff_latitude, d.dropoff_longitude)} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "ml-2")}><Navigation aria-hidden /> Itinéraire</a>}
          <p>À encaisser : <strong>{formatXof(o.total_xof)}</strong> · {PAYMENT_LABEL[o.payment_status]}</p>
          {st === "in_delivery" && (
            <div className="space-y-3 pt-2">
              <AdvanceButton orderId={o.id} to="delivered" label="Colis remis au client" withPaid={o.payment_status !== "paid"} paidLabel="Paiement reçu en espèces" confirm="Confirmez-vous la remise au client ?" />
              <ReasonAction orderId={o.id} to="delivery_failed" label="Déclarer un échec" placeholder="Motif (client absent, adresse introuvable…)" />
            </div>
          )}
          {st === "delivered" && o.payment_status === "unpaid" && <PaymentButton orderId={o.id} label="Confirmer le paiement reçu" />}
          {d.picked_up_at && <p className="text-xs text-muted-foreground">Collecté le {formatDateTime(d.picked_up_at)}</p>}
          {d.delivered_at && <p className="text-xs text-muted-foreground">Remis le {formatDateTime(d.delivered_at)}</p>}
        </CardContent></Card>
      {["courier_assigned", "in_delivery"].includes(st) && (
        <Card><CardHeader><CardTitle>Signaler un incident</CardTitle></CardHeader>
          <CardContent>
            <ActionForm action={reportIncident} resetOnSuccess className="flex flex-col gap-2 sm:flex-row">
              <input type="hidden" name="delivery_id" value={d.id} />
              <Select name="kind" aria-label="Type d'incident" className="sm:w-48"><option value="client_absent">Client absent</option><option value="adresse_introuvable">Adresse introuvable</option><option value="colis_endommage">Colis endommagé</option><option value="refus_client">Refus du client</option><option value="securite">Problème de sécurité</option><option value="autre">Autre</option></Select>
              <Input name="description" placeholder="Détails" maxLength={500} aria-label="Détails" />
              <SubmitButton variant="outline">Envoyer</SubmitButton>
            </ActionForm>
          </CardContent></Card>
      )}
    </div>
  );
}
