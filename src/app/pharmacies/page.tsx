import Link from "next/link";
import { ProOnly } from "@/components/pro/pro-only";
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
import { BadgeRow, ConventionBadge } from "@/components/insurance/insurance-badges";
import { CONFIRM_BEFORE_VISIT, groupBadges, type InsuranceBadge } from "@/lib/insurance";

export const metadata = {
  title: "Annuaire des pharmacies",
  description: "Toutes les pharmacies référencées au Mali : celles inscrites sur SantéProxi (stocks et réservation) et les autres officines, avec leur téléphone.",
};

type Row = {
  kind: "verified" | "listing"; id: string; name: string; address: string | null; area: string | null; phone: string | null;
  latitude: number | null; longitude: number | null; distance_km: number | null; is_demo: boolean; total_count: number;
};
const SIZE = 30;
const uuid = (v?: string) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : null);
type InsurerOpt = { id: string; name: string; slug: string; pharmacies: number };
type NetRow = {
  id: string; name: string; area: string | null; region_name: string | null; commune_name: string | null; address: string | null; phones: string[];
  pharmacy_id: string | null; public_status: string; source_label: string | null; source_date: string | null; total_count: number;
};

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
  let insurers: InsurerOpt[] = [];
  let insurer: InsurerOpt | null = null;
  let network: NetRow[] = [];
  let badges = new Map<string, InsuranceBadge[]>();
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    insurers = (((await supabase.rpc("insurance_overview")).data as InsurerOpt[] | null) ?? []).filter((i) => Number(i.pharmacies) > 0);
    insurer = insurers.find((i) => i.slug === sp.assurance) ?? null;
  }
  if (isSupabaseConfigured() && insurer) {
    // Filtre « Assurance acceptée » : pharmacies du réseau de l'organisme choisi.
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("insurer_network", {
      p_insurer: insurer.id, p_query: sp.q?.trim() || null, p_category: "pharmacie", p_region: uuid(sp.region), p_commune: uuid(sp.commune),
      p_confirmed_only: sp.tp === "1", p_limit: SIZE, p_offset: (page - 1) * SIZE,
    });
    network = (data as NetRow[]) ?? [];
    failed = Boolean(error);
  } else if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("pharmacy_directory", {
      p_query: sp.q?.trim() || null, p_region: uuid(sp.region), p_commune: uuid(sp.commune),
      p_lat: me ? lat : null, p_lng: me ? lng : null, p_kind: kind, p_limit: SIZE, p_offset: (page - 1) * SIZE,
    });
    rows = (data as Row[]) ?? [];
    failed = Boolean(error);
    const verifiedIds = rows.filter((r) => r.kind === "verified").map((r) => r.id);
    const listingIds = rows.filter((r) => r.kind === "listing").map((r) => r.id);
    const [b1, b2] = await Promise.all([
      verifiedIds.length ? supabase.rpc("insurance_badges", { p_kind: "pharmacy", p_ids: verifiedIds }) : Promise.resolve({ data: [] }),
      listingIds.length ? supabase.rpc("insurance_badges", { p_kind: "listing", p_ids: listingIds }) : Promise.resolve({ data: [] }),
    ]);
    badges = groupBadges([...((b1.data as InsuranceBadge[]) ?? []), ...((b2.data as InsuranceBadge[]) ?? [])]);
  }
  const total = insurer ? Number(network[0]?.total_count ?? 0) : rows[0]?.total_count ? Number(rows[0].total_count) : 0;

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

      <form method="get" className="grid gap-2 rounded-xl border bg-white p-3 sm:grid-cols-[1fr_auto] lg:grid-cols-[1fr_2fr_auto_auto_auto] lg:items-end">
        <Input name="q" placeholder="Nom de la pharmacie" defaultValue={sp.q} aria-label="Nom de la pharmacie" />
        <LocationPicker geo={geo} compact names={{ region: "region", commune: "commune" }} defaults={{ region: sp.region, commune: sp.commune }} />
        <Select name="type" defaultValue={sp.type ?? ""} aria-label="Type de pharmacie">
          <option value="">Toutes</option>
          <option value="inscrites">Inscrites sur SantéProxi</option>
          <option value="autres">Non encore inscrites</option>
        </Select>
        {insurers.length > 0 && (
          <Select name="assurance" defaultValue={insurer?.slug ?? ""} aria-label="Assurance acceptée">
            <option value="">Assurance acceptée : toutes</option>
            {insurers.map((i) => <option key={i.slug} value={i.slug}>{i.name}</option>)}
          </Select>
        )}
        {me ? <><input type="hidden" name="lat" value={sp.lat} /><input type="hidden" name="lng" value={sp.lng} /></> : null}
        <Button type="submit">Rechercher</Button>
        {insurer && <label className="flex items-center gap-2 text-sm lg:col-span-5"><input type="checkbox" name="tp" value="1" defaultChecked={sp.tp === "1"} className="size-4" /> Tiers payant confirmé uniquement</label>}
      </form>

      <p className="text-sm font-medium" aria-live="polite">
        {failed ? "Le service ne répond pas pour le moment. Réessayez dans un instant." : `${total} pharmacie${total > 1 ? "s" : ""}${insurer ? ` du réseau ${insurer.name}` : me ? " — de la plus proche à la plus éloignée" : ""}`}
      </p>

      {insurer ? (
        <>
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
            Liste issue du réseau déclaré de {insurer.name}. Les pharmacies « à vérifier » n&apos;ont pas encore de convention confirmée. {CONFIRM_BEFORE_VISIT}{" "}
            <Link prefetch={false} href={`/assurances/${insurer.slug}`} className="font-semibold underline">Tout le réseau de {insurer.name}</Link>
          </p>
          {network.length === 0 && !failed ? (
            <p className="rounded-xl border border-dashed bg-white p-8 text-center text-sm text-muted-foreground">Aucune pharmacie de ce réseau ne correspond à ces critères.</p>
          ) : (
            <ul className="grid gap-3 md:grid-cols-2">
              {network.map((n) => (
                <li key={n.id} className="flex flex-col gap-2 rounded-xl border bg-white p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    {n.pharmacy_id
                      ? <Link prefetch={false} href={`/pharmacies/${n.pharmacy_id}`} className="text-base font-bold hover:underline">{n.name}</Link>
                      : <span className="text-base font-bold">{n.name}</span>}
                  </div>
                  <ConventionBadge name={insurer!.name} status={n.public_status} />
                  {(n.address || n.area || n.commune_name || n.region_name) && (
                    <p className="flex items-start gap-2 text-sm text-muted-foreground">
                      <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />{[n.address, n.area, n.commune_name, n.region_name].filter(Boolean).join(" — ")}
                    </p>
                  )}
                  {n.phones.length > 0 && (
                    <div className="mt-auto flex flex-wrap gap-2 pt-1">
                      {n.phones.slice(0, 2).map((ph) => (
                        <a key={ph} href={`tel:${ph}`} className={cn(buttonVariants({ size: "sm", variant: "outline" }))}><Phone aria-hidden /> {formatPhone(ph)}</a>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      ) : rows.length === 0 && !failed ? (
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
                {p.distance_km !== null && <span className="ms-auto text-sm font-medium">{formatDistance(p.distance_km)}</span>}
              </div>
              {p.kind === "verified" ? (
                <Badge className="w-fit border-primary/30 bg-accent text-brand-deep"><ShieldCheck className="size-3" aria-hidden /> Inscrite et vérifiée : stocks et réservation</Badge>
              ) : (
                <Badge className="w-fit bg-muted text-muted-foreground">Pas encore inscrite : stocks non disponibles</Badge>
              )}
              <BadgeRow badges={badges.get(p.id)} />
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
<ProOnly><p className="text-xs text-muted-foreground">
                  Vous êtes le pharmacien de cette officine ? <Link prefetch={false} href="/professionnels?type=pharmacie" className="font-medium text-primary underline">Demandez son inscription</Link>
                </p></ProOnly>
              )}
            </li>
          ))}
        </ul>
      )}

      <Pagination basePath="/pharmacies" params={sp} page={page} total={total} size={SIZE} />
      <p className="text-xs text-muted-foreground">
        Une information est erronée (numéro, adresse, pharmacie fermée) ? <Link prefetch={false} href="/infos/contact?sujet=erreur#formulaire" className="underline">Signalez-le-nous</Link>.
      </p>
    </div>
  );
}
