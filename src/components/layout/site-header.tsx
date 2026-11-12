import Link from "next/link";
import { Bell, LogIn, Mic } from "lucide-react";
import { Logo } from "@/components/layout/logo";
import { AccountMenu, DesktopNav, MobileMenu, type NavGroup, type NavLink } from "@/components/layout/header-nav";
import type { SessionInfo } from "@/lib/auth";
import { signOut } from "@/app/actions/auth";
import { getPrevLang, getT } from "@/lib/i18n";
import { LanguageMenu } from "@/components/layout/language-menu";

/**
 * En-tête : 4 accès directs + menus « Santé » et « Services » + Urgences ;
 * les espaces professionnels et l'administration sont dans le menu du compte.
 * Sous 1280 px, un bouton « Menu » ouvre toutes les rubriques classées par section.
 */
export async function SiteHeader({ session }: { session: SessionInfo | null }) {
  const [t, prev] = await Promise.all([getT(), getPrevLang()]);
  const roles = session?.roles ?? [];
  const primary: NavLink[] = [
    { href: "/recherche", label: t("nav.medicaments"), hint: t("nav.medicaments.hint") },
    { href: "/pharmacies", label: t("nav.pharmacies"), hint: t("nav.pharmacies.hint") },
    { href: "/medecins", label: t("nav.medecins"), hint: t("nav.medecins.hint") },
    { href: "/rendez-vous", label: t("nav.rendez_vous"), hint: t("nav.rendez_vous.hint") },
  ];
  const groups: NavGroup[] = [
    { label: t("nav.sante"), links: [
      { href: "/sante", label: t("link.sante"), hint: t("link.sante.hint") },
      { href: "/assistant", label: t("link.assistant"), hint: t("link.assistant.hint") },
      { href: "/questions-pharmacien", label: t("link.questions"), hint: t("link.questions.hint") },
      { href: "/premiers-secours", label: t("link.secours"), hint: t("link.secours.hint"), tone: "red" },
      { href: "/femme", label: t("link.femme"), hint: t("link.femme.hint"), tone: "pink" },
      { href: "/sante/mariage", label: t("link.mariage"), hint: t("link.mariage.hint") },
      { href: "/droits", label: t("link.droits"), hint: t("link.droits.hint") },
      { href: "/ma-sante", label: t("link.ma_sante"), hint: t("link.ma_sante.hint") },
      { href: "/ma-sante/famille", label: t("link.famille"), hint: t("link.famille.hint") },
      { href: "/sos", label: t("nav.sos"), hint: t("link.sos.hint"), tone: "red" },
      { href: "/etablissements", label: t("link.etab"), hint: t("link.etab.hint") },
      { href: "/centres-specialises", label: t("link.centres"), hint: t("link.centres.hint") },
      { href: "/sante-mentale", label: t("link.mentale"), hint: t("link.mentale.hint") },
      { href: "/scanner", label: t("link.scanner"), hint: t("link.scanner.hint") },
      { href: "/ma-sante/dossier", label: t("link.dossier"), hint: t("link.dossier.hint") },
      { href: "/signaler", label: t("link.signaler"), hint: t("link.signaler.hint") },
      { href: "/don-de-sang", label: t("link.sang"), hint: t("link.sang.hint"), tone: "red" },
      { href: "/alertes", label: t("link.alertes"), hint: t("link.alertes.hint") },
      { href: "/prevention", label: t("link.prevention"), hint: t("link.prevention.hint") },
      { href: "/nutrition", label: t("link.nutrition"), hint: t("link.nutrition.hint") },
      { href: "/reeducation", label: t("link.reeducation"), hint: t("link.reeducation.hint") },
      { href: "/ma-sante/dossier/autorisations", label: t("link.passeport"), hint: t("link.passeport.hint") },
      { href: "/parler", label: t("link.parler"), hint: t("link.parler.hint") },
    ] },
    { label: t("nav.services"), links: [
      { href: "/garde", label: t("link.garde"), hint: t("link.garde.hint") },
      { href: "/amo", label: t("link.amo"), hint: t("link.amo.hint") },
      { href: "/comparer", label: t("link.comparer"), hint: t("link.comparer.hint") },
      { href: "/amo/guide", label: t("link.amo_guide"), hint: t("link.amo_guide.hint") },
      { href: "/assurances", label: t("link.assurances"), hint: t("link.assurances.hint") },
      { href: "/laboratoires", label: t("link.labos"), hint: t("link.labos.hint") },
      { href: "/laboratoires/lexique", label: t("link.lexique"), hint: t("link.lexique.hint") },
      { href: "/infirmiers", label: t("link.infirmiers"), hint: t("link.infirmiers.hint") },
      { href: "/cliniques", label: t("link.cliniques"), hint: t("link.cliniques.hint") },
      { href: "/carte", label: t("link.carte"), hint: t("link.carte.hint") },
      { href: "/urgences", label: t("nav.urgences"), hint: t("link.urgences.hint"), tone: "red" },
      { href: "/aide", label: t("link.aide"), hint: t("link.aide.hint") },
      { href: "/langues", label: t("link.langues"), hint: t("link.langues.hint") },
    ] },
  ];
  const account: NavLink[] = session
    ? ([
        { href: "/compte", label: t("acct.compte") },
        { href: "/compte/rendez-vous", label: t("acct.rdv") },
        { href: "/ma-sante", label: t("link.ma_sante") },
        { href: "/ma-sante/dossier", label: t("link.dossier") },
        { href: "/compte/notifications", label: `${t("nav.notifications")}${session.unread ? ` (${session.unread})` : ""}` },
        { href: "/compte/confidentialite", label: t("acct.confidentialite") },
        { href: "/compte/aide", label: t("acct.aide") },
        roles.includes("pharmacist") && { href: "/pharmacien", label: t("acct.pharmacien") },
        session.doctor && { href: "/medecin", label: t("acct.medecin") },
        session.clinics > 0 && { href: "/clinique", label: t("acct.clinique") },
        session.labs > 0 && { href: "/laboratoire", label: t("acct.labo") },
        roles.includes("courier") && { href: "/livraison", label: t("acct.livraison") },
        roles.includes("admin") && { href: "/admin", label: t("acct.admin") },
      ].filter(Boolean) as NavLink[])
    : [{ href: "/connexion", label: t("nav.signin_long") }, { href: "/inscription", label: t("nav.signup") }];
  const firstName = session?.fullName?.split(" ")[0] ?? t("acct.compte");

  return (
    <header className="sticky top-0 z-40 print:hidden border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
      <div className="mali-stripe h-1" aria-hidden />
      <div className="container-page flex h-14 items-center gap-2 sm:h-16 xl:max-w-7xl">
        <Logo />
        <DesktopNav primary={primary} groups={groups} trailing={{ href: "/sos", label: t("nav.sos"), tone: "red" }} />
        <div className="ms-auto flex items-center gap-1">
          <Link prefetch={false} href="/parler" className="rounded-lg p-2 hover:bg-muted" aria-label={t("link.parler")} title={t("link.parler")}><Mic className="size-5" aria-hidden /></Link>
          <LanguageMenu prev={prev} compact />
          {session ? (
            <>
              <Link prefetch={false} href="/compte/notifications" className="relative rounded-lg p-2 hover:bg-muted" aria-label={session.unread ? t("nav.notifications_unread", { n: session.unread }) : t("nav.notifications")}>
                <Bell className="size-5" />
                {session.unread > 0 && (
                  <span className="absolute end-1 top-1 min-w-4 rounded-full bg-mali-red px-1 text-center text-[10px] font-bold leading-4 text-white">
                    {session.unread > 9 ? "9+" : session.unread}
                  </span>
                )}
              </Link>
              <AccountMenu name={firstName} links={account} signOut={signOut} />
            </>
          ) : (
            <Link prefetch={false} href="/connexion" className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary/90">
              <LogIn className="size-4" aria-hidden /> <span className="hidden sm:inline">{t("nav.signin")}</span><span className="sr-only sm:hidden">{t("nav.signin")}</span>
            </Link>
          )}
          <MobileMenu primary={primary} groups={groups} account={account} signedIn={Boolean(session)} signOut={signOut} />
        </div>
      </div>
    </header>
  );
}
