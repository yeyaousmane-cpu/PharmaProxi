import Link from "next/link";
import { AudioGuide } from "@/components/audio/audio-guide";
import { AuthShell } from "@/components/auth-shell";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Field, Input } from "@/components/ui/input";
import { signUp } from "@/app/actions/auth";

export const metadata = { title: "Créer un compte" };

export default async function Page({ searchParams }: { searchParams: Promise<{ suite?: string }> }) {
  const sp = await searchParams;
  return (
    <AuthShell title="Créer un compte" subtitle="Gratuit. Aucune donnée médicale n'est demandée.">
      <AudioGuide target="inscription" className="mb-4" />
      <ActionForm action={signUp} className="space-y-4" labels={{ full_name: "Nom", email: "E-mail", phone: "Téléphone", password: "Mot de passe", accept: "Conditions" }}>
        <input type="hidden" name="suite" value={sp.suite ?? "/"} />
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Vous êtes</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {[["patient", "Patient ou famille"], ["pharmacien", "Pharmacien"], ["medecin", "Médecin"], ["clinique", "Clinique ou centre"], ["laboratoire", "Laboratoire"], ["autre", "Autre professionnel"]].map(([v, l], i) => (
              <label key={v} className="flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-brand-mint">
                <input type="radio" name="account_type" value={v} defaultChecked={i === 0} className="size-4" />{l}
              </label>
            ))}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Les professionnels sont ensuite guidés vers l&apos;inscription de leur établissement, vérifiée par l&apos;équipe.</p>
        </fieldset>
        <Field label="Nom complet" htmlFor="full_name" required>
          <Input id="full_name" name="full_name" autoComplete="name" required maxLength={120} />
        </Field>
        <Field label="Adresse e-mail" htmlFor="email" required>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </Field>
        <Field label="Téléphone" htmlFor="phone" hint="Facultatif. Format malien accepté : 70 00 00 00">
          <Input id="phone" name="phone" type="tel" autoComplete="tel" inputMode="tel" placeholder="+223 70 00 00 00" />
        </Field>
        <Field label="Mot de passe" htmlFor="password" required hint="8 caractères minimum">
          <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
        </Field>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="accept" className="mt-1 size-4 accent-[hsl(var(--primary))]" required />
          <span>
            J&apos;accepte les <Link prefetch={false} href="/infos/conditions" className="text-primary underline">conditions d&apos;utilisation</Link> et la{" "}
            <Link prefetch={false} href="/infos/confidentialite" className="text-primary underline">politique de confidentialité</Link>.
          </span>
        </label>
        <SubmitButton className="w-full" pendingText="Création…">Créer mon compte</SubmitButton>
      </ActionForm>
      <p className="mt-4 text-center text-sm">
        Déjà inscrit ? <Link prefetch={false} href="/connexion" className="font-semibold text-primary hover:underline">Se connecter</Link>
      </p>
    </AuthShell>
  );
}
