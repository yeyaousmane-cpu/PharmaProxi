import { createClient } from "@/lib/supabase/server";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Badge } from "@/components/ui/badge";
import { feedbackStatus } from "@/app/actions/authorities";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Avis des utilisateurs — administration" };
const MOOD: Record<string, string> = { content: "😊 Content", moyen: "😐 Moyen", pas_content: "🙁 Pas content" };
const CAT: Record<string, string> = { bug: "Quelque chose ne marche pas", idee: "Idée", contenu: "Information fausse ou manquante", difficile: "Difficile à utiliser", autre: "Autre" };

export default async function AdminFeedback() {
  const supabase = await createClient();
  const { data } = await supabase.from("feedback").select("*").order("status").order("created_at", { ascending: false }).limit(200);
  const rows = data ?? [];
  const count = (m: string) => rows.filter((r) => r.mood === m).length;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Avis des utilisateurs</h1>
      <p className="text-sm text-muted-foreground">200 derniers avis · {count("content")} contents, {count("moyen")} moyens, {count("pas_content")} pas contents.</p>
      <ul className="space-y-2">{rows.map((r) => (
        <li key={r.id} className="space-y-1 rounded-xl border bg-white p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">{r.mood && <Badge className="bg-white">{MOOD[r.mood]}</Badge>}<Badge className="bg-muted">{CAT[r.category]}</Badge>
            <span className="text-xs text-muted-foreground">{formatDateTime(r.created_at)} · {r.page_path ?? "—"}</span><Badge className={r.status === "nouveau" ? "border-amber-200 bg-amber-50" : "bg-white"}>{r.status}</Badge></div>
          {r.message && <p className="whitespace-pre-line">{r.message}</p>}
          <div className="flex gap-2">{["lu", "traite"].filter((s) => s !== r.status).map((s) => (
            <ActionForm key={s} action={feedbackStatus}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="status" value={s} /><SubmitButton size="sm" variant="outline">{s === "lu" ? "Marquer lu" : "Traité"}</SubmitButton></ActionForm>))}</div>
        </li>))}</ul>
    </div>
  );
}
