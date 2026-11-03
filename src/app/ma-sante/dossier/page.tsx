import Link from "next/link";
import { AlertTriangle, Baby, Check, Plus } from "lucide-react";
import { dossierContext, loadEssentials, loadItems } from "@/lib/dossier/server";
import { DossierGate, DossierShell } from "@/components/dossier/shell";
import { ItemSection } from "@/components/dossier/item-section";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Field, Input, Select } from "@/components/ui/input";
import { saveEssentials, toggleCondition } from "@/app/actions/dossier";
import { BLOOD_GROUPS, COMMON_CONDITIONS, allergyMatches } from "@/lib/dossier/config";
import { pregnancy } from "@/lib/femme/cycle";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Mon dossier santé" };
export const dynamic = "force-dynamic";

export default async function Dossier({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const sp = await searchParams;
  const ctx = await dossierContext(sp.p, "/ma-sante/dossier");
  if (ctx.locked) return <DossierGate status={ctx.status} path={`/ma-sante/dossier${sp.p ? `?p=${sp.p}` : ""}`} />;
  const { supabase, person, persons, status } = ctx;
  const back = `/ma-sante/dossier${person.is_self ? "" : `?p=${person.id}`}`;
  const [items, ess, { data: treatments }, { data: femme }] = await Promise.all([
    loadItems(supabase, person.id, ["allergie", "maladie", "ordonnance"]),
    loadEssentials(supabase, person.id),
    person.is_self ? supabase.from("treatments").select("id, name, dose_note, times").eq("active", true) : Promise.resolve({ data: [] as { id: string; name: string; dose_note: string | null; times: string[] }[] }),
    person.is_self && person.sex !== "M" ? supabase.from("femme_profiles").select("journey, pregnancy_lmp, pregnancy_due").maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const allergies = items.filter((i) => i.kind === "allergie").map((i) => i.title);
  const conditions = new Set(items.filter((i) => i.kind === "maladie").map((i) => i.title));
  const preg = femme?.journey === "grossesse" ? pregnancy(femme.pregnancy_lmp, femme.pregnancy_due) : null;
  const current = (treatments ?? []).map((t) => ({ ...t, hits: allergyMatches(t.name, allergies) }));
  const pid = `pid-${person.id}`;

  return (
    <DossierShell persons={persons} person={person} status={status} current="">
      {current.some((t) => t.hits.length) && (
        <div role="alert" className="flex items-start gap-2 rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-red-900">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden />
          <p>{current.filter((t) => t.hits.length).map((t) => `${t.name} ressemble à votre allergie déclarée (${t.hits.join(", ")}).`).join(" ")} Parlez-en à votre pharmacien ou à votre médecin. Ce rappel compare seulement les noms que vous avez écrits.</p>
        </div>
      )}

      <section className="space-y-3 rounded-2xl border bg-white p-4 sm:p-5">
        <h2 className="text-lg font-bold text-brand-deep">Mes informations essentielles{person.is_self ? "" : ` — ${person.display_name}`}</h2>
        <ActionForm action={saveEssentials} className="grid gap-3 sm:grid-cols-3">
          <input type="hidden" name="person_id" value={person.id} /><input type="hidden" name="_part" value="base" />
          <Field label="Groupe sanguin et rhésus" htmlFor={`bg-${pid}`}>
            <Select id={`bg-${pid}`} name="blood_group" defaultValue={ess?.blood_group ?? ""}>
              <option value="">—</option>{BLOOD_GROUPS.map((g) => <option key={g}>{g}</option>)}<option value="inconnu">Je ne connais pas</option>
            </Select>
          </Field>
          <Field label="Taille (cm)" htmlFor={`h-${pid}`}><Input id={`h-${pid}`} name="height_cm" type="number" inputMode="numeric" min={30} max={250} defaultValue={ess?.height_cm ?? ""} /></Field>
          <Field label="Poids (kg)" htmlFor={`w-${pid}`}><Input id={`w-${pid}`} name="weight_kg" inputMode="decimal" defaultValue={ess?.weight_kg ?? ""} /></Field>
          {person.sex !== "M" && (
            <div className="flex flex-wrap gap-4 text-sm sm:col-span-3">
              <label className="flex items-center gap-2"><input type="checkbox" name="pregnant" defaultChecked={ess?.pregnant} className="size-4" /> Enceinte</label>
              <label className="flex items-center gap-2"><input type="checkbox" name="breastfeeding" defaultChecked={ess?.breastfeeding} className="size-4" /> J&apos;allaite</label>
              <span className="text-xs text-muted-foreground">Important : cela change les médicaments qu&apos;un soignant peut prescrire.</span>
            </div>
          )}
          {ess?.blood_group === "inconnu" && <p className="text-xs text-muted-foreground sm:col-span-3">Votre groupe sanguin peut être déterminé par une simple analyse de laboratoire, ou lors d&apos;un <Link prefetch={false} href="/don-de-sang" className="text-primary underline">don de sang</Link>.</p>}
          <SubmitButton size="sm" className="w-fit">Enregistrer</SubmitButton>
        </ActionForm>
        <ActionForm action={saveEssentials} className="grid gap-3 border-t pt-3 sm:grid-cols-3">
          <input type="hidden" name="person_id" value={person.id} /><input type="hidden" name="_part" value="urgence" />
          <p className="text-sm font-semibold sm:col-span-3">Personne à prévenir en cas d&apos;urgence</p>
          <Field label="Nom" htmlFor={`en-${pid}`}><Input id={`en-${pid}`} name="emergency_name" maxLength={80} defaultValue={ess?.emergency_name ?? ""} /></Field>
          <Field label="Lien" htmlFor={`er-${pid}`}><Input id={`er-${pid}`} name="emergency_relation" maxLength={40} placeholder="ex. épouse, frère" defaultValue={ess?.emergency_relation ?? ""} /></Field>
          <Field label="Téléphone" htmlFor={`ep-${pid}`}><Input id={`ep-${pid}`} name="emergency_phone" type="tel" inputMode="tel" placeholder="+223 70 00 00 00" defaultValue={ess?.emergency_phone ?? ""} /></Field>
          <SubmitButton size="sm" className="w-fit">Enregistrer</SubmitButton>
        </ActionForm>
      </section>

      {preg && (
        <section className="flex items-start gap-3 rounded-2xl border border-pink-200 bg-[#FFF5F9] p-4">
          <Baby className="size-6 shrink-0 text-[#D96A91]" aria-hidden />
          <div className="text-sm">
            <p className="font-semibold text-[#843653]">Ma grossesse : {preg.weeks} semaines d&apos;aménorrhée{preg.extraDays ? ` et ${preg.extraDays} jour(s)` : ""}</p>
            <p>Terme prévu le {formatDate(preg.due)}. <Link prefetch={false} href="/femme/grossesse" className="text-[#843653] underline">Voir mon suivi de grossesse</Link></p>
          </div>
        </section>
      )}

      <ItemSection kind="allergie" items={items} personId={person.id} back={back}
        intro={<p className="text-sm text-muted-foreground">Indiquez ce qui vous a déjà causé une réaction. Ces informations figurent en premier sur la fiche d&apos;urgence.</p>} />

      <ItemSection kind="maladie" items={items} personId={person.id} back={back}
        intro={<p className="text-sm text-muted-foreground">Touchez une maladie pour l&apos;ajouter ou la retirer, puis précisez l&apos;année de découverte avec « Modifier ».</p>}>
        <div className="flex flex-wrap gap-2">
          {COMMON_CONDITIONS.map((c) => {
            const on = conditions.has(c);
            return (
              <ActionForm key={c} action={toggleCondition}>
                <input type="hidden" name="person_id" value={person.id} /><input type="hidden" name="title" value={c} />
                <SubmitButton size="sm" variant="outline" aria-pressed={on} className={cn("rounded-full", on && "border-primary bg-brand-mint text-brand-deep")}>
                  {on ? <Check aria-hidden /> : <Plus aria-hidden />}{c}
                </SubmitButton>
              </ActionForm>
            );
          })}
        </div>
      </ItemSection>

      <section className="space-y-2 rounded-2xl border bg-white p-4 sm:p-5">
        <h2 className="text-lg font-bold text-brand-deep">Mes traitements en cours</h2>
        {person.is_self ? (
          current.length ? (
            <ul className="space-y-1 text-sm">{current.map((t) => <li key={t.id} className={cn(t.hits.length && "font-semibold text-red-800")}>{t.name}{t.dose_note ? ` — ${t.dose_note}` : ""} · {t.times.join(", ")}{t.hits.length ? " (voir l'alerte allergie)" : ""}</li>)}</ul>
          ) : <p className="text-sm text-muted-foreground">Aucun traitement en cours.</p>
        ) : <p className="text-sm text-muted-foreground">Les médicaments de {person.display_name} se notent dans <Link prefetch={false} href={`/ma-sante/dossier/consultations?p=${person.id}#ordonnance`} className="text-primary underline">Mes ordonnances</Link>.</p>}
        <p className="text-sm"><Link prefetch={false} href="/ma-sante/traitements" className="text-primary underline">Gérer les rappels de prise</Link> · <Link prefetch={false} href={`/ma-sante/dossier/antecedents${person.is_self ? "" : `?p=${person.id}`}#ancien_traitement`} className="text-primary underline">Anciens traitements</Link></p>
      </section>
    </DossierShell>
  );
}
