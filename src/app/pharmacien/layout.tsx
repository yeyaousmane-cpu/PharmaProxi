import Link from "next/link";
import { requireUser } from "@/lib/auth";

const NAV = [
  { href: "/pharmacien", label: "Tableau de bord" },
  { href: "/pharmacien/stocks", label: "Stocks" },
  { href: "/pharmacien/commandes", label: "Commandes" },
  { href: "/pharmacien/mouvements", label: "Mouvements" },
  { href: "/pharmacien/ma-pharmacie", label: "Ma pharmacie" },
];

export default async function PharmacistLayout({ children }: { children: React.ReactNode }) {
  await requireUser("/pharmacien");
  return (
    <div className="container-page py-6">
      <nav aria-label="Espace pharmacien" className="-mx-4 mb-6 flex gap-1 overflow-x-auto px-4 pb-1">
        {NAV.map((n) => (
          <Link prefetch={false} key={n.href} href={n.href} className="shrink-0 rounded-full border bg-white px-4 py-2 text-sm font-medium hover:border-primary">{n.label}</Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
