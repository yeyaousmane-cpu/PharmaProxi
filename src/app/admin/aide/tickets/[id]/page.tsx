import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Field, Select, Textarea } from "@/components/ui/input";
import { replyTicket } from "@/app/actions/help";
import { PRIORITY, StatusBadge, TICKET_STATUS, Thread, dt, type Ticket, type TicketMsg } from "@/components/help/ticket-thread";

export const metadata = { title: "Demande d'aide — administration" };
export const dynamic = "force-dynamic";

export default async function AdminTicket({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const [{ data: t }, { data: msgs }] = await Promise.all([
    supabase.from("support_tickets").select("*").eq("id", id).maybeSingle(),
    supabase.from("support_ticket_messages").select("id,from_staff,internal,body,created_at").eq("ticket_id", id).order("created_at"),
  ]);
  if (!t) notFound();
  const k = t as Ticket & { user_id: string | null };
  return (
    <div className="space-y-4">
      <Link prefetch={false} href="/admin/aide/tickets" className="text-sm text-muted-foreground hover:underline">← Demandes d&apos;aide</Link>
      <h1 className="text-2xl font-bold">{k.subject}</h1>
      <p className="flex flex-wrap items-center gap-2 text-sm"><span className="font-mono">{k.reference}</span><StatusBadge s={k.status} /> Priorité {PRIORITY[k.priority]} · créée le {dt(k.created_at)}{k.first_response_at && ` · 1re réponse le ${dt(k.first_response_at)}`}</p>
      <p className="rounded-xl border bg-white p-3 text-sm">{k.name}{k.email && ` · ${k.email}`}{k.phone && ` · ${k.phone}`}{k.user_id ? " · compte SantéProxi (réponse notifiée dans le compte)" : " · sans compte : répondez aussi par e-mail ou téléphone"}{k.category_slug && ` · rubrique ${k.category_slug}`}</p>
      <Thread msgs={(msgs as TicketMsg[] | null) ?? []} staffView />
      <ActionForm action={replyTicket} className="grid gap-3 rounded-2xl border bg-white p-4 sm:grid-cols-2" resetOnSuccess>
        <input type="hidden" name="id" value={k.id} /><input type="hidden" name="staff" value="1" />
        <Field label="Réponse" htmlFor="body" className="sm:col-span-2"><Textarea id="body" name="body" rows={4} maxLength={5000} /></Field>
        <Field label="Nouveau statut" htmlFor="status"><Select id="status" name="status" defaultValue=""><option value="">— Ne pas changer ({TICKET_STATUS[k.status]?.[0]}) —</option>{Object.entries(TICKET_STATUS).map(([v, [l]]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
        <Field label="Nouvelle priorité" htmlFor="priority"><Select id="priority" name="priority" defaultValue=""><option value="">— Ne pas changer ({PRIORITY[k.priority]}) —</option>{Object.entries(PRIORITY).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="internal" className="size-4" /> Note interne (non visible par le demandeur)</label>
        <div className="sm:col-span-2"><SubmitButton>Enregistrer</SubmitButton></div>
      </ActionForm>
    </div>
  );
}
