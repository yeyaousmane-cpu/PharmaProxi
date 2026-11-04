import { ShieldCheck } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { verifyLoginCode } from "@/app/actions/security";

export const metadata = { title: "Code de vérification" };

export default async function Verification({ searchParams }: { searchParams: Promise<{ suite?: string }> }) {
  const sp = await searchParams;
  return (
    <div className="container-page max-w-sm py-10">
      <section className="space-y-4 rounded-2xl border bg-white p-6 text-center">
        <ShieldCheck className="mx-auto size-10 text-primary" aria-hidden />
        <h1 className="text-xl font-bold text-brand-deep">Code de vérification</h1>
        <p className="text-sm text-muted-foreground">Ouvrez votre application d&apos;authentification et saisissez le code à 6 chiffres.</p>
        <ActionForm action={verifyLoginCode} className="space-y-3">
          <input type="hidden" name="suite" value={sp.suite ?? "/"} />
          <label htmlFor="code" className="sr-only">Code</label>
          <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required autoFocus className="h-14 w-full rounded-xl border px-3 text-center text-2xl tracking-[0.4em]" />
          <SubmitButton className="w-full" pendingText="Vérification…">Valider</SubmitButton>
        </ActionForm>
      </section>
    </div>
  );
}
