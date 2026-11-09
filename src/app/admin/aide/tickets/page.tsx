import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PRIORITY, StatusBadge, TICKET_STATUS, dt, type Ticket } from "@/components/help/ticket-thread";

export const metadata = { title: "Demandes d'aide — administration" };
export const dynamic = "force-dynamic";

const SLA: Record<string, number> = { urgente: 4, haute: 24, normale: 48, basse: 72 };

export default async function AdminTickets({ searchParams }: { searchParams: Promise<{ statut?: string }> }) {
  const { statut } = await searchParams;
  const supabase = await createClient();
  let q = supabase.from("support_tickets").select("id,reference,subject,status,priority,created_at,updated_at,first_response_at,name").order("created_at", { ascending: false }).limit(300);
  q = statut && statut in TICKET_STATUS ? q.eq("status", statut) : q.in("status", ["nouveau", "en_cours", "attente_infos"]);
  const { data } = await q;
  const rows = (data as Ticket[] | null) ?? [];
  const now = Date.now();
  return (
    <div className="space-y-4">
      <Link prefetch={false} href="/admin/aide" className="text-sm text-muted-foreground hover:underline">← Centre d&apos;aide</Link>
      <h1 className="text-2xl font-bold">Demandes d&apos;aide</h1>
      <nav className="flex flex-wrap gap-2 text-sm">
        <Link prefetch={false} href="/admin/aide/tickets" className={`rounded-full border px-3 py-1 ${!statut ? "bg-[#052D1E] text-white" : ""}`}>Ouvertes</Link>
        {Object.entries(TICKET_STATUS).map(([k, [l]]) => <Link key={k} prefetch={false} href={`/admin/aide/tickets?statut=${k}`} className={`rounded-full border px-3 py-1 ${statut === k ? "bg-[#052D1E] text-white" : ""}`}>{l}</Link>)}
      </nav>
      <p className="text-xs text-muted-foreground">Délais cibles de première réponse : urgente 4 h, haute 24 h, normale 48 h, basse 72 h.</p>
      {rows.length === 0 ? <p className="rounded-xl border bg-white p-4 text-muted-foreground">Aucune demande.</p> : (
        <ul className="divide-y rounded-2xl border bg-white text-sm">{rows.map((t) => {
          const late = !t.first_response_at && now - new Date(t.created_at).getTime() > (SLA[t.priority] ?? 48) * 3600_000;
          return (<li key={t.id}><Link prefetch={false} href={`/admin/aide/tickets/${t.id}`} className="flex flex-wrap items-center gap-2 p-3 hover:bg-[#EAF6EE]/60">
            <span className="font-mono text-muted-foreground">{t.reference}</span><span className="flex-1 font-semibold">{t.subject}</span>
            <span>{PRIORITY[t.priority]}</span><StatusBadge s={t.status} />{late && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-900">Délai dépassé</span>}
            <span className="w-full text-xs text-muted-foreground">{t.name} · créée le {dt(t.created_at)}</span></Link></li>);
        })}</ul>)}
    </div>
  );
}
