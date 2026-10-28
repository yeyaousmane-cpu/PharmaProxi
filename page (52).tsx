import { redirect } from "next/navigation";
import Link from "next/link";
import { Building2, CalendarClock, CheckCircle2, Eye, FileText, Flag, MapPin, Trash2 } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/settings";
import { getSpecialties, groupByFamily } from "@/lib/directory-server";
import {
  acceptSite, addAbsence, confirmDoctorInfo, deleteDirectoryDocument, proposeSite, removeAbsence, removeSite, resubmitDoctor,
  setDoctorPublished, updateDoctor, updateSite, uploadDoctorDocument,
} from "@/app/actions/directory";
import { DoctorFormFields, DOCTOR_LABELS } from "@/components/directory/doctor-form-fields";
import { ScheduleFields } from "@/components/directory/schedule-fields";
import { DirectoryFreshnessBadge, ScheduleTable } from "@/components/directory/directory-bits";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { DOCTOR_DOC_LABELS, REVIEW_STATUS, type DirectoryFreshness, type Schedule } from "@/lib/directory";
import { formatDate, formatDateTime, formatPhone } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Espace médecin" };
const one = <T,>(v: T | T[] | null | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

export default async function DoctorSpace({ searchParams }: { searchParams: Promise<{ inscrit?: string }> }) {
  const sp = await searchParams;
  const s = await requireUser("/medecin");
  if (!s.doctor) redirect("/medecin/inscription");
  const supabase = await createClient();
  const [{ data: d }, { data: priv }, { data: specs }, { data: docs }, { data: history }, { data: sites }, { data: absences }, { data: clinics }, { data: reports }, settings, specialties] =
    await Promise.all([
      supabase.from("doctors").select("*").eq("id", s.doctor.id).single(),
      supabase.from("doctor_private").select("order_number, personal_phone").eq("doctor_id", s.doctor.id).maybeSingle(),
      supabase.from("doctor_specialties").select("specialty_id").eq("doctor_id", s.doctor.id),
      supabase.from("doctor_documents").select("id, doc_type, file_name, storage_path, created_at").eq("doctor_id", s.doctor.id).order("created_at"),
      supabase.from("directory_verifications").select("id, decision, reason, created_at").eq("doctor_id", s.doctor.id).order("created_at", { ascending: false }),
      supabase.from("doctor_practice_sites").select("id, schedule, appointment_phone, doctor_accepted, clinic_accepted, clinics(id, name, status, communes(name), regions(name))").eq("doctor_id", s.doctor.id).order("created_at"),
      supabase.from("doctor_absences").select("id, starts_on, ends_on, note").eq("doctor_id", s.doctor.id).gte("ends_on", new Date().toISOString().slice(0, 10)).order("starts_on"),
      supabase.from("clinics").select("id, name, status, communes(name), regions(name)").in("status", ["verified", "pending"]).order("name").limit(1000),
      supabase.from("reports").select("id, reason, description, status, created_at").eq("doctor_id", s.doctor.id).in("status", ["open", "in_review"]).order("created_at", { ascending: false }),
      getSettings(),
      getSpecialties(),
    ]);
  if (!d) redirect("/medecin/inscription");
  const links = await Promise.all((docs ?? []).map(async (x) => {
    const { data } = await supabase.storage.from("directory-documents").createSignedUrl(x.storage_path, 300);
    return { ...x, url: data?.signedUrl ?? null };
  }));
  const status = REVIEW_STATUS[d.status];
  const ageDays = (Date.now() - new Date(d.confirmed_at).getTime()) / 86_400_000;
  const freshness: DirectoryFreshness = ageDays <= settings.directory_fresh_days ? "fresh" : ageDays <= settings.directory_stale_days ? "to_confirm" : "stale";
  const editable = d.status !== "suspended";
  const docsEditable = d.status === "pending" || d.status === "rejected";
  const linked = new Set((sites ?? []).map((x) => one(x.clinics)?.id));
  const clinicOptions = (clinics ?? []).filter((c) => !linked.has(c.id));
  const pendingInvites = (sites ?? []).filter((x) => !x.doctor_accepted);

  return (
    <div className="container-page space-y-6 py-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-deep">Espace médecin</h1>
          <p className="text-muted-foreground">{d.title} {d.display_name}</p>
        </div>
        <Link prefetch={false} href={`/medecins/${d.id}`} className={cn(buttonVariants({ variant: "outline" }))}><Eye aria-hidden /> Voir ma fiche publique</Link>
      </header>
      {sp.inscrit && <Alert tone="success" title="Demande enregistrée">Étape suivante : déposez vos justificatifs, puis indiquez vos lieux de consultation.</Alert>}
      {pendingInvites.length > 0 && (
        <Alert tone="info" title={`${pendingInvites.length} établissement(s) vous propose(nt) un planning`}>Acceptez-le dans « Mes lieux de consultation » pour le publier.</Alert>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Statut</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Badge className={cn(status.className)}>{status.label}</Badge>
            {d.status === "verified" && !d.is_published && <p className="text-amber-800">Vous avez retiré votre fiche de l&apos;annuaire.</p>}
            {d.status === "rejected" && (
              <form action={resubmitDoctor}><Button type="submit" size="sm">Soumettre à nouveau après corrections</Button></form>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Informations à jour ?</CardTitle><CardDescription>À confirmer au moins tous les {settings.directory_fresh_days} jours.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <DirectoryFreshnessBadge freshness={freshness} confirmedAt={d.confirmed_at} />
            {editable && (
              <ActionForm action={confirmDoctorInfo}>
                <SubmitButton size="sm" variant="secondary"><CheckCircle2 aria-hidden /> Mes informations sont exactes</SubmitButton>
              </ActionForm>
            )}
            <p className="text-xs text-muted-foreground">Sans confirmation pendant {settings.directory_stale_days} jours, la fiche n&apos;est plus publiée jusqu&apos;à votre confirmation.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Publication</CardTitle><CardDescription>Vous gardez la main sur votre présence dans l&apos;annuaire.</CardDescription></CardHeader>
          <CardContent>
            <form action={setDoctorPublished}>
              <input type="hidden" name="published" value={d.is_published ? "0" : "1"} />
              <Button type="submit" size="sm" variant={d.is_published ? "outline" : "default"}>{d.is_published ? "Retirer ma fiche de l'annuaire" : "Republier ma fiche"}</Button>
            </form>
            <p className="mt-2 text-xs text-muted-foreground">Effet immédiat. Accord de publication enregistré le {formatDate(d.publication_consent_at)}.</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0 space-y-6">
          <Card id="lieux">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Building2 className="size-5" aria-hidden /> Mes lieux de consultation</CardTitle>
              <CardDescription>Un lieu est publié quand vous et l&apos;établissement l&apos;avez accepté.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {(sites ?? []).length === 0 && <p className="text-sm text-muted-foreground">Aucun lieu pour le moment.</p>}
              {(sites ?? []).map((x) => {
                const c = one(x.clinics);
                const state = x.doctor_accepted && x.clinic_accepted
                  ? d.status === "verified" && c?.status === "verified" ? { l: "Publié", c: "border-emerald-200 bg-emerald-50 text-emerald-800" }
                    : { l: "Accepté : publié après vérification", c: "border-emerald-200 bg-white text-emerald-800" }
                  : !x.doctor_accepted ? { l: "Proposé par l'établissement : à accepter", c: "border-sky-200 bg-brand-sky text-brand-blue" }
                  : { l: "En attente de l'établissement", c: "border-amber-200 bg-amber-50 text-amber-900" };
                return (
                  <div key={x.id} className="rounded-lg border p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold">{c?.name}</p>
                        <p className="flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="size-3" aria-hidden />{[one(c?.communes)?.name, one(c?.regions)?.name].filter(Boolean).join(", ")}{c?.status !== "verified" ? " · établissement non encore vérifié" : ""}</p>
                      </div>
                      <Badge className={state.c}>{state.l}</Badge>
                    </div>
                    <div className="mt-2"><ScheduleTable schedule={x.schedule as Schedule} compact /></div>
                    {x.appointment_phone && <p className="mt-1 text-xs">Rendez-vous : {formatPhone(x.appointment_phone)}</p>}
                    <div className="mt-2 flex flex-wrap gap-2">
                      {!x.doctor_accepted && <form action={acceptSite}><input type="hidden" name="site_id" value={x.id} /><Button type="submit" size="sm">Accepter ce planning</Button></form>}
                      <form action={removeSite}><input type="hidden" name="site_id" value={x.id} /><Button type="submit" size="sm" variant="outline">Retirer ce lieu</Button></form>
                    </div>
                    {editable && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-sm font-semibold text-brand-blue">Modifier les jours et horaires</summary>
                        <ActionForm action={updateSite} className="mt-2 space-y-3">
                          <input type="hidden" name="site_id" value={x.id} />
                          <ScheduleFields value={x.schedule as Schedule} idPrefix={`s-${x.id.slice(0, 6)}`} legend="Planning dans cet établissement" />
                          <Field label="Téléphone de rendez-vous (facultatif)" htmlFor={`ph-${x.id}`} hint="Sinon, le numéro de l'établissement est affiché">
                            <Input id={`ph-${x.id}`} name="appointment_phone" type="tel" defaultValue={formatPhone(x.appointment_phone)} />
                          </Field>
                          <SubmitButton size="sm">Enregistrer</SubmitButton>
                        </ActionForm>
                      </details>
                    )}
                  </div>
                );
              })}
              {editable && (
                <details className="rounded-lg border border-dashed p-3" open={(sites ?? []).length === 0}>
                  <summary className="cursor-pointer font-semibold">Ajouter un lieu de consultation</summary>
                  <ActionForm action={proposeSite} resetOnSuccess className="mt-3 space-y-3">
                    <Field label="Établissement" htmlFor="clinic_id" required hint="Seuls les établissements déjà vérifiés par PharmaProxi sont proposés.">
                      <Select id="clinic_id" name="clinic_id" required defaultValue="">
                        <option value="" disabled>Choisir un établissement</option>
                        {clinicOptions.map((c) => (
                          <option key={c.id} value={c.id}>{c.name} — {[one(c.communes)?.name, one(c.regions)?.name].filter(Boolean).join(", ")}{c.status === "pending" ? " (en vérification)" : ""}</option>
                        ))}
                      </Select>
                    </Field>
                    <p className="text-xs text-muted-foreground">Votre établissement n&apos;est pas dans la liste ? <Link prefetch={false} href="/clinique/inscription" className="font-semibold underline">Inscrivez-le</Link> (ou demandez à son responsable de le faire).</p>
                    <ScheduleFields idPrefix="new" legend="Jours et horaires de consultation" />
                    <Field label="Téléphone de rendez-vous (facultatif)" htmlFor="new-phone" hint="Secrétariat recommandé. Sinon, le numéro de l'établissement est affiché.">
                      <Input id="new-phone" name="appointment_phone" type="tel" />
                    </Field>
                    <SubmitButton>Ajouter ce lieu</SubmitButton>
                  </ActionForm>
                </details>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Ma fiche</CardTitle></CardHeader>
            <CardContent>
              {editable ? (
                <ActionForm action={updateDoctor} className="space-y-6" labels={DOCTOR_LABELS}>
                  <DoctorFormFields specialties={groupByFamily(specialties)} v={{
                    title: d.title, display_name: d.display_name, gender: d.gender, languages: d.languages, order_number: priv?.order_number,
                    personal_phone: priv?.personal_phone, specialties: (specs ?? []).map((x) => x.specialty_id),
                  }} />
                  <SubmitButton>Enregistrer</SubmitButton>
                </ActionForm>
              ) : <Alert tone="warning" title="Fiche suspendue : modification impossible. Contactez l'équipe PharmaProxi." />}
            </CardContent>
          </Card>
        </div>

        <div className="min-w-0 space-y-6">
          <Card id="justificatifs">
            <CardHeader><CardTitle>Justificatifs</CardTitle><CardDescription>Stockage privé : seuls vous et l&apos;équipe de vérification y avez accès.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              {!links.length ? <p className="text-sm text-muted-foreground">Aucun document déposé.</p> : (
                <ul className="divide-y text-sm">
                  {links.map((x) => (
                    <li key={x.id} className="flex items-center justify-between gap-2 py-2">
                      <span className="flex items-center gap-2"><FileText className="size-4" aria-hidden />
                        {x.url ? <a href={x.url} target="_blank" rel="noopener noreferrer" className="underline">{DOCTOR_DOC_LABELS[x.doc_type]}</a> : DOCTOR_DOC_LABELS[x.doc_type]}
                      </span>
                      {docsEditable && <form action={deleteDirectoryDocument}><input type="hidden" name="document_id" value={x.id} /><input type="hidden" name="kind" value="doctor" />
                        <button className="rounded p-2 text-destructive hover:bg-red-50" aria-label="Supprimer le document"><Trash2 className="size-4" /></button></form>}
                    </li>
                  ))}
                </ul>
              )}
              {editable && (
                <ActionForm action={uploadDoctorDocument} resetOnSuccess className="space-y-3">
                  <input type="hidden" name="doctor_id" value={d.id} />
                  <Field label="Type de document" htmlFor="doc_type" required>
                    <Select id="doc_type" name="doc_type" required>{Object.entries(DOCTOR_DOC_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
                  </Field>
                  <Field label="Fichier (PDF, JPEG, PNG, WebP — 5 Mo max.)" htmlFor="file" required>
                    <Input id="file" name="file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" required />
                  </Field>
                  <SubmitButton variant="secondary" pendingText="Envoi…">Déposer</SubmitButton>
                </ActionForm>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><CalendarClock className="size-5" aria-hidden /> Absences</CardTitle><CardDescription>Affichées sur votre fiche ; vous sortez du filtre « consulte aujourd&apos;hui ».</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              <ul className="divide-y text-sm">
                {(absences ?? []).map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2 py-2">
                    <span>Du {formatDate(a.starts_on)} au {formatDate(a.ends_on)}{a.note ? ` — ${a.note}` : ""}</span>
                    <form action={removeAbsence}><input type="hidden" name="absence_id" value={a.id} /><button className="rounded p-2 text-destructive hover:bg-red-50" aria-label="Supprimer l'absence"><Trash2 className="size-4" /></button></form>
                  </li>
                ))}
              </ul>
              {editable && (
                <ActionForm action={addAbsence} resetOnSuccess className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Du" htmlFor="starts_on" required><Input id="starts_on" name="starts_on" type="date" required /></Field>
                    <Field label="Au" htmlFor="ends_on" required><Input id="ends_on" name="ends_on" type="date" required /></Field>
                  </div>
                  <Field label="Note (facultative)" htmlFor="note" hint="Ex. congé, formation"><Input id="note" name="note" maxLength={120} /></Field>
                  <SubmitButton size="sm" variant="secondary">Ajouter l&apos;absence</SubmitButton>
                </ActionForm>
              )}
            </CardContent>
          </Card>

          {(reports ?? []).length > 0 && (
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Flag className="size-5" aria-hidden /> Signalements en cours</CardTitle><CardDescription>Corrigez votre fiche si nécessaire ; l&apos;équipe les traite.</CardDescription></CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  {(reports ?? []).map((r) => <li key={r.id}><span className="font-medium">{r.reason.replaceAll("_", " ")}</span> · {formatDateTime(r.created_at)}{r.description ? <span className="block text-muted-foreground">{r.description}</span> : null}</li>)}
                </ul>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle>Historique de vérification</CardTitle></CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                {(history ?? []).map((h) => (
                  <li key={h.id}><span className="font-medium">{REVIEW_STATUS[h.decision]?.label ?? h.decision}</span> · {formatDateTime(h.created_at)}{h.reason ? <span className="block text-muted-foreground">{h.reason}</span> : null}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
