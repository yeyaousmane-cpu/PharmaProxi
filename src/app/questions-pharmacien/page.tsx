import Link from "next/link";
import { MessageCircleQuestion, Search, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { getSession } from "@/lib/auth";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Pagination, pageRange } from "@/components/pagination";
import { askPharmacist } from "@/app/actions/questions";
import { ABOUT_LABEL, ANSWER_DISCLAIMER } from "@/lib/questions";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Questions à un pharmacien", description: "Posez gratuitement votre question sur un médicament : un pharmacien d'une pharmacie vérifiée vous répond." };
export const revalidate = 0;

type Q = { id: string; question: string; about: string; answered_at: string; answers: { author: string; pharmacy: string; body: string; at: string }[]; total_count: number };

export default async function QuestionsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 80);
  const range = pageRange(sp.page, 15);
  const session = await getSession();
  let list: Q[] = [];
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    list = ((await supabase.rpc("public_pharmacist_questions", { p_query: q || null, p_limit: 15, p_offset: range.from })).data as Q[] | null) ?? [];
  }
  const total = list[0]?.total_count ?? 0;
  return (
    <div className="container-page max-w-3xl space-y-6 py-6">
      <header className="space-y-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-brand-deep"><MessageCircleQuestion className="size-7 text-primary" aria-hidden /> Questions à un pharmacien</h1>
        <p className="text-muted-foreground">Une question sur un médicament, une posologie, un effet indésirable, une interaction ? Posez-la gratuitement : un pharmacien d&apos;une pharmacie vérifiée vous répond, sous son nom.</p>
      </header>

      <section className="rounded-2xl border bg-white p-5">
        <h2 className="text-lg font-bold text-brand-deep">Poser ma question</h2>
        {session ? (
          <ActionForm action={askPharmacist} className="mt-3 space-y-3" resetOnSuccess>
            <Field label="Votre question" htmlFor="qq"><Textarea id="qq" name="question" rows={4} required minLength={15} maxLength={1000} placeholder="ex. Puis-je prendre de l'ibuprofène avec mon traitement contre la tension ?" /></Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="La question concerne" htmlFor="ab"><Select id="ab" name="about" defaultValue="moi">{Object.entries(ABOUT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
              <label className="flex items-start gap-2 self-end text-sm"><input type="checkbox" name="allow_public" defaultChecked className="mt-0.5 size-4" /> J&apos;accepte que la question et sa réponse soient publiées <strong>sans mon nom</strong>, pour aider d&apos;autres personnes</label>
            </div>
            <p className="text-xs text-muted-foreground">N&apos;écrivez ni votre nom ni votre numéro. Les pharmaciens ne voient pas qui pose la question. En cas d&apos;urgence, n&apos;attendez pas de réponse : <Link prefetch={false} href="/urgences" className="underline">urgences</Link>.</p>
            <SubmitButton>Envoyer ma question</SubmitButton>
          </ActionForm>
        ) : (
          <p className="mt-2 text-sm"><Link prefetch={false} href="/connexion?suite=/questions-pharmacien" className={cn(buttonVariants({ size: "sm" }))}>Se connecter pour poser une question</Link> <span className="ml-2 text-muted-foreground">(pour recevoir la réponse)</span></p>
        )}
        {session && <p className="mt-3 text-sm"><Link prefetch={false} href="/questions-pharmacien/mes-questions" className="font-semibold text-primary underline">Mes questions et les réponses</Link></p>}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">Questions déjà répondues</h2>
        <form method="get" className="flex gap-2" role="search">
          <label htmlFor="q" className="sr-only">Rechercher</label>
          <Input id="q" name="q" defaultValue={q} placeholder="ex. paracétamol, grossesse, antibiotique" />
          <Button type="submit"><Search aria-hidden /> Chercher</Button>
        </form>
        {list.length === 0 ? <p className="rounded-xl border bg-white p-4 text-sm text-muted-foreground">{q ? "Aucune question ne correspond." : "Les premières réponses des pharmaciens apparaîtront ici."}</p> : (
          <ul className="space-y-3">
            {list.map((x) => (
              <li key={x.id} className="rounded-2xl border bg-white p-4">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><Badge className="bg-muted text-muted-foreground">{ABOUT_LABEL[x.about] ?? x.about}</Badge>{formatDate(x.answered_at)}</div>
                <p className="mt-2 font-semibold text-brand-deep">{x.question}</p>
                {x.answers.map((a, i) => (
                  <div key={i} className="mt-3 rounded-xl bg-brand-mint p-3 text-sm">
                    <p className="whitespace-pre-line">{a.body}</p>
                    <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-brand-deep"><ShieldCheck className="size-3.5" aria-hidden />{a.author} · {a.pharmacy}</p>
                  </div>
                ))}
              </li>
            ))}
          </ul>
        )}
        <Pagination basePath="/questions-pharmacien" params={{ q: q || undefined }} page={range.page} total={Number(total)} size={15} />
        <p className="text-xs text-muted-foreground">{ANSWER_DISCLAIMER}</p>
      </section>
    </div>
  );
}
