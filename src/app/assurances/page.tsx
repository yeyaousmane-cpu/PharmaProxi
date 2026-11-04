import Link from "next/link";
import { ChevronRight, ShieldCheck, Umbrella } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";

export const metadata = {
  title: "Assurances santé : réseaux de soins",
  description: "Pharmacies, cliniques et laboratoires partenaires de votre assurance santé au Mali (tiers payant).",
};
export const revalidate = 0;

type Ins = { id: string; name: string; slug: string; kind: string; network_date: string | null; total: number; pharmacies: number; regions: number };

export default async function InsurancePage() {
  let list: Ins[] = [];
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    list = ((await supabase.rpc("insurers_overview")).data as Ins[] | null) ?? [];
  }
  return (
    <div className="container-page space-y-6 py-6">
      <header className="space-y-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-brand-deep"><Umbrella className="size-7 text-primary" aria-hidden /> Assurances santé : où aller avec ma carte ?</h1>
        <p className="max-w-3xl text-muted-foreground">
          Choisissez votre assurance pour voir les pharmacies, cliniques, laboratoires et opticiens partenaires. Chez un partenaire, c&apos;est le
          <strong> tiers payant</strong> : vous présentez votre carte et vous ne payez que votre part.
        </p>
      </header>
      {list.length === 0 ? (
        <Alert tone="info" title="Aucune assurance référencée pour le moment">Les réseaux de soins des assurances sont ajoutés au fur et à mesure.</Alert>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {list.map((i) => (
            <li key={i.id}>
              <Link prefetch={false} href={`/assurances/${i.slug}`} className="flex items-center justify-between gap-3 rounded-2xl border bg-white p-5 shadow-sm hover:border-primary">
                <span>
                  <span className="flex items-center gap-2 text-lg font-bold text-brand-deep"><ShieldCheck className="size-5 text-primary" aria-hidden />{i.name}</span>
                  <span className="mt-1 block text-sm text-muted-foreground">{i.total} partenaires dont {i.pharmacies} pharmacies · {i.regions} région(s)</span>
                </span>
                <ChevronRight className="size-5 shrink-0 text-primary" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <section className="rounded-2xl border bg-white p-5 text-sm leading-relaxed">
        <h2 className="text-lg font-bold text-brand-deep">Bon à savoir</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Ayez toujours sur vous votre <strong>carte d&apos;assuré</strong> et, pour les médicaments, l&apos;<strong>ordonnance</strong>.</li>
          <li>Le taux de prise en charge, les plafonds et les médicaments couverts dépendent de <strong>votre contrat</strong> : en cas de doute, appelez votre assureur avant les soins.</li>
          <li>Les listes de partenaires changent : SantéProxi affiche la liste communiquée par l&apos;assureur, à la date indiquée.</li>
          <li>Vous êtes assuré AMO ? Voir aussi <Link prefetch={false} href="/amo" className="text-primary underline">les médicaments pris en charge par l&apos;AMO</Link>.</li>
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">Vous êtes une assurance ou une mutuelle et souhaitez publier votre réseau ? <Link prefetch={false} href="/infos/contact" className="underline">Contactez-nous</Link>.</p>
      </section>
    </div>
  );
}
