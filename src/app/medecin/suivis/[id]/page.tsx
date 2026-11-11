import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Textarea } from "@/components/ui/input";
import { addFollowNote, setFollowStatus } from "@/app/actions/v028";
import { measureValue, type Measure } from "@/lib/passeport";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Suivi d'un patient" };
export const dynamic = "force-dynamic";

export default async function SuiviPatient({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await requireUser(`/medecin/suivis/${id}`);
  if (!s.doctor) redirect("/medecin/inscription");
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("care_patient_data", { p_id: id });
  if (error) return <div className="container-page max-w-3xl py-6"><p role="alert" className="rounded-xl bg-amber-50 p-4 text-amber-950">Ce suivi n&apos;est pas actif ou ne vous est pas destiné.</p><p className="mt-3 text-sm"><Link prefetch={false} href="/medecin/suivis" className="text-primary underline">← Patients suivis</Link></p></div>;
  const d = data as { patient: string; reason: string | null; mesures: Measure[]; traitements: { nom: string; indication: string | null }[] };
  const { data: notes } = await supabase.from("care_notes").select("id, body, created_at").eq("follow_id", id).order("created_at", { ascending: false });
  return (
    <div className="container-page max-w-4xl space-y-5 py-6">
      <p className="text-sm"><Link prefetch={false} href="/medecin/suivis" className="text-primary underline">← Patients suivis</Link></p>
      <h1 className="text-2xl font-bold">{d.patient}</h1>
      {d.reason && <p className="text-sm text-muted-foreground">Motif indiqué par le patient : {d.reason}</p>}
      <p className="rounded-xl bg-muted/50 p-3 text-sm">Mesures notées par le patient lui-même, affichées telles quelles : SantéProxi ne les vérifie pas et ne les interprète pas. Votre consultation est visible par le patient.</p>
      <section className="rounded-2xl border bg-white p-4"><h2 className="font-bold">Mesures (90 dernières)</h2>
        {d.mesures.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">Aucune mesure notée.</p> : (
          <div className="mt-2 overflow-x-auto"><table className="w-full min-w-[420px] text-sm"><thead><tr className="border-b text-xs text-muted-foreground"><th className="p-2 text-start">Date</th><th className="p-2 text-start">Type</th><th className="p-2 text-start">Valeur</th><th className="p-2 text-start">Note du patient</th></tr></thead>
            <tbody>{d.mesures.map((m, i) => <tr key={i} className="border-b last:border-0"><td className="whitespace-nowrap p-2">{formatDateTime(m.measured_at)}</td><td className="p-2">{m.kind === "tension" ? "Tension" : "Glycémie"}</td><td className="p-2 font-semibold" dir="ltr">{measureValue(m)}</td><td className="p-2 text-muted-foreground">{m.note ?? ""}</td></tr>)}</tbody></table></div>)}
      </section>
      {d.traitements.length > 0 && <section className="rounded-2xl border bg-white p-4"><h2 className="font-bold">Traitements déclarés par le patient</h2><ul className="mt-2 list-disc ps-5 text-sm">{d.traitements.map((t) => <li key={t.nom}>{t.nom}{t.indication ? ` — ${t.indication}` : ""}</li>)}</ul></section>}
      <section className="space-y-3 rounded-2xl border bg-white p-4"><h2 className="font-bold">Notes au patient</h2>
        <ActionForm action={addFollowNote} className="space-y-2"><input type="hidden" name="id" value={id} />
          <label htmlFor="note" className="sr-only">Nouvelle note</label><Textarea id="note" name="body" rows={3} maxLength={2000} required placeholder="Message visible par le patient" /><SubmitButton size="sm">Envoyer la note</SubmitButton></ActionForm>
        <ul className="space-y-1 text-sm">{(notes ?? []).map((n) => <li key={n.id} className="rounded-lg bg-muted/50 p-2"><span className="text-xs text-muted-foreground">{formatDateTime(n.created_at)}</span><br />{n.body}</li>)}</ul>
      </section>
      <ActionForm action={setFollowStatus}><input type="hidden" name="id" value={id} /><input type="hidden" name="status" value="termine" /><SubmitButton size="sm" variant="outline" confirm="Mettre fin à ce suivi ? Vous n'aurez plus accès aux mesures de ce patient.">Mettre fin au suivi</SubmitButton></ActionForm>
    </div>
  );
}
