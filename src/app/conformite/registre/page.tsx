import { Fragment } from "react";
import { createClient } from "@/lib/supabase/server";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { saveRegistry } from "@/app/actions/v026";

type R = { code: string; purpose: string; data_categories: string; data_subjects: string; recipients: string; legal_basis: string; retention: string; security_measures: string; transfers: string;
  apdp_formalities: string; legal_status: string; validated_by_name: string | null; validated_at: string | null };
type T = { name: string; role: string; data_categories: string; country: string; safeguards: string; contract_status: string };
const BASIS: [string, string][] = [["consentement", "Consentement"], ["contrat", "Exécution du service (contrat)"], ["obligation_legale", "Obligation légale"], ["interet_vital", "Intérêt vital"],
  ["interet_legitime", "Intérêt légitime"], ["mission_interet_public", "Mission d'intérêt public"], ["a_determiner", "À déterminer"]];
const STATUS: Record<string, [string, string]> = { a_valider: ["À valider", "bg-amber-100 text-amber-900"], valide: ["Validé", "bg-emerald-100 text-emerald-900"], a_revoir: ["À revoir", "bg-red-100 text-red-900"] };
const FIELDS: [keyof R, string][] = [["purpose", "Finalité"], ["data_categories", "Données"], ["data_subjects", "Personnes concernées"], ["recipients", "Destinataires"], ["retention", "Durée de conservation"],
  ["security_measures", "Mesures de sécurité"], ["transfers", "Transferts internationaux"], ["apdp_formalities", "Formalités APDP"]];

export default async function Registry() {
  const supabase = await createClient();
  const [{ data }, { data: rec }, { data: canEdit }] = await Promise.all([
    supabase.from("data_processing_registry").select("*").order("sort"), supabase.from("third_party_recipients").select("*").order("sort"), supabase.rpc("can_edit_compliance")]);
  const rows = (data as R[] | null) ?? [];
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Registre préparatoire : il documente les traitements mais ne vaut pas conformité. Chaque ligne doit être validée, avec le nom et la qualité de la personne, par un juriste habilité.</p>
      {rows.map((r) => {
        const [l, tone] = STATUS[r.legal_status] ?? STATUS.a_valider;
        return (
          <details key={r.code} className="rounded-2xl border bg-white p-4">
            <summary className="cursor-pointer font-semibold">{r.purpose} <span className={`ms-2 rounded-full px-2 py-0.5 text-xs ${tone}`}>{l}</span>
              <span className="ms-2 text-xs font-normal text-muted-foreground">{BASIS.find(([v]) => v === r.legal_basis)?.[1]}{r.validated_by_name ? ` · validé par ${r.validated_by_name} le ${r.validated_at}` : ""}</span></summary>
            {canEdit ? (
              <ActionForm action={saveRegistry} className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                <input type="hidden" name="code" value={r.code} />
                {FIELDS.map(([k, label]) => <label key={k}>{label}<textarea name={k} defaultValue={String(r[k] ?? "")} rows={2} maxLength={600} className="mt-1 w-full rounded-md border p-2" /></label>)}
                <label>Base juridique<select name="legal_basis" defaultValue={r.legal_basis} className="mt-1 h-10 w-full rounded-md border px-2">{BASIS.map(([v, b]) => <option key={v} value={v}>{b}</option>)}</select></label>
                <label>Validation juridique<select name="legal_status" defaultValue={r.legal_status} className="mt-1 h-10 w-full rounded-md border px-2"><option value="a_valider">À valider</option><option value="valide">Validé</option><option value="a_revoir">À revoir</option></select></label>
                <label className="sm:col-span-2">Nom et qualité de la personne qui valide<input name="validated_by_name" defaultValue={r.validated_by_name ?? ""} maxLength={200} className="mt-1 h-10 w-full rounded-md border px-2" /></label>
                <div><SubmitButton size="sm">Enregistrer</SubmitButton></div>
              </ActionForm>
            ) : (
              <dl className="mt-3 grid gap-1 text-sm sm:grid-cols-[12rem_1fr]">{FIELDS.map(([k, label]) => <Fragment key={k}><dt className="font-semibold">{label}</dt><dd>{String(r[k] ?? "")}</dd></Fragment>)}</dl>
            )}
          </details>);
      })}
      <section className="space-y-2">
        <h2 className="text-lg font-bold">Destinataires et sous-traitants</h2>
        <div className="overflow-x-auto rounded-2xl border bg-white"><table className="w-full text-start text-sm">
          <thead><tr className="border-b"><th className="p-2">Prestataire</th><th className="p-2">Rôle</th><th className="p-2">Données</th><th className="p-2">Pays</th><th className="p-2">Garanties</th><th className="p-2">Contrat</th></tr></thead>
          <tbody>{((rec as T[] | null) ?? []).map((t) => <tr key={t.name} className="border-b align-top"><td className="p-2 font-semibold">{t.name}</td><td className="p-2">{t.role}</td><td className="p-2">{t.data_categories}</td><td className="p-2">{t.country}</td><td className="p-2">{t.safeguards}</td><td className="p-2">{t.contract_status === "a_verifier" ? "À vérifier" : t.contract_status}</td></tr>)}</tbody>
        </table></div>
      </section>
    </div>
  );
}
