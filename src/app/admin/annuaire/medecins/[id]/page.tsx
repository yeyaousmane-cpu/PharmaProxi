import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { reviewDoctor } from "@/app/actions/directory";
import { InfoList, ReviewDecision, ReviewDocuments, ReviewHistory } from "@/components/directory/review-panel";
import { ScheduleTable } from "@/components/directory/directory-bits";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DOCTOR_CHECKS, DOCTOR_DOC_LABELS, LANGUAGES, REVIEW_STATUS, type Schedule } from "@/lib/directory";
import { formatDate, formatDateTime, formatPhone } from "@/lib/format";

export const metadata = { title: "Vérification d'un médecin" };
const one = <T,>(v: T | T[] | null | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

export default async function ReviewDoctorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const [{ data: d }, { data: priv }, { data: docs }, { data: hist }, { data: sites }, { data: reports }] = await Promise.all([
    supabase.from("doctors").select("*, doctor_specialties(medical_specialties(name))").eq("id", id).maybeSingle(),
    supabase.from("doctor_private").select("*").eq("doctor_id", id).maybeSingle(),
    supabase.from("doctor_documents").select("id, doc_type, file_name, storage_path, created_at").eq("doctor_id", id),
    supabase.from("directory_verifications").select("id, decision, reason, created_at").eq("doctor_id", id).order("created_at", { ascending: false }),
    supabase.from("doctor_practice_sites").select("id, schedule, appointment_phone, doctor_accepted, clinic_accepted, clinics(id, name, status)").eq("doctor_id", id),
    supabase.from("reports").select("id, reason, description, status, created_at").eq("doctor_id", id).order("created_at", { ascending: false }).limit(20),
  ]);
  if (!d) notFound();
  const signed = await Promise.all((docs ?? []).map(async (x) => ({ ...x, url: (await supabase.storage.from("directory-documents").createSignedUrl(x.storage_path, 300)).data?.signedUrl })));
  return (
    <div className="space-y-4">
      <Link prefetch={false} href="/admin/annuaire?vue=medecins" className="text-sm text-primary underline">← Annuaire médical</Link>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold">{d.title} {d.display_name}</h1>
        <Badge className={REVIEW_STATUS[d.status].className}>{REVIEW_STATUS[d.status].label}</Badge>
        {!d.is_published && <Badge className="bg-white">Retirée par le médecin</Badge>}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_400px]">
        <div className="space-y-4">
          <Card><CardHeader><CardTitle>Informations déclarées</CardTitle></CardHeader>
            <CardContent><InfoList rows={[
              ["Spécialités", (d.doctor_specialties ?? []).map((x: { medical_specialties: unknown }) => (one(x.medical_specialties) as { name: string } | null)?.name).filter(Boolean).join(", ")],
              ["N° Ordre des médecins", priv?.order_number], ["Téléphone personnel", formatPhone(priv?.personal_phone)],
              ["Genre", d.gender === "F" ? "Femme" : d.gender === "M" ? "Homme" : "Non indiqué"],
              ["Langues", (d.languages as string[]).map((l) => LANGUAGES[l] ?? l).join(", ")],
              ["Accord de publication", formatDateTime(d.publication_consent_at)], ["Dernière confirmation", formatDate(d.confirmed_at)],
              ["Demande du", formatDateTime(d.created_at)],
            ]} /></CardContent></Card>
          <ReviewDocuments docs={signed} labels={DOCTOR_DOC_LABELS} />
          <Card><CardHeader><CardTitle>Lieux d&apos;exercice déclarés</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {!(sites ?? []).length ? <p className="text-sm text-muted-foreground">Aucun lieu déclaré (point de contrôle « lieu » non satisfait).</p> : (sites ?? []).map((x) => {
                const c = one(x.clinics);
                return (
                  <div key={x.id} className="rounded-lg border p-3 text-sm">
                    <p className="font-medium"><Link prefetch={false} href={`/admin/annuaire/cliniques/${c?.id}`} className="underline">{c?.name}</Link> <span className="text-xs text-muted-foreground">({REVIEW_STATUS[c?.status ?? "pending"]?.label}) · {x.doctor_accepted && x.clinic_accepted ? "accepté des deux côtés" : "en attente d'acceptation"}</span></p>
                    <ScheduleTable schedule={x.schedule as Schedule} compact />
                    {x.appointment_phone && <p className="text-xs">Rendez-vous : {formatPhone(x.appointment_phone)}</p>}
                  </div>
                );
              })}
            </CardContent></Card>
          {(reports ?? []).length > 0 && (
            <Card><CardHeader><CardTitle>Signalements</CardTitle></CardHeader>
              <CardContent><ul className="space-y-2 text-sm">{(reports ?? []).map((r) => <li key={r.id}><strong>{r.reason.replaceAll("_", " ")}</strong> · {r.status} · {formatDateTime(r.created_at)}{r.description ? <span className="block text-muted-foreground">{r.description}</span> : null}</li>)}</ul>
                <Link prefetch={false} href="/admin/signalements" className="mt-2 inline-block text-sm text-primary underline">Traiter dans « Signalements »</Link></CardContent></Card>
          )}
        </div>
        <div className="space-y-4">
          <ReviewDecision action={reviewDoctor} idName="doctor_id" id={d.id} status={d.status} checks={DOCTOR_CHECKS} audience="le médecin" />
          <ReviewHistory items={hist ?? []} />
          <Link prefetch={false} href={`/medecins/${d.id}`} className="text-sm text-primary underline">Aperçu de la fiche publique</Link>
        </div>
      </div>
    </div>
  );
}
