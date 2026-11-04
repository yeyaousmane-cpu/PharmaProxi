import { createClient } from "@/lib/supabase/server";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Input, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { saveLexicon } from "@/app/actions/v023";

export const metadata = { title: "Lexique des analyses — administration" };
export const dynamic = "force-dynamic";

export default async function AdminLexique() {
  const supabase = await createClient();
  const { data } = await supabase.from("medical_exams").select("id, name, category, lay_text, lay_status, lay_validated_by").eq("is_active", true).order("lay_status").order("name");
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Lexique des analyses</h1>
      <p className="text-sm text-muted-foreground">Les brouillons ont été rédigés par l&apos;équipe. Un texte n&apos;est publié qu&apos;après relecture par un biologiste ou un médecin : corrigez-le si besoin, puis indiquez son nom et sa qualité (ex. « Dr A. Diarra, biologiste ») et enregistrez. Sans nom de relecteur, le texte reste un brouillon invisible du public.</p>
      <ul className="space-y-3">{(data ?? []).map((e) => (
        <li key={e.id} className="rounded-2xl border bg-white p-4">
          <div className="mb-2 flex flex-wrap items-center gap-2"><strong>{e.name}</strong><Badge className={e.lay_status === "valide" ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900"}>{e.lay_status === "valide" ? `Publié · ${e.lay_validated_by}` : "Brouillon"}</Badge></div>
          <ActionForm action={saveLexicon} className="space-y-2">
            <input type="hidden" name="exam_id" value={e.id} />
            <Textarea name="text" rows={3} maxLength={900} defaultValue={e.lay_text ?? ""} placeholder="À quoi sert cette analyse, comment elle se passe (sans valeurs normales ni interprétation)." aria-label={`Texte pour ${e.name}`} />
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-xs">Relu et validé par<Input name="validated_by" defaultValue={e.lay_validated_by ?? ""} className="mt-1 h-9 w-72" placeholder="Nom et qualité du relecteur" /></label>
              <SubmitButton size="sm">Enregistrer</SubmitButton>
            </div>
          </ActionForm>
        </li>))}</ul>
    </div>
  );
}
