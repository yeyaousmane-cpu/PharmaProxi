import { labContext } from "@/lib/lab-server";
import { LabShell, NoLab } from "@/components/lab/lab-shell";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { saveHomeService } from "@/app/actions/labs";

export const metadata = { title: "Espace laboratoire — prélèvement à domicile", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function LabHome({ searchParams }: { searchParams: Promise<{ labo?: string }> }) {
  const sp = await searchParams;
  const ctx = await labContext("/laboratoire/domicile", sp.labo);
  if (!ctx.current) return <NoLab />;
  const fid = ctx.current.facility_id;
  const [{ data: svc }, { data: providers }] = await Promise.all([
    ctx.supabase.from("lab_home_service").select("*").eq("facility_id", fid).maybeSingle(),
    ctx.supabase.from("home_care_providers").select("id, name").contains("care_types", ["prelevements"]).order("name"),
  ]);
  return (
    <LabShell labs={ctx.labs} current={ctx.current} active="/domicile">
      <section className="space-y-3 rounded-2xl border bg-white p-4 sm:p-5">
        <h2 className="text-lg font-bold text-brand-deep">Prélèvement à domicile</h2>
        <p className="text-sm text-muted-foreground">Une infirmière de votre laboratoire, ou de votre partenaire de soins à domicile, se déplace chez le patient et rapporte l&apos;échantillon au laboratoire. <strong>Le respect des conditions de prélèvement, de conservation et de transport reste sous la responsabilité du laboratoire et de son partenaire.</strong> SantéProxi transmet seulement la demande.</p>
        <ActionForm action={saveHomeService} className="grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="facility_id" value={fid} />
          <label className="flex items-center gap-2 text-sm font-semibold sm:col-span-2"><input type="checkbox" name="enabled" defaultChecked={svc?.enabled} className="size-4" /> Nous proposons le prélèvement à domicile</label>
          <Field label="Frais de déplacement (FCFA)" htmlFor="fee"><Input id="fee" name="fee_xof" inputMode="numeric" defaultValue={svc?.fee_xof ?? ""} placeholder="ex. 3000" /></Field>
          <Field label="Zones desservies" htmlFor="ar"><Input id="ar" name="areas" maxLength={300} defaultValue={svc?.areas ?? ""} placeholder="ex. Bamako, communes I à VI" /></Field>
          <Field label="Jours et heures de passage" htmlFor="hr"><Input id="hr" name="hours" maxLength={200} defaultValue={svc?.hours ?? ""} placeholder="ex. lundi au samedi, 7 h – 11 h" /></Field>
          <Field label="Partenaire (soins à domicile)" htmlFor="pp" hint="Structure de l'annuaire des soins à domicile qui réalise les prélèvements pour vous, s'il y en a une">
            <Select id="pp" name="partner_provider_id" defaultValue={svc?.partner_provider_id ?? ""}><option value="">Notre propre personnel</option>{(providers ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
          </Field>
          <Field label="Nom du partenaire (s'il n'est pas dans la liste)" htmlFor="pn"><Input id="pn" name="partner_name" maxLength={120} defaultValue={svc?.partner_name ?? ""} /></Field>
          <Field label="Conditions à connaître (ordonnance, jeûne…)" htmlFor="cd" className="sm:col-span-2"><Textarea id="cd" name="conditions" rows={2} maxLength={500} defaultValue={svc?.conditions ?? ""} /></Field>
          <SubmitButton size="sm" className="w-fit">Enregistrer</SubmitButton>
        </ActionForm>
      </section>
    </LabShell>
  );
}
