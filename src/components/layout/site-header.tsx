import Link from "next/link";
import { Bell, LogIn } from "lucide-react";
import { Logo } from "@/components/layout/logo";
import { AccountMenu, DesktopNav, MobileMenu, type NavGroup, type NavLink } from "@/components/layout/header-nav";
import type { SessionInfo } from "@/lib/auth";
import { signOut } from "@/app/actions/auth";

/**
 * En-tête : 4 accès directs + menus « Santé » et « Services » + Urgences ;
 * les espaces professionnels et l'administration sont dans le menu du compte.
 * Sous 1280 px, un bouton « Menu » ouvre toutes les rubriques classées par section.
 */
export function SiteHeader({ session }: { session: SessionInfo | null }) {
  const roles = session?.roles ?? [];
  const primary: NavLink[] = [
    { href: "/recherche", label: "Médicaments", hint: "Quelle pharmacie a mon médicament ?" },
    { href: "/pharmacies", label: "Pharmacies", hint: "Annuaire, horaires, itinéraire" },
    { href: "/medecins", label: "Médecins", hint: "Par spécialité et par quartier" },
    { href: "/rendez-vous", label: "Rendez-vous", hint: "Réserver un créneau en ligne" },
  ];
  const groups: NavGroup[] = [
    { label: "Santé", links: [
      { href: "/sante", label: "Santé essentielle", hint: "Fiches validées par des professionnels" },
      { href: "/assistant", label: "Assistant santé", hint: "Posez votre question, réponse immédiate" },
      { href: "/femme", label: "PharmaProxi Femme", hint: "Cycle, fertilité, grossesse — espace privé", tone: "pink" },
      { href: "/sante/mariage", label: "Avant le mariage", hint: "Examens, groupes sanguins, drépanocytose" },
    ] },
    { label: "Services", links: [
      { href: "/garde", label: "Pharmacies de garde", hint: "Ouvertes la nuit et le week-end" },
      { href: "/laboratoires", label: "Laboratoires et examens", hint: "Où faire une analyse, tarifs" },
      { href: "/cliniques", label: "Cliniques et hôpitaux", hint: "Établissements de santé" },
      { href: "/carte", label: "Carte", hint: "Tout autour de moi" },
      { href: "/urgences", label: "Urgences", hint: "Services d'urgence, ambulances", tone: "red" },
    ] },
  ];
  const account: NavLink[] = session
    ? ([
        { href: "/compte", label: "Mon compte" },
        { href: "/compte/rendez-vous", label: "Mes rendez-vous" },
        { href: "/compte/notifications", label: `Notifications${session.unread ? ` (${session.unread})` : ""}` },
        roles.includes("pharmacist") && { href: "/pharmacien", label: "Espace pharmacien" },
        session.doctor && { href: "/medecin", label: "Espace médecin" },
        session.clinics > 0 && { href: "/clinique", label: "Mes établissements" },
        roles.includes("courier") && { href: "/livraison", label: "Livraisons" },
        roles.includes("admin") && { href: "/admin", label: "Administration" },
      ].filter(Boolean) as NavLink[])
    : [{ href: "/connexion", label: "Se connecter" }, { href: "/inscription", label: "Créer un compte" }];
  const firstName = session?.fullName?.split(" ")[0] ?? "Mon compte";

  return (
    <header className="sticky top-0 z-40 border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
      <div className="mali-stripe h-1" aria-hidden />
      <div className="container-page flex h-14 items-center gap-2 sm:h-16 xl:max-w-7xl">
        <Logo />
        <DesktopNav primary={primary} groups={groups} trailing={{ href: "/urgences", label: "Urgences", tone: "red" }} />
        <div className="ml-auto flex items-center gap-1">
          {session ? (
            <>
              <Link prefetch={false} href="/compte/notifications" className="relative rounded-lg p-2 hover:bg-muted" aria-label={`Notifications${session.unread ? ` (${session.unread} non lues)` : ""}`}>
                <Bell className="size-5" />
                {session.unread > 0 && (
                  <span className="absolute right-1 top-1 min-w-4 rounded-full bg-mali-red px-1 text-center text-[10px] font-bold leading-4 text-white">
                    {session.unread > 9 ? "9+" : session.unread}
                  </span>
                )}
              </Link>
              <AccountMenu name={firstName} links={account} signOut={signOut} />
            </>
          ) : (
            <Link prefetch={false} href="/connexion" className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary/90">
              <LogIn className="size-4" aria-hidden /> <span className="hidden sm:inline">Connexion</span><span className="sr-only sm:hidden">Connexion</span>
            </Link>
          )}
          <MobileMenu primary={primary} groups={groups} account={account} signedIn={Boolean(session)} signOut={signOut} />
        </div>
      </div>
    </header>
  );
}
