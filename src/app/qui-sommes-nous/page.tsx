import Link from "next/link";
import {
  Accessibility, ArrowRight, BadgeCheck, BookOpenCheck, Briefcase, Building2, CalendarCheck, Compass, FlaskConical, Globe2, Handshake, HeartHandshake,
  HeartPulse, Languages, Lightbulb, LockKeyhole, MapPinned, Megaphone, Network, Pill, Scale, Search, ShieldCheck, Sparkles, Stethoscope, Users, WifiOff,
} from "lucide-react";
import { POSITIONING } from "@/lib/brand";

export const metadata = {
  title: "Qui sommes-nous ?",
  description: "SantéProxi, plateforme numérique de santé née au Mali avec une ambition africaine : notre raison d'être, notre vision, nos engagements.",
};

const SIGNATURE = "Ensemble, construisons la santé dont nous rêvons toutes et tous.";

const facts: [string, string, string][] = [
  ["25,4 millions", "d'habitants au Mali, dont la moitié a moins de 16 ans", "DataReportal, Digital 2026 : Mali (estimations ONU, oct. 2025)"],
  ["0,2", "médecin pour 1 000 habitants", "Banque mondiale, indicateur « Physicians (per 1,000 people) », 2022"],
  ["8 451", "structures de santé recensées, dont 853 pharmacies", "DNAT, Atlas des infrastructures sanitaires du Mali, 2025"],
  ["35 %", "d'utilisateurs d'Internet, pour 92 % de connexions mobiles", "DataReportal, Digital 2026 : Mali"],
];

const why: [typeof Search, string, string][] = [
  [Search, "Trouver les bons professionnels et les structures de santé", "Savoir qui consulte où, quel jour, et quel établissement offre le service recherché."],
  [BookOpenCheck, "Accéder plus facilement à une information fiable", "Des contenus clairs, vérifiés et datés, pour mieux comprendre et prévenir."],
  [CalendarCheck, "Faciliter les démarches et le parcours de soins", "Préparer un rendez-vous, trouver un médicament, retrouver ses documents."],
  [Network, "Accompagner la transformation numérique des acteurs", "Des outils simples pour les cabinets, pharmacies, laboratoires et établissements."],
];

const patients: [typeof Search, string, boolean][] = [
  [Stethoscope, "Identifier des professionnels de santé", true], [Pill, "Trouver pharmacies et médicaments", true], [FlaskConical, "Trouver des laboratoires et des examens", true],
  [CalendarCheck, "Préparer et organiser ses rendez-vous", true], [HeartPulse, "Découvrir des contenus de prévention", true], [Languages, "Écouter des guides dans des langues nationales", true],
  [LockKeyhole, "Garder son dossier santé en sécurité", true], [Sparkles, "Accéder progressivement à de nouveaux services", false],
];

const pros: [string, string][] = [
  ["Médecins", "Fiche vérifiée, lieux et jours de consultation, agenda et demandes de rendez-vous."],
  ["Infirmiers et sages-femmes", "Visibilité des soins à domicile et de leur zone d'intervention."],
  ["Pharmaciens", "Stocks mis à jour depuis un téléphone, réservations, gardes."],
  ["Laboratoires", "Examens et tarifs publiés, prélèvements à domicile, dépôt sécurisé des résultats."],
  ["Cliniques et hôpitaux", "Services, équipes et informations pratiques à jour."],
  ["Autres professionnels", "Un référencement progressif, construit avec les ordres et les associations."],
];

const pillars: [typeof Search, string, string[]][] = [
  [Accessibility, "Accessibilité et inclusion", ["Rapprocher les services de santé des populations", "Des contenus et guides audio en langues nationales", "Des parcours pensés pour les personnes peu alphabétisées", "Des pages essentielles lisibles même sans connexion"]],
  [Megaphone, "Prévention et santé publique", ["Diffuser des informations vérifiées et datées", "Encourager dépistages et consultations préventives", "Lutter contre les faux médicaments et la désinformation"]],
  [Briefcase, "Économie et emploi", ["Créer des emplois directs et indirects dans la santé numérique", "Former et valoriser de jeunes talents", "Faire émerger des solutions conçues en Afrique"]],
  [Building2, "Transformation du système de santé", ["Faciliter les échanges entre acteurs", "Des outils adaptés aux réalités locales", "Des données utiles, agrégées et respectueuses de la confidentialité"]],
];

const principles: [typeof Search, string][] = [
  [Users, "L'humain au centre de la conception"], [Stethoscope, "L'expertise des professionnels de santé"], [BadgeCheck, "La fiabilité des informations médicales"],
  [LockKeyhole, "La protection des données personnelles"], [Accessibility, "L'accessibilité numérique"], [Lightbulb, "Une IA responsable, qui ne remplace jamais le médecin"], [Compass, "L'amélioration continue"],
];

const commitments: [string, string][] = [
  ["Accessibilité", "Rendre les services plus faciles à utiliser, sur tous les téléphones."], ["Inclusion", "Prendre en compte les réalités linguistiques et sociales."],
  ["Fiabilité", "Privilégier des informations vérifiées, sourcées et datées."], ["Confidentialité", "Protéger les données personnelles et de santé."],
  ["Responsabilité", "Concevoir des services utiles et proportionnés."], ["Collaboration", "Construire avec les professionnels et les institutions."],
  ["Innovation", "Développer des solutions adaptées aux besoins africains."],
];

function Kicker({ children }: { children: React.ReactNode }) {
  return <p className="text-sm font-bold uppercase tracking-widest text-[#068132]">{children}</p>;
}

export default function AboutPage() {
  return (
    <div className="overflow-x-clip">
      {/* 1. Raison d'être */}
      <section className="relative bg-[#052D1E] text-white">
        <div aria-hidden className="absolute -end-24 -top-24 size-96 rounded-full bg-[#068132]/40 blur-3xl" />
        <div aria-hidden className="absolute -bottom-32 start-1/3 size-80 rounded-full bg-[#1D5FA8]/30 blur-3xl" />
        <div className="container-page relative grid max-w-6xl items-center gap-10 py-16 md:grid-cols-[1.3fr_1fr] md:py-24">
          <div>
            <p className="text-sm font-bold uppercase tracking-widest text-[#9CCBAE]">Notre raison d&apos;être</p>
            <h1 className="mt-3 text-4xl font-extrabold leading-tight md:text-5xl">{SIGNATURE}</h1>
            <div className="mt-6 space-y-3 text-lg text-white/85">
              <p>La santé est un droit fondamental et un enjeu collectif. Pourtant, accéder aux bons professionnels, trouver une information fiable ou identifier les services de santé adaptés reste un défi pour de nombreuses personnes.</p>
              <p className="font-semibold text-white">{POSITIONING}</p>
              <p>Chez SantéProxi, nous croyons que le numérique peut contribuer à rapprocher les populations des services de santé et à faciliter le quotidien de celles et ceux qui prennent soin des autres.</p>
              <p>Notre ambition : construire, avec les acteurs de santé, un écosystème plus accessible, plus humain et mieux connecté.</p>
            </div>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#vision" className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-white px-5 font-semibold text-[#052D1E] hover:bg-[#EAF6EE]">Découvrir notre vision <ArrowRight className="size-4 rtl:-scale-x-100" aria-hidden /></a>
              <a href="#solutions" className="inline-flex min-h-12 items-center gap-2 rounded-xl border-2 border-white/40 px-5 font-semibold hover:border-white">Découvrir nos solutions</a>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3" aria-hidden>
            {[HeartHandshake, Stethoscope, Pill, Languages].map((Icon, i) => (
              <div key={i} className={`grid aspect-square place-items-center rounded-3xl ${["bg-[#068132]", "bg-white/10", "bg-white/10", "bg-[#1D5FA8]"][i]} motion-safe:transition motion-safe:hover:-translate-y-1`}>
                <Icon className="size-16 text-white/90" strokeWidth={1.4} />
              </div>))}
          </div>
        </div>
      </section>

      {/* Vision et mission */}
      <section id="vision" className="scroll-mt-20 bg-[#EAF6EE]">
        <div className="container-page grid max-w-6xl gap-6 py-14 md:grid-cols-2">
          <div className="rounded-3xl bg-white p-7 shadow-sm"><Kicker>Notre vision</Kicker>
            <p className="mt-3 text-xl font-semibold text-[#052D1E]">Contribuer à un écosystème de santé plus accessible, plus humain, plus connecté et mieux informé, où patients, professionnels, pharmacies, laboratoires, établissements et institutions avancent ensemble.</p></div>
          <div className="rounded-3xl bg-white p-7 shadow-sm"><Kicker>Notre mission</Kicker>
            <p className="mt-3 text-xl font-semibold text-[#052D1E]">Faciliter l&apos;accès à l&apos;information sanitaire et aux services de santé, accompagner les patients dans leur parcours de soins et proposer aux professionnels et aux structures de santé des outils numériques simples et utiles.</p></div>
        </div>
      </section>

      {/* 2. Pourquoi */}
      <section className="container-page max-w-6xl space-y-8 py-16">
        <div className="max-w-3xl"><Kicker>Pourquoi SantéProxi ?</Kicker><h2 className="mt-2 text-3xl font-extrabold text-[#052D1E] md:text-4xl">La santé mérite d&apos;être plus accessible à toutes et à tous.</h2></div>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{why.map(([Icon, t, d], i) => (
          <li key={t} className="rounded-3xl border bg-white p-6 motion-safe:transition motion-safe:hover:-translate-y-1 motion-safe:hover:shadow-md">
            <span className="text-sm font-bold text-[#068132]">0{i + 1}</span><Icon className="mt-3 size-9 text-[#068132]" aria-hidden />
            <h3 className="mt-3 font-bold text-[#052D1E]">{t}</h3><p className="mt-1 text-sm text-muted-foreground">{d}</p></li>))}</ul>
      </section>

      {/* Réalités du Mali */}
      <section className="bg-[#052D1E] text-white">
        <div className="container-page max-w-6xl space-y-8 py-16">
          <div className="max-w-3xl"><p className="text-sm font-bold uppercase tracking-widest text-[#9CCBAE]">Pensé à partir des réalités du Mali</p>
            <h2 className="mt-2 text-3xl font-extrabold md:text-4xl">Partir des besoins concrets, pas d&apos;un modèle importé.</h2></div>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{facts.map(([n, l, s]) => (
            <li key={n} className="rounded-3xl bg-white/5 p-6 ring-1 ring-white/10"><p className="text-4xl font-extrabold text-[#02A934]">{n}</p><p className="mt-2 font-semibold">{l}</p><p className="mt-3 text-xs text-white/60">Source : {s}</p></li>))}</ul>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[[MapPinned, "Accès aux soins", "Des distances et des écarts réels entre Bamako, les capitales régionales et les zones rurales ; des services difficiles à identifier."],
              [BookOpenCheck, "Information sanitaire", "Trouver une information fiable, dans une langue comprise, et faire reculer la désinformation."],
              [Stethoscope, "Quotidien des soignants", "Visibilité, démarches, coordination entre acteurs : des besoins exprimés par les professionnels."],
              [WifiOff, "Réalités numériques", "Connexions instables, coût des données, maîtrise inégale de l'écrit et des outils : des interfaces simples et légères."]].map(([Icon, t, d]) => {
              const I = Icon as typeof Search;
              return (<div key={t as string} className="rounded-2xl border border-white/10 p-5"><I className="size-7 text-[#9CCBAE]" aria-hidden /><p className="mt-2 font-bold">{t as string}</p><p className="mt-1 text-sm text-white/75">{d as string}</p></div>);
            })}
          </div>
        </div>
      </section>

      {/* 3. Patients */}
      <section id="solutions" className="container-page max-w-6xl scroll-mt-20 space-y-8 py-16">
        <div className="max-w-3xl"><Kicker>Pour les patients et les familles</Kicker><h2 className="mt-2 text-3xl font-extrabold text-[#052D1E] md:text-4xl">Nous aidons chacun à prendre davantage soin de sa santé.</h2>
          <p className="mt-3 text-muted-foreground">SantéProxi accompagne les personnes tout au long de leur parcours, sans jamais se substituer aux professionnels de santé.</p></div>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{patients.map(([Icon, t, live]) => (
          <li key={t} className="flex items-start gap-3 rounded-2xl border bg-white p-4"><Icon className="mt-0.5 size-6 shrink-0 text-[#068132]" aria-hidden />
            <span><span className="font-semibold text-[#052D1E]">{t}</span>{!live && <span className="mt-1 block text-xs text-muted-foreground">En préparation</span>}</span></li>))}</ul>
      </section>

      {/* 4. Professionnels */}
      <section className="bg-[#EAF6EE]">
        <div className="container-page max-w-6xl space-y-8 py-16">
          <div className="max-w-3xl"><Kicker>Pour les professionnels de santé</Kicker><h2 className="mt-2 text-3xl font-extrabold text-[#052D1E] md:text-4xl">Nous voulons améliorer le quotidien de celles et ceux qui prennent soin de nous.</h2>
            <p className="mt-3 text-muted-foreground">Visibilité, relation avec les patients, rendez-vous, coordination : des outils construits progressivement avec les soignants. Certains sont déjà disponibles, d&apos;autres en préparation.</p></div>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{pros.map(([t, d]) => (
            <li key={t} className="rounded-3xl bg-white p-6 shadow-sm"><p className="font-bold text-[#052D1E]">{t}</p><p className="mt-1 text-sm text-muted-foreground">{d}</p></li>))}</ul>
          <Link prefetch={false} href="/professionnels" className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-[#068132] px-5 font-semibold text-white hover:bg-[#052D1E]">Espace professionnels <ArrowRight className="size-4 rtl:-scale-x-100" aria-hidden /></Link>
        </div>
      </section>

      {/* 5. Impact */}
      <section className="container-page max-w-6xl space-y-8 py-16">
        <div className="max-w-3xl"><Kicker>Impact</Kicker><h2 className="mt-2 text-3xl font-extrabold text-[#052D1E] md:text-4xl">Notre impact positif sur la société.</h2>
          <p className="mt-3 text-muted-foreground">Ce sont nos objectifs. Nous publierons des résultats chiffrés uniquement lorsqu&apos;ils seront mesurés et vérifiables.</p></div>
        <ul className="grid gap-4 md:grid-cols-2">{pillars.map(([Icon, t, items], i) => (
          <li key={t} className={`rounded-3xl p-6 ${i % 3 === 0 ? "bg-[#052D1E] text-white" : "border bg-white"}`}>
            <Icon className={`size-9 ${i % 3 === 0 ? "text-[#9CCBAE]" : "text-[#068132]"}`} aria-hidden />
            <h3 className="mt-3 text-xl font-bold">{t}</h3>
            <ul className="mt-3 space-y-1.5 text-sm">{items.map((x) => <li key={x} className="flex gap-2"><span aria-hidden className={i % 3 === 0 ? "text-[#02A934]" : "text-[#068132]"}>●</span>{x}</li>)}</ul></li>))}</ul>
      </section>

      {/* 6. Innovation */}
      <section className="bg-[#1D5FA8] text-white">
        <div className="container-page grid max-w-6xl gap-10 py-16 md:grid-cols-[1fr_1.2fr]">
          <div><p className="text-sm font-bold uppercase tracking-widest text-white/70">Innovation responsable</p><h2 className="mt-2 text-3xl font-extrabold md:text-4xl">La technologie doit rester au service de l&apos;humain.</h2>
            <p className="mt-4 text-white/85">Nous concevons SantéProxi avec les professionnels de santé et à partir des besoins réels des populations. L&apos;assistant santé oriente et informe : il ne pose aucun diagnostic et ne remplace jamais un médecin.</p></div>
          <ul className="grid gap-3 sm:grid-cols-2">{principles.map(([Icon, t]) => (
            <li key={t} className="flex items-center gap-3 rounded-2xl bg-white/10 p-4"><Icon className="size-6 shrink-0" aria-hidden /><span className="font-semibold">{t}</span></li>))}</ul>
        </div>
      </section>

      {/* 7. Engagements */}
      <section className="container-page max-w-6xl space-y-8 py-16">
        <div className="max-w-3xl"><Kicker>Nos engagements</Kicker><h2 className="mt-2 text-3xl font-extrabold text-[#052D1E] md:text-4xl">Nos engagements pour une santé plus humaine et plus accessible.</h2></div>
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{commitments.map(([t, d], i) => (
          <li key={t} className="rounded-2xl border-s-4 border-[#068132] bg-white p-5 shadow-sm"><p className="text-sm font-bold text-[#068132]">{i + 1}</p><p className="font-bold text-[#052D1E]">{t}</p><p className="mt-1 text-sm text-muted-foreground">{d}</p></li>))}
          <li className="rounded-2xl bg-[#EAF6EE] p-5"><ShieldCheck className="size-6 text-[#068132]" aria-hidden /><p className="mt-2 text-sm"><Link prefetch={false} href="/votre-sante-vos-donnees" className="font-semibold text-[#068132] underline">Votre santé, vos données</Link> : comment nous protégeons vos informations.</p></li>
        </ol>
      </section>

      {/* 8. Ambition */}
      <section className="bg-[#EAF6EE]">
        <div className="container-page grid max-w-6xl items-center gap-10 py-16 md:grid-cols-[1fr_1fr]">
          <div><Kicker>Une ambition africaine</Kicker><h2 className="mt-2 text-3xl font-extrabold text-[#052D1E] md:text-4xl">Née d&apos;une ambition africaine, pensée pour les réalités de chaque territoire.</h2>
            <p className="mt-4 text-muted-foreground">SantéProxi commence au Mali, par une compréhension fine de ses réalités. Notre vision ne s&apos;arrête pas aux frontières : la plateforme est conçue pour s&apos;adapter progressivement à d&apos;autres pays africains. À ce jour, SantéProxi n&apos;est déployée qu&apos;au Mali.</p></div>
          <ul className="grid grid-cols-2 gap-3">{[[Languages, "Les langues"], [Stethoscope, "Les systèmes de santé"], [Scale, "Les réglementations"], [Building2, "Les organisations sanitaires"], [Users, "Les besoins des populations"], [Globe2, "Les réalités économiques et numériques"]].map(([Icon, t]) => {
            const I = Icon as typeof Search;
            return <li key={t as string} className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm"><I className="size-6 shrink-0 text-[#068132]" aria-hidden /><span className="font-semibold text-[#052D1E]">{t as string}</span></li>;
          })}</ul>
        </div>
      </section>

      {/* 9. Construire ensemble */}
      <section className="container-page max-w-6xl space-y-8 py-16">
        <div className="max-w-3xl"><Kicker>Construire ensemble</Kicker><h2 className="mt-2 text-3xl font-extrabold text-[#052D1E] md:text-4xl">La santé de demain se construit ensemble.</h2>
          <div className="mt-4 space-y-3 text-muted-foreground"><p>Aucune transformation durable du secteur de la santé ne peut se faire sans celles et ceux qui le font vivre chaque jour.</p>
            <p>Professionnels de santé, pharmacies, laboratoires, établissements sanitaires, institutions, partenaires technologiques et citoyens : chacun a un rôle à jouer.</p>
            <p>Nous croyons à la force de la collaboration pour construire une santé plus accessible, plus humaine et mieux connectée.</p></div></div>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[
          ["/inscription", "Rejoindre notre écosystème", "Créer mon compte gratuit", Users],
          ["/infos/contact?sujet=partenariat", "Devenir partenaire", "Institutions, ONG, entreprises", Handshake],
          ["/professionnels", "Référencer mon établissement", "Cabinet, pharmacie, laboratoire, clinique", Building2],
          ["/aide/contact", "Nous contacter", "Une question, une idée", Megaphone],
        ].map(([href, t, d, Icon]) => {
          const I = Icon as typeof Search;
          return (<li key={href as string}><Link prefetch={false} href={href as string} className="group flex h-full flex-col rounded-3xl border-2 border-[#068132]/20 bg-white p-5 transition hover:border-[#068132]">
            <I className="size-8 text-[#068132]" aria-hidden /><span className="mt-3 font-bold text-[#052D1E]">{t as string}</span><span className="text-sm text-muted-foreground">{d as string}</span>
            <ArrowRight className="mt-auto size-5 pt-1 text-[#068132] motion-safe:transition group-hover:translate-x-1 rtl:-scale-x-100" aria-hidden /></Link></li>);
        })}</ul>
      </section>

      {/* 10. Signature */}
      <section className="bg-gradient-to-br from-[#068132] to-[#052D1E] text-white">
        <div className="container-page max-w-4xl py-20 text-center">
          <p className="text-3xl font-extrabold leading-tight md:text-5xl">{SIGNATURE}</p>
          <p className="mt-6 text-lg text-white/85">SantéProxi — La santé, plus proche de vous.</p>
        </div>
      </section>
    </div>
  );
}
