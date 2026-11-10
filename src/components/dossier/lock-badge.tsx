import Link from "next/link";
import { Lock, LockOpen, ShieldCheck } from "lucide-react";
import { lockDossier } from "@/app/actions/dossier";
import { cn } from "@/lib/utils";

/**
 * Cadenas du dossier santé. Il dit toujours la vérité :
 * fermé (vert) seulement quand un code protège réellement le dossier ; ouvert (orange) sinon.
 */
export function LockBadge({ hasPin }: { hasPin: boolean }) {
  if (!hasPin) {
    return (
      <section aria-label="Protection du dossier" className="flex flex-col gap-3 rounded-2xl border-2 border-amber-300 bg-amber-50 p-3 sm:flex-row sm:items-center sm:p-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-amber-400 text-white shadow-sm"><LockOpen className="size-6" aria-hidden /></span>
          <div className="min-w-0">
            <p className="font-bold text-amber-950">Dossier non verrouillé</p>
            <p className="text-sm text-amber-900">Ajoutez un code à 4 chiffres : sans lui, toute personne qui prend votre téléphone peut lire votre dossier.</p>
          </div>
        </div>
        <Link prefetch={false} href="/ma-sante/dossier/code" className="rounded-xl bg-amber-500 px-4 py-2.5 text-center text-sm font-bold text-white hover:bg-amber-600">Protéger par un code</Link>
      </section>
    );
  }
  return (
    <section aria-label="Protection du dossier" className="flex flex-col gap-3 rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-3 sm:flex-row sm:items-center sm:p-4">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="relative grid size-12 shrink-0 place-items-center rounded-full bg-primary text-white shadow-sm">
          <Lock className="size-6" aria-hidden />
          <ShieldCheck className="absolute -bottom-1 -end-1 size-5 rounded-full bg-white p-0.5 text-primary" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="font-bold text-emerald-950">Dossier protégé par votre code</p>
          <p className="text-sm text-emerald-900">Visible par vous seul · se referme tout seul après 30 minutes sans activité.</p>
        </div>
      </div>
      <form action={lockDossier}>
        <button className="flex w-full items-center justify-center gap-1.5 rounded-xl border-2 border-primary bg-white px-4 py-2 text-sm font-bold text-primary hover:bg-primary hover:text-white"><Lock className="size-4" aria-hidden /> Verrouiller maintenant</button>
      </form>
    </section>
  );
}

/** Petit cadenas pour les menus : fermé si le dossier a un code. */
export function MiniLock({ className }: { className?: string }) {
  return <Lock className={cn("size-3.5", className)} aria-label="protégé" />;
}
