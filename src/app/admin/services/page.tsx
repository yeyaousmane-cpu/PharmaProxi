import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { addDuty, deleteDuty, importDuty, importExams } from "@/app/actions/services";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { dutyRange } from "@/components/duty/duty-badge";
import { cn } from "@/lib/utils";

export const metadata = { title: "Gardes, examens et ruptures — administration" };
const VIEWS = [["garde", "Pharmacies de garde"], ["examens", "Laboratoires et examens"], ["observatoire", "Observatoire des ruptures"]] as const;

type Duty = { duty_id: string; kind: string; name: string; area: string | null; starts_at: string; ends_at: string; status: "confirmed" | "declared"; source: string };
type Obs = { alerts: { produit: string; region: string; n: number; satisfaites: number }[]; searches: { recherche: string; region: string; n: number }[] };

export default async function AdminServices({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const view = VIEWS.some(([k]) => k === sp.vue) ? sp.vue! : "garde";
  const supabase = await createClient();
  const tab = (k: string, label: string) => (
    <Link prefetch={false} key={k} href={`/admin/services?vue=${k}`} aria-current={view === k ? "page" : undefined}
      className={cn("rounded-full border px-4 py-2 text-sm font-medium", view === k ? "border-brand-blue bg-brand-sky text-brand-blue" : "bg-white")}>{label}</Link>
  );

  let body: React.ReactNode = null;
  if (view === "garde") {
    const now = new Date();
    const [{ data: duties }, { data: verified }, { data: listings }] = await Promise.all([
      supabase.rpc("duty_pharmacies", { p_from: now.toISOString(), p_to: new Date(now.getTime() + 30 * 86400_000).toISOString() }),
      supabase.from("pharmacies").select("id, name, communes(name)").eq("status", "verified").order("name").limit(500),
      sp.q ? supabase.from("pharmacy_listings").select("id, name, area_label, communes(name)").ilike("name", `%${sp.q}%`).eq("is_published", true).order("name").limit(50) : Promise.resolve({ data: [] as { id: string; name: string; area_label: string | null; communes: unknown }[] }),
    ]);
    const list = ((duties as Duty[]) ?? []).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    const cname = (c: unknown) => ((Array.isArray(c) ? c[0] : c) as { name?: string } | null)?.name ?? "";
    body = (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Importer un tableau de garde</CardTitle>
            <CardDescription>
              CSV avec les colonnes <strong>pharmacie ; region ; debut</strong> ; commune ; fin ; source. Dates : 2026-11-02, 02/11/2026 ou 2026-11-02 20:00
              (heure de Bamako). Une date seule = garde de 8 h à 8 h le lendemain. La pharmacie doit déjà figurer dans l&apos;annuaire (inscrite ou non).
              Indiquez la source officielle (Ordre des pharmaciens, direction régionale…).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={importDuty} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <Field label="Fichier CSV" htmlFor="duty-file"><Input id="duty-file" type="file" name="file" accept=".csv,text/csv" required /></Field>
              <Field label="Source (si la colonne est vide)" htmlFor="duty-src"><Input id="duty-src" name="source" maxLength={200} placeholder="Tableau de garde de l'Ordre — novembre 2026" /></Field>
              <SubmitButton variant="secondary" pendingText="Import…">Importer</SubmitButton>
            </ActionForm>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Ajouter une garde</CardTitle><CardDescription>Pharmacies inscrites, ou recherchez une pharmacie non inscrite par son nom.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <form method="get" className="flex flex-wrap gap-2">
              <input type="hidden" name="vue" value="garde" />
              <Input name="q" defaultValue={sp.q} placeholder="Pharmacie non inscrite (nom)" className="h-9 w-64" aria-label="Rechercher une pharmacie non inscrite" />
              <Button type="submit" size="sm" variant="outline">Chercher</Button>
            </form>
            <ActionForm action={addDuty} className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_auto] lg:items-end">
              <Field label="Pharmacie" htmlFor="duty-target">
                <Select id="duty-target" name="target" required defaultValue="">
                  <option value="" disabled>Choisir…</option>
                  <optgroup label="Inscrites et vérifiées">{(verified ?? []).map((p) => <option key={p.id} value={`p:${p.id}`}>{p.name}{cname(p.communes) ? ` — ${cname(p.communes)}` : ""}</option>)}</optgroup>
                  {(listings ?? []).length > 0 && <optgroup label="Non inscrites">{(listings ?? []).map((l) => <option key={l.id} value={`l:${l.id}`}>{l.name}{cname(l.communes) || l.area_label ? ` — ${cname(l.communes) || l.area_label}` : ""}</option>)}</optgroup>}
                </Select>
              </Field>
              <Field label="Début" htmlFor="duty-s"><Input id="duty-s" type="datetime-local" name="start" required /></Field>
              <Field label="Fin" htmlFor="duty-e"><Input id="duty-e" type="datetime-local" name="end" required /></Field>
              <Field label="Source" htmlFor="duty-so"><Input id="duty-so" name="source" maxLength={200} /></Field>
              <SubmitButton size="sm">Ajouter</SubmitButton>
            </ActionForm>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Gardes en cours et à venir (30 jours)</CardTitle></CardHeader>
          <CardContent>
            {list.length === 0 ? <p className="text-sm text-muted-foreground">Aucune garde enregistrée.</p> : (
              <ul className="divide-y text-sm">
                {list.map((d) => (
                  <li key={d.duty_id} className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between">
                    <span><span className="font-medium">{d.name}</span> {d.kind === "listing" && <Badge className="bg-muted">non inscrite</Badge>}
                      <span className="block text-xs text-muted-foreground">{dutyRange(d)} · {d.area} · {d.status === "confirmed" ? d.source : "déclarée par la pharmacie"}</span></span>
                    <ActionForm action={deleteDuty}><input type="hidden" name="id" value={d.duty_id} /><SubmitButton size="sm" variant="destructive" confirm="Supprimer cette garde ?">Supprimer</SubmitButton></ActionForm>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    );
  } else if (view === "examens") {
    const [{ data: exams }, { count }] = await Promise.all([
      supabase.from("medical_exams").select("code, name, category").order("sort_order"),
      supabase.from("facility_exams").select("id", { count: "exact", head: true }),
    ]);
    body = (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Importer les examens proposés</CardTitle>
            <CardDescription>
              CSV : <strong>etablissement ; examen</strong> ; region ; prix ; note_prix ; delai ; source ; verifie_le (AAAA-MM-JJ).
              L&apos;établissement doit d&apos;abord être importé dans <Link prefetch={false} href="/admin/annuaire?vue=etablissements" className="underline">Annuaire › Établissements</Link> (type laboratoire ou imagerie).
              <strong> N&apos;indiquez un prix que s&apos;il a été communiqué par l&apos;établissement</strong> ; laissez-le vide sinon. Une ligne existante est mise à jour.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={importExams} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <Field label="Fichier CSV" htmlFor="ex-file"><Input id="ex-file" type="file" name="file" accept=".csv,text/csv" required /></Field>
              <Field label="Source (si la colonne est vide)" htmlFor="ex-src"><Input id="ex-src" name="source" maxLength={200} placeholder="Appel au laboratoire le …" /></Field>
              <SubmitButton variant="secondary" pendingText="Import…">Importer</SubmitButton>
            </ActionForm>
            <p className="mt-3 text-sm text-muted-foreground">{count ?? 0} examen(s) proposé(s) enregistré(s). <Link prefetch={false} href="/laboratoires" className="text-primary underline">Voir la page publique</Link></p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Codes d&apos;examens</CardTitle><CardDescription>Utilisez le code (ou le nom exact) dans la colonne « examen ».</CardDescription></CardHeader>
          <CardContent>
            <ul className="grid gap-1 text-sm sm:grid-cols-2">
              {(exams ?? []).map((e) => <li key={e.code}><code className="rounded bg-muted px-1">{e.code}</code> {e.name}</li>)}
            </ul>
          </CardContent>
        </Card>
      </div>
    );
  } else {
    const days = [7, 30, 90].includes(Number(sp.jours)) ? Number(sp.jours) : 30;
    const { data } = await supabase.rpc("admin_shortage_observatory", { p_days: days });
    const o = (data as Obs) ?? { alerts: [], searches: [] };
    body = (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Données agrégées et anonymes. Elles reflètent la demande exprimée sur PharmaProxi, pas l&apos;état réel du marché : à croiser avec d&apos;autres sources
          avant toute communication. Les recherches sans résultat ne sont listées qu&apos;à partir de 3 occurrences.
        </p>
        <div className="flex gap-2 text-sm">
          {[7, 30, 90].map((d) => <Link prefetch={false} key={d} href={`/admin/services?vue=observatoire&jours=${d}`} className={cn("rounded-md px-3 py-1", d === days ? "bg-muted font-semibold" : "hover:bg-muted")}>{d} jours</Link>)}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Alertes de disponibilité demandées</CardTitle></CardHeader>
            <CardContent>
              {o.alerts.length === 0 ? <p className="text-sm text-muted-foreground">Aucune alerte sur la période.</p> : (
                <table className="w-full text-sm"><thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1">Produit</th><th>Zone</th><th className="text-right">Demandes</th><th className="text-right">Satisfaites</th></tr></thead>
                  <tbody>{o.alerts.map((a, i) => <tr key={i} className="border-t"><td className="py-1.5">{a.produit}</td><td>{a.region}</td><td className="text-right font-semibold">{a.n}</td><td className="text-right">{a.satisfaites}</td></tr>)}</tbody></table>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Recherches de médicaments sans résultat</CardTitle></CardHeader>
            <CardContent>
              {o.searches.length === 0 ? <p className="text-sm text-muted-foreground">Rien à signaler sur la période.</p> : (
                <table className="w-full text-sm"><thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1">Recherche</th><th>Zone</th><th className="text-right">Fois</th></tr></thead>
                  <tbody>{o.searches.map((a, i) => <tr key={i} className="border-t"><td className="py-1.5">{a.recherche}</td><td>{a.region}</td><td className="text-right font-semibold">{a.n}</td></tr>)}</tbody></table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Gardes, examens et ruptures</h1>
      <nav className="flex flex-wrap gap-2" aria-label="Rubriques">{VIEWS.map(([k, l]) => tab(k, l))}</nav>
      {body}
    </div>
  );
}
