import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Couverture territoriale", robots: { index: false } };
export const dynamic = "force-dynamic";

type T = { region: string; circle: string; fiches: number; cscom: number; csref: number; hopitaux: number; partenaires: number; alertes_service: number; demandes_rdv: number | null };

export default async function Territoire() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("authority_territory");
  const rows = (data ?? []) as T[];
  const noCsref = rows.filter((r) => Number(r.csref) === 0).length;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Couverture territoriale du référentiel</h1>
      <p role="note" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">Comptages des fiches publiées dans le référentiel SantéProxi (CANAM 2022, carte sanitaire du ministère, corrections validées) et de l&apos;activité sur la plateforme. Ce ne sont pas des statistiques officielles : une fiche absente ne signifie pas l&apos;absence d&apos;établissement. Demandes de rendez-vous masquées sous le seuil de 10.</p>
      {error ? <p className="text-sm">Données indisponibles.</p> : <p className="text-sm">{rows.length} cercles · {noCsref} sans CSRéf référencé · {rows.reduce((n, r) => n + Number(r.partenaires), 0)} établissement(s) partenaire(s) · {rows.reduce((n, r) => n + Number(r.alertes_service), 0)} alerte(s) de service en cours.</p>}
      <div className="overflow-x-auto rounded-2xl border bg-white">
        <table className="w-full text-sm"><thead className="bg-muted/50 text-left"><tr>{["Région", "Cercle", "Fiches", "CSCom", "CSRéf", "Hôpitaux", "Partenaires", "Alertes de service", "Demandes de RDV (90 j)"].map((h) => <th key={h} className="p-2">{h}</th>)}</tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={`${r.region}-${r.circle}`} className={`border-t ${Number(r.fiches) === 0 ? "bg-red-50" : ""}`}><td className="p-2">{r.region}</td><td className="p-2">{r.circle}</td><td className="p-2">{r.fiches}</td><td className="p-2">{r.cscom}</td><td className="p-2">{r.csref}</td><td className="p-2">{r.hopitaux}</td><td className="p-2">{r.partenaires}</td><td className="p-2">{r.alertes_service}</td><td className="p-2">{r.demandes_rdv ?? "< 10"}</td></tr>))}</tbody></table>
      </div>
    </div>
  );
}
