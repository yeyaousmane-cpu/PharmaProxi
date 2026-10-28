import { notFound } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Eye, FileText, Flag, Search, Stethoscope, Trash2, Users } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getGeo } from "@/lib/geo";
import { getSettings } from "@/lib/settings";
import {
  acceptSite, clinicAddMember, clinicRemoveMember, confirmClinicInfo, deleteDirectoryDocument, inviteDoctor, removeSite, resubmitClinic,
  updateClinic, updateSite, uploadClinicDocument,
} from "@/app/actions/directory";
import { ClinicFormFields, CLINIC_LABELS } from "@/components/directory/clinic-form-fields";
import { ScheduleFields } from "@/components/directory/schedule-fields";
import { DirectoryFreshnessBadge, ScheduleTable } from "@/components/directory/directory-bits";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { CLINIC_DOC_LABELS, REVIEW_STATUS, type DirectoryFreshness, type Schedule } from "@/lib/directory";
import { formatDate, formatDateTime, formatPhone } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Gérer mon établissement" };
const one = <T,>(v: T | T[] | null | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;
type Member = { user_id: string; full_name: string | null; email: string; member_role: "owner" | "staff"; created_at: string };
type Candidate = { doctor_id: string; title: string; display_name: string; specialties: string | null };

export default async function ManageClinic({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ inscrite?: string; medecin?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const me = await requireUser(`/clinique/${id}`);
  const supabase = await createClient();
  const { data: membership } = await supabase.from("clinic_members").select("member_role").eq("clinic_id", id).eq("user_id", me.userId).maybeSingle();
  if (!membership) notFound();
  const [{ data: c }, { data: priv }, { data: docs }, { data: history }, { data: sites }, { data: team }, { data: reports }, geo, settings] = await Promise.all([
    supabase.from("clinics").select("*").eq("id", id).single(),
    supabase.from("clinic_private").select("*").eq("clinic_id", id).maybeSingle(),
    supabase.from("clinic_documents").select("id, doc_type, file_name, storage_path, created_at").eq("clinic_id", id).order("created_at"),
    supabase.from("directory_verifications").select("id, decision, reason, created_at").eq("clinic_id", id).order("created_at", { ascending: false }),
    supabase.from("doctor_practice_sites").select("id, schedule, appointment_phone, doctor_accepted, clinic_accepted, doctors(id, title, display_name, status)").eq("clinic_id", id).order("created_at"),
    supabase.rpc("clinic_team", { p_clinic: id }),
    supabase.from("reports").select("id, reason, description, status, created_at").eq("clinic_id", id).in("status", ["open", "in_review"]).order("created_at", { ascending: false }),
    getGeo(),
    getSettings(),
  ]);
  if (!c) notFound();
  const q = (sp.medecin ?? "").trim().slice(0, 80);
  const candidates = q.length >= 2 ? (((await supabase.rpc("find_doctors_to_invite", { p_clinic: id, p_query: q })).data as Candidate[]) ?? []) : [];
  const links = await Promise.all((docs ?? []).map(async (x) => {
    const { data } = await supabase.storage.from("directory-documents").createSignedUrl(x.storage_path, 300);
    return { ...x, url: data?.signedUrl ?? null };
  }));
  const isOwner = membership.member_role === "owner";
  const editable = c.status !== "suspended";
  const docsEditable = isOwner && (c.status === "pending" || c.status === "rejected");
  const status = REVIEW_STATUS[c.status];
  const ageDays = (Date.now() - new Date(c.confirmed_at).getTime()) / 86_400_000;
  const freshness: DirectoryFreshness = ageDays <= settings.directory_fresh_days ? "fresh" : ageDays <= settings.directory_stale_days ? "to_confirm" : "stale";
  const toAccept = (sites ?? []).filter((x) => !x.clinic_accepted);
  const members = (team as Member[]) ?? [];

  return (
    <div className="container-page space-y-6 py-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link prefetch={false} href="/clinique" className="text-sm text-muted-foreground hover:underline">Mes établissements</Link>
          <h1 className="text-2xl font-bold text-brand-deep">{c.name}</h1>
          <Badge className={cn("mt-1", status.className)}>{status.label}</Badge>
        </div>
        <Link prefetch={false} href={`/cliniques/${c.id}`} className={cn(buttonVariants({ variant: "outline" }))}><Eye aria-hidden /> Voir la fiche publique</Link>
      </header>
      {sp.inscrite && <Alert tone="success" title="Demande enregistrée">Étape suivante : déposez vos justificatifs ci-dessous pour permettre la vérification.</Alert>}
      {toAccept.length > 0 && <Alert tone="info" title={`${toAccept.length} médecin(s) demande(nt) à être rattaché(s) à l'établissement`}>Vérifiez puis acceptez leur planning dans la section « Médecins ».</Alert>}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Informations à jour ?</CardTitle><CardDescription>À confirmer au moins tous les {settings.directory_fresh_days} jours.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <DirectoryFreshnessBadge freshness={freshness} confirmedAt={c.confirmed_at} />
            {editable && (
              <ActionForm action={confirmClinicInfo}>
                <input type="hidden" name="clinic_id" value={c.id} />
                <SubmitButton size="sm" variant="secondary"><CheckCircle2 aria-hidden /> Les informations sont exactes</SubmitButton>
              </ActionForm>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Vérification</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {(history ?? []).slice(0, 4).map((h) => (
                <li key={h.id}><span className="font-medium">{REVIEW_STATUS[h.decision]?.label}</span> · {formatDateTime(h.created_at)}{h.reason ? <span className="block text-muted-foreground">{h.reason}</span> : null}</li>
              ))}
            </ul>
            {c.status === "rejected" && isOwner && (
              <form action={resubmitClinic} className="mt-3"><input type="hidden" name="clinic_id" value={c.id} /><Button type="submit" size="sm">Soumettre à nouveau après corrections</Button></form>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0 space-y-6">
          <Card id="medecins">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Stethoscope className="size-5" aria-hidden /> Médecins</CardTitle>
              <CardDescription>Un planning est publié quand le médecin et l&apos;établissement l&apos;ont accepté.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {(sites ?? []).length === 0 && <p className="text-sm text-muted-foreground">Aucun médecin rattaché pour le moment.</p>}
              {(sites ?? []).map((x) => {
                const d = one(x.doctors);
                const state = x.doctor_accepted && x.clinic_accepted
                  ? d?.status === "verified" && c.status === "verified" ? { l: "Publié", c: "border-emerald-200 bg-emerald-50 text-emerald-800" }
                    : { l: "Accepté : publié après vérification", c: "border-emerald-200 bg-white text-emerald-800" }
                  : !x.clinic_accepted ? { l: "Demande du médecin : à accepter", c: "border-sky-200 bg-brand-sky text-brand-blue" }
                  : { l: "En attente du médecin", c: "border-amber-200 bg-amber-50 text-amber-900" };
                return (
                  <div key={x.id} className="rounded-lg border p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="font-semibold">{d?.title} {d?.display_name}{d?.status !== "verified" ? <span className="ml-1 text-xs font-normal text-muted-foreground">(médecin pas encore vérifié)</span> : null}</p>
                      <Badge className={state.c}>{state.l}</Badge>
                    </div>
                    <div className="mt-2"><ScheduleTable schedule={x.schedule as Schedule} compact /></div>
                    {x.appointment_phone && <p className="mt-1 text-xs">Rendez-vous : {formatPhone(x.appointment_phone)}</p>}
                    <div className="mt-2 flex flex-wrap gap-2">
                      {!x.clinic_accepted && editable && <form action={acceptSite}><input type="hidden" name="site_id" value={x.id} /><Button type="submit" size="sm">Accepter</Button></form>}
                      <form action={removeSite}><input type="hidden" name="site_id" value={x.id} /><Button type="submit" size="sm" variant="outline">{x.clinic_accepted ? "Retirer" : "Refuser"}</Button></form>
                    </div>
                    {editable && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-sm font-semibold text-brand-blue">Modifier le planning</summary>
                        <ActionForm action={updateSite} className="mt-2 space-y-3">
                          <input type="hidden" name="site_id" value={x.id} />
                          <ScheduleFields value={x.schedule as Schedule} idPrefix={`s-${x.id.slice(0, 6)}`} legend="Jours et horaires" />
                          <Field label="Téléphone de rendez-vous (facultatif)" htmlFor={`ph-${x.id}`}><Input id={`ph-${x.id}`} name="appointment_phone" type="tel" defaultValue={formatPhone(x.appointment_phone)} /></Field>
                          <SubmitButton size="sm">Enregistrer</SubmitButton>
                        </ActionForm>
                      </details>
                    )}
                  </div>
                );
              })}

              {editable && (
                <div className="rounded-lg border border-dashed p-3">
                  <p className="font-semibold">Inviter un médecin déjà vérifié</p>
                  <form method="get" className="mt-2 flex gap-2" role="search">
                    <label htmlFor="medecin" className="sr-only">Nom du médecin</label>
                    <Input id="medecin" name="medecin" placeholder="Nom du médecin" defaultValue={q} minLength={2} maxLength={80} />
                    <Button type="submit" variant="secondary"><Search aria-hidden /> Chercher</Button>
                  </form>
                  {q.length >= 2 && candidates.length === 0 && <p className="mt-2 text-sm text-muted-foreground">Aucun médecin vérifié trouvé. Le médecin doit d&apos;abord <Link prefetch={false} href="/medecin/inscription" className="underline">référencer sa pratique</Link>.</p>}
                  <ul className="mt-3 space-y-3">
                    {candidates.map((d) => (
                      <li key={d.doctor_id} className="rounded-lg bg-muted/50 p-3">
                        <p className="font-medium">{d.title} {d.display_name} <span className="text-sm text-brand-blue">{d.specialties}</span></p>
                        <details className="mt-1">
                          <summary className="cursor-pointer text-sm font-semibold text-brand-blue">Proposer un planning</summary>
                          <ActionForm action={inviteDoctor} className="mt-2 space-y-3">
                            <input type="hidden" name="clinic_id" value={c.id} />
                            <input type="hidden" name="doctor_id" value={d.doctor_id} />
                            <ScheduleFields idPrefix={`i-${d.doctor_id.slice(0, 6)}`} legend="Jours et horaires de consultation" />
                            <Field label="Téléphone de rendez-vous (facultatif)" htmlFor={`iph-${d.doctor_id}`}><Input id={`iph-${d.doctor_id}`} name="appointment_phone" type="tel" /></Field>
                            <SubmitButton size="sm">Envoyer l&apos;invitation</SubmitButton>
                          </ActionForm>
                        </details>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Informations de l&apos;établissement</CardTitle></CardHeader>
            <CardContent>
              {editable ? (
                <ActionForm action={updateClinic} className="space-y-6" labels={CLINIC_LABELS}>
                  <input type="hidden" name="clinic_id" value={c.id} />
                  <ClinicFormFields geo={geo} v={{ ...c, ...(priv ?? {}) }} />
                  <SubmitButton>Enregistrer les modifications</SubmitButton>
                </ActionForm>
              ) : <Alert tone="warning" title="Établissement suspendu : modification impossible. Contactez l'équipe PharmaProxi." />}
            </CardContent>
          </Card>
        </div>

        <div className="min-w-0 space-y-6">
          <Card id="justificatifs">
            <CardHeader><CardTitle>Justificatifs</CardTitle><CardDescription>Stockage privé : seuls l&apos;équipe de l&apos;établissement et les vérificateurs y ont accès.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              {!links.length ? <p className="text-sm text-muted-foreground">Aucun document déposé.</p> : (
                <ul className="divide-y text-sm">
                  {links.map((x) => (
                    <li key={x.id} className="flex items-center justify-between gap-2 py-2">
                      <span className="flex items-center gap-2"><FileText className="size-4" aria-hidden />
                        {x.url ? <a href={x.url} target="_blank" rel="noopener noreferrer" className="underline">{CLINIC_DOC_LABELS[x.doc_type]}</a> : CLINIC_DOC_LABELS[x.doc_type]}
                      </span>
                      {docsEditable && <form action={deleteDirectoryDocument}><input type="hidden" name="document_id" value={x.id} /><input type="hidden" name="kind" value="clinic" />
                        <button className="rounded p-2 text-destructive hover:bg-red-50" aria-label="Supprimer le document"><Trash2 className="size-4" /></button></form>}
                    </li>
                  ))}
                </ul>
              )}
              {!isOwner && <p className="text-xs text-muted-foreground">Seul le responsable de l&apos;établissement peut déposer ou retirer des justificatifs.</p>}
              {isOwner && editable && (
                <ActionForm action={uploadClinicDocument} resetOnSuccess className="space-y-3">
                  <input type="hidden" name="clinic_id" value={c.id} />
                  <Field label="Type de document" htmlFor="doc_type" required>
                    <Select id="doc_type" name="doc_type" required>{Object.entries(CLINIC_DOC_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
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
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Users className="size-5" aria-hidden /> Équipe</CardTitle>
              <CardDescription>Le secrétariat tient les plannings à jour. Seul le responsable gère l&apos;équipe et les justificatifs.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="divide-y text-sm">
                {members.map((m) => (
                  <li key={m.user_id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span>
                      <span className="font-medium">{m.full_name ?? m.email}</span> <Badge className="bg-white">{m.member_role === "owner" ? "Responsable" : "Équipe"}</Badge>
                      <span className="block text-xs text-muted-foreground">{m.email} · depuis le {formatDate(m.created_at)}</span>
                    </span>
                    {isOwner && editable && m.member_role !== "owner" && (
                      <form action={clinicRemoveMember}><input type="hidden" name="clinic_id" value={c.id} /><input type="hidden" name="user_id" value={m.user_id} />
                        <Button type="submit" size="sm" variant="outline">Retirer</Button></form>
                    )}
                  </li>
                ))}
              </ul>
              {isOwner && editable && (
                <ActionForm action={clinicAddMember} resetOnSuccess className="flex flex-col gap-2 sm:flex-row sm:items-end">
                  <input type="hidden" name="clinic_id" value={c.id} />
                  <Field label="Ajouter un membre (e-mail de son compte PharmaProxi)" htmlFor="team-email" className="flex-1"><Input id="team-email" name="email" type="email" required autoComplete="off" /></Field>
                  <SubmitButton variant="secondary">Ajouter</SubmitButton>
                </ActionForm>
              )}
            </CardContent>
          </Card>

          {(reports ?? []).length > 0 && (
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Flag className="size-5" aria-hidden /> Signalements en cours</CardTitle></CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  {(reports ?? []).map((r) => <li key={r.id}><span className="font-medium">{r.reason.replaceAll("_", " ")}</span> · {formatDateTime(r.created_at)}{r.description ? <span className="block text-muted-foreground">{r.description}</span> : null}</li>)}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
