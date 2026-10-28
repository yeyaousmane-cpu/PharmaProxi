"use client";
import { useMemo, useState } from "react";
import type { GeoData } from "@/lib/geo";
import { Label, Select } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Props = {
  geo: GeoData;
  defaults?: { region?: string; circle?: string; commune?: string; locality?: string };
  names?: { region: string; circle?: string; commune: string; locality?: string };
  requiredRegion?: boolean;
  showCircle?: boolean;
  compact?: boolean;
  className?: string;
};

/** Sélection en cascade Région → (Cercle) → Commune → Quartier. Fonctionne sans géolocalisation. */
export function LocationPicker({
  geo, defaults = {}, names = { region: "region", commune: "commune", locality: "quartier" },
  requiredRegion = false, showCircle = false, compact = false, className,
}: Props) {
  const [region, setRegion] = useState(defaults.region ?? "");
  const [circle, setCircle] = useState(defaults.circle ?? "");
  const [commune, setCommune] = useState(defaults.commune ?? "");
  const [locality, setLocality] = useState(defaults.locality ?? "");

  const circles = useMemo(() => geo.circles.filter((c) => c.region_id === region), [geo, region]);
  const communes = useMemo(
    () => geo.communes.filter((c) => c.region_id === region && (!showCircle || !circle || c.circle_id === circle)),
    [geo, region, circle, showCircle],
  );
  const localities = useMemo(() => geo.localities.filter((l) => l.commune_id === commune), [geo, commune]);

  const box = compact ? "grid grid-cols-1 gap-2 sm:grid-cols-3" : "grid gap-3 sm:grid-cols-2";
  return (
    <div className={cn(box, className)}>
      <div className="space-y-1">
        <Label htmlFor={`${names.region}-sel`} className={compact ? "sr-only" : undefined}>Région{requiredRegion ? " *" : ""}</Label>
        <Select id={`${names.region}-sel`} name={names.region} value={region} required={requiredRegion}
          onChange={(e) => { setRegion(e.target.value); setCircle(""); setCommune(""); setLocality(""); }}>
          <option value="">{requiredRegion ? "Choisir une région" : "Tout le Mali"}</option>
          {geo.regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </Select>
      </div>
      {showCircle && names.circle && (
        <div className="space-y-1">
          <Label htmlFor={`${names.circle}-sel`}>Cercle</Label>
          <Select id={`${names.circle}-sel`} name={names.circle} value={circle} disabled={!region || circles.length === 0}
            onChange={(e) => { setCircle(e.target.value); setCommune(""); setLocality(""); }}>
            <option value="">{circles.length ? "Tous les cercles" : "Aucun cercle référencé"}</option>
            {circles.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </div>
      )}
      <div className="space-y-1">
        <Label htmlFor={`${names.commune}-sel`} className={compact ? "sr-only" : undefined}>Commune</Label>
        <Select id={`${names.commune}-sel`} name={names.commune} value={commune} disabled={!region}
          onChange={(e) => { setCommune(e.target.value); setLocality(""); }}>
          <option value="">{!region ? "Commune" : communes.length ? "Toutes les communes" : "Aucune commune référencée"}</option>
          {communes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </div>
      {names.locality && (
        <div className="space-y-1">
          <Label htmlFor={`${names.locality}-sel`} className={compact ? "sr-only" : undefined}>Quartier</Label>
          <Select id={`${names.locality}-sel`} name={names.locality} value={locality} disabled={!commune || localities.length === 0}
            onChange={(e) => setLocality(e.target.value)}>
            <option value="">{!commune ? "Quartier" : localities.length ? "Tous les quartiers" : "Aucun quartier référencé"}</option>
            {localities.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </Select>
        </div>
      )}
    </div>
  );
}
