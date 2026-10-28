import { notFound } from "next/navigation";
import Link from "next/link";
import { Building2, CalendarClock, Languages, MapPin, MessageCircle, Navigation, Phone, Share2 } from "lucide-react";
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
    .select("id, user_id, title, display_name, gender, languages, status, is_published, confirmed_at, verified_at, is_demo, doctor_specialties(medical_specialties(id, name, description))")
    .eq("id", id)
    .maybeSingle();
  if (!d) notFound();
  const [session, settings, sitesRes, absRes] = await Promise.all([
    getSession(),
    getSettings(),
    supabase.from("doctor_practice_sites")
      .select("id, schedule, appointment_phone, doctor_accepted, clinic_accepted, clinics(id, name, kind, address, phone, whatsapp, latitude, longitude, emergency_24h, status, communes(name), regions(name))")
      .eq("doctor_id", id),
    supabase.from("doctor_absences").select("id, starts_on, ends_on, note").eq("doctor_id", id).gte("ends_on", new Date().toISOString().slice(0, 10)).order("starts_on"),
  ]);
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
          <div className="mt-4 flex flex-wrap gap-2">
            <a href={shareUrl(`${label} — ${specs.map((s) => s.name).join(", ")} — sur PharmaProxi :`, `${site}/medecins/${d.id}`)} target="_blank" rel="noopener noreferrer"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}><Share2 aria-hidden /> Partager sur WhatsApp</a>
          </div>
        </header>

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
                  <div className="flex flex-wrap gap-2">
                    {phone && <a href={`tel:${phone}`} className={cn(buttonVariants({ size: "sm" }), "bg-brand-blue hover:bg-brand-blue/90")}><Phone aria-hidden /> Rendez-vous : {formatPhone(phone)}</a>}
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
