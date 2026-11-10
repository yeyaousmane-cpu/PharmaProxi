import { createClient } from "@/lib/supabase/server";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Field, Input, Select } from "@/components/ui/input";
import { setAuthority, setCanPublish } from "@/app/actions/authorities";
import { SCOPES } from "@/lib/authorities";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Autorités — administration" };

export default async function AdminAuthorities() {
  const supabase = await createClient();
  const [{ data: members }, { data: log }] = await Promise.all([
    supabase.from("authority_members").select("user_id, scope, organisation, title, active, can_publish, created_at, profiles!authority_members_user_id_fkey(full_name)").order("created_at", { ascending: false }),
    supabase.from("authority_access_log").select("id, scope, action, params, at, profiles(full_name)").order("at", { ascending: false }).limit(100),
  ]);
  type P = { full_name: string | null } | { full_name: string | null }[] | null;
  const nm = (p: P) => (Array.isArray(p) ? p[0]?.full_name : p?.full_name) ?? "—";
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Accès des autorités de santé</h1>
      <p className="text-sm text-muted-foreground">À n&apos;accorder qu&apos;aux personnes désignées par écrit par leur institution, dans le cadre d&apos;une convention. La personne doit d&apos;abord créer son compte SantéProxi avec son adresse e-mail professionnelle.</p>
      <section className="rounded-2xl border bg-white p-4">
        <ActionForm action={setAuthority} className="grid gap-3 sm:grid-cols-4" resetOnSuccess>
          <Field label="E-mail du compte" htmlFor="em"><Input id="em" name="email" type="email" required /></Field>
          <Field label="Institution" htmlFor="sc"><Select id="sc" name="scope" defaultValue="ministere">{Object.entries(SCOPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
          <Field label="Service ou organisation" htmlFor="or"><Input id="or" name="organisation" required maxLength={120} placeholder="ex. Direction générale de la santé" /></Field>
          <Field label="Fonction (facultatif)" htmlFor="ti"><Input id="ti" name="title" maxLength={120} /></Field>
          <SubmitButton size="sm" className="w-fit">Accorder l&apos;accès</SubmitButton>
        </ActionForm>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-bold">Membres</h2>
        <ul className="divide-y rounded-2xl border bg-white text-sm">{(members ?? []).map((m) => (
          <li key={m.user_id} className="flex flex-wrap items-center justify-between gap-2 p-3">
            <span><strong>{nm(m.profiles as P)}</strong> · {SCOPES[m.scope]} · {m.organisation}{m.title ? ` · ${m.title}` : ""} {!m.active && <em className="text-muted-foreground">(accès retiré)</em>}</span>
            {m.active && (
              <ActionForm action={setCanPublish} className="flex items-center gap-2">
                <input type="hidden" name="user_id" value={m.user_id} /><input type="hidden" name="value" value={m.can_publish ? "0" : "1"} />
                <span className="text-xs text-muted-foreground">{m.can_publish ? "Peut publier des communiqués" : "Ne publie pas"}</span>
                <SubmitButton size="sm" variant="outline" confirm={m.can_publish ? "Retirer le droit de publier ?" : "Autoriser la publication de communiqués ? À faire seulement après la signature de la convention."}>{m.can_publish ? "Retirer la publication" : "Autoriser à publier"}</SubmitButton>
              </ActionForm>
            )}
          </li>))}</ul>
        <ActionForm action={setAuthority} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="revoke" value="1" /><input type="hidden" name="scope" value="autre" /><input type="hidden" name="organisation" value="Accès retiré" />
          <label className="text-sm">E-mail<Input name="email" type="email" required className="mt-1 h-9 w-72" /></label>
          <SubmitButton size="sm" variant="outline" confirm="Retirer l'accès de ce compte ?">Retirer l&apos;accès</SubmitButton>
        </ActionForm>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-bold">Journal des consultations (100 dernières)</h2>
        <div className="overflow-x-auto rounded-2xl border bg-white"><table className="w-full min-w-[600px] text-sm">
          <thead><tr className="border-b text-start text-xs text-muted-foreground"><th className="p-2">Date</th><th>Personne</th><th>Institution</th><th>Tableau</th><th>Filtres</th></tr></thead>
          <tbody>{(log ?? []).map((l) => <tr key={l.id} className="border-b last:border-0"><td className="p-2">{formatDateTime(l.at)}</td><td>{nm(l.profiles as P)}</td><td>{l.scope}</td><td>{l.action}</td><td className="text-xs text-muted-foreground">{JSON.stringify(l.params)}</td></tr>)}</tbody>
        </table></div>
      </section>
    </div>
  );
}
