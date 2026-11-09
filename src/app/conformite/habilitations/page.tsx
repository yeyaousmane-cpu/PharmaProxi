import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { setComplianceMember } from "@/app/actions/v026";

export default async function Members() {
  const supabase = await createClient();
  const { data: role } = await supabase.rpc("compliance_role");
  if (role !== "admin") redirect("/conformite");
  const { data } = await supabase.from("compliance_members").select("user_id,role,created_at");
  const ids = ((data as { user_id: string }[] | null) ?? []).map((m) => m.user_id);
  const { data: people } = ids.length ? await supabase.from("profiles").select("id,full_name").in("id", ids) : { data: [] };
  const name = new Map(((people as { id: string; full_name: string | null }[] | null) ?? []).map((p) => [p.id, p.full_name]));
  return (
    <div className="space-y-3">
      <ActionForm action={setComplianceMember} className="grid gap-2 rounded-2xl border bg-white p-4 text-sm sm:grid-cols-[1fr_14rem_auto] sm:items-end" resetOnSuccess>
        <label>E-mail du compte<input name="email" type="email" required className="mt-1 h-10 w-full rounded-md border px-2" /></label>
        <label>Habilitation<select name="role" className="mt-1 h-10 w-full rounded-md border px-2"><option value="dpo">Correspondant protection des données</option><option value="juriste">Responsable juridique</option><option value="auditeur">Auditeur (lecture seule)</option><option value="">Retirer l&apos;habilitation</option></select></label>
        <SubmitButton size="sm">Appliquer</SubmitButton>
      </ActionForm>
      <ul className="divide-y rounded-2xl border bg-white text-sm">{((data as { user_id: string; role: string }[] | null) ?? []).map((m) => <li key={m.user_id} className="p-3">{name.get(m.user_id) ?? m.user_id} · {m.role}</li>)}
        {ids.length === 0 && <li className="p-3 text-muted-foreground">Aucune habilitation : seuls les administrateurs ont accès.</li>}</ul>
    </div>
  );
}
