import { FileText } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Field, Select, Textarea } from "@/components/ui/input";
import { REVIEW_STATUS } from "@/lib/directory";
import { formatDateTime } from "@/lib/format";
import type { ActionState } from "@/lib/errors";

type Doc = { id: string; doc_type: string; file_name: string | null; created_at: string; url?: string | null };
type Hist = { id: string; decision: string; reason: string | null; created_at: string };

export function ReviewDocuments({ docs, labels }: { docs: Doc[]; labels: Record<string, string> }) {
  return (
    <Card><CardHeader><CardTitle>Justificatifs</CardTitle></CardHeader>
      <CardContent>
        {!docs.length ? <Alert tone="warning" title="Aucun justificatif déposé : validation impossible." /> : (
          <ul className="space-y-2 text-sm">
            {docs.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-2"><FileText className="size-4" aria-hidden />
                {d.url ? <a href={d.url} target="_blank" rel="noopener noreferrer" className="text-primary underline">{labels[d.doc_type] ?? d.doc_type}</a> : labels[d.doc_type] ?? d.doc_type}
                <span className="text-muted-foreground">({d.file_name}, {formatDateTime(d.created_at)})</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-muted-foreground">Liens temporaires (5 minutes). Ne téléchargez pas ces documents sur des appareils non sécurisés.</p>
      </CardContent>
    </Card>
  );
}

/** Décision administrative avec liste de contrôle en 5 points (obligatoire pour valider). */
export function ReviewDecision({ action, idName, id, status, checks, audience }: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>; idName: string; id: string; status: string; checks: [string, string][]; audience: string;
}) {
  const decisions = status === "pending" ? ["verified", "rejected"] : status === "verified" ? ["suspended"] : status === "suspended" ? ["verified", "rejected"] : [];
  return (
    <Card className="border-2 border-brand-blue/30"><CardHeader><CardTitle>Décision</CardTitle></CardHeader>
      <CardContent>
        {decisions.length === 0 ? <p className="text-sm text-muted-foreground">Aucune décision possible dans ce statut (une nouvelle soumission est attendue).</p> : (
          <ActionForm action={action} className="space-y-3">
            <input type="hidden" name={idName} value={id} />
            {status === "pending" && (
              <fieldset className="space-y-2 text-sm"><legend className="mb-1 font-medium">Points de contrôle (obligatoires pour valider)</legend>
                {checks.map(([k, label]) => <label key={k} className="flex items-start gap-2"><input type="checkbox" name={`check_${k}`} className="mt-0.5 size-4" />{label}</label>)}
              </fieldset>
            )}
            <Field label="Décision" htmlFor="decision" required>
              <Select id="decision" name="decision" required>
                {decisions.map((d) => <option key={d} value={d}>{d === "verified" ? (status === "suspended" ? "Réactiver" : "Valider et publier") : d === "rejected" ? "Refuser" : "Suspendre"}</option>)}
              </Select>
            </Field>
            <Field label="Motif / commentaire" htmlFor="reason" hint={`Obligatoire pour un refus ou une suspension. Visible par ${audience}.`}>
              <Textarea id="reason" name="reason" rows={3} maxLength={1000} />
            </Field>
            <SubmitButton confirm="Enregistrer cette décision ? Elle sera journalisée et notifiée.">Enregistrer la décision</SubmitButton>
          </ActionForm>
        )}
      </CardContent>
    </Card>
  );
}

export function ReviewHistory({ items }: { items: Hist[] }) {
  return (
    <Card><CardHeader><CardTitle>Historique</CardTitle></CardHeader>
      <CardContent><ul className="space-y-2 text-sm">{items.map((h) => (
        <li key={h.id}><strong>{REVIEW_STATUS[h.decision]?.label ?? h.decision}</strong> · {formatDateTime(h.created_at)}{h.reason ? <span className="block text-muted-foreground">{h.reason}</span> : null}</li>
      ))}</ul></CardContent>
    </Card>
  );
}

export function InfoList({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="space-y-1 text-sm">
      {rows.map(([k, v]) => <div key={k} className="grid grid-cols-[180px_1fr] gap-2 border-b py-1"><dt className="text-muted-foreground">{k}</dt><dd className="min-w-0 break-words">{v || "—"}</dd></div>)}
    </dl>
  );
}
