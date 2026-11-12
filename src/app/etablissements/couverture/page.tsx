import Link from "next/link";
import { BarChart3, ExternalLink, Info } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { formatDateTime } from "@/lib/format";
import { DIRECTORY_KINDS } from "@/lib/national-directory";

export const metadata = { title: "Couverture du référentiel national des établissements", description: "Chiffres calculés sur les fiches réellement présentes dans SantéProxi, sources et limites des données." };
export const revalidate = 600;

type Stats = { total: number; par_type: Record<string, number>; par_region: { region: string; n: number; cscom: number; geolocalises: number }[]; par_statut: Record<string, number>;
  par_source: Record<string, number>; avec_telephone: number; telephones_source_officielle: number; telephones_confirmes: number; avec_adresse: number; geolocalises: number; verifies: number;
  avec_offre_confirmee: number; cercles_couverts: number; cercles_total: number; non_publiees_a_verifier: number; doublons_possibles: number; calcule_le: string };
type Cov = { circle_id: string; circle: string; region: string; n: number; cscom: number; csref: number; hopitaux: number; prives: number; geolocalises: number };

const SOURCES = [
  { t: "CANAM — listes des structures conventionnées (CSCOM des régions et de Bamako, hôpitaux et CSRéf, cliniques, cabinets, laboratoires, centres d'imagerie), mises en ligne le 18 mars 2022", u: "https://www.canam.ml/index.php/conventionnement/cscom/cscom-regions" },
  { t: "Ministère de la Santé et du Développement social — carte sanitaire (positions GPS, téléphones et services publiés), consultée le 11 novembre 2026", u: "https://www.sante.gov.ml/index.php?option=com_content&view=category&id=33&Itemid=126" },
  { t: "OCHA / HDX — limites administratives du Mali COD-AB v03 (19 régions et District de Bamako, 159 cercles, découpage de 2023, valide au 4 septembre 2025)", u: "https://data.humdata.org/dataset/cod-ab-mli" },
  { t: "Direction de la pharmacie et du médicament (DPM) — liste des laboratoires d'analyses biomédicales (intégrée en version 0.2x)", u: null },
];

export default async function Couverture() {
  let s = null as Stats | null; let cov: Cov[] = [];
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const [a, b] = await Promise.all([supabase.rpc("directory_stats"), supabase.rpc("directory_coverage")]);
    s = a.data as Stats; cov = (b.data ?? []) as Cov[];
  }
  const empty = cov.filter((c) => Number(c.n) === 0);
  const pct = (a: number) => (s && s.total ? `${Math.round((100 * a) / s.total)} %` : "—");
  return (
    <div className="container-page max-w-5xl space-y-5 py-6">
      <p className="text-sm"><Link prefetch={false} href="/etablissements" className="text-primary underline">← Annuaire national</Link></p>
      <header className="space-y-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-brand-deep"><BarChart3 className="size-7 text-primary" aria-hidden /> Couverture du référentiel national</h1>
        <p className="text-muted-foreground">Tous les chiffres ci-dessous sont calculés automatiquement sur les fiches publiées dans SantéProxi{s ? ` (calcul du ${formatDateTime(s.calcule_le)})` : ""}. Ce ne sont pas des statistiques officielles du ministère de la Santé.</p>
      </header>
      {!s ? <p className="text-sm text-muted-foreground">Données indisponibles.</p> : (<>
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[["Établissements publiés", s.total.toLocaleString("fr-FR")], ["Dont CSCom", (s.par_type.cscom ?? 0).toLocaleString("fr-FR")], ["Avec position GPS (source officielle)", `${s.geolocalises} · ${pct(s.geolocalises)}`],
            ["Avec un téléphone", `${s.avec_telephone} · ${pct(s.avec_telephone)}`], ["Téléphones confirmés par l'établissement", String(s.telephones_confirmes)], ["Fiches vérifiées par SantéProxi", String(s.verifies)],
            ["Avec une offre de soins confirmée", String(s.avec_offre_confirmee)], ["Cercles avec au moins une fiche", `${s.cercles_couverts} sur ${s.cercles_total}`]].map(([l, v]) => (
            <div key={l} className="rounded-2xl border bg-white p-4"><p className="text-2xl font-extrabold text-brand-deep">{v}</p><p className="text-sm text-muted-foreground">{l}</p></div>))}
        </section>
        <section className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border bg-white p-4"><h2 className="mb-2 font-bold text-brand-deep">Par type</h2>
            <table className="w-full text-sm"><tbody>{Object.entries(s.par_type).sort((a, b) => b[1] - a[1]).map(([k, n]) => <tr key={k} className="border-t"><td className="py-1">{k === "chu" ? "CHU" : DIRECTORY_KINDS[k] ?? k}</td><td className="py-1 text-end font-semibold">{n}</td></tr>)}</tbody></table></div>
          <div className="rounded-2xl border bg-white p-4"><h2 className="mb-2 font-bold text-brand-deep">Origine des fiches</h2>
            <table className="w-full text-sm"><tbody>{Object.entries(s.par_source).map(([k, n]) => <tr key={k} className="border-t"><td className="py-1">{({ officielle: "Source officielle seule", recoupee: "Recoupée par plusieurs sources", etablissement: "Confirmée par l'établissement", secondaire: "Source secondaire", editeur: "Transmise à SantéProxi" } as Record<string, string>)[k] ?? k}</td><td className="py-1 text-end font-semibold">{n}</td></tr>)}</tbody></table>
            <p className="mt-2 text-xs text-muted-foreground">{s.non_publiees_a_verifier} fiche(s) non publiée(s) en attente de vérification ; {s.doublons_possibles} doublon(s) possible(s) en cours d&apos;examen.</p></div>
        </section>
        <section className="overflow-x-auto rounded-2xl border bg-white p-4"><h2 className="mb-2 font-bold text-brand-deep">Par région</h2>
          <table className="w-full min-w-[28rem] text-sm"><thead><tr className="text-start text-muted-foreground"><th className="py-1 text-start">Région</th><th className="text-end">Fiches</th><th className="text-end">CSCom</th><th className="text-end">Position GPS</th></tr></thead>
            <tbody>{s.par_region.map((r) => <tr key={r.region} className="border-t"><td className="py-1">{r.region}</td><td className="text-end font-semibold">{r.n}</td><td className="text-end">{r.cscom}</td><td className="text-end">{r.geolocalises}</td></tr>)}</tbody></table></section>
        <section className="overflow-x-auto rounded-2xl border bg-white p-4"><h2 className="mb-2 font-bold text-brand-deep">Par cercle</h2>
          <table className="w-full min-w-[36rem] text-sm"><thead><tr className="text-muted-foreground"><th className="py-1 text-start">Cercle</th><th className="text-start">Région</th><th className="text-end">Fiches</th><th className="text-end">CSCom</th><th className="text-end">CSRéf</th><th className="text-end">Hôpitaux</th><th className="text-end">Privés</th></tr></thead>
            <tbody>{cov.filter((c) => Number(c.n) > 0).map((c) => <tr key={c.circle_id} className="border-t"><td className="py-1"><Link prefetch={false} href={`/etablissements?cercle=${c.circle_id}`} className="text-primary underline">{c.circle}</Link></td><td>{c.region}</td><td className="text-end font-semibold">{c.n}</td><td className="text-end">{c.cscom}</td><td className="text-end">{c.csref}</td><td className="text-end">{c.hopitaux}</td><td className="text-end">{c.prives}</td></tr>)}</tbody></table>
          <p className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-950"><Info className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>{empty.length} cercle(s) n&apos;ont encore aucune fiche : {empty.map((c) => c.circle).join(", ")}. <strong>L&apos;absence de fiche ne signifie pas l&apos;absence d&apos;établissement</strong> : les listes CANAM de 2022 suivent l&apos;ancien découpage (une cinquantaine de cercles) et ne recensent que les structures conventionnées ; les cercles créés en 2023 sont rattachés à leur ancien cercle tant qu&apos;une liste officielle par nouveau cercle n&apos;est pas disponible.</span></p>
        </section>
      </>)}
      <section className="space-y-2 rounded-2xl border bg-white p-4 text-sm"><h2 className="font-bold text-brand-deep">Sources et limites</h2>
        <ul className="space-y-1">{SOURCES.map((x) => <li key={x.t}>{x.u ? <a href={x.u} target="_blank" rel="noopener noreferrer" className="underline">{x.t}<ExternalLink className="ms-0.5 inline size-3" aria-hidden /></a> : x.t}</li>)}</ul>
        <ul className="list-disc space-y-1 ps-5 text-muted-foreground">
          <li>Le référentiel n&apos;est pas exhaustif : il réunit les listes officielles accessibles publiquement. Les annuaires SNISS et les données DHIS2 ne sont pas publiés en accès libre ; ils seront intégrés avec l&apos;accord du ministère.</li>
          <li>Les listes CANAM datent de 2022 et recensent les structures conventionnées : une structure peut avoir fermé, changé de nom ou ne pas être conventionnée. Les numéros publiés sont à confirmer.</li>
          <li>Les positions GPS proviennent uniquement de la carte sanitaire du ministère : aucune coordonnée n&apos;est estimée.</li>
          <li>Les noms sont repris tels qu&apos;écrits dans les documents (orthographe parfois incertaine) ; les noms proches ne sont jamais fusionnés automatiquement.</li>
        </ul>
        <p><a href="/etablissements/export" className="font-semibold text-primary underline">Télécharger toutes les fiches publiques (CSV)</a></p>
      </section>
    </div>
  );
}
