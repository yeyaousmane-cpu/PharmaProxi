import Link from "next/link";
import { Pagination, pageRange } from "@/components/pagination";
import { createClient } from "@/lib/supabase/server";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { OrderStatusBadge } from "@/components/orders/order-bits";
import { Input, Select } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { adminCancel, assignCourier, markRefunded, readOrderNote } from "@/app/actions/admin";
import { ORDER_STATUS_LABEL, PAYMENT_LABEL, TERMINAL, type OrderStatus } from "@/lib/order-status";
import { formatDateTime, formatXof } from "@/lib/format";
import { getSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";

export const metadata = { title: "Commandes — administration" };

export default async function AdminOrders({ searchParams }: { searchParams: Promise<{ statut?: string; paiement?: string; page?: string }> }) {
  const sp = await searchParams;
  const status = sp.statut && sp.statut in ORDER_STATUS_LABEL ? (sp.statut as OrderStatus) : null;
  const range = pageRange(sp.page);
  const supabase = await createClient();
  const settings = await getSettings();
  let q = supabase.from("orders").select("id, reference, status, fulfillment, total_xof, payment_status, created_at, pharmacies(name), deliveries(id, delivery_incidents(kind, description, created_at))", { count: "exact" }).order("created_at", { ascending: false }).range(range.from, range.to);
  if (status) q = q.eq("status", status);
  if (sp.paiement === "remboursement") q = q.eq("payment_status", "refund_pending");
  const [{ data: orders, count }, { data: couriers }] = await Promise.all([q, supabase.rpc("admin_couriers", { p_status: "verified" })]);
  const avail = ((couriers as { user_id: string; full_name: string | null; email: string; is_available: boolean; active_deliveries: number; zone: string }[]) ?? []).filter((c) => c.is_available);
  const filters: [string, string][] = [["", "Toutes"], ["pending_confirmation", "À confirmer"], ["awaiting_courier", "Attente livreur"], ["in_delivery", "En livraison"], ["delivery_failed", "Échecs"]];
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Supervision des commandes</h1>
      {!settings.delivery_enabled && <Alert tone="info" title="Livraison désactivée sur la plateforme (Paramètres)." />}
      <div className="flex flex-wrap gap-1">
        {filters.map(([k, v]) => <Link prefetch={false} key={k} href={k ? `/admin/commandes?statut=${k}` : "/admin/commandes"} className={cn("rounded-full border px-3 py-1 text-sm", (status ?? "") === k && !sp.paiement ? "border-primary bg-primary text-white" : "bg-white")}>{v}</Link>)}
        <Link prefetch={false} href="/admin/commandes?paiement=remboursement" className={cn("rounded-full border px-3 py-1 text-sm", sp.paiement ? "border-primary bg-primary text-white" : "bg-white")}>Remboursements à traiter</Link>
      </div>
      <ul className="space-y-3">
        {(orders ?? []).map((o) => {
          const ph = Array.isArray(o.pharmacies) ? o.pharmacies[0] : o.pharmacies;
          const d = Array.isArray(o.deliveries) ? o.deliveries[0] : o.deliveries;
          const incidents = (d?.delivery_incidents ?? []) as { kind: string; description: string | null; created_at: string }[];
          const st = o.status as OrderStatus;
          return (
            <li key={o.id} className="space-y-3 rounded-xl border bg-white p-4">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm"><strong>{o.reference}</strong> · {ph?.name} · {o.fulfillment === "delivery" ? "Livraison" : "Retrait"} · {formatXof(o.total_xof)} · {PAYMENT_LABEL[o.payment_status]} · {formatDateTime(o.created_at)}</p>
                <OrderStatusBadge status={st} />
              </div>
              {incidents.length > 0 && <Alert tone="warning" title={`${incidents.length} incident(s) de livraison`}>{incidents.map((i, k) => <p key={k}>{formatDateTime(i.created_at)} — {i.kind}{i.description ? ` : ${i.description}` : ""}</p>)}</Alert>}
              <div className="grid gap-3 lg:grid-cols-2">
                {(st === "awaiting_courier" || st === "courier_assigned") && (
                  <ActionForm action={assignCourier} className="flex gap-2">
                    <input type="hidden" name="order_id" value={o.id} />
                    <Select name="courier_id" required aria-label="Livreur" className="h-9">
                      <option value="">{avail.length ? "Choisir un livreur vérifié" : "Aucun livreur disponible"}</option>
                      {avail.map((c) => <option key={c.user_id} value={c.user_id}>{c.full_name ?? c.email} · {c.zone || "—"} · {c.active_deliveries} en cours</option>)}
                    </Select>
                    <SubmitButton size="sm">{st === "courier_assigned" ? "Réaffecter" : "Affecter"}</SubmitButton>
                  </ActionForm>
                )}
                {!TERMINAL.includes(st) && (
                  <ActionForm action={adminCancel} className="flex gap-2">
                    <input type="hidden" name="order_id" value={o.id} />
                    <Input name="note" required minLength={3} placeholder="Motif d'annulation (incident)" className="h-9" aria-label="Motif" />
                    <SubmitButton size="sm" variant="outline" confirm="Annuler cette commande ? Le stock sera libéré.">Annuler</SubmitButton>
                  </ActionForm>
                )}
                {o.payment_status === "refund_pending" && (
                  <ActionForm action={markRefunded} className="flex gap-2">
                    <input type="hidden" name="order_id" value={o.id} />
                    <Input name="note" required placeholder="Référence du remboursement" className="h-9" aria-label="Référence du remboursement" />
                    <SubmitButton size="sm" variant="outline">Marquer remboursé</SubmitButton>
                  </ActionForm>
                )}
                <details className="text-sm lg:col-span-2">
                  <summary className="cursor-pointer text-muted-foreground">Accès exceptionnel au message du client (journalisé)</summary>
                  <ActionForm action={readOrderNote} className="mt-2 flex gap-2">
                    <input type="hidden" name="order_id" value={o.id} />
                    <Input name="justification" required minLength={15} placeholder="Justification (litige, demande du client…)" className="h-9" aria-label="Justification" />
                    <SubmitButton size="sm" variant="outline">Consulter</SubmitButton>
                  </ActionForm>
                </details>
              </div>
            </li>
          );
        })}
        {!orders?.length && <li className="rounded-xl border border-dashed bg-white p-8 text-center text-sm text-muted-foreground">Aucune commande.</li>}
      </ul>
      <Pagination basePath="/admin/commandes" params={sp} page={range.page} total={count} />
    </div>
  );
}
