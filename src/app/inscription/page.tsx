import Link from "next/link";
import { AudioGuide } from "@/components/audio/audio-guide";
import { AuthShell } from "@/components/auth-shell";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Field, Input } from "@/components/ui/input";
import { signUp } from "@/app/actions/auth";
import { PasswordInput } from "@/components/auth/password-input";

export const metadata = { title: "Créer un compte" };

export default async function Page({ searchParams }: { searchParams: Promise<{ suite?: string }> }) {
  const sp = await searchParams;
  return (
    <AuthShell title="Créer un compte" subtitle="Gratuit. Aucune donnée médicale n'est demandée.">
      <AudioGuide target="inscription" className="mb-4" />
      <ActionForm action={signUp} className="space-y-4" labels={{ full_name: "Nom", email: "E-mail", phone: "Téléphone", password: "Mot de passe", accept: "Conditions" }}>
        <input type="hidden" name="suite" value={sp.suite ?? "/"} />
        <Field label="Nom complet" htmlFor="full_name" required>
          <Input id="full_name" name="full_name" autoComplete="name" required maxLength={120} />
        </Field>
        <Field label="Adresse e-mail" htmlFor="email" required>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </Field>
        <Field label="Téléphone" htmlFor="phone" hint="Facultatif. Format malien accepté : 70 00 00 00">
          <Input id="phone" name="phone" type="tel" autoComplete="tel" inputMode="tel" placeholder="+223 70 00 00 00" />
        </Field>
        <Field label="Mot de passe" htmlFor="password" required>
          <PasswordInput id="password" name="password" autoComplete="new-password" minLength={8} meter />
        </Field>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="accept" className="mt-1 size-4 accent-[hsl(var(--primary))]" required />
          <span>
            J&apos;accepte les <Link prefetch={false} href="/infos/conditions" className="text-primary underline">conditions d&apos;utilisation</Link> et la{" "}
            <Link prefetch={false} href="/infos/confidentialite" className="text-primary underline">politique de confidentialité</Link>.
          </span>
        </label>
        <fieldset className="space-y-2 rounded-xl border p-3 text-sm">
          <legend className="px-1 font-semibold">Facultatif — vous pourrez changer d&apos;avis à tout moment</legend>
          <label className="flex items-start gap-2"><input type="checkbox" name="consent_communications" className="mt-1 size-4" /><span>Recevoir par e-mail les nouveautés et des messages de prévention.</span></label>
          <label className="flex items-start gap-2"><input type="checkbox" name="consent_enquetes" className="mt-1 size-4" /><span>Être contacté(e) pour des enquêtes de satisfaction.</span></label>
        </fieldset>
        <p className="text-xs text-muted-foreground">Vos données servent à gérer votre compte et les services que vous utilisez. <Link prefetch={false} href="/votre-sante-vos-donnees" className="underline">Votre santé, vos données</Link></p>
        <SubmitButton className="w-full" pendingText="Création…">Créer mon compte</SubmitButton>
      </ActionForm>
      <p className="mt-4 text-center text-sm">
        Déjà inscrit ? <Link prefetch={false} href="/connexion" className="font-semibold text-primary hover:underline">Se connecter</Link>
      </p>
      <p className="mt-2 text-center text-xs text-muted-foreground">
        Pharmacien, médecin, clinique ou laboratoire ? Les professionnels sont ajoutés par l&apos;équipe après vérification : <Link prefetch={false} href="/professionnels" className="font-semibold text-primary hover:underline">faire une demande</Link>.
      </p>
    </AuthShell>
  );
}
