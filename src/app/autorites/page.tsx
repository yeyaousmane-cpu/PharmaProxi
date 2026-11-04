import Link from "next/link";
import { Building2, Download, Droplet, MessageCircleQuestion, Pill, Search, Store, TrendingUp, TriangleAlert } from "lucide-react";
import { authorityContext } from "@/lib/authority-server";
import { getGeo } from "@/lib/geo";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { CAN, PERIODS, QUESTION_ABOUT, fmtN } from "@/lib/authorities";
import { DataBadge, DataLegend, type DataKind } from "@/components/authorities/data-badge";
import { RegistryTrend } from "@/components/authorities/registry-trend";
import { formatXof } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Tableau de bord — Autorités", robots: { index: false } };

type Overview = { searches: number | null; searches_unfound: number | null; unfound_rate: number | null; pharmacies_verified: number; pharmacies_fresh_stock: number; on_duty_now: number; blood_donors: number | null; questions: number | null; reports: number | null };
type SearchRow = { query: string; searches: number; unfound: number; regions: number };
type RegionRow = { region_id: string; region: string; searches: number | null; unfound_rate: number | null; pharmacies: number; fresh_stock: number; on_duty_now: number };
type GapRow = { region: string; commune: string; pharmacies: number; on_duty_24h: number };
type AmoRow = { product: string; tariff: number; prices: number; min_price: number; avg_price: number; max_price: number; gap_pct: number };
type Topics = { questions: { about: string; n: number }[]; urgent_questions: number | null; articles: { title: string; slug: string; n: number }[] };
type SupplyRegion = { region: string; region_id: string; pharmacies: number; pharmacies_listed: number; doctors_register: number; labs: number; health_facilities: number; home_care: number; home_sampling: number };
type Supply = { register_year: number | null; by_region: SupplyRegion[]; specialties: { specialty: string; n: number }[]; facility_kinds: { kind: string; n: number }[]; exams_with_price: number };
const KIND: Record<string, string> = { laboratoire: "Laboratoires", clinique: "Cliniques", centre_sante: "Centres de santé", csref: "CSRéf", hopital: "Hôpitaux", cabinet: "Cabinets médicaux", cabinet_dentaire: "Cabinets dentaires", imagerie: "Imagerie" };
type Blood = { by_group: { group: string; n: number | null }[]; by_region: { region: string; n: number | null }[]; needs_30d: number; campaigns: { title: string; date: string; place: string; going: number | null }[] };

function Tile({ icon: Icon, label, value, hint, tone }: { icon: typeof Search; label: string; value: string; hint?: string; tone?: string }) {
  return (
    <div className="rounded-2xl border bg-white p-4">
      <p className="flex items-center gap-2 text-sm text-muted-foreground"><Icon className={cn("size-4", tone ?? "text-primary")} aria-hidden />{label}</p>
      <p className="mt-1 text-2xl font-bold text-brand-deep">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
const Bar = ({ v, max, tone = "bg-primary" }: { v: number; max: number; tone?: string }) => (
  <span className="block h-2 rounded-full bg-muted"><span className={cn("block h-2 rounded-full", tone)} style={{ width: `${Math.max(3, Math.round((100 * v) / Math.max(1, max)))}%` }} /></span>
);
function Section({ id, title, icon: Icon, children, note, data }: { id: string; title: string; icon: typeof Search; children: React.ReactNode; note?: string; data?: DataKind[] }) {
  return (
    <section id={id} className="scroll-mt-24 space-y-3 rounded-2xl border bg-white p-4 sm:p-5">
      <h2 className="flex flex-wrap items-center gap-2 text-lg font-bold text-brand-deep"><Icon className="size-5 text-primary" aria-hidden />{title}{(data ?? []).map((d) => <DataBadge key={d} kind={d} />)}</h2>
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
      {children}
    </section>
  );
}
const Empty = () => <p className="text-sm text-muted-foreground">Pas encore assez de données pour afficher ce tableau sans risque de reconnaître quelqu&apos;un (seuil : 10).</p>;

export default async function AuthorityDashboard({ searchParams }: { searchParams: Promise<{ region?: string; jours?: string; terme?: string }> }) {
  const sp = await searchParams;
  const ctx = await authorityContext("/autorites");
  if (!ctx.ok) return null;
  const { supabase } = ctx;
  const geo = await getGeo();
  const region = geo.regions.some((r) => r.id === sp.region) ? sp.region! : null;
  const days = PERIODS.some(([d]) => d === sp.jours) ? Number(sp.jours) : 30;
  const term = (sp.terme ?? "paludisme").trim().slice(0, 40) || "paludisme";
  const from = new Date(Date.now() - (days - 1) * 86_400_000).toISOString().slice(0, 10);
  const to = new Date().toISOString().slice(0, 10);
  const canBlood = ctx.admin || CAN.blood.includes(ctx.scope);
  const [ov, unfound, top, trend, regions, gaps, amo, topics, blood, supply] = await Promise.all([
    supabase.rpc("authority_overview", { p_region: region, p_from: from, p_to: to }),
    supabase.rpc("authority_searches", { p_region: region, p_from: from, p_to: to, p_unfound: true, p_limit: 20 }),
    supabase.rpc("authority_searches", { p_region: region, p_from: from, p_to: to, p_unfound: false, p_limit: 10 }),
    supabase.rpc("authority_trend", { p_term: term, p_region: region, p_weeks: 12 }),
    supabase.rpc("authority_regions", { p_from: from, p_to: to }),
    supabase.rpc("authority_duty_gaps", { p_region: region }),
    supabase.rpc("authority_amo_prices", { p_region: region, p_limit: 15 }),
    supabase.rpc("authority_topics", { p_from: from, p_to: to }),
    canBlood ? supabase.rpc("authority_blood", { p_region: region }) : Promise.resolve({ data: null }),
    supabase.rpc("authority_supply", { p_region: region }),
  ]);
  const o = (ov.data ?? {}) as Overview;
  const uf = (unfound.data ?? []) as SearchRow[];
  const tp = (top.data ?? []) as SearchRow[];
  const tr = (trend.data ?? []) as { week: string; searches: number | null; unfound: number | null }[];
  const rg = (regions.data ?? []) as RegionRow[];
  const gp = ((gaps.data ?? []) as GapRow[]);
  const am = (amo.data ?? []) as AmoRow[];
  const tc = topics.data as Topics | null;
  const bl = blood.data as Blood | null;
  const sp2 = supply.data as Supply | null;
  const unfoundBy = new Map(rg.map((r) => [r.region_id, r.unfound_rate]));
  const weak = (sp2?.by_region ?? []).filter((r) => r.pharmacies + r.pharmacies_listed === 0 || r.labs === 0 || (unfoundBy.get(r.region_id) ?? 0) >= 40);
  const regionName = region ? geo.regions.find((r) => r.id === region)?.name : "Tout le Mali";
  const qs = new URLSearchParams({ ...(region ? { region } : {}), jours: String(days) }).toString();
  const trMax = Math.max(1, ...tr.map((t) => Number(t.searches ?? 0)));

  return (
    <div className="space-y-4">
      <form method="get" className="flex flex-wrap items-end gap-2 rounded-2xl border bg-white p-3">
        <label className="text-sm">Région<Select name="region" defaultValue={region ?? ""} className="mt-1 h-10 w-56"><option value="">Tout le Mali</option>{geo.regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></label>
        <label className="text-sm">Période<Select name="jours" defaultValue={String(days)} className="mt-1 h-10 w-48">{PERIODS.map(([d, l]) => <option key={d} value={d}>{l}</option>)}</Select></label>
        <label className="text-sm">Mot à suivre<Input name="terme" defaultValue={term} className="mt-1 h-10 w-44" minLength={3} maxLength={40} /></label>
        <Button type="submit" size="sm">Afficher</Button>
        <span className="ml-auto text-xs text-muted-foreground">{regionName} · du {new Date(from).toLocaleDateString("fr-FR")} au {new Date(to).toLocaleDateString("fr-FR")}</span>
      </form>

      <DataLegend />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile icon={Search} label="Recherches de médicaments" value={fmtN(o.searches)} />
        <Tile icon={TriangleAlert} tone="text-amber-600" label="Recherches sans résultat" value={o.unfound_rate !== null && o.unfound_rate !== undefined ? `${o.unfound_rate} %` : "—"} hint={o.searches_unfound !== null ? `${fmtN(o.searches_unfound)} recherches` : undefined} />
        <Tile icon={Store} label="Pharmacies vérifiées" value={fmtN(o.pharmacies_verified ?? 0)} hint={`${o.pharmacies_fresh_stock ?? 0} avec stocks à jour (30 j) · ${o.on_duty_now ?? 0} de garde maintenant`} />
        <Tile icon={MessageCircleQuestion} label="Questions aux pharmaciens" value={fmtN(o.questions)} hint={`Signalements de médicaments : ${fmtN(o.reports)}`} />
      </div>

      <Section id="introuvables" data={["estimation"]} title="Médicaments cherchés sans résultat" icon={TriangleAlert}
        note="Signal précoce de rupture à vérifier sur le terrain : une recherche peut aussi échouer parce qu'une pharmacie n'a pas mis ses stocks à jour, ou à cause d'une faute de frappe.">
        {uf.length ? (
          <>
            <ol className="space-y-2 text-sm">{uf.map((r) => (
              <li key={r.query} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1">
                <span className="font-medium">{r.query}</span><span className="text-right tabular-nums">{fmtN(r.unfound)} sur {fmtN(r.searches)}</span>
                <span className="col-span-2"><Bar v={Number(r.unfound)} max={Number(uf[0].unfound)} tone="bg-amber-500" /></span>
              </li>))}</ol>
            <a href={`/autorites/export?type=introuvables&${qs}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary"><Download className="size-4" aria-hidden /> Télécharger (CSV)</a>
          </>
        ) : <Empty />}
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section id="cherches" data={["mesure"]} title="Médicaments les plus cherchés" icon={Search}>
          {tp.length ? <ol className="space-y-2 text-sm">{tp.map((r) => (
            <li key={r.query} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1"><span className="font-medium">{r.query}</span><span className="tabular-nums">{fmtN(r.searches)}</span>
              <span className="col-span-2"><Bar v={Number(r.searches)} max={Number(tp[0].searches)} /></span></li>))}</ol> : <Empty />}
        </Section>
        <Section id="tendance" data={["mesure"]} title={`Évolution des recherches : « ${term} »`} icon={TrendingUp} note="Recherches par semaine sur 12 semaines. Utile pour repérer un pic saisonnier (paludisme en saison des pluies, méningite…).">
          {tr.some((t) => t.searches !== null) ? (
            <div className="flex h-40 items-end gap-1" role="img" aria-label={`Recherches hebdomadaires pour ${term}`}>
              {tr.map((t) => <div key={t.week} className="flex flex-1 flex-col items-center gap-1"><div className="w-full rounded-t bg-brand-blue" style={{ height: `${t.searches === null ? 2 : Math.max(4, (130 * Number(t.searches)) / trMax)}px`, opacity: t.searches === null ? 0.25 : 1 }} title={`Semaine du ${t.week} : ${fmtN(t.searches)}`} /><span className="text-[10px] text-muted-foreground">{t.week.slice(8, 10)}/{t.week.slice(5, 7)}</span></div>)}
            </div>
          ) : <Empty />}
        </Section>
      </div>

      <Section id="regions" data={["mesure", "administratif"]} title="Par région" icon={Store} note="Recherches et taux d'échec sur la période ; pharmacies vérifiées, avec stocks mis à jour depuis moins de 30 jours, et de garde en ce moment.">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="py-2">Région</th><th>Recherches</th><th>Sans résultat</th><th>Pharmacies</th><th>Stocks à jour</th><th>De garde maintenant</th></tr></thead>
            <tbody>{rg.map((r) => <tr key={r.region_id} className="border-b last:border-0"><td className="py-2 font-medium">{r.region}</td><td>{fmtN(r.searches)}</td><td>{r.unfound_rate !== null ? `${r.unfound_rate} %` : "—"}</td><td>{r.pharmacies}</td><td>{r.fresh_stock}</td><td className={cn(r.pharmacies > 0 && r.on_duty_now === 0 && "font-semibold text-amber-700")}>{r.on_duty_now}</td></tr>)}</tbody>
          </table>
        </div>
      </Section>

      <Section id="gardes" data={["declare", "estimation"]} title="Couverture des gardes (prochaines 24 heures)" icon={Store} note="Communes ayant des pharmacies vérifiées mais aucune garde enregistrée sur SantéProxi dans les 24 heures. Cela peut venir d'un tableau de garde non saisi : à vérifier avec l'Ordre des pharmaciens.">
        {gp.length ? (
          <ul className="grid gap-2 text-sm sm:grid-cols-2">{gp.slice(0, 20).map((g) => (
            <li key={`${g.region}-${g.commune}`} className={cn("flex justify-between rounded-lg border px-3 py-2", Number(g.on_duty_24h) === 0 && "border-amber-300 bg-amber-50")}>
              <span>{g.commune} <span className="text-muted-foreground">· {g.region}</span></span><span>{g.on_duty_24h} / {g.pharmacies} de garde</span></li>))}</ul>
        ) : <p className="text-sm text-muted-foreground">Aucune pharmacie vérifiée dans cette zone pour le moment.</p>}
      </Section>

      <Section id="amo" data={["declare"]} title="AMO : prix déclarés comparés au tarif de référence" icon={Pill} note="Prix déclarés par les pharmacies vérifiées au cours des 30 derniers jours, pour les médicaments de la liste AMO (au moins 3 prix). Le tarif de référence vient de la liste AMO intégrée, qui doit être mise à jour avec la CANAM.">
        {am.length ? (
          <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm">
            <thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="py-2">Médicament</th><th>Tarif AMO</th><th>Prix déclarés (min – moy. – max)</th><th>Écart moyen</th></tr></thead>
            <tbody>{am.map((a) => <tr key={a.product} className="border-b last:border-0"><td className="py-2 font-medium">{a.product}</td><td>{formatXof(a.tariff)}</td><td>{formatXof(a.min_price)} – {formatXof(a.avg_price)} – {formatXof(a.max_price)} <span className="text-xs text-muted-foreground">({a.prices} prix)</span></td>
              <td className={cn("font-semibold", a.gap_pct > 20 ? "text-amber-700" : "text-brand-deep")}>{a.gap_pct > 0 ? "+" : ""}{a.gap_pct} %</td></tr>)}</tbody>
          </table></div>
        ) : <p className="text-sm text-muted-foreground">Pas encore assez de prix déclarés pour des médicaments de la liste AMO.</p>}
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section id="sujets" data={["mesure"]} title="Sujets qui préoccupent" icon={MessageCircleQuestion}>
          <p className="text-sm font-semibold">Questions aux pharmaciens, par public</p>
          {tc?.questions?.length ? <ul className="space-y-1 text-sm">{tc.questions.map((x) => <li key={x.about} className="flex justify-between"><span>{QUESTION_ABOUT[x.about] ?? x.about}</span><span>{fmtN(x.n)}</span></li>)}</ul> : <Empty />}
          {tc?.urgent_questions !== null && tc?.urgent_questions !== undefined && <p className="text-sm">Questions avec signes d&apos;urgence possibles : <strong>{fmtN(tc.urgent_questions)}</strong></p>}
          <p className="pt-2 text-sm font-semibold">Fiches santé les plus lues</p>
          {tc?.articles?.length ? <ol className="list-decimal space-y-1 pl-5 text-sm">{tc.articles.map((a) => <li key={a.slug}><Link prefetch={false} href={`/sante/fiche/${a.slug}`} className="underline">{a.title}</Link> · {fmtN(a.n)}</li>)}</ol> : <Empty />}
        </Section>
        {bl ? (
          <Section id="sang" data={["mesure"]} title="Mobilisation pour le don de sang" icon={Droplet} note="Personnes inscrites pour être prévenues des besoins en sang (volontaires).">
            <div className="grid grid-cols-4 gap-2 text-center text-sm">{bl.by_group.map((g) => <div key={g.group} className="rounded-lg bg-red-50 p-2"><p className="font-bold text-red-700">{g.group === "inconnu" ? "?" : g.group}</p><p>{fmtN(g.n)}</p></div>)}</div>
            {bl.by_group.length === 0 && <Empty />}
            <p className="text-sm">Besoins publiés ces 30 derniers jours : <strong>{bl.needs_30d}</strong></p>
            {bl.campaigns.length > 0 && <ul className="space-y-1 text-sm">{bl.campaigns.map((c) => <li key={`${c.title}-${c.date}`}>{c.title} · {new Date(c.date).toLocaleDateString("fr-FR")} · participants annoncés : {fmtN(c.going)}</li>)}</ul>}
          </Section>
        ) : null}
      </div>

      {sp2 && (
        <Section id="offre" data={["administratif", "declare"]} title="Offre de soins référencée" icon={Building2} note={`Structures publiées sur SantéProxi (pharmacies inscrites et vérifiées, autres officines de l'annuaire, établissements et laboratoires référencés, soins à domicile) et médecins du tableau de l'Ordre${sp2.register_year ? ` ${sp2.register_year}` : ""}. Ce sont des comptes d'établissements publics, pas de personnes. Le référencement n'est pas encore complet : un chiffre bas peut signaler un manque de référencement autant qu'un manque de structures.`}>
          <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm">
            <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1">Région</th><th>Pharmacies inscrites</th><th>Autres officines</th><th>Médecins (tableau)</th><th>Établissements</th><th>Laboratoires</th><th>Prise de sang à domicile</th><th>Soins à domicile</th></tr></thead>
            <tbody>{sp2.by_region.map((r) => (
              <tr key={r.region_id} className="border-t"><td className="py-1.5 font-medium">{r.region}</td><td>{r.pharmacies}</td><td>{r.pharmacies_listed}</td><td>{r.doctors_register}</td><td>{r.health_facilities}</td><td>{r.labs}</td><td>{r.home_sampling}</td><td>{r.home_care}</td></tr>))}</tbody>
          </table></div>
          {weak.length > 0 && (
            <div className="rounded-xl bg-amber-50 p-3 text-sm">
              <p className="font-semibold text-amber-900">Zones où l&apos;accès à l&apos;information sanitaire paraît difficile</p>
              <ul className="mt-1 list-disc pl-5">{weak.map((r) => <li key={r.region_id}>{r.region} : {[r.pharmacies + r.pharmacies_listed === 0 && "aucune pharmacie référencée", r.labs === 0 && "aucun laboratoire référencé", (unfoundBy.get(r.region_id) ?? 0) >= 40 && `${unfoundBy.get(r.region_id)} % de recherches sans résultat`].filter(Boolean).join(" ; ")}</li>)}</ul>
            </div>)}
          <div className="grid gap-4 md:grid-cols-2">
            <div><h3 className="mb-2 text-sm font-semibold">Spécialités médicales (tableau de l&apos;Ordre)</h3>
              {sp2.specialties.length ? <ul className="space-y-1.5 text-sm">{sp2.specialties.slice(0, 12).map((x) => <li key={x.specialty}><span className="flex justify-between"><span>{x.specialty}</span><span>{x.n}</span></span><Bar v={x.n} max={sp2.specialties[0].n} /></li>)}</ul> : <p className="text-sm text-muted-foreground">Tableau non importé.</p>}</div>
            <div><h3 className="mb-2 text-sm font-semibold">Types d&apos;établissements</h3>
              <ul className="space-y-1.5 text-sm">{sp2.facility_kinds.map((x) => <li key={x.kind}><span className="flex justify-between"><span>{KIND[x.kind] ?? x.kind}</span><span>{x.n}</span></span><Bar v={x.n} max={sp2.facility_kinds[0]?.n ?? 1} tone="bg-brand-blue" /></li>)}</ul>
              <p className="mt-3 text-sm">Analyses avec un prix déclaré par les laboratoires : <strong>{sp2.exams_with_price}</strong></p></div>
          </div>
        </Section>
      )}
      <RegistryTrend region={region} />
      <p className="text-xs text-muted-foreground">Ces chiffres viennent des usages de SantéProxi (surtout des utilisateurs de smartphone, plutôt en ville) : ce sont des signaux d&apos;alerte, pas des statistiques officielles. Ils complètent le système national d&apos;information sanitaire, ils ne le remplacent pas. <Link prefetch={false} href="/autorites/methode" className="underline">Méthode</Link>.</p>
    </div>
  );
}
