import Link from "next/link";
import { MapLoader } from "@/components/map/map-loader";
import { LocationPicker } from "@/components/location-picker";
import { LocateButton } from "@/components/locate-button";
import { Button } from "@/components/ui/button";
import { DemoBadge } from "@/components/demo-badge";
import { getGeo } from "@/lib/geo";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { formatDistance, formatPhone } from "@/lib/format";

export const metadata = { title: "Carte des pharmacies" };

type P = { id: string; name: string; address: string; phone: string; latitude: number; longitude: number; is_open: boolean | null; commune_name: string | null; distance_km: number | null; is_demo: boolean };
type L = { id: string; name: string; address: string | null; phone: string | null; latitude: number; longitude: number; area: string | null; distance_km: number | null };
const uuid = (v?: string) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : null);

export default async function MapPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const geo = await getGeo();
  const lat = sp.lat ? Number(sp.lat) : null;
  const lng = sp.lng ? Number(sp.lng) : null;
  const me = lat !== null && lng !== null && !Number.isNaN(lat) && !Number.isNaN(lng) ? ([lat, lng] as [number, number]) : null;
  let points: P[] = [];
  let listings: L[] = [];
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const args = { p_region: uuid(sp.region), p_commune: uuid(sp.commune), p_lat: me?.[0] ?? null, p_lng: me?.[1] ?? null };
    const [{ data }, { data: others }] = await Promise.all([supabase.rpc("map_pharmacies", args), supabase.rpc("map_listings", args)]);
    points = (data as P[]) ?? [];
    listings = (others as L[]) ?? [];
  }
  const mapPoints = [
    ...points,
    ...listings.map((l) => ({ id: l.id, name: l.name, address: [l.address, l.area].filter(Boolean).join(" — "), latitude: l.latitude, longitude: l.longitude, is_open: null, phone: l.phone, kind: "listing" as const })),
  ];
  return (
    <div className="container-page space-y-4 py-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Carte des pharmacies</h1>
          <p className="text-sm text-muted-foreground">Repères verts : pharmacies inscrites et vérifiées (stocks, réservation). Repères blancs : officines pas encore inscrites, à appeler. <Link prefetch={false} href="/pharmacies" className="underline">Voir l&apos;annuaire complet</Link></p>
        </div>
        <LocateButton basePath="/carte" />
      </div>
      <form method="get" className="flex flex-col gap-2 rounded-xl border bg-white p-3 sm:flex-row sm:items-end">
        <LocationPicker geo={geo} compact names={{ region: "region", commune: "commune" }} defaults={{ region: sp.region, commune: sp.commune }} className="flex-1" />
        <Button type="submit">Filtrer</Button>
      </form>
      <MapLoader points={mapPoints} me={me} center={me} />
      <section aria-labelledby="list-title">
        <h2 id="list-title" className="text-lg font-bold">{points.length} pharmacie{points.length > 1 ? "s" : ""}</h2>
        {points.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Aucune pharmacie vérifiée et géolocalisée dans cette zone pour le moment.</p>
        ) : (
          <ul className="mt-2 divide-y rounded-xl border bg-white">
            {points.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 p-3">
                <div>
                  <Link prefetch={false} href={`/pharmacies/${p.id}`} className="font-semibold hover:underline">{p.name}</Link> {p.is_demo && <DemoBadge />}
                  <p className="text-sm text-muted-foreground">{p.address}{p.commune_name ? ` — ${p.commune_name}` : ""}</p>
                </div>
                {p.distance_km !== null && <span className="shrink-0 text-sm font-medium">{formatDistance(p.distance_km)}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
      {listings.length > 0 && (
        <section aria-labelledby="others-title">
          <h2 id="others-title" className="text-lg font-bold">{listings.length} autre{listings.length > 1 ? "s" : ""} pharmacie{listings.length > 1 ? "s" : ""} (pas encore inscrite{listings.length > 1 ? "s" : ""})</h2>
          <p className="text-sm text-muted-foreground">Stocks non disponibles : appelez pour vérifier.</p>
          <ul className="mt-2 divide-y rounded-xl border bg-white">
            {listings.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="font-semibold">{l.name}</p>
                  <p className="text-sm text-muted-foreground">{[l.address, l.area].filter(Boolean).join(" — ")}</p>
                  {l.phone && <a href={`tel:${l.phone}`} className="text-sm font-medium text-primary underline">{formatPhone(l.phone)}</a>}
                </div>
                {l.distance_km !== null && <span className="shrink-0 text-sm font-medium">{formatDistance(l.distance_km)}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
