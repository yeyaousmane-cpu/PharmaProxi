import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { setFollowStatus } from "@/app/actions/v028";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Patients suivis" };
export const dynamic = "force-dynamic";
type Row = { id: string; status: string; reason: string | null; created_at: string; share_treatments: boolean };

export default async function Suivis() {
  const s = await requireUser("/medecin/suivis");
  if (!s.doctor) redirect("/medecin/inscription");
  const supabase = await createClient();
  const { data } = await supabase.from("care_follows").select("id, status, reason, created_at, share_treatments").eq("doctor_id", s.doctor.id).in("status", ["demande", "actif"]).order("created_at", { ascending: false });
  const rows = (data ?? []) as Row[];
  const pending = rows.filter((r) => r.status === "demande"); const active = rows.filter((r) => r.status === "actif");
  return (
    <div className="container-page max-w-4xl space-y-5 py-6">
      <p className="text-sm"><Link prefetch={false} href="/medecin" className="text-primary underline">← Espace médecin</Link></p>
      <h1 className="text-2xl font-bold">Patients suivis</h1>
      <p className="text-sm text-muted-foreground">Des patients vous demandent de suivre les mesures qu&apos;ils notent eux-mêmes (tension, glycémie). Vous ne voyez leurs mesures qu&apos;après avoir accepté ; le patient peut arrêter à tout moment et voit chacune de vos consultations. Les valeurs sont affichées sans interprétation.</p>
      <section className="space-y-2"><h2 className="text-lg font-bold">Demandes à traiter ({pending.length})</h2>
        {pending.length === 0 ? <p className="text-sm text-muted-foreground">Aucune demande en attente.</p> : <ul className="space-y-2">{pending.map((r) => (
          <li key={r.id} className="rounded-xl border bg-white p-3 text-sm"><p>Demande du {formatDateTime(r.created_at)}{r.reason ? ` · motif : ${r.reason}` : ""}</p>
            <div className="mt-2 flex gap-2">
              <ActionForm action={setFollowStatus}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="status" value="actif" /><SubmitButton size="sm">Accepter</SubmitButton></ActionForm>
              <ActionForm action={setFollowStatus}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="status" value="refuse" /><SubmitButton size="sm" variant="outline">Refuser</SubmitButton></ActionForm>
            </div></li>))}</ul>}
      </section>
      <section className="space-y-2"><h2 className="text-lg font-bold">Suivis en cours ({active.length})</h2>
        {active.length === 0 ? <p className="text-sm text-muted-foreground">Aucun suivi en cours.</p> : <ul className="space-y-2">{active.map((r) => (
          <li key={r.id} className="rounded-xl border bg-white p-3 text-sm"><Link prefetch={false} href={`/medecin/suivis/${r.id}`} className="font-semibold text-primary underline">Ouvrir le suivi du {formatDateTime(r.created_at)}</Link>{r.reason ? ` · ${r.reason}` : ""}</li>))}</ul>}
      </section>
    </div>
  );
}
