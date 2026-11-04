import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Alert } from "@/components/ui/alert";
import { TotpEnroll } from "@/components/security/totp-enroll";
import { removeTotp } from "@/app/actions/security";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Sécurité du compte" };
export const dynamic = "force-dynamic";

export default async function Securite({ searchParams }: { searchParams: Promise<{ obligatoire?: string; suite?: string }> }) {
  const sp = await searchParams;
  await requireUser("/compte/securite");
  const supabase = await createClient();
  const [{ data: list }, { data: aal }] = await Promise.all([supabase.auth.mfa.listFactors(), supabase.auth.mfa.getAuthenticatorAssuranceLevel()]);
  const factors = (list?.totp ?? []).filter((f) => f.status === "verified");
  const suite = sp.suite?.startsWith("/") && !sp.suite.startsWith("//") ? sp.suite : null;
  return (
    <div className="container-page max-w-2xl space-y-4 py-6">
      <h1 className="flex items-center gap-2 text-2xl font-bold text-brand-deep"><ShieldCheck className="size-7 text-primary" aria-hidden /> Sécurité du compte</h1>
      {sp.obligatoire && <Alert tone="warning" title="Double authentification obligatoire">Pour protéger les données, l&apos;administration et l&apos;espace Autorités exigent un code à 6 chiffres en plus du mot de passe. Activez-la ci-dessous pour continuer.</Alert>}
      <section className="space-y-3 rounded-2xl border bg-white p-5">
        <h2 className="text-lg font-bold">Double authentification</h2>
        <p className="text-sm text-muted-foreground">En plus de votre mot de passe, un code à 6 chiffres, généré par une application sur votre téléphone, est demandé à chaque connexion. Même si quelqu&apos;un vole votre mot de passe, il ne peut pas entrer. Recommandée pour tous les professionnels, obligatoire pour l&apos;administration et les autorités.</p>
        {factors.length ? (
          <>
            <p className="text-sm font-semibold text-emerald-700">Activée depuis le {formatDate(factors[0].created_at)}.</p>
            {suite && <Link prefetch={false} href={suite} className="inline-block text-sm font-semibold text-primary underline">Continuer</Link>}
            {aal?.currentLevel === "aal2" && (
              <ActionForm action={removeTotp}><input type="hidden" name="factor_id" value={factors[0].id} />
                <SubmitButton size="sm" variant="outline" confirm="Retirer la double authentification ? Votre compte sera moins protégé.">Retirer</SubmitButton></ActionForm>
            )}
          </>
        ) : <TotpEnroll />}
      </section>
      <p className="text-xs text-muted-foreground">Téléphone perdu ? Écrivez-nous depuis la page <Link prefetch={false} href="/infos/contact" className="underline">Contact</Link> : l&apos;équipe vérifiera votre identité avant de désactiver la double authentification.</p>
    </div>
  );
}
