import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { MODALITY, mimeLabel } from "@/lib/imaging";
import { formatDate, formatDateTime } from "@/lib/format";

export const metadata = { title: "Examens partagés avec moi" };
export const dynamic = "force-dynamic";

type Row = { grant_id: string; reference: string; patient: string; title: string; doc_kind: string; modality: string | null; body_part: string | null; doc_date: string | null; facility_name: string | null; mime: string; purpose: string | null; expires_at: string; views: number };

export default async function Shared() {
  const s = await requireUser("/medecin/imagerie");
  if (!s.doctor) redirect("/medecin/inscription");
  const supabase = await createClient();
  const [{ data: me }, { data }] = await Promise.all([
    supabase.from("doctors").select("public_code, status").eq("id", s.doctor.id).single(),
    supabase.rpc("imaging_shared_with_me"),
  ]);
  const rows = (data ?? []) as Row[];
  return (
    <div className="container-page max-w-3xl space-y-4 py-6">
      <p className="text-sm"><Link prefetch={false} href="/medecin" className="text-primary underline">← Espace médecin</Link></p>
      <h1 className="text-2xl font-bold">Examens d&apos;imagerie partagés avec moi</h1>
      <div className="rounded-xl border bg-white p-4 text-sm">
        <p>Votre code à communiquer au patient : <strong className="font-mono text-base">{me?.public_code ?? "—"}</strong></p>
        {me?.status !== "verified" ? <p className="mt-1 text-amber-900">Votre inscription n&apos;est pas encore vérifiée : aucun patient ne peut vous partager d&apos;examen avant la vérification.</p> : null}
        <p className="mt-1 text-xs text-muted-foreground">Le patient choisit l&apos;examen et la durée. Vous ne voyez que les examens partagés, rien d&apos;autre de son dossier. Chaque ouverture est enregistrée et le patient en est prévenu ; il peut retirer l&apos;accès à tout moment.</p>
      </div>
      {rows.length === 0 ? <p className="rounded-xl border bg-white p-4 text-sm text-muted-foreground">Aucun examen partagé en cours.</p> : (
        <ul className="divide-y rounded-xl border bg-white text-sm">{rows.map((r) => (
          <li key={r.grant_id} className="flex flex-wrap items-center justify-between gap-2 p-3">
            <span><Link prefetch={false} href={`/medecin/imagerie/${r.grant_id}`} className="font-semibold text-primary underline">{r.title}</Link> <span className="text-muted-foreground">· {r.patient}</span>
              <span className="block text-xs text-muted-foreground">{[r.reference, r.modality ? MODALITY[r.modality] : null, r.body_part, r.doc_date ? formatDate(r.doc_date) : null, mimeLabel(r.mime), `accès jusqu'au ${formatDateTime(r.expires_at)}`].filter(Boolean).join(" · ")}</span>
              {r.purpose ? <span className="block text-xs">Motif : {r.purpose}</span> : null}</span>
            <Link prefetch={false} href={`/medecin/imagerie/${r.grant_id}`} className="rounded-lg border px-3 py-2 text-xs font-semibold">Ouvrir</Link>
          </li>))}</ul>
      )}
    </div>
  );
}
