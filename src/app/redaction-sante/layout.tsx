import Link from "next/link";
import { BookOpenCheck } from "lucide-react";
import { requireHealthStaff } from "@/lib/health/staff";

export const metadata = { title: "Rédaction santé" };

export default async function HealthEditorialLayout({ children }: { children: React.ReactNode }) {
  const st = await requireHealthStaff();
  const roles = [st.isAdmin && "administrateur", st.editor && !st.isAdmin && "rédacteur", st.validator && "validateur médical"].filter(Boolean).join(", ");
  return (
    <div className="container-page space-y-5 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link prefetch={false} href="/redaction-sante" className="flex items-center gap-2 text-xl font-bold text-[#052D1E]"><BookOpenCheck className="size-6 text-[#068132]" aria-hidden /> Bibliothèque santé — rédaction</Link>
        <p className="text-sm text-muted-foreground">{st.displayName ?? "Équipe"} · {roles}</p>
      </div>
      {children}
    </div>
  );
}
