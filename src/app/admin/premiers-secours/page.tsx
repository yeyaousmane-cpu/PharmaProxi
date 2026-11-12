import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Input, Select } from "@/components/ui/input";
import { moderateFirstAid, saveFirstAidOrg } from "@/app/actions/v037";
import { CAMPAIGN_AUDIENCE, PARTNERSHIP } from "@/lib/first-aid";

export const metadata = { title: "Premiers secours — administration" };
export const dynamic = "force-dynamic";

type Org = { id: string; name: string; partnership_status: string; partnership_note: string | null; published: boolean };
type Item = { id: string; title: string; starts_on: string; status: string; first_aid_organizations: { name: string } | null; audience?: string };

export default async function AdminFirstAid() {
  const supabase = await createClient();
  const [o, c, k] = await Promise.all([
    supabase.from("first_aid_organizations").select("id, name, partnership_status, partnership_note, published").order("name"),
    supabase.from("first_aid_courses").select("id, title, starts_on, status, first_aid_organizations(name)").eq("status", "en_attente").order("starts_on"),
    supabase.from("first_aid_campaigns").select("id, title, starts_on, status, audience, first_aid_organizations(name)").eq("status", "en_attente").order("starts_on"),
  ]);
  const orgs = (o.data ?? []) as Org[]; const courses = (c.data ?? []) as unknown as Item[]; const camps = (k.data ?? []) as unknown as Item[];
  const Mod = ({ x, table }: { x: Item; table: string }) => (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-white p-3 text-sm"><span>{x.title} · {x.first_aid_organizations?.name ?? "SantéProxi"} · {formatDate(x.starts_on)}{x.audience ? ` · ${CAMPAIGN_AUDIENCE[x.audience]}` : ""}</span>
      <ActionForm action={moderateFirstAid} className="flex gap-2"><input type="hidden" name="id" value={x.id} /><input type="hidden" name="table" value={table} />
        <SubmitButton size="sm" name="status" value="publiee">Publier</SubmitButton><SubmitButton size="sm" variant="outline" name="status" value="refusee">Refuser</SubmitButton></ActionForm></li>);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-brand-deep">Premiers secours & citoyens sauveteurs</h1>
      <p className="text-sm">Vérification des formations : <Link prefetch={false} href="/premiers-secours/espace-formateur" className="underline">espace formateur</Link> (l&apos;administration voit tous les organismes).</p>
      <section className="space-y-2"><h2 className="text-lg font-bold">Sessions à valider ({courses.length})</h2>{courses.length === 0 ? <p className="text-sm text-muted-foreground">Aucune.</p> : <ul className="space-y-2">{courses.map((x) => <Mod key={x.id} x={x} table="course" />)}</ul>}</section>
      <section className="space-y-2"><h2 className="text-lg font-bold">Campagnes à valider ({camps.length})</h2>{camps.length === 0 ? <p className="text-sm text-muted-foreground">Aucune.</p> : <ul className="space-y-2">{camps.map((x) => <Mod key={x.id} x={x} table="campaign" />)}</ul>}</section>
      <section className="space-y-2"><h2 className="text-lg font-bold">Organismes</h2>
        {orgs.map((g) => (
          <ActionForm key={g.id} action={saveFirstAidOrg} className="grid gap-2 rounded-xl border bg-white p-3 text-sm sm:grid-cols-2"><input type="hidden" name="id" value={g.id} />
            <p className="font-semibold sm:col-span-2">{g.name} — {PARTNERSHIP[g.partnership_status][0]}</p>
            <label>Statut du partenariat<Select name="partnership_status" defaultValue={g.partnership_status} className="mt-1 h-10">{Object.entries(PARTNERSHIP).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</Select></label>
            <label>Référence de l&apos;accord (obligatoire si signé)<Input name="partnership_note" defaultValue={g.partnership_note ?? ""} className="mt-1 h-10" /></label>
            <label>Ajouter un membre habilité (e-mail du compte)<Input name="member_email" type="email" className="mt-1 h-10" /></label>
            <label className="flex items-center gap-2"><input type="checkbox" name="published" defaultChecked={g.published} className="size-4" /> Fiche publiée</label>
            <div><SubmitButton size="sm">Enregistrer</SubmitButton></div>
          </ActionForm>))}
      </section>
    </div>
  );
}
