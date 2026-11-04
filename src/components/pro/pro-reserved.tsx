import Link from "next/link";
import { ShieldCheck } from "lucide-react";

const LABEL = { pharmacie: "une pharmacie", medecin: "une fiche de médecin", clinique: "un établissement", laboratoire: "un laboratoire" } as const;

/** Affiché à la place d'un formulaire d'inscription professionnelle tant que l'administrateur n'a pas autorisé le compte. */
export function ProReserved({ kind }: { kind: keyof typeof LABEL }) {
  return (
    <div className="container-page max-w-2xl space-y-4 py-8">
      <div className="space-y-3 rounded-2xl border bg-white p-6">
        <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-brand-blue"><ShieldCheck className="size-4" aria-hidden /> Espace professionnel</p>
        <h1 className="text-2xl font-bold text-brand-deep">Inscription réservée aux professionnels vérifiés</h1>
        <p className="text-muted-foreground">
          Pour protéger les patients, personne ne peut s&apos;inscrire seul comme pharmacien, médecin, clinique ou laboratoire.
          L&apos;équipe SantéProxi vérifie d&apos;abord votre autorisation d&apos;exercer, puis ouvre votre accès pour inscrire {LABEL[kind]}.
        </p>
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          <li>Créez un compte SantéProxi normal (si ce n&apos;est pas déjà fait).</li>
          <li>Envoyez votre demande avec le formulaire professionnel.</li>
          <li>Après vérification, vous recevez une notification et cette page s&apos;ouvre.</li>
        </ol>
        <Link prefetch={false} href={`/professionnels?type=${kind}`} className="inline-block rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white">Faire une demande</Link>
      </div>
    </div>
  );
}
