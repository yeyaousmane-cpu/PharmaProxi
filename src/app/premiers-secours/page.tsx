import Link from "next/link";
import { ListenButton } from "@/components/speech/listen-button";
import { AudioGuide } from "@/components/audio/audio-guide";
import { Clock, Phone, Siren, WifiOff } from "lucide-react";
import { ArticleCard, MedicalDisclaimer, type ArticleRow } from "@/components/health/health-bits";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { getSettings } from "@/lib/settings";

export const metadata = { title: "Premiers secours", description: "Les gestes qui sauvent : saignement, brûlure, étouffement, convulsions, noyade, morsure de serpent, diarrhée de l'enfant, signes de danger." };
export const revalidate = 0;

export default async function FirstAid() {
  let articles: ArticleRow[] = [];
  let upcoming: { title: string; status: string }[] = [];
  const settings = await getSettings();
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const [{ data: rows }, { data: up }] = await Promise.all([
      supabase.rpc("health_search", { p_query: null, p_category: "urgences", p_audience: null, p_kind: null, p_limit: 50, p_offset: 0 }),
      supabase.rpc("health_upcoming", { p_category: "urgences" }),
    ]);
    articles = (rows as ArticleRow[]) ?? [];
    upcoming = (up as { title: string; status: string }[]) ?? [];
  }
  const numbers = settings.emergency_numbers?.trim();
  return (
    <div id="ps-texte" lang="fr" dir="ltr" className="container-page max-w-4xl space-y-6 py-6">
      <ListenButton targetId="ps-texte" lang="fr" />
      <header className="space-y-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-brand-deep"><Siren className="size-7 text-red-600" aria-hidden /> Premiers secours : les gestes qui sauvent</h1>
        <p className="max-w-3xl text-muted-foreground">Avant l&apos;arrivée au centre de santé, quelques gestes simples peuvent sauver une vie. Chaque fiche est relue et validée par un professionnel de santé avant d&apos;être publiée.</p>
        <AudioGuide target="premiers-secours" />
      </header>
      <section className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-950">
        <p className="text-lg font-bold">En cas d&apos;urgence, d&apos;abord : appelez les secours ou partez vers le centre de santé le plus proche.</p>
        {numbers ? <p className="mt-1 flex items-center gap-2 text-xl font-bold"><Phone className="size-5" aria-hidden /> {numbers}</p> : null}
        <Link prefetch={false} href="/urgences" className="mt-2 inline-block font-semibold underline">Services d&apos;urgence et pharmacies de garde</Link>
      </section>
      <p className="flex items-start gap-2 rounded-xl bg-brand-mint p-3 text-sm text-brand-deep"><WifiOff className="mt-0.5 size-4 shrink-0" aria-hidden />Ouvrez cette page et les fiches une fois avec une connexion : elles restent ensuite consultables sur ce téléphone sans réseau.</p>
      {articles.length > 0 ? (
        <ul className="grid gap-3 sm:grid-cols-2">{articles.map((a) => <li key={a.slug}><ArticleCard a={a} /></li>)}</ul>
      ) : (
        <div className="rounded-2xl border bg-white p-5 text-sm">
          <p className="font-semibold">Les fiches de premiers secours sont en cours de validation médicale.</p>
          {upcoming.length > 0 && (
            <ul className="mt-2 space-y-1 text-muted-foreground">{upcoming.map((u) => <li key={u.title} className="flex items-center gap-2"><Clock className="size-3.5" aria-hidden />{u.title}</li>)}</ul>
          )}
        </div>
      )}
      <MedicalDisclaimer />
      <p className="text-xs text-muted-foreground">Pour apprendre les gestes en pratique, renseignez-vous auprès de la Croix-Rouge malienne ou de votre centre de santé.</p>
    </div>
  );
}
