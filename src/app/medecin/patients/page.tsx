import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Patients qui m'ont désigné comme médecin traitant" };
export const dynamic = "force-dynamic";

export default async function Patients() {
  const s = await requireUser("/medecin/patients");
  if (!s.doctor) redirect("/medecin/inscription");
  const supabase = await createClient();
  const { data } = await supabase.rpc("treating_doctor_patients");
  const rows = (data ?? []) as { patient_name: string; since: string | null; designated_at: string }[];
  return (
    <div className="container-page max-w-3xl space-y-4 py-6">
      <p className="text-sm"><Link prefetch={false} href="/medecin" className="text-primary underline">← Espace médecin</Link></p>
      <h1 className="text-2xl font-bold">Patients qui m&apos;ont désigné comme médecin traitant</h1>
      <p className="text-sm text-muted-foreground">Seuls les patients qui ont choisi de vous prévenir apparaissent, avec leur nom uniquement : cette désignation ne vous donne accès à aucune donnée de santé. Pour suivre des mesures, le patient doit vous le demander séparément (« Patients suivis »).</p>
      {rows.length === 0 ? <p className="rounded-xl border bg-white p-4 text-sm text-muted-foreground">Aucun patient pour le moment.</p> : (
        <ul className="divide-y rounded-xl border bg-white text-sm">{rows.map((r, i) => <li key={i} className="p-3"><span className="font-semibold">{r.patient_name}</span> <span className="text-muted-foreground">· désigné le {formatDate(r.designated_at)}{r.since ? ` · suivi depuis le ${formatDate(r.since)}` : ""}</span></li>)}</ul>
      )}
    </div>
  );
}
