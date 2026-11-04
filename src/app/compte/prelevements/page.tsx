import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Badge } from "@/components/ui/badge";
import { cancelSampling } from "@/app/actions/labs";
import { SAMPLING_STATUS, SLOT } from "@/lib/labs";
import { formatDate, formatDateTime } from "@/lib/format";

export const metadata = { title: "Mes prises de sang à domicile" };
export const dynamic = "force-dynamic";

export default async function MySamplings() {
  await requireUser("/compte/prelevements");
  const supabase = await createClient();
  const { data } = await supabase.from("home_sampling_requests").select("id, patient_name, preferred_date, slot, status, scheduled_at, lab_note, created_at, facility_listings(name, phone)").order("created_at", { ascending: false }).limit(50);
  type F = { name: string; phone: string | null } | null;
  return (
    <div className="container-page max-w-3xl space-y-4 py-6">
      <h1 className="text-2xl font-bold text-brand-deep">Mes prises de sang à domicile</h1>
      {(data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">Aucune demande. <Link prefetch={false} href="/laboratoires/domicile" className="text-primary underline">Faire une demande</Link></p> : (
        <ul className="space-y-3">{(data ?? []).map((r) => { const f = (Array.isArray(r.facility_listings) ? r.facility_listings[0] : r.facility_listings) as F; return (
          <li key={r.id} className="space-y-1 rounded-2xl border bg-white p-4 text-sm">
            <div className="flex flex-wrap items-center gap-2"><span className="font-bold text-brand-deep">{f?.name}</span><Badge className="bg-muted">{SAMPLING_STATUS[r.status]}</Badge></div>
            <p>Pour {r.patient_name} · souhaité le {formatDate(r.preferred_date)}, {SLOT[r.slot]}</p>
            {r.scheduled_at && <p className="font-semibold">Passage prévu le {formatDateTime(r.scheduled_at)}</p>}
            {r.lab_note && <p>Message du laboratoire : {r.lab_note}</p>}
            <div className="flex flex-wrap gap-2 pt-1">
              {f?.phone && <a href={`tel:${f.phone}`} className="text-primary underline">Appeler le laboratoire</a>}
              {["nouvelle", "acceptee", "planifiee"].includes(r.status) && <ActionForm action={cancelSampling}><input type="hidden" name="id" value={r.id} /><SubmitButton size="sm" variant="outline" confirm="Annuler cette demande ?">Annuler</SubmitButton></ActionForm>}
            </div>
          </li>); })}</ul>
      )}
    </div>
  );
}
