import Link from "next/link";
import { FileText, Lock } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { deleteLabResult } from "@/app/actions/health-files";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Mes résultats d'analyses" };
export const dynamic = "force-dynamic";

export default async function MyResults() {
  await requireUser("/compte/resultats");
  const supabase = await createClient();
  const { data } = await supabase.from("lab_results").select("id, file_name, mime, note, created_at, first_opened_at, facility_listings(name), home_sampling_requests(patient_name)").order("created_at", { ascending: false }).limit(100);
  type One<T> = T | T[] | null;
  const one = <T,>(v: One<T>) => (Array.isArray(v) ? v[0] : v) ?? null;
  return (
    <div className="container-page max-w-3xl space-y-4 py-6">
      <h1 className="flex items-center gap-2 text-2xl font-bold text-brand-deep"><FileText className="size-7 text-primary" aria-hidden /> Mes résultats d&apos;analyses</h1>
      <p className="flex items-start gap-2 rounded-xl bg-brand-mint p-3 text-sm text-brand-deep"><Lock className="mt-0.5 size-4 shrink-0" aria-hidden />Les résultats envoyés par votre laboratoire sont chiffrés et visibles seulement par vous et ce laboratoire. Aucune intelligence artificielle ne les lit. Faites-les toujours interpréter par votre médecin.</p>
      {(data ?? []).length === 0 ? <p className="rounded-xl border bg-white p-4 text-sm text-muted-foreground">Aucun résultat pour le moment. Lors d&apos;une demande de <Link prefetch={false} href="/laboratoires/domicile" className="text-primary underline">prise de sang</Link> ou d&apos;un rendez-vous au laboratoire, cochez « J&apos;accepte de recevoir les résultats sur SantéProxi » si le laboratoire le propose.</p> : (
        <ul className="space-y-3">{(data ?? []).map((r) => (
          <li key={r.id} className="space-y-1 rounded-2xl border bg-white p-4 text-sm">
            <p className="font-bold text-brand-deep">{one(r.facility_listings as One<{ name: string }>)?.name}{!r.first_opened_at && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">Nouveau</span>}</p>
            <p className="text-muted-foreground">Pour {one(r.home_sampling_requests as One<{ patient_name: string }>)?.patient_name} · reçu le {formatDateTime(r.created_at)}</p>
            {r.note && <p>Message du laboratoire : {r.note}</p>}
            <div className="flex flex-wrap gap-2 pt-1">
              <a href={`/compte/resultats/${r.id}/fichier`} target="_blank" rel="noopener" className="rounded-xl bg-primary px-4 py-2 font-semibold text-white">Ouvrir le résultat</a>
              <ActionForm action={deleteLabResult}><input type="hidden" name="id" value={r.id} /><SubmitButton size="sm" variant="outline" confirm="Supprimer définitivement ce résultat de SantéProxi ?">Supprimer</SubmitButton></ActionForm>
            </div>
          </li>))}</ul>
      )}
    </div>
  );
}
