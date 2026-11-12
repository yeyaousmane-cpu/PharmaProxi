import Image from "next/image";
import { getT } from "@/lib/i18n";
import { AudioGuide } from "@/components/audio/audio-guide";
import Link from "next/link";
import { ProOnly } from "@/components/pro/pro-only";
import { Bot, Building2, BookOpenCheck, Flower2, CalendarCheck, FlaskConical, Moon, ShieldCheck, Siren, Stethoscope, Store } from "lucide-react";
import { RecentList } from "@/components/recent/recent-list";
import { SearchBar } from "@/components/search-bar";
import { HowItWorks } from "@/components/home/how-it-works";
import { DemoBadge } from "@/components/demo-badge";
import { Alert } from "@/components/ui/alert";
import { getGeo } from "@/lib/geo";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { formatAge } from "@/lib/format";
import { getSpecialties } from "@/lib/directory-server";
import { isSimpleMode } from "@/lib/simple-mode";
import { SimpleHome } from "@/components/simple/simple-home";
import { SimpleToggle } from "@/components/simple/simple-toggle";

export const revalidate = 0;

type Recent = { id: string; name: string; address: string; region_name: string; commune_name: string | null; last_stock_update: string | null; products_count: number; is_demo: boolean };

export default async function Home() {
  const [geo, specialties, simple, t] = await Promise.all([getGeo(), getSpecialties(), isSimpleMode(), getT()]);
  if (simple) return <SimpleHome geo={geo} />;
  const popular = ["medecine_generale", "pediatrie", "gynecologie", "cardiologie", "ophtalmologie", "dermatologie", "orl", "chirurgie_dentaire"]
    .map((c) => specialties.find((s) => s.code === c)).filter(Boolean) as typeof specialties;
  let recent: Recent[] = [];
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const { data } = await supabase.rpc("recent_pharmacies", { p_limit: 6 });
    recent = (data as Recent[]) ?? [];
  }

  return (
    <>
      <section className="bogolan border-b">
        <div className="container-page grid items-center gap-8 py-8 md:grid-cols-[1fr_1.2fr] md:py-14">
          <div className="flex flex-col items-center text-center md:items-start md:text-start">
            <Image src="/logo-santeproxi-sans-slogan.webp" alt="SantéProxi" width={640} height={444} priority className="h-auto w-48 rounded-3xl bg-white p-2 shadow-sm md:w-72" />
            <p className="mt-3 text-2xl font-extrabold text-[#068132] md:text-3xl">La santé, plus proche de vous</p>
            <p className="mt-2 max-w-md text-muted-foreground">
              {t("home.intro")}
            </p>
          </div>
          <div className="rounded-2xl border bg-white p-4 shadow-sm sm:p-6">
            <h1 className="mb-4 text-2xl font-bold text-brand-deep sm:text-3xl">{t("home.question")}</h1>
            <SearchBar geo={geo} large />
            <AudioGuide target="accueil" className="mt-4" />
            <SimpleToggle on={false} className="mt-3" />
          </div>
        </div>
      </section>

      <section className="container-page py-6" aria-label="Services pratiques">
        <Link prefetch={false} href="/sos" className="mb-3 flex items-center gap-3 rounded-xl bg-red-700 p-4 text-white shadow-sm transition hover:bg-red-800">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-white text-red-700"><Siren className="size-6" aria-hidden /></span>
          <span className="min-w-0"><span className="block font-bold">SOS Santé : numéros d&apos;urgence</span>
            <span className="block text-sm text-white/90">Protection civile, police, numéro vert Santé : appel direct en un geste.</span></span>
          <span className="ms-auto hidden shrink-0 text-sm font-semibold sm:block">Ouvrir</span>
        </Link>
        <div className="mb-3 grid gap-3 lg:grid-cols-2">
        <Link prefetch={false} href="/assistant" className="flex items-center gap-3 rounded-xl border border-emerald-300 bg-[#EAF6EE] p-4 transition hover:border-[#068132] hover:shadow-sm">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[#068132] text-white"><Bot className="size-6" aria-hidden /></span>
          <span className="min-w-0"><span className="block font-bold text-[#052D1E]">Assistant santé : posez votre question</span>
            <span className="block text-sm text-muted-foreground">Mal de tête, fièvre, diarrhée, rhume… Une première orientation simple, sans diagnostic, et quand consulter.</span></span>
          <span className="ms-auto hidden shrink-0 text-sm font-semibold text-[#068132] sm:block">Demander</span>
        </Link>
        <Link prefetch={false} href="/femme" className="flex items-center gap-3 rounded-xl border border-[#D96A91]/40 bg-[#F8E7EF] p-4 transition hover:border-[#D96A91] hover:shadow-sm">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[#D96A91] text-white"><Flower2 className="size-6" aria-hidden /></span>
          <span className="min-w-0"><span className="block font-bold text-[#843653]">SantéProxi Femme</span>
            <span className="block text-sm text-muted-foreground">Règles, fertilité, grossesse, symptômes : votre espace privé et protégé.</span></span>
          <span className="ms-auto hidden shrink-0 text-sm font-semibold text-[#843653] sm:block">Ouvrir</span>
        </Link>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { href: "/garde", Icon: Moon, title: "Pharmacies de garde", text: "Ouvertes la nuit et le week-end", tone: "text-indigo-700 border-indigo-200 hover:border-indigo-400" },
            { href: "/laboratoires", Icon: FlaskConical, title: "Laboratoires et examens", text: "Où faire une analyse, tarifs communiqués", tone: "text-brand-blue border-sky-200 hover:border-brand-blue" },
            { href: "/urgences", Icon: Siren, title: "Urgences", text: "Services d'urgence et ambulances", tone: "text-red-700 border-red-200 hover:border-red-400" },
            { href: "/sante", Icon: BookOpenCheck, title: "Santé essentielle", text: "Fiches validées, avant le mariage, drépanocytose", tone: "text-[#068132] border-emerald-200 hover:border-[#068132]" },
          ].map(({ href, Icon, title, text, tone }) => (
            <li key={href}>
              <Link prefetch={false} href={href} className={`flex h-full items-center gap-3 rounded-xl border bg-white p-4 transition hover:shadow-sm ${tone}`}>
                <Icon className="size-7 shrink-0" aria-hidden />
                <span><span className="block font-bold text-foreground">{title}</span><span className="block text-sm text-muted-foreground">{text}</span></span>
              </Link>
            </li>
          ))}
        </ul>
        <div className="mt-6"><RecentList emptyHidden /></div>
      </section>

      <section className="border-b bg-gradient-to-b from-brand-sky to-white" aria-labelledby="doc-title">
        <div className="container-page grid gap-6 py-8 md:grid-cols-[1fr_1.2fr] md:items-center">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-brand-blue"><Stethoscope className="size-4" aria-hidden /> Annuaire médical</p>
            <h2 id="doc-title" className="mt-1 text-2xl font-bold text-brand-deep">Besoin d&apos;un médecin ? Prenez rendez-vous en ligne</h2>
            <p className="mt-2 text-muted-foreground">Trouvez le bon spécialiste, choisissez un créneau libre et réservez en quelques secondes. Rappel la veille, annulation en ligne.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link prefetch={false} href="/rendez-vous" className="inline-flex h-11 items-center gap-2 rounded-lg bg-brand-blue px-4 text-sm font-semibold text-white hover:bg-brand-blue/90"><CalendarCheck className="size-4" aria-hidden /> Prendre rendez-vous</Link>
              <Link prefetch={false} href="/medecins" className="inline-flex h-11 items-center gap-2 rounded-lg border bg-white px-4 text-sm font-semibold hover:bg-muted"><Stethoscope className="size-4" aria-hidden /> Trouver un spécialiste</Link>
              <Link prefetch={false} href="/etablissements" className="inline-flex h-11 items-center gap-2 rounded-lg border bg-white px-4 text-sm font-semibold hover:bg-muted"><Building2 className="size-4" aria-hidden /> Trouver un établissement</Link>
            </div>
          </div>
          <ul className="flex flex-wrap gap-2" aria-label="Spécialités fréquentes">
            {popular.map((s) => (
              <li key={s.id}>
                <Link prefetch={false} href={`/medecins?specialite=${s.id}`} className="inline-block rounded-full border border-sky-200 bg-white px-4 py-2 text-sm font-medium text-brand-blue shadow-sm hover:bg-brand-sky">{s.name}</Link>
              </li>
            ))}
            <li><Link prefetch={false} href="/specialites" className="inline-block rounded-full px-4 py-2 text-sm font-semibold text-brand-blue underline">Quel spécialiste pour quoi ?</Link></li>
          </ul>
        </div>
      </section>

      <section className="container-page py-10" aria-labelledby="recent-title">
        <div className="flex items-end justify-between gap-4">
          <h2 id="recent-title" className="text-xl font-bold">Pharmacies récemment mises à jour</h2>
          <Link prefetch={false} href="/carte" className="text-sm font-semibold text-primary hover:underline">Voir la carte</Link>
        </div>
        {recent.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed bg-white p-6 text-center">
            <Store className="mx-auto size-8 text-muted-foreground" aria-hidden />
            <p className="mt-2 font-medium">Aucune pharmacie vérifiée pour le moment.</p>
            <p className="text-sm text-muted-foreground">
              SantéProxi est en cours de déploiement. <ProOnly>Vous êtes pharmacien ?{" "}
              <Link prefetch={false} href="/professionnels?type=pharmacie" className="font-semibold text-primary underline">Rejoignez SantéProxi</Link>.</ProOnly>
            </p>
          </div>
        ) : (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {recent.map((p) => (
              <li key={p.id}>
                <Link prefetch={false} href={`/pharmacies/${p.id}`} className="block h-full rounded-xl border bg-white p-4 transition hover:border-primary hover:shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold">{p.name}</p>
                    <ShieldCheck className="size-5 shrink-0 text-brand-green" aria-label="Pharmacie vérifiée" />
                  </div>
                  <p className="text-sm text-muted-foreground">{[p.commune_name, p.region_name].filter(Boolean).join(", ")}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {p.last_stock_update ? `Stock actualisé ${formatAge(p.last_stock_update)} · ${p.products_count} produit(s)` : "Aucun stock déclaré pour le moment"}
                  </p>
                  {p.is_demo && <div className="mt-2"><DemoBadge /></div>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="border-y bg-white py-10" aria-labelledby="how-title">
        <div className="container-page">
          <h2 id="how-title" className="text-xl font-bold">Comment ça marche ?</h2>
          <div className="mt-4"><HowItWorks /></div>
        </div>
      </section>

      <section className="container-page py-10" aria-labelledby="safety-title">
        <h2 id="safety-title" className="text-xl font-bold">Bon usage et sécurité</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <Alert tone="info" title="Une disponibilité est une déclaration">
            Elle est datée : vérifiez la date de mise à jour et faites confirmer avant de vous déplacer.
          </Alert>
          <Alert tone="warning" title="Ordonnance">
            Les médicaments sur ordonnance sont délivrés en pharmacie, sur présentation de l&apos;ordonnance. Ils ne sont jamais livrés automatiquement.
          </Alert>
          <Alert tone="error" title="Pas d'automédication">
            SantéProxi ne pose aucun diagnostic et ne recommande aucun médicament. Demandez conseil à un professionnel de santé.
          </Alert>
        </div>
        <Link prefetch={false} href="/infos/securite" className="mt-4 inline-block text-sm font-semibold text-primary hover:underline">Lire toutes les consignes</Link>
      </section>
    </>
  );
}
