import Link from "next/link";
import { MapLoader } from "@/components/map/map-loader";
import { LocationPicker } from "@/components/location-picker";
import { LocateButton } from "@/components/locate-button";
import { Button } from "@/components/ui/button";
import { DemoBadge } from "@/components/demo-badge";
import { getGeo } from "@/lib/geo";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { formatDistance } from "@/lib/format";

export const metadata = { title: "Carte des pharmacies" };

type P = { id: string; name: string; address: string; phone: string; latitude: number; longitude: number; is_open: boolean | null; commune_name: string | null; distance_km: number | null; is_demo: boolean };
const uuid = (v?: string) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : null);

export default async function MapPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const geo = await getGeo();
  const lat = sp.lat ? Number(sp.lat) : null;
  const lng = sp.lng ? Number(sp.lng) : null;
  const me = lat !== null && lng !== null && !Number.isNaN(lat) && !Number.isNaN(lng) ? ([lat, lng] as [number, number]) : null;
  let points: P[] = [];
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const { data } = await supabase.rpc("map_pharmacies", { p_region: uuid(sp.region), p_commune: uuid(sp.commune), p_lat: me?.[0] ?? null, p_lng: me?.[1] ?? null });
    points = (data as P[]) ?? [];
  }
  return (
    <div className="container-page space-y-4 py-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Carte des pharmacies</h1>
          <p className="text-sm text-muted-foreground">Seules les pharmacies vérifiées dont la localisation est renseignée apparaissent.</p>
        </div>
        <LocateButton basePath="/carte" />
      </div>
      <form method="get" className="flex flex-col gap-2 rounded-xl border bg-white p-3 sm:flex-row sm:items-end">
        <LocationPicker geo={geo} compact names={{ region: "region", commune: "commune" }} defaults={{ region: sp.region, commune: sp.commune }} className="flex-1" />
        <Button type="submit">Filtrer</Button>
      </form>
      <MapLoader points={points} me={me} center={me} />
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
    </div>
  );
}
