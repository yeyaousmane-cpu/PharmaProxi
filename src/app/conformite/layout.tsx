import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Conformité et registre des consentements", robots: { index: false } };
export const dynamic = "force-dynamic";

const NAV: [string, string][] = [
  ["/conformite", "Vue d'ensemble"], ["/conformite/preuves", "Registre des preuves"], ["/conformite/reclamations", "Réclamations"],
  ["/conformite/registre", "Registre des traitements"], ["/conformite/politique", "Politique de confidentialité"], ["/conformite/identite", "Responsable du traitement"],
  ["/conformite/journal", "Journal des consultations"], ["/conformite/habilitations", "Habilitations"],
];
const ROLE: Record<string, string> = { admin: "Administrateur", dpo: "Correspondant protection des données", juriste: "Responsable juridique", auditeur: "Auditeur (lecture seule)" };

/** Module réservé aux personnes habilitées : administrateur, correspondant protection des données, juriste, auditeur. */
export default async function ComplianceLayout({ children }: { children: React.ReactNode }) {
  await requireUser("/conformite");
  const supabase = await createClient();
  const { data: role } = await supabase.rpc("compliance_role");
  if (!role) redirect("/compte");
  return (
    <div className="container-page max-w-6xl space-y-4 py-6">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b pb-3 print:hidden">
        <div><p className="text-xs font-bold uppercase tracking-widest text-[#068132]">Accès habilité · consultations journalisées</p>
          <h1 className="text-2xl font-bold text-[#052D1E]">Conformité et registre des consentements</h1></div>
        <span className="rounded-full bg-[#EAF6EE] px-3 py-1 text-sm font-semibold text-[#052D1E]">{ROLE[role as string] ?? role}</span>
      </header>
      <nav aria-label="Conformité" className="flex flex-wrap gap-2 print:hidden">{NAV.filter(([h]) => h !== "/conformite/habilitations" || role === "admin").map(([h, l]) => (
        <Link key={h} prefetch={false} href={h} className="rounded-full border px-3 py-1.5 text-sm font-semibold hover:border-[#068132]">{l}</Link>))}</nav>
      {children}
    </div>
  );
}
