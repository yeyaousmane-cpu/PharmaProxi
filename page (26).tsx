import { AuthShell } from "@/components/auth-shell";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Field, Input } from "@/components/ui/input";
import { requestPasswordReset } from "@/app/actions/auth";

export const metadata = { title: "Mot de passe oublié" };

export default function Page() {
  return (
    <AuthShell title="Mot de passe oublié" subtitle="Recevez un lien de réinitialisation par e-mail.">
      <ActionForm action={requestPasswordReset} className="space-y-4">
        <Field label="Adresse e-mail" htmlFor="email" required>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </Field>
        <SubmitButton className="w-full">Envoyer le lien</SubmitButton>
      </ActionForm>
    </AuthShell>
  );
}
