import Link from "next/link";
import { FolderHeart, Lock, ShieldCheck } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { lockDossier, unlockDossier } from "@/app/actions/dossier";
import { SanteNav } from "@/components/sante-perso/nav";
import { RELATIONS } from "@/lib/dossier/config";
import type { DossierStatus, Person } from "@/lib/dossier/server";
import { cn } from "@/lib/utils";

export const DOSSIER_PRIVACY = "Votre dossier est visible par vous seul : ni médecin, ni pharmacie, ni assureur, ni PharmaProxi n'y ont accès. C'est vous qui le montrez, sur votre téléphone. Rien n'est utilisé pour de la publicité ni par l'assistant. Tout est effacé si vous supprimez votre compte.";

const NAV = [
  ["", "Essentiel"], ["/antecedents", "Antécédents et vaccins"], ["/analyses", "Analyses"], ["/consultations", "Consultations"],
  ["/journal", "Symptômes"], ["/contacts", "Couverture et soignants"], ["/proches", "Mes proches"],
] as const;

export function DossierGate({ status, path }: { status: DossierStatus; path: string }) {
  return (
    <div className="container-page max-w-md space-y-4 py-8">
      <section className="space-y-4 rounded-2xl border bg-white p-6 text-center">
        <Lock className="mx-auto size-10 text-primary" aria-hidden />
        <h1 className="text-xl font-bold text-brand-deep">Dossier santé verrouillé</h1>
        <p className="text-sm text-muted-foreground">Saisissez votre code pour l&apos;ouvrir.</p>
        {status.blocked_until && <p className="text-sm font-semibold text-red-700">Trop d&apos;essais : réessayez après {new Date(status.blocked_until).toISOString().slice(11, 16)} (heure du Mali).</p>}
        <ActionForm action={unlockDossier} className="space-y-3">
          <input type="hidden" name="back" value={path} />
          <label htmlFor="pin" className="sr-only">Code</label>
          <input id="pin" name="pin" type="password" inputMode="numeric" autoComplete="off" pattern="[0-9]{4,6}" maxLength={6} required autoFocus
            className="h-14 w-full rounded-xl border px-3 text-center text-2xl tracking-[0.5em]" />
          <SubmitButton className="w-full" pendingText="Vérification…">Ouvrir</SubmitButton>
        </ActionForm>
        <p className="text-xs text-muted-foreground">Code oublié ? Pour votre sécurité, il ne peut pas être récupéré. Écrivez-nous depuis la page <Link prefetch={false} href="/infos/contact" className="underline">Contact</Link>.</p>
      </section>
      <p className="text-center text-xs text-muted-foreground">La fiche d&apos;urgence enregistrée en image sur votre téléphone reste visible même sans ouvrir le dossier.</p>
    </div>
  );
}

export function DossierShell({ persons, person, status, current, children }: {
  persons: Person[]; person: Person; status: DossierStatus; current: string; children: React.ReactNode;
}) {
  const qp = person.is_self ? "" : `?p=${person.id}`;
  return (
    <div className="container-page max-w-4xl space-y-4 py-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-brand-deep"><FolderHeart className="size-7 text-primary" aria-hidden /> Mon dossier santé</h1>
          {status.has_pin
            ? <form action={lockDossier}><button className="flex items-center gap-1.5 rounded-full border bg-white px-3 py-1.5 text-sm font-semibold hover:border-primary"><Lock className="size-4" aria-hidden /> Verrouiller</button></form>
            : <Link prefetch={false} href="/ma-sante/dossier/code" className="flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-semibold text-amber-900"><Lock className="size-4" aria-hidden /> Protéger par un code</Link>}
        </div>
        <p className="flex items-start gap-2 text-xs text-muted-foreground"><ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />{DOSSIER_PRIVACY}</p>
      </header>
      <SanteNav current="/ma-sante/dossier" />
      {persons.length > 1 && (
        <nav aria-label="Dossier de" className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Dossier de :</span>
          {persons.map((p) => (
            <Link key={p.id} prefetch={false} href={`/ma-sante/dossier${current}${p.is_self ? "" : `?p=${p.id}`}`} aria-current={p.id === person.id ? "page" : undefined}
              className={cn("rounded-full border px-3 py-1 font-medium", p.id === person.id ? "border-brand-deep bg-brand-deep text-white" : "bg-white")}>
              {p.is_self ? "Moi" : p.display_name}{!p.is_self && p.relation ? ` (${RELATIONS[p.relation]?.toLowerCase()})` : ""}
            </Link>
          ))}
        </nav>
      )}
      <nav aria-label="Rubriques du dossier" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
        {NAV.map(([href, label]) => (
          <Link key={href} prefetch={false} href={`/ma-sante/dossier${href}${href === "/proches" ? "" : qp}`} aria-current={current === href ? "page" : undefined}
            className={cn("shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium", current === href ? "bg-brand-mint text-brand-deep" : "text-muted-foreground hover:bg-muted")}>{label}</Link>
        ))}
      </nav>
      <div className="flex flex-wrap gap-2">
        <Link prefetch={false} href={`/ma-sante/dossier/resume${qp}`} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white">Montrer à mon médecin</Link>
        <Link prefetch={false} href={`/ma-sante/dossier/urgence${qp}`} className="rounded-xl border border-red-300 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-800">Fiche d&apos;urgence</Link>
      </div>
      {children}
    </div>
  );
}
