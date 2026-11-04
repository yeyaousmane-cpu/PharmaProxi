import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { REPORT_KIND, REPORT_STATUS } from "@/lib/authorities";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Mes signalements" };
export const dynamic = "force-dynamic";

export default async function MyReports() {
  await requireUser("/signaler/mes-signalements");
  const supabase = await createClient();
  const { data } = await supabase.from("drug_reports").select("id, kind, product_name, status, created_at").order("created_at", { ascending: false }).limit(50);
  return (
    <div className="container-page max-w-3xl space-y-4 py-6">
      <h1 className="text-2xl font-bold text-brand-deep">Mes signalements</h1>
      {(data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">Aucun signalement envoyé.</p> : (
        <ul className="divide-y rounded-2xl border bg-white">{(data ?? []).map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
            <span><span className="font-semibold">{r.product_name}</span> <span className="text-muted-foreground">· {REPORT_KIND[r.kind]} · {formatDateTime(r.created_at)}</span></span>
            <Badge className="bg-muted">{REPORT_STATUS[r.status]}</Badge>
          </li>))}</ul>
      )}
      <Link prefetch={false} href="/signaler" className="inline-block text-sm font-semibold text-primary underline">Faire un nouveau signalement</Link>
    </div>
  );
}
