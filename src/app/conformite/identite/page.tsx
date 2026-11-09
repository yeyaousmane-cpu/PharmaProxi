import { createClient } from "@/lib/supabase/server";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { savePrivacyIdentity } from "@/app/actions/v026";

const FIELDS: [string, string][] = [["privacy_controller_name", "Responsable du traitement (dénomination juridique)"], ["privacy_controller_registration", "Immatriculation (RCCM)"], ["privacy_controller_address", "Adresse officielle"],
  ["privacy_contact_email", "Point de contact confidentialité : e-mail"], ["privacy_contact_phone", "Point de contact confidentialité : téléphone"], ["privacy_dpo_name", "Correspondant à la protection des données (si désigné)"]];

export default async function Identity() {
  const supabase = await createClient();
  const [{ data }, { data: canEdit }] = await Promise.all([supabase.rpc("privacy_identity"), supabase.rpc("can_edit_compliance")]);
  const v = (data as Record<string, string> | null) ?? {};
  const missing = FIELDS.filter(([k]) => !v[k]).length;
  return (
    <div className="space-y-3">
      <p className={`rounded-xl p-3 text-sm ${missing ? "bg-amber-50 text-amber-950" : "bg-emerald-50 text-emerald-900"}`}>{missing ? `${missing} information(s) à compléter : elles apparaissent « À compléter » sur la page publique « Votre santé, vos données ».` : "Toutes les informations sont renseignées."}</p>
      <ActionForm action={savePrivacyIdentity} className="grid gap-2 rounded-2xl border bg-white p-4 text-sm sm:grid-cols-2">
        {FIELDS.map(([k, l]) => <label key={k}>{l}<input name={k} defaultValue={v[k] ?? ""} maxLength={300} disabled={!canEdit} className="mt-1 h-10 w-full rounded-md border px-2" /></label>)}
        {canEdit && <div><SubmitButton size="sm">Enregistrer</SubmitButton></div>}
      </ActionForm>
      <p className="text-xs text-muted-foreground">N&apos;inscrivez que des informations exactes et vérifiées (statuts de la société, registre du commerce).</p>
    </div>
  );
}
