import Link from "next/link";
import { ListenButton } from "@/components/speech/listen-button";
import { AudioGuide } from "@/components/audio/audio-guide";
import { Award, BookOpen, Clock, GraduationCap, Megaphone, Phone, Siren, WifiOff } from "lucide-react";
import { ShareLocation } from "@/components/first-aid/share-location";
import { ArticleCard, MedicalDisclaimer, type ArticleRow } from "@/components/health/health-bits";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { getSettings } from "@/lib/settings";

export const metadata = { title: "Premiers secours", description: "Les gestes qui sauvent : saignement, brûlure, étouffement, convulsions, noyade, morsure de serpent, diarrhée de l'enfant, signes de danger." };
export const revalidate = 0;

export default async function FirstAid() {
  let articles: ArticleRow[] = [];
  let upcoming: { title: string; status: string }[] = [];
  let stats = null as { citoyens_formes_verifies: number; formations_organisees: number; organismes_partenaires: number; organismes_identifies: number; regions_couvertes: number } | null;
  let campaigns: { id: string; title: string; audience: string; place: string | null; starts_on: string }[] = [];
  const settings = await getSettings();
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const [{ data: rows }, { data: up }, st, camp] = await Promise.all([
      supabase.rpc("health_search", { p_query: null, p_category: "urgences", p_audience: null, p_kind: null, p_limit: 50, p_offset: 0 }),
      supabase.rpc("health_upcoming", { p_category: "urgences" }),
      supabase.rpc("first_aid_stats"),
      supabase.from("first_aid_campaigns").select("id, title, audience, place, starts_on").eq("status", "publiee").gte("starts_on", new Date().toISOString().slice(0, 10)).order("starts_on").limit(4),
    ]);
    stats = st.data as typeof stats; campaigns = (camp.data ?? []) as typeof campaigns;
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
        <div className="flex flex-wrap gap-2 pt-1">
          <a href="#fiches" className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-red-700 px-5 font-bold text-white"><BookOpen className="size-5" aria-hidden /> Apprendre les gestes qui sauvent</a>
          <Link prefetch={false} href="/premiers-secours/formations" className="inline-flex min-h-12 items-center gap-2 rounded-xl border-2 border-red-700 px-5 font-bold text-red-800"><GraduationCap className="size-5" aria-hidden /> Trouver une formation près de chez moi</Link>
          <Link prefetch={false} href="/premiers-secours/badge" className="inline-flex min-h-12 items-center gap-2 rounded-xl border-2 px-5 font-bold"><Award className="size-5 text-amber-600" aria-hidden /> Badge « Citoyen sauveteur formé »</Link>
        </div>
      </header>
      <section className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-950">
        <p className="text-lg font-bold">En cas d&apos;urgence, d&apos;abord : appelez les secours ou partez vers le centre de santé le plus proche.</p>
        {numbers ? <p className="mt-1 flex items-center gap-2 text-xl font-bold"><Phone className="size-5" aria-hidden /> {numbers}</p> : null}
        <Link prefetch={false} href="/urgences" className="mt-2 inline-block font-semibold underline">Services d&apos;urgence et pharmacies de garde</Link>
      </section>
      <section aria-labelledby="reflexes" className="space-y-3 rounded-2xl border bg-white p-5">
        <h2 id="reflexes" className="text-lg font-bold text-brand-deep">En attendant les secours : les bons réflexes</h2>
        <ol className="grid gap-3 text-sm sm:grid-cols-3">
          <li className="rounded-xl bg-muted/50 p-3"><p className="font-bold">1. Protéger</p><p>Vérifiez qu&apos;il n&apos;y a pas de danger supplémentaire (circulation, feu, électricité). N&apos;approchez que si cela ne présente aucun risque pour vous ; sinon, éloignez les curieux et alertez.</p></li>
          <li className="rounded-xl bg-muted/50 p-3"><p className="font-bold">2. Alerter</p><p>Dites : ce qui s&apos;est passé, le lieu précis, le nombre de victimes et leur état, les dangers éventuels, ce que vous avez déjà fait. Répondez aux questions et ne raccrochez pas le premier.</p></li>
          <li className="rounded-xl bg-muted/50 p-3"><p className="font-bold">3. Secourir</p><p>Si vous avez été formé, faites les gestes calmement en attendant les secours. Sinon, restez auprès de la victime, rassurez-la et suivez les conseils des secours.</p></li>
        </ol>
        <div className="rounded-xl bg-red-50 p-3"><p className="mb-2 text-sm font-semibold text-red-950">Communiquer clairement votre localisation</p><ShareLocation /></div>
        <p className="text-xs text-muted-foreground">Source : Croix-Rouge française, « Les étapes pour porter secours : protéger, alerter, secourir ». SantéProxi ne remplace pas les services de secours et ne déclenche aucune intervention.</p>
      </section>
      <section aria-labelledby="campagne" className="space-y-3 rounded-2xl bg-[#052D1E] p-5 text-white">
        <h2 id="campagne" className="flex items-center gap-2 text-xl font-extrabold"><Megaphone className="size-6" aria-hidden /> Un citoyen formé peut sauver une vie.</h2>
        <p className="text-sm text-white/85">Étudiants, élèves, conducteurs, familles, entreprises : formez-vous aux premiers secours auprès d&apos;un organisme reconnu. Votre badge « Citoyen sauveteur formé » est délivré seulement après validation de l&apos;organisme formateur.</p>
        {stats && (
          <dl className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
            {[["Citoyens formés (vérifiés)", stats.citoyens_formes_verifies], ["Formations publiées", stats.formations_organisees], ["Organismes partenaires (accord signé)", stats.organismes_partenaires], ["Régions couvertes", stats.regions_couvertes]].map(([l, n]) => (
              <div key={l as string} className="rounded-xl bg-white/10 p-3"><dt className="text-xs text-white/80">{l}</dt><dd className="text-2xl font-extrabold">{n}</dd></div>))}
          </dl>
        )}
        <p className="text-xs text-white/75">Chiffres calculés sur les attestations vérifiées et les sessions publiées dans SantéProxi (aucun chiffre estimé). {stats ? `${stats.organismes_identifies} organisme(s) de formation identifié(s), présentés comme partenaires potentiels tant qu'aucun accord n'est signé.` : ""}</p>
        {campaigns.length > 0 && <ul className="space-y-1 text-sm">{campaigns.map((c) => <li key={c.id}>• {c.title} — {c.place ?? "lieu à préciser"}, à partir du {new Date(c.starts_on).toLocaleDateString("fr-FR")}</li>)}</ul>}
        <Link prefetch={false} href="/premiers-secours/formations" className="inline-block rounded-xl bg-white px-4 py-2 font-bold text-[#052D1E]">Découvrir les formations</Link>
      </section>
      <p className="flex items-start gap-2 rounded-xl bg-brand-mint p-3 text-sm text-brand-deep"><WifiOff className="mt-0.5 size-4 shrink-0" aria-hidden />Ouvrez cette page et les fiches une fois avec une connexion : elles restent ensuite consultables sur ce téléphone sans réseau.</p>
      <h2 id="fiches" className="scroll-mt-24 text-lg font-bold text-brand-deep">Les fiches des gestes qui sauvent</h2>
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
      <p className="text-xs text-muted-foreground">Lire une fiche ou regarder une vidéo ne remplace pas une formation pratique et ne donne pas droit au badge : <Link prefetch={false} href="/premiers-secours/formations" className="underline">trouvez une formation</Link>.</p>
    </div>
  );
}
