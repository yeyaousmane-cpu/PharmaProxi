import Link from "next/link";
import { Droplet, Phone } from "lucide-react";
import { dossierContext, loadEssentials, loadItems } from "@/lib/dossier/server";
import { DossierGate, DossierShell } from "@/components/dossier/shell";
import { ItemSection } from "@/components/dossier/item-section";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Field, Input, Select } from "@/components/ui/input";
import { saveEssentials } from "@/app/actions/dossier";
import { COVERAGE, nextDonationDate } from "@/lib/dossier/config";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Couverture et soignants" };
export const dynamic = "force-dynamic";

export default async function Contacts({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const sp = await searchParams;
  const ctx = await dossierContext(sp.p, "/ma-sante/dossier/contacts");
  if (ctx.locked) return <DossierGate status={ctx.status} path={`/ma-sante/dossier/contacts${sp.p ? `?p=${sp.p}` : ""}`} />;
  const { supabase, person, persons, status } = ctx;
  const back = `/ma-sante/dossier/contacts${person.is_self ? "" : `?p=${person.id}`}`;
  const [items, ess] = await Promise.all([loadItems(supabase, person.id, ["soignant"]), loadEssentials(supabase, person.id)]);
  const next = nextDonationDate(ess?.last_donation ?? null, person.sex);
  const today = new Date().toISOString().slice(0, 10);
  const pid = person.id;
  return (
    <DossierShell persons={persons} person={person} status={status} current="/contacts">
      <section className="space-y-3 rounded-2xl border bg-white p-4 sm:p-5">
        <h2 className="text-lg font-bold text-brand-deep">Ma couverture santé</h2>
        <ActionForm action={saveEssentials} className="grid gap-3 sm:grid-cols-3">
          <input type="hidden" name="person_id" value={pid} /><input type="hidden" name="_part" value="couverture" />
          <Field label="Couverture" htmlFor={`cv-${pid}`}>
            <Select id={`cv-${pid}`} name="coverage" defaultValue={ess?.coverage ?? ""}><option value="">—</option>{Object.entries(COVERAGE).map(([k, v]) => <option key={k} value={k}>{v.fr}</option>)}</Select>
          </Field>
          <Field label="Organisme ou assureur" htmlFor={`in-${pid}`}><Input id={`in-${pid}`} name="insurer" maxLength={80} defaultValue={ess?.insurer ?? ""} placeholder="ex. INPS, SABU NYUMAN" /></Field>
          <Field label="Numéro d'assuré" htmlFor={`nu-${pid}`}><Input id={`nu-${pid}`} name="insured_number" maxLength={40} defaultValue={ess?.insured_number ?? ""} /></Field>
          <SubmitButton size="sm" className="w-fit">Enregistrer</SubmitButton>
        </ActionForm>
        {ess?.coverage === "amo" && <p className="text-sm">Vous avez l&apos;AMO : <Link prefetch={false} href="/amo" className="text-primary underline">voyez la part prise en charge de vos médicaments</Link> et les pharmacies qui appliquent le tiers payant.</p>}
        {ess?.coverage === "assurance" && <p className="text-sm"><Link prefetch={false} href="/assurances" className="text-primary underline">Trouvez les pharmacies et cliniques partenaires de votre assurance</Link>.</p>}
      </section>

      {person.is_self && (
        <section className="space-y-3 rounded-2xl border bg-white p-4 sm:p-5">
          <h2 className="flex items-center gap-2 text-lg font-bold text-brand-deep"><Droplet className="size-5 text-red-600" aria-hidden /> Mon don de sang</h2>
          <ActionForm action={saveEssentials} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="person_id" value={pid} /><input type="hidden" name="_part" value="don" />
            <Field label="Date de mon dernier don" htmlFor={`ld-${pid}`}><Input id={`ld-${pid}`} name="last_donation" type="date" max={today} defaultValue={ess?.last_donation ?? ""} /></Field>
            <SubmitButton size="sm">Enregistrer</SubmitButton>
          </ActionForm>
          {next && <p className="text-sm">{next <= today ? <strong className="text-primary">Vous pouvez de nouveau donner votre sang.</strong> : <>Prochain don possible à partir du <strong>{formatDate(next)}</strong> : vous recevrez une notification.</>}</p>}
          <p className="text-xs text-muted-foreground">Délai entre deux dons : 3 mois pour un homme, 4 mois pour une femme (CNTS). {person.sex ? "" : "Indiquez votre sexe dans « Mes proches » pour un calcul exact ; sans cette information, le délai de 4 mois est utilisé. "}Groupe sanguin : {ess?.blood_group && ess.blood_group !== "inconnu" ? ess.blood_group : "non renseigné"}. <Link prefetch={false} href="/don-de-sang" className="text-primary underline">Conditions et sites de don</Link>.</p>
        </section>
      )}

      <ItemSection kind="soignant" items={items} personId={pid} back={back}
        intro={<p className="text-sm text-muted-foreground">Votre médecin traitant, votre pharmacie habituelle, votre centre de santé… pour appeler en un geste.</p>} />
      {items.some((i) => i.phone) && (
        <section className="rounded-2xl border bg-white p-4">
          <h2 className="font-bold text-brand-deep">Appeler</h2>
          <ul className="mt-2 flex flex-wrap gap-2">{items.filter((i) => i.phone).map((i) => <li key={i.id}><a href={`tel:${i.phone!.replace(/\s/g, "")}`} className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold text-primary"><Phone className="size-4" aria-hidden />{i.title}</a></li>)}</ul>
        </section>
      )}
    </DossierShell>
  );
}
