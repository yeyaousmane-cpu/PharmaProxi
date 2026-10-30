import Link from "next/link";
import { AudioGuide } from "@/components/audio/audio-guide";
import { SearchX, SlidersHorizontal } from "lucide-react";
import { SearchBar } from "@/components/search-bar";
import { ResultCard, type SearchRow } from "@/components/result-card";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Label, Select, Input } from "@/components/ui/input";
import { getGeo } from "@/lib/geo";
import { createClient } from "@/lib/supabase/server";
import { humanizeError } from "@/lib/errors";
import { allow } from "@/lib/limiter";
import { clientIp } from "@/lib/request";
import { cn } from "@/lib/utils";

export const metadata = { title: "Recherche de médicaments" };

const PAGE_SIZE = 20;
type SP = Record<string, string | undefined>;

const uuidOrNull = (v?: string) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : null);
const numOrNull = (v?: string) => (v && !Number.isNaN(Number(v)) ? Number(v) : null);

export default async function SearchPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const geo = await getGeo();
  const q = (sp.q ?? "").trim().slice(0, 100);
  const page = Math.max(1, Math.min(50, Number(sp.page) || 1));
  const sort = ["relevance", "distance", "freshness", "price"].includes(sp.tri ?? "") ? sp.tri! : "relevance";
  const lat = numOrNull(sp.lat);
  const lng = numOrNull(sp.lng);

  let rows: SearchRow[] = [];
  let error: string | null = null;
  if (q.length >= 2) {
    if (!(await allow(`search:${await clientIp()}`, 60, 60_000))) {
      error = "Trop de recherches en peu de temps. Patientez une minute.";
    } else {
      const supabase = await createClient();
      const { data, error: e } = await supabase.rpc("search_inventory", {
        p_query: q,
        p_region: uuidOrNull(sp.region),
        p_commune: uuidOrNull(sp.commune),
        p_locality: uuidOrNull(sp.quartier),
        p_lat: lat,
        p_lng: lng,
        p_max_km: lat !== null ? numOrNull(sp.km) : null,
        p_open_only: sp.ouvert === "1",
        p_max_price: numOrNull(sp.prixmax),
        p_include_unavailable: sp.dispo !== "1",
        p_sort: sort === "distance" && lat === null ? "relevance" : sort,
        p_limit: PAGE_SIZE,
        p_offset: (page - 1) * PAGE_SIZE,
      });
      if (e) error = humanizeError(e);
      rows = (data as SearchRow[]) ?? [];
    }
  }
  const total = rows[0]?.total_count ?? 0;
  const pages = Math.ceil(Number(total) / PAGE_SIZE);
  const link = (patch: SP) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, ...patch })) if (v) p.set(k, v);
    return `/recherche?${p}`;
  };

  return (
    <div className="container-page py-6">
      <AudioGuide target="recherche" className="mb-4" />
      <div className="rounded-2xl border bg-white p-4 shadow-sm">
        <SearchBar geo={geo} defaults={{ q, region: sp.region, commune: sp.commune, quartier: sp.quartier }} />
      </div>

      {q.length >= 2 && (
        <details className="mt-4 rounded-xl border bg-white p-4" open={Boolean(sp.ouvert || sp.prixmax || sp.dispo || sp.km)}>
          <summary className="flex cursor-pointer items-center gap-2 font-semibold">
            <SlidersHorizontal className="size-4" aria-hidden /> Filtres et tri
          </summary>
          <form method="get" action="/recherche" className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {["q", "region", "commune", "quartier", "lat", "lng"].map((k) => (sp[k] ? <input key={k} type="hidden" name={k} value={sp[k]} /> : null))}
            <div className="space-y-1">
              <Label htmlFor="tri">Trier par</Label>
              <Select id="tri" name="tri" defaultValue={sort}>
                <option value="relevance">Pertinence</option>
                <option value="freshness">Disponibilité récente</option>
                <option value="price">Prix croissant</option>
                <option value="distance" disabled={lat === null}>Proximité{lat === null ? " (position requise)" : ""}</option>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="prixmax">Prix maximum (FCFA)</Label>
              <Input id="prixmax" name="prixmax" type="number" min={0} step={50} inputMode="numeric" defaultValue={sp.prixmax} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="km">Distance maximum</Label>
              <Select id="km" name="km" defaultValue={sp.km ?? ""} disabled={lat === null}>
                <option value="">{lat === null ? "Position requise" : "Toutes distances"}</option>
                {[1, 3, 5, 10, 25].map((k) => <option key={k} value={k}>{k} km</option>)}
              </Select>
            </div>
            <fieldset className="space-y-2 text-sm">
              <legend className="sr-only">Options</legend>
              <label className="flex items-center gap-2"><input type="checkbox" name="dispo" value="1" defaultChecked={sp.dispo === "1"} className="size-4" /> Disponibles uniquement</label>
              <label className="flex items-center gap-2"><input type="checkbox" name="ouvert" value="1" defaultChecked={sp.ouvert === "1"} className="size-4" /> Ouvertes maintenant</label>
            </fieldset>
            <div className="flex items-end"><Button type="submit" className="w-full">Appliquer</Button></div>
          </form>
          <p className="mt-2 text-xs text-muted-foreground">« Ouvertes maintenant » ne retient que les pharmacies dont les horaires ont été vérifiés.</p>
        </details>
      )}

      <section className="mt-6" aria-live="polite">
        {error && <Alert tone="error" title={error} />}
        {!error && q.length < 2 && (
          <p className="text-center text-muted-foreground">Saisissez au moins 2 caractères pour lancer la recherche.</p>
        )}
        {!error && q.length >= 2 && rows.length === 0 && (
          <div className="rounded-xl border border-dashed bg-white p-8 text-center">
            <SearchX className="mx-auto size-8 text-muted-foreground" aria-hidden />
            <p className="mt-2 font-semibold">Aucune pharmacie ne déclare « {q} » {sp.region ? "dans cette zone" : ""}.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Vérifiez l&apos;orthographe, essayez le principe actif, élargissez la zone, ou appelez directement une pharmacie proche : toutes ne sont pas encore inscrites.
            </p>
            <Link prefetch={false} href="/carte" className="mt-3 inline-block font-semibold text-primary underline">Voir les pharmacies sur la carte</Link>
          </div>
        )}
        {rows.length > 0 && (
          <>
            <p className="mb-3 text-sm text-muted-foreground">
              {total} résultat{Number(total) > 1 ? "s" : ""} pour « {q} ». Les disponibilités sont déclarées par les pharmacies : faites-les confirmer.
            </p>
            <div className="grid gap-3">{rows.map((r) => <ResultCard key={r.inventory_id} r={r} />)}</div>
            {pages > 1 && (
              <nav aria-label="Pagination" className="mt-6 flex items-center justify-center gap-2">
                {page > 1 && <Link prefetch={false} className={cn(buttonVariants({ variant: "outline", size: "sm" }))} href={link({ page: String(page - 1) })}>Précédent</Link>}
                <span className="text-sm">Page {page} / {pages}</span>
                {page < pages && <Link prefetch={false} className={cn(buttonVariants({ variant: "outline", size: "sm" }))} href={link({ page: String(page + 1) })}>Suivant</Link>}
              </nav>
            )}
          </>
        )}
      </section>
    </div>
  );
}
