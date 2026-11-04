import { createClient } from "@/lib/supabase/server";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { reviewGtin } from "@/app/actions/v023";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Codes-barres proposés — administration" };
export const dynamic = "force-dynamic";

export default async function AdminScanner() {
  const supabase = await createClient();
  const [{ data }, { count }] = await Promise.all([
    supabase.from("gtin_suggestions").select("id, code, status, created_at, medicine_catalog(brand_name, dosage, form)").eq("status", "nouvelle").order("created_at").limit(200),
    supabase.from("medicine_identifiers").select("id", { count: "exact", head: true }).eq("id_type", "gtin"),
  ]);
  type One<T> = T | T[] | null;
  const one = <T,>(v: One<T>) => (Array.isArray(v) ? v[0] : v) ?? null;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Scanner : codes-barres</h1>
      <p className="text-sm text-muted-foreground">{count ?? 0} code(s)-barres connus. Les codes peuvent aussi être importés avec le catalogue (identifiant de type « gtin »). Vérifiez chaque proposition avec la boîte ou une source officielle (DPM, fabricant) avant de l&apos;accepter : un mauvais code afficherait le mauvais médicament.</p>
      {(data ?? []).length === 0 && <p className="rounded-xl border bg-white p-4 text-sm text-muted-foreground">Aucune proposition en attente.</p>}
      <ul className="space-y-2">{(data ?? []).map((g) => { const m = one(g.medicine_catalog as One<{ brand_name: string; dosage: string | null; form: string | null }>); return (
        <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-white p-3 text-sm">
          <span><strong className="font-mono">{g.code}</strong> → {m?.brand_name} {m?.dosage ?? ""} {m?.form ?? ""} · {formatDateTime(g.created_at)}</span>
          <span className="flex gap-2">
            <ActionForm action={reviewGtin}><input type="hidden" name="id" value={g.id} /><input type="hidden" name="accept" value="1" /><SubmitButton size="sm">Accepter</SubmitButton></ActionForm>
            <ActionForm action={reviewGtin}><input type="hidden" name="id" value={g.id} /><input type="hidden" name="accept" value="0" /><SubmitButton size="sm" variant="outline">Refuser</SubmitButton></ActionForm>
          </span>
        </li>); })}</ul>
    </div>
  );
}
