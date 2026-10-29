import Link from "next/link";
import { Phone } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { cancelAppointment, closeAppointment, respondAppointment } from "@/app/actions/appointments";
import { APPT_PERIODS, APPT_STATUS, formatApptDay, formatApptTime } from "@/lib/appointments";
import { DayTools, PracticeInfoCard, SiteSettingsCard, TypesCard, type BoardSite } from "@/components/appointments/practice-tools";
import { todayMali } from "@/lib/appointments";
import { formatPhone } from "@/lib/format";
import { humanizeError } from "@/lib/errors";
import { cn } from "@/lib/utils";

type Row = {
  id: string; status: string; requested_date: string; requested_period: string; scheduled_at: string | null; response_note: string | null;
  patient_name: string; patient_phone: string; reason: string | null; cancelled_by: string | null; created_at: string;
  doctor_label: string; clinic_id: string; clinic_name: string; type_name: string | null; source: string; ends_at: string | null;
};
export type { BoardSite } from "@/components/appointments/practice-tools";

const VIEWS = [["a_traiter", "À traiter"], ["jour", "Agenda du jour"], ["a_venir", "À venir"], ["a_cloturer", "À clôturer"], ["historique", "Historique"], ["reglages", "Réglages"]] as const;

/**
 * Agenda des demandes de rendez-vous, partagé entre l'espace médecin (clinicId absent)
 * et l'espace établissement (clinicId : secrétariat).
 */
export async function PracticeBoard({ clinicId, view, date, basePath, sites, doctorId }: { clinicId?: string; view?: string; date?: string; basePath: string; sites: BoardSite[]; doctorId?: string }) {
  const v = VIEWS.some(([k]) => k === view) ? view! : "a_traiter";
  const supabase = await createClient();
  const day = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : todayMali();
  const { data, error } = v === "reglages" ? { data: [], error: null } : await supabase.rpc("practice_appointments", { p_clinic: clinicId ?? null, p_view: v, p_date: v === "jour" ? day : null });
  const rows = (data as Row[]) ?? [];
  const hidden = clinicId ? <input type="hidden" name="clinic_id" value={clinicId} /> : null;

  return (
    <div className="space-y-5">
      {v !== "reglages" && !sites.some((x) => x.accepts_appointments) && (
        <Alert tone="info" title="La prise de rendez-vous en ligne est fermée">
          Ouvrez-la dans <Link prefetch={false} href={`${basePath}?vue=reglages`} className="font-semibold underline">Réglages</Link> : créez vos motifs de consultation, puis choisissez la réservation immédiate ou la demande à confirmer.
        </Alert>
      )}

      <nav aria-label="Vues des rendez-vous" className="flex flex-wrap gap-2">
        {VIEWS.map(([k, l]) => (
          <Link prefetch={false} key={k} href={`${basePath}?vue=${k}`} aria-current={v === k ? "page" : undefined}
            className={cn("rounded-full border px-4 py-2 text-sm font-medium", v === k ? "border-brand-blue bg-brand-sky text-brand-blue" : "bg-white")}>{l}</Link>
        ))}
      </nav>

      {v === "reglages" && (
        <div className="space-y-5">
          <SiteSettingsCard sites={sites} clinicId={clinicId} />
          <TypesCard sites={sites} clinicId={clinicId} doctorId={doctorId} />
          {doctorId && <PracticeInfoCard doctorId={doctorId} />}
        </div>
      )}
      {v === "jour" && <DayTools sites={sites} clinicId={clinicId} date={day} basePath={basePath} doctorId={doctorId} />}
      {error && <Alert tone="error" title={humanizeError(error)} />}
      {!error && v !== "reglages" && rows.length === 0 && (
        <p className="rounded-xl border border-dashed bg-white p-8 text-center text-sm text-muted-foreground">
          {v === "a_traiter" ? "Aucune demande en attente." : v === "jour" ? "Aucun rendez-vous ce jour-là." : v === "a_venir" ? "Aucun rendez-vous à venir." : v === "a_cloturer" ? "Rien à clôturer." : "Aucun rendez-vous passé."}
        </p>
      )}
      <ul className="space-y-3">
        {rows.map((r) => {
          const st = APPT_STATUS[r.status];
          return (
            <li key={r.id} className="space-y-3 rounded-xl border bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-bold">{r.patient_name}</p>
                  <a href={`tel:${r.patient_phone}`} className="inline-flex items-center gap-1 text-sm font-medium text-brand-blue hover:underline"><Phone className="size-4" aria-hidden />{formatPhone(r.patient_phone)}</a>
                  <p className="text-xs text-muted-foreground">{clinicId ? r.doctor_label : r.clinic_name}</p>
                </div>
                <Badge className={st.className}>{st.label}</Badge>
              </div>
              {(r.type_name || r.source === "practice") && r.scheduled_at ? (
                <p className="text-sm"><strong>{formatApptDay(r.scheduled_at)}, {formatApptTime(r.scheduled_at)}{r.ends_at ? ` – ${formatApptTime(r.ends_at)}` : ""}</strong></p>
              ) : <p className="text-sm">
                Demandé : <strong>{formatApptDay(r.requested_date)}</strong>, {APPT_PERIODS[r.requested_period].toLowerCase()}
                {r.scheduled_at && ["confirmed", "proposed", "completed", "no_show"].includes(r.status) && (
                  <> · {r.status === "proposed" ? "proposé" : "fixé"} : <strong>{formatApptDay(r.scheduled_at)} à {formatApptTime(r.scheduled_at)}</strong></>
                )}
              </p>}
              {(r.type_name || r.source === "practice") && (
                <p className="text-xs text-muted-foreground">{[r.type_name, r.source === "practice" ? "saisi par le cabinet" : "pris en ligne"].filter(Boolean).join(" · ")}</p>
              )}
              {r.reason && <p className="rounded-md bg-muted p-2 text-sm"><strong>Précision du patient :</strong> {r.reason}</p>}
              {r.response_note && <p className="text-xs text-muted-foreground">Votre message : {r.response_note}</p>}

              {r.status === "pending" && (
                <div className="grid gap-3 lg:grid-cols-3">
                  <ActionForm action={respondAppointment} className="space-y-2 rounded-lg border p-3">
                    <input type="hidden" name="id" value={r.id} /><input type="hidden" name="action" value="confirm" /><input type="hidden" name="date" value={r.requested_date} />{hidden}
                    <p className="text-sm font-semibold">Confirmer ce jour-là</p>
                    <Input name="time" type="time" required aria-label="Heure du rendez-vous" defaultValue={r.requested_period === "apres_midi" ? "15:00" : "09:00"} />
                    <Input name="note" maxLength={300} placeholder="Message (facultatif)" aria-label="Message au patient" />
                    <SubmitButton size="sm">Confirmer</SubmitButton>
                  </ActionForm>
                  <ActionForm action={respondAppointment} className="space-y-2 rounded-lg border p-3">
                    <input type="hidden" name="id" value={r.id} /><input type="hidden" name="action" value="propose" />{hidden}
                    <p className="text-sm font-semibold">Proposer un autre moment</p>
                    <Input name="at" type="datetime-local" required aria-label="Date et heure proposées" />
                    <Input name="note" maxLength={300} placeholder="Message (facultatif)" aria-label="Message au patient" />
                    <SubmitButton size="sm" variant="secondary">Proposer</SubmitButton>
                  </ActionForm>
                  <ActionForm action={respondAppointment} className="space-y-2 rounded-lg border p-3">
                    <input type="hidden" name="id" value={r.id} /><input type="hidden" name="action" value="decline" />{hidden}
                    <p className="text-sm font-semibold">Refuser</p>
                    <Input name="note" required minLength={3} maxLength={300} placeholder="Motif pour le patient" aria-label="Motif du refus" />
                    <SubmitButton size="sm" variant="outline">Refuser</SubmitButton>
                  </ActionForm>
                </div>
              )}
              {r.status === "proposed" && <p className="text-xs text-muted-foreground">En attente de la réponse du patient (expire sous 48 heures).</p>}
              {r.status === "confirmed" && r.scheduled_at && new Date(r.scheduled_at) > new Date() && (
                <ActionForm action={cancelAppointment} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input type="hidden" name="id" value={r.id} />{hidden}
                  <Input name="reason" required minLength={3} maxLength={300} placeholder="Motif de l'annulation (transmis au patient)" aria-label="Motif de l'annulation" className="sm:max-w-sm" />
                  <SubmitButton size="sm" variant="outline" confirm="Annuler ce rendez-vous ? Le patient sera prévenu.">Annuler le rendez-vous</SubmitButton>
                </ActionForm>
              )}
              {r.status === "confirmed" && r.scheduled_at && new Date(r.scheduled_at) <= new Date() && (
                <div className="flex flex-wrap gap-2">
                  <ActionForm action={closeAppointment}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="outcome" value="completed" />{hidden}
                    <SubmitButton size="sm">Honoré</SubmitButton></ActionForm>
                  <ActionForm action={closeAppointment}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="outcome" value="no_show" />{hidden}
                    <SubmitButton size="sm" variant="outline">Patient absent</SubmitButton></ActionForm>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
