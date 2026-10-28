"use client";
import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LocateFixed, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LocationPicker } from "@/components/location-picker";
import type { GeoData } from "@/lib/geo";
import { cn } from "@/lib/utils";

type Suggestion = { catalog_id: string; label: string; active_ingredient: string | null };

/** Barre de recherche avec suggestions (catalogue) et localisation. */
export function SearchBar({
  geo, defaults = {}, large = false,
}: { geo: GeoData; defaults?: { q?: string; region?: string; commune?: string; quartier?: string }; large?: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState(defaults.q ?? "");
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const listId = useId();

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setItems([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/suggestions?q=${encodeURIComponent(term)}`);
        const data = res.ok ? ((await res.json()) as Suggestion[]) : [];
        if (!cancelled) setItems(data);
      } catch {
        if (!cancelled) setItems([]); // les suggestions sont facultatives
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q]);

  function nearMe() {
    setGeoError(null);
    if (!("geolocation" in navigator)) {
      setGeoError("Géolocalisation indisponible : choisissez votre région et votre commune.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const p = new URLSearchParams({ lat: pos.coords.latitude.toFixed(5), lng: pos.coords.longitude.toFixed(5) });
        if (q.trim().length >= 2) {
          p.set("q", q.trim());
          p.set("tri", "distance");
          router.push(`/recherche?${p}`);
        } else router.push(`/carte?${p}`);
      },
      () => {
        setLocating(false);
        setGeoError("Position refusée ou indisponible. Choisissez votre région et votre commune ci-dessous.");
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  }

  return (
    <div className="w-full">
      <form ref={formRef} action="/recherche" method="get" role="search" className="space-y-3">
        <div className="relative">
          <label htmlFor="q" className="sr-only">Quel médicament recherchez-vous ?</label>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            id="q" name="q" value={q} required minLength={2} maxLength={100} autoComplete="off"
            placeholder="Quel médicament recherchez-vous ?"
            role="combobox" aria-expanded={open && items.length > 0} aria-controls={listId} aria-autocomplete="list"
            aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
            onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(-1); }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onKeyDown={(e) => {
              if (!open || !items.length) return;
              if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, -1)); }
              if (e.key === "Enter" && active >= 0) { e.preventDefault(); setQ(items[active].label); setOpen(false); }
              if (e.key === "Escape") setOpen(false);
            }}
            className={cn(
              "w-full rounded-xl border-2 border-primary/30 bg-white pl-11 pr-3 shadow-sm outline-none focus:border-primary",
              large ? "h-14 text-lg" : "h-12 text-base",
            )}
          />
          {open && items.length > 0 && (
            <ul id={listId} role="listbox" className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-xl border bg-white py-1 shadow-lg">
              {items.map((s, i) => (
                <li key={s.catalog_id} id={`${listId}-${i}`} role="option" aria-selected={i === active}
                  onMouseDown={(e) => { e.preventDefault(); setQ(s.label); setOpen(false); }}
                  className={cn("cursor-pointer px-4 py-2 text-sm", i === active ? "bg-accent" : "hover:bg-muted")}>
                  <span className="font-medium">{s.label}</span>
                  {s.active_ingredient ? <span className="block text-xs text-muted-foreground">{s.active_ingredient}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </div>
        <LocationPicker geo={geo} compact defaults={{ region: defaults.region, commune: defaults.commune, locality: defaults.quartier }} />
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="submit" size="lg" className="w-full sm:flex-1">
            <Search aria-hidden /> Trouver un médicament
          </Button>
          <Button type="button" size="lg" variant="secondary" onClick={nearMe} disabled={locating} className="w-full sm:flex-1">
            {locating ? <Loader2 className="animate-spin" aria-hidden /> : <LocateFixed aria-hidden />}
            Pharmacies autour de moi
          </Button>
        </div>
        {geoError ? <p role="alert" className="text-sm text-amber-800">{geoError}</p> : null}
      </form>
    </div>
  );
}
