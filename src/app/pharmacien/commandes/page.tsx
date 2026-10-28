import Link from "next/link";
import { Pagination, pageRange } from "@/components/pagination";
import { requireCurrentPharmacy } from "@/lib/pharmacy";
import { createClient } from "@/lib/supabase/server";
import { PharmacyHeader } from "@/components/pharmacy/pharmacy-header";
import { OrderStatusBadge } from "@/components/orders/order-bits";
import { formatDateTime, formatXof } from "@/lib/format";
import type { OrderStatus } from "@/lib/order-status";
import { cn } from "@/lib/utils";

export const metadata = { title: "Commandes" };

const TABS: Record<string, { label: string; statuses: OrderStatus[] }> = {
  pending_confirmation: { label: "À confirmer", statuses: ["pending_confirmation"] },
  en_cours: { label: "En cours", statuses: ["confirmed", "preparing", "ready_for_pickup", "awaiting_courier", "courier_assigned", "in_delivery"] },
  terminees: { label: "Terminées / annulées", statuses: ["completed", "delivered", "cancelled", "rejected", "expired", "delivery_failed"] },
};

export default async function PharmacyOrders({ searchParams }: { searchParams: Promise<{ statut?: string; page?: string }> }) {
  const sp = await searchParams;
  const tab = sp.statut && sp.statut in TABS ? sp.statut : "pending_confirmation";
  const ph = await requireCurrentPharmacy();
  const range = pageRange(sp.page);
  const supabase = await createClient();
  const { data, count } = await supabase.from("orders")
    .select("id, reference, status, fulfillment, total_xof, created_at, confirmation_expires_at, has_prescription_items, order_items(quantity)", { count: "exact" })
    .eq("pharmacy_id", ph.id).in("status", TABS[tab].statuses).order("created_at", { ascending: tab !== "terminees" }).range(range.from, range.to);
  return (
    <>
      <PharmacyHeader current={ph} title="Commandes" />
      <div className="mb-4 flex flex-wrap gap-1">
        {Object.entries(TABS).map(([k, v]) => (
          <Link prefetch={false} key={k} href={`/pharmacien/commandes?statut=${k}`} className={cn("rounded-full border px-3 py-1 text-sm font-medium", tab === k ? "border-primary bg-primary text-white" : "bg-white")}>{v.label}</Link>
        ))}
      </div>
      {!data?.length ? <p className="rounded-xl border border-dashed bg-white p-8 text-center text-sm text-muted-foreground">Aucune commande dans cette catégorie.</p> : (
        <ul className="space-y-2">
          {data.map((o) => (
            <li key={o.id}>
              <Link prefetch={false} href={`/pharmacien/commandes/${o.id}`} className="flex flex-col gap-2 rounded-xl border bg-white p-4 hover:border-primary sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold">{o.reference} · {o.fulfillment === "delivery" ? "Livraison" : "Retrait"}{o.has_prescription_items ? " · ordonnance" : ""}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatDateTime(o.created_at)} · {(o.order_items ?? []).reduce((s: number, i: { quantity: number }) => s + i.quantity, 0)} article(s) · {formatXof(o.total_xof)}
                    {o.status === "pending_confirmation" && o.confirmation_expires_at ? ` · à traiter avant ${formatDateTime(o.confirmation_expires_at)}` : ""}
                  </p>
                </div>
                <OrderStatusBadge status={o.status as OrderStatus} />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Pagination basePath="/pharmacien/commandes" params={{ statut: tab, page: sp.page }} page={range.page} total={count} />
    </>
  );
}
