import { notFound } from "next/navigation";
import Link from "next/link";
import { MapPin, MessageCircle, Navigation, Phone, ShieldCheck, Truck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { FreshnessBadge } from "@/components/freshness-badge";
import { OpeningHours } from "@/components/opening-hours";
import { OrderRequestForm, type OrderableItem } from "@/components/order-request-form";
import { ReportForm } from "@/components/report-form";
import { MapLoader } from "@/components/map/map-loader";
import { DemoBadge } from "@/components/demo-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { directionsUrl } from "@/components/result-card";
import { formatDate, formatPhone, formatXof, whatsappUrl } from "@/lib/format";
import { RecentTracker } from "@/components/recent/recent-tracker";
import { DutyBadge, type DutySlot } from "@/components/duty/duty-badge";
import type { Freshness } from "@/lib/freshness";
import { cn } from "@/lib/utils";

type Inv = { inventory_id: string; catalog_id: string; brand_name: string; dosage: string | null; form: string | null; packaging: string | null;
  active_ingredient: string | null; requires_prescription: boolean; delivery_allowed: boolean; price_xof: number | null; freshness: Freshness; stock_updated_at: string; total_count: number };

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { title: "Pharmacie" };
  const supabase = await createClient();
  const { data } = await supabase.from("pharmacies").select("name").eq("id", id).maybeSingle();
  return { title: data?.name ?? "Pharmacie" };
}

export default async function PharmacyPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ produit?: string; filtre?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data: p } = await supabase
    .from("pharmacies")
    .select("id, name, status, address, latitude, longitude, phone, whatsapp, email, opening_hours, hours_verified, offers_pickup, offers_delivery, verified_at, is_demo, regions(name), circles(name), communes(name), localities(name)")
    .eq("id", id)
    .maybeSingle();
  if (!p) notFound();

  const nowIso = new Date().toISOString();
  const [session, settings, inv, duty] = await Promise.all([
    getSession(),
    getSettings(),
    supabase.rpc("pharmacy_public_inventory", { p_pharmacy: id, p_query: sp.filtre ?? null, p_limit: 100 }),
    supabase.rpc("duty_pharmacies", { p_from: nowIso, p_to: new Date(Date.now() + 7 * 86400_000).toISOString() }).eq("id", id),
  ]);
  const duties = ((duty.data as DutySlot[]) ?? []).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const items = (inv.data as Inv[]) ?? [];
  const addresses = session
    ? ((await supabase.from("customer_addresses").select("id, label, address_line").eq("user_id", session.userId)).data ?? [])
    : [];
  const orderable: OrderableItem[] = items
    .filter((i) => i.price_xof !== null && i.freshness !== "unavailable")
    .map((i) => ({
      inventory_id: i.inventory_id, label: [i.brand_name, i.dosage, i.form].filter(Boolean).join(" "), price_xof: i.price_xof!,
      freshness: i.freshness, requires_prescription: i.requires_prescription, delivery_allowed: i.delivery_allowed,
    }));
  const one = <T,>(v: T | T[] | null) => (Array.isArray(v) ? v[0] : v);
  const place = [one(p.localities)?.name, one(p.communes)?.name, one(p.circles)?.name, one(p.regions)?.name].filter(Boolean).join(", ");

  return (
    <div className="container-page grid gap-6 py-6 lg:grid-cols-[1fr_400px]">
      <div className="space-y-6">
        <RecentTracker kind="pharmacie" id={p.id} name={p.name} phone={p.phone} place={place} href={`/pharmacies/${p.id}`} />
        <header className="rounded-2xl border bg-white p-5">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold">{p.name}</h1>
            {p.status === "verified" ? (
              <Badge className="border-emerald-200 bg-emerald-50 text-emerald-800"><ShieldCheck className="size-3" aria-hidden /> Pharmacie vérifiée</Badge>
            ) : (
              <Badge className="border-amber-200 bg-amber-50 text-amber-900">Statut : {p.status === "pending" ? "en attente de vérification" : p.status}</Badge>
            )}
            {p.is_demo && <DemoBadge />}
          </div>
          <DutyBadge slots={duties} />
          {p.verified_at && <p className="text-xs text-muted-foreground">Vérifiée le {formatDate(p.verified_at)}</p>}
          <p className="mt-3 flex items-start gap-2 text-sm"><MapPin className="mt-0.5 size-4 shrink-0 text-brand-green" aria-hidden />{p.address} — {place}</p>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <a href={`tel:${p.phone}`} className={cn(buttonVariants({ size: "sm" }))}><Phone aria-hidden /> {formatPhone(p.phone)}</a>
            {p.whatsapp && (
              <a href={whatsappUrl(p.whatsapp, "Bonjour, je vous contacte depuis PharmaProxi. ") ?? `https://wa.me/${p.whatsapp.replace("+", "")}`} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
                <MessageCircle aria-hidden /> WhatsApp
              </a>
            )}
            {p.latitude !== null && p.longitude !== null && (
              <a href={directionsUrl(p.latitude, p.longitude)} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
                <Navigation aria-hidden /> Itinéraire
              </a>
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {p.offers_pickup && <Badge className="bg-white">Retrait en pharmacie</Badge>}
            {p.offers_delivery && settings.delivery_enabled && <Badge className="bg-white"><Truck className="size-3" aria-hidden /> Livraison (produits autorisés)</Badge>}
          </div>
        </header>

        <section aria-labelledby="stock-title" className="rounded-2xl border bg-white p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 id="stock-title" className="text-lg font-bold">Produits référencés</h2>
            <form method="get" className="flex gap-2">
              <label htmlFor="filtre" className="sr-only">Filtrer les produits</label>
              <Input id="filtre" name="filtre" placeholder="Filtrer…" defaultValue={sp.filtre} className="h-9" />
            </form>
          </div>
          {items.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">Aucun produit déclaré{sp.filtre ? " pour ce filtre" : ""}. Contactez la pharmacie.</p>
          ) : (
            <ul className="mt-3 divide-y">
              {items.map((i) => (
                <li key={i.inventory_id} id={`p-${i.inventory_id}`} className={cn("flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between", sp.produit === i.inventory_id && "rounded-lg bg-accent px-2")}>
                  <div>
                    <Link prefetch={false} href={`/produits/${i.catalog_id}`} className="font-medium hover:underline">{[i.brand_name, i.dosage, i.form].filter(Boolean).join(" · ")}</Link>
                    {i.packaging && <span className="text-xs text-muted-foreground"> — {i.packaging}</span>}
                    <div className="mt-1"><FreshnessBadge freshness={i.freshness} updatedAt={i.stock_updated_at} /></div>
                  </div>
                  <p className="shrink-0 font-semibold">{formatXof(i.price_xof)}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <Card>
          <CardHeader><CardTitle>Horaires d&apos;ouverture</CardTitle></CardHeader>
          <CardContent><OpeningHours hours={p.opening_hours as Record<string, [string, string][]>} verified={p.hours_verified} /></CardContent>
        </Card>

        {p.latitude !== null && p.longitude !== null && (
          <MapLoader points={[{ id: p.id, name: p.name, address: p.address, latitude: p.latitude, longitude: p.longitude, is_open: null }]} />
        )}
      </div>

      <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <section id="demande" aria-labelledby="demande-title" className="scroll-mt-24 rounded-2xl border-2 border-primary/30 bg-white p-5">
          <h2 id="demande-title" className="text-lg font-bold">Demander une confirmation</h2>
          <p className="mb-4 text-sm text-muted-foreground">La pharmacie confirme la disponibilité réelle, puis vous réserve les produits.</p>
          {p.status !== "verified" ? (
            <Alert tone="warning" title="Pharmacie non vérifiée : demandes en ligne indisponibles." />
          ) : !settings.orders_enabled ? (
            <Alert tone="info" title="Les demandes en ligne sont momentanément suspendues. Appelez la pharmacie." />
          ) : session ? (
            <OrderRequestForm
              pharmacyId={p.id} items={orderable} preselected={sp.produit} addresses={addresses}
              deliveryEnabled={settings.delivery_enabled} offersDelivery={p.offers_delivery} offersPickup={p.offers_pickup}
              deliveryFee={settings.default_delivery_fee_xof} maxQty={settings.max_quantity_per_item}
            />
          ) : (
            <Link prefetch={false} href={`/connexion?suite=${encodeURIComponent(`/pharmacies/${p.id}${sp.produit ? `?produit=${sp.produit}` : ""}#demande`)}`} className={cn(buttonVariants(), "w-full")}>
              Se connecter pour envoyer une demande
            </Link>
          )}
        </section>
        {session && <ReportForm pharmacyId={p.id} />}
      </aside>
    </div>
  );
}
