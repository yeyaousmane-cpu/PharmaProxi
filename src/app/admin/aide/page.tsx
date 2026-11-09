import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Centre d'aide — administration" };
export const dynamic = "force-dynamic";

type Row = { id: string; slug: string; title: string; category_slug: string; section: string; status: string; views: number; helpful_yes: number; helpful_no: number; updated_at: string };

export default async function AdminHelp() {
  const supabase = await createClient();
  const [{ data }, { count: open }] = await Promise.all([
    supabase.from("help_articles").select("id,slug,title,category_slug,section,status,views,helpful_yes,helpful_no,updated_at").order("category_slug").order("section").order("sort"),
    supabase.from("support_tickets").select("id", { count: "exact", head: true }).in("status", ["nouveau", "en_cours", "attente_infos"]),
  ]);
  const rows = (data as Row[] | null) ?? [];
  const low = rows.filter((r) => r.helpful_no >= 3 && r.helpful_no > r.helpful_yes);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Centre d&apos;aide</h1>
        <div className="flex gap-2">
          <Link prefetch={false} href="/admin/aide/tickets" className="rounded-xl border px-4 py-2 font-semibold">Demandes d&apos;aide ({open ?? 0} ouvertes)</Link>
          <Link prefetch={false} href="/admin/aide/article/nouveau" className="rounded-xl bg-[#068132] px-4 py-2 font-semibold text-white">Nouvel article</Link>
        </div>
      </div>
      {low.length > 0 && <p className="rounded-xl bg-amber-100 p-3 text-sm text-amber-900">À améliorer : {low.map((l) => l.title).join(" · ")} (majorité d&apos;avis « Non »).</p>}
      <div className="overflow-x-auto rounded-2xl border bg-white"><table className="w-full text-left text-sm">
        <thead><tr className="border-b"><th className="p-2">Article</th><th className="p-2">Rubrique</th><th className="p-2">Statut</th><th className="p-2">Vues</th><th className="p-2">Utile oui / non</th></tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.id} className="border-b"><td className="p-2"><Link prefetch={false} href={`/admin/aide/article/${r.id}`} className="font-semibold text-[#068132] hover:underline">{r.title}</Link></td>
            <td className="p-2">{r.category_slug} › {r.section}</td><td className="p-2">{r.status === "publie" ? "Publié" : "Brouillon"}</td><td className="p-2">{r.views}</td><td className="p-2">{r.helpful_yes} / {r.helpful_no}</td></tr>))}</tbody>
      </table></div>
    </div>
  );
}
