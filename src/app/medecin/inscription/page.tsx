import { redirect } from "next/navigation";
import Link from "next/link";
import { Stethoscope } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getSpecialties, groupByFamily } from "@/lib/directory-server";
import { registerDoctor } from "@/app/actions/directory";
import { DoctorFormFields, DOCTOR_LABELS } from "@/components/directory/doctor-form-fields";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Référencer ma pratique" };

export default async function DoctorSignup() {
  const s = await requireUser("/medecin/inscription");
  if (s.doctor) redirect("/medecin");
  const specialties = groupByFamily(await getSpecialties());
  return (
    <div className="container-page max-w-3xl space-y-5 py-6">
      <header>
        <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-brand-blue"><Stethoscope className="size-4" aria-hidden /> Annuaire médical</p>
        <h1 className="text-2xl font-bold text-brand-deep">Référencer ma pratique</h1>
        <p className="text-muted-foreground">Gratuit. Votre fiche est publiée après vérification de votre inscription à l&apos;Ordre des médecins.</p>
      </header>
      <Alert tone="info" title="Comment ça se passe ?">
        <ol className="list-decimal space-y-1 pl-4">
          <li>Vous remplissez ce formulaire et donnez votre accord de publication.</li>
          <li>Vous déposez vos justificatifs (attestation d&apos;inscription à l&apos;Ordre, diplôme de spécialité, pièce d&apos;identité).</li>
          <li>Vous indiquez vos lieux et jours de consultation ; chaque établissement confirme.</li>
          <li>L&apos;équipe PharmaProxi vérifie, puis publie votre fiche. Vous la modifiez ou la retirez à tout moment.</li>
        </ol>
      </Alert>
      <Card>
        <CardContent className="pt-5">
          <ActionForm action={registerDoctor} className="space-y-6" labels={DOCTOR_LABELS}>
            <DoctorFormFields specialties={specialties} />
            <fieldset className="space-y-2 rounded-lg border border-sky-200 bg-brand-sky p-4">
              <legend className="px-1 text-base font-bold text-brand-blue">Votre accord</legend>
              <label className="flex items-start gap-3 text-sm">
                <input type="checkbox" name="consent" required className="mt-0.5 size-4 shrink-0" />
                <span>
                  J&apos;autorise PharmaProxi à publier dans son annuaire mon nom, mes spécialités, mes langues de consultation, mes lieux et jours de consultation
                  et les numéros professionnels que j&apos;indique. Je peux retirer ma fiche à tout moment depuis mon espace. Aucune notation, aucun classement et aucune publicité ne sont associés à ma fiche.
                </span>
              </label>
              <p className="text-xs text-muted-foreground">La date de votre accord est enregistrée. Voir la <Link prefetch={false} href="/infos/confidentialite" className="underline">politique de confidentialité</Link>.</p>
            </fieldset>
            <SubmitButton className="bg-brand-blue hover:bg-brand-blue/90">Envoyer ma demande de référencement</SubmitButton>
          </ActionForm>
        </CardContent>
      </Card>
    </div>
  );
}
