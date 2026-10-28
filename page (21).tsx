import { notFound } from "next/navigation";
import Link from "next/link";
import { Building2, MapPin, MessageCircle, Navigation, Phone, Pill, Siren, Store } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { DirectoryFreshnessBadge, EmergencyBanner, NotDirectoryAdvice, ScheduleTable, VerifiedBadge } from "@/components/directory/directory-bits";
import { DirectoryReportForm } from "@/components/directory/directory-report-form";
import { OpeningHours } from "@/components/opening-hours";
import { MapLoader } from "@/components/map/map-loader";
import { DemoBadge } from "@/components/demo-badge";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { directionsUrl } from "@/components/result-card";
import { CLINIC_KINDS, CLINIC_SERVICES, daysSummary, shareUrl, type DirectoryFreshness, type Schedule } from "@/lib/directory";
import { formatDate, formatDistance, formatPhone } from "@/lib/format";
import { cn } from "@/lib/utils";

const one = <T,>(v: T | T[] | null | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { title: "Établissement" };
  const supabase = await createClient();
  const { data } = await supabase.from("clinics").select("name").eq("id", id).maybeSingle();
  return { title: data?.name ?? "Établissement" };
}

type Nearby = { id: string; name: string; address: string; phone: string; is_open: boolean | null; distance_km: number; latitude: number; longitude: number };

export default async function ClinicPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data: c } = await supabase
    .from("clinics")
    .select("id, name, kind, status, address, latitude, longitude, phone, whatsapp, email, opening_hours, emergency_24h, services, confirmed_at, verified_at, is_demo, communes(name), regions(name), localities(name)")
    .eq("id", id)
    .maybeSingle();
  if (!c) notFound();
  const [session, settings, sitesRes, nearbyRes] = await Promise.all([
    getSession(),
    getSettings(),
    supabase.from("doctor_practice_sites")
      .select("id, schedule, appointment_phone, doctor_accepted, clinic_accepted, doctors(id, title, display_name, status, is_published, doctor_specialties(medical_specialties(name, sort_order)))")
      .eq("clinic_id", id),
    c.latitude !== null ? supabase.rpc("nearby_pharmacies", { p_lat: c.latitude, p_lng: c.longitude, p_limit: 4 }) : Promise.resolve({ data: [] }),
  ]);
  const doctors = (sitesRes.data ?? [])
    .filter((s) => s.doctor_accepted && s.clinic_accepted && one(s.doctors)?.status === "verified" && one(s.doctors)?.is_published)
    .map((s) => {
      const d = one(s.doctors)!;
      const specs = (d.doctor_specialties ?? []).map((x) => one(x.medical_specialties)).filter(Boolean) as { name: string; sort_order: number }[];
      return { site: s, d, specs: specs.sort((a, b) => a.sort_order - b.sort_order).map((x) => x.name) };
    })
    .sort((a, b) => a.d.display_name.localeCompare(b.d.display_name, "fr"));
  const nearby = (nearbyRes.data as Nearby[]) ?? [];
  const ageDays = (Date.now() - new Date(c.confirmed_at).getTime()) / 86_400_000;
  const freshness: DirectoryFreshness = ageDays <= settings.directory_fresh_days ? "fresh" : ageDays <= settings.directory_stale_days ? "to_confirm" : "stale";
  const place = [one(c.localities)?.name, one(c.communes)?.name, one(c.regions)?.name].filter(Boolean).join(", ");
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const specialtiesPresent = [...new Set(doctors.flatMap((x) => x.specs))];

  return (
    <div className="container-page grid gap-6 py-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-6">
        {c.status !== "verified" && <Alert tone="warning" title="Aperçu : cet établissement n'est pas encore publié." />}
        <header className="rounded-2xl border bg-white p-5">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-brand-deep">{c.name}</h1>
            {c.status === "verified" && <VerifiedBadge label="Établissement vérifié" />}
            {c.is_demo && <DemoBadge />}
          </div>
          <p className="text-sm text-muted-foreground">{CLINIC_KINDS[c.kind] ?? c.kind}</p>
          <p className="mt-3 flex items-start gap-2 text-sm"><MapPin className="mt-0.5 size-4 shrink-0 text-brand-blue" aria-hidden />{c.address} — {place}</p>
          {c.emergency_24h && <p className="mt-2 inline-flex items-center gap-2 rounded-lg bg-red-50 px-3 py-1.5 text-sm font-semibold text-red-800"><Siren className="size-4" aria-hidden /> Service d&apos;urgence 24 h/24</p>}
          <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <a href={`tel:${c.phone}`} className={cn(buttonVariants({ size: "sm" }), "bg-brand-blue hover:bg-brand-blue/90")}><Phone aria-hidden /> {formatPhone(c.phone)}</a>
            {c.whatsapp && <a href={`https://wa.me/${c.whatsapp.replace("+", "")}`} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}><MessageCircle aria-hidden /> WhatsApp</a>}
            {c.latitude !== null && c.longitude !== null && <a href={directionsUrl(c.latitude, c.longitude)} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}><Navigation aria-hidden /> Itinéraire</a>}
            <a href={shareUrl(`${c.name} — sur PharmaProxi :`, `${site}/cliniques/${c.id}`)} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>Partager</a>
          </div>
          <div className="mt-3"><DirectoryFreshnessBadge freshness={freshness} confirmedAt={c.confirmed_at} /></div>
          {(c.services as string[]).length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">{(c.services as string[]).map((s) => <Badge key={s} className="bg-white">{CLINIC_SERVICES[s] ?? s}</Badge>)}</div>
          )}
        </header>

        <section id="medecins" aria-labelledby="doc-title" className="space-y-3">
          <h2 id="doc-title" className="text-lg font-bold">Médecins et jours de consultation</h2>
          {specialtiesPresent.length > 0 && (
            <div className="flex flex-wrap gap-1.5">{specialtiesPresent.map((s) => <Badge key={s} className="border-sky-200 bg-brand-sky text-brand-blue">{s}</Badge>)}</div>
          )}
          {doctors.length === 0 ? (
            <p className="rounded-xl border border-dashed bg-white p-5 text-sm text-muted-foreground">Aucun médecin publié pour cet établissement pour le moment. Appelez l&apos;accueil.</p>
          ) : (
            <ul className="grid gap-3">
              {doctors.map(({ site: s, d, specs }) => (
                <li key={s.id} className="rounded-xl border bg-white p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <Link prefetch={false} href={`/medecins/${d.id}`} className="font-bold text-brand-deep hover:underline">{d.title} {d.display_name}</Link>
                      <p className="text-sm text-brand-blue">{specs.join(", ")}</p>
                      <p className="text-xs text-muted-foreground">Jours : {daysSummary(Object.keys(s.schedule ?? {}))}</p>
                    </div>
                    {(s.appointment_phone ?? c.phone) && <a href={`tel:${s.appointment_phone ?? c.phone}`} className="inline-flex items-center gap-1 text-sm font-semibold text-brand-blue hover:underline"><Phone className="size-4" aria-hidden />{formatPhone(s.appointment_phone ?? c.phone)}</a>}
                  </div>
                  <details className="mt-2 text-sm"><summary className="cursor-pointer text-muted-foreground">Voir les horaires</summary><div className="mt-2"><ScheduleTable schedule={s.schedule as Schedule} compact /></div></details>
                </li>
              ))}
            </ul>
          )}
        </section>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Building2 className="size-5" aria-hidden /> Horaires d&apos;accueil</CardTitle></CardHeader>
          <CardContent><OpeningHours hours={c.opening_hours as Record<string, [string, string][]>} verified={c.status === "verified"} /></CardContent>
        </Card>

        {c.latitude !== null && c.longitude !== null && (
          <MapLoader points={[
            { id: c.id, name: c.name, address: c.address, latitude: c.latitude, longitude: c.longitude, is_open: null, kind: "clinic", href: `/cliniques/${c.id}` },
            ...nearby.map((p) => ({ id: p.id, name: p.name, address: p.address, latitude: p.latitude, longitude: p.longitude, is_open: p.is_open })),
          ]} />
        )}
        <NotDirectoryAdvice />
      </div>

      <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <EmergencyBanner numbers={settings.emergency_numbers} />
        <section aria-labelledby="pharm-title" className="rounded-2xl border-2 border-primary/30 bg-white p-4">
          <h2 id="pharm-title" className="flex items-center gap-2 font-bold"><Pill className="size-5 text-primary" aria-hidden /> Pharmacies vérifiées à proximité</h2>
          {nearby.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">Aucune pharmacie vérifiée référencée dans un rayon de 10 km.</p>
          ) : (
            <ul className="mt-2 divide-y text-sm">
              {nearby.map((p) => (
                <li key={p.id} className="py-2">
                  <Link prefetch={false} href={`/pharmacies/${p.id}`} className="inline-flex items-center gap-1 font-medium hover:underline"><Store className="size-4 text-primary" aria-hidden />{p.name}</Link>
                  <span className="block text-xs text-muted-foreground">{formatDistance(p.distance_km)} · {p.is_open === true ? "Ouverte maintenant" : p.is_open === false ? "Fermée maintenant" : "Horaires non vérifiés"}</span>
                </li>
              ))}
            </ul>
          )}
          <Link prefetch={false} href="/recherche" className="mt-2 inline-block text-sm font-semibold text-primary underline">Rechercher un médicament</Link>
        </section>
        {session && <DirectoryReportForm clinicId={c.id} />}
        {c.verified_at && <p className="text-xs text-muted-foreground">Établissement vérifié par PharmaProxi le {formatDate(c.verified_at)}.</p>}
      </aside>
    </div>
  );
}
