import { FileBarChart } from "lucide-react";
import { authorityContext } from "@/lib/authority-server";
import { getGeo } from "@/lib/geo";
import { fmtN } from "@/lib/authorities";
import { PrintPdfButton } from "@/components/dossier/print";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { DataBadge } from "@/components/authorities/data-badge";

export const metadata = { title: "Rapport institutionnel — SantéProxi Data", robots: { index: false } };

type Overview = { searches: number | null; searches_unfound: number | null; unfound_rate: number | null; pharmacies_verified: number; pharmacies_fresh_stock: number; on_duty_now: number; blood_donors: number | null; questions: number | null; reports: number | null };
type SupplyRegion = { region: string; region_id: string; pharmacies: number; pharmacies_listed: number; doctors_register: number; labs: number; health_facilities: number; home_care: number; home_sampling: number };
type Supply = { register_year: number | null; by_region: SupplyRegion[]; specialties: { specialty: string; n: number }[]; exams_with_price: number };

/** Rapport imprimable (ou enregistrable en PDF) pour les institutions. */
export default async function Rapport({ searchParams }: { searchParams: Promise<{ region?: string; jours?: string }> }) {
  const sp = await searchParams;
  const ctx = await authorityContext("/autorites/rapport");
  if (!ctx.ok) return null;
  const geo = await getGeo();
  const region = geo.regions.some((r) => r.id === sp.region) ? sp.region! : null;
  const days = [30, 90, 365].includes(Number(sp.jours)) ? Number(sp.jours) : 90;
  const from = new Date(Date.now() - (days - 1) * 86_400_000).toISOString().slice(0, 10);
  const to = new Date().toISOString().slice(0, 10);
  const [ov, sup, unf] = await Promise.all([
    ctx.supabase.rpc("authority_overview", { p_region: region, p_from: from, p_to: to }),
    ctx.supabase.rpc("authority_supply", { p_region: region }),
    ctx.supabase.rpc("authority_searches", { p_region: region, p_from: from, p_to: to, p_unfound: true, p_limit: 10 }),
  ]);
  const o = (ov.data ?? {}) as Overview;
  const s = sup.data as Supply | null;
  const unfound = (unf.data ?? []) as { query: string; searches: number; unfound: number }[];
  const regionName = region ? geo.regions.find((r) => r.id === region)?.name : "Tout le Mali";
  return (
    <div className="space-y-4">
      <form method="get" className="flex flex-wrap items-end gap-2 rounded-2xl border bg-white p-3 print:hidden">
        <label className="text-sm">Région<Select name="region" defaultValue={region ?? ""} className="mt-1 h-10 w-56"><option value="">Tout le Mali</option>{geo.regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></label>
        <label className="text-sm">Période<Select name="jours" defaultValue={String(days)} className="mt-1 h-10 w-40"><option value="30">30 jours</option><option value="90">3 mois</option><option value="365">12 mois</option></Select></label>
        <Button type="submit" size="sm">Afficher</Button>
        <span className="ml-auto"><PrintPdfButton label="Imprimer ou enregistrer en PDF" /></span>
      </form>
      <article className="space-y-4 rounded-2xl border bg-white p-6 print:border-0 print:p-0">
        <header className="border-b pb-3">
          <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-brand-blue"><FileBarChart className="size-4" aria-hidden /> SantéProxi Data · rapport institutionnel</p>
          <h2 className="text-2xl font-bold text-brand-deep">{regionName} · du {new Date(from).toLocaleDateString("fr-FR")} au {new Date(to).toLocaleDateString("fr-FR")}</h2>
          <p className="text-sm text-muted-foreground">Établi le {new Date().toLocaleDateString("fr-FR")} pour {ctx.organisation}. Chiffres anonymes et agrégés ; une valeur de moins de 10 n&apos;est pas affichée (« — »).</p>
        </header>
        <section className="space-y-1">
          <h3 className="flex flex-wrap items-center gap-2 font-bold">1. Offre de soins référencée <DataBadge kind="administratif" /><DataBadge kind="declare" /></h3>
          {s ? (<>
            <table className="w-full text-sm"><thead><tr className="text-left text-xs text-muted-foreground"><th>Région</th><th>Pharmacies inscrites</th><th>Autres officines</th><th>Médecins (tableau{s.register_year ? ` ${s.register_year}` : ""})</th><th>Établissements</th><th>Laboratoires</th></tr></thead>
              <tbody>{s.by_region.map((r) => <tr key={r.region_id} className="border-t"><td className="py-1">{r.region}</td><td>{r.pharmacies}</td><td>{r.pharmacies_listed}</td><td>{r.doctors_register}</td><td>{r.health_facilities}</td><td>{r.labs}</td></tr>)}</tbody></table>
            <p className="text-sm">Analyses avec un prix déclaré par les laboratoires : {s.exams_with_price}.</p>
          </>) : <p className="text-sm text-muted-foreground">Non disponible.</p>}
        </section>
        <section className="space-y-1">
          <h3 className="flex flex-wrap items-center gap-2 font-bold">2. Accès aux médicaments <DataBadge kind="mesure" /><DataBadge kind="estimation" /></h3>
          <p className="text-sm">Recherches de médicaments : <strong>{fmtN(o.searches)}</strong> · sans résultat : <strong>{o.unfound_rate !== null && o.unfound_rate !== undefined ? `${o.unfound_rate} %` : "—"}</strong> · pharmacies vérifiées : <strong>{fmtN(o.pharmacies_verified ?? 0)}</strong> (dont {o.pharmacies_fresh_stock ?? 0} avec stocks à jour).</p>
          {unfound.length > 0 && <p className="text-sm">Médicaments les plus cherchés sans résultat : {unfound.map((u) => `${u.query} (${fmtN(u.unfound)})`).join(", ")}.</p>}
        </section>
        <section className="space-y-1">
          <h3 className="flex flex-wrap items-center gap-2 font-bold">3. Signaux de santé publique <DataBadge kind="mesure" /></h3>
          <p className="text-sm">Questions aux pharmaciens : {fmtN(o.questions)} · signalements de médicaments suspects : {fmtN(o.reports)} · donneurs de sang volontaires inscrits : {fmtN(o.blood_donors)}.</p>
        </section>
        <footer className="border-t pt-3 text-xs text-muted-foreground">Ces chiffres viennent des usages de SantéProxi et des déclarations des établissements : ce sont des signaux d&apos;alerte, pas des statistiques officielles. Ils complètent le système national d&apos;information sanitaire sans le remplacer. Aucune donnée personnelle de santé (dossier santé, suivi Femme, traitements) n&apos;entre dans ce rapport.</footer>
      </article>
    </div>
  );
}
