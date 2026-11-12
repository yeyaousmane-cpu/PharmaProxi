import Link from "next/link";
import { requireCurrentPharmacy } from "@/lib/pharmacy";
import { createClient } from "@/lib/supabase/server";
import { PharmacyHeader } from "@/components/pharmacy/pharmacy-header";
import { RX_STATUS } from "@/lib/prescriptions";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Ordonnances reçues" };
export const dynamic = "force-dynamic";

type Row = { id: string; reference: string; patient: string; status: string; patient_note: string | null; created_at: string; expires_at: string; response_valid_until: string | null; hold_until: string | null };

export default async function Inbox() {
  const ph = await requireCurrentPharmacy();
  const supabase = await createClient();
  await supabase.rpc("rx_expire");
  const { data } = await supabase.rpc("rx_pharmacy_inbox", { p_pharmacy: ph.id });
  const rows = (data ?? []) as Row[];
  const open = rows.filter((r) => ["envoyee", "vue", "repondue", "reservee", "prete"].includes(r.status));
  const closed = rows.filter((r) => !open.includes(r));
  const List = ({ items }: { items: Row[] }) => (
    <ul className="space-y-2">{items.map((r) => (
      <li key={r.id}><Link prefetch={false} href={`/pharmacien/ordonnances/${r.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-white p-4 text-sm hover:border-primary">
        <span><strong>{r.reference}</strong> · {r.patient}<span className="block text-xs text-muted-foreground">Reçue le {formatDateTime(r.created_at)}{["envoyee", "vue"].includes(r.status) ? ` · répondre avant le ${formatDateTime(r.expires_at)}` : ""}{r.hold_until && ["reservee", "prete"].includes(r.status) ? ` · gardée jusqu'au ${formatDateTime(r.hold_until)}` : ""}</span>
          {r.patient_note ? <span className="block text-xs">« {r.patient_note} »</span> : null}</span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${RX_STATUS[r.status]?.tone}`}>{RX_STATUS[r.status]?.label}</span>
      </Link></li>))}</ul>
  );
  return (
    <>
      <PharmacyHeader current={ph} title="Ordonnances reçues" />
      <p className="mb-4 text-sm text-muted-foreground">Les patients vous transmettent une ordonnance avec leur consentement. Vous voyez l&apos;ordonnance, le prénom et l&apos;initiale du patient, rien d&apos;autre. Le fichier n&apos;est plus accessible une fois la demande close (72 h sans réponse, annulation, refus ou retrait). L&apos;ordonnance originale doit être vérifiée au comptoir.</p>
      <h2 className="mb-2 font-semibold">À traiter ({open.length})</h2>
      {open.length ? <List items={open} /> : <p className="rounded-xl border border-dashed bg-white p-6 text-center text-sm text-muted-foreground">Aucune ordonnance en attente.</p>}
      {closed.length ? <><h2 className="mb-2 mt-6 font-semibold">Closes</h2><List items={closed.slice(0, 30)} /></> : null}
    </>
  );
}
