import Link from "next/link";
import { BadgeCheck, Building2, CalendarCheck, FlaskConical, Info, Store, Stethoscope } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { HEALTH_KIND, HEALTH_RECO } from "@/lib/health/labels";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export type ArticleRow = {
  id: string; slug: string; title: string; summary: string; kind: string; category_slug?: string; category_name?: string;
  recommendation: string | null; reviewed_at: string | null; validator_name: string | null;
};

export function ValidationBadge({ name, date, className }: { name: string | null; date: string | null; className?: string }) {
  if (!name || !date) return null;
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs text-emerald-800", className)}>
      <BadgeCheck className="size-3.5" aria-hidden /> Validé par {name} · {formatDate(date)}
    </span>
  );
}

export function RecoBadge({ value }: { value: string | null }) {
  if (!value || !HEALTH_RECO[value]) return null;
  return <Badge className={HEALTH_RECO[value].className} title={HEALTH_RECO[value].hint}>{HEALTH_RECO[value].label}</Badge>;
}

export function ArticleCard({ a, showCategory = false }: { a: ArticleRow; showCategory?: boolean }) {
  return (
    <article className="relative flex h-full flex-col gap-2 rounded-xl border bg-white p-4 transition hover:border-[#068132]/50 hover:shadow-sm">
      <div className="flex flex-wrap items-center gap-1.5">
        {a.kind !== "fiche" && <Badge className="bg-[#EAF6EE] text-[#052D1E]">{HEALTH_KIND[a.kind]}</Badge>}
        <RecoBadge value={a.recommendation} />
        {showCategory && a.category_name && <span className="text-xs text-muted-foreground">{a.category_name}</span>}
      </div>
      <h3 className="text-base font-bold leading-snug text-[#052D1E]">
        <Link prefetch={false} href={`/sante/fiche/${a.slug}`} className="after:absolute after:inset-0 hover:underline">{a.title}</Link>
      </h3>
      <p className="line-clamp-3 text-sm text-muted-foreground">{a.summary}</p>
      <ValidationBadge name={a.validator_name} date={a.reviewed_at} className="mt-auto pt-1" />
    </article>
  );
}

export function MedicalDisclaimer({ className }: { className?: string }) {
  return (
    <p className={cn("flex items-start gap-2 rounded-xl border bg-white p-3 text-xs text-muted-foreground", className)}>
      <Info className="mt-0.5 size-4 shrink-0 text-[#1D5FA8]" aria-hidden />
      Ces informations générales ne remplacent pas une consultation. Pour une question sur votre santé, adressez-vous à un médecin, une sage-femme ou un pharmacien.
      En cas d&apos;urgence, rendez-vous au service d&apos;urgence le plus proche.
    </p>
  );
}

export function FindProfessionals({ specialty, title = "Trouver un professionnel de santé" }: { specialty?: { id: string; name: string } | null; title?: string }) {
  const links: [string, string, typeof Stethoscope][] = [
    [specialty ? `/medecins?specialite=${specialty.id}` : "/medecins", specialty ? `Médecins : ${specialty.name}` : "Médecins", Stethoscope],
    ["/rendez-vous", "Prendre rendez-vous", CalendarCheck],
    ["/laboratoires", "Laboratoires", FlaskConical],
    ["/pharmacies", "Pharmacies", Store],
    ["/cliniques", "Cliniques et hôpitaux", Building2],
  ];
  return (
    <section aria-label={title} className="rounded-2xl border bg-[#052D1E] p-5 text-white">
      <h2 className="text-lg font-bold">{title}</h2>
      <p className="mt-1 text-sm text-white/80">Les professionnels et établissements référencés sur PharmaProxi, près de chez vous.</p>
      <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {links.map(([href, label, Icon]) => (
          <li key={href}>
            <Link prefetch={false} href={href} className="flex h-full items-center gap-2 rounded-lg bg-white/10 px-3 py-2.5 text-sm font-semibold hover:bg-white/20">
              <Icon className="size-4 shrink-0" aria-hidden /> {label}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function HealthSearchBar({ defaultValue, action = "/sante/recherche" }: { defaultValue?: string; action?: string }) {
  return (
    <form method="get" action={action} role="search" className="flex gap-2">
      <label htmlFor="sante-q" className="sr-only">Rechercher un sujet de santé</label>
      <input id="sante-q" name="q" defaultValue={defaultValue} list="sante-suggestions" placeholder="Drépanocytose, groupe sanguin, paludisme…" maxLength={80}
        className="h-12 min-w-0 flex-1 rounded-xl border bg-white px-4 text-base shadow-sm outline-none focus:border-[#068132] focus:ring-2 focus:ring-[#068132]/20" />
      <datalist id="sante-suggestions">
        {["Drépanocytose", "Groupe sanguin", "Rhésus", "Électrophorèse de l'hémoglobine", "Hépatite B", "VIH", "Syphilis", "Paludisme", "Fertilité", "Vaccination", "Diabète", "Hypertension"].map((x) => <option key={x} value={x} />)}
      </datalist>
      <button type="submit" className="h-12 shrink-0 rounded-xl bg-[#068132] px-5 font-semibold text-white hover:bg-[#02A934]">Rechercher</button>
    </form>
  );
}
