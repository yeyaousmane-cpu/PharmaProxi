import { createClient } from "@/lib/supabase/server";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Pagination, pageRange } from "@/components/pagination";
import { deleteHomeCare, importNurseRegister, saveHomeCare, updateNurse } from "@/app/actions/nurses";
import { getGeo } from "@/lib/geo";
import { formatPhone } from "@/lib/format";
import { CARE_TYPES } from "@/lib/nurses";

export const metadata = { title: "Infirmiers — administration" };
type HC = { id: string; name: string; address: string | null; region_id: string | null; areas: string | null; phone: string | null; whatsapp: string | null; care_types: string[];
  activity: string | null; hours: string | null; prices: string | null; booking: string | null; verification: string; authorization_ref: string | null; source: string; is_published: boolean };
const clean = (q?: string) => (q ?? "").trim().replace(/[%_,()]/g, "").slice(0, 60);

function ProviderForm({ p, regions }: { p?: HC; regions: { id: string; name: string }[] }) {
  return (
    <ActionForm action={saveHomeCare} className="grid gap-3 sm:grid-cols-2" resetOnSuccess={!p}>
      {p && <input type="hidden" name="id" value={p.id} />}
      <Field label="Nom de la structure" htmlFor={`n-${p?.id ?? "new"}`} required><Input id={`n-${p?.id ?? "new"}`} name="name" defaultValue={p?.name} required /></Field>
      <Field label="Adresse" htmlFor={`a-${p?.id ?? "new"}`}><Input id={`a-${p?.id ?? "new"}`} name="address" defaultValue={p?.address ?? ""} /></Field>
      <Field label="Région" htmlFor={`r-${p?.id ?? "new"}`}><Select id={`r-${p?.id ?? "new"}`} name="region_id" defaultValue={p?.region_id ?? ""}><option value="">—</option>{regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></Field>
      <Field label="Communes / quartiers desservis" htmlFor={`z-${p?.id ?? "new"}`}><Input id={`z-${p?.id ?? "new"}`} name="areas" defaultValue={p?.areas ?? ""} /></Field>
      <Field label="Téléphone" htmlFor={`t-${p?.id ?? "new"}`}><Input id={`t-${p?.id ?? "new"}`} name="phone" defaultValue={p?.phone ?? ""} inputMode="tel" /></Field>
      <Field label="WhatsApp" htmlFor={`w-${p?.id ?? "new"}`}><Input id={`w-${p?.id ?? "new"}`} name="whatsapp" defaultValue={p?.whatsapp ?? ""} inputMode="tel" /></Field>
      <fieldset className="sm:col-span-2"><legend className="mb-1 text-sm font-medium">Types de soins proposés</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-1">{Object.entries(CARE_TYPES).map(([k, v]) => <label key={k} className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="care_types" value={k} defaultChecked={p?.care_types.includes(k)} className="size-4" />{v}</label>)}</div>
      </fieldset>
      <Field label="Activité annoncée" htmlFor={`ac-${p?.id ?? "new"}`}><Input id={`ac-${p?.id ?? "new"}`} name="activity" defaultValue={p?.activity ?? ""} /></Field>
      <Field label="Horaires et disponibilité" htmlFor={`h-${p?.id ?? "new"}`}><Input id={`h-${p?.id ?? "new"}`} name="hours" defaultValue={p?.hours ?? ""} placeholder="Ex. : 7 j/7, 7 h – 22 h" /></Field>
      <Field label="Tarifs communiqués" htmlFor={`p-${p?.id ?? "new"}`}><Textarea id={`p-${p?.id ?? "new"}`} name="prices" defaultValue={p?.prices ?? ""} rows={2} /></Field>
      <Field label="Réservation" htmlFor={`b-${p?.id ?? "new"}`}><Input id={`b-${p?.id ?? "new"}`} name="booking" defaultValue={p?.booking ?? ""} placeholder="Par téléphone, WhatsApp…" /></Field>
      <Field label="Référence de l'autorisation d'exercer (vue par l'équipe)" htmlFor={`au-${p?.id ?? "new"}`} hint="Obligatoire pour marquer « vérifiée ». Non publiée.">
        <Input id={`au-${p?.id ?? "new"}`} name="authorization_ref" defaultValue={p?.authorization_ref ?? ""} /></Field>
      <Field label="Source" htmlFor={`s-${p?.id ?? "new"}`}><Input id={`s-${p?.id ?? "new"}`} name="source" defaultValue={p?.source ?? ""} placeholder="Saisie administrateur" /></Field>
      <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="verified" defaultChecked={p?.verification === "verifie"} className="size-4" /> Autorisation vérifiée</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="published" defaultChecked={p ? p.is_published : true} className="size-4" /> Publiée</label>
        <SubmitButton size="sm">{p ? "Enregistrer" : "Ajouter la structure"}</SubmitButton>
      </div>
    </ActionForm>
  );
}

export default async function AdminNursesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const geo = await getGeo();
  const range = pageRange(sp.page);
  const q = clean(sp.q);
  let nq = supabase.from("nurse_register").select("id, register_year, registration_number, last_name, first_name, specialty, section, structure, phone, phone_public, home_care, verification, is_published", { count: "exact" })
    .order("last_name").order("first_name").range(range.from, range.to);
  if (q) nq = nq.or(`last_name.ilike.%${q}%,first_name.ilike.%${q}%,registration_number.ilike.%${q}%`);
  const [{ data: providers }, { data: nurses, count }] = await Promise.all([supabase.rpc("admin_home_care_list"), nq]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Infirmiers et soins à domicile</h1>
      <Card>
        <CardHeader><CardTitle>Structures de soins à domicile</CardTitle>
          <CardDescription>Ne marquez « autorisation vérifiée » qu&apos;après avoir vu l&apos;autorisation d&apos;exercer. Les tarifs et horaires affichés sont ceux communiqués par la structure.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          {((providers as HC[] | null) ?? []).map((p) => (
            <details key={p.id} className="rounded-xl border p-3">
              <summary className="flex cursor-pointer flex-wrap items-center gap-2 font-semibold">{p.name}
                <Badge className={p.verification === "verifie" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "bg-muted text-muted-foreground"}>{p.verification === "verifie" ? "Vérifiée" : "Non vérifiée"}</Badge>
                {!p.is_published && <Badge className="bg-amber-50 text-amber-800">Masquée</Badge>}
                <span className="text-sm font-normal text-muted-foreground">{formatPhone(p.phone)}</span></summary>
              <div className="mt-3 space-y-3">
                <ProviderForm p={p} regions={geo.regions} />
                <ActionForm action={deleteHomeCare}><input type="hidden" name="id" value={p.id} /><SubmitButton size="sm" variant="ghost" confirm={`Supprimer ${p.name} ?`}>Supprimer</SubmitButton></ActionForm>
              </div>
            </details>
          ))}
          <details className="rounded-xl border border-dashed p-3"><summary className="cursor-pointer font-semibold text-primary">+ Ajouter une structure</summary><div className="mt-3"><ProviderForm regions={geo.regions} /></div></details>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Importer le Tableau de l&apos;Ordre des infirmiers (CNOIIM)</CardTitle>
          <CardDescription>
            Fichier CSV (une ligne par infirmier). Colonnes reconnues : ordre ; inscription ; nom ; prenom (ou « nom et prénom ») ; specialite ; section ; region ; commune ; structure ; telephone ; telephone_autorise (oui/non) ; domicile (oui/non).
            Un téléphone n&apos;est publié que si « telephone_autorise » vaut oui : ne le cochez qu&apos;avec l&apos;accord de l&apos;infirmier. Les retraits demandés sont conservés d&apos;un import à l&apos;autre.
          </CardDescription></CardHeader>
        <CardContent>
          <ActionForm action={importNurseRegister} className="grid gap-3 sm:grid-cols-[1fr_140px] sm:items-end">
            <Field label="Fichier CSV" htmlFor="nr-file"><Input id="nr-file" type="file" name="file" accept=".csv,text/csv" required /></Field>
            <Field label="Année du Tableau" htmlFor="nr-year"><Input id="nr-year" name="year" type="number" min={2000} max={2100} defaultValue={new Date().getFullYear()} required /></Field>
            <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="replace" defaultChecked className="size-4" /> Remplacer l&apos;édition existante de cette année</label>
            <SubmitButton variant="secondary" pendingText="Import en cours…" className="w-fit">Importer</SubmitButton>
          </ActionForm>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Infirmiers au Tableau ({count ?? 0})</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <form method="get" className="flex gap-2"><Input name="q" defaultValue={sp.q ?? ""} placeholder="Nom ou n° d'inscription" aria-label="Rechercher" /><SubmitButton size="sm" variant="outline">Chercher</SubmitButton></form>
          <ul className="divide-y">
            {(nurses ?? []).map((n) => (
              <li key={n.id} className="space-y-2 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <strong>{n.last_name} {n.first_name}</strong>
                  <span className="text-sm text-muted-foreground">{[n.registration_number, n.specialty, n.structure, n.section].filter(Boolean).join(" · ")}</span>
                  {!n.is_published && <Badge className="bg-amber-50 text-amber-800">Retiré</Badge>}
                  {n.verification === "verifie" && <Badge className="border-emerald-200 bg-emerald-50 text-emerald-800">Vérifié</Badge>}
                </div>
                <ActionForm action={updateNurse} className="flex flex-wrap items-end gap-3">
                  <input type="hidden" name="id" value={n.id} /><input type="hidden" name="_contact" value="1" />
                  <label className="text-sm">Téléphone pro<Input name="phone" defaultValue={n.phone ?? ""} className="h-9 w-44" inputMode="tel" /></label>
                  <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="phone_public" defaultChecked={n.phone_public} className="size-4" /> Publication autorisée</label>
                  <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="home_care" defaultChecked={n.home_care} className="size-4" /> À domicile</label>
                  <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="verified" defaultChecked={n.verification === "verifie"} className="size-4" /> Coordonnées vérifiées</label>
                  <SubmitButton size="sm" variant="outline">Enregistrer</SubmitButton>
                </ActionForm>
                <ActionForm action={updateNurse}><input type="hidden" name="id" value={n.id} /><input type="hidden" name="published" value={String(!n.is_published)} />
                  <SubmitButton size="sm" variant="ghost" confirm={n.is_published ? "Retirer cette personne de PharmaProxi (à sa demande) ?" : undefined}>{n.is_published ? "Retirer (à sa demande)" : "Republier"}</SubmitButton></ActionForm>
              </li>
            ))}
          </ul>
          <Pagination basePath="/admin/infirmiers" params={{ q: sp.q }} page={range.page} total={count ?? 0} />
        </CardContent>
      </Card>
    </div>
  );
}
