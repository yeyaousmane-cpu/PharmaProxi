import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BadgeCheck, ExternalLink, Globe, Mail, MapPin, Navigation, Phone } from "lucide-react";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatPhone } from "@/lib/format";
import { cn } from "@/lib/utils";
import { FACILITY_KINDS, FOCUS_STATUS, OWNERSHIP, RELIABILITY, mapsUrl } from "@/lib/orientation";

export const dynamic = "force-dynamic";

type F = { id: string; name: string; kind: string; ownership: string | null; quarter: string | null; health_district: string | null; city_label: string | null; address: string | null;
  phone: string | null; phone2: string | null; email: string | null; website: string | null; hours: string | null; access_conditions: string | null; latitude: number | null; longitude: number | null;
  reliability: string; verified_at: string | null; source: string; source_url: string | null; to_verify: string | null; is_reference: boolean; reference_source: string | null; updated_at: string;
  regions: { name: string } | null; communes: { name: string; former_name: string | null } | null;
  facility_focus: { focus_code: string; status: string; detail: string | null; source: string; source_url: string | null; verified_at: string | null; care_focus: { label: string; sort: number } | null }[] };

const SELECT = "id, name, kind, ownership, quarter, health_district, city_label, address, phone, phone2, email, website, hours, access_conditions, latitude, longitude, reliability, verified_at, source, source_url, to_verify, is_reference, reference_source, updated_at, regions(name), communes(name, former_name), facility_focus(focus_code, status, detail, source, source_url, verified_at, care_focus(label, sort))";

async function load(id: string) {
  if (!z.uuid().safeParse(id).success) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("facility_listings").select(SELECT).eq("id", id).eq("is_published", true).maybeSingle();
  return data as unknown as F | null;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const f = await load((await params).id);
  return { title: f ? `${f.name} — SantéProxi Orientation` : "Établissement introuvable" };
}

const NA = <span className="text-muted-foreground">Information non renseignée</span>;
const Row = ({ t, children }: { t: string; children: React.ReactNode }) => <div className="grid gap-0.5 py-2 sm:grid-cols-[13rem_1fr]"><dt className="text-muted-foreground">{t}</dt><dd>{children}</dd></div>;

export default async function Facility({ params }: { params: Promise<{ id: string }> }) {
  const f = await load((await params).id);
  if (!f) notFound();
  const relv = RELIABILITY[f.reliability];
  const focus = [...(f.facility_focus ?? [])].sort((a, b) => (a.care_focus?.sort ?? 0) - (b.care_focus?.sort ?? 0));
  const commune = f.communes ? `${f.communes.name}${f.communes.former_name ? ` (ex-${f.communes.former_name})` : ""}` : null;
  return (
    <div className="container-page max-w-3xl space-y-5 py-6">
      <Link prefetch={false} href="/centres-specialises" className="inline-flex items-center gap-1 text-sm text-primary"><ArrowLeft className="size-4 rtl:-scale-x-100" aria-hidden /> SantéProxi Orientation</Link>
      <header className="space-y-2">
        <div className="flex flex-wrap gap-1.5 text-xs">
          <span className="rounded-full bg-brand-mint px-2 py-0.5 font-semibold text-brand-deep">{FACILITY_KINDS[f.kind] ?? f.kind}</span>
          {f.ownership && <span className="rounded-full bg-muted px-2 py-0.5 font-semibold">{OWNERSHIP[f.ownership]}</span>}
          <span className={cn("rounded-full px-2 py-0.5 font-semibold", relv.className)}>{f.reliability === "verifie" && <BadgeCheck className="me-0.5 inline size-3" aria-hidden />}{relv.label}</span>
          {f.is_reference && <span className="rounded-full bg-sky-100 px-2 py-0.5 font-semibold text-sky-900">Centre de référence</span>}
        </div>
        <h1 className="text-2xl font-bold text-brand-deep">{f.name}</h1>
        <p className="flex items-start gap-1 text-muted-foreground"><MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />{[f.address, f.quarter, commune, f.regions?.name].filter(Boolean).join(" · ") || f.city_label || "Localisation non renseignée"}</p>
        <p className="text-sm">{relv.help}</p>
        <div className="flex flex-wrap gap-2 pt-1">
          {f.phone && <a href={`tel:${f.phone}`} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-[#052D1E] px-4 font-semibold text-white"><Phone className="size-4" aria-hidden />Appeler {formatPhone(f.phone)}</a>}
          {f.latitude !== null && f.longitude !== null && <a href={mapsUrl(f.latitude, f.longitude)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border-2 px-4 font-semibold"><Navigation className="size-4" aria-hidden />Itinéraire</a>}
        </div>
      </header>

      <section className="rounded-2xl border bg-white p-4" aria-labelledby="svc">
        <h2 id="svc" className="mb-2 font-bold text-brand-deep">Spécialités et services</h2>
        {focus.length === 0 ? <p className="text-sm text-muted-foreground">Aucune spécialité n&apos;est encore confirmée pour cet établissement : elles seront ajoutées après vérification.</p> : (
          <ul className="divide-y text-sm">{focus.map((s) => (
            <li key={s.focus_code} className="space-y-1 py-2">
              <p className="flex flex-wrap items-center gap-2"><strong>{s.care_focus?.label}</strong><span className={cn("rounded px-1.5 py-0.5 text-xs font-semibold", FOCUS_STATUS[s.status].className)}>{FOCUS_STATUS[s.status].label}</span></p>
              {s.detail && <p>{s.detail}</p>}
              <p className="text-xs text-muted-foreground">Source : {s.source_url ? <a href={s.source_url} target="_blank" rel="noopener noreferrer" className="underline">{s.source}<ExternalLink className="ms-0.5 inline size-3" aria-hidden /></a> : s.source}{s.verified_at ? ` · ${formatDate(s.verified_at)}` : ""}</p>
            </li>))}</ul>
        )}
      </section>

      <section className="rounded-2xl border bg-white p-4" aria-labelledby="coord">
        <h2 id="coord" className="font-bold text-brand-deep">Coordonnées</h2>
        <dl className="divide-y text-sm">
          <Row t="Adresse">{f.address ?? NA}</Row>
          <Row t="Quartier">{f.quarter ?? NA}</Row>
          <Row t="Commune / arrondissement">{commune ?? NA}</Row>
          <Row t="District sanitaire">{f.health_district ?? NA}</Row>
          <Row t="Région">{f.regions?.name ?? NA}</Row>
          <Row t="Téléphone">{f.phone ? <a href={`tel:${f.phone}`} className="font-semibold text-primary">{formatPhone(f.phone)}</a> : NA}{f.phone2 && <> · <a href={`tel:${f.phone2}`} className="font-semibold text-primary">{formatPhone(f.phone2)}</a></>}</Row>
          {f.email && <Row t="E-mail"><a href={`mailto:${f.email}`} className="inline-flex items-center gap-1 text-primary"><Mail className="size-4" aria-hidden />{f.email}</a></Row>}
          {f.website && <Row t="Site officiel"><a href={f.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary"><Globe className="size-4" aria-hidden />{f.website.replace(/^https?:\/\//, "")}</a></Row>}
          <Row t="Position GPS">{f.latitude !== null && f.longitude !== null ? `${f.latitude.toFixed(5)}, ${f.longitude.toFixed(5)}` : NA}</Row>
        </dl>
      </section>

      <section className="rounded-2xl border bg-white p-4" aria-labelledby="acc">
        <h2 id="acc" className="font-bold text-brand-deep">Horaires, accès et prise en charge</h2>
        <dl className="divide-y text-sm">
          <Row t="Horaires">{f.hours ?? NA}</Row>
          <Row t="Conditions d'accès">{f.access_conditions ?? NA}</Row>
          <Row t="Tarifs, CANAM, AMO">{NA}</Row>
        </dl>
        <p className="mt-2 text-xs text-muted-foreground">Tarifs et conventionnement CANAM : affichés uniquement lorsqu&apos;ils sont confirmés par l&apos;établissement ou une source officielle.</p>
      </section>

      <section className="space-y-1 rounded-2xl bg-muted/50 p-4 text-xs text-muted-foreground">
        <p><span className="font-semibold text-foreground">Source de la fiche :</span> {f.source_url ? <a href={f.source_url} target="_blank" rel="noopener noreferrer" className="underline">{f.source.replace(/^\[0\.33\]\s*/, "")}</a> : f.source.replace(/^\[0\.33\]\s*/, "")}</p>
        <p><span className="font-semibold text-foreground">Dernière vérification :</span> {f.verified_at ? formatDate(f.verified_at) : "pas encore vérifiée par l'équipe SantéProxi"} · mise à jour le {formatDate(f.updated_at)}</p>
        {f.is_reference && f.reference_source && <p><span className="font-semibold text-foreground">Statut de centre de référence :</span> {f.reference_source}</p>}
        {f.to_verify && <p><span className="font-semibold text-foreground">Reste à vérifier :</span> {f.to_verify}</p>}
        <p>Une information est fausse ou manque ? <Link prefetch={false} href="/infos/contact" className="underline">Signalez-la</Link>. Vous représentez cet établissement ? Écrivez-nous pour compléter et vérifier la fiche.</p>
      </section>
    </div>
  );
}
