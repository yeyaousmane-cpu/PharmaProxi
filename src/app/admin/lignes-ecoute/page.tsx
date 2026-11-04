import { createClient } from "@/lib/supabase/server";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Field, Input, Select } from "@/components/ui/input";
import { addSupportLine, toggleSupportLine } from "@/app/actions/v023";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Lignes d'écoute — administration" };
export const dynamic = "force-dynamic";

export default async function AdminLines() {
  const supabase = await createClient();
  const { data } = await supabase.from("support_lines").select("*").order("active", { ascending: false }).order("sort");
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Santé mentale : lignes d&apos;écoute et d&apos;aide</h1>
      <p className="text-sm text-muted-foreground">N&apos;ajoutez qu&apos;un numéro vérifié (appel de test, site ou document officiel), avec sa source. Revérifiez-les régulièrement : un numéro qui ne répond plus est dangereux pour une personne en détresse.</p>
      <section className="rounded-2xl border bg-white p-4">
        <ActionForm action={addSupportLine} className="grid gap-3 sm:grid-cols-2" resetOnSuccess>
          <Field label="Nom du service" htmlFor="nm" required><Input id="nm" name="name" maxLength={120} required /></Field>
          <Field label="Numéro" htmlFor="ph" required><Input id="ph" name="phone" maxLength={30} required /></Field>
          <Field label="Horaires" htmlFor="hr"><Input id="hr" name="hours" maxLength={120} placeholder="ex. 24 h/24, gratuit" /></Field>
          <Field label="Thème" htmlFor="tp"><Select id="tp" name="topic" defaultValue="sante_mentale"><option value="sante_mentale">Santé mentale</option><option value="violences">Violences</option><option value="addictions">Addictions</option><option value="jeunes">Jeunes</option><option value="autre">Autre</option></Select></Field>
          <Field label="Description courte" htmlFor="ds" className="sm:col-span-2"><Input id="ds" name="description" maxLength={400} /></Field>
          <Field label="Source et vérification" htmlFor="so" required className="sm:col-span-2"><Input id="so" name="source" maxLength={200} required placeholder="ex. site officiel du ministère, appel de test le 5 nov. 2026" /></Field>
          <div className="sm:col-span-2"><SubmitButton>Ajouter</SubmitButton></div>
        </ActionForm>
      </section>
      <ul className="divide-y rounded-2xl border bg-white text-sm">{(data ?? []).map((l) => (
        <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
          <span><strong>{l.name}</strong> · {l.phone} · {l.source} · vérifié le {formatDate(l.verified_at)} {!l.active && <em className="text-muted-foreground">(masqué)</em>}</span>
          <ActionForm action={toggleSupportLine}><input type="hidden" name="id" value={l.id} /><input type="hidden" name="active" value={l.active ? "0" : "1"} /><SubmitButton size="sm" variant="outline">{l.active ? "Masquer" : "Revérifié : afficher"}</SubmitButton></ActionForm>
        </li>))}
        {(data ?? []).length === 0 && <li className="p-3 text-muted-foreground">Aucune ligne enregistrée.</li>}</ul>
    </div>
  );
}
