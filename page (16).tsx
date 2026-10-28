import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Field, Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { signIn } from "@/app/actions/auth";

export const metadata = { title: "Connexion" };

export default async function Page({ searchParams }: { searchParams: Promise<{ suite?: string; erreur?: string }> }) {
  const sp = await searchParams;
  return (
    <AuthShell title="Connexion" subtitle="Accédez à vos réservations, à votre pharmacie ou à vos livraisons.">
      {sp.erreur === "lien" && <Alert tone="error" title="Lien invalide ou expiré" className="mb-4" />}
      <ActionForm action={signIn} className="space-y-4" labels={{ email: "E-mail", password: "Mot de passe" }}>
        <input type="hidden" name="suite" value={sp.suite ?? "/"} />
        <Field label="Adresse e-mail" htmlFor="email" required>
          <Input id="email" name="email" type="email" autoComplete="email" required inputMode="email" />
        </Field>
        <Field label="Mot de passe" htmlFor="password" required>
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
        </Field>
        <SubmitButton className="w-full" pendingText="Connexion…">Se connecter</SubmitButton>
      </ActionForm>
      <div className="mt-4 flex flex-col items-center gap-2 text-sm">
        <Link prefetch={false} href="/mot-de-passe-oublie" className="text-primary hover:underline">Mot de passe oublié ?</Link>
        <p>
          Pas encore de compte ?{" "}
          <Link prefetch={false} href={`/inscription${sp.suite ? `?suite=${encodeURIComponent(sp.suite)}` : ""}`} className="font-semibold text-primary hover:underline">Créer un compte</Link>
        </p>
      </div>
    </AuthShell>
  );
}
