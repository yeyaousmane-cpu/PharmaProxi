import Link from "next/link";
import { BadgeCheck, ChevronRight, ShieldCheck, Umbrella } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ConventionBadge } from "@/components/insurance/insurance-badges";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { CONFIRM_BEFORE_VISIT, CONVENTION_STATUS, type ConventionStatus } from "@/lib/insurance";

export const metadata = {
  title: "Mon assurance santé : où aller avec ma carte ?",
  description: "Choisissez votre assurance, mutuelle ou régime (AMO, RAMED…) pour trouver les pharmacies, cliniques et laboratoires de son réseau au Mali.",
};
export const revalidate = 0;

type Ins = {
  id: string; name: string; slug: string; kind: string; org_type: string; status: string; health_offer: string; website: string | null;
  network_date: string | null; total: number; confirmed: number; to_verify: number; pharmacies: number; regions: number;
};

const GROUPS: [string, string][] = [["regime_public", "Régimes publics"], ["assurance_privee", "Assurances privées"], ["mutuelle", "Mutuelles"], ["autre", "Autres organismes"]];

function InsurerCard({ i }: { i: Ins }) {
  const total = Number(i.total);
  return (
    <Link prefetch={false} href={`/assurances/${i.slug}`} className="flex h-full items-center justify-between gap-3 rounded-2xl border bg-white p-4 shadow-sm hover:border-primary focus-visible:outline-2 focus-visible:outline-primary">
      <span className="min-w-0">
        <span className="flex items-center gap-2 font-bold text-brand-deep"><ShieldCheck className="size-5 shrink-0 text-primary" aria-hidden />{i.name}</span>
        <span className="mt-1 block text-sm text-muted-foreground">
          {total > 0
            ? <>{total} établissement{total > 1 ? "s" : ""} référencé{total > 1 ? "s" : ""}, dont {i.pharmacies} pharmacie{Number(i.pharmacies) > 1 ? "s" : ""} · {i.regions} région{Number(i.regions) > 1 ? "s" : ""}</>
            : "Réseau de soins pas encore référencé"}
        </span>
        <span className="mt-2 flex flex-wrap gap-1.5">
          {Number(i.confirmed) > 0 && <Badge className="border-emerald-300 bg-emerald-50 text-emerald-900"><BadgeCheck className="size-3" aria-hidden />{i.confirmed} confirmé(s)</Badge>}
          {Number(i.to_verify) > 0 && <Badge className="border-amber-300 bg-amber-50 text-amber-900">{i.to_verify} à vérifier</Badge>}
          {i.health_offer !== "confirmee" && <Badge className="border-slate-300 bg-slate-50 text-slate-700">Offre santé à confirmer</Badge>}
        </span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-primary rtl:-scale-x-100" aria-hidden />
    </Link>
  );
}

export default async function InsurancePage() {
  let list: Ins[] = [];
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    list = ((await supabase.rpc("insurance_overview")).data as Ins[] | null) ?? [];
  }
  return (
    <div className="container-page space-y-6 py-6">
      <header className="space-y-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-brand-deep"><Umbrella className="size-7 text-primary" aria-hidden /> Mon assurance santé</h1>
        <p className="max-w-3xl text-muted-foreground">
          Choisissez votre assurance, votre mutuelle ou votre régime (AMO, RAMED…) pour trouver les pharmacies, cliniques, laboratoires et centres d&apos;imagerie de son réseau, par région.
        </p>
      </header>

      <section aria-labelledby="legende" className="rounded-2xl border bg-white p-4">
        <h2 id="legende" className="text-sm font-bold text-brand-deep">Ce que signifient les badges</h2>
        <ul className="mt-2 grid gap-2 sm:grid-cols-3">
          {(Object.keys(CONVENTION_STATUS) as ConventionStatus[]).map((k) => (
            <li key={k} className="space-y-1 text-sm">
              <ConventionBadge name="Assurance" status={k} />
              <p className="text-xs text-muted-foreground">{CONVENTION_STATUS[k].hint}</p>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">
          Accepter une assurance et pratiquer le tiers payant sont deux choses différentes : seul le badge vert garantit une convention de tiers payant vérifiée. {CONFIRM_BEFORE_VISIT}
        </p>
      </section>

      {list.length === 0 ? (
        <Alert tone="info" title="Aucun organisme référencé pour le moment">Les réseaux de soins sont ajoutés au fur et à mesure de leur vérification.</Alert>
      ) : (
        GROUPS.map(([type, title]) => {
          const items = list.filter((i) => (i.org_type ?? "autre") === type);
          if (!items.length) return null;
          return (
            <section key={type} aria-labelledby={`g-${type}`} className="space-y-2">
              <h2 id={`g-${type}`} className="text-lg font-bold text-brand-deep">{title}</h2>
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((i) => <li key={i.id}><InsurerCard i={i} /></li>)}
              </ul>
            </section>
          );
        })
      )}

      <section className="rounded-2xl border bg-white p-5 text-sm leading-relaxed">
        <h2 className="text-lg font-bold text-brand-deep">Bon à savoir</h2>
        <ul className="mt-2 list-disc space-y-1 ps-5">
          <li>Ayez toujours sur vous votre <strong>carte d&apos;assuré</strong> et, pour les médicaments, l&apos;<strong>ordonnance</strong>.</li>
          <li>Le taux de prise en charge, les plafonds et les médicaments couverts dépendent de <strong>votre contrat</strong> : en cas de doute, appelez votre assureur avant les soins.</li>
          <li>Les listes de partenaires changent : chaque établissement indique la source de l&apos;information et sa date.</li>
          <li>Vous êtes assuré AMO ? Voir aussi <Link prefetch={false} href="/amo" className="text-primary underline">les médicaments pris en charge par l&apos;AMO</Link>.</li>
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">
          Les organismes sont listés à titre d&apos;information ; leur présence ne signifie pas un partenariat avec SantéProxi.
          {" "}Vous êtes un assureur ou une mutuelle et souhaitez faire vérifier votre réseau ? <Link prefetch={false} href="/infos/contact?sujet=partenariat" className="underline">Contactez-nous</Link>.
        </p>
      </section>
    </div>
  );
}
