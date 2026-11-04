import Link from "next/link";
import { FlaskConical } from "lucide-react";
import type { LabMembership } from "@/lib/lab-server";
import { IdleLogout } from "@/components/security/idle-logout";
import { cn } from "@/lib/utils";

export function LabShell({ labs, current, active, children }: { labs: LabMembership[]; current: LabMembership; active: string; children: React.ReactNode }) {
  const q = labs.length > 1 ? `?labo=${current.facility_id}` : "";
  return (
    <div className="container-page max-w-5xl space-y-4 py-6">
      <IdleLogout />
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-brand-deep"><FlaskConical className="size-7 text-brand-blue" aria-hidden /> {current.name}</h1>
        <p className="text-sm text-muted-foreground">{current.public_code}{current.region ? ` · ${current.region}` : ""}</p>
      </header>
      {labs.length > 1 && (
        <nav className="flex flex-wrap gap-2 text-sm">{labs.map((l) => <Link prefetch={false} key={l.facility_id} href={`/laboratoire${active}?labo=${l.facility_id}`} className={cn("rounded-full border px-3 py-1", l.facility_id === current.facility_id ? "border-brand-deep bg-brand-deep text-white" : "bg-white")}>{l.name}</Link>)}</nav>
      )}
      <nav aria-label="Espace laboratoire" className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1">
        {[["", "Analyses et prix"], ["/domicile", "Prélèvement à domicile"], ["/prelevements", "Demandes reçues"]].map(([h, l]) => (
          <Link prefetch={false} key={h} href={`/laboratoire${h}${q}`} className={cn("shrink-0 rounded-full border px-4 py-2 text-sm font-medium", active === h ? "border-primary bg-primary text-white" : "bg-white")}>{l}</Link>
        ))}
      </nav>
      {children}
    </div>
  );
}

export function NoLab() {
  return (
    <div className="container-page max-w-xl py-10">
      <section className="space-y-3 rounded-2xl border bg-white p-6 text-center">
        <FlaskConical className="mx-auto size-10 text-brand-blue" aria-hidden />
        <h1 className="text-xl font-bold text-brand-deep">Espace laboratoire</h1>
        <p className="text-sm text-muted-foreground">Votre espace n&apos;est pas encore ouvert. Faites une demande : l&apos;équipe vérifie l&apos;autorisation du laboratoire avant d&apos;ouvrir l&apos;accès.</p>
        <Link prefetch={false} href="/laboratoire/inscription" className="inline-block rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white">Demander l&apos;accès</Link>
      </section>
    </div>
  );
}
