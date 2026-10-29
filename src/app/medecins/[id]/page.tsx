import { RecentTracker } from "@/components/recent/recent-tracker";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Building2, CalendarCheck, CalendarClock, Languages, MapPin, MessageCircle, Navigation, Phone, Share2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { AbsenceBadge, DirectoryFreshnessBadge, EmergencyBanner, NotDirectoryAdvice, ScheduleTable, VerifiedBadge } from "@/components/directory/directory-bits";
import { DirectoryReportForm } from "@/components/directory/directory-report-form";
import { DemoBadge } from "@/components/demo-badge";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { directionsUrl } from "@/components/result-card";
import { CLINIC_KINDS, LANGUAGES, shareUrl, type DirectoryFreshness, type Schedule } from "@/lib/directory";
import { formatDate, formatPhone } from "@/lib/format";
import { PAYMENT_LABEL, formatApptDay, formatApptTime } from "@/lib/appointments";
import { cn } from "@/lib/utils";

const one = <T,>(v: T | T[] | null | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { title: "Médecin" };
  const supabase = await createClient();
  const { data } = await supabase.from("doctors").select("title, display_name").eq("id", id).maybeSingle();
  return { title: data ? `${data.title} ${data.display_name}` : "Médecin" };
}

export default async function DoctorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data: d } = await supabase
    .from("doctors")
    .select("id, user_id, title, display_name, gender, languages, status, is_published, confirmed_at, verified_at, is_demo, presentation, fee_info, payment_methods, accepts_new_patients, doctor_specialties(medical_specialties(id, name, description))")
    .eq("id", id)
    .maybeSingle();
  if (!d) notFound();
  const [session, settings, sitesRes, absRes, nextRes] = await Promise.all([
    getSession(),
    getSettings(),
    supabase.from("doctor_practice_sites")
      .select("id, schedule, appointment_phone, accepts_appointments, booking_mode, access_info, doctor_accepted, clinic_accepted, clinics(id, name, kind, address, phone, whatsapp, latitude, longitude, emergency_24h, status, communes(name), regions(name))")
      .eq("doctor_id", id),
    supabase.from("doctor_absences").select("id, starts_on, ends_on, note").eq("doctor_id", id).gte("ends_on", new Date().toISOString().slice(0, 10)).order("starts_on"),
    supabase.rpc("next_availabilities", { p_doctors: [id] }),
  ]);
  // Visibilité : compteur anonyme des consultations de la fiche (hors le médecin lui-même)
  if (session?.doctor?.id !== id) await supabase.rpc("record_doctor_view", { p_doctor: id });
  const next = ((nextRes.data as { site_id: string; slot_start: string }[] | null) ?? [])[0] ?? null;
  const sites = (sitesRes.data ?? []).filter((s) => s.doctor_accepted && s.clinic_accepted && one(s.clinics)?.status === "verified");
  const absences = absRes.data ?? [];
  const today = new Date().toISOString().slice(0, 10);
  const currentAbsence = absences.find((a) => a.starts_on <= today && a.ends_on >= today);
  const ageDays = (Date.now() - new Date(d.confirmed_at).getTime()) / 86_400_000;
  const freshness: DirectoryFreshness = ageDays <= settings.directory_fresh_days ? "fresh" : ageDays <= settings.directory_stale_days ? "to_confirm" : "stale";
  const isPublic = d.status === "verified" && d.is_published && freshness !== "stale";
  const specs = (d.doctor_specialties ?? []).map((x) => one(x.medical_specialties)).filter(Boolean) as { id: string; name: string; description: string | null }[];
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const label = `${d.title} ${d.display_name}`;

  return (
    <div className="container-page grid gap-6 py-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-6">
        {!isPublic && (
          <Alert tone="warning" title="Aperçu : cette fiche n'est pas publiée">
            {d.status !== "verified" ? "Elle le sera après vérification par l'équipe PharmaProxi." : !d.is_published ? "Le médecin l'a retirée de l'annuaire." : "Les informations doivent être confirmées."}
          </Alert>
        )}
        {isPublic && <RecentTracker kind="medecin" id={d.id} name={label} phone={null} place={specs.map((x) => x.name).join(", ") || null} href={`/medecins/${d.id}`} />}
        <header className="rounded-2xl border bg-white p-5">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-brand-deep">{label}</h1>
            {d.status === "verified" && <VerifiedBadge />}
            {d.is_demo && <DemoBadge />}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {specs.map((s) => <Badge key={s.id} className="border-sky-200 bg-brand-sky text-brand-blue">{s.name}</Badge>)}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
            <span className="inline-flex items-center gap-1 text-muted-foreground"><Languages className="size-4" aria-hidden /> {(d.languages as string[]).map((l) => LANGUAGES[l] ?? l).join(", ")}</span>
            {currentAbsence && <AbsenceBadge until={currentAbsence.ends_on} />}
          </div>
          <div className="mt-3"><DirectoryFreshnessBadge freshness={freshness} confirmedAt={d.confirmed_at} /></div>
          {isPublic && next && (
            <Link prefetch={false} href={`/medecins/${d.id}/rendez-vous?lieu=${next.site_id}`} className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 hover:bg-emerald-100">
              <CalendarCheck className="size-5 shrink-0" aria-hidden />
              <span>Prochaine disponibilité en ligne : <strong>{formatApptDay(next.slot_start)} à {formatApptTime(next.slot_start)}</strong></span>
            </Link>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <a href={shareUrl(`${label} — ${specs.map((s) => s.name).join(", ")} — sur PharmaProxi :`, `${site}/medecins/${d.id}`)} target="_blank" rel="noopener noreferrer"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}><Share2 aria-hidden /> Partager sur WhatsApp</a>
          </div>
        </header>

        {(d.presentation || d.fee_info || (d.payment_methods as string[]).length > 0 || !d.accepts_new_patients) && (
          <Card>
            <CardHeader><CardTitle>Informations pratiques</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              {d.presentation && <p className="whitespace-pre-line">{d.presentation}</p>}
              {d.fee_info && <p><strong>Tarifs :</strong> {d.fee_info} <span className="text-xs text-muted-foreground">(indiqués par le médecin)</span></p>}
              {(d.payment_methods as string[]).length > 0 && <p><strong>Paiement accepté :</strong> {(d.payment_methods as string[]).map((m) => PAYMENT_LABEL[m] ?? m).join(", ")}</p>}
              {!d.accepts_new_patients && <p className="text-amber-800">N&apos;accepte pas de nouveaux patients en ligne pour le moment.</p>}
            </CardContent>
          </Card>
        )}

        <section aria-labelledby="sites-title" className="space-y-3">
          <h2 id="sites-title" className="text-lg font-bold">Où et quand consulter</h2>
          {sites.length === 0 ? (
            <p className="rounded-xl border border-dashed bg-white p-5 text-sm text-muted-foreground">Aucun lieu de consultation publié pour le moment.</p>
          ) : sites.map((s) => {
            const c = one(s.clinics)!;
            const phone = s.appointment_phone ?? c.phone;
            return (
              <Card key={s.id}>
                <CardHeader>
                  <CardTitle className="flex flex-wrap items-center gap-2">
                    <Building2 className="size-5 text-brand-blue" aria-hidden />
                    <Link prefetch={false} href={`/cliniques/${c.id}`} className="hover:underline">{c.name}</Link>
                    <Badge className="bg-white">{CLINIC_KINDS[c.kind] ?? c.kind}</Badge>
                    {c.emergency_24h && <Badge className="border-red-200 bg-red-50 text-red-800">Urgences 24 h/24</Badge>}
                  </CardTitle>
                  <p className="flex items-start gap-1 text-sm text-muted-foreground"><MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />{c.address} — {[one(c.communes)?.name, one(c.regions)?.name].filter(Boolean).join(", ")}</p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <ScheduleTable schedule={s.schedule as Schedule} />
                  {s.access_info && <p className="text-sm text-muted-foreground">Accès : {s.access_info}</p>}
                  <div className="flex flex-wrap gap-2">
                    {s.accepts_appointments && isPublic && (
                      <Link prefetch={false} href={`/medecins/${d.id}/rendez-vous?lieu=${s.id}`} className={cn(buttonVariants({ size: "sm" }), "bg-brand-blue hover:bg-brand-blue/90")}>
                        <CalendarCheck aria-hidden /> {s.booking_mode === "instant" ? "Prendre rendez-vous" : "Demander un rendez-vous"}
                      </Link>
                    )}
                    {phone && <a href={`tel:${phone}`} className={cn(s.accepts_appointments && isPublic ? buttonVariants({ size: "sm", variant: "outline" }) : cn(buttonVariants({ size: "sm" }), "bg-brand-blue hover:bg-brand-blue/90"))}><Phone aria-hidden /> {s.accepts_appointments && isPublic ? formatPhone(phone) : `Rendez-vous : ${formatPhone(phone)}`}</a>}
                    {c.whatsapp && <a href={`https://wa.me/${c.whatsapp.replace("+", "")}`} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}><MessageCircle aria-hidden /> WhatsApp</a>}
                    {c.latitude !== null && c.longitude !== null && <a href={directionsUrl(c.latitude, c.longitude)} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}><Navigation aria-hidden /> Itinéraire</a>}
                  </div>
                  {phone && <p className="text-xs text-muted-foreground">Numéro affiché à la demande du médecin ou de l&apos;établissement : {formatPhone(phone)}</p>}
                </CardContent>
              </Card>
            );
          })}
        </section>

        {absences.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><CalendarClock className="size-5" aria-hidden /> Absences annoncées</CardTitle></CardHeader>
            <CardContent>
              <ul className="space-y-1 text-sm">
                {absences.map((a) => <li key={a.id}>Du {formatDate(a.starts_on)} au {formatDate(a.ends_on)}{a.note ? ` — ${a.note}` : ""}</li>)}
              </ul>
            </CardContent>
          </Card>
        )}

        {specs.some((s) => s.description) && (
          <Card>
            <CardHeader><CardTitle>À propos des spécialités</CardTitle></CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                {specs.filter((s) => s.description).map((s) => <li key={s.id}><strong>{s.name} :</strong> {s.description}</li>)}
              </ul>
            </CardContent>
          </Card>
        )}
        <NotDirectoryAdvice />
      </div>

      <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <EmergencyBanner numbers={settings.emergency_numbers} />
        <div className="rounded-xl border bg-white p-4 text-sm">
          <p className="font-semibold">Après la consultation</p>
          <p className="mt-1 text-muted-foreground">Trouvez le traitement prescrit dans une pharmacie vérifiée proche.</p>
          <Link prefetch={false} href="/recherche" className="mt-2 inline-block font-semibold text-primary underline">Rechercher un médicament</Link>
        </div>
        {session && <DirectoryReportForm doctorId={d.id} />}
        {d.verified_at && <p className="text-xs text-muted-foreground">Inscription vérifiée par PharmaProxi le {formatDate(d.verified_at)}.</p>}
      </aside>
    </div>
  );
}
