import Link from "next/link";
import { BellRing, CalendarCheck, CalendarPlus, MapPin, Phone, RotateCcw, Users } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { answerProposal, cancelAppointment, leaveWaitlist } from "@/app/actions/appointments";
import { APPT_PERIODS, APPT_STATUS, formatApptDay, formatApptTime } from "@/lib/appointments";
import { formatPhone } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Mes rendez-vous" };

type Row = {
  id: string; status: string; requested_date: string; requested_period: string; scheduled_at: string | null; response_note: string | null;
  patient_name: string; reason: string | null; cancelled_by: string | null; created_at: string;
  doctor_id: string; doctor_label: string; clinic_id: string; clinic_name: string; clinic_address: string; phone: string | null;
  site_id: string | null; type_name: string | null; instructions: string | null; access_info: string | null; can_cancel: boolean; cancel_notice_hours: number;
};

export default async function MyAppointments() {
  await requireUser("/compte/rendez-vous");
  const supabase = await createClient();
  const [{ data }, { data: waits }] = await Promise.all([
    supabase.rpc("my_appointments"),
    supabase.from("appointment_waitlist").select("id, until_date, doctors(title, display_name), doctor_practice_sites(clinics(name))").order("created_at"),
  ]);
  const rows = (data as Row[]) ?? [];
  const one = <T,>(v: T | T[] | null | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;
  const active = rows.filter((r) => ["pending", "proposed", "confirmed"].includes(r.status) && !(r.status === "confirmed" && r.scheduled_at && new Date(r.scheduled_at) < new Date()));
  const past = rows.filter((r) => !active.includes(r));

  const card = (r: Row) => {
    const st = APPT_STATUS[r.status];
    const upcoming = active.includes(r);
    return (
      <li key={r.id} className="space-y-2 rounded-xl border bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <Link prefetch={false} href={`/medecins/${r.doctor_id}`} className="font-bold text-brand-deep hover:underline">{r.doctor_label}</Link>
            <p className="flex items-start gap-1 text-sm text-muted-foreground"><MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />{r.clinic_name} — {r.clinic_address}</p>
          </div>
          <Badge className={st.className}>{st.label}</Badge>
        </div>
        <p className="text-sm">
          {r.scheduled_at && ["confirmed", "proposed", "completed", "no_show"].includes(r.status) ? (
            <><strong>{formatApptDay(r.scheduled_at)}</strong> à <strong>{formatApptTime(r.scheduled_at)}</strong></>
          ) : (
            <>Demandé : <span>{formatApptDay(r.requested_date)}</span>, {APPT_PERIODS[r.requested_period].toLowerCase()}</>
          )}
          <span className="text-muted-foreground"> · pour {r.patient_name}</span>
        </p>
        {r.type_name && <p className="text-sm text-muted-foreground">Motif : {r.type_name}</p>}
        {upcoming && r.instructions && <p className="rounded-md bg-amber-50 p-2 text-sm text-amber-900"><strong>À savoir :</strong> {r.instructions}</p>}
        {upcoming && r.access_info && <p className="text-sm text-muted-foreground">Accès : {r.access_info}</p>}
        {r.response_note && <p className="rounded-md bg-muted p-2 text-sm"><strong>Message du cabinet :</strong> {r.response_note}</p>}
        {r.status === "proposed" && (
          <div className="flex flex-wrap gap-2">
            <ActionForm action={answerProposal}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="accept" value="true" />
              <SubmitButton size="sm">Accepter ce moment</SubmitButton></ActionForm>
            <ActionForm action={answerProposal}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="accept" value="false" />
              <SubmitButton size="sm" variant="outline" confirm="Refuser la proposition ? La demande sera annulée.">Refuser</SubmitButton></ActionForm>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          {r.phone && <a href={`tel:${r.phone}`} className="inline-flex items-center gap-1 text-sm font-medium text-brand-blue hover:underline"><Phone className="size-4" aria-hidden />{formatPhone(r.phone)}</a>}
          {r.status === "confirmed" && upcoming && (
            <a href={`/compte/rendez-vous/${r.id}/agenda.ics`} className="inline-flex items-center gap-1 text-sm font-medium text-brand-blue hover:underline"><CalendarPlus className="size-4" aria-hidden /> Ajouter à mon agenda</a>
          )}
          {!upcoming && r.site_id && (
            <Link prefetch={false} href={`/medecins/${r.doctor_id}/rendez-vous?lieu=${r.site_id}`} className="inline-flex items-center gap-1 text-sm font-medium text-brand-blue hover:underline"><RotateCcw className="size-4" aria-hidden /> Reprendre rendez-vous</Link>
          )}
          {upcoming && !r.can_cancel && r.status === "confirmed" && (
            <span className="text-xs text-muted-foreground">Annulation en ligne possible jusqu&apos;à {r.cancel_notice_hours} h avant : appelez le cabinet.</span>
          )}
          {upcoming && r.can_cancel && (
            <ActionForm action={cancelAppointment}><input type="hidden" name="id" value={r.id} />
              <SubmitButton size="sm" variant="ghost" className="text-destructive" confirm="Annuler ce rendez-vous ? Le cabinet sera prévenu.">Annuler</SubmitButton></ActionForm>
          )}
        </div>
      </li>
    );
  };

  return (
    <div className="container-page max-w-3xl space-y-6 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-bold"><CalendarCheck className="size-6 text-brand-blue" aria-hidden /> Mes rendez-vous</h1>
        <div className="flex flex-wrap gap-2">
          <Link prefetch={false} href="/compte/proches" className={cn(buttonVariants({ variant: "outline" }))}><Users aria-hidden /> Mes proches</Link>
          <Link prefetch={false} href="/medecins" className={cn(buttonVariants({ variant: "outline" }))}>Trouver un médecin</Link>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed bg-white p-8 text-center text-sm text-muted-foreground">
          Aucune demande. Sur la fiche d&apos;un médecin, cliquez sur « Demander un rendez-vous » quand le lieu de consultation le permet.
        </p>
      ) : (
        <>
          <section aria-labelledby="active-title" className="space-y-3">
            <h2 id="active-title" className="text-lg font-bold">En cours et à venir ({active.length})</h2>
            {active.length === 0 ? <p className="text-sm text-muted-foreground">Aucun rendez-vous à venir.</p> : <ul className="space-y-3">{active.map(card)}</ul>}
          </section>
          {past.length > 0 && (
            <section aria-labelledby="past-title" className="space-y-3">
              <h2 id="past-title" className="text-lg font-bold">Historique</h2>
              <ul className="space-y-3">{past.map(card)}</ul>
            </section>
          )}
        </>
      )}
      {(waits ?? []).length > 0 && (
        <section aria-labelledby="wait-title" className="space-y-3">
          <h2 id="wait-title" className="flex items-center gap-2 text-lg font-bold"><BellRing className="size-5 text-brand-blue" aria-hidden /> Mes alertes de créneau libéré</h2>
          <ul className="divide-y rounded-xl border bg-white">
            {(waits ?? []).map((wt) => {
              const doc = one(wt.doctors);
              const cl = one(one(wt.doctor_practice_sites)?.clinics);
              return (
                <li key={wt.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                  <span>{doc ? `${doc.title} ${doc.display_name}` : "Médecin"}{cl ? ` — ${cl.name}` : ""} · jusqu&apos;au {formatApptDay(wt.until_date)}</span>
                  <ActionForm action={leaveWaitlist}><input type="hidden" name="id" value={wt.id} /><SubmitButton size="sm" variant="ghost">Supprimer</SubmitButton></ActionForm>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      <p className="text-xs text-muted-foreground">Une demande sans réponse sous 48 heures expire automatiquement : vous pouvez alors appeler le cabinet ou refaire une demande.</p>
    </div>
  );
}
