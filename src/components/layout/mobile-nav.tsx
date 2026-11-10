"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarCheck, Home, Search, Stethoscope, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

const items = [
  { href: "/", key: "nav.home", Icon: Home },
  { href: "/recherche", key: "nav.medicaments", Icon: Search },
  { href: "/medecins", key: "nav.medecins", Icon: Stethoscope },
  { href: "/rendez-vous", key: "nav.rendez_vous", Icon: CalendarCheck },
  { href: "/compte", key: "nav.account_short", Icon: User },
];

/** Barre de navigation inférieure sur mobile. */
export function MobileNav() {
  const path = usePathname();
  const t = useT();
  return (
    <nav aria-label={t("nav.mobile")} className="fixed inset-x-0 bottom-0 z-40 border-t bg-white pb-[env(safe-area-inset-bottom)] md:hidden print:hidden">
      <ul className="grid grid-cols-5">
        {items.map(({ href, key, Icon }) => {
          const active = href === "/" ? path === "/" : path.startsWith(href);
          return (
            <li key={href}>
              <Link prefetch={false} href={href} aria-current={active ? "page" : undefined}
                className={cn("flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium", active ? "text-primary" : "text-muted-foreground")}>
                <Icon className="size-5" aria-hidden />
                {t(key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
