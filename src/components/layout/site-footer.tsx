import Link from "next/link";
import { SimpleToggle } from "@/components/simple/simple-toggle";
import { LanguageSwitch } from "@/components/layout/language-switch";
import { getT } from "@/lib/i18n";

export async function SiteFooter({ simple = false }: { simple?: boolean }) {
  const t = await getT();
  return (
    <footer className="mt-16 border-t bg-white pb-20 md:pb-0 print:hidden">
      <div className="container-page grid gap-6 py-8 text-sm sm:grid-cols-3">
        <div>
          <p className="font-bold text-brand-deep">SantéProxi</p>
          <p className="mt-1 font-semibold text-[#068132]">{t("footer.tagline")}</p>
          <p className="text-sm italic text-muted-foreground">{t("footer.tagline2")}</p>
          <p className="mt-3 text-xs text-muted-foreground">
            {t("footer.disclaimer")}
          </p>
          <SimpleToggle on={simple} className="mt-3" />
          <LanguageSwitch />
        </div>
        <nav aria-label={t("footer.info")} className="flex flex-col gap-2">
          <Link prefetch={false} href="/pharmacies" className="hover:underline">{t("footer.annuaire")}</Link>
          <Link prefetch={false} href="/sante" className="hover:underline">{t("link.sante")}</Link>
          <Link prefetch={false} href="/assistant" className="hover:underline">{t("link.assistant")}</Link>
          <Link prefetch={false} href="/questions-pharmacien" className="hover:underline">{t("link.questions")}</Link>
          <Link prefetch={false} href="/premiers-secours" className="hover:underline">{t("link.secours")}</Link>
          <Link prefetch={false} href="/comparer" className="hover:underline">{t("link.comparer")}</Link>
          <Link prefetch={false} href="/femme" className="hover:underline">{t("link.femme")}</Link>
          <Link prefetch={false} href="/infirmiers" className="hover:underline">{t("link.infirmiers")}</Link>
          <Link prefetch={false} href="/garde" className="hover:underline">{t("link.garde")}</Link>
          <Link prefetch={false} href="/amo" className="hover:underline">{t("link.amo")}</Link>
          <Link prefetch={false} href="/amo/guide" className="hover:underline">{t("link.amo_guide")}</Link>
          <Link prefetch={false} href="/droits" className="hover:underline">{t("link.droits")}</Link>
          <Link prefetch={false} href="/assurances" className="hover:underline">{t("link.assurances")}</Link>
          <Link prefetch={false} href="/ma-sante" className="hover:underline">{t("link.ma_sante")}</Link>
          <Link prefetch={false} href="/ma-sante/dossier" className="hover:underline">{t("link.dossier")}</Link>
          <Link prefetch={false} href="/sos" className="hover:underline">{t("nav.sos")}</Link>
          <Link prefetch={false} href="/etablissements" className="hover:underline">{t("link.etab")}</Link>
          <Link prefetch={false} href="/accessible" className="hover:underline">{t("link.accessible")}</Link>
          <Link prefetch={false} href="/centres-specialises" className="hover:underline">{t("link.centres")}</Link>
          <Link prefetch={false} href="/sante-mentale" className="hover:underline">{t("link.mentale")}</Link>
          <Link prefetch={false} href="/laboratoires/lexique" className="hover:underline">{t("link.lexique")}</Link>
          <Link prefetch={false} href="/scanner" className="hover:underline">{t("link.scanner")}</Link>
          <Link prefetch={false} href="/signaler" className="hover:underline">{t("link.signaler")}</Link>
          <Link prefetch={false} href="/avis" className="hover:underline">{t("footer.avis")}</Link>
          <Link prefetch={false} href="/don-de-sang" className="hover:underline">{t("link.sang")}</Link>
          <Link prefetch={false} href="/alertes" className="hover:underline">{t("link.alertes")}</Link>
          <Link prefetch={false} href="/prevention" className="hover:underline">{t("link.prevention")}</Link>
          <Link prefetch={false} href="/parler" className="hover:underline">{t("link.parler")}</Link>
          <Link prefetch={false} href="/langues" className="hover:underline">{t("link.langues")}</Link>
          <Link prefetch={false} href="/laboratoires" className="hover:underline">{t("link.labos")}</Link>
          <Link prefetch={false} href="/urgences" className="hover:underline">{t("nav.urgences")}</Link>
          <Link prefetch={false} href="/carte" className="hover:underline">{t("link.carte")}</Link>
          <Link prefetch={false} href="/infos/securite" className="hover:underline">{t("footer.securite")}</Link>
          <Link prefetch={false} href="/qui-sommes-nous" className="hover:underline">{t("footer.qui")}</Link>
          <Link prefetch={false} href="/aide" className="hover:underline">{t("link.aide")}</Link>
          <Link prefetch={false} href="/votre-sante-vos-donnees" className="hover:underline">{t("footer.donnees")}</Link>
          <Link prefetch={false} href="/infos/confidentialite" className="hover:underline">{t("footer.confidentialite")}</Link>
          <Link prefetch={false} href="/infos/conditions" className="hover:underline">{t("footer.conditions")}</Link>
          <Link prefetch={false} href="/infos/contact" className="hover:underline">{t("footer.contact")}</Link>
        </nav>
        <nav aria-label={t("footer.pros")} className="flex flex-col gap-2">
          <p className="font-semibold text-brand-deep">{t("footer.pros")}</p>
          <Link prefetch={false} href="/professionnels" className="hover:underline">{t("footer.pro_q")}</Link>
          <Link prefetch={false} href="/livraison" className="hover:underline">{t("footer.courier")}</Link>
          <Link prefetch={false} href="/partenaires/api" className="hover:underline">{t("footer.api")}</Link>
          <Link prefetch={false} href="/fonctionnement" className="hover:underline">{t("footer.how")}</Link>
        </nav>
      </div>
      <div className="border-t">
        <p className="container-page py-4 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} SantéProxi · {t("footer.edited")}{" "}
          <span className="font-semibold text-brand-deep">Yéya Ousmane Touré</span>
        </p>
      </div>
      <div className="mali-stripe h-1" aria-hidden />
    </footer>
  );
}
