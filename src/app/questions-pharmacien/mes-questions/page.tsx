import Link from "next/link";
import { MessageCircleQuestion, ShieldCheck } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Badge } from "@/components/ui/badge";
import { closeQuestion } from "@/app/actions/questions";
import { ABOUT_LABEL, ANSWER_DISCLAIMER } from "@/lib/questions";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Mes questions aux pharmaciens" };

export default async function MyQuestions() {
  await requireUser("/questions-pharmacien/mes-questions");
  const supabase = await createClient();
  const [{ data: qs }, { data: ans }] = await Promise.all([
    supabase.from("pharmacist_questions").select("id, question, about, status, urgent, allow_public, hidden, created_at").order("created_at", { ascending: false }).limit(50),
    supabase.from("pharmacist_answers").select("question_id, author_name, pharmacy_name, body, created_at, hidden").eq("hidden", false).order("created_at"),
  ]);
  return (
    <div className="container-page max-w-3xl space-y-5 py-6">
      <p className="text-sm"><Link prefetch={false} href="/questions-pharmacien" className="text-primary underline">Questions à un pharmacien</Link> › Mes questions</p>
      <h1 className="flex items-center gap-2 text-2xl font-bold text-brand-deep"><MessageCircleQuestion className="size-7 text-primary" aria-hidden /> Mes questions</h1>
      {!qs?.length ? <p className="rounded-xl border bg-white p-4 text-sm">Aucune question pour le moment. <Link prefetch={false} href="/questions-pharmacien" className="font-semibold text-primary underline">Poser une question</Link></p> : (
        <ul className="space-y-3">
          {qs.map((q) => {
            const answers = (ans ?? []).filter((a) => a.question_id === q.id);
            return (
              <li key={q.id} className="space-y-3 rounded-2xl border bg-white p-4">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge className={q.status === "answered" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : q.status === "open" ? "border-amber-200 bg-amber-50 text-amber-900" : "bg-muted text-muted-foreground"}>
                    {q.status === "answered" ? "Répondue" : q.status === "open" ? "En attente de réponse" : "Close"}</Badge>
                  {ABOUT_LABEL[q.about]} · {formatDateTime(q.created_at)} · {q.allow_public ? "publication anonyme acceptée" : "privée"}
                </div>
                <p className="font-semibold">{q.question}</p>
                {q.urgent && q.status === "open" && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-900">Ce que vous décrivez peut être une urgence : n&apos;attendez pas la réponse, allez au <Link prefetch={false} href="/urgences" className="font-semibold underline">service d&apos;urgence</Link> le plus proche.</p>}
                {answers.map((a, i) => (
                  <div key={i} className="rounded-xl bg-brand-mint p-3 text-sm">
                    <p className="whitespace-pre-line">{a.body}</p>
                    <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-brand-deep"><ShieldCheck className="size-3.5" aria-hidden />{a.author_name} · {a.pharmacy_name} · {formatDateTime(a.created_at)}</p>
                  </div>
                ))}
                <div className="flex gap-2">
                  {q.status !== "closed" && <ActionForm action={closeQuestion}><input type="hidden" name="id" value={q.id} /><SubmitButton size="sm" variant="outline">Clore</SubmitButton></ActionForm>}
                  <ActionForm action={closeQuestion}><input type="hidden" name="id" value={q.id} /><input type="hidden" name="delete" value="1" /><SubmitButton size="sm" variant="ghost" confirm="Supprimer cette question et ses réponses ?">Supprimer</SubmitButton></ActionForm>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">{ANSWER_DISCLAIMER}</p>
    </div>
  );
}
