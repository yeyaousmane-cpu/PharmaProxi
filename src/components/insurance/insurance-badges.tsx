import Link from "next/link";
import { BadgeCheck, Info, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";
import {
  CONFIRM_BEFORE_VISIT, CONVENTION_STATUS, asConventionStatus,
  type EstablishmentInsurance, type InsuranceBadge,
} from "@/lib/insurance";
import { cn } from "@/lib/utils";

/** Badge discret « Organisme – statut ». Coche de vérification uniquement pour le tiers payant confirmé. */
export function ConventionBadge({ name, status, compact = false }: { name: string; status: string; compact?: boolean }) {
  const s = asConventionStatus(status);
  const meta = CONVENTION_STATUS[s];
  return (
    <Badge className={cn("max-w-full", meta.className)} title={meta.hint}>
      {s === "tiers_payant_confirme" ? <BadgeCheck className="size-3 shrink-0" aria-hidden /> : <ShieldCheck className="size-3 shrink-0" aria-hidden />}
      <span className="truncate">{name}{compact ? "" : ` – ${meta.label}`}</span>
      {compact && <span className="sr-only"> – {meta.label}</span>}
    </Badge>
  );
}

/** Ligne de badges pour une carte de liste (3 au plus, puis « + n »). */
export function BadgeRow({ badges, href }: { badges?: InsuranceBadge[]; href?: string }) {
  if (!badges?.length) return null;
  const shown = badges.slice(0, 3);
  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label="Assurances">
      {shown.map((b) => <ConventionBadge key={b.insurer_slug} name={b.insurer_name} status={b.public_status} />)}
      {badges.length > shown.length && (href
        ? <Link prefetch={false} href={href} className="text-xs text-muted-foreground underline">+ {badges.length - shown.length}</Link>
        : <span className="text-xs text-muted-foreground">+ {badges.length - shown.length}</span>)}
    </div>
  );
}

/** Rubrique « Assurances acceptées » d'une fiche établissement. */
export function InsuranceSection({ rows, phone }: { rows: EstablishmentInsurance[]; phone?: string | null }) {
  return (
    <section aria-labelledby="assurances-title" className="rounded-2xl border bg-white p-5">
      <h2 id="assurances-title" className="flex items-center gap-2 text-lg font-bold text-brand-deep">
        <ShieldCheck className="size-5 text-primary" aria-hidden /> Assurances acceptées
      </h2>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Aucune convention d&apos;assurance n&apos;est référencée pour cet établissement sur SantéProxi. Cela ne veut pas dire qu&apos;il n&apos;en a pas : renseignez-vous sur place.
        </p>
      ) : (
        <ul className="mt-3 space-y-3">
          {rows.map((r) => {
            const s = asConventionStatus(r.public_status);
            return (
              <li key={r.insurer_slug} className="rounded-xl border p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <ConventionBadge name={r.insurer_name} status={r.public_status} />
                  <Link prefetch={false} href={`/assurances/${r.insurer_slug}`} className="text-xs text-primary underline">Réseau de l&apos;organisme</Link>
                </div>
                <dl className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-[auto_1fr]">
                  {s === "a_verifier" && r.tiers_payant && <><dt className="text-muted-foreground">Tiers payant</dt><dd>Annoncé par la source, pas encore confirmé</dd></>}
                  {r.services_covered && <><dt className="text-muted-foreground">Prestations prises en charge</dt><dd>{r.services_covered}</dd></>}
                  {r.conditions && <><dt className="text-muted-foreground">Conditions</dt><dd>{r.conditions}</dd></>}
                  {r.documents_required && <><dt className="text-muted-foreground">Documents à présenter</dt><dd>{r.documents_required}</dd></>}
                  {r.source_label && <><dt className="text-muted-foreground">Source</dt><dd>{r.source_label}{r.source_date ? ` (${formatDate(r.source_date)})` : ""}</dd></>}
                  <dt className="text-muted-foreground">Dernière vérification</dt>
                  <dd>{r.verified_at ? formatDate(r.verified_at) : "pas encore vérifiée par SantéProxi"}</dd>
                </dl>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-3 flex items-start gap-1.5 text-sm font-medium text-amber-950">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>{CONFIRM_BEFORE_VISIT}{phone ? <> <a href={`tel:${phone}`} className="underline">Appeler</a>.</> : null}</span>
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Information incorrecte ? <Link prefetch={false} href="/infos/contact?sujet=autre" className="underline">Signalez-la</Link> : nous la vérifierons auprès de l&apos;organisme.
      </p>
    </section>
  );
}
