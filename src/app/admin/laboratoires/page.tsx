import { createClient } from "@/lib/supabase/server";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Field, Input, Select } from "@/components/ui/input";
import { grantLab } from "@/app/actions/labs";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Laboratoires — administration" };

export default async function AdminLabs() {
  const supabase = await createClient();
  const [{ data: reqs }, { data: labs }, { data: members }, { data: sugg }] = await Promise.all([
    supabase.from("lab_access_requests").select("*, profiles(full_name), regions(name)").order("status").order("created_at", { ascending: false }).limit(100),
    supabase.from("facility_listings").select("id, name, city_label, public_code").eq("kind", "laboratoire").order("name").limit(1000),
    supabase.from("facility_members").select("facility_id, user_id, role, facility_listings(name), profiles!facility_members_user_id_fkey(full_name)").limit(500),
    supabase.from("exam_suggestions").select("id, name, category, status, created_at, facility_listings(name)").order("created_at", { ascending: false }).limit(50),
  ]);
  type One<T> = T | T[] | null;
  const one = <T,>(v: One<T>) => (Array.isArray(v) ? v[0] : v) ?? null;
  const LabSelect = ({ id, def }: { id: string; def?: string | null }) => (
    <Select id={id} name="facility_id" defaultValue={def ?? ""} required><option value="" disabled>Laboratoire de l&apos;annuaire…</option>{(labs ?? []).map((l) => <option key={l.id} value={l.id}>{l.name}{l.city_label ? ` — ${l.city_label}` : ""} ({l.public_code})</option>)}</Select>
  );
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Laboratoires</h1>
      <p className="text-sm text-muted-foreground">Vérifiez l&apos;autorisation d&apos;ouverture (arrêté, agrément) avant d&apos;accorder l&apos;accès. Si le laboratoire n&apos;est pas dans l&apos;annuaire, importez-le d&apos;abord (Annuaire médical).</p>
      <section className="space-y-2">
        <h2 className="text-lg font-bold">Demandes d&apos;accès</h2>
        <ul className="space-y-2">{(reqs ?? []).map((r) => (
          <li key={r.id} className="space-y-2 rounded-xl border bg-white p-3 text-sm">
            <p><strong>{r.lab_name}</strong> · {one(r.regions as One<{ name: string }>)?.name ?? "—"} · {r.phone} · autorisation : {r.authorization_ref} · {one(r.profiles as One<{ full_name: string | null }>)?.full_name ?? "—"}{r.role_in_lab ? ` (${r.role_in_lab})` : ""} · {formatDateTime(r.created_at)} · <em>{r.status}</em></p>
            {r.message && <p className="text-muted-foreground">{r.message}</p>}
            {r.status === "nouvelle" && (
              <ActionForm action={grantLab} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="request_id" value={r.id} />
                                <label className="text-xs">Laboratoire<LabSelect id={`f-${r.id}`} def={r.facility_id} /></label>
                <SubmitButton size="sm">Accorder</SubmitButton>
              </ActionForm>
            )}
          </li>))}</ul>
      </section>
      <section className="space-y-2 rounded-2xl border bg-white p-4">
        <h2 className="text-lg font-bold">Accorder un accès directement</h2>
        <ActionForm action={grantLab} className="grid gap-3 sm:grid-cols-3" resetOnSuccess>
          <Field label="E-mail du compte" htmlFor="em"><Input id="em" name="email" type="email" required /></Field>
          <Field label="Laboratoire" htmlFor="fl" className="sm:col-span-2"><LabSelect id="fl" /></Field>
          <SubmitButton size="sm" className="w-fit">Accorder</SubmitButton>
        </ActionForm>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-bold">Membres</h2>
        <ul className="divide-y rounded-2xl border bg-white text-sm">{(members ?? []).map((m) => <li key={`${m.facility_id}-${m.user_id}`} className="p-3">{one(m.facility_listings as One<{ name: string }>)?.name} · {one(m.profiles as One<{ full_name: string | null }>)?.full_name ?? "—"} · {m.role}</li>)}</ul>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-bold">Analyses proposées par les laboratoires</h2>
        <p className="text-xs text-muted-foreground">À ajouter au catalogue (table medical_exams) après vérification du nom.</p>
        <ul className="divide-y rounded-2xl border bg-white text-sm">{(sugg ?? []).map((x) => <li key={x.id} className="p-3">{x.name} · {x.category} · {one(x.facility_listings as One<{ name: string }>)?.name ?? "—"} · {formatDateTime(x.created_at)}</li>)}</ul>
      </section>
    </div>
  );
}
