import { MapPinned } from "lucide-react";
import { authorityContext } from "@/lib/authority-server";
import { getGeo } from "@/lib/geo";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { DataBadge } from "@/components/authorities/data-badge";
import { DataMapLoader } from "@/components/authorities/data-map-loader";
import { KIND_COLORS, type DataPoint } from "@/components/authorities/data-map";

export const metadata = { title: "Carte des structures — SantéProxi Data", robots: { index: false } };

export default async function DataCarte({ searchParams }: { searchParams: Promise<{ region?: string }> }) {
  const sp = await searchParams;
  const ctx = await authorityContext("/autorites/carte");
  if (!ctx.ok) return null;
  const geo = await getGeo();
  const region = geo.regions.some((r) => r.id === sp.region) ? sp.region! : null;
  const { data } = await ctx.supabase.rpc("authority_map_points", { p_region: region });
  const points = ((data ?? []) as DataPoint[]).filter((p) => p.latitude !== null && p.longitude !== null);
  const counts = points.reduce<Record<string, number>>((a, p) => ({ ...a, [p.kind]: (a[p.kind] ?? 0) + 1 }), {});
  return (
    <div className="space-y-3">
      <h2 className="flex flex-wrap items-center gap-2 text-lg font-bold text-brand-deep"><MapPinned className="size-5 text-primary" aria-hidden />Carte nationale des structures référencées<DataBadge kind="administratif" /><DataBadge kind="declare" /></h2>
      <form method="get" className="flex flex-wrap items-end gap-2 rounded-2xl border bg-white p-3">
        <label className="text-sm">Région<Select name="region" defaultValue={region ?? ""} className="mt-1 h-10 w-56"><option value="">Tout le Mali</option>{geo.regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></label>
        <Button type="submit" size="sm">Afficher</Button>
      </form>
      <ul className="flex flex-wrap gap-3 text-sm">{Object.entries(KIND_COLORS).map(([k, [c, l]]) => <li key={k} className="flex items-center gap-1.5"><span className="size-3 rounded-full" style={{ background: c }} />{l} : <strong>{counts[k] ?? 0}</strong></li>)}</ul>
      <DataMapLoader points={points} />
      <p className="text-xs text-muted-foreground">Seules les structures dont la position est connue apparaissent ({points.length}). Une zone vide peut signaler un manque de structures, mais aussi un référencement incomplet ou des positions non encore saisies.</p>
    </div>
  );
}
