import Link from "next/link";
import { Brain, HeartHandshake, Phone, Siren, Stethoscope, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Santé mentale : trouver de l'aide", description: "Parler à quelqu'un, trouver un professionnel, des lignes d'écoute vérifiées. En cas de danger immédiat, appelez les urgences." };
export const revalidate = 600;

type Line = { id: string; name: string; phone: string; hours: string | null; description: string | null; topic: string; source: string; verified_at: string };
const TOPIC: Record<string, string> = { sante_mentale: "Santé mentale", violences: "Violences", addictions: "Addictions", jeunes: "Jeunes", autre: "Autre" };

/**
 * Orientation uniquement : aucun diagnostic, aucun conseil de traitement. Les lignes d'écoute ne sont
 * affichées qu'après vérification par l'équipe ; les textes sont à relire par un professionnel.
 */
export default async function SanteMentale() {
  let lines: Line[] = [];
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    lines = ((await supabase.from("support_lines").select("*").eq("active", true).order("sort")).data ?? []) as Line[];
  }
  return (
    <div className="container-page max-w-3xl space-y-5 py-6">
      <header className="space-y-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-brand-deep"><Brain className="size-7 text-primary" aria-hidden /> Santé mentale : trouver de l&apos;aide</h1>
        <p className="text-muted-foreground">Tristesse qui dure, angoisse, fatigue, difficultés à dormir, idées noires, consommation d&apos;alcool ou de drogues, choc après un événement : ce que vous ressentez compte, et en parler est un premier pas. Ces difficultés se soignent.</p>
      </header>
      <section className="rounded-2xl border-2 border-red-200 bg-red-50 p-4 text-red-950">
        <p className="flex items-center gap-2 font-bold"><Siren className="size-5" aria-hidden /> Si vous ou un proche êtes en danger immédiat</p>
        <p className="mt-1 text-sm">Ne restez pas seul. Allez au service d&apos;urgence le plus proche ou appelez les secours. Restez avec la personne et éloignez ce qui pourrait la blesser.</p>
        <Link prefetch={false} href="/sos" className="mt-2 inline-block rounded-xl bg-red-700 px-4 py-2 text-sm font-bold text-white">SOS Santé : numéros et urgences</Link>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-bold text-brand-deep">Parler à quelqu&apos;un</h2>
        {lines.length === 0 ? (
          <p className="rounded-2xl border bg-white p-4 text-sm text-muted-foreground">Les lignes d&apos;écoute et d&apos;aide disponibles au Mali seront affichées ici après leur vérification par l&apos;équipe SantéProxi. En attendant, parlez-en à une personne de confiance, à votre médecin ou à votre centre de santé.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">{lines.map((l) => (
            <li key={l.id} className="flex flex-col gap-1 rounded-2xl border bg-white p-4 text-sm">
              <span className="text-xs font-semibold uppercase text-brand-blue">{TOPIC[l.topic]}</span>
              <span className="text-base font-bold text-brand-deep">{l.name}</span>
              {l.description && <p className="text-muted-foreground">{l.description}</p>}
              <a href={`tel:${l.phone.replace(/\s/g, "")}`} className="mt-1 flex w-fit items-center gap-1 rounded-xl bg-primary px-3 py-2 font-bold text-white"><Phone className="size-4" aria-hidden />{l.phone}</a>
              {l.hours && <p className="text-xs">{l.hours}</p>}
              <p className="mt-auto pt-1 text-[11px] text-muted-foreground">Source : {l.source} · vérifié le {formatDate(l.verified_at)}</p>
            </li>))}</ul>
        )}
      </section>
      <section className="grid gap-3 sm:grid-cols-3">
        <Link prefetch={false} href="/medecins?q=psychiatre" className="flex flex-col gap-1 rounded-2xl border bg-white p-4 text-sm hover:border-primary"><Stethoscope className="size-6 text-primary" aria-hidden /><strong>Trouver un psychiatre</strong><span className="text-muted-foreground">Dans l&apos;annuaire des médecins vérifiés.</span></Link>
        <Link prefetch={false} href="/centres-specialises?besoin=sante_mentale" className="flex flex-col gap-1 rounded-2xl border bg-white p-4 text-sm hover:border-primary"><HeartHandshake className="size-6 text-primary" aria-hidden /><strong>Centres spécialisés</strong><span className="text-muted-foreground">Structures qui accueillent en santé mentale.</span></Link>
        <Link prefetch={false} href="/questions-pharmacien" className="flex flex-col gap-1 rounded-2xl border bg-white p-4 text-sm hover:border-primary"><Users className="size-6 text-primary" aria-hidden /><strong>Une question sur un traitement</strong><span className="text-muted-foreground">Un pharmacien vous répond.</span></Link>
      </section>
      <section className="space-y-2 rounded-2xl bg-muted/50 p-4 text-sm">
        <h2 className="font-bold text-brand-deep">Prendre soin de son moral au quotidien</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>En parler à une personne de confiance : un proche, un ami, un responsable religieux, un enseignant.</li>
          <li>Garder un rythme : se lever et se coucher à heures fixes, manger régulièrement, bouger un peu chaque jour.</li>
          <li>Éviter l&apos;alcool et les drogues pour « tenir » : ils aggravent l&apos;angoisse et la tristesse.</li>
          <li>Consulter un médecin si les difficultés durent plus de deux semaines ou empêchent de vivre normalement.</li>
        </ul>
        <p className="text-xs text-muted-foreground">SantéProxi oriente, il ne pose pas de diagnostic et ne remplace pas un professionnel. Ce que vous lisez sur cette page n&apos;est pas enregistré.</p>
      </section>
    </div>
  );
}
