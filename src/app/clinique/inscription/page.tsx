import { Building2 } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getGeo } from "@/lib/geo";
import { registerClinic } from "@/app/actions/directory";
import { ClinicFormFields, CLINIC_LABELS } from "@/components/directory/clinic-form-fields";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Inscrire un établissement" };

export default async function ClinicSignup() {
  await requireUser("/clinique/inscription");
  const geo = await getGeo();
  return (
    <div className="container-page max-w-3xl space-y-5 py-6">
      <header>
        <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-brand-blue"><Building2 className="size-4" aria-hidden /> Annuaire médical</p>
        <h1 className="text-2xl font-bold text-brand-deep">Inscrire une clinique ou un établissement</h1>
        <p className="text-muted-foreground">Gratuit. L&apos;établissement est publié après vérification de son autorisation d&apos;ouverture.</p>
      </header>
      <Alert tone="info" title="Après l'inscription">
        Déposez vos justificatifs, puis invitez les médecins qui consultent chez vous (ou acceptez leurs demandes) avec leurs jours de consultation.
        Présentation neutre : aucune publicité, aucun classement.
      </Alert>
      <Card>
        <CardContent className="pt-5">
          <ActionForm action={registerClinic} className="space-y-6" labels={CLINIC_LABELS}>
            <ClinicFormFields geo={geo} />
            <SubmitButton className="bg-brand-blue hover:bg-brand-blue/90">Envoyer la demande d&apos;inscription</SubmitButton>
          </ActionForm>
        </CardContent>
      </Card>
    </div>
  );
}
