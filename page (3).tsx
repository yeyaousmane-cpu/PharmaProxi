import Link from "next/link";
import { Download } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getGeo } from "@/lib/geo";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { runMaintenance } from "@/app/actions/admin";
import { ORDER_STATUS_LABEL, type OrderStatus } from "@/lib/order-status";
import { humanizeError } from "@/lib/errors";
import { cn } from "@/lib/utils";

export const metadata = { title: "Administration" };

type Stats = {
  pharmacies_registered: number; pharmacies_verified: number; pharmacies_pending: number; pharmacies_active: number; catalog_items: number;
  catalog_pending: number; inventory_lines: number; inventory_fresh: number; searches: number; searches_no_result: number;
  top_no_result_queries: { query: string; n: number }[]; orders_by_status: Record<string, number>; orders_total: number;
  pharmacies_by_region: { region: string; verified: number; registered: number }[]; open_reports: number; couriers_verified: number; couriers_pending: number;
};

type DirStats = {
  doctors_verified: number; doctors_published: number; doctors_pending: number; doctors_to_confirm: number; clinics_verified: number; clinics_pending: number;
  sites_published: number; searches: number; searches_no_result: number; top_no_result_queries: { query: string; n: number }[]; open_reports: number;
};

function K({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-sm text-muted-foreground">{label}</p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export default async function AdminHome({ searchParams }: { searchParams: Promise<{ du?: string; au?: string; region?: string }> }) {
  const sp = await searchParams;
  const to = sp.au ? new Date(`${sp.au}T23:59:59Z`) : new Date();
  const from = sp.du ? new Date(`${sp.du}T00:00:00Z`) : new Date(to.getTime() - 30 * 86400_000);
  const region = sp.region && /^[0-9a-f-]{36}$/i.test(sp.region) ? sp.region : null;
  const supabase = await createClient();
  const [{ data, error }, geo, { data: lastRun }, { data: issues }, { data: dir }] = await Promise.all([
    supabase.rpc("admin_stats", { p_from: from.toISOString(), p_to: to.toISOString(), p_region: region }),
    getGeo(),
    supabase.from("maintenance_runs").select("ran_at").order("ran_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.rpc("admin_integrity_report"),
    supabase.rpc("admin_directory_stats", { p_from: from.toISOString(), p_to: to.toISOString() }),
  ]);
  const d = dir as DirStats | null;
  const critical = ((issues as { severity: string }[] | null) ?? []).filter((i) => i.severity === "critique").length;
  const maintenanceAge = lastRun ? (Date.now() - new Date(lastRun.ran_at).getTime()) / 60000 : null;
  if (error) return <Alert tone="error" title={humanizeError(error)} />;
  const s = data as Stats;
  const qs = new URLSearchParams({ du: from.toISOString().slice(0, 10), au: to.toISOString().slice(0, 10), ...(region ? { region } : {}) });
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <h1 className="text-2xl font-bold">Vue générale</h1>
        <form method="get" className="grid grid-cols-2 gap-2 sm:flex sm:items-end">
          <div><Label htmlFor="du">Du</Label><Input id="du" name="du" type="date" defaultValue={from.toISOString().slice(0, 10)} className="h-9" /></div>
          <div><Label htmlFor="au">Au</Label><Input id="au" name="au" type="date" defaultValue={to.toISOString().slice(0, 10)} className="h-9" /></div>
          <div className="col-span-2"><Label htmlFor="region">Région</Label>
            <Select id="region" name="region" defaultValue={region ?? ""} className="h-9"><option value="">Tout le Mali</option>{geo.regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></div>
          <Button size="sm" type="submit">Appliquer</Button>
        </form>
      </div>
      {(maintenanceAge === null || maintenanceAge > 60) && (
        <Alert tone="warning" title="La maintenance planifiée ne s'exécute pas">
          Les demandes sans réponse et les réservations non retirées ne sont expirées que par cette tâche.
          {maintenanceAge === null ? " Elle n'a jamais tourné." : ` Dernière exécution il y a ${Math.round(maintenanceAge)} min.`} Configurez pg_cron (README §4) ou lancez-la ci-dessous.
        </Alert>
      )}
      {critical > 0 && (
        <Alert tone="error" title={`${critical} incohérence(s) critique(s) détectée(s)`}>
          <Link prefetch={false} href="/admin/integrite" className="underline">Voir le contrôle d&apos;intégrité</Link>
        </Alert>
      )}
      <p className="text-xs text-muted-foreground">Indicateurs calculés en temps réel sur les données de la base (hors données de démonstration pour les pharmacies).</p>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <K label="Pharmacies inscrites" value={s.pharmacies_registered} />
        <K label="Pharmacies vérifiées" value={s.pharmacies_verified} hint={`${s.pharmacies_pending} en attente`} />
        <K label="Pharmacies actives" value={s.pharmacies_active} hint="stock actualisé sur 7 jours" />
        <K label="Produits au catalogue" value={s.catalog_items} hint={`${s.catalog_pending} fiche(s) à vérifier`} />
        <K label="Lignes de stock" value={s.inventory_lines} hint={`${s.inventory_fresh} récemment actualisées`} />
        <K label="Recherches (période)" value={s.searches} />
        <K label="Recherches sans résultat" value={s.searches_no_result} />
        <K label="Commandes (période)" value={s.orders_total} hint={`${s.open_reports} signalement(s) ouvert(s)`} />
      </section>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card><CardHeader><CardTitle>Commandes par statut</CardTitle></CardHeader>
          <CardContent>{Object.keys(s.orders_by_status).length === 0 ? <p className="text-sm text-muted-foreground">Aucune commande sur la période.</p> : (
            <ul className="space-y-1 text-sm">{Object.entries(s.orders_by_status).map(([k, v]) => <li key={k} className="flex justify-between"><span>{ORDER_STATUS_LABEL[k as OrderStatus]}</span><strong>{v}</strong></li>)}</ul>)}
          </CardContent></Card>
        <Card><CardHeader><CardTitle>Recherches sans résultat</CardTitle></CardHeader>
          <CardContent>{!s.top_no_result_queries.length ? <p className="text-sm text-muted-foreground">Aucune.</p> : (
            <ul className="space-y-1 text-sm">{s.top_no_result_queries.map((q) => <li key={q.query} className="flex justify-between"><span>{q.query}</span><strong>{q.n}</strong></li>)}</ul>)}
            <p className="mt-2 text-xs text-muted-foreground">Utile pour cibler les pharmacies et produits à référencer.</p>
          </CardContent></Card>
        <Card><CardHeader><CardTitle>Pharmacies par région</CardTitle></CardHeader>
          <CardContent><ul className="max-h-72 space-y-1 overflow-auto text-sm">{s.pharmacies_by_region.map((r) => <li key={r.region} className="flex justify-between"><span>{r.region}</span><span><strong>{r.verified}</strong> / {r.registered}</span></li>)}</ul>
            <p className="mt-2 text-xs text-muted-foreground">vérifiées / inscrites</p></CardContent></Card>
      </div>
      {d && (
        <section aria-labelledby="dir-stats" className="space-y-3">
          <div className="flex items-end justify-between gap-2">
            <h2 id="dir-stats" className="text-lg font-bold text-brand-blue">Annuaire médical</h2>
            <Link prefetch={false} href="/admin/annuaire" className="text-sm text-primary underline">Gérer l&apos;annuaire</Link>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <K label="Médecins publiés" value={d.doctors_published} hint={`${d.doctors_verified} vérifiés · ${d.doctors_pending} en attente`} />
            <K label="Établissements vérifiés" value={d.clinics_verified} hint={`${d.clinics_pending} en attente`} />
            <K label="Lieux de consultation publiés" value={d.sites_published} hint={`${d.doctors_to_confirm} fiche(s) à confirmer`} />
            <K label="Recherches annuaire (période)" value={d.searches} hint={`${d.searches_no_result} sans résultat · ${d.open_reports} signalement(s) ouvert(s)`} />
          </div>
          {d.top_no_result_queries.length > 0 && (
            <Card><CardHeader><CardTitle>Spécialistes recherchés sans résultat</CardTitle></CardHeader>
              <CardContent><ul className="grid gap-1 text-sm sm:grid-cols-2">{d.top_no_result_queries.map((q) => <li key={q.query} className="flex justify-between gap-2"><span>{q.query}</span><strong>{q.n}</strong></li>)}</ul>
                <p className="mt-2 text-xs text-muted-foreground">Besoins non couverts : médecins et établissements à démarcher en priorité.</p></CardContent></Card>
          )}
        </section>
      )}
      <div className="flex flex-wrap gap-3">
        <a href={`/api/admin/rapport?${qs}`} className={cn(buttonVariants({ variant: "outline" }))}><Download aria-hidden /> Exporter le rapport (CSV, non sensible)</a>
        <ActionForm action={runMaintenance}><SubmitButton variant="secondary">Lancer la maintenance maintenant</SubmitButton></ActionForm>
      </div>
    </div>
  );
}
