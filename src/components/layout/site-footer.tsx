import Link from "next/link";
import Image from "next/image";
import { Check, ChevronDown, HeartPulse, Info, Languages, MapPinned, ShieldCheck, ShieldPlus } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { SimpleToggle } from "@/components/simple/simple-toggle";
import { setLanguage } from "@/app/actions/v023";
import { getLang, getT } from "@/lib/i18n";
import { LANGUAGES, MAIN_LANGS, type Lang } from "@/i18n/core";
import { PUBLISHER } from "@/lib/brand";
import { cn } from "@/lib/utils";

type T = Awaited<ReturnType<typeof getT>>;
type FooterLink = [href: string, label: string];

const NATIONAL: Lang[] = ["bm", "snk", "ff", "son"];

/**
 * Colonne repliable sur mobile, toujours ouverte à partir de la tablette.
 * Fonctionne sans JavaScript (case à cocher + étiquette), utilisable au clavier.
 */
function FooterColumn({ id, title, Icon, links }: { id: string; title: string; Icon: LucideIcon; links: FooterLink[] }) {
  return (
    <div className="border-b border-slate-200 sm:border-0">
      <input type="checkbox" id={`f-${id}`} className="peer sr-only sm:hidden" />
      <label
        htmlFor={`f-${id}`}
        className="flex cursor-pointer select-none items-center justify-between gap-2 py-3 text-sm font-bold text-brand-deep peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary sm:cursor-default sm:py-0 [&>svg:last-child]:transition-transform peer-checked:[&>svg:last-child]:rotate-180"
      >
        <span className="flex items-center gap-2"><Icon className="size-4 text-brand-green" aria-hidden />{title}</span>
        <ChevronDown className="size-4 text-muted-foreground sm:hidden" aria-hidden />
      </label>
      <nav aria-label={title} className="hidden pb-4 peer-checked:block sm:mt-3 sm:block sm:pb-0">
        <ul className="space-y-2">
          {links.map(([href, label]) => (
            <li key={href}>
              <Link prefetch={false} href={href} className="inline-block py-0.5 text-sm text-slate-600 transition-colors hover:text-brand-deep hover:underline focus-visible:text-brand-deep">
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

/** Sélecteur de langue : un bouton par langue, la langue active est cochée. Sans JavaScript : simple envoi de formulaire. */
async function FooterLanguages({ t }: { t: T }) {
  const lang = await getLang();
  const pill = (l: Lang) => {
    const active = l === lang;
    return (
      <button
        key={l}
        type="submit"
        name="lang"
        value={l}
        lang={l}
        aria-pressed={active}
        className={cn(
          "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors",
          active ? "border-brand-deep bg-brand-deep font-semibold text-white" : "border-slate-300 bg-white text-slate-700 hover:border-brand-green hover:text-brand-deep",
        )}
      >
        {active && <Check className="size-3.5" aria-hidden />}
        {LANGUAGES[l].label}
      </button>
    );
  };
  return (
    <form action={setLanguage} aria-labelledby="footer-lang-title" className="space-y-3">
      <p id="footer-lang-title" className="flex items-center gap-2 text-sm font-bold text-brand-deep">
        <Languages className="size-4 text-brand-green" aria-hidden /> {t("footer.lang_title")}
      </p>
      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("footer.lang_main")}</p>
        <div className="flex flex-wrap gap-2">{MAIN_LANGS.map(pill)}</div>
        <p className="pt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("lang.national")}</p>
        <div className="flex flex-wrap gap-2">{NATIONAL.map(pill)}</div>
      </div>
      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <span>
          {t("lang.partial")}{" "}
          <Link prefetch={false} href="/langues" className="underline hover:text-brand-deep">{t("footer.lang_more")}</Link>
        </span>
      </p>
    </form>
  );
}

export async function SiteFooter({ simple = false }: { simple?: boolean }) {
  const t = await getT();
  const find: FooterLink[] = [
    ["/pharmacies", t("footer.annuaire")],
    ["/garde", t("link.garde")],
    ["/medecins", t("nav.medecins")],
    ["/etablissements", t("link.etab")],
    ["/cliniques", t("link.cliniques")],
    ["/laboratoires", t("link.labos")],
    ["/centres-specialises", t("link.centres")],
    ["/infirmiers", t("link.infirmiers")],
    ["/carte", t("link.carte")],
  ];
  const services: FooterLink[] = [
    ["/ma-sante", t("link.ma_sante")],
    ["/ma-sante/dossier", t("link.dossier").replace(/^\p{Extended_Pictographic}\s*/u, "")],
    ["/sante", t("link.sante")],
    ["/femme", t("link.femme")],
    ["/sante-mentale", t("link.mentale")],
    ["/premiers-secours", t("link.secours")],
    ["/sos", t("nav.sos")],
    ["/assistant", t("link.assistant")],
    ["/questions-pharmacien", t("link.questions")],
    ["/scanner", t("link.scanner")],
    ["/produits", t("footer.catalogue")],
    ["/comparer", t("link.comparer")],
  ];
  const insurance: FooterLink[] = [
    ["/assurances", t("link.assurances")],
    ["/amo", t("link.amo")],
    ["/amo/guide", t("link.amo_guide")],
    ["/droits", t("link.droits")],
    ["/prevention", t("link.prevention")],
    ["/alertes", t("link.alertes")],
    ["/don-de-sang", t("link.sang")],
    ["/signaler", t("link.signaler")],
  ];
  const info: FooterLink[] = [
    ["/fonctionnement", t("footer.how")],
    ["/professionnels", t("footer.pro_q")],
    ["/infos/contact?sujet=partenariat", t("footer.partner")],
    ["/partenaires/api", t("footer.api")],
    ["/avis", t("footer.avis")],
    ["/infos/securite", t("footer.securite")],
  ];
  const legal: FooterLink[] = [
    ["/infos/confidentialite", t("footer.confidentialite")],
    ["/infos/conditions", t("footer.conditions")],
    ["/votre-sante-vos-donnees", t("footer.donnees")],
    ["/infos/contact", t("footer.contact")],
  ];

  return (
    <footer className="mt-16 border-t bg-slate-50 pb-20 md:pb-0 print:hidden">
      <div className="container-page grid gap-x-8 gap-y-2 py-10 sm:grid-cols-2 sm:gap-y-8 lg:grid-cols-[1.35fr_repeat(4,minmax(0,1fr))]">
        <div className="pb-4 sm:col-span-2 lg:col-span-1 lg:pb-0">
          <Link prefetch={false} href="/" className="inline-flex items-center gap-2" aria-label="SantéProxi — accueil">
            <Image src="/emblem.webp" alt="" width={36} height={36} className="size-9" />
            <span className="text-xl font-extrabold tracking-tight"><span className="text-brand-deep">Santé</span><span className="text-brand-green">Proxi</span></span>
          </Link>
          <p className="mt-3 font-semibold text-[#068132]">{t("footer.tagline")}</p>
          <p className="text-sm italic text-muted-foreground">{t("footer.tagline2")}</p>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-slate-600">{t("footer.about")}</p>
          <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm">
            <li><Link prefetch={false} href="/qui-sommes-nous" className="font-medium text-brand-deep hover:underline">{t("footer.qui")}</Link></li>
            <li><Link prefetch={false} href="/aide" className="font-medium text-brand-deep hover:underline">{t("link.aide")}</Link></li>
            <li><Link prefetch={false} href="/accessible" className="font-medium text-brand-deep hover:underline">{t("link.accessible")}</Link></li>
          </ul>
        </div>
        <FooterColumn id="soins" title={t("footer.col_find")} Icon={MapPinned} links={find} />
        <FooterColumn id="services" title={t("footer.col_services")} Icon={HeartPulse} links={services} />
        <FooterColumn id="assurance" title={t("footer.col_insurance")} Icon={ShieldPlus} links={insurance} />
        <FooterColumn id="infos" title={t("footer.col_info")} Icon={Info} links={info} />
      </div>

      <div className="border-t border-slate-200">
        <div className="container-page grid gap-6 py-6 lg:grid-cols-2 lg:gap-10">
          <FooterLanguages t={t} />
          <div className="space-y-3">
            <p className="flex items-center gap-2 text-sm font-bold text-brand-deep"><ShieldCheck className="size-4 text-brand-green" aria-hidden /> {t("footer.legal")}</p>
            <p className="rounded-xl border border-slate-200 bg-white p-3 text-sm leading-relaxed text-slate-700">{t("footer.mention")}</p>
            <nav aria-label={t("footer.legal")}>
              <ul className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
                {legal.map(([href, label]) => (
                  <li key={href}><Link prefetch={false} href={href} className="text-slate-600 hover:text-brand-deep hover:underline">{label}</Link></li>
                ))}
              </ul>
            </nav>
            <SimpleToggle on={simple} />
          </div>
        </div>
      </div>

      <div className="border-t border-slate-200 bg-white">
        <p className="container-page py-4 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} SantéProxi – {t("footer.rights")}{" "}
          <span className="whitespace-nowrap">{t("footer.edited")} <span className="font-semibold text-brand-deep">{PUBLISHER}</span>.</span>
        </p>
      </div>
      <div className="mali-stripe h-1" aria-hidden />
    </footer>
  );
}
