import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import {
  addPracticeBlock, practiceAddAppointment, removePracticeBlock, saveAppointmentType, setSiteAppointments, updatePracticeInfo, updateSiteBooking,
} from "@/app/actions/appointments";
import { AUDIENCE_LABEL, PAYMENT_LABEL, addDays, formatApptDay, formatApptTime } from "@/lib/appointments";
import { scheduleLines, type Schedule } from "@/lib/directory";
import { cn } from "@/lib/utils";

export type BoardSite = {
  id: string; label: string; schedule: Schedule; accepts_appointments: boolean; published: boolean;
  booking_mode: string; min_notice_hours: number; cancel_notice_hours: number; access_info: string | null;
};

/** Ouverture des réservations et réglages de chaque lieu de consultation. */
export function SiteSettingsCard({ sites, clinicId }: { sites: BoardSite[]; clinicId?: string }) {
  const hidden = clinicId ? <input type="hidden" name="clinic_id" value={clinicId} /> : null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Prise de rendez-vous en ligne</CardTitle>
        <CardDescription>
          Pour chaque lieu : <strong>réservation immédiate</strong> (le patient choisit un créneau libre, calculé à partir de vos horaires et de la durée du motif)
          ou <strong>demande à confirmer</strong> (le patient indique un jour, vous fixez l&apos;heure).
        </CardDescription>
      </CardHeader>
      <CardContent>
        {sites.length === 0 ? <p className="text-sm text-muted-foreground">Aucun lieu de consultation accepté par les deux parties.</p> : (
          <ul className="space-y-4">
            {sites.map((s) => (
              <li key={s.id} className="space-y-3 rounded-lg border p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 text-sm">
                    <p className="font-semibold">{s.label}{" "}
                      {s.accepts_appointments
                        ? <Badge className="border-emerald-200 bg-emerald-50 text-emerald-900">{s.booking_mode === "instant" ? "Réservation immédiate" : "Demandes ouvertes"}</Badge>
                        : <Badge className="bg-muted">Fermé</Badge>}
                    </p>
                    <p className="text-xs text-muted-foreground">{scheduleLines(s.schedule).map((l) => `${l.day} ${l.slots}`).join(" · ") || "Aucun jour de consultation"}</p>
                    {!s.published && <p className="text-xs text-amber-800">Lieu pas encore publié (vérification en cours) : le bouton apparaîtra après publication.</p>}
                  </div>
                  <ActionForm action={setSiteAppointments}>
                    <input type="hidden" name="site_id" value={s.id} />{hidden}
                    <input type="hidden" name="on" value={s.accepts_appointments ? "false" : "true"} />
                    <SubmitButton size="sm" variant={s.accepts_appointments ? "outline" : "default"}>{s.accepts_appointments ? "Fermer la prise de rendez-vous" : "Ouvrir la prise de rendez-vous"}</SubmitButton>
                  </ActionForm>
                </div>
                <details>
                  <summary className="cursor-pointer text-sm font-medium text-brand-blue">Réglages du lieu</summary>
                  <ActionForm action={updateSiteBooking} className="mt-3 grid gap-3 sm:grid-cols-2">
                    <input type="hidden" name="site_id" value={s.id} />{hidden}
                    <fieldset className="min-w-0 sm:col-span-2">
                      <legend className="mb-1 text-sm font-medium">Mode</legend>
                      <div className="flex flex-col gap-2 text-sm">
                        <label className="flex items-center gap-2"><input type="radio" name="booking_mode" value="instant" defaultChecked={s.booking_mode === "instant"} className="size-4" /> Réservation immédiate d&apos;un créneau libre</label>
                        <label className="flex items-center gap-2"><input type="radio" name="booking_mode" value="request" defaultChecked={s.booking_mode !== "instant"} className="size-4" /> Demande à confirmer par le cabinet</label>
                      </div>
                    </fieldset>
                    <Field label="Délai minimum avant un rendez-vous (heures)" htmlFor={`mn-${s.id}`} hint="Ex. 2 : pas de réservation moins de 2 h avant">
                      <Input id={`mn-${s.id}`} name="min_notice_hours" type="number" min={0} max={168} defaultValue={s.min_notice_hours} />
                    </Field>
                    <Field label="Annulation en ligne jusqu'à (heures avant)" htmlFor={`cn-${s.id}`}>
                      <Input id={`cn-${s.id}`} name="cancel_notice_hours" type="number" min={0} max={168} defaultValue={s.cancel_notice_hours} />
                    </Field>
                    <Field label="Informations d'accès" htmlFor={`ai-${s.id}`} hint="Étage, porte, repère, parking…" className="sm:col-span-2">
                      <Input id={`ai-${s.id}`} name="access_info" maxLength={300} defaultValue={s.access_info ?? ""} />
                    </Field>
                    <SubmitButton size="sm" className="w-fit">Enregistrer</SubmitButton>
                  </ActionForm>
                </details>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

type TypeRow = { id: string; site_id: string | null; name: string; duration_min: number; audience: string; instructions: string | null; fee: string | null; sort_order: number; is_active: boolean };

/** Motifs de consultation (durée, public, consignes, tarif indicatif). */
export async function TypesCard({ sites, clinicId, doctorId }: { sites: BoardSite[]; clinicId?: string; doctorId?: string }) {
  const supabase = await createClient();
  let q = supabase.from("appointment_types").select("id, site_id, name, duration_min, audience, instructions, fee, sort_order, is_active").order("sort_order").order("name");
  q = doctorId ? q.eq("doctor_id", doctorId) : q.in("site_id", sites.length ? sites.map((s) => s.id) : ["00000000-0000-0000-0000-000000000000"]);
  const { data } = await q;
  const types = (data as TypeRow[]) ?? [];
  const siteName = (id: string | null) => (id ? sites.find((s) => s.id === id)?.label ?? "Lieu" : "Tous les lieux");
  const hidden = clinicId ? <input type="hidden" name="clinic_id" value={clinicId} /> : null;
  const fields = (t?: TypeRow) => (
    <>
      <Field label="Nom du motif" htmlFor={`tn-${t?.id ?? "new"}`} required><Input id={`tn-${t?.id ?? "new"}`} name="name" required minLength={2} maxLength={80} defaultValue={t?.name} placeholder="Ex. Première consultation" /></Field>
      <Field label="Durée (minutes)" htmlFor={`td-${t?.id ?? "new"}`} required><Input id={`td-${t?.id ?? "new"}`} name="duration_min" type="number" min={5} max={240} step={5} required defaultValue={t?.duration_min ?? 20} /></Field>
      <Field label="Pour" htmlFor={`ta-${t?.id ?? "new"}`}>
        <Select id={`ta-${t?.id ?? "new"}`} name="audience" defaultValue={t?.audience ?? "all"}>{Object.entries(AUDIENCE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
      </Field>
      <Field label="Lieu" htmlFor={`ts-${t?.id ?? "new"}`}>
        <Select id={`ts-${t?.id ?? "new"}`} name="site_id" defaultValue={t?.site_id ?? (clinicId ? sites[0]?.id : "")} required={Boolean(clinicId)}>
          {!clinicId && <option value="">Tous les lieux</option>}
          {sites.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </Select>
      </Field>
      <Field label="Tarif indicatif (facultatif)" htmlFor={`tf-${t?.id ?? "new"}`}><Input id={`tf-${t?.id ?? "new"}`} name="fee" maxLength={80} defaultValue={t?.fee ?? ""} placeholder="Ex. 10 000 FCFA" /></Field>
      <Field label="Ordre d'affichage" htmlFor={`to-${t?.id ?? "new"}`}><Input id={`to-${t?.id ?? "new"}`} name="sort_order" type="number" defaultValue={t?.sort_order ?? 100} /></Field>
      <Field label="Consignes pour le patient (facultatif)" htmlFor={`ti-${t?.id ?? "new"}`} className="sm:col-span-2">
        <Textarea id={`ti-${t?.id ?? "new"}`} name="instructions" maxLength={500} rows={2} defaultValue={t?.instructions ?? ""} placeholder="Ex. Venez à jeun, apportez vos derniers examens" />
      </Field>
    </>
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>Motifs de consultation</CardTitle>
        <CardDescription>Indispensables pour la réservation immédiate : la durée du motif découpe vos horaires en créneaux. Les tarifs sont ceux que vous déclarez.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {types.length === 0 && <p className="text-sm text-muted-foreground">Aucun motif pour le moment.</p>}
        {types.map((t) => (
          <details key={t.id} className="rounded-lg border p-3">
            <summary className="cursor-pointer text-sm">
              <strong>{t.name}</strong> · {t.duration_min} min · {AUDIENCE_LABEL[t.audience]} · {siteName(t.site_id)}{t.fee ? ` · ${t.fee}` : ""}{!t.is_active ? " · désactivé" : ""}
            </summary>
            <ActionForm action={saveAppointmentType} className="mt-3 grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="id" value={t.id} />{hidden}<input type="hidden" name="is_active_field" value="1" />
              {fields(t)}
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_active" defaultChecked={t.is_active} className="size-4" /> Proposé en ligne</label>
              <SubmitButton size="sm" variant="outline" className="w-fit">Enregistrer</SubmitButton>
            </ActionForm>
          </details>
        ))}
        <details className="rounded-lg border border-dashed p-3" open>
          <summary className="cursor-pointer text-sm font-semibold">Ajouter un motif</summary>
          <ActionForm action={saveAppointmentType} resetOnSuccess className="mt-3 grid gap-3 sm:grid-cols-2">
            {hidden}{fields()}
            <SubmitButton size="sm" className="w-fit">Ajouter</SubmitButton>
          </ActionForm>
        </details>
      </CardContent>
    </Card>
  );
}

/** Informations pratiques du médecin (présentation, tarifs, paiement, nouveaux patients). */
export async function PracticeInfoCard({ doctorId }: { doctorId: string }) {
  const supabase = await createClient();
  const { data: d } = await supabase.from("doctors").select("presentation, fee_info, payment_methods, accepts_new_patients").eq("id", doctorId).single();
  return (
    <Card>
      <CardHeader><CardTitle>Informations pratiques (fiche publique)</CardTitle><CardDescription>Affichées sur votre fiche. Indiquez uniquement des informations exactes.</CardDescription></CardHeader>
      <CardContent>
        <ActionForm action={updatePracticeInfo} className="space-y-3">
          <Field label="Présentation (facultatif)" htmlFor="presentation" hint="Parcours, expertises, langues… 1 500 caractères maximum. Pas de publicité.">
            <Textarea id="presentation" name="presentation" maxLength={1500} rows={4} defaultValue={d?.presentation ?? ""} />
          </Field>
          <Field label="Tarifs (facultatif)" htmlFor="fee_info"><Input id="fee_info" name="fee_info" maxLength={200} defaultValue={d?.fee_info ?? ""} placeholder="Ex. Consultation : 10 000 FCFA ; contrôle : 5 000 FCFA" /></Field>
          <fieldset className="min-w-0">
            <legend className="text-sm font-medium">Moyens de paiement acceptés</legend>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-2 text-sm">
              {Object.entries(PAYMENT_LABEL).map(([k, l]) => (
                <label key={k} className="flex items-center gap-2"><input type="checkbox" name="payment_methods" value={k} defaultChecked={(d?.payment_methods as string[] | undefined)?.includes(k)} className="size-4" /> {l}</label>
              ))}
            </div>
          </fieldset>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="accepts_new_patients" defaultChecked={d?.accepts_new_patients ?? true} className="size-4" /> J&apos;accepte de nouveaux patients en ligne</label>
          <SubmitButton size="sm">Enregistrer</SubmitButton>
        </ActionForm>
      </CardContent>
    </Card>
  );
}

/** Outils de l'agenda du jour : navigation, rendez-vous téléphonique, plages bloquées. */
export async function DayTools({ sites, clinicId, date, basePath, doctorId }: { sites: BoardSite[]; clinicId?: string; date: string; basePath: string; doctorId?: string }) {
  const supabase = await createClient();
  const dayStart = `${date}T00:00:00Z`;
  const dayEnd = `${addDays(date, 1)}T00:00:00Z`;
  let q = supabase.from("practice_blocks").select("id, site_id, starts_at, ends_at, note").lt("starts_at", dayEnd).gt("ends_at", dayStart).order("starts_at");
  q = doctorId ? q.eq("doctor_id", doctorId) : q.in("site_id", sites.length ? sites.map((s) => s.id) : ["00000000-0000-0000-0000-000000000000"]);
  const { data: blocks } = await q;
  const hidden = clinicId ? <input type="hidden" name="clinic_id" value={clinicId} /> : null;
  const siteSelect = (id: string) => (
    <Field label="Lieu" htmlFor={id}>
      <Select id={id} name="site_id" defaultValue={sites[0]?.id}>{sites.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</Select>
    </Field>
  );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link prefetch={false} href={`${basePath}?vue=jour&date=${addDays(date, -1)}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}><ChevronLeft aria-hidden /> Veille</Link>
        <form method="get" className="order-last flex w-full items-center gap-2 sm:order-none sm:w-auto">
          <input type="hidden" name="vue" value="jour" />
          <Input name="date" type="date" defaultValue={date} aria-label="Jour affiché" className="h-9 min-w-0 flex-1 sm:w-auto sm:flex-none" />
          <button className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>Voir</button>
        </form>
        <Link prefetch={false} href={`${basePath}?vue=jour&date=${addDays(date, 1)}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>Lendemain <ChevronRight aria-hidden /></Link>
      </div>
      <p className="text-lg font-bold">{formatApptDay(date)}</p>
      {(blocks ?? []).length > 0 && (
        <ul className="space-y-2">
          {(blocks ?? []).map((b) => (
            <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed bg-muted/50 p-3 text-sm">
              <span><strong>Bloqué</strong> {formatApptTime(b.starts_at)} – {formatApptTime(b.ends_at)}{b.note ? ` · ${b.note}` : ""}</span>
              <ActionForm action={removePracticeBlock}><input type="hidden" name="id" value={b.id} />{hidden}<SubmitButton size="sm" variant="ghost">Débloquer</SubmitButton></ActionForm>
            </li>
          ))}
        </ul>
      )}
      {sites.length > 0 && (
        <div className="grid gap-3 lg:grid-cols-2">
          <details className="rounded-lg border bg-white p-3">
            <summary className="cursor-pointer text-sm font-semibold">+ Ajouter un rendez-vous (patient au téléphone)</summary>
            <ActionForm action={practiceAddAppointment} resetOnSuccess className="mt-3 grid gap-3 sm:grid-cols-2">
              {hidden}<input type="hidden" name="date" value={date} />
              {siteSelect("pa-site")}
              <Field label="Heure" htmlFor="pa-time" required><Input id="pa-time" name="time" type="time" required /></Field>
              <Field label="Durée (min)" htmlFor="pa-dur"><Input id="pa-dur" name="duration_min" type="number" min={5} max={240} step={5} defaultValue={20} /></Field>
              <Field label="Nom du patient" htmlFor="pa-name" required><Input id="pa-name" name="patient_name" required minLength={2} maxLength={120} /></Field>
              <Field label="Téléphone" htmlFor="pa-phone" required><Input id="pa-phone" name="phone" type="tel" required /></Field>
              <Field label="Note (facultatif)" htmlFor="pa-note"><Input id="pa-note" name="note" maxLength={300} /></Field>
              <SubmitButton size="sm" className="w-fit">Ajouter</SubmitButton>
            </ActionForm>
          </details>
          <details className="rounded-lg border bg-white p-3">
            <summary className="cursor-pointer text-sm font-semibold">+ Bloquer une plage (réunion, garde…)</summary>
            <ActionForm action={addPracticeBlock} resetOnSuccess className="mt-3 grid gap-3 sm:grid-cols-2">
              {hidden}<input type="hidden" name="date" value={date} />
              {siteSelect("pb-site")}
              <Field label="De" htmlFor="pb-from" required><Input id="pb-from" name="from" type="time" required /></Field>
              <Field label="À" htmlFor="pb-to" required><Input id="pb-to" name="to" type="time" required /></Field>
              <Field label="Note (facultatif)" htmlFor="pb-note"><Input id="pb-note" name="note" maxLength={120} /></Field>
              <SubmitButton size="sm" className="w-fit">Bloquer</SubmitButton>
            </ActionForm>
          </details>
        </div>
      )}
    </div>
  );
}
