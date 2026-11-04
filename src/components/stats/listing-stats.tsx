import { BarChart3 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

type Stats = { days: number; total: { views: number; calls: number; directions: number; requests: number }; previous: { views: number; calls: number }; weeks: { week: string; views: number; calls: number }[] };

/** Statistiques de fréquentation d'une fiche, visibles par l'établissement lui-même. */
export async function ListingStats({ kind, id, title = "Fréquentation de votre fiche" }: { kind: string; id: string; title?: string }) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_listing_stats", { p_kind: kind, p_id: id, p_days: 30 });
  if (error || !data) return null;
  const s = data as Stats;
  const trend = (now: number, before: number) => (before > 0 ? `${now >= before ? "+" : ""}${Math.round(((now - before) * 100) / before)} % par rapport aux 30 jours précédents` : null);
  const max = Math.max(1, ...s.weeks.map((w) => Number(w.views)));
  const tiles: [string, number, string | null][] = [["Consultations de la fiche", s.total.views, trend(s.total.views, s.previous.views)], ["Appels", s.total.calls, trend(s.total.calls, s.previous.calls)], ["Itinéraires", s.total.directions, null], ["Demandes reçues", s.total.requests, null]];
  return (
    <section className="space-y-3 rounded-2xl border bg-white p-4 sm:p-5">
      <h2 className="flex items-center gap-2 text-lg font-bold text-brand-deep"><BarChart3 className="size-5 text-primary" aria-hidden />{title} (30 jours)</h2>
      <div className="grid gap-2 sm:grid-cols-4">{tiles.map(([l, v, t]) => (
        <div key={l} className="rounded-xl bg-muted/50 p-3"><p className="text-xs text-muted-foreground">{l}</p><p className="text-2xl font-bold text-brand-deep">{v}</p>{t && <p className="text-[11px] text-muted-foreground">{t}</p>}</div>))}</div>
      {s.weeks.length > 0 && <div className="flex h-16 items-end gap-1" aria-label="Consultations par semaine">{s.weeks.map((w) => <span key={w.week} title={`Semaine du ${new Date(w.week).toLocaleDateString("fr-FR")} : ${w.views}`} className="flex-1 rounded-t bg-primary/70" style={{ height: `${Math.max(4, Math.round((100 * Number(w.views)) / max))}%` }} />)}</div>}
      <p className="text-xs text-muted-foreground">Comptes anonymes : SantéProxi ne sait pas qui a consulté votre fiche. Les appels et itinéraires sont comptés quand on touche le bouton sur SantéProxi.</p>
    </section>
  );
}
