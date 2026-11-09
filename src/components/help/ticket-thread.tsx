export type Ticket = { id: string; reference: string; subject: string; status: string; priority: string; created_at: string; updated_at: string; first_response_at: string | null; resolved_at: string | null; name: string; email: string | null; phone: string | null; category_slug: string | null; page_url: string | null };
export type TicketMsg = { id: number; from_staff: boolean; internal: boolean; body: string; created_at: string };

export const TICKET_STATUS: Record<string, [string, string]> = {
  nouveau: ["Nouveau", "bg-sky-100 text-sky-900"], en_cours: ["En cours", "bg-amber-100 text-amber-900"],
  attente_infos: ["En attente d'informations", "bg-violet-100 text-violet-900"], resolu: ["Résolu", "bg-emerald-100 text-emerald-900"], ferme: ["Fermé", "bg-muted text-muted-foreground"],
};
export const PRIORITY: Record<string, string> = { basse: "Basse", normale: "Normale", haute: "Haute", urgente: "Urgente" };
export const dt = (s: string) => new Date(s).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Bamako" });

export function StatusBadge({ s }: { s: string }) {
  const [l, tone] = TICKET_STATUS[s] ?? TICKET_STATUS.nouveau;
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${tone}`}>{l}</span>;
}

export function Thread({ msgs, staffView = false }: { msgs: TicketMsg[]; staffView?: boolean }) {
  return (
    <ol className="space-y-3">{msgs.map((m) => (
      <li key={m.id} className={`rounded-2xl p-4 ${m.internal ? "border border-dashed border-amber-400 bg-amber-50" : m.from_staff ? "bg-[#EAF6EE]" : "border bg-white"}`}>
        <p className="mb-1 text-xs font-semibold text-muted-foreground">{m.internal ? "Note interne" : m.from_staff ? "Équipe SantéProxi" : staffView ? "Demandeur" : "Vous"} · {dt(m.created_at)}</p>
        <p className="whitespace-pre-wrap">{m.body}</p>
      </li>))}</ol>
  );
}
