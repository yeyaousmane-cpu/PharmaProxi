import { createClient } from "@/lib/supabase/server";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { handleDispute } from "@/app/actions/v026";
import { bamako } from "@/lib/compliance";
import Link from "next/link";

const STATUS: [string, string][] = [["nouvelle", "Nouvelle réclamation"], ["en_analyse", "En cours d'analyse"], ["preuve_retrouvee", "Preuve retrouvée"], ["preuve_insuffisante", "Preuve insuffisante"],
  ["traitement_suspendu", "Traitement suspendu"], ["resolue", "Résolue"], ["transmise", "Transmise au responsable compétent"]];
type D = { id: string; reference: string; user_id: string; purpose_code: string | null; message: string; status: string; shared_with_recipients: string | null; corrective_actions: string | null; report: string | null; created_at: string };

export default async function Disputes() {
  const supabase = await createClient();
  const [{ data }, { data: canEdit }] = await Promise.all([supabase.from("consent_disputes").select("*").order("created_at", { ascending: false }).limit(200), supabase.rpc("can_edit_compliance")]);
  const rows = (data as D[] | null) ?? [];
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Procédure : 1. enregistrer · 2. identifier le traitement · 3. retrouver la version exacte du texte · 4. retrouver l&apos;action positive · 5. vérifier date et heure · 6. vérifier la cohérence de l&apos;historique · 7. vérifier les retraits · 8. vérifier les communications à des destinataires · 9. documenter les actions correctives · 10. rédiger le rapport. Si aucune preuve fiable n&apos;existe, indiquez « Preuve insuffisante » : la création d&apos;un compte ne vaut jamais consentement.</p>
      {rows.length === 0 ? <p className="rounded-xl border bg-white p-4 text-muted-foreground">Aucune réclamation.</p> : rows.map((d) => (
        <section key={d.id} className="space-y-2 rounded-2xl border bg-white p-4 text-sm">
          <p className="font-semibold"><span className="font-mono">{d.reference}</span> · {bamako(d.created_at)} · finalité : {d.purpose_code ?? "non précisée"} · <Link prefetch={false} href={`/conformite/dossier/${d.user_id}`} className="text-[#068132] underline">dossier de preuve</Link></p>
          <p className="rounded-lg bg-muted/60 p-2">{d.message}</p>
          {canEdit ? (
            <ActionForm action={handleDispute} className="grid gap-2 sm:grid-cols-2">
              <input type="hidden" name="id" value={d.id} />
              <label>Statut<select name="status" defaultValue={d.status} className="mt-1 h-10 w-full rounded-md border px-2">{STATUS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
              <label>Données communiquées à des destinataires<input name="shared" defaultValue={d.shared_with_recipients ?? ""} maxLength={1000} className="mt-1 h-10 w-full rounded-md border px-2" /></label>
              <label className="sm:col-span-2">Actions correctives<textarea name="actions" defaultValue={d.corrective_actions ?? ""} maxLength={2000} rows={2} className="mt-1 w-full rounded-md border p-2" /></label>
              <label className="sm:col-span-2">Rapport de traitement (visible par la personne)<textarea name="report" defaultValue={d.report ?? ""} maxLength={5000} rows={3} className="mt-1 w-full rounded-md border p-2" /></label>
              <div><SubmitButton size="sm">Enregistrer</SubmitButton></div>
            </ActionForm>
          ) : <p>Statut : <strong>{STATUS.find(([v]) => v === d.status)?.[1]}</strong>{d.report && ` · Rapport : ${d.report}`}</p>}
        </section>))}
    </div>
  );
}
