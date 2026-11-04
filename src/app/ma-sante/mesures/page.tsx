import Link from "next/link";
import { Activity, Trash2 } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SanteNav, PRIVACY_NOTE } from "@/components/sante-perso/nav";
import { MeasureChart } from "@/components/sante-perso/measure-chart";
import { PrintButton } from "@/components/sante-perso/print-button";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Field, Input, Select } from "@/components/ui/input";
import { addMeasure, deleteMeasure } from "@/app/actions/health-tools";
import { cn } from "@/lib/utils";

export const metadata = { title: "Tension et glycémie" };

type M = { id: string; kind: string; systolic: number | null; diastolic: number | null; pulse: number | null; glucose_gl: number | null; context: string | null; measured_at: string; note: string | null };
const CTX: Record<string, string> = { a_jeun: "à jeun", apres_repas: "après repas", autre: "autre" };
const dt = (t: string) => new Date(t).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });

export default async function Measures({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  await requireUser("/ma-sante/mesures");
  const sp = await searchParams;
  const kind = sp.type === "glycemie" ? "glycemie" : "tension";
  const supabase = await createClient();
  const { data } = await supabase.from("health_measures").select("*").eq("kind", kind).order("measured_at", { ascending: false }).limit(200);
  const list = (data as M[] | null) ?? [];
  const chron = [...list].slice(0, 60).reverse();
  const now = new Date().toISOString().slice(0, 16);
  return (
    <div className="container-page max-w-3xl space-y-5 py-6">
      <header className="space-y-2 print:hidden">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-brand-deep"><Activity className="size-7 text-primary" aria-hidden /> Tension et glycémie</h1>
        <p className="text-muted-foreground">Notez vos mesures et montrez le graphique ou le tableau à votre médecin. SantéProxi n&apos;interprète pas les valeurs : seul votre médecin le peut.</p>
      </header>
      <div className="print:hidden"><SanteNav current="/ma-sante/mesures" /></div>
      <nav aria-label="Type de mesure" className="flex gap-2 print:hidden">
        {[["tension", "Tension artérielle"], ["glycemie", "Glycémie"]].map(([k, l]) => (
          <Link key={k} prefetch={false} href={`/ma-sante/mesures${k === "glycemie" ? "?type=glycemie" : ""}`} aria-current={kind === k ? "page" : undefined}
            className={cn("rounded-full border px-4 py-2 text-sm font-medium", kind === k ? "border-primary bg-primary text-white" : "bg-white")}>{l}</Link>
        ))}
      </nav>

      <section className="rounded-2xl border bg-white p-5 print:hidden">
        <h2 className="text-lg font-bold text-brand-deep">Nouvelle mesure</h2>
        <ActionForm action={addMeasure} className="mt-3 grid gap-3 sm:grid-cols-3" resetOnSuccess>
          <input type="hidden" name="kind" value={kind} />
          {kind === "tension" ? (
            <>
              <Field label="Systolique (grand chiffre)" htmlFor="sy"><Input id="sy" name="systolic" inputMode="decimal" placeholder="ex. 130 ou 13" required /></Field>
              <Field label="Diastolique (petit chiffre)" htmlFor="di"><Input id="di" name="diastolic" inputMode="decimal" placeholder="ex. 80 ou 8" required /></Field>
              <Field label="Pouls (facultatif)" htmlFor="pu"><Input id="pu" name="pulse" inputMode="numeric" placeholder="ex. 72" /></Field>
            </>
          ) : (
            <>
              <Field label="Valeur" htmlFor="gl"><Input id="gl" name="glucose" inputMode="decimal" placeholder="ex. 1,05" required /></Field>
              <Field label="Unité" htmlFor="un"><Select id="un" name="unit" defaultValue="gl"><option value="gl">g/L</option><option value="mgdl">mg/dL</option><option value="mmol">mmol/L</option></Select></Field>
              <Field label="Moment" htmlFor="cx"><Select id="cx" name="context" defaultValue="a_jeun"><option value="a_jeun">À jeun</option><option value="apres_repas">Après un repas</option><option value="autre">Autre</option></Select></Field>
            </>
          )}
          <Field label="Date et heure" htmlFor="at"><Input id="at" name="measured_at" type="datetime-local" defaultValue={now} max={now} /></Field>
          <div className="sm:col-span-2"><Field label="Note (facultatif)" htmlFor="no"><Input id="no" name="note" maxLength={200} placeholder="ex. après le sport, oubli du traitement…" /></Field></div>
          <SubmitButton className="w-fit">Enregistrer</SubmitButton>
        </ActionForm>
      </section>

      <section className="space-y-3 rounded-2xl border bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-brand-deep">{kind === "tension" ? "Ma tension artérielle" : "Ma glycémie"}</h2>
          <div className="print:hidden"><PrintButton /></div>
        </div>
        <MeasureChart unit={kind === "tension" ? "mmHg" : "g/L"} labels={kind === "tension" ? ["Systolique", "Diastolique"] : ["Glycémie"]}
          points={chron.map((m) => kind === "tension" ? { t: m.measured_at, a: m.systolic!, b: m.diastolic } : { t: m.measured_at, a: Number(m.glucose_gl) })} />
        {list.length === 0 ? <p className="text-sm text-muted-foreground">Aucune mesure pour le moment.</p> : (
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-muted-foreground"><th className="py-2">Date</th><th className="py-2">Valeur</th><th className="py-2">Note</th><th className="print:hidden" /></tr></thead>
            <tbody className="divide-y">
              {list.map((m) => (
                <tr key={m.id}>
                  <td className="py-2 pr-2 tabular-nums">{dt(m.measured_at)}</td>
                  <td className="py-2 pr-2 font-semibold tabular-nums">{kind === "tension" ? `${m.systolic}/${m.diastolic}${m.pulse ? ` · pouls ${m.pulse}` : ""}` : `${String(m.glucose_gl).replace(".", ",")} g/L${m.context ? ` (${CTX[m.context]})` : ""}`}</td>
                  <td className="py-2 pr-2 text-muted-foreground">{m.note}</td>
                  <td className="py-2 text-right print:hidden">
                    <ActionForm action={deleteMeasure}><input type="hidden" name="id" value={m.id} /><button type="submit" className="rounded p-1.5 text-muted-foreground hover:bg-red-50 hover:text-destructive" aria-label="Supprimer la mesure"><Trash2 className="size-4" /></button></ActionForm>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-950 print:hidden">Malaise, douleur dans la poitrine, difficulté à parler ou à bouger un bras : appelez immédiatement les <Link prefetch={false} href="/urgences" className="font-semibold underline">urgences</Link>.</p>
      <p className="text-xs text-muted-foreground print:hidden">{PRIVACY_NOTE}</p>
    </div>
  );
}
