import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Field, Input, Textarea } from "@/components/ui/input";
import { requestHomeCare } from "@/app/actions/v031";
import { CARE_TYPES } from "@/lib/nurses";
import { SLOTS } from "@/lib/nurse-space";

export const metadata = { title: "Demander des soins à domicile" };
export const dynamic = "force-dynamic";

export default async function Demande({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const s = await requireUser(`/infirmiers/demande/${id}`);
  const supabase = await createClient();
  const { data: n } = await supabase.from("nurse_accounts").select("id, display_name, specialty, areas, care_types, accepts_requests").eq("id", id).eq("is_published", true).maybeSingle();
  if (!n) notFound();
  const { data: prof } = await supabase.from("profiles").select("phone").eq("id", s.userId).maybeSingle();
  const tomorrow = new Date(Date.now() + 86400_000).toISOString().slice(0, 10);
  const max = new Date(Date.now() + 60 * 86400_000).toISOString().slice(0, 10);
  const care = (n.care_types as string[]).length ? (n.care_types as string[]) : Object.keys(CARE_TYPES);
  return (
    <div className="container-page max-w-2xl space-y-4 py-6">
      <p className="text-sm"><Link prefetch={false} href="/infirmiers" className="text-primary underline">← Infirmiers et soins à domicile</Link></p>
      <h1 className="text-2xl font-bold">Demander des soins à domicile</h1>
      <p className="text-sm">À <strong>{n.display_name}</strong>{n.specialty ? ` (${n.specialty})` : ""}{n.areas ? ` · se déplace : ${n.areas}` : ""}</p>
      <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-950">En cas d&apos;urgence, n&apos;utilisez pas ce formulaire : <Link prefetch={false} href="/sos" className="font-semibold underline">appelez les secours</Link>. La demande n&apos;est confirmée que lorsque l&apos;infirmier l&apos;accepte ; vous êtes prévenu(e) dans votre espace.</p>
      {!n.accepts_requests ? <p className="rounded-xl border bg-white p-4 text-sm">Cet infirmier ne prend pas de nouvelles demandes en ligne pour le moment.</p> : (
        <ActionForm action={requestHomeCare} className="space-y-3 rounded-2xl border bg-white p-4" labels={{ contact_phone: "Téléphone", area: "Quartier" }}>
          <input type="hidden" name="nurse_id" value={n.id} />
          <Field label="Type de soin" htmlFor="ct" required><select id="ct" name="care_type" required className="h-11 w-full rounded-lg border bg-white px-2">{care.map((c) => <option key={c} value={c}>{CARE_TYPES[c]}</option>)}</select></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Date souhaitée" htmlFor="dt" required><Input id="dt" type="date" name="preferred_date" min={tomorrow} max={max} defaultValue={tomorrow} required /></Field>
            <Field label="Moment" htmlFor="sl" required><select id="sl" name="preferred_slot" className="h-11 w-full rounded-lg border bg-white px-2">{Object.entries(SLOTS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          </div>
          <Field label="Quartier où auront lieu les soins" htmlFor="ar" required><Input id="ar" name="area" required maxLength={160} placeholder="ex. Hamdallaye, près de la mosquée" /></Field>
          <Field label="Téléphone pour vous rappeler" htmlFor="tel" required><Input id="tel" name="contact_phone" type="tel" required defaultValue={(prof?.phone as string | null) ?? ""} dir="ltr" /></Field>
          <Field label="Précisions utiles (facultatif)" htmlFor="ms" hint="Évitez les détails médicaux inutiles : l'infirmier en parlera avec vous."><Textarea id="ms" name="message" rows={3} maxLength={500} /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="has_prescription" className="size-4" /> J&apos;ai une ordonnance pour ces soins</label>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="accord" className="mt-1 size-4" required /><span>J&apos;accepte de transmettre cette demande et mon numéro à cet infirmier, et à lui seul.</span></label>
          <SubmitButton>Envoyer la demande</SubmitButton>
        </ActionForm>
      )}
    </div>
  );
}
