import Link from "next/link";
import { Accessibility, Ear, Languages, Mic, Smartphone, Type, WifiOff } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { SimpleToggle } from "@/components/simple/simple-toggle";

export const metadata = { title: "SantéProxi Accessible", description: "Recherche vocale, guides audio en langues nationales, mode simple, accessibilité et fonctionnement avec une connexion faible." };
export const revalidate = 600;

type Status = "operationnel" | "partiel" | "partenaire" | "validation";
const BADGE: Record<Status, [string, string]> = {
  operationnel: ["Opérationnel", "bg-emerald-100 text-emerald-900"], partiel: ["Opérationnel en partie", "bg-sky-100 text-sky-900"],
  partenaire: ["Nécessite des partenaires", "bg-amber-100 text-amber-900"], validation: ["Nécessite une validation", "bg-slate-200 text-slate-800"],
};

export default async function AccessiblePage() {
  let audio: { lang: string; n: number }[] = [];
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const { data } = await supabase.from("audio_clips").select("lang").eq("status", "published");
    const m = new Map<string, number>(); for (const r of (data ?? []) as { lang: string }[]) m.set(r.lang, (m.get(r.lang) ?? 0) + 1);
    audio = [...m.entries()].map(([lang, n]) => ({ lang, n }));
  }
  const LANG: Record<string, string> = { fr: "français", bm: "bambara", snk: "soninké", ff: "peul", son: "songhaï", tmh: "tamasheq", dgo: "dogon" };
  const items: { icon: React.ReactNode; title: string; status: Status; text: string; href?: string; cta?: string }[] = [
    { icon: <Mic className="size-6" aria-hidden />, title: "Recherche vocale", status: "operationnel", href: "/parler", cta: "Parler à SantéProxi",
      text: "Dites ce que vous cherchez (médicament, pharmacie de garde, médecin, établissement) avec le micro du téléphone. Elle utilise la reconnaissance vocale du navigateur, en français ; SantéProxi n'enregistre pas votre voix." },
    { icon: <Ear className="size-6" aria-hidden />, title: "Guides audio et lecture à voix haute", status: audio.some((a) => a.lang !== "fr") ? "partiel" : "partenaire", href: "/langues", cta: "Voir les langues",
      text: `Bouton « Écouter » sur les pages essentielles (lecture par le téléphone). Guides audio enregistrés publiés : ${audio.length ? audio.map((a) => `${a.n} en ${LANG[a.lang] ?? a.lang}`).join(", ") : "aucun pour le moment"}. Un guide en langue nationale n'est publié qu'après relecture par un locuteur compétent ; les voix de synthèse sont signalées comme telles.` },
    { icon: <Languages className="size-6" aria-hidden />, title: "Langues nationales", status: "partenaire", href: "/langues", cta: "Langues disponibles",
      text: "Interface en français, anglais et arabe ; architecture prête pour d'autres langues. Les contenus médicaux ne sont jamais traduits automatiquement : chaque traduction doit être validée par un professionnel de santé locuteur de la langue (partenaires à mobiliser)." },
    { icon: <Type className="size-6" aria-hidden />, title: "Mode simple pour les personnes peu à l'aise avec l'écrit", status: "operationnel",
      text: "Grands boutons, pictogrammes, texte plus gros et parcours réduits à l'essentiel (urgence, pharmacie, médecin, établissement). Activez-le ci-dessous ; il reste actif sur ce téléphone." },
    { icon: <Accessibility className="size-6" aria-hidden />, title: "Accessibilité pour les personnes en situation de handicap", status: "partiel",
      text: "Navigation au clavier, libellés pour les lecteurs d'écran, contrastes renforcés, cibles tactiles de 44 px, lien « Aller au contenu ». Un audit d'accessibilité par des personnes concernées et des associations reste à organiser." },
    { icon: <WifiOff className="size-6" aria-hidden />, title: "Connexion faible ou absente", status: "operationnel",
      text: "Pages légères ; cartes chargées seulement à la demande ; pages essentielles consultables sans réseau après une première visite (urgences, premiers secours, SOS, droits, prévention, don de sang). Les pages personnelles ne sont jamais conservées hors connexion." },
    { icon: <Smartphone className="size-6" aria-hidden />, title: "Textes faciles à comprendre", status: "validation",
      text: "Les fiches santé sont rédigées en phrases courtes ; la relecture « facile à lire et à comprendre » par des professionnels de santé et des usagers est en cours." },
  ];
  return (
    <div className="container-page max-w-4xl space-y-5 py-6">
      <header className="space-y-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-brand-deep"><Accessibility className="size-7 text-primary" aria-hidden /> SantéProxi Accessible</h1>
        <p className="text-muted-foreground">Pour que chacun puisse se soigner, quelle que soit sa langue, sa maîtrise de l&apos;écrit, son handicap ou sa connexion. Chaque fonction indique honnêtement son état.</p>
        <SimpleToggle on={false} back="/accessible" />
      </header>
      <ul className="grid gap-3 md:grid-cols-2">{items.map((x) => (
        <li key={x.title} className="flex flex-col gap-2 rounded-2xl border bg-white p-4 text-sm">
          <div className="flex items-center gap-2 text-brand-deep">{x.icon}<h2 className="text-base font-bold">{x.title}</h2></div>
          <span className={`w-fit rounded-full px-2 py-0.5 text-xs font-semibold ${BADGE[x.status][1]}`}>{BADGE[x.status][0]}</span>
          <p>{x.text}</p>
          {x.href && <Link prefetch={false} href={x.href} className="mt-auto font-semibold text-primary underline">{x.cta}</Link>}
        </li>))}</ul>
    </div>
  );
}
