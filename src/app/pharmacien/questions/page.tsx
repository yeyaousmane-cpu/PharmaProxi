import Link from "next/link";
import { requireCurrentPharmacy } from "@/lib/pharmacy";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PharmacyHeader } from "@/components/pharmacy/pharmacy-header";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Pagination, pageRange } from "@/components/pagination";
import { answerQuestion } from "@/app/actions/questions";
import { ABOUT_LABEL } from "@/lib/questions";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Questions des patients" };

type Row = { id: string; question: string; about: string; urgent: boolean; status: string; created_at: string; answers: number; mine: boolean; total_count: number };
type Ans = { id: string; author_name: string; pharmacy_name: string; body: string; created_at: string };

export default async function PharmacistQuestions({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const ph = await requireCurrentPharmacy();
  const session = await requireUser("/pharmacien/questions");
  const filter = ["open", "mine", "all"].includes(sp.vue ?? "") ? sp.vue! : "open";
  const range = pageRange(sp.page, 15);
  const supabase = await createClient();
  if (ph.status !== "verified") {
    return (<><PharmacyHeader current={ph} title="Questions des patients" /><Alert tone="info" title="Réservé aux pharmacies vérifiées">Vous pourrez répondre aux questions des patients dès que votre pharmacie sera vérifiée.</Alert></>);
  }
  const { data, error } = await supabase.rpc("pharmacist_question_queue", { p_filter: filter, p_limit: 15, p_offset: range.from });
  const rows = (data as Row[] | null) ?? [];
  const answers = new Map<string, Ans[]>();
  await Promise.all(rows.filter((r) => Number(r.answers) > 0).map(async (r) => {
    const { data: a } = await supabase.rpc("pharmacist_question_answers", { p_question: r.id });
    answers.set(r.id, (a as Ans[] | null) ?? []);
  }));
  const { data: me } = await supabase.from("profiles").select("full_name").eq("id", session.userId).maybeSingle();
  return (
    <>
      <PharmacyHeader current={ph} title="Questions des patients" />
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">Répondez sous votre nom ({me?.full_name || <Link prefetch={false} href="/compte" className="underline">à renseigner dans Mon compte</Link>}) et celui de {ph.name}. L&apos;identité du patient n&apos;est jamais visible. Pas de diagnostic : orientez vers un médecin quand c&apos;est nécessaire.</p>
        <nav className="flex gap-2">
          {[["open", "À répondre"], ["mine", "Mes réponses"], ["all", "Toutes"]].map(([k, l]) => (
            <Link key={k} prefetch={false} href={`/pharmacien/questions?vue=${k}`} className={cn("rounded-full border px-4 py-1.5 text-sm font-medium", filter === k ? "border-primary bg-primary text-white" : "bg-white")}>{l}</Link>
          ))}
        </nav>
        {error && <Alert tone="error" title="Chargement impossible" />}
        {rows.length === 0 ? <p className="rounded-xl border bg-white p-4 text-sm text-muted-foreground">Aucune question {filter === "open" ? "en attente" : ""} pour le moment.</p> : (
          <ul className="space-y-3">
            {rows.map((r) => (
              <li key={r.id} className="space-y-3 rounded-2xl border bg-white p-4">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {r.urgent && <Badge className="border-red-200 bg-red-50 text-red-800">Signes d&apos;urgence possibles</Badge>}
                  <Badge className="bg-muted text-muted-foreground">{ABOUT_LABEL[r.about]}</Badge>{formatDateTime(r.created_at)} · {r.answers} réponse(s)
                </div>
                <p className="font-semibold">{r.question}</p>
                {(answers.get(r.id) ?? []).map((a) => (
                  <div key={a.id} className="rounded-xl bg-brand-mint p-3 text-sm"><p className="whitespace-pre-line">{a.body}</p><p className="mt-1 text-xs font-semibold">{a.author_name} · {a.pharmacy_name}</p></div>
                ))}
                <ActionForm action={answerQuestion} className="space-y-2">
                  <input type="hidden" name="question_id" value={r.id} /><input type="hidden" name="pharmacy_id" value={ph.id} />
                  <Textarea name="body" rows={3} required minLength={10} maxLength={2000} placeholder={r.mine ? "Modifier ma réponse…" : "Votre réponse…"} aria-label="Réponse" />
                  <SubmitButton size="sm">{r.mine ? "Mettre à jour ma réponse" : "Répondre"}</SubmitButton>
                </ActionForm>
              </li>
            ))}
          </ul>
        )}
        <Pagination basePath="/pharmacien/questions" params={{ vue: filter }} page={range.page} total={Number(rows[0]?.total_count ?? 0)} size={15} />
      </div>
    </>
  );
}
