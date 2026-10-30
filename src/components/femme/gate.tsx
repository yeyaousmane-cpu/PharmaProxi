import Link from "next/link";
import { CalendarHeart, Baby, BookHeart, Lock, NotebookPen, ShieldCheck } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { unlockFemme } from "@/app/actions/femme";
import { OnboardingForm } from "./onboarding-form";
import type { FemmeStatus } from "@/lib/femme/server";
import { todayIso } from "@/lib/femme/cycle";
import { F } from "./ui";

/** Affiche l'écran adapté (présentation, activation, déverrouillage) ; null si l'espace est ouvert. */
export function FemmeGate({ st, path }: { st: FemmeStatus; path: string }) {
  if (!st.signed_in) {
    return (
      <div className="space-y-5">
        <section className={`${F.card} space-y-3`}>
          <h1 className="text-2xl font-bold text-[#843653]">Un espace privé pour votre santé de femme</h1>
          <p>Suivez vos règles, comprenez votre cycle et votre fertilité, vivez votre grossesse semaine après semaine, notez vos symptômes et recevez des rappels discrets.</p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {[[CalendarHeart, "Calendrier des règles et prévisions"], [NotebookPen, "Journal des symptômes et de l'humeur"], [Baby, "Suivi de grossesse et après l'accouchement"], [BookHeart, "Bibliothèque santé de la femme"]].map(([I, t]) => {
              const Icon = I as typeof Lock;
              return <li key={t as string} className="flex items-center gap-2 text-sm"><Icon className="size-5 shrink-0 text-[#D96A91]" aria-hidden />{t as string}</li>;
            })}
          </ul>
          <div className="flex flex-wrap gap-2 pt-1">
            <Link prefetch={false} href={`/connexion?suite=${encodeURIComponent(path)}`} className={F.btn}>Se connecter</Link>
            <Link prefetch={false} href={`/inscription?suite=${encodeURIComponent(path)}`} className={F.btnOutline}>Créer un compte</Link>
          </div>
        </section>
        <Privacy />
      </div>
    );
  }
  if (!st.enabled) {
    return (
      <div className="space-y-4">
        <section className={`${F.card} space-y-2`}>
          <h1 className="text-2xl font-bold text-[#843653]">Créer votre espace</h1>
          <p className="text-sm">Trois petites questions pour personnaliser votre espace. Seules les informations utiles sont demandées.</p>
        </section>
        <section className={F.card}><OnboardingForm today={todayIso()} /></section>
        <Privacy />
      </div>
    );
  }
  if (st.locked) {
    return (
      <section className={`${F.card} mx-auto max-w-sm space-y-4 text-center`}>
        <Lock className="mx-auto size-10 text-[#D96A91]" aria-hidden />
        <h1 className="text-xl font-bold text-[#843653]">Espace verrouillé</h1>
        <p className="text-sm text-muted-foreground">Saisissez votre code secret.</p>
        {st.blocked_until && <p className="text-sm font-semibold text-red-700">Trop d&apos;essais : réessayez après {new Date(st.blocked_until).toISOString().slice(11, 16)} (heure du Mali).</p>}
        <ActionForm action={unlockFemme} className="space-y-3">
          <input type="hidden" name="suite" value={path} />
          <label htmlFor="pin" className="sr-only">Code secret</label>
          <input id="pin" name="pin" type="password" inputMode="numeric" autoComplete="off" pattern="[0-9]{4,6}" maxLength={6} required autoFocus
            className={`${F.input} text-center text-2xl tracking-[0.5em]`} />
          <SubmitButton className={`${F.btn} w-full`} pendingText="Vérification…">Ouvrir</SubmitButton>
        </ActionForm>
        <p className="text-xs text-muted-foreground">Code oublié ? Pour votre sécurité, il ne peut pas être récupéré. Écrivez-nous depuis la page <Link prefetch={false} href="/infos/contact" className="underline">Contact</Link>.</p>
      </section>
    );
  }
  return null;
}

export function Privacy() {
  return (
    <section className="rounded-2xl bg-[#F8E7EF] p-4 text-sm">
      <h2 className="mb-2 flex items-center gap-2 font-bold text-[#843653]"><ShieldCheck className="size-5" aria-hidden /> Vos données restent à vous</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>Visibles uniquement par vous : ni l&apos;équipe PharmaProxi, ni les pharmacies, ni les médecins n&apos;y ont accès depuis le site.</li>
        <li>Code secret possible : tant que l&apos;espace est verrouillé, le serveur refuse de livrer vos données.</li>
        <li>Rappels discrets : la notification ne dit jamais de quoi il s&apos;agit.</li>
        <li>Aucune vente, aucune publicité, aucun envoi à l&apos;assistant IA.</li>
        <li>Export et suppression définitive à tout moment, depuis les réglages.</li>
      </ul>
    </section>
  );
}
