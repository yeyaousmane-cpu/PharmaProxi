import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Textarea } from "@/components/ui/input";
import { replyTicket } from "@/app/actions/help";
import { StatusBadge, Thread, dt, type Ticket, type TicketMsg } from "@/components/help/ticket-thread";

export const metadata = { title: "Ma demande d'aide" };
export const dynamic = "force-dynamic";

export default async function MyTicket({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireUser(`/compte/aide/${id}`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const [{ data: t }, { data: msgs }] = await Promise.all([
    supabase.from("support_tickets").select("*").eq("id", id).maybeSingle(),
    supabase.from("support_ticket_messages").select("id,from_staff,internal,body,created_at").eq("ticket_id", id).order("created_at"),
  ]);
  if (!t) notFound();
  const ticket = t as Ticket;
  return (
    <div className="container-page max-w-3xl space-y-4 py-6">
      <Link prefetch={false} href="/compte/aide" className="text-sm text-muted-foreground hover:underline">← Mes demandes</Link>
      <h1 className="text-2xl font-bold">{ticket.subject}</h1>
      <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground"><span className="font-mono">{ticket.reference}</span> · créée le {dt(ticket.created_at)} <StatusBadge s={ticket.status} /></p>
      <Thread msgs={(msgs as TicketMsg[] | null) ?? []} />
      {ticket.status !== "ferme" ? (
        <ActionForm action={replyTicket} className="space-y-2 rounded-2xl border bg-white p-4" resetOnSuccess>
          <input type="hidden" name="id" value={ticket.id} />
          <label htmlFor="body" className="font-semibold">Ajouter un message</label>
          <Textarea id="body" name="body" rows={3} maxLength={5000} required />
          <SubmitButton>Envoyer</SubmitButton>
        </ActionForm>
      ) : <p className="rounded-xl bg-muted p-3 text-sm">Cette demande est fermée. Pour une nouvelle question, <Link prefetch={false} href="/aide/contact" className="underline">créez une demande</Link>.</p>}
    </div>
  );
}
