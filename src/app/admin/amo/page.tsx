import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Pagination, pageRange } from "@/components/pagination";
import { importAmoList, linkAmo, rematchAmo, saveAmoConfig, setPharmacyAmo } from "@/app/actions/amo";
import { formatDateTime, formatXof } from "@/lib/format";

export const metadata = { title: "Administration — AMO" };

type Stats = { total: number; versions: string[]; linked: number; catalog: number; declared: number; verified: number };
type Cfg = { rate_medicines: number; list_label: string | null; list_reference: string | null; list_date: string | null; source_url: string | null; updated_at: string };
type Decl = { pharmacy_id: string; status: string; declared_at: string; verified_at: string | null; note: string | null; pharmacies: { name: string; status: string } | null };
type Cat = { id: string; brand_name: string; dosage: string | null; form: string | null; packaging: string | null };
type Link_ = { catalog_id: string; manual: boolean; amo_medicines: { code: string | null; name: string; tariff_xof: number | null } | null };

const STATUS: Record<string, string> = { declared: "Déclarée", verified: "Vérifiée", rejected: "Refusée" };

export default async function AdminAmo({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const range = pageRange(sp.page, 20);
  const supabase = await createClient();
  const q = (sp.q ?? "").trim().slice(0, 80);
  let catQuery = supabase.from("medicine_catalog").select("id, brand_name, dosage, form, packaging", { count: "exact" }).is("merged_into", null).order("brand_name").range(range.from, range.to);
  if (q) catQuery = catQuery.ilike("brand_name", `%${q.replace(/[%_,()]/g, " ")}%`);
  const [{ data: stats }, { data: cfg }, { data: decl }, { data: cats, count }] = await Promise.all([
    supabase.rpc("admin_amo_stats"),
    supabase.from("amo_config").select("*").single(),
    supabase.from("pharmacy_amo").select("pharmacy_id, status, declared_at, verified_at, note, pharmacies(name, status)").order("declared_at", { ascending: false }).limit(200),
    catQuery,
  ]);
  const s = stats as Stats | null;
  const c = cfg as Cfg | null;
  const catalog = (cats as Cat[] | null) ?? [];
  const { data: links } = catalog.length
    ? await supabase.from("amo_catalog_links").select("catalog_id, manual, amo_medicines(code, name, tariff_xof)").in("catalog_id", catalog.map((x) => x.id))
    : { data: [] };
  const linkOf = new Map(((links as unknown as Link_[] | null) ?? []).map((l) => [l.catalog_id, l]));
  const declarations = (decl as unknown as Decl[] | null) ?? [];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Assurance maladie obligatoire (AMO)</h1>
        <p className="text-sm text-muted-foreground">Liste officielle CANAM, rapprochement avec le catalogue et pharmacies conventionnées. <Link prefetch={false} href="/amo" className="text-primary underline">Voir la page publique</Link></p>
      </header>

      <div className="grid gap-3 sm:grid-cols-4">
        {[["Produits de la liste", s?.total ?? 0], ["Produits du catalogue reliés", `${s?.linked ?? 0} / ${s?.catalog ?? 0}`], ["Conventions vérifiées", s?.verified ?? 0], ["Déclarations à vérifier", s?.declared ?? 0]].map(([l, v]) => (
          <div key={l as string} className="rounded-xl border bg-white p-4"><p className="text-xs text-muted-foreground">{l}</p><p className="text-2xl font-bold">{v}</p></div>
        ))}
      </div>
      {s?.versions?.length ? <p className="text-sm text-muted-foreground">Version(s) importée(s) : {s.versions.join(", ")}</p> : null}

      <Card>
        <CardHeader><CardTitle>Déclarations des pharmacies</CardTitle>
          <CardDescription>Ne marquez « vérifiée » qu&apos;après avoir vu la convention signée avec la CANAM (justificatif déposé par la pharmacie ou liste officielle des officines conventionnées).</CardDescription></CardHeader>
        <CardContent>
          {declarations.length === 0 ? <p className="text-sm text-muted-foreground">Aucune déclaration.</p> : (
            <ul className="divide-y text-sm">
              {declarations.map((d) => (
                <li key={d.pharmacy_id} className="flex flex-col gap-2 py-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <Link prefetch={false} href={`/admin/pharmacies/${d.pharmacy_id}`} className="font-semibold hover:underline">{d.pharmacies?.name ?? d.pharmacy_id}</Link>{" "}
                    <Badge className={d.status === "verified" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : d.status === "rejected" ? "border-red-200 bg-red-50 text-red-800" : "bg-amber-50 text-amber-900"}>{STATUS[d.status]}</Badge>
                    <p className="text-xs text-muted-foreground">Déclarée le {formatDateTime(d.declared_at)}{d.verified_at ? ` · vérifiée le ${formatDateTime(d.verified_at)}` : ""}{d.note ? ` · ${d.note}` : ""}</p>
                  </div>
                  <ActionForm action={setPharmacyAmo} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="pharmacy_id" value={d.pharmacy_id} />
                    <Input name="note" placeholder="Note (motif d'un refus…)" className="h-9 w-56" defaultValue={d.note ?? ""} />
                    <SubmitButton size="sm" name="status" value="verified">Vérifiée</SubmitButton>
                    <SubmitButton size="sm" variant="outline" name="status" value="rejected">Refuser</SubmitButton>
                    <SubmitButton size="sm" variant="ghost" name="status" value="none" confirm="Retirer complètement la déclaration ?">Retirer</SubmitButton>
                  </ActionForm>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Relier le catalogue à la liste AMO</CardTitle>
          <CardDescription>
            Rapprochement automatique : nom commercial en tête de la désignation officielle + dosage + forme (+ conditionnement). S&apos;il reste plusieurs désignations à des tarifs différents, rien n&apos;est relié :
            indiquez alors le code officiel (ex. PTM1493, voir la page publique AMO). « Non pris en charge » empêche tout lien automatique.
          </CardDescription></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <form method="get" className="flex gap-2"><Input name="q" defaultValue={q} placeholder="Produit du catalogue" aria-label="Rechercher un produit" className="h-9" /><SubmitButton size="sm" variant="outline">Chercher</SubmitButton></form>
            <ActionForm action={rematchAmo}><SubmitButton size="sm" variant="secondary" pendingText="Rapprochement…">Relancer le rapprochement automatique</SubmitButton></ActionForm>
          </div>
          <ul className="divide-y text-sm">
            {catalog.map((m) => {
              const l = linkOf.get(m.id);
              return (
                <li key={m.id} className="flex flex-col gap-2 py-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <p className="font-medium">{[m.brand_name, m.dosage, m.form, m.packaging].filter(Boolean).join(" · ")}</p>
                    <p className="text-xs text-muted-foreground">
                      {l?.amo_medicines ? <>AMO : {l.amo_medicines.code} — {l.amo_medicines.name} · {formatXof(l.amo_medicines.tariff_xof)} {l.manual ? "(manuel)" : "(automatique)"}</>
                        : l?.manual ? "Marqué non pris en charge" : "Non relié"}
                    </p>
                  </div>
                  <ActionForm action={linkAmo} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="catalog_id" value={m.id} />
                    <Input name="amo_id" placeholder="Code (PTM…)" className="h-9 w-36" />
                    <SubmitButton size="sm" variant="outline" name="mode" value="link">Relier</SubmitButton>
                    <SubmitButton size="sm" variant="ghost" name="mode" value="none">Non pris en charge</SubmitButton>
                    {l?.manual && <SubmitButton size="sm" variant="ghost" name="mode" value="auto">Automatique</SubmitButton>}
                  </ActionForm>
                </li>
              );
            })}
          </ul>
          <Pagination basePath="/admin/amo" params={{ q: q || undefined }} page={range.page} total={count ?? 0} size={20} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Importer la liste officielle</CardTitle>
          <CardDescription>
            Fichier CSV tiré du document officiel de la CANAM, sans modification des tarifs. Colonnes reconnues : code ; designation (ou nom) ; dci ; dosage ; forme ; presentation ; categorie ;
            tarif (ou « prix plafond ») ; taux (vide = taux général). Pour une nouvelle liste, cochez « Remplacer » : les liens manuels vers l&apos;ancienne liste seront à refaire.
          </CardDescription></CardHeader>
        <CardContent>
          <ActionForm action={importAmoList} className="grid gap-3 sm:grid-cols-[1fr_220px] sm:items-end">
            <Field label="Fichier CSV" htmlFor="amo-file"><Input id="amo-file" type="file" name="file" accept=".csv,text/csv" required /></Field>
            <Field label="Version de la liste" htmlFor="amo-version"><Input id="amo-version" name="version" placeholder="ex. CANAM 2022" required /></Field>
            <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="replace" className="size-4" /> Remplacer toute la liste actuelle</label>
            <SubmitButton variant="secondary" pendingText="Import en cours…" className="w-fit" confirm="Importer ce fichier dans la liste AMO ?">Importer</SubmitButton>
          </ActionForm>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Paramètres</CardTitle><CardDescription>Affichés sur la page publique. Dernière modification : {c ? formatDateTime(c.updated_at) : "—"}</CardDescription></CardHeader>
        <CardContent>
          <ActionForm action={saveAmoConfig} className="grid gap-3 sm:grid-cols-2">
            <Field label="Taux de prise en charge en officine (%)" htmlFor="rate"><Input id="rate" name="rate_medicines" inputMode="decimal" defaultValue={c?.rate_medicines ?? 70} required /></Field>
            <Field label="Date de la liste" htmlFor="list_date"><Input id="list_date" name="list_date" type="date" defaultValue={c?.list_date ?? ""} /></Field>
            <Field label="Intitulé" htmlFor="list_label"><Input id="list_label" name="list_label" defaultValue={c?.list_label ?? ""} placeholder="ex. Liste AMO CANAM — révision 2022" /></Field>
            <Field label="Lien vers la source (facultatif)" htmlFor="source_url"><Input id="source_url" name="source_url" type="url" defaultValue={c?.source_url ?? ""} placeholder="https://…" /></Field>
            <div className="sm:col-span-2"><Field label="Référence / avertissement" htmlFor="list_reference"><Textarea id="list_reference" name="list_reference" rows={2} defaultValue={c?.list_reference ?? ""} /></Field></div>
            <SubmitButton className="w-fit">Enregistrer</SubmitButton>
          </ActionForm>
        </CardContent>
      </Card>
    </div>
  );
}
