import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Pagination, pageRange } from "@/components/pagination";
import {
  deleteInsurer, importInsurerNetwork, linkConvention, saveInsurer, saveInsurerDetails, toggleProvider, updateConventions,
} from "@/app/actions/insurance";
import { formatDate, formatDateTime, formatPhone } from "@/lib/format";
import { ADMIN_CONVENTION_STATUS, ORG_TYPE, PROVIDER_CATEGORIES, PROVIDER_SINGULAR, isProviderCategory, type ProviderCategory } from "@/lib/insurance";
import { cn } from "@/lib/utils";

export const metadata = { title: "Administration — Assurances et conventions" };

type Ins = {
  id: string; name: string; slug: string; kind: string; org_type: string; status: string; health_offer: string; phone: string | null; website: string | null;
  email: string | null; address: string | null; logo_url: string | null; description: string | null; verified_at: string | null;
  documents_required: string | null; tiers_payant_terms: string | null; reimbursement_terms: string | null;
  network_date: string | null; network_source: string | null; notes: string | null; is_published: boolean;
};
type Conv = {
  id: string; category: ProviderCategory; name: string; area: string | null; address: string | null; phones: string[];
  pharmacy_id: string | null; listing_id: string | null; facility_id: string | null; match_method: string | null;
  is_published: boolean; convention_status: string; tiers_payant: boolean | null; ends_on: string | null; verified_at: string | null;
  source_label: string | null; source_date: string | null; admin_note: string | null;
};
type Cand = { convention_id: string; target_kind: string; target_id: string; target_name: string; place: string | null; score: number };
type Hist = { created_at: string; entity_id: string; details: { name?: string; status?: [string, string]; source?: string } };

const STATUS_TONE: Record<string, string> = {
  tiers_payant_confirme: "border-emerald-300 bg-emerald-50 text-emerald-900", remboursement: "border-sky-300 bg-sky-50 text-sky-900",
  en_attente: "border-amber-300 bg-amber-50 text-amber-900", a_verifier: "border-amber-300 bg-amber-50 text-amber-900",
  non_confirmee: "border-slate-300 bg-slate-50 text-slate-700", expiree: "border-red-300 bg-red-50 text-red-800", suspendue: "border-red-300 bg-red-50 text-red-800",
};
const TARGET_LABEL: Record<string, string> = { pharmacy: "pharmacie inscrite", listing: "annuaire des pharmacies", facility: "annuaire des établissements" };

function InsurerForm({ i }: { i?: Ins }) {
  const k = i?.id ?? "new";
  return (
    <ActionForm action={saveInsurer} className="grid gap-3 sm:grid-cols-2">
      {i && <input type="hidden" name="id" value={i.id} />}
      <Field label="Nom" htmlFor={`n-${k}`}><Input id={`n-${k}`} name="name" defaultValue={i?.name} required /></Field>
      <Field label="Adresse de la page (ex. sabu-nyuman)" htmlFor={`s-${k}`}><Input id={`s-${k}`} name="slug" defaultValue={i?.slug} placeholder="déduite du nom si vide" /></Field>
      <Field label="Catégorie technique" htmlFor={`k-${k}`}><Select id={`k-${k}`} name="kind" defaultValue={i?.kind ?? "assurance"}><option value="assurance">Assurance</option><option value="mutuelle">Mutuelle</option><option value="autre">Autre</option></Select></Field>
      <Field label="Téléphone de l'organisme" htmlFor={`p-${k}`}><Input id={`p-${k}`} name="phone" defaultValue={i?.phone ?? ""} inputMode="tel" /></Field>
      <Field label="Site internet" htmlFor={`w-${k}`}><Input id={`w-${k}`} name="website" type="url" defaultValue={i?.website ?? ""} /></Field>
      <Field label="Date de la liste des partenaires" htmlFor={`d-${k}`}><Input id={`d-${k}`} name="network_date" type="date" defaultValue={i?.network_date ?? ""} /></Field>
      <div className="sm:col-span-2"><Field label="Origine de la liste" htmlFor={`o-${k}`}><Input id={`o-${k}`} name="network_source" defaultValue={i?.network_source ?? ""} placeholder="ex. Liste communiquée par l'assureur" /></Field></div>
      <div className="sm:col-span-2"><Field label="Conditions affichées aux assurés" htmlFor={`c-${k}`}><Textarea id={`c-${k}`} name="notes" rows={2} defaultValue={i?.notes ?? ""} /></Field></div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_published" defaultChecked={i?.is_published ?? true} className="size-4" /> Publié</label>
      <SubmitButton size="sm" className="w-fit">{i ? "Enregistrer" : "Ajouter l'organisme"}</SubmitButton>
    </ActionForm>
  );
}

function InsurerDetailsForm({ i }: { i: Ins }) {
  return (
    <ActionForm action={saveInsurerDetails} className="grid gap-3 border-t pt-3 sm:grid-cols-2">
      <input type="hidden" name="id" value={i.id} />
      <Field label="Type d'organisme" htmlFor={`ot-${i.id}`}><Select id={`ot-${i.id}`} name="org_type" defaultValue={i.org_type}>{Object.entries(ORG_TYPE).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
      <Field label="Statut" htmlFor={`st-${i.id}`}><Select id={`st-${i.id}`} name="status" defaultValue={i.status}><option value="actif">Actif</option><option value="a_verifier">À vérifier</option><option value="inactif">Inactif</option></Select></Field>
      <Field label="Offre santé" htmlFor={`ho-${i.id}`}><Select id={`ho-${i.id}`} name="health_offer" defaultValue={i.health_offer}><option value="confirmee">Confirmée</option><option value="a_confirmer">À confirmer</option><option value="aucune">Aucune</option></Select></Field>
      <Field label="Date de vérification" htmlFor={`va-${i.id}`}><Input id={`va-${i.id}`} name="verified_at" type="date" defaultValue={i.verified_at ?? ""} /></Field>
      <Field label="E-mail professionnel" htmlFor={`em-${i.id}`}><Input id={`em-${i.id}`} name="email" type="email" defaultValue={i.email ?? ""} /></Field>
      <Field label="Logo (URL https)" htmlFor={`lo-${i.id}`}><Input id={`lo-${i.id}`} name="logo_url" type="url" defaultValue={i.logo_url ?? ""} /></Field>
      <div className="sm:col-span-2"><Field label="Adresse du siège" htmlFor={`ad-${i.id}`}><Input id={`ad-${i.id}`} name="address" defaultValue={i.address ?? ""} maxLength={250} /></Field></div>
      <div className="sm:col-span-2"><Field label="Description (produits santé, individuel / collectif, famille)" htmlFor={`de-${i.id}`}><Textarea id={`de-${i.id}`} name="description" rows={2} maxLength={800} defaultValue={i.description ?? ""} /></Field></div>
      <Field label="Documents à présenter" htmlFor={`dr-${i.id}`}><Textarea id={`dr-${i.id}`} name="documents_required" rows={2} maxLength={400} defaultValue={i.documents_required ?? ""} /></Field>
      <Field label="Conditions de tiers payant" htmlFor={`tp-${i.id}`}><Textarea id={`tp-${i.id}`} name="tiers_payant_terms" rows={2} maxLength={600} defaultValue={i.tiers_payant_terms ?? ""} /></Field>
      <div className="sm:col-span-2"><Field label="Conditions de remboursement" htmlFor={`rb-${i.id}`}><Textarea id={`rb-${i.id}`} name="reimbursement_terms" rows={2} maxLength={600} defaultValue={i.reimbursement_terms ?? ""} /></Field></div>
      <p className="text-xs text-muted-foreground sm:col-span-2">N&apos;indiquez que des informations sourcées (site, document ou courrier de l&apos;organisme).</p>
      <SubmitButton size="sm" variant="outline" className="w-fit">Enregistrer la fiche</SubmitButton>
    </ActionForm>
  );
}

export default async function AdminInsurance({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: insurers } = await supabase.from("insurers").select("*").order("name");
  const list = (insurers as Ins[] | null) ?? [];
  const current = list.find((i) => i.id === sp.assureur) ?? list.find((i) => i.slug === "sabu-nyuman") ?? list[0];
  const range = pageRange(sp.page, 30);
  const status = sp.statut && sp.statut in ADMIN_CONVENTION_STATUS ? sp.statut : null;
  const cat = isProviderCategory(sp.type) ? sp.type : null;
  const linkFilter = sp.lien === "oui" || sp.lien === "non" ? sp.lien : null;

  let convs: Conv[] = []; let count = 0;
  let counts: Record<string, number> = {};
  let cands = new Map<string, Cand[]>();
  let history: Hist[] = [];
  if (current) {
    let qy = supabase.from("insurer_providers")
      .select("id, category, name, area, address, phones, pharmacy_id, listing_id, facility_id, match_method, is_published, convention_status, tiers_payant, ends_on, verified_at, source_label, source_date, admin_note", { count: "exact" })
      .eq("insurer_id", current.id).order("category").order("name").range(range.from, range.to);
    if (status) qy = qy.eq("convention_status", status);
    if (cat) qy = qy.eq("category", cat);
    if (linkFilter === "oui") qy = qy.or("pharmacy_id.not.is.null,listing_id.not.is.null,facility_id.not.is.null");
    if (linkFilter === "non") qy = qy.is("pharmacy_id", null).is("listing_id", null).is("facility_id", null);
    if (sp.q) qy = qy.ilike("name", `%${sp.q.replace(/[%_,()]/g, " ").slice(0, 60)}%`);
    const [r, all, hist] = await Promise.all([
      qy,
      supabase.from("insurer_providers").select("convention_status").eq("insurer_id", current.id).limit(5000),
      supabase.from("audit_logs").select("created_at, entity_id, details").eq("action", "convention.update").contains("details", { insurer_id: current.id })
        .order("created_at", { ascending: false }).limit(15),
    ]);
    convs = (r.data as Conv[] | null) ?? []; count = r.count ?? 0;
    for (const x of (all.data as { convention_status: string }[] | null) ?? []) counts[x.convention_status] = (counts[x.convention_status] ?? 0) + 1;
    history = (hist.data as Hist[] | null) ?? [];
    const unlinked = convs.filter((c) => !c.pharmacy_id && !c.listing_id && !c.facility_id).map((c) => c.id);
    if (unlinked.length) {
      const { data } = await supabase.rpc("admin_convention_candidates", { p_ids: unlinked });
      for (const c of (data as Cand[] | null) ?? []) cands.set(c.convention_id, [...(cands.get(c.convention_id) ?? []), c]);
    }
  }
  const in60 = new Date(Date.now() + 60 * 86400_000).toISOString().slice(0, 10);
  const { data: expiring } = await supabase.from("insurer_providers")
    .select("id, name, ends_on, convention_status, insurers(name)").not("ends_on", "is", null).lte("ends_on", in60)
    .in("convention_status", ["tiers_payant_confirme", "remboursement"]).order("ends_on").limit(50);
  const base = { assureur: current?.id, statut: status ?? undefined, type: cat ?? undefined, lien: linkFilter ?? undefined, q: sp.q };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Assurances et conventions</h1>
        <p className="text-sm text-muted-foreground">
          Une convention n&apos;est publiée « Tiers payant confirmé » qu&apos;après validation ici, avec la source et la date de vérification. Les noms des praticiens et les e-mails ne sont jamais importés.{" "}
          <Link prefetch={false} href="/assurances" className="text-primary underline">Voir la page publique</Link>
        </p>
      </header>

      {(expiring ?? []).length > 0 && (
        <Card className="border-amber-300">
          <CardHeader><CardTitle>Conventions confirmées arrivant à expiration (60 jours)</CardTitle>
            <CardDescription>Une fois la date de fin passée, le badge disparaît automatiquement des pages publiques.</CardDescription></CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {(expiring ?? []).map((e) => {
                const ins = Array.isArray(e.insurers) ? e.insurers[0] : e.insurers;
                return <li key={e.id} className="py-2"><strong>{e.name}</strong> · {(ins as { name: string } | null)?.name} · fin le {formatDate(e.ends_on as string)}</li>;
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Organismes ({list.length})</CardTitle>
          <CardDescription>Assurances privées, régimes publics et mutuelles. Un organisme « à confirmer » est affiché avec cette mention.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          {list.map((i) => (
            <details key={i.id} className="rounded-xl border p-3">
              <summary className="flex cursor-pointer flex-wrap items-center gap-2 font-semibold">
                {i.name}
                <Badge className="bg-muted text-muted-foreground">{ORG_TYPE[i.org_type] ?? i.org_type}</Badge>
                {i.health_offer !== "confirmee" && <Badge className="bg-amber-50 text-amber-800">Offre santé à confirmer</Badge>}
                {!i.is_published && <Badge className="bg-amber-50 text-amber-800">Masqué</Badge>}
                <Link prefetch={false} href={`/admin/assurances?assureur=${i.id}`} className="text-sm font-normal text-primary underline">Conventions</Link>
              </summary>
              <div className="mt-3 space-y-3">
                <InsurerForm i={i} />
                <InsurerDetailsForm i={i} />
                <ActionForm action={deleteInsurer}><input type="hidden" name="id" value={i.id} /><SubmitButton size="sm" variant="ghost" confirm={`Supprimer ${i.name} et toutes ses conventions ? Préférez « Masqué » si vous n'êtes pas sûr.`}>Supprimer</SubmitButton></ActionForm>
              </div>
            </details>
          ))}
          <details className="rounded-xl border border-dashed p-3"><summary className="cursor-pointer font-semibold text-primary">+ Ajouter un organisme</summary><div className="mt-3"><InsurerForm /></div></details>
        </CardContent>
      </Card>

      {current && (
        <>
          <Card>
            <CardHeader><CardTitle>Importer une liste de partenaires — {current.name}</CardTitle>
              <CardDescription>Fichier Excel (.xlsx, première feuille) ou CSV. Colonnes reconnues : type ; structure ; region/commune ; region_nom ; situation geographique ; contact ; contact2 ; contact3. Les lignes importées sont « à vérifier » tant que vous ne les avez pas validées.</CardDescription></CardHeader>
            <CardContent>
              <ActionForm action={importInsurerNetwork} className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                <input type="hidden" name="insurer_id" value={current.id} />
                <Field label="Fichier" htmlFor="ins-file"><Input id="ins-file" type="file" name="file" accept=".xlsx,.csv,text/csv" required /></Field>
                <SubmitButton variant="secondary" pendingText="Import…">Importer</SubmitButton>
                <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="replace" className="size-4" /> Remplacer la liste actuelle (les liens manuels sont conservés)</label>
              </ActionForm>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Conventions de {current.name} ({count})</CardTitle>
              <CardDescription>
                {Object.entries(ADMIN_CONVENTION_STATUS).filter(([k]) => counts[k]).map(([k, l]) => `${l} : ${counts[k]}`).join(" · ") || "Aucune convention."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <form method="get" className="flex flex-wrap gap-2">
                <input type="hidden" name="assureur" value={current.id} />
                <Input name="q" defaultValue={sp.q ?? ""} placeholder="Nom" className="h-9 w-44" aria-label="Nom" />
                <Select name="statut" defaultValue={status ?? ""} className="h-9 w-52" aria-label="Statut">
                  <option value="">Tous les statuts</option>
                  {Object.entries(ADMIN_CONVENTION_STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </Select>
                <Select name="type" defaultValue={cat ?? ""} className="h-9 w-48" aria-label="Type">
                  <option value="">Tous les types</option>
                  {Object.entries(PROVIDER_CATEGORIES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </Select>
                <Select name="lien" defaultValue={linkFilter ?? ""} className="h-9 w-48" aria-label="Rattachement">
                  <option value="">Reliées ou non</option><option value="oui">Reliées à l&apos;annuaire</option><option value="non">Non reliées</option>
                </Select>
                <SubmitButton size="sm" variant="outline">Filtrer</SubmitButton>
              </form>

              <ActionForm action={updateConventions} id="bulk" className="grid gap-3 rounded-xl border bg-muted/40 p-3 sm:grid-cols-2 lg:grid-cols-4">
                <p className="text-sm font-semibold sm:col-span-2 lg:col-span-4">Modifier les conventions cochées ci-dessous</p>
                <Field label="Nouveau statut" htmlFor="b-st"><Select id="b-st" name="convention_status" defaultValue="">
                  <option value="">(inchangé)</option>{Object.entries(ADMIN_CONVENTION_STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </Select></Field>
                <Field label="Date de vérification" htmlFor="b-va"><Input id="b-va" name="verified_at" type="date" /></Field>
                <Field label="Début de convention" htmlFor="b-sd"><Input id="b-sd" name="starts_on" type="date" /></Field>
                <Field label="Fin de convention" htmlFor="b-ed"><Input id="b-ed" name="ends_on" type="date" /></Field>
                <div className="sm:col-span-2"><Field label="Source (document, courrier, page de l'organisme)" htmlFor="b-sl"><Input id="b-sl" name="source_label" maxLength={300} /></Field></div>
                <div className="sm:col-span-2"><Field label="Lien de la source" htmlFor="b-su"><Input id="b-su" name="source_url" type="url" /></Field></div>
                <div className="sm:col-span-2"><Field label="Prestations couvertes" htmlFor="b-sc"><Input id="b-sc" name="services_covered" maxLength={400} /></Field></div>
                <div className="sm:col-span-2"><Field label="Conditions particulières" htmlFor="b-co"><Input id="b-co" name="conditions" maxLength={600} /></Field></div>
                <div className="sm:col-span-2"><Field label="Commentaire administratif" htmlFor="b-an"><Input id="b-an" name="admin_note" maxLength={600} /></Field></div>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="unpublish" className="size-4" /> Masquer du public</label>
                <SubmitButton size="sm" className="w-fit self-end">Appliquer</SubmitButton>
              </ActionForm>

              <ul className="divide-y text-sm">
                {convs.map((c) => {
                  const linked = c.pharmacy_id ? "pharmacy" : c.listing_id ? "listing" : c.facility_id ? "facility" : null;
                  const linkHref = c.pharmacy_id ? `/pharmacies/${c.pharmacy_id}` : c.facility_id ? `/etablissements/${c.facility_id}` : null;
                  return (
                    <li key={c.id} className="space-y-2 py-3">
                      <label className="flex flex-wrap items-center gap-2">
                        <input type="checkbox" name="convention_id" value={c.id} form="bulk" className="size-4" aria-label={`Sélectionner ${c.name}`} />
                        <strong>{c.name}</strong>
                        <Badge className="bg-muted text-muted-foreground">{PROVIDER_SINGULAR[c.category]}</Badge>
                        <Badge className={cn(STATUS_TONE[c.convention_status])}>{ADMIN_CONVENTION_STATUS[c.convention_status] ?? c.convention_status}</Badge>
                        {c.tiers_payant && c.convention_status !== "tiers_payant_confirme" && <Badge className="bg-white text-muted-foreground">TP annoncé</Badge>}
                        {!c.is_published && <Badge className="bg-amber-50 text-amber-800">Masqué</Badge>}
                      </label>
                      <p className="text-muted-foreground">
                        {[c.area, c.address].filter(Boolean).join(" · ")} {c.phones.map(formatPhone).join(", ")}
                        {c.ends_on ? ` · fin le ${formatDate(c.ends_on)}` : ""}{c.verified_at ? ` · vérifiée le ${formatDate(c.verified_at)}` : ""}
                      </p>
                      {c.source_label && <p className="text-xs text-muted-foreground">Source : {c.source_label}{c.source_date ? ` (${formatDate(c.source_date)})` : ""}</p>}
                      {c.admin_note && <p className="text-xs">Note : {c.admin_note}</p>}
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        {linked ? (
                          <span>Reliée : {TARGET_LABEL[linked]} ({c.match_method === "manuel" ? "manuel" : "correspondance exacte"}){linkHref && <> · <Link prefetch={false} href={linkHref} className="text-primary underline">voir</Link></>}</span>
                        ) : (
                          <span className="text-muted-foreground">Non reliée à l&apos;annuaire</span>
                        )}
                        {(cands.get(c.id)?.length || linked) ? (
                          <ActionForm action={linkConvention} className="flex flex-wrap items-center gap-2">
                            <input type="hidden" name="convention_id" value={c.id} />
                            <Select name="target" defaultValue="" className="h-8 w-72" aria-label="Fiche de l'annuaire">
                              <option value="">— choisir une fiche —</option>
                              {(cands.get(c.id) ?? []).map((x) => (
                                <option key={x.target_id} value={`${x.target_kind}:${x.target_id}`}>{x.target_name}{x.place ? ` (${x.place})` : ""} · {Math.round(x.score * 100)} %</option>
                              ))}
                              {linked && <option value="none:">Retirer le lien</option>}
                            </Select>
                            <SubmitButton size="sm" variant="outline">Relier</SubmitButton>
                          </ActionForm>
                        ) : null}
                        <ActionForm action={toggleProvider}><input type="hidden" name="provider_id" value={c.id} /><input type="hidden" name="published" value={String(!c.is_published)} />
                          <SubmitButton size="sm" variant="ghost">{c.is_published ? "Masquer" : "Publier"}</SubmitButton></ActionForm>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <Pagination basePath="/admin/assurances" params={base} page={range.page} total={count} size={30} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Historique des modifications — {current.name}</CardTitle>
              <CardDescription>Changements de statut, de publication, de dates et de rattachement (15 derniers). <Link prefetch={false} href="/admin/audit" className="text-primary underline">Journal complet</Link></CardDescription></CardHeader>
            <CardContent>
              {history.length === 0 ? <p className="text-sm text-muted-foreground">Aucune modification.</p> : (
                <ul className="divide-y text-sm">
                  {history.map((h, k) => (
                    <li key={k} className="py-2">
                      {formatDateTime(h.created_at)} · <strong>{h.details?.name}</strong>
                      {h.details?.status && h.details.status[0] !== h.details.status[1] ? ` · ${ADMIN_CONVENTION_STATUS[h.details.status[0]] ?? h.details.status[0]} → ${ADMIN_CONVENTION_STATUS[h.details.status[1]] ?? h.details.status[1]}` : " · rattachement ou publication"}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
