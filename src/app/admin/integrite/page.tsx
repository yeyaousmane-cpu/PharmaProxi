import { createClient } from "@/lib/supabase/server";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { repairReservations, runMaintenance } from "@/app/actions/admin";
import { formatDateTime } from "@/lib/format";
import { humanizeError } from "@/lib/errors";

export const metadata = { title: "Intégrité — administration" };

const LABELS: Record<string, string> = {
  reserved_mismatch: "Quantité réservée différente des réservations actives",
  active_reservation_on_closed_order: "Réservation encore active sur une commande clôturée",
  confirmed_order_without_reservation: "Commande confirmée sans réservation",
  order_total_mismatch: "Total de commande incohérent",
  assignment_to_unverified_courier: "Livraison affectée à un livreur non habilité",
  overdue_not_expired: "Délai dépassé sans expiration (maintenance arrêtée ?)",
  verified_without_documents: "Pharmacie vérifiée sans justificatif",
};

type Issue = { check_name: string; severity: string; entity_id: string; details: string };
type Run = { id: number; ran_at: string; expired: number; purged: Record<string, number>; critical_issues: number };

export default async function Integrity() {
  const supabase = await createClient();
  const [{ data, error }, { data: runs }] = await Promise.all([
    supabase.rpc("admin_integrity_report"),
    supabase.from("maintenance_runs").select("*").order("ran_at", { ascending: false }).limit(20),
  ]);
  if (error) return <Alert tone="error" title={humanizeError(error)} />;
  const issues = (data as Issue[]) ?? [];
  const critical = issues.filter((i) => i.severity === "critique");
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Contrôle d&apos;intégrité</h1>
      <p className="max-w-3xl text-sm text-muted-foreground">
        Vérifie en direct la cohérence entre stocks, réservations, commandes et livraisons. Les règles de la base empêchent ces situations ;
        elles ne peuvent apparaître qu&apos;après une intervention manuelle en base ou une panne. La maintenance planifiée compte les incohérences à chaque passage.
      </p>
      <Card>
        <CardHeader>
          <CardTitle>{issues.length === 0 ? "Aucune anomalie" : `${critical.length} critique(s), ${issues.length - critical.length} avertissement(s)`}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {issues.length === 0 ? <Alert tone="success" title="Stocks, réservations et commandes sont cohérents." /> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead><tr className="border-b text-left text-muted-foreground"><th className="py-1">Gravité</th><th>Contrôle</th><th>Détail</th><th>Objet</th></tr></thead>
                <tbody>{issues.map((i, k) => (
                  <tr key={k} className="border-b align-top">
                    <td className="py-2"><Badge className={i.severity === "critique" ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-900"}>{i.severity}</Badge></td>
                    <td className="py-2">{LABELS[i.check_name] ?? i.check_name}</td>
                    <td className="py-2">{i.details}</td>
                    <td className="py-2 font-mono text-xs">{i.entity_id.slice(0, 8)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <ActionForm action={runMaintenance}><SubmitButton variant="secondary">Lancer la maintenance</SubmitButton></ActionForm>
            {critical.some((i) => ["reserved_mismatch", "active_reservation_on_closed_order"].includes(i.check_name)) && (
              <ActionForm action={repairReservations}>
                <SubmitButton variant="destructive" confirm="Recalculer les réservations à partir des commandes ? L'opération est journalisée.">Réparer les réservations</SubmitButton>
              </ActionForm>
            )}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Dernières maintenances</CardTitle><CardDescription>Conservées 30 jours.</CardDescription></CardHeader>
        <CardContent>
          {!runs?.length ? <Alert tone="warning" title="La maintenance n'a encore jamais été exécutée. Configurez pg_cron (README §4)." /> : (
            <ul className="divide-y text-sm">{(runs as Run[]).map((r) => (
              <li key={r.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span>{formatDateTime(r.ran_at)}</span>
                <span className="text-muted-foreground">{r.expired} expirée(s) · {Object.values(r.purged).reduce((a, b) => a + b, 0)} ligne(s) purgée(s) · {r.critical_issues} incohérence(s)</span>
              </li>
            ))}</ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
