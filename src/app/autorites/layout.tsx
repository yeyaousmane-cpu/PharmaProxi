import Link from "next/link";
import { Landmark, ShieldCheck } from "lucide-react";
import { authorityContext } from "@/lib/authority-server";
import { CAN, SCOPES } from "@/lib/authorities";
import { enforceMfa } from "@/lib/mfa";
import { IdleLogout } from "@/components/security/idle-logout";

export const dynamic = "force-dynamic";
export const metadata = { title: "SantéProxi Data", robots: { index: false } };

export default async function AuthoritiesLayout({ children }: { children: React.ReactNode }) {
  const ctx = await authorityContext("/autorites");
  if (!ctx.ok) {
    return (
      <div className="container-page max-w-xl py-10">
        <section className="space-y-3 rounded-2xl border bg-white p-6 text-center">
          <Landmark className="mx-auto size-10 text-primary" aria-hidden />
          <h1 className="text-xl font-bold text-brand-deep">Espace réservé aux autorités de santé</h1>
          <p className="text-sm text-muted-foreground">Cet espace est ouvert aux personnes désignées par le ministère de la Santé, la DPM, le CNTS et les Ordres, dans le cadre d&apos;une convention avec SantéProxi. Pour demander un accès, écrivez-nous depuis la page <Link prefetch={false} href="/infos/contact" className="underline">Contact</Link>.</p>
        </section>
      </div>
    );
  }
  await enforceMfa("/autorites", true);
  const can = (k: keyof typeof CAN) => ctx.admin || CAN[k].includes(ctx.scope);
  const nav = [["/autorites", "Tableau de bord", true], ["/autorites/carte", "Carte des structures", true], ["/autorites/rapport", "Rapport institutionnel", true], ["/autorites/signalements", "Signalements de médicaments", can("reports")], ["/autorites/campagnes", "Campagnes de don de sang", can("campaigns")], ["/autorites/communiques", "Communiqués officiels", true], ["/autorites/validation", "Valider les données", true], ["/autorites/methode", "Méthode et confidentialité", true]] as const;
  return (
    <div className="container-page space-y-4 py-6">
      <IdleLogout />
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-brand-deep"><Landmark className="size-7 text-primary" aria-hidden /> SantéProxi Data</h1>
        <p className="text-sm text-muted-foreground">{ctx.organisation}{ctx.scope !== "admin" ? ` · ${SCOPES[ctx.scope] ?? ""}` : ""}</p>
      </header>
      <p className="flex items-start gap-2 rounded-xl bg-brand-mint p-3 text-xs text-brand-deep"><ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />Chiffres anonymes et agrégés uniquement : une case de moins de 10 n&apos;est pas affichée. Les dossiers santé et toutes les données personnelles de santé des utilisateurs n&apos;entrent jamais dans ces statistiques. Chaque consultation est enregistrée.</p>
      <nav aria-label="SantéProxi Data" className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1">
        {nav.filter((n) => n[2]).map(([href, label]) => <Link prefetch={false} key={href} href={href} className="shrink-0 rounded-full border bg-white px-4 py-2 text-sm font-medium hover:border-primary">{label}</Link>)}
      </nav>
      {children}
    </div>
  );
}
