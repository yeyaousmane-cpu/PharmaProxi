import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { facilityAppointmentAction } from "@/app/actions/v041";
import { APPT_STATUS } from "@/lib/orientation-partners";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Mes demandes de rendez-vous en établissement" };
export const dynamic = "force-dynamic";

type R = { id: string; reference: string; service: string; preferred: string; status: string; proposed_at: string | null; facility_message: string | null; created_at: string; facility_listings: { id: string; name: string; phone: string | null } | null };

export default async function Mine() {
  await requireUser("/compte/rendez-vous-etablissements");
  const supabase = await createClient();
  const { data } = await supabase.from("facility_appointment_requests").select("id, reference, service, preferred, status, proposed_at, facility_message, created_at, facility_listings(id, name, phone)").order("created_at", { ascending: false }).limit(50);
  const rows = (data ?? []) as unknown as R[];
  return (
    <div className="container-page max-w-3xl space-y-4 py-6">
      <h1 className="text-2xl font-bold">Mes demandes de rendez-vous en établissement</h1>
      <p className="text-sm text-muted-foreground">Demandes envoyées aux établissements partenaires depuis leur fiche. Le rendez-vous n&apos;est fixé qu&apos;après votre confirmation du créneau proposé. <Link prefetch={false} href="/orientation" className="underline">Où me faire soigner ?</Link></p>
      {rows.length === 0 ? <p className="rounded-xl border bg-white p-4 text-sm text-muted-foreground">Aucune demande.</p> : (
        <ul className="space-y-2">{rows.map((r) => (
          <li key={r.id} className="space-y-2 rounded-xl border bg-white p-4 text-sm">
            <p><Link prefetch={false} href={`/etablissements/${r.facility_listings?.id}`} className="font-semibold text-primary underline">{r.facility_listings?.name}</Link> · {r.reference} · <strong>{APPT_STATUS[r.status]}</strong></p>
            <p>{r.service} — vos disponibilités : {r.preferred}</p>
            {r.proposed_at ? <p className="rounded-lg bg-muted/50 p-2">Créneau proposé : <strong>{formatDateTime(r.proposed_at)}</strong>{r.facility_message ? ` — ${r.facility_message}` : ""}</p> : r.facility_message ? <p className="text-xs">Message : {r.facility_message}</p> : null}
            <div className="flex flex-wrap gap-2">
              {r.status === "proposee" ? <ActionForm action={facilityAppointmentAction}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="action" value="confirmer" /><SubmitButton size="sm">Confirmer ce créneau</SubmitButton></ActionForm> : null}
              {["envoyee", "proposee", "confirmee"].includes(r.status) ? <ActionForm action={facilityAppointmentAction}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="action" value="annuler" /><SubmitButton size="sm" variant="ghost">Annuler</SubmitButton></ActionForm> : null}
            </div>
          </li>))}</ul>
      )}
    </div>
  );
}
