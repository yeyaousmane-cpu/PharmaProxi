import Link from "next/link";
import { Pagination, pageRange } from "@/components/pagination";
import { createClient } from "@/lib/supabase/server";
import { getGeo } from "@/lib/geo";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ListingFormFields } from "@/components/listing-form-fields";
import { importListings, saveListing } from "@/app/actions/listings";
import { formatPhone } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Pharmacies non inscrites — administration" };
const VIEWS = [["publiees", "Publiées"], ["masquees", "Masquées"], ["rattachees", "Rattachées"], ["toutes", "Toutes"]] as const;
const one = <T,>(v: T | T[] | null | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

export default async function AdminListings({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const view = VIEWS.some(([k]) => k === sp.vue) ? sp.vue! : "publiees";
  const range = pageRange(sp.page);
  const supabase = await createClient();
  const geo = await getGeo();
  let query = supabase
    .from("pharmacy_listings")
    .select("id, name, phone, area_label, address, latitude, is_published, claimed_pharmacy_id, source, regions(name), communes(name), localities(name)", { count: "exact" })
    .order("search_name")
    .range(range.from, range.to);
  if (view === "publiees") query = query.eq("is_published", true).is("claimed_pharmacy_id", null);
  if (view === "masquees") query = query.eq("is_published", false);
  if (view === "rattachees") query = query.not("claimed_pharmacy_id", "is", null);
  if (sp.q?.trim()) query = query.ilike("name", `%${sp.q.trim().replace(/[%_]/g, "")}%`);
  if (sp.region && /^[0-9a-f-]{36}$/i.test(sp.region)) query = query.eq("region_id", sp.region);
  const [{ data, count }, { data: stats }] = await Promise.all([query, supabase.rpc("admin_listing_stats")]);
  const st = (stats ?? {}) as Record<string, number>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Pharmacies non inscrites</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Fiches d&apos;annuaire des officines qui n&apos;ont pas encore rejoint PharmaProxi : nom, zone, téléphone et position, <strong>sans stock ni prix</strong>.
          Elles permettent au public de les trouver et de les appeler. N&apos;importez que des données dont vous avez le droit de vous servir et indiquez la source.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[["Fiches", st.total], ["Publiées", st.published], ["Rattachées", st.claimed], ["Avec téléphone", st.with_phone], ["Sur la carte", st.with_position]].map(([l, n]) => (
          <div key={l as string} className="rounded-xl border bg-white p-3"><p className="text-xs text-muted-foreground">{l}</p><p className="text-xl font-bold">{n ?? 0}</p></div>
        ))}
      </div>

      <div className="grid min-w-0 gap-6 lg:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Import en masse (CSV)</CardTitle>
            <CardDescription>
              Colonnes : <strong>nom</strong> ; <strong>region</strong> ; commune ; quartier ; adresse ; telephone ; latitude ; longitude ; source.
              Les doublons (même nom dans la même zone) sont ignorés. Depuis Excel : <em>Enregistrer sous › CSV UTF-8</em>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <a href="/modele-import-pharmacies.csv" download className="text-sm font-medium text-primary underline">Télécharger le modèle à remplir</a>
            <ActionForm action={importListings} className="space-y-3">
              <Field label="Fichier CSV" htmlFor="l-file"><Input id="l-file" type="file" name="file" accept=".csv,text/csv" required /></Field>
              <Field label="Source (si la colonne est vide)" htmlFor="l-src" hint="Ex. relevé terrain octobre 2026"><Input id="l-src" name="source" maxLength={200} /></Field>
              <SubmitButton variant="secondary" pendingText="Import en cours…">Importer</SubmitButton>
            </ActionForm>
          </CardContent>
        </Card>
        <Card className="min-w-0">
          <CardHeader><CardTitle>Ajouter une pharmacie</CardTitle></CardHeader>
          <CardContent>
            <ActionForm action={saveListing} resetOnSuccess className="space-y-3">
              <ListingFormFields geo={geo} />
              <SubmitButton>Ajouter</SubmitButton>
            </ActionForm>
          </CardContent>
        </Card>
      </div>

      <section className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-1">
            {VIEWS.map(([k, l]) => (
              <Link prefetch={false} key={k} href={`?vue=${k}`} className={cn("rounded-full border px-3 py-1 text-sm", view === k ? "border-primary bg-primary text-white" : "bg-white")}>{l}</Link>
            ))}
          </div>
          <form method="get" className="flex flex-wrap gap-2">
            <input type="hidden" name="vue" value={view} />
            <Select name="region" defaultValue={sp.region ?? ""} className="h-9 w-auto" aria-label="Région">
              <option value="">Toutes les régions</option>
              {geo.regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </Select>
            <Input name="q" placeholder="Rechercher par nom…" defaultValue={sp.q} className="h-9 w-48" aria-label="Rechercher" />
            <Button type="submit" size="sm" variant="outline">Filtrer</Button>
          </form>
        </div>
        {!data?.length ? (
          <p className="rounded-xl border border-dashed bg-white p-8 text-center text-sm text-muted-foreground">Aucune fiche.</p>
        ) : (
          <ul className="divide-y rounded-xl border bg-white">
            {data.map((l) => (
              <li key={l.id}>
                <Link prefetch={false} href={`/admin/pharmacies-non-inscrites/${l.id}`} className="flex flex-col gap-1 p-4 hover:bg-muted sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-semibold">{l.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {[one(l.localities)?.name, l.area_label, one(l.communes)?.name, one(l.regions)?.name].filter(Boolean).join(", ")}
                      {l.phone ? ` · ${formatPhone(l.phone)}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-1">
                    {l.latitude === null && <Badge className="bg-white">Sans position</Badge>}
                    {!l.phone && <Badge className="border-amber-200 bg-amber-50 text-amber-900">Sans téléphone</Badge>}
                    {l.claimed_pharmacy_id ? <Badge className="border-emerald-200 bg-emerald-50 text-emerald-900">Rattachée</Badge>
                      : !l.is_published ? <Badge className="bg-muted">Masquée</Badge> : null}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Pagination basePath="/admin/pharmacies-non-inscrites" params={sp} page={range.page} total={count} />
      </section>
    </div>
  );
}
