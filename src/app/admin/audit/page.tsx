import { createClient } from "@/lib/supabase/server";
import { Pagination, pageRange } from "@/components/pagination";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Journal d'audit" };

export default async function Audit({ searchParams }: { searchParams: Promise<{ action?: string; page?: string }> }) {
  const sp = await searchParams;
  const range = pageRange(sp.page, 50);
  const supabase = await createClient();
  let q = supabase.from("audit_logs").select("id, actor_id, action, entity_type, entity_id, details, created_at", { count: "exact" }).order("created_at", { ascending: false }).range(range.from, range.to);
  if (sp.action) q = q.like("action", `${sp.action.replace(/[%_]/g, "")}%`);
  const { data, count } = await q;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Journal d&apos;audit</h1>
      <p className="text-sm text-muted-foreground">Actions administratives et accès sensibles. Ce journal ne peut pas être modifié depuis l&apos;application.</p>
      <form method="get" className="flex gap-2 text-sm"><select name="action" defaultValue={sp.action ?? ""} className="h-9 rounded-lg border px-2" aria-label="Filtrer par type">
        <option value="">Toutes les actions</option><option value="pharmacy">Pharmacies</option><option value="sensitive">Accès sensibles</option><option value="role">Rôles</option><option value="setting">Paramètres</option><option value="courier">Livreurs</option><option value="catalog">Catalogue</option></select>
        <button className="rounded-lg border bg-white px-3">Filtrer</button></form>
      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full min-w-[720px] text-sm">
          <thead><tr className="border-b bg-muted text-left"><th className="p-2">Date</th><th className="p-2">Action</th><th className="p-2">Objet</th><th className="p-2">Auteur</th><th className="p-2">Détails</th></tr></thead>
          <tbody>{(data ?? []).map((l) => (
            <tr key={l.id} className="border-b align-top">
              <td className="p-2 whitespace-nowrap">{formatDateTime(l.created_at)}</td><td className="p-2 font-mono text-xs">{l.action}</td>
              <td className="p-2 text-xs">{l.entity_type} {l.entity_id?.slice(0, 8)}</td><td className="p-2 font-mono text-xs">{l.actor_id?.slice(0, 8) ?? "système"}</td>
              <td className="p-2"><code className="break-all text-xs">{JSON.stringify(l.details)}</code></td>
            </tr>))}</tbody>
        </table>
      </div>
      <Pagination basePath="/admin/audit" params={sp} page={range.page} total={count} size={50} />
    </div>
  );
}
