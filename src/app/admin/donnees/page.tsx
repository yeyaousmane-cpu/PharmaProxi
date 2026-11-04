import { createClient } from "@/lib/supabase/server";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { closeDataReport } from "@/app/actions/authorities";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Validation des données — administration" };
const VERDICT: Record<string, string> = { confirme: "Fiche exacte", a_corriger: "À corriger", ferme: "Structure fermée", inconnu: "Inconnue des registres" };

export default async function AdminData() {
  const supabase = await createClient();
  const { data } = await supabase.from("data_validation_reports").select("*").order("status").order("created_at", { ascending: false }).limit(200);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Validation des données par les institutions</h1>
      <p className="text-sm text-muted-foreground">Avis envoyés depuis SantéProxi Data. Corrigez la fiche concernée (recherchez l&apos;identifiant dans l&apos;annuaire), puis marquez l&apos;avis comme traité.</p>
      {(data ?? []).length === 0 && <p className="rounded-xl border bg-white p-4 text-sm text-muted-foreground">Aucun avis reçu.</p>}
      <ul className="space-y-2">{(data ?? []).map((r) => (
        <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-white p-3 text-sm">
          <span><strong>{r.public_code}</strong> · {VERDICT[r.verdict]} · {r.organisation ?? "—"} · {formatDateTime(r.created_at)}{r.comment ? <span className="block text-muted-foreground">{r.comment}</span> : null}</span>
          {r.status === "nouveau" ? <ActionForm action={closeDataReport}><input type="hidden" name="id" value={r.id} /><SubmitButton size="sm" variant="outline">Marquer traité</SubmitButton></ActionForm> : <em className="text-xs text-muted-foreground">traité</em>}
        </li>))}</ul>
    </div>
  );
}
