import { TrendingUp } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { DataBadge } from "@/components/authorities/data-badge";

type Row = { month: string; pharmacies_verified: number; pharmacies_listed: number; facilities: number; labs: number; doctors: number; exams_with_price: number };
const SERIES: [keyof Row, string, string][] = [["pharmacies_verified", "Pharmacies inscrites", "bg-primary"], ["pharmacies_listed", "Autres officines", "bg-emerald-300"], ["facilities", "Établissements", "bg-brand-blue"], ["labs", "Laboratoires", "bg-violet-500"], ["doctors", "Médecins vérifiés", "bg-amber-500"], ["exams_with_price", "Analyses avec prix", "bg-pink-500"]];

/** Évolution du référentiel sur 12 mois (comptes cumulés en fin de mois). */
export async function RegistryTrend({ region }: { region: string | null }) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("authority_registry_trend", { p_region: region, p_months: 12 });
  const rows = (data ?? []) as Row[];
  if (rows.length === 0) return null;
  const last = rows[rows.length - 1];
  return (
    <section id="evolution" className="scroll-mt-24 space-y-3 rounded-2xl border bg-white p-4 sm:p-5">
      <h2 className="flex flex-wrap items-center gap-2 text-lg font-bold text-brand-deep"><TrendingUp className="size-5 text-primary" aria-hidden />Évolution du référentiel (12 mois)<DataBadge kind="administratif" /><DataBadge kind="declare" /></h2>
      <p className="text-xs text-muted-foreground">Nombre de structures référencées à la fin de chaque mois. Une hausse traduit d&apos;abord l&apos;avancée du référencement, pas forcément l&apos;ouverture de nouvelles structures.</p>
      <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm">
        <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1">Mois</th>{SERIES.map(([k, l]) => <th key={k}>{l}</th>)}</tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.month} className="border-t"><td className="py-1.5 font-medium">{new Date(r.month).toLocaleDateString("fr-FR", { month: "short", year: "numeric" })}</td>
            {SERIES.map(([k, , tone]) => { const v = Number(r[k]); const max = Math.max(1, ...rows.map((x) => Number(x[k]))); return (
              <td key={k} className="pr-3"><span className="flex items-center gap-2"><span className="w-8 text-right tabular-nums">{v}</span><span className="h-1.5 flex-1 rounded-full bg-muted"><span className={`block h-1.5 rounded-full ${tone}`} style={{ width: `${Math.round((100 * v) / max)}%` }} /></span></span></td>); })}
          </tr>))}</tbody>
      </table></div>
      <p className="text-sm">Aujourd&apos;hui : <strong>{last.pharmacies_verified}</strong> pharmacies inscrites, <strong>{last.pharmacies_listed}</strong> autres officines, <strong>{last.facilities}</strong> établissements, <strong>{last.labs}</strong> laboratoires, <strong>{last.doctors}</strong> médecins vérifiés.</p>
    </section>
  );
}
