import Link from "next/link";
import { Bell, LogIn, User } from "lucide-react";
import { Logo } from "@/components/layout/logo";
import type { SessionInfo } from "@/lib/auth";
import { signOut } from "@/app/actions/auth";

export function SiteHeader({ session }: { session: SessionInfo | null }) {
  const roles = session?.roles ?? [];
  const links = [
    { href: "/recherche", label: "Rechercher" },
    { href: "/pharmacies", label: "Pharmacies" },
    { href: "/medecins", label: "Médecins" },
    { href: "/rendez-vous", label: "Rendez-vous" },
    { href: "/garde", label: "De garde" },
    { href: "/laboratoires", label: "Laboratoires" },
    { href: "/urgences", label: "Urgences" },
    { href: "/carte", label: "Carte" },
    roles.includes("pharmacist") && { href: "/pharmacien", label: "Espace pharmacien" },
    session?.doctor && { href: "/medecin", label: "Espace médecin" },
    (session?.clinics ?? 0) > 0 && { href: "/clinique", label: "Mes établissements" },
    roles.includes("courier") && { href: "/livraison", label: "Livraisons" },
    roles.includes("admin") && { href: "/admin", label: "Administration" },
  ].filter(Boolean) as { href: string; label: string }[];

  return (
    <header className="sticky top-0 z-40 border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
      <div className="mali-stripe h-1" aria-hidden />
      <div className="container-page flex h-14 items-center gap-4 sm:h-16">
        <Logo />
        <nav aria-label="Navigation principale" className="ml-4 hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <Link prefetch={false} key={l.href} href={l.href} className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
              {l.label}
            </Link>
          ))}
        </nav>
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
              <Link prefetch={false} href="/compte" className="hidden items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium hover:bg-muted sm:flex">
                <User className="size-4" /> {session.fullName?.split(" ")[0] ?? "Mon compte"}
              </Link>
              <form action={signOut} className="hidden sm:block">
                <button className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted">Déconnexion</button>
              </form>
            </>
          ) : (
            <Link prefetch={false} href="/connexion" className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary/90">
              <LogIn className="size-4" /> Connexion
            </Link>
          )}
        </div>
      </div>
      {links.length > 3 && (
        <nav aria-label="Espaces" className="container-page flex gap-1 overflow-x-auto pb-2 md:hidden">
          {links.slice(3).map((l) => (
            <Link prefetch={false} key={l.href} href={l.href} className="shrink-0 rounded-full border bg-white px-3 py-1 text-xs font-medium">
              {l.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
