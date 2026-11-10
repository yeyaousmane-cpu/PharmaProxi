import Link from "next/link";
import { BadgeCheck,
  Activity, Apple, Brain, Ear, HandHeart, HeartHandshake, Moon, Music, Phone, ShieldAlert, Siren, Smile, Sparkles, Stethoscope, Sun, Users, Wine, Wind,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { formatDate } from "@/lib/format";
import { ListenButton } from "@/components/speech/listen-button";

export const metadata = {
  title: "Santé mentale : comprendre, prendre soin, trouver de l'aide",
  description: "Prendre soin de son moral au quotidien, repérer les signes qui doivent alerter, comprendre qui consulter, trouver de l'aide au Mali. En cas de danger immédiat, appelez les urgences.",
};
export const revalidate = 600;

type Line = { id: string; name: string; phone: string; hours: string | null; description: string | null; topic: string; source: string; verified_at: string };
const TOPIC: Record<string, string> = { sante_mentale: "Santé mentale", violences: "Violences", addictions: "Addictions", jeunes: "Jeunes", autre: "Autre" };

const habits: [typeof Brain, string, string][] = [
  [Activity, "Bouger régulièrement", "Marcher, danser, jardiner : un peu chaque jour aide l'humeur et le sommeil."],
  [Moon, "Bien dormir", "Des horaires réguliers et un vrai temps de repos."],
  [Sun, "Prendre la lumière du jour", "Sortir le matin, même quelques minutes."],
  [Wind, "Se relaxer", "Respirer lentement, prier, méditer, faire une pause."],
  [Apple, "Manger équilibré", "Des repas réguliers, de l'eau, des fruits et légumes."],
  [Music, "Garder des loisirs", "Une activité qui fait plaisir, seul ou à plusieurs."],
  [Smile, "Reconnaître ses émotions", "Nommer ce que l'on ressent, sans honte."],
  [Users, "Entretenir ses liens", "Famille, amis, voisins, grin, communauté."],
  [Ear, "Parler quand ça ne va pas", "Se confier est une force, pas une faiblesse."],
  [Sparkles, "Cultiver le positif", "Des moments agréables, sans nier les difficultés."],
  [Wine, "Éviter alcool et drogues", "Ils soulagent un moment puis aggravent l'angoisse et la tristesse."],
];

const signs: [string, string][] = [
  ["Tristesse qui dure", "Une humeur triste ou vide presque tous les jours, pendant plus de deux semaines."],
  ["Perte d'intérêt", "Plus d'envie pour ce qui faisait plaisir avant."],
  ["Sommeil perturbé", "Difficulté à s'endormir, réveils fréquents, ou au contraire dormir beaucoup plus."],
  ["Fatigue inhabituelle", "Épuisement sans raison claire, manque d'énergie."],
  ["Angoisse, inquiétude", "Peurs envahissantes, cœur qui bat fort, sensation d'étouffer."],
  ["Isolement", "Se couper des proches, ne plus sortir."],
  ["Changements d'appétit", "Manger beaucoup moins ou beaucoup plus."],
  ["Irritabilité", "Colère facile, disputes, impatience inhabituelle."],
  ["Difficulté à se concentrer", "Au travail, à l'école, dans les tâches du quotidien."],
  ["Consommation qui augmente", "Alcool, tabac, médicaments ou drogues pour tenir."],
  ["Comportements inhabituels", "Propos ou réactions qui inquiètent l'entourage, perte de contact avec la réalité."],
  ["Idées noires", "Penser que la vie ne vaut pas la peine, envie de disparaître : parlez-en tout de suite à quelqu'un."],
];

const pros: [string, string, string | null][] = [
  ["Médecin généraliste", "Souvent le premier interlocuteur : il écoute, examine, élimine une cause physique et oriente si besoin.", "/medecins?q=generaliste"],
  ["Psychiatre", "Médecin spécialiste des troubles psychiques : il pose un diagnostic et peut prescrire un traitement.", "/medecins?q=psychiatre"],
  ["Psychologue", "Professionnel de l'écoute et de l'accompagnement par la parole ; il ne prescrit pas de médicaments.", null],
  ["Infirmier ou infirmière en santé mentale", "Accompagne le suivi, les soins et l'éducation, notamment dans les services spécialisés.", null],
  ["Centre de santé et services spécialisés", "Accueil, orientation et prise en charge selon les services disponibles près de chez vous.", "/centres-specialises?besoin=sante_mentale"],
];

const sources: [string, string, string, string][] = [
  ["Organisation mondiale de la Santé — « Over a billion people living with mental health conditions – services require urgent scale-up »", "https://www.who.int/news/item/02-09-2025-over-a-billion-people-living-with-mental-health-conditions-services-require-urgent-scale-up", "2 septembre 2025", "9 novembre 2026"],
];

function H2({ id, kicker, children }: { id: string; kicker: string; children: React.ReactNode }) {
  return (<div className="scroll-mt-24" id={id}><p className="text-sm font-bold uppercase tracking-widest text-[#068132]">{kicker}</p><h2 className="mt-1 text-2xl font-extrabold text-[#052D1E] md:text-3xl">{children}</h2></div>);
}

/**
 * Orientation et information uniquement : aucun diagnostic, aucun conseil de traitement.
 * Les lignes d'écoute ne s'affichent qu'après vérification ; les textes sont à faire relire par un professionnel de santé mentale.
 */
export default async function SanteMentale() {
  let lines: Line[] = [];
  let fiches: { slug: string; title: string; summary: string; validator_name: string | null; validated_at: string | null }[] = [];
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const [l, f] = await Promise.all([
      supabase.from("support_lines").select("*").eq("active", true).order("sort"),
      supabase.from("health_articles").select("slug, title, summary, validator_name, validated_at, health_categories!inner(slug)").eq("status", "published").eq("health_categories.slug", "sante-mentale").order("title").limit(30),
    ]);
    lines = (l.data ?? []) as Line[];
    fiches = (f.data ?? []) as unknown as typeof fiches;
  }
  const toc = [["parler", "Besoin de parler maintenant"], ["quotidien", "Prendre soin de soi"], ["sommeil", "Le sommeil"], ["signes", "Les signes qui alertent"], ["professionnels", "Qui consulter ?"], ["proche", "Aider un proche"], ["realites", "Santé mentale et réalités africaines"], ["sources", "Sources"]];
  return (
    <div lang="fr" dir="ltr">
      <header className="bg-[#052D1E] text-white">
        <div className="container-page max-w-5xl py-12 md:py-16">
          <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-[#9CCBAE]"><Brain className="size-5" aria-hidden /> Santé mentale</p>
          <h1 className="mt-3 max-w-3xl text-3xl font-extrabold leading-tight md:text-5xl">Ce que vous ressentez compte. En parler est un premier pas.</h1>
          <p className="mt-4 max-w-3xl text-lg text-white/85">Tristesse qui dure, angoisse, fatigue, nuits difficiles, choc après un événement : ces difficultés sont fréquentes et elles se soignent. Cette page vous aide à prendre soin de vous, à repérer les signes qui doivent alerter et à trouver de l&apos;aide.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a href="#parler" className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-white px-5 font-semibold text-[#052D1E]"><Phone className="size-4" aria-hidden /> Parler à quelqu&apos;un</a>
            <a href="#professionnels" className="inline-flex min-h-12 items-center gap-2 rounded-xl border-2 border-white/40 px-5 font-semibold">Trouver un professionnel</a>
          </div>
        </div>
      </header>

      <div className="container-page max-w-6xl space-y-3 pt-6">
        <ListenButton targetId="sm-texte" lang="fr" />
        <section aria-labelledby="fiches-validees" className="rounded-2xl border bg-white p-5">
          <h2 id="fiches-validees" className="flex items-center gap-2 text-lg font-bold text-[#052D1E]"><BadgeCheck className="size-5 text-[#068132]" aria-hidden /> Fiches validées par des professionnels de santé</h2>
          {fiches.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">Aucune fiche de santé mentale n&apos;a encore terminé le circuit de validation médicale. Les fiches apparaîtront ici après relecture et validation par un professionnel, avec son nom, ses sources et la date de prochaine révision.</p>
          ) : (
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">{fiches.map((f) => (
              <li key={f.slug}><Link prefetch={false} href={`/sante/fiche/${f.slug}`} className="block rounded-xl border p-3 hover:border-[#068132]">
                <span className="font-semibold text-[#052D1E]">{f.title}</span>
                {f.validator_name && f.validated_at && <span className="mt-1 block text-xs text-emerald-800">Validée par {f.validator_name} le {formatDate(f.validated_at)}</span>}
              </Link></li>))}</ul>
          )}
          <p className="mt-3 text-xs text-muted-foreground">Les repères ci-dessous sont des informations générales d&apos;orientation, en attente de relecture par un professionnel de santé mentale. Ils ne remplacent pas une consultation.</p>
        </section>
      </div>
      <div id="sm-texte" className="container-page grid max-w-6xl gap-10 py-8 lg:grid-cols-[14rem_1fr]">
        <nav aria-label="Sur cette page" className="hidden lg:block" data-no-listen>
          <ol className="sticky top-24 space-y-1 text-sm">{toc.map(([id, l]) => <li key={id}><a href={`#${id}`} className="block rounded-lg px-2 py-1.5 hover:bg-[#EAF6EE]">{l}</a></li>)}</ol>
        </nav>
        <div className="min-w-0 space-y-14">
          <section className="rounded-2xl border-2 border-red-200 bg-red-50 p-5 text-red-950" aria-label="Danger immédiat">
            <p className="flex items-center gap-2 text-lg font-bold"><Siren className="size-6" aria-hidden /> Si vous ou un proche êtes en danger immédiat</p>
            <p className="mt-1">Ne restez pas seul. Allez au service d&apos;urgence le plus proche ou appelez les secours. Restez avec la personne et éloignez ce qui pourrait la blesser.</p>
            <Link prefetch={false} href="/sos" className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-red-700 px-4 font-bold text-white">SOS Santé : numéros d&apos;urgence</Link>
          </section>

          <section className="space-y-4" aria-labelledby="parler">
            <H2 id="parler" kicker="Tout de suite">Besoin de parler maintenant ?</H2>
            {lines.length === 0 ? (
              <p className="rounded-2xl border bg-white p-5 text-muted-foreground">Les lignes d&apos;écoute et d&apos;aide disponibles au Mali seront affichées ici après leur vérification par l&apos;équipe SantéProxi. En attendant, parlez-en à une personne de confiance, à votre médecin ou à votre centre de santé.</p>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">{lines.map((l) => (
                <li key={l.id} className="flex flex-col gap-1 rounded-2xl border-2 border-[#068132]/20 bg-white p-5">
                  <span className="text-xs font-semibold uppercase text-[#1D5FA8]">{TOPIC[l.topic]}</span>
                  <span className="text-lg font-bold text-[#052D1E]">{l.name}</span>
                  {l.description && <p className="text-sm text-muted-foreground">{l.description}</p>}
                  <a href={`tel:${l.phone.replace(/\s/g, "")}`} className="mt-2 flex w-fit items-center gap-2 rounded-xl bg-[#068132] px-4 py-2.5 text-lg font-bold text-white"><Phone className="size-5" aria-hidden />{l.phone}</a>
                  {l.hours && <p className="text-sm">{l.hours}</p>}
                  <p className="mt-auto pt-1 text-xs text-muted-foreground">Source : {l.source} · vérifié le {formatDate(l.verified_at)}</p>
                </li>))}</ul>
            )}
            <div className="grid gap-3 sm:grid-cols-3">
              {[[HeartHandshake, "Une personne de confiance", "Un proche, un ami, un responsable religieux, un enseignant."], [Stethoscope, "Votre médecin ou centre de santé", "Pour être écouté(e), examiné(e) et orienté(e)."], [Users, "Un pharmacien", "Pour une question sur un traitement."]].map(([Icon, t, d]) => {
                const I = Icon as typeof Brain;
                return <div key={t as string} className="rounded-2xl bg-[#EAF6EE] p-4"><I className="size-6 text-[#068132]" aria-hidden /><p className="mt-2 font-bold text-[#052D1E]">{t as string}</p><p className="text-sm text-muted-foreground">{d as string}</p></div>;
              })}
            </div>
          </section>

          <section className="space-y-4" aria-labelledby="quotidien">
            <H2 id="quotidien" kicker="Au quotidien">Pas de santé sans santé mentale</H2>
            <p className="max-w-3xl text-muted-foreground">La santé mentale, c&apos;est pouvoir faire face aux difficultés de la vie, réaliser ses capacités, apprendre, travailler et participer à la vie de sa famille et de sa communauté. Elle s&apos;entretient, comme la santé du corps.</p>
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{habits.map(([Icon, t, d]) => (
              <li key={t} className="flex gap-3 rounded-2xl border bg-white p-4"><span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#EAF6EE] text-[#068132]"><Icon className="size-5" aria-hidden /></span>
                <span><span className="block font-bold text-[#052D1E]">{t}</span><span className="text-sm text-muted-foreground">{d}</span></span></li>))}</ul>
          </section>

          <section className="space-y-4 rounded-3xl bg-[#1D5FA8] p-6 text-white md:p-8" aria-labelledby="sommeil">
            <div className="scroll-mt-24" id="sommeil"><p className="text-sm font-bold uppercase tracking-widest text-white/70">Repos</p><h2 className="mt-1 text-2xl font-extrabold md:text-3xl">Le sommeil et le moral sont liés</h2></div>
            <p className="max-w-3xl text-white/85">Mal dormir fragilise l&apos;humeur, et les soucis empêchent de dormir. Quelques repères simples :</p>
            <ul className="grid gap-2 sm:grid-cols-2">{["Se coucher et se lever à heures régulières, même le week-end.", "Éviter le café, le thé fort et les boissons énergisantes en fin de journée.", "Poser le téléphone un moment avant de dormir.", "Un endroit calme, sombre et aéré pour la nuit.", "Si les nuits restent difficiles plusieurs semaines, en parler à un médecin."].map((x) => (
              <li key={x} className="rounded-xl bg-white/10 p-3 text-sm">{x}</li>))}</ul>
          </section>

          <section className="space-y-4" aria-labelledby="signes">
            <H2 id="signes" kicker="Être attentif">Les signes auxquels faire attention</H2>
            <p className="max-w-3xl text-muted-foreground">Chacun peut traverser un moment difficile. Ce qui doit alerter : des changements qui <strong>durent</strong> (plus de deux semaines), qui <strong>s&apos;intensifient</strong> ou qui <strong>empêchent de vivre normalement</strong>. Touchez un signe pour en savoir plus.</p>
            <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{signs.map(([t, d], i) => (
              <li key={t}><details className={`group h-full rounded-2xl border p-4 open:shadow-sm ${i === signs.length - 1 ? "border-red-300 bg-red-50" : "bg-white"}`}>
                <summary className="cursor-pointer list-none font-bold text-[#052D1E]"><span className="me-1 text-[#068132] group-open:hidden">+</span><span className="me-1 hidden text-[#068132] group-open:inline">−</span>{t}</summary>
                <p className="mt-2 text-sm text-muted-foreground">{d}</p></details></li>))}</ul>
            <p className="flex items-start gap-2 rounded-xl bg-[#EAF6EE] p-3 text-sm"><ShieldAlert className="mt-0.5 size-4 shrink-0 text-[#068132]" aria-hidden /> Cette liste aide à repérer, elle ne permet pas de poser un diagnostic. Seul un professionnel peut le faire.</p>
          </section>

          <section className="space-y-4" aria-labelledby="professionnels">
            <H2 id="professionnels" kicker="Se faire aider">Qui consulter ?</H2>
            <ul className="grid gap-3 md:grid-cols-2">{pros.map(([t, d, href]) => (
              <li key={t} className="flex flex-col rounded-2xl border bg-white p-5"><p className="font-bold text-[#052D1E]">{t}</p><p className="mt-1 flex-1 text-sm text-muted-foreground">{d}</p>
                {href && <Link prefetch={false} href={href} className="mt-3 w-fit rounded-xl bg-[#068132] px-4 py-2 text-sm font-semibold text-white hover:bg-[#052D1E]">Trouver sur SantéProxi</Link>}</li>))}</ul>
          </section>

          <section className="space-y-4" aria-labelledby="proche">
            <H2 id="proche" kicker="Entourage">Accompagner un proche en souffrance</H2>
            <div className="grid gap-3 md:grid-cols-3">
              {[["Écouter sans juger", "Laissez-le parler, montrez que vous êtes là. Évitez « ce n'est rien » ou « secoue-toi »."],
                ["Encourager à consulter", "Proposez de l'accompagner chez un médecin ou au centre de santé, aidez à prendre rendez-vous."],
                ["Agir en cas de danger", "S'il parle de se faire du mal, ne le laissez pas seul et contactez les secours."]].map(([t, d], i) => (
                <div key={t} className={`rounded-2xl p-5 ${i === 2 ? "bg-red-50 text-red-950" : "bg-[#EAF6EE]"}`}><HandHeart className="size-6 text-[#068132]" aria-hidden /><p className="mt-2 font-bold">{t}</p><p className="mt-1 text-sm">{d}</p></div>))}
            </div>
            <p className="text-sm text-muted-foreground">Prendre soin d&apos;un proche fatigue : pensez aussi à vous et à en parler.</p>
          </section>

          <section className="space-y-4 rounded-3xl bg-[#EAF6EE] p-6 md:p-8" aria-labelledby="realites">
            <div className="scroll-mt-24" id="realites"><p className="text-sm font-bold uppercase tracking-widest text-[#068132]">Chez nous</p><h2 className="mt-1 text-2xl font-extrabold text-[#052D1E] md:text-3xl">Santé mentale et réalités africaines</h2></div>
            <ul className="grid gap-3 md:grid-cols-2">{[
              ["Briser le silence", "La souffrance psychique est encore souvent cachée par peur du regard des autres. En parler n'est ni une faiblesse ni une honte."],
              ["La famille, une force", "Le soutien de la famille et de la communauté aide beaucoup ; il complète l'avis d'un professionnel, sans le remplacer."],
              ["Croyances et soins", "La foi et les traditions apportent du réconfort. Quand les difficultés durent, consulter un professionnel de santé reste important."],
              ["Des services en développement", "Les professionnels de santé mentale sont encore peu nombreux : votre médecin et votre centre de santé sont une bonne porte d'entrée."],
            ].map(([t, d]) => <li key={t} className="rounded-2xl bg-white p-5"><p className="font-bold text-[#052D1E]">{t}</p><p className="mt-1 text-sm text-muted-foreground">{d}</p></li>)}</ul>
            <div className="grid gap-3 sm:grid-cols-3">{[["Plus d'un milliard", "de personnes vivent avec un trouble de santé mentale dans le monde ; l'anxiété et la dépression sont les plus fréquentes."], ["13 pour 100 000", "habitants : nombre médian de professionnels de santé mentale dans le monde."], ["2 %", "des budgets de santé publics consacrés en médiane à la santé mentale."]].map(([n, l]) => (
              <div key={n} className="rounded-2xl bg-[#052D1E] p-5 text-white"><p className="text-2xl font-extrabold text-[#02A934]">{n}</p><p className="mt-1 text-sm text-white/85">{l}</p><p className="mt-2 text-xs text-white/60">Source : OMS, 2 septembre 2025</p></div>))}</div>
          </section>

          <section className="space-y-2" aria-labelledby="sources">
            <h2 id="sources" className="scroll-mt-24 text-lg font-bold text-[#052D1E]">Consulter les sources</h2>
            <ul className="space-y-1 text-sm">{sources.map(([t, url, pub, seen]) => (
              <li key={url}><a href={url} target="_blank" rel="noopener noreferrer" className="text-[#068132] underline">{t}</a> — publié le {pub}, consulté le {seen}.</li>))}</ul>
            <p className="text-xs text-muted-foreground">SantéProxi oriente : il ne pose pas de diagnostic et ne remplace pas un professionnel. Ce que vous lisez sur cette page n&apos;est pas enregistré. Contenu en attente de relecture par un professionnel de santé mentale.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
