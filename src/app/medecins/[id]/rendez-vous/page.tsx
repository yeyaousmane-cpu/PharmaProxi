import { notFound } from "next/navigation";
import Link from "next/link";
import { randomUUID } from "node:crypto";
import { BellRing, CalendarCheck, ChevronLeft, ChevronRight, Clock, Info, MapPin } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { bookAppointment, joinWaitlist, requestAppointment } from "@/app/actions/appointments";
import { scheduleLines, type Schedule } from "@/lib/directory";
import { APPT_PERIODS, AUDIENCE_LABEL, RELATION_LABEL, addDays, formatApptDay, formatApptTime, todayMali } from "@/lib/appointments";
import { formatPhone } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Prendre rendez-vous" };
const one = <T,>(v: T | T[] | null | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;
type SP = { lieu?: string; type?: string; debut?: string; creneau?: string };
type Slot = { slot_start: string; slot_end: string };

export default async function BookingPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const qs = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]).toString();
  const session = await requireUser(`/medecins/${id}/rendez-vous${qs ? `?${qs}` : ""}`);
  const supabase = await createClient();
  const [{ data: d }, { data: sitesData }, { data: typesData }, { data: profile }, { data: relatives }, { data: absences }] = await Promise.all([
    supabase.from("doctors").select("id, title, display_name, accepts_new_patients, fee_info").eq("id", id).maybeSingle(),
    supabase.from("doctor_practice_sites")
      .select("id, schedule, accepts_appointments, booking_mode, cancel_notice_hours, access_info, doctor_accepted, clinic_accepted, clinics(id, name, address, status)")
      .eq("doctor_id", id).order("created_at"),
    supabase.from("appointment_types").select("id, site_id, name, duration_min, audience, instructions, fee, sort_order").eq("doctor_id", id).eq("is_active", true).order("sort_order").order("name"),
    supabase.from("profiles").select("full_name, phone").eq("id", session.userId).single(),
    supabase.from("patient_relatives").select("id, full_name, relation").order("created_at"),
    supabase.from("doctor_absences").select("starts_on, ends_on").eq("doctor_id", id).gte("ends_on", todayMali()).order("starts_on"),
  ]);
  if (!d) notFound();
  const label = `${d.title} ${d.display_name}`;
  const sites = (sitesData ?? []).filter((s) => s.accepts_appointments && s.doctor_accepted && s.clinic_accepted && one(s.clinics)?.status === "verified");
  const site = sites.find((s) => s.id === sp.lieu) ?? sites[0];
  const today = todayMali();
  const base = `/medecins/${id}/rendez-vous`;
  const href = (patch: Partial<SP>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ lieu: site?.id, ...sp, ...patch })) if (v) p.set(k, v);
    return `${base}?${p}`;
  };

  return (
    <div className="container-page max-w-3xl space-y-5 py-6">
      <Link prefetch={false} href={`/medecins/${d.id}`} className="text-sm text-primary underline">← {label}</Link>
      <h1 className="flex items-center gap-2 text-2xl font-bold text-brand-deep"><CalendarCheck className="size-6 text-brand-blue" aria-hidden /> Prendre rendez-vous avec {label}</h1>
      <Alert tone="warning" title="Urgence ?">Ne prenez pas rendez-vous : rendez-vous au service d&apos;urgence le plus proche.</Alert>

      {!site ? (
        <p className="rounded-xl border border-dashed bg-white p-6 text-sm text-muted-foreground">
          Ce médecin ne prend pas de rendez-vous en ligne pour le moment. Appelez le numéro indiqué sur <Link prefetch={false} href={`/medecins/${d.id}`} className="underline">sa fiche</Link>.
        </p>
      ) : (
        <>
          {sites.length > 1 && (
            <nav aria-label="Lieu de consultation" className="flex flex-wrap gap-2">
              {sites.map((s) => (
                <Link prefetch={false} key={s.id} href={`${base}?lieu=${s.id}`} aria-current={s.id === site.id ? "page" : undefined}
                  className={cn("rounded-full border px-4 py-2 text-sm font-medium", s.id === site.id ? "border-brand-blue bg-brand-sky text-brand-blue" : "bg-white")}>
                  {one(s.clinics)?.name}
                </Link>
              ))}
            </nav>
          )}
          <div className="rounded-xl border bg-white p-4 text-sm">
            <p className="flex items-start gap-1"><MapPin className="mt-0.5 size-4 shrink-0 text-brand-blue" aria-hidden /><span><strong>{one(site.clinics)?.name}</strong> — {one(site.clinics)?.address}</span></p>
            {site.access_info && <p className="mt-1 text-muted-foreground">Accès : {site.access_info}</p>}
            <p className="mt-1 text-xs text-muted-foreground">Consultations : {scheduleLines(site.schedule as Schedule).map((l) => `${l.day} ${l.slots}`).join(" · ")}</p>
          </div>

          {site.booking_mode === "instant" ? (
            <InstantFlow
              sp={sp} href={href} siteId={site.id} doctorId={d.id} today={today} cancelHours={site.cancel_notice_hours}
              types={(typesData ?? []).filter((t) => !t.site_id || t.site_id === site.id)}
              profile={profile} relatives={relatives ?? []} acceptsNew={d.accepts_new_patients}
            />
          ) : (
            <RequestForm siteId={site.id} today={today} profile={profile} absences={absences ?? []} />
          )}
        </>
      )}
    </div>
  );
}

type TypeRow = { id: string; site_id: string | null; name: string; duration_min: number; audience: string; instructions: string | null; fee: string | null };

async function InstantFlow({ sp, href, siteId, doctorId, today, cancelHours, types, profile, relatives, acceptsNew }: {
  sp: SP; href: (p: Partial<SP>) => string; siteId: string; doctorId: string; today: string; cancelHours: number; types: TypeRow[];
  profile: { full_name: string | null; phone: string | null } | null; relatives: { id: string; full_name: string; relation: string }[]; acceptsNew: boolean;
}) {
  const type = types.find((t) => t.id === sp.type);
  // Étape 1 : motif
  if (!type) {
    return (
      <Card>
        <CardHeader><CardTitle>1. Choisissez le motif de consultation</CardTitle>
          {!acceptsNew && <CardDescription>Ce médecin n&apos;accepte pas de nouveaux patients en ligne pour le moment.</CardDescription>}</CardHeader>
        <CardContent>
          {types.length === 0 ? <p className="text-sm text-muted-foreground">Aucun motif disponible en ligne.</p> : (
            <ul className="space-y-2">
              {types.map((t) => (
                <li key={t.id}>
                  <Link prefetch={false} href={href({ type: t.id, creneau: undefined, debut: undefined })} className="flex flex-col gap-1 rounded-lg border p-3 hover:border-brand-blue sm:flex-row sm:items-center sm:justify-between">
                    <span className="min-w-0">
                      <span className="font-semibold">{t.name}</span>
                      {t.audience !== "all" && <Badge className="ml-2 bg-white">{AUDIENCE_LABEL[t.audience]}</Badge>}
                      {t.instructions && <span className="block text-xs text-muted-foreground">{t.instructions}</span>}
                    </span>
                    <span className="flex shrink-0 items-center gap-3 text-sm text-muted-foreground">
                      <span className="inline-flex items-center gap-1"><Clock className="size-4" aria-hidden />{t.duration_min} min</span>
                      {t.fee && <span>{t.fee}</span>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    );
  }

  const supabase = await createClient();
  const recap = (
    <p className="flex flex-wrap items-center gap-2 text-sm">
      Motif : <strong>{type.name}</strong> ({type.duration_min} min{type.fee ? ` · ${type.fee}` : ""})
      <Link prefetch={false} href={href({ type: undefined, creneau: undefined })} className="text-brand-blue underline">changer</Link>
    </p>
  );

  // Étape 3 : confirmation d'un créneau
  if (sp.creneau) {
    const start = new Date(sp.creneau);
    const day = Number.isNaN(start.getTime()) ? null : start.toISOString().slice(0, 10);
    const { data } = day ? await supabase.rpc("available_slots", { p_site: siteId, p_type: type.id, p_from: day, p_days: 1 }) : { data: [] };
    const still = ((data as Slot[]) ?? []).some((s) => new Date(s.slot_start).getTime() === start.getTime());
    if (!still) {
      return (
        <div className="space-y-3">
          {recap}
          <Alert tone="error" title="Ce créneau n'est plus disponible">Quelqu&apos;un vient peut-être de le réserver.</Alert>
          <Link prefetch={false} href={href({ creneau: undefined })} className={cn(buttonVariants())}>Choisir un autre créneau</Link>
        </div>
      );
    }
    return (
      <Card>
        <CardHeader>
          <CardTitle>3. Confirmez votre rendez-vous</CardTitle>
          <CardDescription className="text-base text-foreground"><strong>{formatApptDay(start)} à {formatApptTime(start)}</strong> · {type.name} ({type.duration_min} min)</CardDescription>
          <Link prefetch={false} href={href({ creneau: undefined })} className="text-sm text-brand-blue underline">Changer d&apos;horaire</Link>
        </CardHeader>
        <CardContent>
          {type.instructions && <Alert tone="info" title="À savoir avant le rendez-vous" className="mb-4">{type.instructions}</Alert>}
          <ActionForm action={bookAppointment} className="space-y-4" labels={{ patient_name: "Nom", phone: "Téléphone", reason: "Motif", consent: "Confirmation" }}>
            <input type="hidden" name="key" value={randomUUID()} />
            <input type="hidden" name="site_id" value={siteId} /><input type="hidden" name="type_id" value={type.id} /><input type="hidden" name="start" value={start.toISOString()} />
            <fieldset className="min-w-0 space-y-2">
              <legend className="text-sm font-semibold">Pour qui ?</legend>
              <label className="flex items-center gap-2 text-sm"><input type="radio" name="who" value="me" defaultChecked className="size-4" /> Pour moi</label>
              {relatives.map((r) => (
                <label key={r.id} className="flex items-center gap-2 text-sm"><input type="radio" name="who" value={r.id} className="size-4" /> {r.full_name} <span className="text-muted-foreground">({RELATION_LABEL[r.relation] ?? r.relation})</span></label>
              ))}
              <Link prefetch={false} href={`/compte/proches?retour=${encodeURIComponent(href({}))}`} className="text-sm text-brand-blue underline">+ Ajouter un proche (enfant, parent…)</Link>
            </fieldset>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Votre nom" htmlFor="patient_name" hint="Pour un proche, son nom enregistré est utilisé">
                <Input id="patient_name" name="patient_name" maxLength={120} defaultValue={profile?.full_name ?? ""} />
              </Field>
              <Field label="Téléphone pour vous joindre" htmlFor="phone" required>
                <Input id="phone" name="phone" type="tel" required defaultValue={formatPhone(profile?.phone)} placeholder="76 00 00 00" />
              </Field>
            </div>
            <Field label="Précision pour le médecin (facultatif)" htmlFor="reason" hint="Ne détaillez pas votre état de santé : vous en parlerez pendant la consultation.">
              <Textarea id="reason" name="reason" maxLength={300} rows={2} />
            </Field>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="consent" className="mt-0.5 size-4" required />
              <span>Je confirme ce rendez-vous. Mon nom, mon téléphone et ma précision seront transmis au médecin et à son secrétariat. En cas d&apos;empêchement, j&apos;annule {cancelHours > 0 ? `au moins ${cancelHours} h à l'avance` : "dès que possible"} pour libérer le créneau.</span>
            </label>
            <SubmitButton className="bg-brand-blue hover:bg-brand-blue/90" pendingText="Réservation…">Confirmer le rendez-vous</SubmitButton>
          </ActionForm>
        </CardContent>
      </Card>
    );
  }

  // Étape 2 : créneaux de la semaine
  const from = sp.debut && /^\d{4}-\d{2}-\d{2}$/.test(sp.debut) && sp.debut >= today && sp.debut <= addDays(today, 60) ? sp.debut : today;
  const { data, error } = await supabase.rpc("available_slots", { p_site: siteId, p_type: type.id, p_from: from, p_days: 7 });
  const slots = (data as Slot[]) ?? [];
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i)).filter((x) => x <= addDays(today, 60));
  const byDay = new Map(days.map((x) => [x, [] as Slot[]]));
  for (const s of slots) byDay.get(new Date(s.slot_start).toISOString().slice(0, 10))?.push(s);
  const prev = from > today ? addDays(from, -7) < today ? today : addDays(from, -7) : null;
  const next = addDays(from, 7) <= addDays(today, 60) ? addDays(from, 7) : null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>2. Choisissez un horaire</CardTitle>
          {recap}
        </CardHeader>
        <CardContent className="space-y-3">
          {error && <Alert tone="error" title="Les créneaux n'ont pas pu être chargés. Réessayez." />}
          <div className="flex items-center justify-between gap-2">
            {prev ? <Link prefetch={false} href={href({ debut: prev })} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}><ChevronLeft aria-hidden /> Précédent</Link> : <span />}
            <span className="text-sm font-medium">{formatApptDay(days[0])} – {formatApptDay(days[days.length - 1])}</span>
            {next ? <Link prefetch={false} href={href({ debut: next })} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>Suivant <ChevronRight aria-hidden /></Link> : <span />}
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {days.map((day) => {
              const list = byDay.get(day) ?? [];
              return (
                <li key={day} className="rounded-lg border p-3">
                  <p className="mb-2 text-sm font-semibold">{formatApptDay(day)}</p>
                  {list.length === 0 ? <p className="text-xs text-muted-foreground">Aucun créneau</p> : (
                    <div className="flex flex-wrap gap-2">
                      {list.map((s) => (
                        <Link prefetch={false} key={s.slot_start} href={href({ creneau: new Date(s.slot_start).toISOString() })}
                          className="rounded-md bg-brand-sky px-3 py-1.5 text-sm font-semibold text-brand-blue hover:bg-sky-200">{formatApptTime(s.slot_start)}</Link>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {slots.length === 0 && <p className="text-sm text-muted-foreground">Aucun créneau libre cette semaine. Essayez la semaine suivante.</p>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><BellRing className="size-5 text-brand-blue" aria-hidden /> Être prévenu si un créneau se libère</CardTitle>
          <CardDescription>Si un patient annule, vous recevez une notification. Le créneau est proposé à plusieurs personnes : le premier qui réserve l&apos;obtient.</CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={joinWaitlist} className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <input type="hidden" name="site_id" value={siteId} />
            <Field label="Avant le" htmlFor="until"><Input id="until" name="until" type="date" min={today} max={addDays(today, 60)} defaultValue={addDays(today, 14)} required /></Field>
            <SubmitButton variant="outline">M&apos;alerter</SubmitButton>
          </ActionForm>
        </CardContent>
      </Card>
      <p className="flex items-start gap-1 text-xs text-muted-foreground"><Info className="mt-0.5 size-3 shrink-0" aria-hidden /><span>Horaires du Mali. Le cabinet peut exceptionnellement déplacer un rendez-vous : vous seriez alors prévenu. <Link prefetch={false} href={`/medecins/${doctorId}`} className="underline">Voir la fiche du médecin</Link>.</span></p>
    </div>
  );
}

function RequestForm({ siteId, today, profile, absences }: {
  siteId: string; today: string; profile: { full_name: string | null; phone: string | null } | null; absences: { starts_on: string; ends_on: string }[];
}) {
  const fmt = (x: string) => x.split("-").reverse().join("/");
  return (
    <Card>
      <CardHeader>
        <CardTitle>Votre demande</CardTitle>
        <CardDescription>Ce lieu fonctionne sur demande : le médecin ou son secrétariat confirme avec une heure précise, propose un autre moment ou refuse, en général sous 48 heures. Rien n&apos;est réservé avant la confirmation.</CardDescription>
      </CardHeader>
      <CardContent>
        <ActionForm action={requestAppointment} className="space-y-5" labels={{ date: "Date", patient_name: "Nom du patient", phone: "Téléphone", reason: "Motif", consent: "Confirmation" }}>
          <input type="hidden" name="key" value={randomUUID()} />
          <input type="hidden" name="site_id" value={siteId} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Date souhaitée" htmlFor="date" required hint="Un jour où le médecin consulte dans ce lieu">
              <Input id="date" name="date" type="date" min={today} max={addDays(today, 60)} required />
            </Field>
            <fieldset className="min-w-0">
              <legend className="mb-1 text-sm font-medium">Moment de la journée</legend>
              <div className="flex flex-wrap gap-x-4 gap-y-2 pt-2 text-sm">
                {Object.entries(APPT_PERIODS).map(([k, l]) => (
                  <label key={k} className="flex items-center gap-2"><input type="radio" name="period" value={k} defaultChecked={k === "indifferent"} className="size-4" /> {l}</label>
                ))}
              </div>
            </fieldset>
          </div>
          {absences.length > 0 && (
            <p className="text-xs text-amber-800">Absences annoncées : {absences.map((a) => a.starts_on === a.ends_on ? fmt(a.starts_on) : `du ${fmt(a.starts_on)} au ${fmt(a.ends_on)}`).join(", ")}.</p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nom du patient" htmlFor="patient_name" required hint="Vous pouvez demander pour un proche (enfant, parent)">
              <Input id="patient_name" name="patient_name" required minLength={2} maxLength={120} defaultValue={profile?.full_name ?? ""} />
            </Field>
            <Field label="Téléphone pour vous joindre" htmlFor="phone" required>
              <Input id="phone" name="phone" type="tel" required defaultValue={formatPhone(profile?.phone)} placeholder="76 00 00 00" />
            </Field>
          </div>
          <Field label="Motif (facultatif)" htmlFor="reason" hint="Quelques mots suffisent (ex. « consultation de suivi »). Ne détaillez pas votre état de santé : vous en parlerez avec le médecin.">
            <Textarea id="reason" name="reason" maxLength={300} rows={2} />
          </Field>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="consent" className="mt-0.5 size-4" required />
            <span>J&apos;ai compris que ma demande doit être confirmée par le médecin ou son secrétariat, et que mon nom, mon téléphone et le motif leur seront transmis.</span>
          </label>
          <SubmitButton className="bg-brand-blue hover:bg-brand-blue/90" pendingText="Envoi…">Envoyer la demande</SubmitButton>
        </ActionForm>
      </CardContent>
    </Card>
  );
}
