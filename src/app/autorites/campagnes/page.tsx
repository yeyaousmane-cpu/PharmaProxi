import { authorityContext } from "@/lib/authority-server";
import { getGeo } from "@/lib/geo";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { saveCampaign } from "@/app/actions/authorities";
import { CAN, fmtN } from "@/lib/authorities";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Campagnes de don de sang — Autorités", robots: { index: false } };

type C = { id: string; title: string; organizer: string; region_id: string | null; place: string; starts_on: string; start_time: string | null; end_time: string | null; details: string | null; source_url: string; published: boolean; notified_at: string | null };

function CampaignForm({ c, regions }: { c?: C; regions: { id: string; name: string }[] }) {
  const u = c?.id ?? "new";
  return (
    <ActionForm action={saveCampaign} className="grid gap-3 sm:grid-cols-2" resetOnSuccess={!c} labels={{ title: "Titre", place: "Lieu", starts_on: "Date", source_url: "Source" }}>
      {c && <input type="hidden" name="id" value={c.id} />}
      <Field label="Titre" htmlFor={`t-${u}`} required><Input id={`t-${u}`} name="title" maxLength={140} defaultValue={c?.title} placeholder="ex. Collecte au lycée Askia Mohamed" required /></Field>
      <Field label="Organisateur" htmlFor={`o-${u}`}><Input id={`o-${u}`} name="organizer" maxLength={120} defaultValue={c?.organizer ?? "CNTS"} /></Field>
      <Field label="Région" htmlFor={`r-${u}`}><Select id={`r-${u}`} name="region_id" defaultValue={c?.region_id ?? ""}><option value="">Tout le Mali</option>{regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></Field>
      <Field label="Lieu exact" htmlFor={`p-${u}`} required><Input id={`p-${u}`} name="place" maxLength={200} defaultValue={c?.place} required /></Field>
      <Field label="Date" htmlFor={`d-${u}`} required><Input id={`d-${u}`} name="starts_on" type="date" defaultValue={c?.starts_on} required /></Field>
      <div className="flex gap-2"><Field label="De" htmlFor={`s-${u}`}><Input id={`s-${u}`} name="start_time" type="time" defaultValue={c?.start_time ?? "08:00"} /></Field><Field label="À" htmlFor={`e-${u}`}><Input id={`e-${u}`} name="end_time" type="time" defaultValue={c?.end_time ?? "14:00"} /></Field></div>
      <Field label="Lien vers l'annonce officielle (obligatoire)" htmlFor={`u-${u}`} required className="sm:col-span-2"><Input id={`u-${u}`} name="source_url" type="url" defaultValue={c?.source_url} placeholder="https://" required /></Field>
      <Field label="Précisions (facultatif)" htmlFor={`x-${u}`} className="sm:col-span-2"><Textarea id={`x-${u}`} name="details" rows={2} maxLength={1000} defaultValue={c?.details ?? ""} /></Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="published" defaultChecked={c ? c.published : true} className="size-4" /> Publiée</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="notify" defaultChecked={!c?.notified_at} disabled={Boolean(c?.notified_at)} className="size-4" /> {c?.notified_at ? "Donneurs déjà prévenus" : "Prévenir les donneurs de la région"}</label>
      <SubmitButton size="sm" className="w-fit sm:col-span-2">{c ? "Enregistrer" : "Publier la campagne"}</SubmitButton>
    </ActionForm>
  );
}

export default async function Campaigns() {
  const ctx = await authorityContext("/autorites/campagnes");
  if (!ctx.ok) return null;
  if (!ctx.admin && !CAN.campaigns.includes(ctx.scope)) return <p className="rounded-xl border bg-white p-4 text-sm">Les campagnes sont gérées par le CNTS et le ministère.</p>;
  const [{ data }, geo] = await Promise.all([ctx.supabase.from("blood_campaigns").select("*").order("starts_on", { ascending: false }).limit(30), getGeo()]);
  const rows = (data ?? []) as C[];
  const going = await Promise.all(rows.map(async (c) => (await ctx.supabase.rpc("campaign_going", { p_campaign: c.id })).data as number | null));
  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-2xl border bg-white p-4 sm:p-5">
        <h2 className="text-lg font-bold text-brand-deep">Nouvelle collecte</h2>
        <p className="text-sm text-muted-foreground">La campagne apparaît sur la page Don de sang. Les personnes inscrites comme donneurs dans la région reçoivent une notification, une seule fois. Elles peuvent indiquer « J&apos;y serai » : le nombre s&apos;affiche à partir de 10.</p>
        <CampaignForm regions={geo.regions} />
      </section>
      {rows.length > 0 && (
        <ul className="space-y-3">{rows.map((c, i) => (
          <li key={c.id} className="space-y-2 rounded-2xl border bg-white p-4 text-sm">
            <p className="font-bold text-brand-deep">{c.title} {!c.published && <span className="text-xs font-normal text-muted-foreground">(non publiée)</span>}</p>
            <p>{formatDate(c.starts_on)}{c.start_time ? ` · ${c.start_time}–${c.end_time ?? ""}` : ""} · {c.place} · participants annoncés : {fmtN(going[i])}</p>
            <details><summary className="cursor-pointer text-primary">Modifier</summary><div className="mt-2"><CampaignForm c={c} regions={geo.regions} /></div></details>
          </li>))}</ul>
      )}
    </div>
  );
}
