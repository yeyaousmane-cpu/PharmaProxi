import { AlertTriangle, CalendarClock, Clock, ShieldCheck, Siren } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DIRECTORY_FRESHNESS, scheduleLines, type DirectoryFreshness, type Schedule } from "@/lib/directory";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export function DirectoryFreshnessBadge({ freshness, confirmedAt }: { freshness: DirectoryFreshness; confirmedAt?: string | null }) {
  const f = DIRECTORY_FRESHNESS[freshness];
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Badge className={cn(f.className)}>{freshness === "fresh" ? <ShieldCheck className="size-3" aria-hidden /> : <Clock className="size-3" aria-hidden />}{f.label}</Badge>
      {confirmedAt ? <span className="text-xs text-muted-foreground">le {formatDate(confirmedAt)}</span> : null}
    </span>
  );
}

export function VerifiedBadge({ label = "Inscription à l'Ordre vérifiée" }: { label?: string }) {
  return <Badge className="border-sky-200 bg-brand-sky text-brand-blue"><ShieldCheck className="size-3" aria-hidden /> {label}</Badge>;
}

export function AbsenceBadge({ until }: { until: string }) {
  return <Badge className="border-amber-200 bg-amber-50 text-amber-900"><CalendarClock className="size-3" aria-hidden /> Absent jusqu&apos;au {formatDate(until)}</Badge>;
}

export function ScheduleTable({ schedule, compact = false }: { schedule: Schedule; compact?: boolean }) {
  const lines = scheduleLines(schedule ?? {});
  if (!lines.length) return <p className="text-sm text-muted-foreground">Jours non renseignés.</p>;
  return (
    <table className={cn("w-full", compact ? "text-xs" : "text-sm")}>
      <tbody>
        {lines.map((l) => (
          <tr key={l.day} className="border-b last:border-0">
            <th scope="row" className="py-1 pr-4 text-left font-medium">{l.day}</th>
            <td className="py-1 text-right tabular-nums">{l.slots}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Rappel permanent : l'annuaire n'est pas un service d'urgence (ANN-10). */
export function EmergencyBanner({ numbers }: { numbers?: string | null }) {
  return (
    <div role="note" className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">
      <Siren className="mt-0.5 size-5 shrink-0" aria-hidden />
      <p>
        <strong>Urgence vitale ?</strong> N&apos;attendez pas un rendez-vous : rendez-vous au service d&apos;urgence le plus proche
        {numbers ? <> ou appelez les numéros d&apos;urgence : <strong>{numbers}</strong></> : " ou contactez les services d'urgence"}.
        L&apos;annuaire n&apos;établit aucun diagnostic.
      </p>
    </div>
  );
}

export function NotDirectoryAdvice() {
  return (
    <p className="flex items-start gap-2 text-xs text-muted-foreground">
      <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden />
      Annuaire informatif : les médecins sont présentés par ordre alphabétique ou par distance, sans classement ni publicité. Les informations sont déclarées par les professionnels et vérifiées par PharmaProxi.
    </p>
  );
}
