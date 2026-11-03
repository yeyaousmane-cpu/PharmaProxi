import { dossierContext } from "@/lib/dossier/server";
import { DossierGate, DossierShell } from "@/components/dossier/shell";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Field, Input } from "@/components/ui/input";
import { setDossierPin } from "@/app/actions/dossier";

export const metadata = { title: "Code du dossier" };
export const dynamic = "force-dynamic";

export default async function Code() {
  const ctx = await dossierContext(undefined, "/ma-sante/dossier/code");
  if (ctx.locked) return <DossierGate status={ctx.status} path="/ma-sante/dossier/code" />;
  const { person, persons, status } = ctx;
  return (
    <DossierShell persons={persons} person={person} status={status} current="/code">
      <section className="max-w-lg space-y-3 rounded-2xl border bg-white p-4 sm:p-5">
        <h2 className="text-lg font-bold text-brand-deep">{status.has_pin ? "Changer mon code" : "Protéger mon dossier par un code"}</h2>
        <p className="text-sm text-muted-foreground">Si quelqu&apos;un prend votre téléphone, il ne pourra pas lire votre dossier. Le dossier se verrouille tout seul après 30 minutes sans activité. Après 5 erreurs, il est bloqué 15 minutes. Le code ne peut pas être récupéré : choisissez-en un dont vous vous souviendrez, différent de celui de votre téléphone.</p>
        <ActionForm action={setDossierPin} className="grid gap-3 sm:grid-cols-2" resetOnSuccess labels={{ pin: "Code", pin2: "Confirmation" }}>
          <Field label="Code (4 à 6 chiffres)" htmlFor="pin"><Input id="pin" name="pin" type="password" inputMode="numeric" autoComplete="new-password" pattern="[0-9]{4,6}" maxLength={6} required /></Field>
          <Field label="Confirmez le code" htmlFor="pin2"><Input id="pin2" name="pin2" type="password" inputMode="numeric" autoComplete="new-password" pattern="[0-9]{4,6}" maxLength={6} required /></Field>
          <SubmitButton size="sm" className="w-fit">Enregistrer le code</SubmitButton>
        </ActionForm>
        {status.has_pin && (
          <ActionForm action={setDossierPin}>
            <input type="hidden" name="remove" value="1" />
            <SubmitButton size="sm" variant="outline" confirm="Retirer le code ? Toute personne ayant votre téléphone pourra ouvrir le dossier.">Retirer le code</SubmitButton>
          </ActionForm>
        )}
      </section>
    </DossierShell>
  );
}
