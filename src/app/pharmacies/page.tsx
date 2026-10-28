import Link from "next/link";
import { MapPin, Navigation, Phone, ShieldCheck } from "lucide-react";
import { LocationPicker } from "@/components/location-picker";
import { LocateButton } from "@/components/locate-button";
import { Pagination } from "@/components/pagination";
import { DemoBadge } from "@/components/demo-badge";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { directionsUrl } from "@/components/result-card";
import { getGeo } from "@/lib/geo";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { formatDistance, formatPhone } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "Annuaire des pharmacies",
  description: "Toutes les pharmacies référencées au Mali : celles inscrites sur PharmaProxi (stocks et réservation) et les autres officines, avec leur téléphone.",
};

type Row = {
  kind: "verified" | "listing"; id: string; name: string; address: string | null; area: string | null; phone: string | null;
  latitude: number | null; longitude: number | null; distance_km: number | null; is_demo: boolean; total_count: number;
};
const SIZE = 30;
const uuid = (v?: string) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : null);

export default async function PharmacyDirectory({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const geo = await getGeo();
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const lat = sp.lat ? Number(sp.lat) : null;
  const lng = sp.lng ? Number(sp.lng) : null;
  const me = lat !== null && lng !== null && !Number.isNaN(lat) && !Number.isNaN(lng);
  const kind = sp.type === "inscrites" ? "verified" : sp.type === "autres" ? "listing" : "all";
  let rows: Row[] = [];
  let failed = false;
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("pharmacy_directory", {
      p_query: sp.q?.trim() || null, p_region: uuid(sp.region), p_commune: uuid(sp.commune),
      p_lat: me ? lat : null, p_lng: me ? lng : null, p_kind: kind, p_limit: SIZE, p_offset: (page - 1) * SIZE,
    });
    rows = (data as Row[]) ?? [];
    failed = Boolean(error);
  }
  const total = rows[0]?.total_count ? Number(rows[0].total_count) : 0;

  return (
    <div className="container-page space-y-4 py-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Annuaire des pharmacies</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Les pharmacies <strong>inscrites</strong> affichent leurs médicaments disponibles et acceptent les demandes de réservation.
            Les autres officines sont listées avec leur téléphone : appelez-les pour vérifier la disponibilité.
          </p>
        </div>
        <LocateButton basePath="/pharmacies" />
      </div>

      <form method="get" className="grid gap-2 rounded-xl border bg-white p-3 sm:grid-cols-[1fr_auto] lg:grid-cols-[1fr_2fr_auto_auto] lg:items-end">
        <Input name="q" placeholder="Nom de la pharmacie" defaultValue={sp.q} aria-label="Nom de la pharmacie" />
        <LocationPicker geo={geo} compact names={{ region: "region", commune: "commune" }} defaults={{ region: sp.region, commune: sp.commune }} />
        <Select name="type" defaultValue={sp.type ?? ""} aria-label="Type de pharmacie">
          <option value="">Toutes</option>
          <option value="inscrites">Inscrites sur PharmaProxi</option>
          <option value="autres">Non encore inscrites</option>
        </Select>
        {me ? <><input type="hidden" name="lat" value={sp.lat} /><input type="hidden" name="lng" value={sp.lng} /></> : null}
        <Button type="submit">Rechercher</Button>
      </form>

      <p className="text-sm font-medium" aria-live="polite">
        {failed ? "Le service ne répond pas pour le moment. Réessayez dans un instant." : `${total} pharmacie${total > 1 ? "s" : ""}${me ? " — de la plus proche à la plus éloignée" : ""}`}
      </p>

      {rows.length === 0 && !failed ? (
        <p className="rounded-xl border border-dashed bg-white p-8 text-center text-sm text-muted-foreground">Aucune pharmacie trouvée avec ces critères.</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {rows.map((p) => (
            <li key={`${p.kind}-${p.id}`} className={cn("flex flex-col gap-2 rounded-xl border bg-white p-4", p.kind === "verified" && "border-primary/30")}>
              <div className="flex flex-wrap items-center gap-2">
                {p.kind === "verified" ? (
                  <Link prefetch={false} href={`/pharmacies/${p.id}`} className="text-base font-bold hover:underline">{p.name}</Link>
                ) : (
                  <span className="text-base font-bold">{p.name}</span>
                )}
                {p.is_demo && <DemoBadge />}
                {p.distance_km !== null && <span className="ml-auto text-sm font-medium">{formatDistance(p.distance_km)}</span>}
              </div>
              {p.kind === "verified" ? (
                <Badge className="w-fit border-primary/30 bg-accent text-brand-deep"><ShieldCheck className="size-3" aria-hidden /> Inscrite et vérifiée : stocks et réservation</Badge>
              ) : (
                <Badge className="w-fit bg-muted text-muted-foreground">Pas encore inscrite : stocks non disponibles</Badge>
              )}
              {(p.address || p.area) && (
                <p className="flex items-start gap-2 text-sm text-muted-foreground">
                  <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />{[p.address, p.area].filter(Boolean).join(" — ")}
                </p>
              )}
              <div className="mt-auto flex flex-wrap gap-2 pt-1">
                {p.phone && (
                  <a href={`tel:${p.phone}`} className={cn(buttonVariants({ size: "sm", variant: p.kind === "verified" ? "outline" : "default" }))}>
                    <Phone aria-hidden /> {formatPhone(p.phone)}
                  </a>
                )}
                {p.latitude !== null && p.longitude !== null && (
                  <a href={directionsUrl(p.latitude, p.longitude)} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
                    <Navigation aria-hidden /> Itinéraire
                  </a>
                )}
                {p.kind === "verified" && (
                  <Link prefetch={false} href={`/pharmacies/${p.id}`} className={cn(buttonVariants({ size: "sm" }))}>Voir les médicaments</Link>
                )}
              </div>
              {p.kind === "listing" && (
                <p className="text-xs text-muted-foreground">
                  Vous êtes le pharmacien de cette officine ? <Link prefetch={false} href="/pharmacien/inscription" className="font-medium text-primary underline">Inscrivez-la gratuitement</Link>
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      <Pagination basePath="/pharmacies" params={sp} page={page} total={total} size={SIZE} />
      <p className="text-xs text-muted-foreground">
        Une information est erronée (numéro, adresse, pharmacie fermée) ? <Link prefetch={false} href="/infos/contact" className="underline">Signalez-le-nous</Link>.
      </p>
    </div>
  );
}
