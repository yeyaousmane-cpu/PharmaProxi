import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { BloodNav } from "@/components/blood/blood-nav";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Observatoire du don de sang sur SantéProxi", description: "Activité du don de sang sur SantéProxi : collectes, mobilisation, demandes SOS. Chiffres de la plateforme, pas des statistiques officielles." };
export const dynamic = "force-dynamic";

type O = { genere_le: string; periode_jours: number; seuil: number;
  national: { collectes_publiees: number; collectes_a_venir: number; j_y_serai: number | null; donneurs_inscrits: number | null; demandes_sos: number | null; bilans_declares_poches: number | null };
  regions: { region: string; collectes: number; j_y_serai: number | null; demandes_sos: number | null }[]; mois: { mois: string; collectes: number }[] };

export default async function Observatoire({ searchParams }: { searchParams: Promise<{ jours?: string }> }) {
  const sp = await searchParams;
  const days = [30, 90, 365].includes(Number(sp.jours)) ? Number(sp.jours) : 90;
  const supabase = await createClient();
  const { data } = await supabase.rpc("blood_observatory", { p_days: days });
  const o = data as O | null;
  const v = (n: number | null | undefined, k: number) => (n === null || n === undefined ? `moins de ${k}` : n.toLocaleString("fr-FR"));
  const max = Math.max(1, ...(o?.mois ?? []).map((m) => m.collectes));
  return (
    <div className="container-page max-w-4xl space-y-5 py-6">
      <BloodNav current="/don-de-sang/observatoire" />
      <h1 className="text-2xl font-bold">Observatoire du don de sang sur SantéProxi</h1>
      <p role="note" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"><strong>Ces chiffres ne sont pas des statistiques officielles</strong> du ministère de la Santé ou du CNTS. Ils décrivent seulement l&apos;activité enregistrée sur SantéProxi. Pour protéger la vie privée, tout nombre inférieur à {o?.seuil ?? 10} est masqué. Les bilans de collecte sont déclarés par les organisateurs.</p>
      <div className="flex gap-1 text-sm" role="group" aria-label="Période">{[30, 90, 365].map((d) => <Link key={d} prefetch={false} href={`/don-de-sang/observatoire?jours=${d}`} aria-current={d === days ? "page" : undefined} className={cn("rounded-full border px-3 py-1", d === days ? "border-red-600 bg-red-600 text-white" : "bg-white")}>{d} jours</Link>)}</div>
      {!o ? <p className="rounded-xl border bg-white p-4 text-sm">Données indisponibles pour le moment.</p> : (<>
        <dl className="grid gap-3 sm:grid-cols-3">
          {([["Collectes publiées", o.national.collectes_publiees], ["Collectes à venir", o.national.collectes_a_venir], ["« J'y serai » annoncés", o.national.j_y_serai], ["Donneurs inscrits sur SantéProxi", o.national.donneurs_inscrits], ["Demandes SOS publiées", o.national.demandes_sos], ["Poches déclarées par les organisateurs", o.national.bilans_declares_poches]] as const).map(([l, n]) => (
            <div key={l} className="rounded-2xl border bg-white p-4"><dt className="text-xs text-muted-foreground">{l}</dt><dd className="text-2xl font-bold text-brand-deep">{v(n, o.seuil)}</dd></div>))}
        </dl>
        <section className="space-y-2 rounded-2xl border bg-white p-4" aria-labelledby="mo">
          <h2 id="mo" className="font-semibold">Collectes par mois</h2>
          <ul className="space-y-1 text-sm">{o.mois.map((m) => (
            <li key={m.mois} className="grid grid-cols-[6rem_1fr_2rem] items-center gap-2"><span>{new Date(`${m.mois}-01T12:00:00Z`).toLocaleDateString("fr-FR", { month: "short", year: "numeric" })}</span>
              <span className="h-3 rounded bg-muted" aria-hidden><span className="block h-3 rounded bg-red-600" style={{ width: `${(m.collectes / max) * 100}%` }} /></span><span className="text-right font-semibold">{m.collectes}</span></li>))}</ul>
        </section>
        <section className="overflow-x-auto rounded-2xl border bg-white" aria-labelledby="rg">
          <h2 id="rg" className="p-4 pb-2 font-semibold">Par région ({o.periode_jours} derniers jours)</h2>
          <table className="w-full text-sm"><thead className="bg-muted/50 text-left"><tr><th className="p-2">Région</th><th className="p-2">Collectes</th><th className="p-2">« J&apos;y serai »</th><th className="p-2">Demandes SOS</th></tr></thead>
            <tbody>{o.regions.map((r) => <tr key={r.region} className="border-t"><td className="p-2">{r.region}</td><td className="p-2">{r.collectes}</td><td className="p-2">{v(r.j_y_serai, o.seuil)}</td><td className="p-2">{v(r.demandes_sos, o.seuil)}</td></tr>)}</tbody></table>
        </section>
        <p className="text-xs text-muted-foreground">Calculé le {formatDateTime(o.genere_le)}. Méthode : comptage direct des enregistrements de la plateforme (collectes publiées, « j&apos;y serai », profils donneurs, demandes SOS), masquage sous le seuil, aucune extrapolation. L&apos;absence d&apos;activité sur SantéProxi ne signifie pas l&apos;absence de besoins.</p>
      </>)}
    </div>
  );
}
