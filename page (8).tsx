import Link from "next/link";
import { Pagination, pageRange } from "@/components/pagination";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { DemoBadge } from "@/components/demo-badge";
import { Input } from "@/components/ui/input";
import { PHARMACY_STATUS_LABEL } from "@/lib/pharmacy";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Pharmacies — administration" };
const TABS = ["pending", "verified", "suspended", "rejected"] as const;

export default async function AdminPharmacies({ searchParams }: { searchParams: Promise<{ statut?: string; q?: string; page?: string }> }) {
  const sp = await searchParams;
  const tab = (TABS as readonly string[]).includes(sp.statut ?? "") ? (sp.statut as (typeof TABS)[number]) : "pending";
  const range = pageRange(sp.page);
  const supabase = await createClient();
  let query = supabase.from("pharmacies").select("id, name, status, phone, created_at, is_demo, regions(name), communes(name), pharmacy_documents(count)", { count: "exact" }).eq("status", tab).order("created_at", { ascending: tab === "pending" }).range(range.from, range.to);
  if (sp.q?.trim()) query = query.ilike("name", `%${sp.q.trim().replace(/[%_]/g, "")}%`);
  const { data, count } = await query;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Pharmacies</h1>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1">
          {TABS.map((t) => <Link prefetch={false} key={t} href={`/admin/pharmacies?statut=${t}`} className={cn("rounded-full border px-3 py-1 text-sm", tab === t ? "border-primary bg-primary text-white" : "bg-white")}>{PHARMACY_STATUS_LABEL[t]}</Link>)}
        </div>
        <form method="get"><input type="hidden" name="statut" value={tab} /><Input name="q" placeholder="Rechercher par nom…" defaultValue={sp.q} className="h-9" aria-label="Rechercher une pharmacie" /></form>
      </div>
      {!data?.length ? <p className="rounded-xl border border-dashed bg-white p-8 text-center text-sm text-muted-foreground">Aucune pharmacie.</p> : (
        <ul className="divide-y rounded-xl border bg-white">
          {data.map((p) => {
            const r = Array.isArray(p.regions) ? p.regions[0] : p.regions;
            const c = Array.isArray(p.communes) ? p.communes[0] : p.communes;
            const docs = (p.pharmacy_documents as unknown as { count: number }[])?.[0]?.count ?? 0;
            return (
              <li key={p.id}>
                <Link prefetch={false} href={`/admin/pharmacies/${p.id}`} className="flex flex-col gap-1 p-4 hover:bg-muted sm:flex-row sm:items-center sm:justify-between">
                  <div><p className="font-semibold">{p.name} {p.is_demo && <DemoBadge />}</p><p className="text-sm text-muted-foreground">{[c?.name, r?.name].filter(Boolean).join(", ")} · inscrite le {formatDateTime(p.created_at)}</p></div>
                  <Badge className={docs ? "bg-white" : "border-amber-200 bg-amber-50 text-amber-900"}>{docs} justificatif(s)</Badge>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <Pagination basePath="/admin/pharmacies" params={sp} page={range.page} total={count} />
    </div>
  );
}
