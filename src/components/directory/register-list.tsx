import Link from "next/link";
import { BadgeCheck, Building2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export type RegisterRow = {
  id: string; register_year: number; registration_number: string | null; last_name: string; first_name: string;
  specialty_label: string | null; specialty_name: string | null; structure: string | null; crom: string | null; region_name: string | null; total_count: number;
};

// Libellés de structure trop génériques pour proposer une recherche d'établissement
const GENERIC = /^(autres?( privées?)?|autres ong|ong|privé|public|néant|-)$/i;
const title = (s: string) => s.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase());

/** Liste des médecins inscrits au Tableau de l'Ordre (registre officiel, sans coordonnées). */
export function RegisterList({ rows }: { rows: RegisterRow[] }) {
  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {rows.map((r) => (
        <li key={r.id} className="flex flex-col gap-1.5 rounded-xl border bg-white p-4">
          <p className="text-base font-bold text-brand-deep">Dr {r.first_name} {r.last_name}</p>
          <p className="text-sm font-medium text-brand-blue">{r.specialty_name ?? r.specialty_label ?? "Spécialité non précisée"}
            {r.specialty_name && r.specialty_label && r.specialty_label !== r.specialty_name ? <span className="font-normal text-muted-foreground"> ({r.specialty_label})</span> : null}
          </p>
          {r.structure && (
            <p className="flex items-start gap-1.5 text-sm">
              <Building2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span>Exerce à : {r.structure}
                {!GENERIC.test(r.structure.trim()) && (
                  <> · <Link prefetch={false} href={`/cliniques?q=${encodeURIComponent(r.structure.slice(0, 60))}`} className="text-brand-blue underline">trouver l&apos;établissement</Link></>
                )}
              </span>
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            {[r.region_name ? `Conseil régional : ${r.region_name}` : r.crom ? `Conseil régional : ${title(r.crom)}` : null, r.registration_number ? `N° d'inscription : ${r.registration_number}` : null].filter(Boolean).join(" · ")}
          </p>
          <Badge className="mt-1 w-fit border-emerald-200 bg-emerald-50 text-emerald-900">
            <BadgeCheck className="size-3" aria-hidden /> Inscrit au Tableau {r.register_year} de l&apos;Ordre
          </Badge>
        </li>
      ))}
    </ul>
  );
}
