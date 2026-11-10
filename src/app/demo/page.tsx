import Link from "next/link";
import { FlaskConical, LogIn, ShieldCheck } from "lucide-react";
import { DEMO_ACTORS, isDemoEnv } from "@/lib/demo";
import { demoSignIn } from "@/app/actions/demo";

export const metadata = { title: "Espace de démonstration – Découvrir SantéProxi", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function DemoPage({ searchParams }: { searchParams: Promise<{ erreur?: string }> }) {
  const sp = await searchParams;
  const demo = isDemoEnv();
  const demoUrl = process.env.NEXT_PUBLIC_DEMO_URL;
  const pw = demo ? process.env.DEMO_PASSWORD : undefined;
  return (
    <div className="container-page max-w-6xl space-y-6 py-6">
      <header>
        <h1 className="flex items-center gap-2 text-3xl font-extrabold text-[#052D1E]"><FlaskConical className="size-8 text-[#068132]" aria-hidden /> Espace de démonstration – Découvrir SantéProxi</h1>
        <p className="mt-2 max-w-3xl text-muted-foreground">Connectez-vous successivement comme chaque acteur pour découvrir son interface. Toutes les données de la démonstration sont fictives.</p>
      </header>

      {!demo ? (
        <div className="rounded-2xl border bg-white p-5">
          <p className="flex items-start gap-2 font-semibold text-[#052D1E]"><ShieldCheck className="mt-0.5 size-5 shrink-0 text-[#068132]" aria-hidden /> Vous êtes sur le site réel de SantéProxi.</p>
          <p className="mt-2 text-sm">Pour protéger les données des utilisateurs, la démonstration fonctionne sur un environnement séparé, avec sa propre base de données entièrement fictive. Aucun compte de démonstration n&apos;existe ici.</p>
          {demoUrl ? <a href={`${demoUrl.replace(/\/$/, "")}/demo`} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#052D1E] px-4 font-semibold text-white">Ouvrir l&apos;environnement de démonstration</a>
            : <p className="mt-2 text-sm text-muted-foreground">L&apos;environnement de démonstration n&apos;est pas encore mis en ligne.</p>}
        </div>
      ) : (
        <>
          <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
            <p className="font-semibold">Environnement de démonstration isolé</p>
            <ul className="mt-1 list-disc space-y-0.5 ps-5">
              <li>Base de données distincte du site réel : aucune donnée réelle n&apos;y est accessible.</li>
              <li>Aucun e-mail, SMS, paiement ni message externe n&apos;est envoyé. Les inscriptions et changements d&apos;adresse sont désactivés.</li>
              <li>Les règles d&apos;accès sont les mêmes qu&apos;en production : chaque compte ne voit que ce que son rôle autorise.</li>
            </ul>
            {pw && <p className="mt-2">Mot de passe commun à tous les comptes : <code className="rounded bg-white px-1.5 py-0.5 font-mono" dir="ltr">{pw}</code></p>}
          </div>
          {sp.erreur && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-900">La connexion au compte de démonstration a échoué. Réessayez ou utilisez la page de connexion avec l&apos;adresse et le mot de passe indiqués.</p>}
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {DEMO_ACTORS.map((a) => (
              <li key={a.key} className="flex flex-col rounded-2xl border bg-white p-5">
                <h2 className="text-lg font-bold text-[#052D1E]">{a.label}</h2>
                <p className="mt-1 text-sm">{a.description}</p>
                <p className="mt-2 break-all font-mono text-xs text-muted-foreground" dir="ltr">{a.email}</p>
                <details className="mt-2 text-sm"><summary className="cursor-pointer font-semibold text-[#068132]">À tester</summary>
                  <ul className="mt-1 list-disc space-y-0.5 ps-5 text-muted-foreground">{a.tests.map((t) => <li key={t}>{t}</li>)}</ul></details>
                <form action={demoSignIn} className="mt-auto pt-4">
                  <input type="hidden" name="actor" value={a.key} />
                  <button className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#052D1E] px-4 font-semibold text-white hover:bg-[#068132]"><LogIn className="size-4 rtl:-scale-x-100" aria-hidden /> Accéder à la démonstration</button>
                </form>
              </li>
            ))}
            <li className="flex flex-col rounded-2xl border border-dashed bg-muted/30 p-5">
              <h2 className="text-lg font-bold text-[#052D1E]">Infirmier</h2>
              <p className="mt-1 text-sm">Pas encore d&apos;espace professionnel infirmier : les infirmiers apparaissent dans l&apos;annuaire public des soins à domicile.</p>
              <Link prefetch={false} href="/infirmiers" className="mt-auto inline-flex min-h-11 items-center justify-center rounded-xl border-2 px-4 pt-0 font-semibold text-[#052D1E]">Voir l&apos;annuaire des infirmiers</Link>
            </li>
          </ul>
        </>
      )}
    </div>
  );
}
