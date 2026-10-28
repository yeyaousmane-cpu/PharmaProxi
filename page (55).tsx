import { requireCurrentPharmacy } from "@/lib/pharmacy";
import { Pagination, pageRange } from "@/components/pagination";
import { createClient } from "@/lib/supabase/server";
import { PharmacyHeader } from "@/components/pharmacy/pharmacy-header";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Mouvements de stock" };
const KIND: Record<string, string> = { adjustment: "Ajustement", import: "Import CSV", reservation: "Réservation", release: "Libération", sale: "Vente", return: "Retour", expiry: "Péremption", correction: "Confirmation / correction" };

export default async function Movements({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const range = pageRange((await searchParams).page, 50);
  const ph = await requireCurrentPharmacy();
  const supabase = await createClient();
  const { data, count } = await supabase.from("inventory_movements")
    .select("id, kind, quantity_delta, reserved_delta, quantity_after, note, created_at, pharmacy_inventory(medicine_catalog(brand_name, dosage))", { count: "exact" })
    .eq("pharmacy_id", ph.id).order("created_at", { ascending: false }).range(range.from, range.to);
  return (
    <>
      <PharmacyHeader current={ph} title="Mouvements de stock" />
      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full min-w-[640px] text-sm">
          <thead><tr className="border-b bg-muted text-left"><th className="p-2">Date</th><th className="p-2">Produit</th><th className="p-2">Type</th><th className="p-2 text-right">Δ qté</th><th className="p-2 text-right">Δ réservé</th><th className="p-2 text-right">Qté après</th></tr></thead>
          <tbody>
            {(data ?? []).map((m) => {
              const inv = Array.isArray(m.pharmacy_inventory) ? m.pharmacy_inventory[0] : m.pharmacy_inventory;
              const c = inv ? (Array.isArray(inv.medicine_catalog) ? inv.medicine_catalog[0] : inv.medicine_catalog) : null;
              return (
                <tr key={m.id} className="border-b">
                  <td className="p-2">{formatDateTime(m.created_at)}</td>
                  <td className="p-2">{c?.brand_name} {c?.dosage ?? ""}</td>
                  <td className="p-2">{KIND[m.kind] ?? m.kind}{m.note ? <span className="text-muted-foreground"> — {m.note}</span> : null}</td>
                  <td className="p-2 text-right">{m.quantity_delta}</td>
                  <td className="p-2 text-right">{m.reserved_delta}</td>
                  <td className="p-2 text-right">{m.quantity_after}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!data?.length && <p className="p-6 text-center text-sm text-muted-foreground">Aucun mouvement enregistré.</p>}
      </div>
      <Pagination basePath="/pharmacien/mouvements" params={{}} page={range.page} total={count} size={50} />
    </>
  );
}
