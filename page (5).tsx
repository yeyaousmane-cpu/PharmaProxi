import Link from "next/link";
import { Pagination, pageRange } from "@/components/pagination";
import { createClient } from "@/lib/supabase/server";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Badge } from "@/components/ui/badge";
import { Input, Select } from "@/components/ui/input";
import { handleReport } from "@/app/actions/admin";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Signalements — administration" };
const REASON: Record<string, string> = { stock_incorrect: "Stock incorrect", prix_incorrect: "Prix incorrect", pharmacie_fermee: "Pharmacie fermée", informations_erronees: "Informations erronées", comportement: "Comportement", produit_suspect: "Produit suspect", autre: "Autre", numero_errone: "Numéro erroné", ne_consulte_plus: "Ne consulte plus ici" };
const ST: Record<string, string> = { open: "Ouvert", in_review: "En cours", resolved: "Résolu", dismissed: "Classé" };

export default async function AdminReports({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const range = pageRange((await searchParams).page);
  const supabase = await createClient();
  const { data, count } = await supabase.from("reports").select("id, reason, description, status, resolution_note, created_at, pharmacy_id, order_id, doctor_id, clinic_id, pharmacies(name), doctors(title, display_name), clinics(name)", { count: "exact" }).order("status").order("created_at", { ascending: false }).range(range.from, range.to);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Signalements</h1>
      <ul className="space-y-3">
        {(data ?? []).map((r) => {
          const ph = Array.isArray(r.pharmacies) ? r.pharmacies[0] : r.pharmacies;
          const doc = Array.isArray(r.doctors) ? r.doctors[0] : r.doctors;
          const cli = Array.isArray(r.clinics) ? r.clinics[0] : r.clinics;
          return (
            <li key={r.id} className="space-y-2 rounded-xl border bg-white p-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={r.reason === "produit_suspect" ? "border-red-200 bg-red-50 text-red-800" : "bg-white"}>{REASON[r.reason]}</Badge>
                <Badge className="bg-white">{ST[r.status]}</Badge>
                {ph && r.pharmacy_id && <Link prefetch={false} href={`/admin/pharmacies/${r.pharmacy_id}`} className="text-primary underline">{ph.name}</Link>}
                {doc && r.doctor_id && <Link prefetch={false} href={`/admin/annuaire/medecins/${r.doctor_id}`} className="text-brand-blue underline">{doc.title} {doc.display_name}</Link>}
                {cli && r.clinic_id && <Link prefetch={false} href={`/admin/annuaire/cliniques/${r.clinic_id}`} className="text-brand-blue underline">{cli.name}</Link>}
                <span className="text-muted-foreground">{formatDateTime(r.created_at)}</span>
              </div>
              {r.description && <p>{r.description}</p>}
              {r.resolution_note && <p className="text-muted-foreground">Résolution : {r.resolution_note}</p>}
              <ActionForm action={handleReport} className="flex flex-col gap-2 sm:flex-row">
                <input type="hidden" name="report_id" value={r.id} />
                <Select name="status" defaultValue={r.status} className="h-9 sm:w-40" aria-label="Statut">{Object.entries(ST).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
                <Input name="note" defaultValue={r.resolution_note ?? ""} placeholder="Note de résolution" className="h-9" aria-label="Note" />
                <SubmitButton size="sm" variant="outline">Mettre à jour</SubmitButton>
              </ActionForm>
            </li>
          );
        })}
        {!data?.length && <li className="rounded-xl border border-dashed bg-white p-8 text-center text-muted-foreground">Aucun signalement.</li>}
      </ul>
      <Pagination basePath="/admin/signalements" params={{}} page={range.page} total={count} />
    </div>
  );
}
