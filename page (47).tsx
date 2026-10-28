import Link from "next/link";
import { Pagination, pageRange } from "@/components/pagination";
import { ClipboardList } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { OrderStatusBadge } from "@/components/orders/order-bits";
import { formatDateTime, formatXof } from "@/lib/format";
import type { OrderStatus } from "@/lib/order-status";

export const metadata = { title: "Mes commandes" };

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const range = pageRange((await searchParams).page);
  const s = await requireUser("/compte/commandes");
  const supabase = await createClient();
  const { data, count } = await supabase
    .from("orders")
    .select("id, reference, status, fulfillment, total_xof, created_at, pharmacies(name)", { count: "exact" })
    .eq("customer_id", s.userId)
    .order("created_at", { ascending: false })
    .range(range.from, range.to);
  return (
    <div className="container-page max-w-3xl py-6">
      <h1 className="text-2xl font-bold">Mes commandes</h1>
      {!data?.length ? (
        <div className="mt-6 rounded-xl border border-dashed bg-white p-8 text-center">
          <ClipboardList className="mx-auto size-8 text-muted-foreground" aria-hidden />
          <p className="mt-2 font-medium">Aucune commande pour le moment.</p>
          <Link prefetch={false} href="/recherche" className="mt-2 inline-block text-primary underline">Rechercher un médicament</Link>
        </div>
      ) : (
        <ul className="mt-4 space-y-2">
          {data.map((o) => {
            const ph = Array.isArray(o.pharmacies) ? o.pharmacies[0] : o.pharmacies;
            return (
              <li key={o.id}>
                <Link prefetch={false} href={`/compte/commandes/${o.id}`} className="flex flex-col gap-2 rounded-xl border bg-white p-4 hover:border-primary sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold">{o.reference} · {ph?.name}</p>
                    <p className="text-sm text-muted-foreground">{formatDateTime(o.created_at)} · {o.fulfillment === "delivery" ? "Livraison" : "Retrait"} · {formatXof(o.total_xof)}</p>
                  </div>
                  <OrderStatusBadge status={o.status as OrderStatus} />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <Pagination basePath="/compte/commandes" params={{}} page={range.page} total={count} />
    </div>
  );
}
