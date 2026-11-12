import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { ProGuard } from "@/components/security/pro-guard";

const NAV = [
  { href: "/pharmacien", label: "Tableau de bord" },
  { href: "/pharmacien/stocks", label: "Stocks" },
  { href: "/pharmacien/commandes", label: "Commandes" },
  { href: "/pharmacien/ordonnances", label: "Ordonnances reçues" },
  { href: "/pharmacien/questions", label: "Questions des patients" },
  { href: "/pharmacien/mouvements", label: "Mouvements" },
  { href: "/pharmacien/ma-pharmacie", label: "Ma pharmacie" },
];

export default async function PharmacistLayout({ children }: { children: React.ReactNode }) {
  const s = await requireUser("/pharmacien");
  // Pas encore pharmacien (inscription en attente d'autorisation) : pas de menu de l'espace pharmacien
  if (!s.roles.includes("pharmacist") && !s.roles.includes("admin")) return <div className="container-page py-6">{children}</div>;
  return (
    <div className="container-page py-6">
      <ProGuard path="/pharmacien" />
      <nav aria-label="Espace pharmacien" className="-mx-4 mb-6 flex gap-1 overflow-x-auto px-4 pb-1">
        {NAV.map((n) => (
          <Link prefetch={false} key={n.href} href={n.href} className="shrink-0 rounded-full border bg-white px-4 py-2 text-sm font-medium hover:border-primary">{n.label}</Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
