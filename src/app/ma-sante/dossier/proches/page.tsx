import Link from "next/link";
import { dossierContext } from "@/lib/dossier/server";
import { DossierGate, DossierShell } from "@/components/dossier/shell";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Field, Input, Select } from "@/components/ui/input";
import { savePerson } from "@/app/actions/dossier";
import { Disclosure } from "@/components/dossier/disclosure";
import { RELATIONS } from "@/lib/dossier/config";
import type { Person } from "@/lib/dossier/server";

export const metadata = { title: "Mes proches" };
export const dynamic = "force-dynamic";

function PersonForm({ p }: { p?: Person }) {
  const uid = p?.id ?? "new";
  return (
    <ActionForm action={savePerson} className="grid gap-3 sm:grid-cols-4" resetOnSuccess={!p}>
      {p && <input type="hidden" name="id" value={p.id} />}
      {p?.is_self && <input type="hidden" name="is_self" value="1" />}
      <Field label={p?.is_self ? "Mon nom" : "Prénom ou nom"} htmlFor={`dn-${uid}`} required><Input id={`dn-${uid}`} name="display_name" maxLength={60} defaultValue={p?.display_name} required /></Field>
      {!p?.is_self && (
        <Field label="Lien" htmlFor={`rl-${uid}`}>
          <Select id={`rl-${uid}`} name="relation" defaultValue={p?.relation ?? ""}><option value="">—</option>{Object.entries(RELATIONS).filter(([k]) => k !== "moi").map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
        </Field>
      )}
      <Field label="Année de naissance" htmlFor={`by-${uid}`}><Input id={`by-${uid}`} name="birth_year" type="number" inputMode="numeric" min={1900} max={new Date().getUTCFullYear()} defaultValue={p?.birth_year ?? ""} /></Field>
      <Field label="Sexe" htmlFor={`sx-${uid}`}><Select id={`sx-${uid}`} name="sex" defaultValue={p?.sex ?? ""}><option value="">—</option><option value="F">Femme</option><option value="M">Homme</option></Select></Field>
      <div className="flex flex-wrap gap-2 sm:col-span-4">
        <SubmitButton size="sm">{p ? "Enregistrer" : "Créer le dossier"}</SubmitButton>
        {p && !p.is_self && <SubmitButton size="sm" variant="outline" name="delete" value="1" className="text-red-700" confirm={`Supprimer définitivement tout le dossier de ${p.display_name} ?`}>Supprimer ce dossier</SubmitButton>}
      </div>
    </ActionForm>
  );
}

export default async function Proches() {
  const ctx = await dossierContext(undefined, "/ma-sante/dossier/proches");
  if (ctx.locked) return <DossierGate status={ctx.status} path="/ma-sante/dossier/proches" />;
  const { person, persons, status } = ctx;
  const others = persons.filter((p) => !p.is_self);
  return (
    <DossierShell persons={persons} person={person} status={status} current="/proches">
      <section className="space-y-3 rounded-2xl border bg-white p-4 sm:p-5">
        <h2 className="text-lg font-bold text-brand-deep">Moi</h2>
        <PersonForm p={persons.find((p) => p.is_self)} />
      </section>
      <section className="space-y-3 rounded-2xl border bg-white p-4 sm:p-5">
        <h2 className="text-lg font-bold text-brand-deep">Les dossiers de mes proches</h2>
        <p className="text-sm text-muted-foreground">Tenez le dossier d&apos;un enfant ou d&apos;un parent âgé que vous accompagnez chez le médecin. Il reste dans votre compte : la personne ne le voit pas depuis le sien. Faites-le avec son accord quand elle peut le donner. 10 proches au maximum.</p>
        {others.length > 0 && (
          <ul className="divide-y">
            {others.map((p) => (
              <li key={p.id} className="space-y-2 py-3">
                <p className="flex flex-wrap items-center gap-2 font-semibold">{p.display_name}{p.relation ? <span className="text-sm font-normal text-muted-foreground">({RELATIONS[p.relation]})</span> : null}
                  <Link prefetch={false} href={`/ma-sante/dossier?p=${p.id}`} className="text-sm text-primary underline">Ouvrir son dossier</Link></p>
                <details><summary className="cursor-pointer text-sm text-primary">Modifier</summary><div className="mt-2"><PersonForm p={p} /></div></details>
              </li>
            ))}
          </ul>
        )}
        <Disclosure summary="Ajouter un proche" defaultOpen={others.length === 0} className="rounded-xl border border-dashed p-3"><PersonForm /></Disclosure>
        <p className="text-xs text-muted-foreground">Pour les vaccins des enfants selon le calendrier national, utilisez aussi le <Link prefetch={false} href="/ma-sante/enfants" className="text-primary underline">carnet de vaccination</Link>.</p>
      </section>
    </DossierShell>
  );
}
