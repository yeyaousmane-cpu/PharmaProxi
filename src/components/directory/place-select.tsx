"use client";
import { useMemo, useState } from "react";
import type { Place } from "@/lib/national-directory";

const cls = "mt-1 h-11 w-full rounded-lg border bg-white px-2 text-sm";

/** Région → cercle → commune : chaque liste ne propose que les lieux de la liste précédente. Sans JavaScript,
 *  toutes les options restent disponibles (regroupées par région) et le formulaire fonctionne. */
export function PlaceSelect({ places, region, circle, commune }: { places: Place[]; region?: string; circle?: string; commune?: string }) {
  const [r, setR] = useState(region ?? ""); const [c, setC] = useState(circle ?? ""); const [m, setM] = useState(commune ?? "");
  const regions = useMemo(() => places.filter((p) => p.level === "region"), [places]);
  const circles = useMemo(() => places.filter((p) => p.level === "cercle" && (!r || p.parent_id === r)), [places, r]);
  // Communes rattachées au cercle choisi, ou à la région quand elle n'a pas de cercle (District de Bamako)
  const communes = useMemo(() => {
    const ids = new Set(places.filter((p) => p.level === "cercle" && (!r || p.parent_id === r)).map((p) => p.id));
    return places.filter((p) => p.level === "commune" && (c ? p.parent_id === c : r ? p.parent_id === r || ids.has(p.parent_id ?? "") : true));
  }, [places, r, c]);
  const name = (id: string | null) => regions.find((x) => x.id === id)?.name ?? "";
  const count = (p: Place) => (p.n > 0 ? ` (${p.n})` : "");
  return (
    <>
      <label className="text-sm font-medium">Région
        <select name="region" value={r} onChange={(e) => { setR(e.target.value); setC(""); setM(""); }} className={cls}>
          <option value="">Toutes les régions</option>
          {regions.map((p) => <option key={p.id} value={p.id}>{p.name}{count(p)}</option>)}
        </select>
      </label>
      <label className="text-sm font-medium">Cercle
        <select name="cercle" value={c} onChange={(e) => { setC(e.target.value); setM(""); }} className={cls} disabled={circles.length === 0}>
          <option value="">{circles.length === 0 ? "Pas de cercle (District)" : "Tous les cercles"}</option>
          {r ? circles.map((p) => <option key={p.id} value={p.id}>{p.name}{count(p)}</option>)
            : regions.filter((g) => circles.some((p) => p.parent_id === g.id)).map((g) => (
              <optgroup key={g.id} label={g.name}>{circles.filter((p) => p.parent_id === g.id).map((p) => <option key={p.id} value={p.id}>{p.name}{count(p)}</option>)}</optgroup>))}
        </select>
      </label>
      <label className="text-sm font-medium">Commune
        <select name="commune" value={m} onChange={(e) => setM(e.target.value)} className={cls} disabled={communes.length === 0}>
          <option value="">{communes.length === 0 ? "Aucune commune enregistrée" : "Toutes les communes"}</option>
          {communes.map((p) => <option key={p.id} value={p.id}>{p.name}{!r ? ` — ${name(places.find((x) => x.id === p.parent_id)?.level === "region" ? p.parent_id : places.find((x) => x.id === p.parent_id)?.parent_id ?? null)}` : ""}{count(p)}</option>)}
        </select>
      </label>
    </>
  );
}
