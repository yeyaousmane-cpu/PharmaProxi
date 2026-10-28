import Link from "next/link";
import { Building2, MapPin, Phone, Search, SearchX, Siren, Stethoscope } from "lucide-react";
import { EmergencyBanner, DirectoryFreshnessBadge } from "@/components/directory/directory-bits";
import { LocationPicker } from "@/components/location-picker";
import { LocateButton } from "@/components/locate-button";
import { MapLoader } from "@/components/map/map-loader";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { getGeo } from "@/lib/geo";
import { getSettings } from "@/lib/settings";
import { getSpecialties, groupByFamily, numOrNull, uuidOrNull } from "@/lib/directory-server";
import { createClient } from "@/lib/supabase/server";
import { humanizeError } from "@/lib/errors";
import { allow } from "@/lib/limiter";
import { clientIp } from "@/lib/request";
import { CLINIC_KINDS, CLINIC_SERVICES, FACILITY_KINDS, type DirectoryFreshness } from "@/lib/directory";
import { formatDistance, formatPhone } from "@/lib/format";
import { isSupabaseConfigured } from "@/lib/env";
import { cn } from "@/lib/utils";

export const metadata = { title: "Cliniques et établissements de santé" };

type Row = {
  clinic_id: string; name: string; kind: string; address: string; commune_name: string | null; region_name: string; phone: string;
  latitude: number | null; longitude: number | null; emergency_24h: boolean; services: string[]; specialties: { id: string; name: string }[];
  doctors_count: number; is_open: boolean | null; distance_km: number | null; confirmed_at: string; freshness: DirectoryFreshness; total_count: number;
};
type SP = Record<string, string | undefined>;
type Facility = {
  id: string; name: string; kind: string; category_label: string | null; region_name: string | null; city_label: string | null; address: string | null;
  phone: string | null; phone2: string | null; total_count: number;
};
const PAGE_SIZE = 20;

export default async function ClinicsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const [geo, specialties, settings] = await Promise.all([getGeo(), getSpecialties(), getSettings()]);
  const q = (sp.q ?? "").trim().slice(0, 80);
  const lat = numOrNull(sp.lat);
  const lng = numOrNull(sp.lng);
  const page = Math.max(1, Math.min(50, Number(sp.page) || 1));
  let rows: Row[] = [];
  let others: Facility[] = [];
  let error: string | null = null;
  const fpage = Math.max(1, Math.min(100, Number(sp.fpage) || 1));
  if (isSupabaseConfigured()) {
    if (!(await allow(`dir:${await clientIp()}`, 60, 60_000))) {
      error = "Trop de recherches en peu de temps. Patientez une minute.";
    } else {
      const supabase = await createClient();
      const { data, error: e } = await supabase.rpc("search_clinics", {
        p_query: q.length >= 2 ? q : null, p_region: uuidOrNull(sp.region), p_commune: uuidOrNull(sp.commune), p_specialty: uuidOrNull(sp.specialite),
        p_emergency: sp.urgences === "1", p_lat: lat, p_lng: lng, p_sort: lat !== null ? "distance" : "name", p_limit: PAGE_SIZE, p_offset: (page - 1) * PAGE_SIZE,
      });
      if (e) error = humanizeError(e);
      rows = (data as Row[]) ?? [];
      // Fiches simples non vérifiées : seuls les filtres nom et région s'y appliquent
      if (!sp.specialite && sp.urgences !== "1" && !sp.commune) {
        const { data: f } = await supabase.rpc("search_facility_listings", {
          p_query: q.length >= 2 ? q : null, p_region: uuidOrNull(sp.region), p_limit: PAGE_SIZE, p_offset: (fpage - 1) * PAGE_SIZE,
        });
        others = (f as Facility[]) ?? [];
      }
    }
  }
  const total = Number(rows[0]?.total_count ?? 0);
  const otherTotal = Number(others[0]?.total_count ?? 0);
  const otherPages = Math.ceil(otherTotal / PAGE_SIZE);
  const pages = Math.ceil(total / PAGE_SIZE);
  const link = (patch: SP) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, ...patch })) if (v) p.set(k, v);
    return `/cliniques?${p}`;
  };
  const points = rows.filter((r) => r.latitude !== null && r.longitude !== null)
    .map((r) => ({ id: r.clinic_id, name: r.name, address: r.address, latitude: r.latitude!, longitude: r.longitude!, is_open: r.is_open, kind: "clinic" as const, href: `/cliniques/${r.clinic_id}` }));

  return (
    <div className="container-page space-y-5 py-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-brand-blue"><Building2 className="size-4" aria-hidden /> Annuaire médical</p>
          <h1 className="text-2xl font-bold text-brand-deep sm:text-3xl">Cliniques et établissements</h1>
          <p className="text-muted-foreground">Spécialités présentes, médecins, horaires et service d&apos;urgence.</p>
        </div>
        <Link prefetch={false} href="/medecins" className={cn(buttonVariants({ variant: "outline" }), "shrink-0")}><Stethoscope aria-hidden /> Chercher un médecin</Link>
      </header>
      <EmergencyBanner numbers={settings.emergency_numbers} />

      <form method="get" action="/cliniques" className="space-y-3 rounded-2xl border bg-white p-4 shadow-sm" role="search">
        <div className="grid gap-3 md:grid-cols-[1fr_260px]">
          <div className="space-y-1">
            <Label htmlFor="q">Nom de l&apos;établissement</Label>
            <Input id="q" name="q" defaultValue={q} maxLength={80} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="specialite">Spécialité présente</Label>
            <Select id="specialite" name="specialite" defaultValue={sp.specialite ?? ""}>
              <option value="">Toutes</option>
              {groupByFamily(specialties).map(([family, list]) => (
                <optgroup key={family} label={family}>{list.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</optgroup>
              ))}
            </Select>
          </div>
        </div>
        <LocationPicker geo={geo} compact names={{ region: "region", commune: "commune" }} defaults={{ region: sp.region, commune: sp.commune }} className="sm:grid-cols-2" />
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="urgences" value="1" defaultChecked={sp.urgences === "1"} className="size-4" /> Urgences 24 h/24</label>
          {lat !== null && lng !== null && <><input type="hidden" name="lat" value={lat} /><input type="hidden" name="lng" value={lng} /></>}
          <Button type="submit" className="bg-brand-blue hover:bg-brand-blue/90"><Search aria-hidden /> Rechercher</Button>
        </div>
      </form>
      <div className="flex justify-end"><LocateButton basePath="/cliniques" /></div>

      {error && <Alert tone="error" title={error} />}
      {!error && rows.length === 0 && others.length > 0 ? (
        <p className="rounded-xl border border-dashed bg-white p-4 text-sm text-muted-foreground">
          Aucun établissement vérifié ne correspond pour l&apos;instant. Voici les établissements connus, pas encore vérifiés.
        </p>
      ) : !error && rows.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-white p-8 text-center">
          <SearchX className="mx-auto size-8 text-muted-foreground" aria-hidden />
          <p className="mt-2 font-semibold">Aucun établissement référencé ne correspond.</p>
          <p className="mt-1 text-sm text-muted-foreground">L&apos;annuaire se construit avec les établissements qui demandent leur référencement. <Link prefetch={false} href="/clinique/inscription" className="font-semibold text-brand-blue underline">Inscrire un établissement</Link>.</p>
        </div>
      ) : (
        <>
          {points.length > 0 && <MapLoader points={points} me={lat !== null && lng !== null ? [lat, lng] : null} />}
          <p className="text-sm text-muted-foreground">{total} établissement{total > 1 ? "s" : ""}. {lat !== null ? "Du plus proche au plus éloigné." : "Par ordre alphabétique."}</p>
          <ul className="grid gap-3 md:grid-cols-2">
            {rows.map((c) => (
              <li key={c.clinic_id} className="rounded-xl border bg-white p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link prefetch={false} href={`/cliniques/${c.clinic_id}`} className="text-lg font-bold text-brand-deep hover:underline">{c.name}</Link>
                    <p className="text-xs text-muted-foreground">{CLINIC_KINDS[c.kind] ?? c.kind}</p>
                  </div>
                  {c.emergency_24h && <Badge className="shrink-0 border-red-200 bg-red-50 text-red-800"><Siren className="size-3" aria-hidden /> Urgences 24 h/24</Badge>}
                </div>
                <p className="mt-2 flex items-start gap-1 text-sm"><MapPin className="mt-0.5 size-4 shrink-0 text-brand-blue" aria-hidden />{c.address} — {[c.commune_name, c.region_name].filter(Boolean).join(", ")}
                  {c.distance_km !== null ? <span className="ml-1 text-muted-foreground">({formatDistance(c.distance_km)})</span> : null}</p>
                {c.specialties.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">{c.specialties.slice(0, 8).map((s) => <Badge key={s.id} className="border-sky-200 bg-brand-sky text-brand-blue">{s.name}</Badge>)}</div>
                )}
                {c.services.length > 0 && <p className="mt-2 text-xs text-muted-foreground">{c.services.map((s) => CLINIC_SERVICES[s] ?? s).join(" · ")}</p>}
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1 text-sm font-semibold text-brand-blue hover:underline"><Phone className="size-4" aria-hidden />{formatPhone(c.phone)}</a>
                  <span className="text-xs text-muted-foreground">{c.doctors_count} médecin(s) référencé(s)</span>
                </div>
                <div className="mt-2"><DirectoryFreshnessBadge freshness={c.freshness} /></div>
              </li>
            ))}
          </ul>
          {pages > 1 && (
            <nav aria-label="Pagination" className="flex items-center justify-center gap-2">
              {page > 1 && <Link prefetch={false} className={cn(buttonVariants({ variant: "outline", size: "sm" }))} href={link({ page: String(page - 1) })}>Précédent</Link>}
              <span className="text-sm">Page {page} / {pages}</span>
              {page < pages && <Link prefetch={false} className={cn(buttonVariants({ variant: "outline", size: "sm" }))} href={link({ page: String(page + 1) })}>Suivant</Link>}
            </nav>
          )}
        </>
      )}
      {others.length > 0 && (
        <section aria-labelledby="others-title" className="space-y-3">
          <div>
            <h2 id="others-title" className="text-lg font-bold">Autres établissements, pas encore vérifiés ({otherTotal})</h2>
            <p className="text-sm text-muted-foreground">Informations non vérifiées par PharmaProxi (nom, ville, téléphone). Appelez avant de vous déplacer. Établissement concerné ? <Link prefetch={false} href="/clinique/inscription" className="font-semibold text-brand-blue underline">Inscrivez-vous</Link> pour afficher vos médecins et vos horaires.</p>
          </div>
          <ul className="grid gap-3 md:grid-cols-2">
            {others.map((f) => (
              <li key={f.id} className="flex flex-col gap-1.5 rounded-xl border bg-white p-4">
                <p className="text-base font-bold text-brand-deep">{f.name}</p>
                <p className="text-xs text-muted-foreground">{FACILITY_KINDS[f.kind] ?? f.kind}{f.category_label && f.category_label !== FACILITY_KINDS[f.kind] ? ` · ${f.category_label}` : ""}</p>
                <p className="flex items-start gap-1 text-sm"><MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />{[f.address, f.city_label ?? f.region_name].filter(Boolean).join(" — ") || "Ville non précisée"}</p>
                <div className="mt-1 flex flex-wrap gap-3">
                  {[f.phone, f.phone2].filter(Boolean).map((p) => (
                    <a key={p} href={`tel:${p}`} className="inline-flex items-center gap-1 text-sm font-semibold text-brand-blue hover:underline"><Phone className="size-4" aria-hidden />{formatPhone(p)}</a>
                  ))}
                </div>
                <Badge className="mt-1 w-fit bg-muted text-muted-foreground">Non vérifié</Badge>
              </li>
            ))}
          </ul>
          {otherPages > 1 && (
            <nav aria-label="Pagination des autres établissements" className="flex items-center justify-center gap-2">
              {fpage > 1 && <Link prefetch={false} className={cn(buttonVariants({ variant: "outline", size: "sm" }))} href={link({ fpage: String(fpage - 1) })}>Précédent</Link>}
              <span className="text-sm">Page {fpage} / {otherPages}</span>
              {fpage < otherPages && <Link prefetch={false} className={cn(buttonVariants({ variant: "outline", size: "sm" }))} href={link({ fpage: String(fpage + 1) })}>Suivant</Link>}
            </nav>
          )}
        </section>
      )}
    </div>
  );
}
