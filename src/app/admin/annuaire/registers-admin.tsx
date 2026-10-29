import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Pagination, pageRange } from "@/components/pagination";
import { deleteFacility, importDoctorRegister, importFacilities, setFacilityPublished, setRegisterPublished } from "@/app/actions/registers";
import { setFacilityEmergency } from "@/app/actions/services";
import { FACILITY_KINDS } from "@/lib/directory";
import { formatPhone } from "@/lib/format";

type SP = Record<string, string | undefined>;
const one = <T,>(v: T | T[] | null | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;
const clean = (q?: string) => (q ?? "").trim().replace(/[%_,()]/g, "").slice(0, 60);

async function Stats() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("admin_register_stats");
  return (data ?? {}) as Record<string, number>;
}

/** Vue « Tableau de l'Ordre » : import annuel, recherche, masquage à la demande d'un médecin. */
export async function RegisterAdmin({ sp }: { sp: SP }) {
  const supabase = await createClient();
  const st = await Stats();
  const range = pageRange(sp.page);
  const q = clean(sp.q);
  let query = supabase.from("doctor_register")
    .select("id, register_year, registration_number, last_name, first_name, specialty_label, structure, crom, is_published, medical_specialties(name)", { count: "exact" })
    .order("last_name").order("first_name").range(range.from, range.to);
  if (q) query = query.or(`last_name.ilike.%${q}%,first_name.ilike.%${q}%,registration_number.ilike.%${q}%`);
  if (sp.masques === "1") query = query.eq("is_published", false);
  const { data, count } = await query;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[["Médecins au Tableau", st.register_total], ["Édition", st.register_year], ["Spécialité reconnue", st.register_with_specialty], ["Masqués", st.register_hidden]].map(([l, n]) => (
          <div key={l as string} className="rounded-xl border bg-white p-3"><p className="text-xs text-muted-foreground">{l}</p><p className="text-xl font-bold">{n ?? "—"}</p></div>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Importer le Tableau de l&apos;Ordre</CardTitle>
          <CardDescription>
            Fichier CSV publié par l&apos;Ordre des médecins (une ligne par médecin). Colonnes reconnues : ordre ; inscription ; nom ; prenom ; specialite ; structure ; crom.
            Aucune coordonnée personnelle n&apos;est importée ni publiée. Les médecins qui ont une fiche vérifiée avec le même numéro d&apos;inscription n&apos;apparaissent pas en double.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={importDoctorRegister} className="grid gap-3 sm:grid-cols-[1fr_140px] sm:items-end">
            <Field label="Fichier CSV" htmlFor="reg-file"><Input id="reg-file" type="file" name="file" accept=".csv,text/csv" required /></Field>
            <Field label="Année du Tableau" htmlFor="reg-year"><Input id="reg-year" name="year" type="number" min={2000} max={2100} defaultValue={new Date().getFullYear() - 1} required /></Field>
            <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="replace" defaultChecked className="size-4" /> Remplacer l&apos;édition existante de cette année</label>
            <SubmitButton variant="secondary" pendingText="Import en cours (jusqu'à 1 minute)…" className="w-fit">Importer</SubmitButton>
          </ActionForm>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Entrées</CardTitle>
          <form method="get" className="flex flex-wrap gap-2">
            <input type="hidden" name="vue" value="tableau" />
            <Input name="q" defaultValue={sp.q} placeholder="Nom, prénom ou n° d'inscription" className="h-9 w-64" aria-label="Rechercher" />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="masques" value="1" defaultChecked={sp.masques === "1"} className="size-4" /> Masqués seulement</label>
            <Button type="submit" size="sm" variant="outline">Filtrer</Button>
          </form>
          <p className="text-xs text-muted-foreground">Un médecin demande à ne pas figurer sur PharmaProxi ? Masquez son entrée : elle n&apos;apparaît plus au public, et ce choix est conservé lors des imports suivants.</p>
        </CardHeader>
        <CardContent>
          {!data?.length ? <p className="text-sm text-muted-foreground">Aucune entrée.</p> : (
            <ul className="divide-y text-sm">
              {data.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="min-w-0">
                    <span className="font-medium">{r.last_name} {r.first_name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {[one(r.medical_specialties)?.name ?? r.specialty_label, r.structure, r.crom && `CROM ${r.crom}`, r.registration_number && `n° ${r.registration_number}`, String(r.register_year)].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <ActionForm action={setRegisterPublished}>
                    <input type="hidden" name="id" value={r.id} /><input type="hidden" name="published" value={r.is_published ? "false" : "true"} />
                    {!r.is_published && <Badge className="mr-2 bg-muted">Masqué</Badge>}
                    <SubmitButton size="sm" variant="outline">{r.is_published ? "Masquer" : "Rendre visible"}</SubmitButton>
                  </ActionForm>
                </li>
              ))}
            </ul>
          )}
          <Pagination basePath="/admin/annuaire" params={{ ...sp, vue: "tableau" }} page={range.page} total={count} />
        </CardContent>
      </Card>
    </div>
  );
}

/** Vue « Établissements non vérifiés » : import, liste, masquage, suppression. */
export async function FacilityAdmin({ sp }: { sp: SP }) {
  const supabase = await createClient();
  const st = await Stats();
  const range = pageRange(sp.page);
  const q = clean(sp.q);
  let query = supabase.from("facility_listings")
    .select("id, name, kind, category_label, city_label, phone, phone2, source, is_published, emergency_24h, regions(name)", { count: "exact" })
    .order("search_name").range(range.from, range.to);
  if (q) query = query.ilike("name", `%${q}%`);
  const { data, count } = await query;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {[["Établissements non vérifiés", st.facilities_total], ["Publiés", st.facilities_published]].map(([l, n]) => (
          <div key={l as string} className="rounded-xl border bg-white p-3"><p className="text-xs text-muted-foreground">{l}</p><p className="text-xl font-bold">{n ?? 0}</p></div>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Importer des établissements</CardTitle>
          <CardDescription>
            Fiches simples (nom, type, ville, téléphone) affichées comme « non vérifié » en attendant que l&apos;établissement s&apos;inscrive.
            Colonnes : <strong>nom</strong> ; type ; categorie ; region ; ville ; adresse ; telephone ; telephone2 ; latitude ; longitude ; source ;
            publie (oui/non) ; urgences_24h (oui/non). Types : clinique, cabinet, cabinet_dentaire, centre_sante, csref, hopital, imagerie, laboratoire, urgences, ambulance.
            N&apos;importez que des données dont vous avez le droit de vous servir et indiquez la source.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={importFacilities} className="grid gap-3 sm:grid-cols-2 sm:items-end">
            <Field label="Fichier CSV" htmlFor="fac-file"><Input id="fac-file" type="file" name="file" accept=".csv,text/csv" required /></Field>
            <Field label="Source (si la colonne est vide)" htmlFor="fac-src"><Input id="fac-src" name="source" maxLength={200} /></Field>
            <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="unpublished" /> Importer masqué (coordonnées à confirmer avant publication)</label>
            <SubmitButton variant="secondary" pendingText="Import…" className="w-fit">Importer</SubmitButton>
          </ActionForm>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Établissements</CardTitle>
          <form method="get" className="flex flex-wrap gap-2">
            <input type="hidden" name="vue" value="etablissements" />
            <Input name="q" defaultValue={sp.q} placeholder="Nom" className="h-9 w-56" aria-label="Rechercher" />
            <Button type="submit" size="sm" variant="outline">Filtrer</Button>
          </form>
        </CardHeader>
        <CardContent>
          {!data?.length ? <p className="text-sm text-muted-foreground">Aucun établissement.</p> : (
            <ul className="divide-y text-sm">
              {data.map((f) => (
                <li key={f.id} className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between">
                  <span className="min-w-0">
                    <span className="font-medium">{f.name}</span> {!f.is_published && <Badge className="bg-muted">Masqué</Badge>} {f.emergency_24h && <Badge className="border-red-200 bg-red-50 text-red-800">Urgences 24 h/24</Badge>}
                    <span className="block text-xs text-muted-foreground">
                      {[FACILITY_KINDS[f.kind] ?? f.kind, f.city_label ?? one(f.regions)?.name ?? "Ville non précisée", formatPhone(f.phone), formatPhone(f.phone2), `source : ${f.source}`].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <span className="flex shrink-0 gap-2">
                    <ActionForm action={setFacilityPublished}>
                      <input type="hidden" name="id" value={f.id} /><input type="hidden" name="published" value={f.is_published ? "false" : "true"} />
                      <SubmitButton size="sm" variant="outline">{f.is_published ? "Masquer" : "Publier"}</SubmitButton>
                    </ActionForm>
                    <ActionForm action={setFacilityEmergency}>
                      <input type="hidden" name="id" value={f.id} /><input type="hidden" name="on" value={f.emergency_24h ? "false" : "true"} />
                      <SubmitButton size="sm" variant="outline">{f.emergency_24h ? "Retirer urgences" : "Urgences 24 h"}</SubmitButton>
                    </ActionForm>
                    <ActionForm action={deleteFacility}>
                      <input type="hidden" name="id" value={f.id} />
                      <SubmitButton size="sm" variant="destructive" confirm={`Supprimer « ${f.name} » ?`}>Supprimer</SubmitButton>
                    </ActionForm>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Pagination basePath="/admin/annuaire" params={{ ...sp, vue: "etablissements" }} page={range.page} total={count} />
          <p className="mt-3 text-xs text-muted-foreground">
            Quand l&apos;établissement s&apos;inscrit lui-même (<Link prefetch={false} href="/clinique/inscription" className="underline">inscription</Link>) et que vous le validez, supprimez ou masquez sa fiche non vérifiée.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
