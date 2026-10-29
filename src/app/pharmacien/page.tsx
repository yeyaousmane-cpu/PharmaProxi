import Link from "next/link";
import { AlertTriangle, BellRing, Clock, Moon, Package, PackageX, ShoppingBag } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Field, Input } from "@/components/ui/input";
import { CardDescription } from "@/components/ui/card";
import { declareDuty, deleteDuty } from "@/app/actions/services";
import { dutyRange, type DutySlot } from "@/components/duty/duty-badge";
import { requireCurrentPharmacy } from "@/lib/pharmacy";
import { createClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/settings";
import { PharmacyHeader } from "@/components/pharmacy/pharmacy-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { OrderStatus } from "@/lib/order-status";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Tableau de bord pharmacien" };

function Stat({ label, value, href, Icon, tone = "" }: { label: string; value: number; href: string; Icon: typeof Package; tone?: string }) {
  return (
    <Link prefetch={false} href={href} className="rounded-xl border bg-white p-4 hover:border-primary">
      <Icon className={`size-5 ${tone || "text-brand-green"}`} aria-hidden />
      <p className="mt-2 text-2xl font-bold">{value}</p>
      <p className="text-sm text-muted-foreground">{label}</p>
    </Link>
  );
}

export default async function PharmacistDashboard() {
  const ph = await requireCurrentPharmacy();
  const supabase = await createClient();
  const settings = await getSettings();
  const [{ data: inv }, { data: orders }, { data: moves }, { data: signals }, { data: duties }] = await Promise.all([
    supabase.from("pharmacy_inventory").select("quantity, reserved_quantity, is_available, low_stock_threshold, stock_updated_at").eq("pharmacy_id", ph.id),
    supabase.from("orders").select("status").eq("pharmacy_id", ph.id),
    supabase.from("inventory_movements").select("id, kind, quantity_delta, reserved_delta, quantity_after, created_at, pharmacy_inventory(medicine_catalog(brand_name, dosage))").eq("pharmacy_id", ph.id).order("created_at", { ascending: false }).limit(8),
    supabase.rpc("pharmacy_demand_signals", { p_pharmacy: ph.id }),
    supabase.from("pharmacy_duty").select("id, starts_at, ends_at, status, source").eq("pharmacy_id", ph.id).gt("ends_at", new Date().toISOString()).order("starts_at").limit(20),
  ]);
  const demand = (signals as { catalog_id: string; label: string; waiting: number }[] | null) ?? [];
  const staleBefore = Date.now() - settings.stock_stale_hours * 3600_000;
  const rows = inv ?? [];
  const available = rows.filter((r) => r.is_available && r.quantity - r.reserved_quantity > 0).length;
  const low = rows.filter((r) => r.is_available && r.quantity - r.reserved_quantity <= r.low_stock_threshold).length;
  const stale = rows.filter((r) => new Date(r.stock_updated_at).getTime() < staleBefore).length;
  const count = (s: OrderStatus[]) => (orders ?? []).filter((o) => s.includes(o.status as OrderStatus)).length;
  const kindLabel: Record<string, string> = { adjustment: "Ajustement", import: "Import", reservation: "Réservation", release: "Libération", sale: "Vente", return: "Retour", expiry: "Péremption", correction: "Confirmation" };

  return (
    <>
      <PharmacyHeader current={ph} title="Tableau de bord" />
      <section aria-label="Stocks" className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Produits référencés" value={rows.length} href="/pharmacien/stocks" Icon={Package} />
        <Stat label="Disponibles" value={available} href="/pharmacien/stocks?vue=disponibles" Icon={Package} />
        <Stat label="Indisponibles" value={rows.length - available} href="/pharmacien/stocks?vue=indisponibles" Icon={PackageX} tone="text-slate-500" />
        <Stat label="Stock faible" value={low} href="/pharmacien/stocks?vue=faibles" Icon={AlertTriangle} tone="text-amber-600" />
        <Stat label={`Non actualisés depuis ${settings.stock_stale_hours} h`} value={stale} href="/pharmacien/stocks?vue=anciens" Icon={Clock} tone="text-red-600" />
      </section>
      {stale > 0 && (
        <p className="mt-3 text-sm text-amber-800">
          {stale} produit(s) affichent « Information ancienne » aux clients. <Link prefetch={false} href="/pharmacien/stocks?vue=anciens" className="font-semibold underline">Actualisez-les en un clic</Link>.
        </p>
      )}
      <section aria-label="Commandes" className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Demandes à confirmer" value={count(["pending_confirmation"])} href="/pharmacien/commandes?statut=pending_confirmation" Icon={ShoppingBag} tone="text-amber-600" />
        <Stat label="Confirmées / en préparation" value={count(["confirmed", "preparing"])} href="/pharmacien/commandes?statut=en_cours" Icon={ShoppingBag} />
        <Stat label="Prêtes / en livraison" value={count(["ready_for_pickup", "awaiting_courier", "courier_assigned", "in_delivery"])} href="/pharmacien/commandes?statut=en_cours" Icon={ShoppingBag} />
        <Stat label="Terminées ou annulées" value={count(["completed", "delivered", "cancelled", "rejected", "expired", "delivery_failed"])} href="/pharmacien/commandes?statut=terminees" Icon={ShoppingBag} tone="text-slate-500" />
      </section>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><BellRing className="size-5 text-amber-600" aria-hidden /> Recherchés dans votre zone</CardTitle>
            <CardDescription>Produits pour lesquels des patients de votre zone attendent une alerte et que vous ne déclarez pas disponibles. Nombres anonymes.</CardDescription>
          </CardHeader>
          <CardContent>
            {demand.length === 0 ? <p className="text-sm text-muted-foreground">Aucune demande en attente pour le moment.</p> : (
              <ul className="divide-y text-sm">
                {demand.map((d) => (
                  <li key={d.catalog_id} className="flex items-center justify-between gap-2 py-2">
                    <span>{d.label}</span>
                    <span className="shrink-0 font-semibold">{d.waiting} personne{Number(d.waiting) > 1 ? "s" : ""}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-muted-foreground">Si vous l&apos;avez en stock, <Link prefetch={false} href="/pharmacien/stocks" className="text-primary underline">déclarez-le disponible</Link> : les personnes en attente seront prévenues.</p>
          </CardContent>
        </Card>
        <Card id="garde">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Moon className="size-5 text-indigo-700" aria-hidden /> Mes gardes</CardTitle>
            <CardDescription>Déclarez vos gardes : elles apparaissent sur la page « Pharmacies de garde » avec la mention « déclarée par la pharmacie ».</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {ph.status !== "verified" ? <p className="text-sm text-muted-foreground">Disponible après la vérification de votre pharmacie.</p> : (
              <ActionForm action={declareDuty} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                <input type="hidden" name="pharmacy_id" value={ph.id} />
                <Field label="Début" htmlFor="duty-start"><Input id="duty-start" name="start" type="datetime-local" required /></Field>
                <Field label="Fin" htmlFor="duty-end"><Input id="duty-end" name="end" type="datetime-local" required /></Field>
                <SubmitButton size="sm" pendingText="…">Déclarer</SubmitButton>
              </ActionForm>
            )}
            {!duties?.length ? <p className="text-sm text-muted-foreground">Aucune garde à venir.</p> : (
              <ul className="divide-y text-sm">
                {(duties as (DutySlot & { id: string })[]).map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2 py-2">
                    <span>{dutyRange(d)} <span className="text-xs text-muted-foreground">· {d.status === "confirmed" ? d.source : "déclarée par vous"}</span></span>
                    {d.status === "declared" && (
                      <ActionForm action={deleteDuty}><input type="hidden" name="id" value={d.id} /><SubmitButton size="sm" variant="outline">Retirer</SubmitButton></ActionForm>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
      <Card className="mt-6">
        <CardHeader><CardTitle>Derniers mouvements de stock</CardTitle></CardHeader>
        <CardContent>
          {!moves?.length ? <p className="text-sm text-muted-foreground">Aucun mouvement. Commencez par <Link prefetch={false} href="/pharmacien/stocks" className="text-primary underline">ajouter vos produits</Link>.</p> : (
            <ul className="divide-y text-sm">
              {moves.map((m) => {
                const inv1 = Array.isArray(m.pharmacy_inventory) ? m.pharmacy_inventory[0] : m.pharmacy_inventory;
                const cat = inv1 ? (Array.isArray(inv1.medicine_catalog) ? inv1.medicine_catalog[0] : inv1.medicine_catalog) : null;
                return (
                  <li key={m.id} className="flex justify-between gap-2 py-2">
                    <span>{kindLabel[m.kind] ?? m.kind} · {cat?.brand_name} {cat?.dosage ?? ""}</span>
                    <span className="text-muted-foreground">{formatDateTime(m.created_at)}</span>
                  </li>
                );
              })}
            </ul>
          )}
          <Link prefetch={false} href="/pharmacien/mouvements" className="mt-3 inline-block text-sm text-primary underline">Tout l&apos;historique</Link>
        </CardContent>
      </Card>
    </>
  );
}
