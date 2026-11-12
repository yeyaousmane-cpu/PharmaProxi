import Link from "next/link";
import { Building2, ChevronLeft, ChevronRight, Download, Info, MapPinned, Phone } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { formatPhone } from "@/lib/format";
import { cn } from "@/lib/utils";
import { MapLoader } from "@/components/map/map-loader";
import { PlaceSelect } from "@/components/directory/place-select";
import { DirectoryQuery } from "@/components/directory/directory-query";
import { DIRECTORY_KINDS, DIRECTORY_SERVICES, trustLabel, waUrl, type DirectoryRow, type Place } from "@/lib/national-directory";

export const metadata = { title: "Annuaire national des établissements de santé", description: "Hôpitaux, CSRéf, CSCom, cliniques, laboratoires et centres d'imagerie du Mali, avec la source de chaque information." };
export const dynamic = "force-dynamic";

const PAGE = 20;
const uuid = (s?: string) => (s && /^[0-9a-f-]{36}$/.test(s) ? s : null);
type SP = { q?: string; region?: string; cercle?: string; commune?: string; type?: string; service?: string; tel?: string; gps?: string; fiabilite?: string; page?: string; carte?: string };

export default async function Etablissements({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const page = Math.max(1, Math.min(200, Number(sp.page) || 1));
  const kind = sp.type && sp.type in DIRECTORY_KINDS ? sp.type : null;
  const service = sp.service && sp.service in DIRECTORY_SERVICES ? sp.service : null;
  const level = ["verifie", "officielle", "a_confirmer"].includes(sp.fiabilite ?? "") ? sp.fiabilite! : null;
  let rows: DirectoryRow[] = []; let places: Place[] = []; let stats = null as { total: number; geolocalises: number; par_type: Record<string, number> } | null;
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const [r, p, s] = await Promise.all([
      supabase.rpc("directory_search", { p_q: sp.q?.slice(0, 120) || null, p_region: uuid(sp.region), p_circle: uuid(sp.cercle), p_commune: uuid(sp.commune), p_kind: kind,
        p_service: service, p_has_phone: sp.tel === "1" || null, p_level: level, p_geo: sp.gps === "1" || null, p_limit: PAGE, p_offset: (page - 1) * PAGE }),
      supabase.rpc("directory_places"), supabase.rpc("directory_stats"),
    ]);
    rows = (r.data ?? []) as DirectoryRow[]; places = (p.data ?? []) as Place[]; stats = s.data as typeof stats;
  }
  const total = rows[0]?.total ?? 0;
  const pages = Math.ceil(total / PAGE);
  const filtered = Boolean(sp.q || sp.region || sp.cercle || sp.commune || kind || service || level || sp.tel || sp.gps);
  const qs = (o: Partial<SP>) => { const u = new URLSearchParams(); for (const [k, v] of Object.entries({ ...sp, ...o })) if (v) u.set(k, String(v)); return `?${u.toString()}`; };
  const geo = rows.filter((x) => x.latitude !== null && x.longitude !== null);
  return (
    <div className="container-page max-w-5xl space-y-5 py-6">
      <header className="space-y-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-brand-deep"><Building2 className="size-7 text-primary" aria-hidden /> Annuaire national des établissements de santé</h1>
        <p className="text-muted-foreground">Hôpitaux, CSRéf, CSCom, cliniques, cabinets, laboratoires et centres d&apos;imagerie de tout le Mali. Chaque fiche indique d&apos;où vient l&apos;information et si elle a été vérifiée.</p>
        {stats && <p className="text-sm text-muted-foreground">{stats.total.toLocaleString("fr-FR")} établissements référencés à ce jour, dont {stats.geolocalises} avec une position GPS publiée par une source officielle. <Link prefetch={false} href="/etablissements/couverture" className="font-semibold text-primary underline">Couverture et sources</Link></p>}
      </header>

      <form method="get" action="/etablissements" className="space-y-3 rounded-2xl border bg-white p-4">
        <label htmlFor="q" className="sr-only">Rechercher un établissement</label>
        <DirectoryQuery value={sp.q} />
        <div className="grid gap-3 sm:grid-cols-3"><PlaceSelect places={places} region={uuid(sp.region) ?? undefined} circle={uuid(sp.cercle) ?? undefined} commune={uuid(sp.commune) ?? undefined} /></div>
        <details open={Boolean(kind || service || level || sp.tel || sp.gps)} className="rounded-xl bg-muted/40 p-3">
          <summary className="cursor-pointer text-sm font-semibold">Plus de filtres (type, service, fiabilité)</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <label className="text-sm font-medium">Type d&apos;établissement
              <select name="type" defaultValue={kind ?? ""} className="mt-1 h-11 w-full rounded-lg border bg-white px-2 text-sm"><option value="">Tous les types</option>{Object.entries(DIRECTORY_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
            <label className="text-sm font-medium">Service confirmé
              <select name="service" defaultValue={service ?? ""} className="mt-1 h-11 w-full rounded-lg border bg-white px-2 text-sm"><option value="">Tous</option>{Object.entries(DIRECTORY_SERVICES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
            <label className="text-sm font-medium">Fiabilité
              <select name="fiabilite" defaultValue={level ?? ""} className="mt-1 h-11 w-full rounded-lg border bg-white px-2 text-sm"><option value="">Toutes les fiches</option>
                <option value="verifie">Vérifiées par SantéProxi</option><option value="officielle">Listées par une source officielle</option><option value="a_confirmer">À confirmer</option></select></label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="tel" value="1" defaultChecked={sp.tel === "1"} className="size-4" /> Avec un numéro de téléphone</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="gps" value="1" defaultChecked={sp.gps === "1"} className="size-4" /> Avec une position sur la carte</label>
          </div>
        </details>
        <div className="flex flex-wrap gap-2">
          <button type="submit" className="h-11 rounded-xl bg-[#052D1E] px-5 font-semibold text-white">Rechercher</button>
          {filtered && <Link prefetch={false} href="/etablissements" className="inline-flex h-11 items-center rounded-xl border px-4 text-sm font-semibold">Effacer les filtres</Link>}
        </div>
      </form>

      <p className="flex items-start gap-2 rounded-xl bg-brand-mint p-3 text-sm text-brand-deep"><Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>Une fiche « listée par une source officielle » reprend une liste publiée (CANAM 2022, carte sanitaire du ministère). Elle ne vaut pas agrément et l&apos;activité actuelle peut avoir changé : <strong>appelez avant de vous déplacer</strong>. En cas d&apos;urgence, voir la page <Link prefetch={false} href="/urgences" className="underline">Urgences</Link>.</span></p>

      <section aria-labelledby="res" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="res" className="text-lg font-bold text-brand-deep">{total.toLocaleString("fr-FR")} établissement{total > 1 ? "s" : ""}{filtered ? " trouvé" + (total > 1 ? "s" : "") : ""}</h2>
          <div className="flex flex-wrap gap-2 text-sm">
            {geo.length > 0 && sp.carte !== "1" && <Link prefetch={false} href={qs({ carte: "1" })} className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 font-semibold"><MapPinned className="size-4" aria-hidden /> Voir sur la carte ({geo.length})</Link>}
            <a href={`/etablissements/export${qs({ page: undefined, carte: undefined })}`} className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 font-semibold"><Download className="size-4" aria-hidden /> Exporter (CSV)</a>
          </div>
        </div>
        {sp.carte === "1" && geo.length > 0 && (
          <div className="space-y-1"><MapLoader points={geo.map((x) => ({ id: x.id, name: x.name, address: [x.locality, x.circle, x.region].filter(Boolean).join(", "), latitude: x.latitude!, longitude: x.longitude!, is_open: null, kind: "listing" as const, href: `/etablissements/${x.id}`, phone: x.phone }))} />
            <p className="text-xs text-muted-foreground">Seuls les établissements dont la position a été publiée par une source officielle apparaissent sur la carte ({geo.length} sur {rows.length} dans cette page). Aucune position n&apos;est estimée.</p></div>
        )}
        {rows.length === 0 ? <p className="rounded-2xl border border-dashed p-5 text-sm text-muted-foreground">Aucun établissement ne correspond. Essayez un autre nom ou retirez un filtre. L&apos;absence d&apos;une structure dans SantéProxi ne signifie pas qu&apos;elle n&apos;existe pas : le référentiel est en cours de constitution.</p> : (
          <ul className="grid gap-3 md:grid-cols-2">{rows.map((x) => <Card key={x.id} x={x} />)}</ul>
        )}
        {pages > 1 && (
          <nav aria-label="Pages de résultats" className="flex items-center justify-center gap-3 text-sm">
            {page > 1 ? <Link prefetch={false} href={qs({ page: String(page - 1), carte: undefined })} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 font-semibold"><ChevronLeft className="size-4 rtl:-scale-x-100" aria-hidden /> Précédent</Link> : <span />}
            <span>Page {page} sur {pages}</span>
            {page < pages ? <Link prefetch={false} href={qs({ page: String(page + 1), carte: undefined })} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 font-semibold">Suivant <ChevronRight className="size-4 rtl:-scale-x-100" aria-hidden /></Link> : <span />}
          </nav>
        )}
      </section>
    </div>
  );
}

function Card({ x }: { x: DirectoryRow }) {
  const t = trustLabel(x.reliability, x.source_level);
  const place = [x.locality, x.quarter, x.commune, x.circle ? `cercle de ${x.circle}` : null, x.region].filter(Boolean).join(" · ");
  const kindLabel = x.category_label === "Polyclinique" ? "Polyclinique" : DIRECTORY_KINDS[x.kind === "chu" ? "hopital" : x.kind] ?? x.kind;
  return (
    <li className="flex flex-col gap-2 rounded-2xl border bg-white p-4 text-sm">
      <div className="flex flex-wrap gap-1.5 text-xs">
        <span className="rounded-full bg-brand-mint px-2 py-0.5 font-semibold text-brand-deep">{kindLabel}</span>
        <span className={cn("rounded-full px-2 py-0.5 font-semibold", t.className)}>{t.label}</span>
        {x.latitude !== null && <span className="rounded-full bg-sky-50 px-2 py-0.5 font-semibold text-sky-900">Sur la carte</span>}
      </div>
      <h3 className="text-base font-bold leading-snug"><Link prefetch={false} href={`/etablissements/${x.id}`} className="hover:underline">{x.name}</Link></h3>
      <p className="text-muted-foreground">{place || "Localisation non renseignée"}</p>
      {x.offers.length > 0 && <p className="text-xs">{x.offers.slice(0, 5).map((o) => o.label).join(" · ")}{x.offers.length > 5 ? ` · +${x.offers.length - 5}` : ""}</p>}
      <div className="mt-auto flex flex-wrap gap-2 pt-1">
        {x.phone && <a href={`tel:${x.phone}`} className="inline-flex min-h-10 items-center gap-1 rounded-lg bg-[#052D1E] px-3 font-semibold text-white"><Phone className="size-4" aria-hidden />{formatPhone(x.phone)}</a>}
        {x.whatsapp && <a href={waUrl(x.whatsapp)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center rounded-lg border px-3 font-semibold">WhatsApp</a>}
        <Link prefetch={false} href={`/etablissements/${x.id}`} className="inline-flex min-h-10 items-center rounded-lg border px-3 font-semibold">Voir la fiche</Link>
      </div>
    </li>
  );
}
