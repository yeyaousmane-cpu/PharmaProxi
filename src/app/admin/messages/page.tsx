import Link from "next/link";
import { Mail, Phone } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { updateContactMessage } from "@/app/actions/contact";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { CONTACT_TOPICS } from "@/components/contact-form";
import { formatDateTime, formatPhone } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Messages de contact — administration" };
const STATUSES = [["new", "Nouveaux"], ["in_progress", "En cours"], ["closed", "Traités"]] as const;

export default async function AdminMessages({ searchParams }: { searchParams: Promise<{ statut?: string }> }) {
  const sp = await searchParams;
  const statut = STATUSES.some(([k]) => k === sp.statut) ? sp.statut! : "new";
  const supabase = await createClient();
  const [{ data }, { count: nNew }] = await Promise.all([
    supabase.from("contact_messages").select("id, topic, name, email, phone, message, page_url, status, admin_note, created_at, user_id")
      .eq("status", statut).order("created_at", { ascending: statut === "new" }).limit(200),
    supabase.from("contact_messages").select("id", { count: "exact", head: true }).eq("status", "new"),
  ]);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Messages de contact</h1>
      <p className="text-sm text-muted-foreground">
        Messages envoyés depuis la page <Link prefetch={false} href="/infos/contact" className="underline">Contact</Link>. Répondez par e-mail ou par téléphone, puis marquez le message comme traité.
        Ces messages contiennent des données personnelles : ne les partagez pas. Les messages traités sont supprimés au bout de 2 ans.
      </p>
      <nav className="flex flex-wrap gap-2" aria-label="Statut">
        {STATUSES.map(([k, l]) => (
          <Link prefetch={false} key={k} href={`/admin/messages?statut=${k}`} aria-current={k === statut ? "page" : undefined}
            className={cn("rounded-full border px-4 py-2 text-sm font-medium", k === statut ? "border-brand-blue bg-brand-sky text-brand-blue" : "bg-white")}>
            {l}{k === "new" && nNew ? ` (${nNew})` : ""}
          </Link>
        ))}
      </nav>
      {!data?.length ? <p className="rounded-xl border border-dashed bg-white p-8 text-center text-sm text-muted-foreground">Aucun message.</p> : (
        <ul className="space-y-3">
          {data.map((m) => (
            <li key={m.id}>
              <Card>
                <CardHeader>
                  <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                    {m.name} <Badge className="bg-white">{CONTACT_TOPICS[m.topic] ?? m.topic}</Badge>
                    {m.user_id && <Badge className="bg-muted text-muted-foreground">compte inscrit</Badge>}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">{formatDateTime(m.created_at)}{m.page_url ? ` · depuis ${m.page_url}` : ""}</p>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <p className="whitespace-pre-wrap rounded-lg bg-muted/60 p-3">{m.message}</p>
                  <div className="flex flex-wrap gap-3">
                    {m.email && <a href={`mailto:${m.email}?subject=${encodeURIComponent("Votre message à PharmaProxi")}`} className="inline-flex items-center gap-1 font-medium text-brand-blue underline"><Mail className="size-4" aria-hidden /> {m.email}</a>}
                    {m.phone && <a href={`tel:${m.phone}`} className="inline-flex items-center gap-1 font-medium text-brand-blue underline"><Phone className="size-4" aria-hidden /> {formatPhone(m.phone)}</a>}
                  </div>
                  <ActionForm action={updateContactMessage} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <input type="hidden" name="id" value={m.id} />
                    <Input name="note" defaultValue={m.admin_note ?? ""} placeholder="Note interne (réponse donnée, suite…)" maxLength={1000} className="h-9" aria-label="Note interne" />
                    <div className="flex shrink-0 gap-2">
                      {m.status !== "in_progress" && <SubmitButton size="sm" variant="outline" name="status" value="in_progress">En cours</SubmitButton>}
                      {m.status !== "closed" && <SubmitButton size="sm" name="status" value="closed">Traité</SubmitButton>}
                      {m.status === "closed" && <SubmitButton size="sm" variant="outline" name="status" value="new">Rouvrir</SubmitButton>}
                    </div>
                  </ActionForm>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
