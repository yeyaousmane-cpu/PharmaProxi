import Link from "next/link";
import { PasswordInput } from "@/components/auth/password-input";
import { AuthShell } from "@/components/auth-shell";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Field, Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { signIn } from "@/app/actions/auth";
import { getT } from "@/lib/i18n";

export const metadata = { title: "Connexion" };

export default async function Page({ searchParams }: { searchParams: Promise<{ suite?: string; erreur?: string; raison?: string }> }) {
  const [sp, t] = await Promise.all([searchParams, getT()]);
  return (
    <AuthShell title={t("auth.login_title")} subtitle={t("auth.login_sub")}>
      {sp.erreur === "lien" && <Alert tone="error" title={t("auth.bad_link")} className="mb-4" />}
      {sp.raison === "inactivite" && <Alert tone="info" title={t("auth.idle")} className="mb-4" />}
      <ActionForm action={signIn} className="space-y-4" labels={{ email: t("auth.email_short"), password: t("auth.password") }}>
        <input type="hidden" name="suite" value={sp.suite ?? "/"} />
        <Field label={t("auth.email")} htmlFor="email" required>
          <Input id="email" name="email" type="email" autoComplete="email" required inputMode="email" dir="ltr" />
        </Field>
        <Field label={t("auth.password")} htmlFor="password" required>
          <PasswordInput id="password" name="password" autoComplete="current-password" />
        </Field>
        <SubmitButton className="w-full" pendingText={t("auth.signing_in")}>{t("auth.submit")}</SubmitButton>
      </ActionForm>
      <div className="mt-4 flex flex-col items-center gap-2 text-sm">
        <Link prefetch={false} href="/mot-de-passe-oublie" className="text-primary hover:underline">{t("auth.forgot")}</Link>
        <Link prefetch={false} href="/aide/mon-compte" className="text-muted-foreground hover:underline">{t("auth.help")}</Link>
        <p>
          {t("auth.no_account")}{" "}
          <Link prefetch={false} href={`/inscription${sp.suite ? `?suite=${encodeURIComponent(sp.suite)}` : ""}`} className="font-semibold text-primary hover:underline">{t("auth.create")}</Link>
        </p>
      </div>
    </AuthShell>
  );
}
