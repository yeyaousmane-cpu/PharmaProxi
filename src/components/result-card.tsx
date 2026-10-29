import Link from "next/link";
import { FileText, MapPin, MessageCircle, Navigation, Phone, Store } from "lucide-react";
import { FreshnessBadge } from "@/components/freshness-badge";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { formatDistance, formatPhone, formatXof, whatsappUrl } from "@/lib/format";
import type { Freshness } from "@/lib/freshness";
import { cn } from "@/lib/utils";

export type SearchRow = {
  inventory_id: string; pharmacy_id: string; pharmacy_name: string; address: string; region_name: string;
  commune_name: string | null; locality_name: string | null; phone: string; whatsapp: string | null;
  latitude: number | null; longitude: number | null; is_open: boolean | null; hours_verified: boolean;
  offers_pickup: boolean; offers_delivery: boolean; catalog_id: string; brand_name: string; generic_name: string | null;
  active_ingredient: string | null; dosage: string | null; form: string | null; packaging: string | null;
  requires_prescription: boolean; price_xof: number | null; freshness: Freshness; stock_updated_at: string;
  distance_km: number | null; total_count: number;
};

export function directionsUrl(lat: number, lng: number) {
  return `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=%3B${lat}%2C${lng}`;
}

export function ResultCard({ r }: { r: SearchRow }) {
  const label = [r.brand_name, r.dosage, r.form].filter(Boolean).join(" · ");
  const place = [r.locality_name, r.commune_name, r.region_name].filter(Boolean).join(", ");
  const dist = formatDistance(r.distance_km);
  const wa = whatsappUrl(r.whatsapp, `Bonjour, avez-vous ${[r.brand_name, r.dosage].filter(Boolean).join(" ")} disponible ? (vu sur PharmaProxi)`);
  return (
    <article className="rounded-xl border bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Link prefetch={false} href={`/produits/${r.catalog_id}`} className="font-semibold text-brand-deep hover:underline">{label}</Link>
          {r.active_ingredient ? <p className="text-xs text-muted-foreground">Principe actif : {r.active_ingredient}</p> : null}
          <p className="mt-2 flex items-center gap-1.5 font-medium">
            <Store className="size-4 text-brand-green" aria-hidden />
            <Link prefetch={false} href={`/pharmacies/${r.pharmacy_id}`} className="hover:underline">{r.pharmacy_name}</Link>
          </p>
          <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
            <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>{r.address} — {place}{dist ? ` · ${dist}` : ""}</span>
          </p>
        </div>
        <div className="shrink-0 text-left sm:text-right">
          <p className="text-lg font-bold">{formatXof(r.price_xof)}</p>
          <p className="text-xs text-muted-foreground">prix déclaré</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <FreshnessBadge freshness={r.freshness} updatedAt={r.stock_updated_at} />
        {r.requires_prescription && (
          <Badge className="border-sky-200 bg-sky-50 text-sky-800"><FileText className="size-3" aria-hidden /> Sur ordonnance</Badge>
        )}
        {r.hours_verified && r.is_open !== null && (
          <Badge className={r.is_open ? "border-emerald-200 bg-white text-emerald-700" : "border-slate-200 bg-white text-slate-600"}>
            {r.is_open ? "Ouverte maintenant" : "Fermée actuellement"}
          </Badge>
        )}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <a href={`tel:${r.phone}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))} aria-label={`Appeler ${r.pharmacy_name} au ${formatPhone(r.phone)}`}>
          <Phone aria-hidden /> Appeler
        </a>
        {wa ? (
          <a href={wa} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ variant: "outline", size: "sm" }))} aria-label={`Écrire à ${r.pharmacy_name} sur WhatsApp`}>
            <MessageCircle aria-hidden /> WhatsApp
          </a>
        ) : null}
        {r.latitude !== null && r.longitude !== null ? (
          <a href={directionsUrl(r.latitude, r.longitude)} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
            <Navigation aria-hidden /> Itinéraire
          </a>
        ) : null}
        {r.freshness !== "unavailable" && r.price_xof !== null ? (
          <Link prefetch={false} href={`/pharmacies/${r.pharmacy_id}?produit=${r.inventory_id}#demande`} className={cn(buttonVariants({ size: "sm" }), "col-span-2")}>
            Demander confirmation
          </Link>
        ) : null}
      </div>
    </article>
  );
}
