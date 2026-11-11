import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { reviewNurse } from "@/app/actions/v031";
import { NURSE_STATUS } from "@/lib/nurse-space";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Inscriptions d'infirmiers" };
export const dynamic = "force-dynamic";
type Row = { id: string; display_name: string; registration_number: string; specialty: string | null; status: string; status_reason: string | null; register_match: boolean; register_name: string | null; register_year: number | null; phone: string | null; created_at: string; documents: number };

export default async function Comptes() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_nurse_accounts");
  const rows = (data ?? []) as Row[];
  return (
    <div className="space-y-4">
      <p className="text-sm"><Link prefetch={false} href="/admin/infirmiers" className="text-primary underline">← Tableau de l&apos;Ordre et soins à domicile</Link></p>
      <h1 className="text-2xl font-bold">Inscriptions d&apos;infirmiers</h1>
      <p className="max-w-3xl text-sm text-muted-foreground">Vérifiez le numéro d&apos;inscription (comparaison automatique avec le tableau de l&apos;Ordre importé) et les justificatifs déposés avant de valider. La validation publie la fiche, l&apos;infirmier ayant donné son accord à l&apos;inscription. Vous n&apos;avez pas accès aux demandes de soins des patients.</p>
      {error && <p role="alert" className="text-sm text-red-800">{error.message}</p>}
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">Aucune inscription.</p> : (
        <ul className="space-y-2">{rows.map((r) => (
          <li key={r.id} className="rounded-xl border bg-white p-3 text-sm">
            <p className="font-semibold">{r.display_name} · <span dir="ltr">{r.registration_number}</span> · {NURSE_STATUS[r.status]}</p>
            <p className="text-muted-foreground">{r.specialty ?? "—"} · inscrit le {formatDateTime(r.created_at)} · {r.documents} justificatif(s)</p>
            <p className={r.register_match ? "text-emerald-800" : "text-amber-900"}>{r.register_match ? `✓ Numéro trouvé dans le tableau de l'Ordre : ${r.register_name ?? ""} (${r.register_year ?? "?"})` : "Numéro absent du tableau importé : vérifiez les justificatifs ou auprès de l'Ordre."}</p>
            {r.status_reason && <p>Motif : {r.status_reason}</p>}
            <ActionForm action={reviewNurse} className="mt-2 flex flex-wrap items-end gap-2"><input type="hidden" name="id" value={r.id} />
              <label className="text-sm"><span className="sr-only">Motif</span><input name="reason" maxLength={500} placeholder="Motif (obligatoire pour refuser ou suspendre)" className="h-10 w-72 rounded-lg border px-2" /></label>
              {r.status !== "verified" && <button name="decision" value="verified" className="min-h-10 rounded-lg bg-[#052D1E] px-3 font-semibold text-white">Valider</button>}
              {r.status === "pending" && <button name="decision" value="rejected" className="min-h-10 rounded-lg border px-3 font-semibold">Refuser</button>}
              {r.status === "verified" && <button name="decision" value="suspended" className="min-h-10 rounded-lg border px-3 font-semibold">Suspendre</button>}
            </ActionForm>
          </li>))}</ul>
      )}
    </div>
  );
}
