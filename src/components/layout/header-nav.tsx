"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, LogOut, Menu, User, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type NavLink = { href: string; label: string; hint?: string; tone?: "red" | "pink" };
export type NavGroup = { label: string; links: NavLink[] };

const active = (path: string, href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`));

/** Fermeture au clic extérieur, à la touche Échap et au changement de page. */
function useDismiss(open: boolean, setOpen: (v: boolean) => void) {
  const ref = useRef<HTMLDivElement>(null);
  const path = usePathname();
  useEffect(() => { setOpen(false); }, [path, setOpen]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open, setOpen]);
  return ref;
}

const linkTone = (l: NavLink) => (l.tone === "red" ? "text-red-700" : l.tone === "pink" ? "text-[#843653]" : "");

function Dropdown({ group, align = "left" }: { group: NavGroup; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, setOpen);
  const path = usePathname();
  const isActive = group.links.some((l) => active(path, l.href));
  return (
    <div ref={ref} className="relative">
      <button type="button" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((v) => !v)}
        className={cn("flex items-center gap-1 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium hover:bg-muted hover:text-foreground", isActive ? "text-foreground" : "text-muted-foreground")}>
        {group.label} <ChevronDown className={cn("size-4 transition", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <div className={cn("absolute top-full z-50 mt-1 w-72 rounded-xl border bg-white p-1.5 shadow-lg", align === "right" ? "right-0" : "left-0")}>
          <ul>
            {group.links.map((l) => (
              <li key={l.href}>
                <Link prefetch={false} href={l.href} aria-current={active(path, l.href) ? "page" : undefined}
                  className={cn("block rounded-lg px-3 py-2 hover:bg-muted", active(path, l.href) && "bg-muted")}>
                  <span className={cn("block text-sm font-semibold", linkTone(l))}>{l.label}</span>
                  {l.hint && <span className="block text-xs text-muted-foreground">{l.hint}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Navigation principale sur ordinateur (à partir de 1280 px). */
export function DesktopNav({ primary, groups, trailing }: { primary: NavLink[]; groups: NavGroup[]; trailing?: NavLink }) {
  const path = usePathname();
  return (
    <nav aria-label="Navigation principale" className="ml-2 hidden items-center gap-0.5 xl:flex">
      {primary.map((l) => (
        <Link prefetch={false} key={l.href} href={l.href} aria-current={active(path, l.href) ? "page" : undefined}
          className={cn("whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium hover:bg-muted", l.tone === "red" ? "text-red-700" : active(path, l.href) ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
          {l.label}
        </Link>
      ))}
      {groups.map((g) => <Dropdown key={g.label} group={g} />)}
      {trailing && (
        <Link prefetch={false} href={trailing.href} aria-current={active(path, trailing.href) ? "page" : undefined}
          className={cn("whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold hover:bg-muted", linkTone(trailing))}>{trailing.label}</Link>
      )}
    </nav>
  );
}

/** Menu du compte (ordinateur). */
export function AccountMenu({ name, links, signOut }: { name: string; links: NavLink[]; signOut: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, setOpen);
  return (
    <div ref={ref} className="relative hidden xl:block">
      <button type="button" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium hover:bg-muted">
        <User className="size-4" aria-hidden /> <span className="max-w-[10rem] truncate">{name}</span> <ChevronDown className={cn("size-4 transition", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-64 rounded-xl border bg-white p-1.5 shadow-lg">
          <ul>
            {links.map((l) => (
              <li key={l.href}><Link prefetch={false} href={l.href} className={cn("block rounded-lg px-3 py-2 text-sm font-medium hover:bg-muted", linkTone(l))}>{l.label}</Link></li>
            ))}
          </ul>
          <form action={signOut} className="mt-1 border-t pt-1">
            <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted"><LogOut className="size-4" aria-hidden /> Déconnexion</button>
          </form>
        </div>
      )}
    </div>
  );
}

/** Menu complet sur téléphone et tablette : sections claires, tout est visible sans faire défiler une bande. */
export function MobileMenu({ primary, groups, account, signedIn, signOut }: {
  primary: NavLink[]; groups: NavGroup[]; account: NavLink[]; signedIn: boolean; signOut: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => { setOpen(false); }, [path]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open]);
  const Item = ({ l }: { l: NavLink }) => (
    <li>
      <Link prefetch={false} href={l.href} onClick={() => setOpen(false)} aria-current={active(path, l.href) ? "page" : undefined}
        className={cn("block rounded-lg px-3 py-2.5 hover:bg-muted", active(path, l.href) && "bg-[#EAF6EE]")}>
        <span className={cn("block text-[15px] font-semibold", linkTone(l))}>{l.label}</span>
        {l.hint && <span className="block text-xs text-muted-foreground">{l.hint}</span>}
      </Link>
    </li>
  );
  return (
    <div className="xl:hidden">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls="menu-mobile"
        className="flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-sm font-semibold hover:bg-muted">
        {open ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />} Menu
      </button>
      {open && createPortal(
        <div id="menu-mobile" className="fixed inset-x-0 bottom-0 top-[calc(3.5rem+4px)] z-50 overflow-y-auto border-t bg-white sm:top-[calc(4rem+4px)] xl:hidden">
          <nav aria-label="Menu" className="container-page grid gap-5 py-4 pb-28 sm:grid-cols-2">
            <section>
              <h2 className="px-3 pb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">Trouver</h2>
              <ul>{primary.map((l) => <Item key={l.href} l={l} />)}</ul>
            </section>
            {groups.map((g) => (
              <section key={g.label}>
                <h2 className="px-3 pb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">{g.label}</h2>
                <ul>{g.links.map((l) => <Item key={l.href} l={l} />)}</ul>
              </section>
            ))}
            <section>
              <h2 className="px-3 pb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">Mon compte</h2>
              <ul>{account.map((l) => <Item key={l.href} l={l} />)}</ul>
              {signedIn && (
                <form action={signOut}>
                  <button className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-[15px] font-semibold text-muted-foreground hover:bg-muted"><LogOut className="size-4" aria-hidden /> Déconnexion</button>
                </form>
              )}
            </section>
          </nav>
        </div>,
        document.body,
      )}
    </div>
  );
}
