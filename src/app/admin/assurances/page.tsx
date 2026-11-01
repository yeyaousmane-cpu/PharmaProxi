import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Pagination, pageRange } from "@/components/pagination";
import { deleteInsurer, importInsurerNetwork, linkProvider, saveInsurer, toggleProvider } from "@/app/actions/insurance";
import { formatPhone } from "@/lib/format";
import { PROVIDER_SINGULAR, type ProviderCategory } from "@/lib/insurance";

export const metadata = { title: "Administration — Assurances" };

type Ins = { id: string; name: string; slug: string; kind: string; phone: string | null; website: string | null; network_date: string | null; network_source: string | null; notes: string | null; is_published: boolean };
type Prov = { id: string; category: ProviderCategory; name: string; area: string | null; address: string | null; phones: string[]; pharmacy_id: string | null; link_manual: boolean; is_published: boolean };

function InsurerForm({ i }: { i?: Ins }) {
  return (
    <ActionForm action={saveInsurer} className="grid gap-3 sm:grid-cols-2">
      {i && <input type="hidden" name="id" value={i.id} />}
      <Field label="Nom" htmlFor={`n-${i?.id ?? "new"}`}><Input id={`n-${i?.id ?? "new"}`} name="name" defaultValue={i?.name} required /></Field>
      <Field label="Adresse de la page (ex. sabu-nyuman)" htmlFor={`s-${i?.id ?? "new"}`}><Input id={`s-${i?.id ?? "new"}`} name="slug" defaultValue={i?.slug} placeholder="déduite du nom si vide" /></Field>
      <Field label="Type" htmlFor={`k-${i?.id ?? "new"}`}><Select id={`k-${i?.id ?? "new"}`} name="kind" defaultValue={i?.kind ?? "assurance"}><option value="assurance">Assurance</option><option value="mutuelle">Mutuelle</option><option value="autre">Autre</option></Select></Field>
      <Field label="Téléphone de l'assureur" htmlFor={`p-${i?.id ?? "new"}`}><Input id={`p-${i?.id ?? "new"}`} name="phone" defaultValue={i?.phone ?? ""} inputMode="tel" /></Field>
      <Field label="Site internet" htmlFor={`w-${i?.id ?? "new"}`}><Input id={`w-${i?.id ?? "new"}`} name="website" type="url" defaultValue={i?.website ?? ""} /></Field>
      <Field label="Date de la liste des partenaires" htmlFor={`d-${i?.id ?? "new"}`}><Input id={`d-${i?.id ?? "new"}`} name="network_date" type="date" defaultValue={i?.network_date ?? ""} /></Field>
      <div className="sm:col-span-2"><Field label="Origine de la liste" htmlFor={`o-${i?.id ?? "new"}`}><Input id={`o-${i?.id ?? "new"}`} name="network_source" defaultValue={i?.network_source ?? ""} placeholder="ex. Liste communiquée par l'assureur" /></Field></div>
      <div className="sm:col-span-2"><Field label="Conditions affichées aux assurés" htmlFor={`c-${i?.id ?? "new"}`}><Textarea id={`c-${i?.id ?? "new"}`} name="notes" rows={2} defaultValue={i?.notes ?? ""} /></Field></div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_published" defaultChecked={i?.is_published ?? true} className="size-4" /> Publié</label>
      <SubmitButton size="sm" className="w-fit">{i ? "Enregistrer" : "Ajouter l'assureur"}</SubmitButton>
    </ActionForm>
  );
}

export default async function AdminInsurance({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: insurers } = await supabase.from("insurers").select("*").order("name");
  const list = (insurers as Ins[] | null) ?? [];
  const current = list.find((i) => i.id === sp.assureur) ?? list[0];
  const range = pageRange(sp.page, 30);
  const filter = sp.filtre === "pharmacies" ? "pharmacies" : "tous";
  let provs: Prov[] = []; let count = 0;
  if (current) {
    let qy = supabase.from("insurer_providers").select("id, category, name, area, address, phones, pharmacy_id, link_manual, is_published", { count: "exact" })
      .eq("insurer_id", current.id).order("category").order("name").range(range.from, range.to);
    if (filter === "pharmacies") qy = qy.eq("category", "pharmacie");
    if (sp.q) qy = qy.ilike("name", `%${sp.q.replace(/[%_,()]/g, " ").slice(0, 60)}%`);
    const r = await qy;
    provs = (r.data as Prov[] | null) ?? []; count = r.count ?? 0;
  }
  const { data: pharmacies } = await supabase.from("pharmacies").select("id, name").eq("status", "verified").order("name").limit(2000);
  const phName = new Map(((pharmacies as { id: string; name: string }[] | null) ?? []).map((p) => [p.id, p.name]));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Assurances et réseaux de soins</h1>
        <p className="text-sm text-muted-foreground">Ne publiez une liste de partenaires qu&apos;avec l&apos;accord de l&apos;assureur. Les noms des praticiens et les e-mails ne sont jamais importés. <Link prefetch={false} href="/assurances" className="text-primary underline">Page publique</Link></p>
      </header>

      <Card>
        <CardHeader><CardTitle>Assureurs ({list.length})</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {list.map((i) => (
            <details key={i.id} className="rounded-xl border p-3">
              <summary className="flex cursor-pointer flex-wrap items-center gap-2 font-semibold">{i.name} {!i.is_published && <Badge className="bg-amber-50 text-amber-800">Masqué</Badge>}
                <Link prefetch={false} href={`/admin/assurances?assureur=${i.id}`} className="text-sm font-normal text-primary underline">Voir les partenaires</Link></summary>
              <div className="mt-3 space-y-3">
                <InsurerForm i={i} />
                <ActionForm action={deleteInsurer}><input type="hidden" name="id" value={i.id} /><SubmitButton size="sm" variant="ghost" confirm={`Supprimer ${i.name} et toute sa liste de partenaires ?`}>Supprimer</SubmitButton></ActionForm>
              </div>
            </details>
          ))}
          <details className="rounded-xl border border-dashed p-3"><summary className="cursor-pointer font-semibold text-primary">+ Ajouter un assureur</summary><div className="mt-3"><InsurerForm /></div></details>
        </CardContent>
      </Card>

      {current && (
        <>
          <Card>
            <CardHeader><CardTitle>Importer la liste des partenaires — {current.name}</CardTitle>
              <CardDescription>Fichier CSV (dans Excel : Enregistrer sous › CSV UTF-8). Colonnes reconnues : type ; structure ; region/commune ; region_nom (facultatif) ; situation geographique ; contact ; contact2 ; contact3. Les contacts écrits avec un nom de personne sont ignorés.</CardDescription></CardHeader>
            <CardContent>
              <ActionForm action={importInsurerNetwork} className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                <input type="hidden" name="insurer_id" value={current.id} />
                <Field label="Fichier CSV" htmlFor="ins-file"><Input id="ins-file" type="file" name="file" accept=".csv,text/csv" required /></Field>
                <SubmitButton variant="secondary" pendingText="Import…">Importer</SubmitButton>
                <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="replace" defaultChecked className="size-4" /> Remplacer la liste actuelle (les liens manuels sont conservés)</label>
              </ActionForm>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Partenaires de {current.name} ({count})</CardTitle>
              <CardDescription>Les pharmacies sont reliées automatiquement aux pharmacies inscrites portant le même nom dans la même région. Corrigez ici si besoin.</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              <form method="get" className="flex flex-wrap gap-2">
                <input type="hidden" name="assureur" value={current.id} />
                <Input name="q" defaultValue={sp.q ?? ""} placeholder="Nom" className="h-9 w-48" aria-label="Nom" />
                <Select name="filtre" defaultValue={filter} className="h-9 w-40" aria-label="Filtre"><option value="tous">Tous</option><option value="pharmacies">Pharmacies</option></Select>
                <SubmitButton size="sm" variant="outline">Filtrer</SubmitButton>
              </form>
              <ul className="divide-y text-sm">
                {provs.map((p) => (
                  <li key={p.id} className="space-y-2 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong>{p.name}</strong><Badge className="bg-muted text-muted-foreground">{PROVIDER_SINGULAR[p.category]}</Badge>
                      {!p.is_published && <Badge className="bg-amber-50 text-amber-800">Masqué</Badge>}
                      <span className="text-muted-foreground">{[p.area, p.address].filter(Boolean).join(" · ")} {p.phones.map(formatPhone).join(", ")}</span>
                    </div>
                    {p.category === "pharmacie" && (
                      <ActionForm action={linkProvider} className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="provider_id" value={p.id} />
                        <span className="text-xs text-muted-foreground">{p.pharmacy_id ? `Reliée à : ${phName.get(p.pharmacy_id) ?? "pharmacie"} ${p.link_manual ? "(manuel)" : "(auto)"}` : p.link_manual ? "Aucun lien (manuel)" : "Non reliée"}</span>
                        <Select name="pharmacy_id" defaultValue={p.pharmacy_id ?? ""} className="h-9 w-56" aria-label="Pharmacie inscrite">
                          <option value="">— pharmacie inscrite —</option>
                          {[...phName].map(([id, n]) => <option key={id} value={id}>{n}</option>)}
                        </Select>
                        <SubmitButton size="sm" variant="outline" name="mode" value="link">Relier</SubmitButton>
                        <SubmitButton size="sm" variant="ghost" name="mode" value="none">Aucun lien</SubmitButton>
                        {p.link_manual && <SubmitButton size="sm" variant="ghost" name="mode" value="auto">Automatique</SubmitButton>}
                      </ActionForm>
                    )}
                    <ActionForm action={toggleProvider}><input type="hidden" name="provider_id" value={p.id} /><input type="hidden" name="published" value={String(!p.is_published)} />
                      <SubmitButton size="sm" variant="ghost">{p.is_published ? "Masquer" : "Publier"}</SubmitButton></ActionForm>
                  </li>
                ))}
              </ul>
              <Pagination basePath="/admin/assurances" params={{ assureur: current.id, q: sp.q, filtre: filter === "tous" ? undefined : filter }} page={range.page} total={count} size={30} />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
