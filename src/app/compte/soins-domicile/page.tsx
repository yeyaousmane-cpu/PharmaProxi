import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { setHomeCareStatus } from "@/app/actions/v031";
import { CARE_TYPES } from "@/lib/nurses";
import { HCR_STATUS, SLOTS, type HomeCareRequest } from "@/lib/nurse-space";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Mes demandes de soins à domicile" };
export const dynamic = "force-dynamic";

export default async function MesSoins() {
  await requireUser("/compte/soins-domicile");
  const supabase = await createClient();
  const { data } = await supabase.from("home_care_requests").select("id, reference, care_type, preferred_date, preferred_slot, area, contact_phone, message, has_prescription, status, nurse_reply, created_at, nurse_accounts(display_name)").order("created_at", { ascending: false }).limit(50);
  const rows = (data ?? []) as unknown as (HomeCareRequest & { nurse_accounts: { display_name: string } | null })[];
  return (
    <div className="container-page max-w-3xl space-y-4 py-6">
      <h1 className="text-2xl font-bold">Mes demandes de soins à domicile</h1>
      {rows.length === 0 ? <p className="rounded-xl border bg-white p-4 text-sm text-muted-foreground">Aucune demande. <Link prefetch={false} href="/infirmiers" className="text-primary underline">Trouver un infirmier</Link></p> : (
        <ul className="space-y-2">{rows.map((r) => (
          <li key={r.id} className="rounded-xl border bg-white p-3 text-sm">
            <p className="font-semibold"><span className="font-mono" dir="ltr">{r.reference}</span> · {CARE_TYPES[r.care_type]} <span className={`ms-1 rounded-full px-2 py-0.5 text-xs ${HCR_STATUS[r.status][1]}`}>{HCR_STATUS[r.status][0]}</span></p>
            <p>{r.nurse_accounts?.display_name} · {formatDate(r.preferred_date)} · {SLOTS[r.preferred_slot]} · {r.area}</p>
            {r.nurse_reply && <p className="mt-1 rounded-lg bg-[#EAF6EE] p-2">Message de l&apos;infirmier : {r.nurse_reply}</p>}
            {["demande", "acceptee"].includes(r.status) && <ActionForm action={setHomeCareStatus} className="mt-2"><input type="hidden" name="id" value={r.id} /><input type="hidden" name="status" value="annulee" />
              <SubmitButton size="sm" variant="outline" confirm="Annuler cette demande ? L'infirmier sera prévenu.">Annuler</SubmitButton></ActionForm>}
          </li>))}</ul>
      )}
    </div>
  );
}
