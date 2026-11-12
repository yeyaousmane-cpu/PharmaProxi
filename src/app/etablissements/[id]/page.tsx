import { InsuranceSection } from "@/components/insurance/insurance-badges";
import type { EstablishmentInsurance } from "@/lib/insurance";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BadgeCheck, ExternalLink, Flag, Globe, Mail, MapPin, MessageCircle, Navigation, Phone, ShieldCheck } from "lucide-react";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";
import { ACCESS_FIELDS, SERVICE_STATUS } from "@/lib/orientation-partners";
import { designatePartner, requestFacilityAppointment } from "@/app/actions/v041";
import { formatDate, formatPhone } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Input, Select, Textarea } from "@/components/ui/input";
import { FOCUS_STATUS, OWNERSHIP, RELIABILITY, mapsUrl } from "@/lib/orientation";
import { CONTACTS, CORRECTION_KINDS, DIRECTORY_KINDS, LINK_RELATIONS, OFFER_TYPES, OPERATING, SOURCE_LEVEL, trustLabel, waUrl } from "@/lib/national-directory";
import { linkFacility, saveFacilityExtra, setFacilityOffer, setFacilityStatus, submitFacilityCorrection } from "@/app/actions/v036";

export const dynamic = "force-dynamic";

type F = { id: string; name: string; kind: string; category_label: string | null; ownership: string | null; quarter: string | null; locality: string | null; health_district: string | null;
  city_label: string | null; address: string | null; phone: string | null; phone2: string | null; whatsapp: string | null; email: string | null; website: string | null; hours: string | null;
  access_conditions: string | null; latitude: number | null; longitude: number | null; position_precision: string; emergency_24h: boolean; reliability: string; verified_at: string | null; source: string;
  source_url: string | null; source_level: string; operating_status: string; contacts_status: string; official_code: string | null; alt_names: string[]; to_verify: string | null;
  is_reference: boolean; reference_source: string | null; updated_at: string; circle_id: string | null; commune_id: string | null; is_published: boolean;
  regions: { name: string } | null; circles: { name: string } | null; communes: { name: string; former_name: string | null } | null;
  facility_focus: { focus_code: string; status: string; detail: string | null; source: string; source_url: string | null; verified_at: string | null; care_focus: { label: string; sort: number } | null }[] };
type Offer = { offer_type: string; code: string; label: string; status: string; source: string; source_url: string | null; verified_at: string | null };
type Src = { id: number; source: string; source_url: string | null; source_level: string; document_date: string | null; page: number | null; collected_at: string };
type Lk = { related_id: string; relation: string; source: string; source_url: string | null; facility_listings: { name: string; kind: string } | null };

const SELECT = "id, name, kind, category_label, ownership, quarter, locality, health_district, city_label, address, phone, phone2, whatsapp, email, website, hours, access_conditions, latitude, longitude, position_precision, emergency_24h, reliability, verified_at, source, source_url, source_level, operating_status, contacts_status, official_code, alt_names, to_verify, is_reference, reference_source, updated_at, circle_id, commune_id, is_published, regions(name), circles(name), communes(name, former_name), facility_focus(focus_code, status, detail, source, source_url, verified_at, care_focus(label, sort))";

async function load(fid: string) {
  if (!z.uuid().safeParse(fid).success) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("facility_listings").select(SELECT).eq("id", fid).maybeSingle();
  return data as unknown as F | null;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const f = await load((await params).id);
  return { title: f ? `${f.name} — Annuaire national SantéProxi` : "Établissement introuvable", robots: f?.is_published ? undefined : { index: false } };
}

const NA = <span className="text-muted-foreground">Information non renseignée</span>;
const Row = ({ t, children }: { t: string; children: React.ReactNode }) => <div className="grid gap-0.5 py-2 sm:grid-cols-[13rem_1fr]"><dt className="text-muted-foreground">{t}</dt><dd>{children}</dd></div>;
const Section = ({ id, title, children }: { id: string; title: string; children: React.ReactNode }) => (
  <section className="rounded-2xl border bg-white p-4" aria-labelledby={id}><h2 id={id} className="mb-1 font-bold text-brand-deep">{title}</h2>{children}</section>);

export default async function Facility({ params }: { params: Promise<{ id: string }> }) {
  const fid = (await params).id;
  const f = await load(fid);
  if (!f) notFound();
  const session = await getSession();
  const supabase = await createClient();
  const [offersR, srcR, linksR, isAdmin] = await Promise.all([
    supabase.from("facility_offers").select("offer_type, code, label, status, source, source_url, verified_at").eq("facility_id", f.id).order("label"),
    supabase.from("facility_sources").select("id, source, source_url, source_level, document_date, page, collected_at").eq("facility_id", f.id).order("collected_at", { ascending: false }),
    supabase.from("facility_links").select("related_id, relation, source, source_url, facility_listings!facility_links_related_id_fkey(name, kind)").eq("facility_id", f.id),
    session ? supabase.rpc("is_admin").then((r) => !!r.data) : Promise.resolve(false),
  ]);
  const [accessR, statusR, partnerR, insuranceR] = await Promise.all([
    supabase.from("facility_access_info").select("field, value, source_kind, source_url, confirmed_at").eq("facility_id", f.id),
    supabase.from("facility_service_status").select("id, service, status, message, valid_until, created_at").eq("facility_id", f.id).gt("valid_until", new Date().toISOString()).order("created_at", { ascending: false }),
    supabase.rpc("facility_is_partner", { p_facility: f.id }),
    supabase.rpc("establishment_insurance", { p_kind: "facility", p_id: f.id }),
  ]);
  const insurance = (insuranceR.data ?? []) as EstablishmentInsurance[];
  const access = (accessR.data ?? []) as { field: string; value: string; source_kind: string; source_url: string | null; confirmed_at: string }[];
  const serviceStatus = (statusR.data ?? []) as { id: string; service: string; status: string; message: string | null; valid_until: string; created_at: string }[];
  const isPartner = !!partnerR.data;
  if (!f.is_published && !isAdmin) notFound();
  const offers = (offersR.data ?? []) as Offer[]; const sources = (srcR.data ?? []) as Src[]; const links = (linksR.data ?? []) as unknown as Lk[];
  const trust = trustLabel(f.reliability, f.source_level);
  const relv = RELIABILITY[f.reliability];
  const commune = f.communes ? `${f.communes.name}${f.communes.former_name ? ` (ex-${f.communes.former_name})` : ""}` : null;
  const focus = [...(f.facility_focus ?? [])].sort((a, b) => (a.care_focus?.sort ?? 0) - (b.care_focus?.sort ?? 0));
  const kindLabel = f.category_label === "Polyclinique" ? "Polyclinique" : DIRECTORY_KINDS[f.kind === "chu" ? "hopital" : f.kind] ?? f.kind;
  const hasGps = f.latitude !== null && f.longitude !== null;
  const contact = CONTACTS[f.contacts_status];
  const grouped = Object.keys(OFFER_TYPES).map((t) => [t, offers.filter((o) => o.offer_type === t)] as const).filter(([, l]) => l.length > 0);
  const confirmedCodes = new Set(offers.filter((o) => o.status === "confirme").map((o) => o.code));
  return (
    <div className="container-page max-w-3xl space-y-5 py-6">
      <Link prefetch={false} href="/etablissements" className="inline-flex items-center gap-1 text-sm text-primary"><ArrowLeft className="size-4 rtl:-scale-x-100" aria-hidden /> Annuaire national</Link>
      {!f.is_published && <p className="rounded-xl bg-amber-100 p-3 text-sm font-semibold text-amber-950">Fiche non publiée (visible par l&apos;administration seulement) : {f.to_verify ?? "à vérifier"}</p>}
      {f.operating_status === "ferme" && <p className="rounded-xl bg-red-100 p-3 text-sm font-semibold text-red-900">Cet établissement est signalé comme fermé : il n&apos;apparaît plus dans la recherche.</p>}

      <header className="space-y-2">
        <div className="flex flex-wrap gap-1.5 text-xs">
          <span className="rounded-full bg-brand-mint px-2 py-0.5 font-semibold text-brand-deep">{kindLabel}</span>
          {f.ownership && <span className="rounded-full bg-muted px-2 py-0.5 font-semibold">{OWNERSHIP[f.ownership]}</span>}
          <span className={cn("rounded-full px-2 py-0.5 font-semibold", trust.className)}>{f.reliability === "verifie" && <BadgeCheck className="me-0.5 inline size-3" aria-hidden />}{trust.label}</span>
          {f.is_reference && <span className="rounded-full bg-sky-100 px-2 py-0.5 font-semibold text-sky-900">Centre de référence</span>}
        </div>
        <h1 className="text-2xl font-bold text-brand-deep">{f.name}</h1>
        {f.alt_names.length > 0 && <p className="text-sm text-muted-foreground">Aussi appelé : {f.alt_names.join(" · ")}</p>}
        <p className="flex items-start gap-1 text-muted-foreground"><MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
          {[f.address, f.quarter, f.locality, commune, f.circles ? `cercle de ${f.circles.name}` : null, f.regions?.name].filter(Boolean).join(" · ") || f.city_label || "Localisation non renseignée"}</p>
        <p className="text-sm">{f.reliability === "verifie" ? relv.help : SOURCE_LEVEL[f.source_level]?.help} Appelez avant de vous déplacer.</p>
        <div className="flex flex-wrap gap-2 pt-1">
          {f.phone && <a href={`tel:${f.phone}`} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-[#052D1E] px-4 font-semibold text-white"><Phone className="size-4" aria-hidden />Appeler {formatPhone(f.phone)}</a>}
          {f.whatsapp && <a href={waUrl(f.whatsapp)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border-2 px-4 font-semibold"><MessageCircle className="size-4" aria-hidden />WhatsApp</a>}
          {f.email && <a href={`mailto:${f.email}`} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border-2 px-4 font-semibold"><Mail className="size-4" aria-hidden />E-mail</a>}
          {hasGps && <a href={mapsUrl(f.latitude!, f.longitude!)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border-2 px-4 font-semibold"><Navigation className="size-4" aria-hidden />Itinéraire</a>}
          <a href="#signaler" className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border px-4 text-sm font-semibold"><Flag className="size-4" aria-hidden />Signaler une erreur</a>
        </div>
        {f.phone && <p className={cn("text-xs", contact.className)}>{contact.label}</p>}
      </header>

      <Section id="coord" title="Coordonnées et localisation">
        <dl className="divide-y text-sm">
          <Row t="Adresse">{f.address ?? NA}</Row>
          <Row t="Quartier ou village">{f.quarter ?? f.locality ?? NA}</Row>
          <Row t="Commune">{commune ?? NA}</Row>
          <Row t="Cercle">{f.circles?.name ?? NA}</Row>
          <Row t="Région">{f.regions?.name ?? NA}</Row>
          <Row t="District sanitaire">{f.health_district ?? NA}</Row>
          <Row t="Téléphone">{f.phone ? <a href={`tel:${f.phone}`} className="font-semibold text-primary">{formatPhone(f.phone)}</a> : NA}{f.phone2 && <> · <a href={`tel:${f.phone2}`} className="font-semibold text-primary">{formatPhone(f.phone2)}</a></>}</Row>
          <Row t="WhatsApp professionnel">{f.whatsapp ? <a href={waUrl(f.whatsapp)} target="_blank" rel="noopener noreferrer" className="text-primary">{formatPhone(f.whatsapp)}</a> : NA}</Row>
          <Row t="E-mail">{f.email ? <a href={`mailto:${f.email}`} className="inline-flex items-center gap-1 text-primary"><Mail className="size-4" aria-hidden />{f.email}</a> : NA}</Row>
          <Row t="Site officiel">{f.website ? <a href={f.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary"><Globe className="size-4" aria-hidden />{f.website.replace(/^https?:\/\//, "")}</a> : NA}</Row>
          <Row t="Position GPS">{hasGps ? (
            <>
              {f.latitude!.toFixed(5)}, {f.longitude!.toFixed(5)} · <a href={`https://www.openstreetmap.org/?mlat=${f.latitude}&mlon=${f.longitude}#map=16/${f.latitude}/${f.longitude}`} target="_blank" rel="noopener noreferrer" className="text-primary underline">voir sur la carte</a>
              {f.position_precision === "approximative" && (
                <span className="block text-xs font-medium text-amber-800">Position approximative : elle situe le secteur du quartier, pas l&apos;adresse exacte. Plusieurs fiches partagent cette coordonnée. Faites confirmer l&apos;adresse avant de vous déplacer.</span>
              )}
              {f.position_precision === "a_confirmer" && (
                <span className="block text-xs text-muted-foreground">Position non vérifiée sur place.</span>
              )}
              {f.position_precision === "confirmee" && (
                <span className="block text-xs text-muted-foreground">Position relevée sur place.</span>
              )}
            </>
          ) : <>{NA} <span className="text-xs text-muted-foreground">— aucune position n&apos;est estimée par SantéProxi.</span></>}</Row>
          {f.official_code && <Row t="Code de conventionnement CANAM">{f.official_code}</Row>}
        </dl>
      </Section>

      <Section id="offre" title="Offre de soins">
        {grouped.length === 0 && focus.length === 0 ? <p className="text-sm text-muted-foreground">Aucun service, aucune spécialité ni aucun examen n&apos;est encore confirmé par une source pour cet établissement. Renseignez-vous par téléphone.</p> : (
          <div className="space-y-3 text-sm">
            {grouped.map(([t, list]) => (
              <div key={t}><h3 className="font-semibold">{OFFER_TYPES[t]}</h3>
                <ul className="mt-1 flex flex-wrap gap-1.5">{list.map((o) => <li key={o.code} className={cn("rounded-lg px-2 py-1 text-xs font-medium", o.status === "confirme" ? "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200" : o.status === "indisponible" ? "bg-slate-100 text-slate-600 line-through" : "bg-amber-50 text-amber-900 ring-1 ring-amber-200")} title={`Source : ${o.source}`}>{o.label}{o.status === "a_confirmer" ? " (à confirmer)" : ""}</li>)}</ul></div>))}
            {focus.length > 0 && (
              <div><h3 className="font-semibold">Prises en charge spécialisées</h3>
                <ul className="divide-y">{focus.map((s) => (
                  <li key={s.focus_code} className="space-y-1 py-2"><p className="flex flex-wrap items-center gap-2"><strong>{s.care_focus?.label}</strong><span className={cn("rounded px-1.5 py-0.5 text-xs font-semibold", FOCUS_STATUS[s.status].className)}>{FOCUS_STATUS[s.status].label}</span></p>
                    {s.detail && <p>{s.detail}</p>}<p className="text-xs text-muted-foreground">Source : {s.source_url ? <a href={s.source_url} target="_blank" rel="noopener noreferrer" className="underline">{s.source}</a> : s.source}</p></li>))}</ul></div>)}
            <p className="text-xs text-muted-foreground">Sources des services : {[...new Set(offers.map((o) => o.source))].join(" ; ") || "—"}. Un service n&apos;est affiché « confirmé » que s&apos;il figure dans une source officielle ou a été confirmé par l&apos;établissement.</p>
          </div>
        )}
      </Section>

      <Section id="acces" title="Horaires, urgences et accès">
        <dl className="divide-y text-sm">
          <Row t="Horaires">{f.hours ?? NA}</Row>
          <Row t="Urgences">{f.emergency_24h ? "Service d'urgences signalé par une source officielle (ministère de la Santé) — vérifiez avant de vous déplacer" : confirmedCodes.has("urgences_pediatriques") ? "Urgences pédiatriques (source officielle)" : NA}</Row>
          <Row t="Conditions d'accès">{f.access_conditions ?? NA}</Row>
          <Row t="Tarifs, CANAM, AMO">{f.official_code ? "Structure conventionnée par la CANAM d'après sa liste de 2022 (à confirmer auprès de l'établissement)" : NA}</Row>
        </dl>
      </Section>

      {links.length > 0 && (
        <Section id="assoc" title="Établissements associés">
          <ul className="space-y-1 text-sm">{links.map((l) => <li key={l.related_id + l.relation}>{LINK_RELATIONS[l.relation]} : <Link prefetch={false} href={`/etablissements/${l.related_id}`} className="font-semibold text-primary underline">{l.facility_listings?.name}</Link> <span className="text-xs text-muted-foreground">(source : {l.source})</span></li>)}</ul>
          <p className="mt-1 text-xs text-muted-foreground">Une association n&apos;implique pas que les établissements appartiennent à la même organisation.</p>
        </Section>
      )}

      <Section id="verif" title="Vérification des informations">
        <dl className="divide-y text-sm">
          <Row t="Statut de la fiche"><span className={cn("rounded px-1.5 py-0.5 text-xs font-semibold", trust.className)}>{trust.label}</span> <span className="text-xs text-muted-foreground">{SOURCE_LEVEL[f.source_level]?.help}</span></Row>
          <Row t="Activité">{OPERATING[f.operating_status]}</Row>
          <Row t="Dernière vérification">{f.verified_at ? formatDate(f.verified_at) : "Pas encore vérifiée par l'équipe SantéProxi"}</Row>
          <Row t="Mise à jour de la fiche">{formatDate(f.updated_at)}</Row>
          {f.to_verify && <Row t="Reste à vérifier">{f.to_verify}</Row>}
        </dl>
        <h3 className="mt-3 text-sm font-semibold">Sources ({sources.length || 1})</h3>
        <ul className="mt-1 space-y-1 text-xs">
          {(sources.length ? sources : [{ id: 0, source: f.source.replace(/^\[0\.3\d\]\s*/, ""), source_url: f.source_url, source_level: f.source_level, document_date: null, page: null, collected_at: f.updated_at }]).map((s) => (
            <li key={s.id} className="rounded-lg bg-muted/50 p-2">
              {s.source_url ? <a href={s.source_url} target="_blank" rel="noopener noreferrer" className="font-medium underline">{s.source}<ExternalLink className="ms-0.5 inline size-3" aria-hidden /></a> : <span className="font-medium">{s.source}</span>}
              <span className="text-muted-foreground"> · {SOURCE_LEVEL[s.source_level]?.label}{s.document_date ? ` · document : ${s.document_date}` : ""}{s.page ? ` · page ${s.page}` : ""} · collecté le {formatDate(s.collected_at)}</span>
            </li>))}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">Figurer dans une liste officielle ne vaut pas agrément, et une source ancienne ne prouve pas que l&apos;établissement fonctionne encore aujourd&apos;hui.</p>
      </Section>

      {serviceStatus.length ? (
        <section className="space-y-2 rounded-2xl border border-amber-300 bg-amber-50 p-4" aria-labelledby="etat">
          <h2 id="etat" className="font-bold text-amber-950">État des services aujourd&apos;hui</h2>
          <ul className="space-y-1 text-sm">{serviceStatus.map((x) => (
            <li key={x.id}><strong>{x.service}</strong> : <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${SERVICE_STATUS[x.status]?.tone}`}>{SERVICE_STATUS[x.status]?.label}</span>{x.message ? ` — ${x.message}` : ""}
              <span className="block text-xs text-amber-900">Déclaré par l&apos;établissement le {formatDate(x.created_at)} · valable jusqu&apos;au {new Date(x.valid_until).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Africa/Bamako" })}</span></li>))}</ul>
        </section>
      ) : null}

      <Section id="acces" title="Conditions d'accès">
        {access.length === 0 ? <p className="text-sm text-muted-foreground">Information non renseignée. Appelez l&apos;établissement pour connaître les tarifs, la prise en charge AMO/CANAM et l&apos;accessibilité.</p> : (
          <dl className="divide-y text-sm">{access.sort((a, b) => Object.keys(ACCESS_FIELDS).indexOf(a.field) - Object.keys(ACCESS_FIELDS).indexOf(b.field)).map((a) => (
            <Row key={a.field} t={ACCESS_FIELDS[a.field]}>{a.value}<span className="block text-xs text-muted-foreground">{a.source_kind === "etablissement" ? "Indiqué par l'établissement" : a.source_kind === "source_publique" ? <>Source publique : <a href={a.source_url ?? "#"} target="_blank" rel="noopener noreferrer" className="underline">lien</a></> : "Confirmé par l'équipe SantéProxi"} le {formatDate(a.confirmed_at)}{a.field.startsWith("tarif") ? " — tarif indicatif, à confirmer sur place" : ""}</span></Row>))}</dl>
        )}
      </Section>

      <InsuranceSection rows={insurance} phone={f.phone} />

      <section id="rdv" className="scroll-mt-24 space-y-2 rounded-2xl border bg-white p-4" aria-labelledby="rdv-t">
        <h2 id="rdv-t" className="font-bold text-brand-deep">Demander un rendez-vous</h2>
        {!isPartner ? <p className="text-sm text-muted-foreground">Cet établissement ne reçoit pas encore de demandes par SantéProxi : appelez-le directement{f.phone ? "" : " (numéro non renseigné)"}.</p> : !session ? (
          <p className="text-sm"><span className="mr-2 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-900">Partenaire SantéProxi</span><Link prefetch={false} href={`/connexion?suite=${encodeURIComponent(`/etablissements/${f.id}#rdv`)}`} className="font-semibold text-primary underline">Connectez-vous</Link> pour envoyer une demande.</p>
        ) : (
          <ActionForm action={requestFacilityAppointment} className="grid gap-2 text-sm sm:grid-cols-2" resetOnSuccess><input type="hidden" name="id" value={f.id} />
            <label>Service ou consultation<Input name="service" required minLength={2} maxLength={80} className="mt-1 h-11" placeholder="ex. Consultation prénatale" /></label>
            <label>Vos disponibilités<Input name="preferred" required minLength={3} maxLength={200} className="mt-1 h-11" placeholder="ex. lundi ou mardi matin" /></label>
            <label className="sm:col-span-2">Motif en quelques mots (facultatif, sans détail médical)<Input name="reason" maxLength={300} className="mt-1 h-11" /></label>
            <label className="flex items-start gap-2 text-xs sm:col-span-2"><input type="checkbox" name="share_phone" className="mt-0.5 size-4" /> J&apos;accepte que l&apos;établissement voie mon numéro de téléphone pour m&apos;appeler.</label>
            <p className="text-xs text-muted-foreground sm:col-span-2">L&apos;établissement vous propose un créneau dans l&apos;application ; le rendez-vous n&apos;est fixé qu&apos;après votre confirmation. En cas d&apos;urgence, ne passez pas par ce formulaire.</p>
            <div className="sm:col-span-2"><SubmitButton size="sm">Envoyer la demande</SubmitButton></div>
          </ActionForm>
        )}
      </section>

      <section id="signaler" className="scroll-mt-24 space-y-2 rounded-2xl border bg-white p-4">
        <h2 className="flex items-center gap-2 font-bold text-brand-deep"><Flag className="size-5" aria-hidden /> Signaler une information incorrecte ou demander une correction</h2>
        {!session ? <p className="text-sm"><Link prefetch={false} href={`/connexion?suite=${encodeURIComponent(`/etablissements/${f.id}#signaler`)}`} className="font-semibold text-primary underline">Connectez-vous</Link> pour signaler une erreur (pour éviter les signalements abusifs).</p> : (
          <ActionForm action={submitFacilityCorrection} className="grid gap-2 text-sm sm:grid-cols-2"><input type="hidden" name="id" value={f.id} />
            <label>Ce qui est incorrect<Select name="kind" required defaultValue="" className="mt-1 h-11"><option value="" disabled>Choisir</option>{Object.entries(CORRECTION_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></label>
            <label>Vous êtes<Select name="role" defaultValue="usager" className="mt-1 h-11"><option value="usager">Usager</option><option value="etablissement">Représentant de l&apos;établissement</option></Select></label>
            <label className="sm:col-span-2">Votre correction<Textarea name="message" required minLength={5} maxLength={1000} rows={3} className="mt-1" placeholder="ex. le bon numéro est le …, l'établissement a déménagé à …" /></label>
            <label className="sm:col-span-2">Comment vous joindre si besoin (facultatif)<Input name="contact" maxLength={160} className="mt-1 h-11" /></label>
            <p className="text-xs text-muted-foreground sm:col-span-2">Aucune modification n&apos;est publiée sans contrôle par l&apos;équipe SantéProxi. N&apos;indiquez aucune information médicale personnelle.</p>
            <div className="sm:col-span-2"><SubmitButton size="sm">Envoyer le signalement</SubmitButton></div>
          </ActionForm>
        )}
      </section>

      {isAdmin && <AdminPanel f={f} />}
    </div>
  );
}

async function AdminPanel({ f }: { f: F }) {
  const supabase = await createClient();
  const { data } = await supabase.from("circles").select("id, name, region_id").order("name");
  const circles = (data ?? []) as { id: string; name: string; region_id: string }[];
  return (
    <section className="space-y-4 rounded-2xl border-2 border-brand-deep/30 bg-white p-4 text-sm">
      <h2 className="flex items-center gap-2 font-bold text-brand-deep"><ShieldCheck className="size-5" aria-hidden /> Administration de la fiche</h2>
      <p className="text-xs">Coordonnées, horaires, spécialités et niveau « Vérifié » : <Link prefetch={false} href="/admin/centres" className="underline">administration des établissements</Link>. Corrections et doublons : <Link prefetch={false} href="/admin/referentiel" className="underline">référentiel national</Link>.</p>
      <ActionForm action={setFacilityStatus} className="grid gap-2 rounded-xl bg-muted/40 p-3 sm:grid-cols-2"><input type="hidden" name="id" value={f.id} />
        <h3 className="font-semibold sm:col-span-2">Confirmation auprès de l&apos;établissement</h3>
        <label>Activité<Select name="operating" defaultValue={f.operating_status} className="mt-1 h-10">{Object.entries(OPERATING).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></label>
        <label>Coordonnées<Select name="contacts" defaultValue={f.contacts_status} className="mt-1 h-10">{Object.entries(CONTACTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select></label>
        <label className="sm:col-span-2">Comment l&apos;information a été obtenue<Input name="note" required minLength={5} maxLength={250} placeholder="ex. appel au standard le 12/11/2026, interlocuteur : accueil" className="mt-1 h-10" /></label>
        <div><SubmitButton size="sm">Enregistrer</SubmitButton></div>
      </ActionForm>
      <ActionForm action={setFacilityOffer} className="grid gap-2 rounded-xl bg-muted/40 p-3 sm:grid-cols-3"><input type="hidden" name="id" value={f.id} />
        <h3 className="font-semibold sm:col-span-3">Offre de soins (service, spécialité, examen, équipement)</h3>
        <Select name="type" defaultValue="service" className="h-10">{Object.entries(OFFER_TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
        <Input name="label" required placeholder="Libellé, ex. Échographie obstétricale" className="h-10" />
        <Input name="code" required placeholder="Code, ex. echographie_obstetricale" className="h-10" />
        <Select name="status" defaultValue="confirme" className="h-10"><option value="confirme">Confirmé</option><option value="a_confirmer">À confirmer</option><option value="indisponible">Indisponible</option><option value="supprimer">Supprimer</option></Select>
        <Input name="source" placeholder="Source (obligatoire)" className="h-10" /><Input name="url" type="url" placeholder="Lien de la source" className="h-10" />
        <div><SubmitButton size="sm">Enregistrer l&apos;offre</SubmitButton></div>
      </ActionForm>
      <ActionForm action={linkFacility} className="grid gap-2 rounded-xl bg-muted/40 p-3 sm:grid-cols-3"><input type="hidden" name="id" value={f.id} />
        <h3 className="font-semibold sm:col-span-3">Associer un établissement (laboratoire, imagerie, pharmacie…)</h3>
        <Input name="related" required placeholder="Identifiant de la fiche associée" className="h-10" />
        <Select name="relation" defaultValue="laboratoire_integre" className="h-10">{Object.entries(LINK_RELATIONS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
        <Input name="source" required minLength={3} placeholder="Source de l'association" className="h-10" />
        <label className="flex items-center gap-2"><input type="checkbox" name="remove" value="1" className="size-4" /> Retirer cette association</label>
        <div><SubmitButton size="sm">Enregistrer</SubmitButton></div>
      </ActionForm>
      <ActionForm action={saveFacilityExtra} className="grid gap-2 rounded-xl bg-muted/40 p-3 sm:grid-cols-2"><input type="hidden" name="id" value={f.id} />
        <h3 className="font-semibold sm:col-span-2">Localisation et autres appellations</h3>
        <label>Cercle<Select name="circle_id" defaultValue={f.circle_id ?? ""} className="mt-1 h-10"><option value="">—</option>{circles.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></label>
        <label>Localité ou village<Input name="locality" defaultValue={f.locality ?? ""} maxLength={160} className="mt-1 h-10" /></label>
        <label>WhatsApp professionnel<Input name="whatsapp" defaultValue={f.whatsapp ?? ""} placeholder="+223…" className="mt-1 h-10" /></label>
        <label>Autres appellations (séparées par ;)<Input name="alt_names" defaultValue={f.alt_names.join("; ")} className="mt-1 h-10" /></label>
        <input type="hidden" name="commune_id" value={f.commune_id ?? ""} />
        <label className="flex items-center gap-2"><input type="checkbox" name="is_published" defaultChecked={f.is_published} className="size-4" /> Fiche publiée</label>
        <div><SubmitButton size="sm">Enregistrer</SubmitButton></div>
      </ActionForm>
      <ActionForm action={designatePartner} className="grid gap-2 rounded-xl bg-muted/40 p-3 sm:grid-cols-2"><input type="hidden" name="id" value={f.id} />
        <h3 className="font-semibold sm:col-span-2">Membre partenaire (espace établissement)</h3>
        <Input name="email" type="email" required placeholder="Adresse du compte SantéProxi" className="h-10" />
        <Input name="role" maxLength={80} placeholder="Fonction, ex. Major, Secrétariat" className="h-10" />
        <Input name="note" required minLength={5} maxLength={250} placeholder="Vérification faite, ex. appel au standard et ordre de mission" className="h-10 sm:col-span-2" />
        <label className="flex items-center gap-2"><input type="checkbox" name="remove" value="1" className="size-4" /> Retirer l&apos;accès</label>
        <div><SubmitButton size="sm">Enregistrer</SubmitButton></div>
      </ActionForm>
      <p className="text-xs text-muted-foreground">Identifiant de cette fiche : <code>{f.id}</code></p>
    </section>
  );
}
