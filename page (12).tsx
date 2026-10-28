import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { reviewClinic } from "@/app/actions/directory";
import { InfoList, ReviewDecision, ReviewDocuments, ReviewHistory } from "@/components/directory/review-panel";
import { OpeningHours } from "@/components/opening-hours";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CLINIC_CHECKS, CLINIC_DOC_LABELS, CLINIC_KINDS, CLINIC_SERVICES, REVIEW_STATUS } from "@/lib/directory";
import { formatDate, formatDateTime, formatPhone } from "@/lib/format";

export const metadata = { title: "Vérification d'un établissement" };
const one = <T,>(v: T | T[] | null | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

export default async function ReviewClinicPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const [{ data: c }, { data: priv }, { data: docs }, { data: hist }, { data: sites }, { data: team }] = await Promise.all([
    supabase.from("clinics").select("*, regions(name), communes(name), localities(name)").eq("id", id).maybeSingle(),
    supabase.from("clinic_private").select("*").eq("clinic_id", id).maybeSingle(),
    supabase.from("clinic_documents").select("id, doc_type, file_name, storage_path, created_at").eq("clinic_id", id),
    supabase.from("directory_verifications").select("id, decision, reason, created_at").eq("clinic_id", id).order("created_at", { ascending: false }),
    supabase.from("doctor_practice_sites").select("id, doctor_accepted, clinic_accepted, doctors(id, title, display_name, status)").eq("clinic_id", id),
    supabase.rpc("clinic_team", { p_clinic: id }),
  ]);
  if (!c) notFound();
  const signed = await Promise.all((docs ?? []).map(async (x) => ({ ...x, url: (await supabase.storage.from("directory-documents").createSignedUrl(x.storage_path, 300)).data?.signedUrl })));
  return (
    <div className="space-y-4">
      <Link prefetch={false} href="/admin/annuaire?vue=cliniques" className="text-sm text-primary underline">← Annuaire médical</Link>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold">{c.name}</h1>
        <Badge className={REVIEW_STATUS[c.status].className}>{REVIEW_STATUS[c.status].label}</Badge>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_400px]">
        <div className="space-y-4">
          <Card><CardHeader><CardTitle>Informations déclarées</CardTitle></CardHeader>
            <CardContent><InfoList rows={[
              ["Type", CLINIC_KINDS[c.kind]],
              ["Adresse", `${c.address} — ${[one(c.localities)?.name, one(c.communes)?.name, one(c.regions)?.name].filter(Boolean).join(", ")}`],
              ["Coordonnées GPS", c.latitude !== null ? `${c.latitude}, ${c.longitude}` : "Non renseignées"],
              ["Téléphone", formatPhone(c.phone)], ["WhatsApp", formatPhone(c.whatsapp)], ["E-mail", c.email],
              ["Urgences 24 h/24", c.emergency_24h ? "Oui" : "Non"], ["Services", (c.services as string[]).map((s) => CLINIC_SERVICES[s] ?? s).join(", ")],
              ["Responsable", priv?.manager_name], ["Téléphone du responsable", formatPhone(priv?.manager_phone)], ["Raison sociale", priv?.legal_name],
              ["N° autorisation", priv?.license_number], ["RCCM", priv?.rccm], ["NIF", priv?.tax_id],
              ["Équipe", `${(team as unknown[] | null)?.length ?? 0} compte(s)`], ["Dernière confirmation", formatDate(c.confirmed_at)], ["Demande du", formatDateTime(c.created_at)],
            ]} /></CardContent></Card>
          <ReviewDocuments docs={signed} labels={CLINIC_DOC_LABELS} />
          <Card><CardHeader><CardTitle>Horaires d&apos;accueil</CardTitle></CardHeader><CardContent><OpeningHours hours={c.opening_hours} verified={false} /></CardContent></Card>
          <Card><CardHeader><CardTitle>Médecins rattachés</CardTitle></CardHeader>
            <CardContent>{!(sites ?? []).length ? <p className="text-sm text-muted-foreground">Aucun.</p> : (
              <ul className="space-y-1 text-sm">{(sites ?? []).map((x) => { const d = one(x.doctors); return (
                <li key={x.id}><Link prefetch={false} href={`/admin/annuaire/medecins/${d?.id}`} className="underline">{d?.title} {d?.display_name}</Link> <span className="text-xs text-muted-foreground">({REVIEW_STATUS[d?.status ?? "pending"]?.label} · {x.doctor_accepted && x.clinic_accepted ? "publié" : "en attente"})</span></li>
              ); })}</ul>)}
            </CardContent></Card>
        </div>
        <div className="space-y-4">
          <ReviewDecision action={reviewClinic} idName="clinic_id" id={c.id} status={c.status} checks={CLINIC_CHECKS} audience="l'établissement" />
          <ReviewHistory items={hist ?? []} />
          <Link prefetch={false} href={`/cliniques/${c.id}`} className="text-sm text-primary underline">Aperçu de la fiche publique</Link>
        </div>
      </div>
    </div>
  );
}
