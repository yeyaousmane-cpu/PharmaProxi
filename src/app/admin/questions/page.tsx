import { createClient } from "@/lib/supabase/server";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { moderateQuestion } from "@/app/actions/questions";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Administration — Questions aux pharmaciens" };

export default async function AdminQuestions() {
  const supabase = await createClient();
  const [{ data: qs }, { data: ans }] = await Promise.all([
    supabase.from("pharmacist_questions").select("id, question, status, allow_public, hidden, urgent, created_at").order("created_at", { ascending: false }).limit(100),
    supabase.from("pharmacist_answers").select("id, question_id, author_name, pharmacy_name, body, hidden, created_at").order("created_at"),
  ]);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Questions aux pharmaciens</h1>
      <Card>
        <CardHeader><CardTitle>Dernières questions ({qs?.length ?? 0})</CardTitle></CardHeader>
        <CardContent>
          <ul className="divide-y text-sm">
            {(qs ?? []).map((q) => (
              <li key={q.id} className="space-y-2 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="bg-muted text-muted-foreground">{q.status}</Badge>{q.allow_public && <Badge className="border-emerald-200 bg-emerald-50 text-emerald-800">publique</Badge>}
                  {q.urgent && <Badge className="border-red-200 bg-red-50 text-red-800">urgence possible</Badge>}{q.hidden && <Badge className="bg-amber-50 text-amber-900">masquée</Badge>}
                  <span className="text-xs text-muted-foreground">{formatDateTime(q.created_at)}</span>
                </div>
                <p>{q.question}</p>
                <ActionForm action={moderateQuestion}><input type="hidden" name="question_id" value={q.id} /><input type="hidden" name="hidden" value={String(!q.hidden)} /><SubmitButton size="sm" variant="ghost">{q.hidden ? "Réafficher" : "Masquer la question"}</SubmitButton></ActionForm>
                {(ans ?? []).filter((a) => a.question_id === q.id).map((a) => (
                  <div key={a.id} className="ml-4 rounded-lg border p-2">
                    <p className="text-xs font-semibold">{a.author_name} · {a.pharmacy_name} {a.hidden && <Badge className="bg-amber-50 text-amber-900">masquée</Badge>}</p>
                    <p>{a.body}</p>
                    <ActionForm action={moderateQuestion}><input type="hidden" name="answer_id" value={a.id} /><input type="hidden" name="hidden" value={String(!a.hidden)} /><SubmitButton size="sm" variant="ghost">{a.hidden ? "Réafficher" : "Masquer la réponse"}</SubmitButton></ActionForm>
                  </div>
                ))}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
