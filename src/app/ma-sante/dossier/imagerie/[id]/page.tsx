import Link from "next/link";
import { notFound } from "next/navigation";
import { dossierContext } from "@/lib/dossier/server";
import { DossierGate } from "@/components/dossier/shell";
import { ImagingViewer } from "@/components/imaging/dicom-viewer";
import { MODALITY } from "@/lib/imaging";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Examen d'imagerie", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function Examen({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await dossierContext(undefined, `/ma-sante/dossier/imagerie/${id}`);
  if (ctx.locked) return <DossierGate status={ctx.status} path={`/ma-sante/dossier/imagerie/${id}`} />;
  const { data: d } = await ctx.supabase.from("record_documents").select("id, title, mime, modality, body_part, doc_date, facility_name").eq("id", id).maybeSingle();
  if (!d) notFound();
  return (
    <div className="container-page max-w-5xl space-y-4 py-6">
      <p className="text-sm"><Link prefetch={false} href="/ma-sante/dossier/imagerie" className="text-primary underline">← Mon imagerie</Link></p>
      <h1 className="text-2xl font-bold">{d.title}</h1>
      <p className="text-sm text-muted-foreground">{[d.modality ? MODALITY[d.modality] : null, d.body_part, d.doc_date ? formatDate(d.doc_date) : null, d.facility_name].filter(Boolean).join(" · ") || "Informations non renseignées"}</p>
      <ImagingViewer src={`/ma-sante/dossier/documents/${d.id}`} mime={d.mime} title={d.title} />
    </div>
  );
}
