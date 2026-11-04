import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { getSession } from "@/lib/auth";
import { enforceMfa } from "@/lib/mfa";
import { IdleLogout } from "./idle-logout";

/** Espaces professionnels : code demandé si la double authentification est activée, invitation à l'activer sinon, déconnexion après 30 minutes d'inactivité. */
export async function ProGuard({ path }: { path: string }) {
  const s = await getSession();
  if (!s) return null;
  const { enrolled } = await enforceMfa(path, false);
  return (
    <>
      <IdleLogout />
      {!enrolled && (
        <p className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>Protégez votre espace professionnel : <Link prefetch={false} href={`/compte/securite?suite=${encodeURIComponent(path)}`} className="font-semibold underline">activez la double authentification</Link> (un code à 6 chiffres en plus du mot de passe).</span>
        </p>
      )}
    </>
  );
}
