import Link from "next/link";
import { House, MessageCircle, Phone, Search, ShieldCheck, Syringe } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Pagination, pageRange } from "@/components/pagination";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { getGeo } from "@/lib/geo";
import { formatPhone, whatsappUrl } from "@/lib/format";
import { CARE_TYPES } from "@/lib/nurses";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "Infirmiers et soins à domicile",
  description: "Trouver un infirmier inscrit à l'Ordre et une structure de soins infirmiers à domicile au Mali.",
};
export const revalidate = 0;

type Provider = { id: string; name: string; address: string | null; areas: string | null; phone: string | null; whatsapp: string | null; care_types: string[];
  activity: string | null; hours: string | null; prices: string | null; booking: string | null; verification: string; verified_at: string | null; source: string; regions: { name: string } | null };
type Nurse = { id: string; register_year: number; registration_number: string | null; last_name: string; first_name: string; specialty: string | null; section: string | null;
  region_name: string | null; commune_label: string | null; structure: string | null; phone: string | null; home_care: boolean; verification: string; verified_at: string | null; total_count: number };
const uuidOrNull = (v?: string) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : null);

export default async function NursesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const tab = sp.onglet === "ordre" ? "ordre" : "domicile";
  const geo = await getGeo();
  const range = pageRange(sp.page);
  let providers: Provider[] = [];
  let nurses: Nurse[] = [];
  let summary: { year?: number; total?: number } = {};
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const [p, n, s] = await Promise.all([
      supabase.from("home_care_providers").select("id, name, address, areas, phone, whatsapp, care_types, activity, hours, prices, booking, verification, verified_at, source, regions(name)")
        .eq("is_published", true).order("verification", { ascending: false }).order("name"),
      tab === "ordre"
        ? supabase.rpc("search_nurse_register", { p_query: (sp.q ?? "").slice(0, 80) || null, p_region: uuidOrNull(sp.region), p_home_care: sp.domicile === "1" ? true : null, p_limit: range.to - range.from + 1, p_offset: range.from })
        : Promise.resolve({ data: [] }),
      supabase.rpc("nurse_register_summary"),
    ]);
    providers = (p.data as unknown as Provider[] | null) ?? [];
    nurses = (n.data as Nurse[] | null) ?? [];
    summary = (s.data as typeof summary) ?? {};
  }
  const total = nurses[0]?.total_count ?? 0;

  return (
    <div className="container-page space-y-5 py-6">
      <header className="space-y-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-brand-deep"><Syringe className="size-7 text-primary" aria-hidden /> Infirmiers et soins à domicile</h1>
        <p className="max-w-3xl text-muted-foreground">Pansements, injections, perfusions, suivi après une opération, soins aux personnes âgées : trouvez une structure qui se déplace à domicile ou un infirmier inscrit à l&apos;Ordre.</p>
      </header>

      <nav aria-label="Rubriques" className="flex gap-2">
        {[["domicile", "Soins à domicile", House], ["ordre", "Tableau de l'Ordre des infirmiers", ShieldCheck]].map(([k, l, I]) => {
          const Icon = I as typeof House;
          return <Link key={k as string} prefetch={false} href={`/infirmiers${k === "ordre" ? "?onglet=ordre" : ""}`} aria-current={tab === k ? "page" : undefined}
            className={cn("flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold", tab === k ? "border-primary bg-primary text-white" : "bg-white hover:border-primary")}><Icon className="size-4" aria-hidden />{l as string}</Link>;
        })}
      </nav>

      {tab === "domicile" ? (
        <section className="space-y-3" aria-label="Structures de soins à domicile">
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
            Les structures « non vérifiées » sont référencées à partir d&apos;informations publiques ou transmises : PharmaProxi n&apos;a pas encore contrôlé leur autorisation d&apos;exercer,
            leurs disponibilités ni leurs tarifs. Demandez toujours le nom et la qualification de l&apos;infirmier qui viendra, et le tarif avant le soin.
          </p>
          {providers.length === 0 ? <p className="rounded-xl border bg-white p-5 text-muted-foreground">Aucune structure référencée pour le moment.</p> : (
            <ul className="grid gap-3 md:grid-cols-2">
              {providers.map((p) => {
                const wa = whatsappUrl(p.whatsapp ?? p.phone, `Bonjour ${p.name}, je vous contacte via PharmaProxi pour des soins à domicile.`);
                return (
                  <li key={p.id} className="flex flex-col gap-2 rounded-xl border bg-white p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-bold">{p.name}</h2>
                      {p.verification === "verifie"
                        ? <Badge className="border-emerald-200 bg-emerald-50 text-emerald-800"><ShieldCheck className="size-3" aria-hidden /> Autorisation vérifiée</Badge>
                        : <Badge className="bg-muted text-muted-foreground">Non vérifiée</Badge>}
                    </div>
                    {p.activity && <p className="text-sm">{p.activity}</p>}
                    <p className="text-sm text-muted-foreground">{[p.address, p.regions?.name].filter(Boolean).join(" · ")}{p.areas && p.areas !== "Bamako" ? ` — se déplace : ${p.areas}` : ""}</p>
                    {p.care_types.length > 0 && <ul className="flex flex-wrap gap-1">{p.care_types.map((c) => <li key={c} className="rounded-full bg-brand-sky px-2 py-0.5 text-xs text-brand-blue">{CARE_TYPES[c] ?? c}</li>)}</ul>}
                    {(p.hours || p.prices || p.booking) && (
                      <dl className="grid gap-0.5 text-xs text-muted-foreground">
                        {p.hours && <div><dt className="inline font-semibold">Horaires : </dt><dd className="inline">{p.hours}</dd></div>}
                        {p.prices && <div><dt className="inline font-semibold">Tarifs communiqués : </dt><dd className="inline">{p.prices}</dd></div>}
                        {p.booking && <div><dt className="inline font-semibold">Réservation : </dt><dd className="inline">{p.booking}</dd></div>}
                      </dl>
                    )}
                    <div className="mt-auto flex flex-wrap gap-2 pt-1">
                      {p.phone && <a href={`tel:${p.phone}`} className={buttonVariants({ size: "sm" })}><Phone aria-hidden /> {formatPhone(p.phone)}</a>}
                      {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ size: "sm", variant: "outline" }))}><MessageCircle aria-hidden /> WhatsApp</a>}
                    </div>
                    <p className="text-[11px] text-muted-foreground">Source : {p.source}{p.verified_at ? ` · vérifiée le ${new Date(p.verified_at).toLocaleDateString("fr-FR")}` : ""}</p>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="text-sm">Vous gérez une structure de soins à domicile ? <Link prefetch={false} href="/infos/contact" className="font-semibold text-primary underline">Écrivez-nous</Link> pour être référencé ou vérifié (autorisation d&apos;exercer, zones, tarifs).</p>
        </section>
      ) : (
        <section className="space-y-3" aria-label="Tableau de l'Ordre des infirmiers">
          {!summary.total ? (
            <p className="rounded-xl border bg-white p-5 text-muted-foreground">Le Tableau de l&apos;Ordre des infirmiers sera bientôt consultable ici.</p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">Tableau {summary.year} du Conseil national de l&apos;Ordre des infirmiers (CNOIIM) : {summary.total} inscrit(s). L&apos;inscription au Tableau atteste du droit d&apos;exercer ; elle ne dit rien de la disponibilité.</p>
              <form method="get" className="flex flex-col gap-2 rounded-xl border bg-white p-3 sm:flex-row sm:items-end">
                <input type="hidden" name="onglet" value="ordre" />
                <label className="flex-1"><span className="sr-only">Nom, structure ou n° d&apos;inscription</span><Input name="q" defaultValue={sp.q ?? ""} placeholder="Nom, structure ou n° d'inscription" /></label>
                <Select name="region" defaultValue={sp.region ?? ""} aria-label="Région" className="sm:max-w-xs">
                  <option value="">Toutes les régions</option>
                  {geo.regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </Select>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="domicile" value="1" defaultChecked={sp.domicile === "1"} className="size-4" /> Se déplace à domicile</label>
                <Button type="submit"><Search aria-hidden /> Rechercher</Button>
              </form>
              {nurses.length === 0 ? <p className="rounded-xl border bg-white p-5 text-muted-foreground">Aucun résultat.</p> : (
                <ul className="divide-y rounded-xl border bg-white">
                  {nurses.map((n) => (
                    <li key={n.id} className="flex flex-col gap-1 p-3 sm:flex-row sm:items-center sm:gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">{n.last_name} {n.first_name}
                          {n.verification === "verifie" && <Badge className="ml-2 border-emerald-200 bg-emerald-50 text-emerald-800"><ShieldCheck className="size-3" aria-hidden /> Coordonnées vérifiées</Badge>}
                          {n.home_care && <Badge className="ml-2 bg-brand-sky text-brand-blue">À domicile</Badge>}</p>
                        <p className="text-sm text-muted-foreground">{[n.specialty, n.structure, n.commune_label, n.region_name ?? n.section].filter(Boolean).join(" · ")}</p>
                        {n.registration_number && <p className="text-xs text-muted-foreground">Inscription n° {n.registration_number}</p>}
                      </div>
                      {n.phone
                        ? <a href={`tel:${n.phone}`} className={buttonVariants({ size: "sm" })}><Phone aria-hidden /> {formatPhone(n.phone)}</a>
                        : <span className="text-xs text-muted-foreground">Coordonnées non publiées</span>}
                    </li>
                  ))}
                </ul>
              )}
              <Pagination basePath="/infirmiers" params={{ onglet: "ordre", q: sp.q, region: sp.region, domicile: sp.domicile }} page={range.page} total={total} />
            </>
          )}
          <p className="text-sm">Vous êtes infirmier ou infirmière ? <Link prefetch={false} href="/infos/contact" className="font-semibold text-primary underline">Écrivez-nous</Link> pour publier votre numéro professionnel, signaler que vous vous déplacez à domicile, corriger une information ou demander le retrait de votre nom.</p>
        </section>
      )}
    </div>
  );
}
