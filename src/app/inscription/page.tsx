import Link from "next/link";
import { AudioGuide } from "@/components/audio/audio-guide";
import { AuthShell } from "@/components/auth-shell";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Field, Input } from "@/components/ui/input";
import { signUp } from "@/app/actions/auth";
import { PasswordInput } from "@/components/auth/password-input";
import { getT } from "@/lib/i18n";

export const metadata = { title: "Créer un compte" };

export default async function Page({ searchParams }: { searchParams: Promise<{ suite?: string }> }) {
  const [sp, t] = await Promise.all([searchParams, getT()]);
  return (
    <AuthShell title={t("auth.signup_title")} subtitle={t("su.sub")}>
      <AudioGuide target="inscription" className="mb-4" />
      <ActionForm action={signUp} className="space-y-4" labels={{ full_name: t("su.name_short"), email: t("auth.email_short"), phone: t("su.phone"), password: t("auth.password"), accept: t("su.terms_short") }}>
        <input type="hidden" name="suite" value={sp.suite ?? "/"} />
        <Field label={t("su.name")} htmlFor="full_name" required>
          <Input id="full_name" name="full_name" autoComplete="name" required maxLength={120} />
        </Field>
        <Field label={t("auth.email")} htmlFor="email" required>
          <Input id="email" name="email" type="email" autoComplete="email" required dir="ltr" />
        </Field>
        <Field label={t("su.phone")} htmlFor="phone" hint={t("su.phone_hint")}>
          <Input id="phone" name="phone" type="tel" autoComplete="tel" inputMode="tel" placeholder="+223 70 00 00 00" dir="ltr" />
        </Field>
        <Field label={t("auth.password")} htmlFor="password" required>
          <PasswordInput id="password" name="password" autoComplete="new-password" minLength={8} meter />
        </Field>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="accept" className="mt-1 size-4 accent-[hsl(var(--primary))]" required />
          <span>
            {t("su.accept_a")} <Link prefetch={false} href="/infos/conditions" className="text-primary underline">{t("su.terms")}</Link> {t("su.and")}{" "}
            <Link prefetch={false} href="/infos/confidentialite" className="text-primary underline">{t("su.privacy")}</Link>.
          </span>
        </label>
        <fieldset className="space-y-2 rounded-xl border p-3 text-sm">
          <legend className="px-1 font-semibold">{t("su.optional")}</legend>
          <label className="flex items-start gap-2"><input type="checkbox" name="consent_communications" className="mt-1 size-4" /><span>{t("su.c_comm")}</span></label>
          <label className="flex items-start gap-2"><input type="checkbox" name="consent_enquetes" className="mt-1 size-4" /><span>{t("su.c_survey")}</span></label>
        </fieldset>
        <p className="text-xs text-muted-foreground">{t("su.data")} <Link prefetch={false} href="/votre-sante-vos-donnees" className="underline">{t("footer.donnees")}</Link></p>
        <SubmitButton className="w-full" pendingText={t("su.creating")}>{t("su.submit")}</SubmitButton>
      </ActionForm>
      <p className="mt-4 text-center text-sm">
        {t("su.already")} <Link prefetch={false} href="/connexion" className="font-semibold text-primary hover:underline">{t("auth.submit")}</Link>
      </p>
      <p className="mt-2 text-center text-xs text-muted-foreground">
        {t("su.pros")} <Link prefetch={false} href="/professionnels" className="font-semibold text-primary hover:underline">{t("su.pros_link")}</Link>.
      </p>
    </AuthShell>
  );
}
