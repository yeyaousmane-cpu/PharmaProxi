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

export const metadata = { title: "Carte des structures de santé" };

type P = { id: string; name: string; address: string; phone: string; latitude: number; longitude: number; is_open: boolean | null; commune_name: string | null; distance_km: number | null; is_demo: boolean };
type L = { id: string; name: string; address: string | null; phone: string | null; latitude: number; longitude: number; area: string | null; distance_km: number | null };
type F = { id: string; name: string; kind: string; address: string | null; phone: string | null; latitude: number; longitude: number; area: string | null; position_precision: "confirmee" | "a_confirmer" | "approximative" | "inconnue"; distance_km: number | null };
type FNoPos = { id: string; name: string; kind: string; area: string | null; quarter: string | null; phone: string | null };
const uuid = (v?: string) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : null);

const KIND_LABEL: Record<string, string> = {
  chu: "CHU", hopital: "Hôpital", clinique: "Clinique", cabinet: "Cabinet médical",
  cabinet_dentaire: "Cabinet dentaire", centre_sante: "Centre de santé", csref: "CSRéf",
  cscom: "CSCOM", laboratoire: "Laboratoire", imagerie: "Imagerie", centre_specialise: "Centre spécialisé",
  urgences: "Urgences", ambulance: "Ambulance",
};

export default async function MapPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const geo = await getGeo();
  const lat = sp.lat ? Number(sp.lat) : null;
  const lng = sp.lng ? Number(sp.lng) : null;
  const me = lat !== null && lng !== null && !Number.isNaN(lat) && !Number.isNaN(lng) ? ([lat, lng] as [number, number]) : null;
  const show = sp.type === "pharmacies" ? "pharmacies" : sp.type === "structures" ? "structures" : "tout";
  let points: P[] = [];
  let listings: L[] = [];
  let facilities: F[] = [];
  let noPosition: FNoPos[] = [];
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const args = { p_region: uuid(sp.region), p_commune: uuid(sp.commune), p_lat: me?.[0] ?? null, p_lng: me?.[1] ?? null };
    const wantPh = show !== "structures";
    const wantFa = show !== "pharmacies";
    const [ph, ot, fa, np] = await Promise.all([
      wantPh ? supabase.rpc("map_pharmacies", args) : Promise.resolve({ data: [] }),
      wantPh ? supabase.rpc("map_listings", args) : Promise.resolve({ data: [] }),
      wantFa ? supabase.rpc("map_facilities", args) : Promise.resolve({ data: [] }),
      wantFa
        ? supabase.rpc("map_facilities_without_position", { p_region: uuid(sp.region), p_commune: uuid(sp.commune) })
        : Promise.resolve({ data: [] }),
    ]);
    points = (ph.data as P[]) ?? [];
    listings = (ot.data as L[]) ?? [];
    facilities = (fa.data as F[]) ?? [];
    noPosition = (np.data as FNoPos[]) ?? [];
  }
  const approx = facilities.filter((f) => f.position_precision === "approximative").length;
  const mapPoints = [
    ...points,
    ...listings.map((l) => ({ id: l.id, name: l.name, address: [l.address, l.area].filter(Boolean).join(" — "), latitude: l.latitude, longitude: l.longitude, is_open: null, phone: l.phone, kind: "listing" as const })),
    ...facilities.map((f) => ({
      id: f.id, name: `${KIND_LABEL[f.kind] ?? "Structure"} · ${f.name}`,
      address: [f.address, f.area].filter(Boolean).join(" — "),
      latitude: f.latitude, longitude: f.longitude, is_open: null, phone: f.phone,
      kind: "clinic" as const, href: `/etablissements/${f.id}`, precision: f.position_precision,
    })),
  ];
  return (
    <div className="container-page space-y-4 py-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Carte des structures de santé</h1>
          <p className="text-sm text-muted-foreground">Repères verts : pharmacies inscrites et vérifiées (stocks, réservation). Repères blancs : officines pas encore inscrites, à appeler. Repères bleus : hôpitaux, cliniques, laboratoires et centres de santé. <Link prefetch={false} href="/pharmacies" className="underline">Annuaire des pharmacies</Link> · <Link prefetch={false} href="/etablissements" className="underline">Annuaire des établissements</Link></p>
        </div>
        <LocateButton basePath="/carte" />
      </div>
      <form method="get" className="flex flex-col gap-2 rounded-xl border bg-white p-3 sm:flex-row sm:items-end">
        <LocationPicker geo={geo} compact names={{ region: "region", commune: "commune" }} defaults={{ region: sp.region, commune: sp.commune }} className="flex-1" />
        <select name="type" defaultValue={sp.type ?? ""} aria-label="Type de structure" className="h-11 rounded-lg border bg-white px-3 text-sm">
          <option value="">Tout afficher</option>
          <option value="pharmacies">Pharmacies seulement</option>
          <option value="structures">Établissements de santé seulement</option>
        </select>
        {me ? <><input type="hidden" name="lat" value={sp.lat} /><input type="hidden" name="lng" value={sp.lng} /></> : null}
        <Button type="submit">Filtrer</Button>
      </form>
      <MapLoader points={mapPoints} me={me} center={me} />
      {approx > 0 && (
        <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {approx} établissement{approx > 1 ? "s" : ""} {approx > 1 ? "sont placés" : "est placé"} à une position approximative, au secteur du quartier et non à l&apos;adresse exacte : plusieurs fiches partagent la même coordonnée. Vérifiez l&apos;adresse et le téléphone sur la fiche avant de vous déplacer.
        </p>
      )}
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
      {facilities.length > 0 && (
        <section aria-labelledby="fac-title">
          <h2 id="fac-title" className="text-lg font-bold">{facilities.length} établissement{facilities.length > 1 ? "s" : ""} de santé sur la carte</h2>
          <ul className="mt-2 divide-y rounded-xl border bg-white">
            {facilities.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <Link prefetch={false} href={`/etablissements/${f.id}`} className="font-semibold hover:underline">{f.name}</Link>
                  <p className="text-sm text-muted-foreground">{[KIND_LABEL[f.kind] ?? f.kind, f.address, f.area].filter(Boolean).join(" — ")}</p>
                  {f.position_precision === "approximative" && (
                    <p className="text-xs font-medium text-amber-800">Position approximative : vérifiez l&apos;adresse avant de vous déplacer.</p>
                  )}
                  {f.phone && <a href={`tel:${f.phone}`} className="text-sm font-medium text-primary underline">{formatPhone(f.phone)}</a>}
                </div>
                {f.distance_km !== null && <span className="shrink-0 text-sm font-medium">{formatDistance(f.distance_km)}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
      {noPosition.length > 0 && (
        <section aria-labelledby="nopos-title">
          <h2 id="nopos-title" className="text-lg font-bold">{noPosition.length} établissement{noPosition.length > 1 ? "s" : ""} sans position enregistrée</h2>
          <p className="text-sm text-muted-foreground">
            Aucune coordonnée n&apos;est estimée par SantéProxi : ces structures ne sont pas placées sur la carte. Elles restent joignables par téléphone et repérables par quartier.
          </p>
          <ul className="mt-2 divide-y rounded-xl border border-dashed bg-white">
            {noPosition.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <Link prefetch={false} href={`/etablissements/${f.id}`} className="font-semibold hover:underline">{f.name}</Link>
                  <p className="text-sm text-muted-foreground">{[KIND_LABEL[f.kind] ?? f.kind, f.quarter, f.area].filter(Boolean).join(" — ")}</p>
                  {f.phone && <a href={`tel:${f.phone}`} className="text-sm font-medium text-primary underline">{formatPhone(f.phone)}</a>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
