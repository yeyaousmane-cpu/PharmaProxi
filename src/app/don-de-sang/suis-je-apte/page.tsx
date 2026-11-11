import { ClipboardCheck, ExternalLink } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";
import { isDemoEnv } from "@/lib/demo";
import { formatDate } from "@/lib/format";
import { BloodNav } from "@/components/blood/blood-nav";
import { EligibilityQuiz } from "@/components/blood/eligibility-quiz";
import { BEFORE_TIPS, QUESTIONNAIRE_VERSION, SOURCE_OMS } from "@/lib/eligibility";

export const metadata = { title: "Suis-je apte à donner mon sang ?", description: "Une première auto-évaluation avant de vous rendre dans un centre de collecte. Sans diagnostic, sans enregistrement de vos réponses." };
export const dynamic = "force-dynamic";

type Validation = { version: string; validateur: string; organisme: string; date: string } | null;

export default async function Eligibility() {
  const supabase = await createClient();
  const session = await getSession();
  const [{ data: v }, validator] = await Promise.all([
    supabase.from("platform_settings").select("value").eq("key", "blood_questionnaire_validation").maybeSingle(),
    session ? supabase.rpc("is_blood_validator").then((r) => !!r.data) : Promise.resolve(false),
  ]);
  const val = (v?.value ?? null) as Validation;
  const validated = !!val && val.version === QUESTIONNAIRE_VERSION;
  const preview = !validated && (validator || isDemoEnv());
  return (
    <div className="container-page max-w-3xl space-y-5 py-6">
      <BloodNav current="/don-de-sang/suis-je-apte" validator={validator} />
      <header className="space-y-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-brand-deep"><ClipboardCheck className="size-7 text-red-600" aria-hidden /> Suis-je apte à donner mon sang ?</h1>
        <p className="text-muted-foreground">Une première auto-évaluation en quelques questions, avant de vous rendre dans un centre de collecte. Elle ne pose aucun diagnostic : la décision appartient toujours au professionnel de santé du centre.</p>
      </header>
      {validated && <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-950">Questionnaire validé par {val!.validateur} ({val!.organisme}) le {formatDate(val!.date)}.</p>}
      {preview && <p className="rounded-xl border-2 border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"><strong>Version de travail, en attente de validation par le CNTS.</strong> {isDemoEnv() ? "Affichée ici pour la démonstration." : "Visible seulement par les personnes habilitées, pour relecture."} Établie à partir des lignes directrices de l&apos;OMS (2012) ; deux questions sont des propositions à valider.</p>}
      {validated || preview ? <EligibilityQuiz /> : (
        <section className="space-y-2 rounded-2xl border bg-white p-5 text-sm">
          <p className="font-semibold text-brand-deep">Le questionnaire est en cours de validation par le Centre national de transfusion sanguine (CNTS).</p>
          <p>Il sera mis en ligne dès sa validation. En attendant, le centre de collecte vous posera toutes les questions nécessaires le jour du don.</p>
        </section>
      )}
      <section className="space-y-2 rounded-2xl border bg-white p-5 text-sm">
        <h2 className="font-bold text-brand-deep">Avant de venir</h2>
        <ul className="list-disc space-y-1 ps-5">{BEFORE_TIPS.map((t) => <li key={t.text}>{t.text} <a href={t.src.url} target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground underline">Source<ExternalLink className="ms-0.5 inline size-3" aria-hidden /></a></li>)}</ul>
        <p className="text-xs text-muted-foreground">Repères généraux : <a href={SOURCE_OMS.url} target="_blank" rel="noopener noreferrer" className="underline">{SOURCE_OMS.label}</a>. Les règles appliquées au Mali sont celles du CNTS.</p>
      </section>
    </div>
  );
}
