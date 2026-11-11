import { createClient } from "@/lib/supabase/server";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { setCareFollowSwitch } from "@/app/actions/v028";

export const metadata = { title: "Suivi des maladies chroniques — administration" };
export const dynamic = "force-dynamic";

export default async function AdminSuivi() {
  const supabase = await createClient();
  const [{ data: on }, { count: reminders }, { count: follows }] = await Promise.all([
    supabase.rpc("care_follow_enabled"),
    supabase.from("measure_reminders").select("id", { count: "exact", head: true }),
    supabase.from("care_follows").select("id", { count: "exact", head: true }),
  ]);
  return (
    <div className="max-w-3xl space-y-5">
      <h1 className="text-2xl font-bold">Suivi des maladies chroniques</h1>
      <p className="text-sm text-muted-foreground">Les rappels de mesure sont ouverts à tous les patients. Le suivi des mesures par un médecin est fermé par défaut : ouvrez-le seulement après accord d&apos;un partenaire clinique sur son fonctionnement. Vous ne voyez ici aucune mesure ni aucun nom : seulement des compteurs.</p>
      <p className="rounded-xl border bg-white p-4 text-sm">État : <strong>{on ? "ouvert" : "fermé"}</strong>{typeof reminders === "number" ? ` · ${reminders} rappel(s) actif(s) visibles par vous` : ""}{typeof follows === "number" ? ` · ${follows} suivi(s) vous concernant` : ""}</p>
      {on ? (
        <ActionForm action={setCareFollowSwitch}><input type="hidden" name="on" value="0" /><SubmitButton variant="outline" confirm="Fermer le suivi aux nouvelles demandes ? Les suivis en cours continuent.">Fermer aux nouvelles demandes</SubmitButton></ActionForm>
      ) : (
        <ActionForm action={setCareFollowSwitch} className="space-y-3 rounded-xl border bg-white p-4"><input type="hidden" name="on" value="1" />
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="partenaire" className="mt-1 size-4" required /><span>Je confirme qu&apos;un partenaire clinique a validé l&apos;ouverture du suivi des mesures par les médecins.</span></label>
          <SubmitButton>Ouvrir le suivi par un médecin</SubmitButton></ActionForm>
      )}
    </div>
  );
}
