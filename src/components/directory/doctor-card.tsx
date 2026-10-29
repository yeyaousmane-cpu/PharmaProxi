import Link from "next/link";
import { Building2, CalendarCheck, Languages, MapPin, Phone } from "lucide-react";
import { formatApptDay, formatApptTime } from "@/lib/appointments";
import { Badge } from "@/components/ui/badge";
import { AbsenceBadge, DirectoryFreshnessBadge } from "@/components/directory/directory-bits";
import { LANGUAGES, daysSummary, type DirectoryFreshness } from "@/lib/directory";
import { formatDistance, formatPhone } from "@/lib/format";

export type DoctorRow = {
  doctor_id: string; title: string; display_name: string; gender: string | null; languages: string[];
  specialties: { id: string; name: string }[];
  sites: { clinic_id: string; clinic_name: string; commune: string | null; region: string; days: string[]; phone: string | null; distance_km: number | null }[];
  distance_km: number | null; confirmed_at: string; freshness: DirectoryFreshness; absent_until: string | null; total_count: number;
};

/** Carte de résultat de l'annuaire : présentation identique pour tous les médecins (aucune mise en avant). */
export function DoctorCard({ d, next }: { d: DoctorRow; next?: { site_id: string; slot_start: string } | null }) {
  return (
    <article className="rounded-xl border bg-white p-4 transition hover:border-brand-blue">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-lg font-bold text-brand-deep">
            <Link prefetch={false} href={`/medecins/${d.doctor_id}`} className="hover:underline">{d.title} {d.display_name}</Link>
          </h3>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {d.specialties.map((s) => <Badge key={s.id} className="border-sky-200 bg-brand-sky text-brand-blue">{s.name}</Badge>)}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-start gap-1 sm:items-end">
          {d.absent_until ? <AbsenceBadge until={d.absent_until} /> : null}
          <DirectoryFreshnessBadge freshness={d.freshness} />
          {d.distance_km !== null ? <span className="text-xs text-muted-foreground">{formatDistance(d.distance_km)}</span> : null}
        </div>
      </div>
      {d.sites.length ? (
        <ul className="mt-3 grid gap-2">
          {d.sites.map((s) => (
            <li key={s.clinic_id} className="flex flex-col gap-1 rounded-lg bg-muted/60 p-2 text-sm sm:flex-row sm:items-center sm:justify-between">
              <span className="min-w-0">
                <Link prefetch={false} href={`/cliniques/${s.clinic_id}`} className="inline-flex items-center gap-1 font-medium hover:underline">
                  <Building2 className="size-4 shrink-0 text-brand-blue" aria-hidden />{s.clinic_name}
                </Link>
                <span className="ml-1 inline-flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="size-3" aria-hidden />{[s.commune, s.region].filter(Boolean).join(", ")}</span>
                <span className="block text-xs">Consultations : <strong>{daysSummary(s.days) || "jours non renseignés"}</strong></span>
              </span>
              {s.phone ? (
                <a href={`tel:${s.phone}`} className="inline-flex shrink-0 items-center gap-1 font-semibold text-brand-blue hover:underline">
                  <Phone className="size-4" aria-hidden /> {formatPhone(s.phone)}
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">Lieux de consultation non encore publiés.</p>
      )}
      {next && (
        <Link prefetch={false} href={`/medecins/${d.doctor_id}/rendez-vous?lieu=${next.site_id}`}
          className="mt-3 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-900 hover:bg-emerald-100">
          <CalendarCheck className="size-4 shrink-0" aria-hidden />
          <span>Prochaine disponibilité : <strong>{formatApptDay(next.slot_start)} à {formatApptTime(next.slot_start)}</strong> · Prendre rendez-vous</span>
        </Link>
      )}
      <p className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Languages className="size-3" aria-hidden /> {d.languages.map((l) => LANGUAGES[l] ?? l).join(", ")}
      </p>
    </article>
  );
}
