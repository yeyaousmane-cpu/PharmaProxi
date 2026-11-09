import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { StatusBadge, dt, type Ticket } from "@/components/help/ticket-thread";

export const metadata = { title: "Mes demandes d'aide" };
export const dynamic = "force-dynamic";

export default async function MyTickets() {
  await requireUser("/compte/aide");
  const supabase = await createClient();
  const { data } = await supabase.from("support_tickets").select("id,reference,subject,status,priority,created_at,updated_at").order("updated_at", { ascending: false });
  const rows = (data as Ticket[] | null) ?? [];
  return (
    <div className="container-page max-w-3xl space-y-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Mes demandes d&apos;aide</h1>
        <Link prefetch={false} href="/aide/contact" className="rounded-xl bg-[#068132] px-4 py-2 font-semibold text-white">Nouvelle demande</Link>
      </div>
      {rows.length === 0 ? <p className="rounded-xl border bg-white p-4 text-muted-foreground">Aucune demande. Consultez d&apos;abord le <Link prefetch={false} href="/aide" className="underline">centre d&apos;aide</Link>.</p> : (
        <ul className="divide-y rounded-2xl border bg-white">{rows.map((t) => (
          <li key={t.id}><Link prefetch={false} href={`/compte/aide/${t.id}`} className="flex flex-wrap items-center gap-2 p-4 hover:bg-[#EAF6EE]/60">
            <span className="font-mono text-sm text-muted-foreground">{t.reference}</span><span className="flex-1 font-semibold">{t.subject}</span><StatusBadge s={t.status} />
            <span className="w-full text-xs text-muted-foreground">Mis à jour le {dt(t.updated_at)}</span></Link></li>))}</ul>)}
    </div>
  );
}
