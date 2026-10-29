"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarCheck, Home, Search, Stethoscope, User } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/", label: "Accueil", Icon: Home },
  { href: "/recherche", label: "Médicaments", Icon: Search },
  { href: "/medecins", label: "Médecins", Icon: Stethoscope },
  { href: "/rendez-vous", label: "Rendez-vous", Icon: CalendarCheck },
  { href: "/compte", label: "Compte", Icon: User },
];

/** Barre de navigation inférieure sur mobile. */
export function MobileNav() {
  const path = usePathname();
  return (
    <nav aria-label="Navigation mobile" className="fixed inset-x-0 bottom-0 z-40 border-t bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
      <ul className="grid grid-cols-5">
        {items.map(({ href, label, Icon }) => {
          const active = href === "/" ? path === "/" : path.startsWith(href);
          return (
            <li key={href}>
              <Link prefetch={false} href={href} aria-current={active ? "page" : undefined}
                className={cn("flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium", active ? "text-primary" : "text-muted-foreground")}>
                <Icon className="size-5" aria-hidden />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
