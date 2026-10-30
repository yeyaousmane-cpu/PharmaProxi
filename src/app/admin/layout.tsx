import Link from "next/link";
import { requireRole } from "@/lib/auth";

const NAV = [
  ["/admin", "Vue générale"], ["/admin/pharmacies", "Pharmacies"], ["/admin/pharmacies-non-inscrites", "Pharmacies non inscrites"], ["/admin/annuaire", "Annuaire médical"], ["/admin/services", "Gardes, examens, ruptures"], ["/admin/catalogue", "Catalogue"], ["/admin/commandes", "Commandes"],
  ["/admin/livreurs", "Livreurs"], ["/admin/utilisateurs", "Utilisateurs"], ["/admin/signalements", "Signalements"], ["/admin/messages", "Messages"], ["/admin/annonces", "Annonces"], ["/redaction-sante", "Bibliothèque santé"], ["/admin/audio", "Guides audio"],
  ["/admin/geographie", "Géographie"], ["/admin/parametres", "Paramètres"], ["/admin/contenus", "Contenus"], ["/admin/integrite", "Intégrité"], ["/admin/audit", "Journal d'audit"],
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireRole("admin", "/admin");
  return (
    <div className="container-page py-6">
      <nav aria-label="Administration" className="-mx-4 mb-6 flex gap-1 overflow-x-auto px-4 pb-1">
        {NAV.map(([href, label]) => (
          <Link prefetch={false} key={href} href={href} className="shrink-0 rounded-full border bg-white px-4 py-2 text-sm font-medium hover:border-primary">{label}</Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
