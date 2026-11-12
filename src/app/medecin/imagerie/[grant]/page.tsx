import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ImagingViewer } from "@/components/imaging/dicom-viewer";
import { MODALITY } from "@/lib/imaging";
import { formatDate, formatDateTime } from "@/lib/format";

export const metadata = { title: "Examen partagé", robots: { index: false } };
export const dynamic = "force-dynamic";

type Row = { grant_id: string; reference: string; patient: string; title: string; modality: string | null; body_part: string | null; doc_date: string | null; facility_name: string | null; mime: string; purpose: string | null; expires_at: string };

export default async function SharedStudy({ params }: { params: Promise<{ grant: string }> }) {
  const { grant } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(grant)) notFound();
  const s = await requireUser(`/medecin/imagerie/${grant}`);
  if (!s.doctor) redirect("/medecin/inscription");
  const supabase = await createClient();
  const { data } = await supabase.rpc("imaging_shared_with_me");
  const r = ((data ?? []) as Row[]).find((x) => x.grant_id === grant);
  if (!r) return (
    <div className="container-page max-w-3xl space-y-3 py-6">
      <p className="text-sm"><Link prefetch={false} href="/medecin/imagerie" className="text-primary underline">← Examens partagés</Link></p>
      <p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm">Cet accès a expiré ou a été retiré par le patient.</p>
    </div>
  );
  return (
    <div className="container-page max-w-5xl space-y-4 py-6">
      <p className="text-sm"><Link prefetch={false} href="/medecin/imagerie" className="text-primary underline">← Examens partagés</Link></p>
      <h1 className="text-2xl font-bold">{r.title}</h1>
      <p className="text-sm text-muted-foreground">{[r.patient, r.reference, r.modality ? MODALITY[r.modality] : null, r.body_part, r.doc_date ? formatDate(r.doc_date) : null, r.facility_name].filter(Boolean).join(" · ")}</p>
      <p className="rounded-xl bg-muted/50 p-3 text-xs">Accès accordé par le patient jusqu&apos;au {formatDateTime(r.expires_at)}{r.purpose ? ` — motif : ${r.purpose}` : ""}. Cette ouverture est enregistrée et le patient en est prévenu. N&apos;enregistrez pas de copie hors du dossier médical de votre structure.</p>
      <ImagingViewer src={`/medecin/imagerie/${r.grant_id}/fichier`} mime={r.mime} title={r.title} />
    </div>
  );
}
