import Link from "next/link";
import { AudioGuide } from "@/components/audio/audio-guide";
import { ChevronRight, Scale, ShieldPlus } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { TopicIcon } from "@/components/droits/topic-icon";
import { DROITS_CHECKED, GROUPS, TOPICS } from "@/lib/droits";

export const metadata = {
  title: "Vos droits et votre santé",
  description: "Congé de maternité, allocations familiales, déclaration de naissance, vaccination, accident du travail, retraite, soins gratuits : l'essentiel à savoir au Mali.",
};

export default function DroitsPage() {
  return (
    <div className="container-page space-y-6 py-6">
      <header className="space-y-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-brand-deep"><Scale className="size-7 text-primary" aria-hidden /> Vos droits et votre santé</h1>
        <p className="max-w-3xl text-muted-foreground">Ce que la loi malienne prévoit pour vous et votre famille : grossesse, enfants, travail, retraite, soins gratuits. Expliqué simplement, avec les textes de référence.</p>
        <AudioGuide target="droits" />
      </header>
      <Alert tone="info" title={`Informations vérifiées en ${DROITS_CHECKED}`}>
        Chaque fiche cite ses sources. Les montants et les règles peuvent changer : pour votre cas précis, adressez-vous à l&apos;INPS, à votre employeur, à la mairie ou au centre de santé.
      </Alert>
      <Link prefetch={false} href="/amo/guide" className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-brand-mint p-4 hover:border-primary">
        <span className="flex items-center gap-3"><ShieldPlus className="size-6 shrink-0 text-primary" aria-hidden />
          <span><span className="block font-semibold text-brand-deep">AMO et INPS : le guide complet</span><span className="text-sm text-muted-foreground">Assurance maladie, inscription à l&apos;INPS, assurance volontaire pour les non-salariés</span></span></span>
        <ChevronRight className="size-5 shrink-0 text-primary rtl:-scale-x-100" aria-hidden />
      </Link>
      {GROUPS.map((g) => (
        <section key={g.key} aria-labelledby={`g-${g.key}`} className="space-y-3">
          <h2 id={`g-${g.key}`} className="text-lg font-bold">{g.label}</h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {TOPICS.filter((t) => t.group === g.key).map((t) => (
              <li key={t.slug}>
                <Link prefetch={false} href={`/droits/${t.slug}`} className="flex h-full flex-col rounded-2xl border bg-white p-4 shadow-sm transition hover:border-primary">
                  <span className="flex items-center gap-2 font-semibold text-brand-deep"><span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-mint"><TopicIcon icon={t.icon} className="size-5 text-primary" /></span>{t.title}</span>
                  <span className="mt-2 text-sm text-muted-foreground">{t.summary}</span>
                  <span className="mt-auto pt-3 text-sm font-semibold text-primary">Lire la fiche →</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <p className="text-xs text-muted-foreground">SantéProxi résume des textes publics. Ce n&apos;est ni un avis juridique ni un avis médical.</p>
    </div>
  );
}
