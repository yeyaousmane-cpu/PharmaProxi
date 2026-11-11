import Link from "next/link";
import { formatDateTime } from "@/lib/format";
import { PRODUCTS, REQUEST_STATUS, URGENCY } from "@/lib/donor";

export type BloodRequest = { id: string; reference: string; requester_kind: string; blood_group: string; product: string; units: number; facility_name: string; region_id: string | null;
  place_detail: string | null; needed_at: string; urgency: string; status: string; verified_at: string | null; expires_at: string; created_at: string; regions?: { name: string } | null };

/** Carte d'une demande de sang (informations publiques uniquement). */
export function RequestCard({ r }: { r: BloodRequest }) {
  const [ul, uc] = URGENCY[r.urgency]; const [sl, sc] = REQUEST_STATUS[r.status];
  return (
    <li className="space-y-1 rounded-2xl border bg-white p-4 text-sm">
      <div className="flex flex-wrap items-center gap-2"><span className="rounded-lg bg-red-50 px-2 py-1 font-mono text-lg font-bold text-red-700" aria-label={`Groupe ${r.blood_group}`}>{r.blood_group}</span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${uc}`}>{ul}</span><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${sc}`}>{sl}</span></div>
      <p className="font-semibold">{r.facility_name}{r.place_detail ? ` — ${r.place_detail}` : ""}</p>
      <p className="text-muted-foreground">{r.regions?.name ?? "Région non précisée"} · {PRODUCTS[r.product]} · {r.units} poche{r.units > 1 ? "s" : ""} · pour le {formatDateTime(r.needed_at)}</p>
      <Link prefetch={false} href={`/don-de-sang/sos/${r.id}`} className="inline-block font-semibold text-primary underline">Voir la demande {r.reference}</Link>
    </li>
  );
}
