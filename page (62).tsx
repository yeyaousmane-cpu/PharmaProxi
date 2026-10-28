import { requireUser } from "@/lib/auth";
import { getGeo } from "@/lib/geo";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Alert } from "@/components/ui/alert";
import { PharmacyFormFields, PHARMACY_LABELS } from "@/components/pharmacy/pharmacy-form-fields";
import { registerPharmacy } from "@/app/actions/pharmacy";

export const metadata = { title: "Inscrire ma pharmacie" };

export default async function RegisterPharmacy() {
  await requireUser("/pharmacien/inscription");
  const geo = await getGeo();
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold">Inscrire ma pharmacie</h1>
      <Alert tone="info" className="my-4" title="Comment se déroule la vérification ?">
        <ol className="list-decimal space-y-1 pl-4">
          <li>Vous renseignez les informations de la pharmacie et du pharmacien responsable.</li>
          <li>Vous déposez les justificatifs (autorisation d&apos;ouverture, inscription à l&apos;Ordre, pièce d&apos;identité…).</li>
          <li>Un administrateur habilité les examine. La pharmacie n&apos;est visible du public qu&apos;après validation.</li>
        </ol>
      </Alert>
      <ActionForm action={registerPharmacy} className="space-y-6 rounded-2xl border bg-white p-5" labels={PHARMACY_LABELS}>
        <PharmacyFormFields geo={geo} />
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" required className="mt-1 size-4" />
          <span>Je certifie être habilité(e) à représenter cette pharmacie et que les informations fournies sont exactes.</span>
        </label>
        <SubmitButton size="lg" className="w-full sm:w-auto" pendingText="Enregistrement…">Envoyer la demande d&apos;inscription</SubmitButton>
      </ActionForm>
    </div>
  );
}
