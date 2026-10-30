"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function FemmeNav({ items }: { items: { href: string; label: string }[] }) {
  const path = usePathname();
  return (
    <nav aria-label="Mon espace" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
      {items.map((i) => {
        const on = i.href === "/femme" ? path === "/femme" : path.startsWith(i.href);
        return (
          <Link key={i.href} prefetch={false} href={i.href} aria-current={on ? "page" : undefined}
            className={cn("shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold", on ? "bg-[#843653] text-white" : "bg-white text-[#843653] ring-1 ring-[#D96A91]/30 hover:bg-[#F8E7EF]")}>
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
