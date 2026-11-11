import Link from "next/link";
import { Droplet, Phone } from "lucide-react";
import { dossierContext, loadEssentials, loadItems } from "@/lib/dossier/server";
import { DossierGate, DossierShell } from "@/components/dossier/shell";
import { ItemSection } from "@/components/dossier/item-section";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Field, Input, Select } from "@/components/ui/input";
import { saveEssentials } from "@/app/actions/dossier";
import { COVERAGE, nextDonationDate } from "@/lib/dossier/config";
import { formatDate, formatPhone } from "@/lib/format";
import { removeTreatingDoctor, setTreatingDoctor } from "@/app/actions/v031";

export const metadata = { title: "Couverture et soignants" };
export const dynamic = "force-dynamic";

export default async function Contacts({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const sp = await searchParams;
  const ctx = await dossierContext(sp.p, "/ma-sante/dossier/contacts");
  if (ctx.locked) return <DossierGate status={ctx.status} path={`/ma-sante/dossier/contacts${sp.p ? `?p=${sp.p}` : ""}`} />;
  const { supabase, person, persons, status } = ctx;
  const back = `/ma-sante/dossier/contacts${person.is_self ? "" : `?p=${person.id}`}`;
  const [items, ess, { data: td }, { data: docs }] = await Promise.all([loadItems(supabase, person.id, ["soignant"]), loadEssentials(supabase, person.id),
    supabase.from("treating_doctors").select("doctor_id, free_name, free_structure, free_phone, notify_doctor, since, doctors(title, display_name)").eq("person_id", person.id).maybeSingle(),
    supabase.from("doctors").select("id, title, display_name, user_id").eq("is_published", true).order("display_name").limit(500)]);
  const treating = td as unknown as { doctor_id: string | null; free_name: string | null; free_structure: string | null; free_phone: string | null; notify_doctor: boolean; since: string | null; doctors: { title: string | null; display_name: string } | null } | null;
  const next = nextDonationDate(ess?.last_donation ?? null, person.sex);
  const today = new Date().toISOString().slice(0, 10);
  const pid = person.id;
  return (
    <DossierShell persons={persons} person={person} status={status} current="/contacts">
      <section className="space-y-3 rounded-2xl border bg-white p-4 sm:p-5" aria-labelledby="mt">
        <h2 id="mt" className="text-lg font-bold text-brand-deep">Mon médecin traitant</h2>
        <p className="text-sm text-muted-foreground">Le médecin qui vous connaît et vous suit habituellement : c&apos;est lui qu&apos;on contacte en premier, et il coordonne vos soins. Beaucoup de personnes au Mali n&apos;en ont pas encore : c&apos;est le moment d&apos;en choisir un.</p>
        {treating ? (
          <div className="rounded-xl bg-[#EAF6EE] p-3 text-sm">
            <p className="font-semibold">{treating.doctors ? `${treating.doctors.title ?? ""} ${treating.doctors.display_name}`.trim() : treating.free_name}</p>
            {treating.free_structure && <p>{treating.free_structure}</p>}
            {treating.free_phone && <p><a href={`tel:${treating.free_phone}`} className="underline">{formatPhone(treating.free_phone)}</a></p>}
            {treating.since && <p>Depuis le {formatDate(treating.since)}</p>}
            <p className="text-xs text-muted-foreground">{treating.doctor_id ? (treating.notify_doctor ? "Ce médecin a été prévenu (il voit seulement votre nom)." : "Ce médecin n'a pas été prévenu.") : "Médecin saisi par vous."}</p>
            {treating.doctor_id && <p className="mt-1 text-xs"><Link prefetch={false} href={`/medecins/${treating.doctor_id}`} className="underline">Voir sa fiche et prendre rendez-vous</Link></p>}
            <ActionForm action={removeTreatingDoctor} className="mt-2"><input type="hidden" name="person_id" value={pid} /><SubmitButton size="sm" variant="outline">Retirer</SubmitButton></ActionForm>
          </div>
        ) : <p className="rounded-xl border border-dashed p-3 text-sm">Pas encore de médecin traitant. <Link prefetch={false} href="/medecins?q=g%C3%A9n%C3%A9raliste" className="text-primary underline">Trouver un médecin généraliste près de chez moi</Link></p>}
        <details className="text-sm" open={!treating}><summary className="cursor-pointer font-semibold text-primary">{treating ? "Changer de médecin traitant" : "Choisir mon médecin traitant"}</summary>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            <ActionForm action={setTreatingDoctor} className="space-y-2 rounded-xl border p-3"><input type="hidden" name="person_id" value={pid} /><input type="hidden" name="mode" value="annuaire" />
              <p className="font-semibold">Un médecin de l&apos;annuaire SantéProxi</p>
              <Field label="Médecin" htmlFor={`td-${pid}`}><Select id={`td-${pid}`} name="doctor_id" required defaultValue={treating?.doctor_id ?? ""}><option value="" disabled>Choisir…</option>{(docs ?? []).map((d) => <option key={d.id} value={d.id}>{`${d.title ?? ""} ${d.display_name}`.trim()}</option>)}</Select></Field>
              <Field label="Depuis (facultatif)" htmlFor={`ts-${pid}`}><Input id={`ts-${pid}`} type="date" name="since" max={today} /></Field>
              <label className="flex items-start gap-2"><input type="checkbox" name="notify_doctor" className="mt-1 size-4" /><span>Prévenir ce médecin (s&apos;il a un compte) : il verra seulement mon nom, aucune donnée de santé.</span></label>
              <SubmitButton size="sm">Enregistrer</SubmitButton>
            </ActionForm>
            <ActionForm action={setTreatingDoctor} className="space-y-2 rounded-xl border p-3"><input type="hidden" name="person_id" value={pid} /><input type="hidden" name="mode" value="libre" />
              <p className="font-semibold">Un médecin qui n&apos;est pas sur SantéProxi</p>
              <Field label="Nom du médecin" htmlFor={`fn-${pid}`}><Input id={`fn-${pid}`} name="free_name" maxLength={120} required placeholder="ex. Dr Coulibaly" /></Field>
              <Field label="Centre de santé, cabinet (facultatif)" htmlFor={`fs-${pid}`}><Input id={`fs-${pid}`} name="free_structure" maxLength={160} placeholder="ex. CSCom de Lafiabougou" /></Field>
              <Field label="Téléphone (facultatif)" htmlFor={`fp-${pid}`}><Input id={`fp-${pid}`} name="free_phone" type="tel" dir="ltr" /></Field>
              <Field label="Depuis (facultatif)" htmlFor={`fd-${pid}`}><Input id={`fd-${pid}`} type="date" name="since" max={today} /></Field>
              <SubmitButton size="sm">Enregistrer</SubmitButton>
            </ActionForm>
          </div>
        </details>
      </section>

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
