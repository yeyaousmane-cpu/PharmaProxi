import { requireUser } from "@/lib/auth";
import { AuthShell } from "@/components/auth-shell";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Field, Input } from "@/components/ui/input";
import { updatePassword } from "@/app/actions/auth";

export const metadata = { title: "Mot de passe" };

export default async function Page() {
  await requireUser("/compte/mot-de-passe");
  return (
    <AuthShell title="Nouveau mot de passe">
      <ActionForm action={updatePassword} className="space-y-4">
        <Field label="Nouveau mot de passe" htmlFor="password" required hint="8 caractères minimum"><Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required /></Field>
        <Field label="Confirmation" htmlFor="confirm" required><Input id="confirm" name="confirm" type="password" autoComplete="new-password" required /></Field>
        <SubmitButton className="w-full">Mettre à jour</SubmitButton>
      </ActionForm>
    </AuthShell>
  );
}
