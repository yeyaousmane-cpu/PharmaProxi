import Link from "next/link";
import { AudioGuide } from "@/components/audio/audio-guide";
import { notFound } from "next/navigation";
import { Clock, Dna, Droplets, HeartHandshake } from "lucide-react";
import { HealthIcon } from "@/components/health/health-icon";
import { ArticleCard, FindProfessionals, HealthSearchBar, MedicalDisclaimer, type ArticleRow } from "@/components/health/health-bits";
import { BloodGroupExplorer } from "@/components/health/blood-group-explorer";
import { HbSimulator } from "@/components/health/hb-simulator";
import { createClient } from "@/lib/supabase/server";
import { HEALTH_RECO } from "@/lib/health/labels";

export const revalidate = 0;

export async function generateMetadata({ params }: { params: Promise<{ categorie: string }> }) {
  const { categorie } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("health_categories").select("name, description").eq("slug", categorie).maybeSingle();
  return { title: data ? `${data.name} — Santé essentielle` : "Santé essentielle", description: data?.description ?? undefined };
}

export default async function HealthCategory({ params }: { params: Promise<{ categorie: string }> }) {
  const { categorie } = await params;
  if (!/^[a-z0-9-]{2,60}$/.test(categorie)) notFound();
  const supabase = await createClient();
  const { data: cat } = await supabase.from("health_categories").select("id, slug, name, description, icon, is_priority").eq("slug", categorie).eq("is_active", true).maybeSingle();
  if (!cat) notFound();
  const [{ data: rows }, { data: up }] = await Promise.all([
    supabase.rpc("health_search", { p_query: null, p_category: cat.slug, p_audience: null, p_kind: null, p_limit: 50, p_offset: 0 }),
    supabase.rpc("health_upcoming", { p_category: cat.slug }),
  ]);
  const articles = (rows as ArticleRow[]) ?? [];
  const upcoming = (up as { title: string; status: string }[]) ?? [];
  const marriage = cat.slug === "mariage";
  const fiches = articles.filter((a) => a.kind === "fiche" || a.kind === "prevention");
  const others = articles.filter((a) => !(a.kind === "fiche" || a.kind === "prevention"));
  const groups: [string, ArticleRow[]][] = marriage
    ? [...(["recommande", "selon_risque", "sur_indication"]).map((k) => [k, fiches.filter((a) => a.recommendation === k)] as [string, ArticleRow[]]),
       ["autre", fiches.filter((a) => !a.recommendation || !HEALTH_RECO[a.recommendation])]]
    : [];

  return (
    <div className="bg-[#EAF6EE]/60">
      <section className="border-b bg-gradient-to-b from-[#EAF6EE] to-white">
        <div className="container-page py-8">
          <Link prefetch={false} href="/sante" className="text-sm text-[#068132] underline">← Santé essentielle</Link>
          <div className="mt-3 flex items-start gap-4">
            <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-[#068132] text-white">{marriage ? <HeartHandshake className="size-7" aria-hidden /> : <HealthIcon name={cat.icon} className="size-7" />}</span>
            <div>
              <h1 className="text-2xl font-bold text-[#052D1E] sm:text-3xl">{marriage ? "Avant le mariage : les examens de santé à connaître" : cat.name}</h1>
              <p className="mt-1 max-w-3xl text-muted-foreground">{cat.description}</p>
            </div>
          </div>
          <div className="mt-5 max-w-2xl"><HealthSearchBar /></div>
          <AudioGuide target={`sante-${cat.slug}`} className="mt-4 max-w-2xl" />
        </div>
      </section>

      <div className="container-page space-y-10 py-8">
        {marriage && (
          <div className="rounded-2xl border border-[#068132]/30 bg-white p-5 text-sm leading-relaxed">
            <p className="font-semibold text-[#052D1E]">À savoir avant de commencer</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Aucun de ces examens n&apos;est une condition pour se marier, et <strong>aucune différence de groupe sanguin n&apos;interdit un mariage</strong>.</li>
              <li>Les examens se répartissent en trois niveaux : <strong>{HEALTH_RECO.recommande.label.toLowerCase()}</strong>, <strong>{HEALTH_RECO.selon_risque.label.toLowerCase()}</strong> et <strong>{HEALTH_RECO.sur_indication.label.toLowerCase()}</strong>. Un professionnel de santé vous aide à choisir.</li>
              <li>Vos résultats vous appartiennent : PharmaProxi ne vous les demande jamais.</li>
            </ul>
          </div>
        )}

        {marriage ? (
          groups.filter(([, list]) => list.length > 0).length === 0 ? null : groups.filter(([, list]) => list.length > 0).map(([k, list]) => (
            <section key={k} aria-label={k === "autre" ? "Autres fiches" : HEALTH_RECO[k].label} className="space-y-3">
              <h2 className="text-xl font-bold text-[#052D1E]">{k === "autre" ? "Autres fiches" : HEALTH_RECO[k].label}</h2>
              {k !== "autre" && <p className="text-sm text-muted-foreground">{HEALTH_RECO[k].hint}</p>}
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{list.map((a) => <li key={a.id}><ArticleCard a={a} /></li>)}</ul>
            </section>
          ))
        ) : (
          <section aria-label="Fiches" className="space-y-3">
            <h2 className="text-xl font-bold text-[#052D1E]">Fiches validées</h2>
            {fiches.length === 0 ? <p className="rounded-xl border border-dashed bg-white p-5 text-sm text-muted-foreground">Aucune fiche validée dans cette catégorie pour le moment.</p> : (
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{fiches.map((a) => <li key={a.id}><ArticleCard a={a} /></li>)}</ul>
            )}
          </section>
        )}

        {others.length > 0 && (
          <section aria-label="Questions et idées reçues" className="space-y-3">
            <h2 className="text-xl font-bold text-[#052D1E]">Questions fréquentes et idées reçues</h2>
            <ul className="grid gap-3 sm:grid-cols-2">{others.map((a) => <li key={a.id}><ArticleCard a={a} /></li>)}</ul>
          </section>
        )}

        {upcoming.length > 0 && (
          <section aria-labelledby="prep" className="rounded-2xl border border-dashed bg-white p-5">
            <h2 id="prep" className="flex items-center gap-2 font-bold text-[#052D1E]"><Clock className="size-4 text-[#1D5FA8]" aria-hidden /> En cours de validation médicale</h2>
            <p className="mt-1 text-sm text-muted-foreground">Ces fiches sont rédigées et attendent la relecture d&apos;un professionnel de santé. Elles seront publiées une fois validées.</p>
            <ul className="mt-3 grid gap-1.5 text-sm sm:grid-cols-2">
              {upcoming.map((u) => <li key={u.title} className="flex items-center justify-between gap-2 rounded-lg bg-[#EAF6EE]/70 px-3 py-2"><span>{u.title}</span><span className="shrink-0 text-xs text-muted-foreground">{u.status}</span></li>)}
            </ul>
          </section>
        )}

        {marriage && (
          <>
            <section aria-labelledby="groupes" className="space-y-3 rounded-2xl border bg-white p-5">
              <h2 id="groupes" className="flex items-center gap-2 text-xl font-bold text-[#052D1E]"><Droplets className="size-5 text-[#068132]" aria-hidden /> Comprendre les groupes sanguins</h2>
              <p className="text-sm text-muted-foreground">A+, A−, B+, B−, AB+, AB−, O+, O− : à quoi servent-ils pour une transfusion, une grossesse, et comment se transmettent-ils ?</p>
              <BloodGroupExplorer />
            </section>
            <section aria-labelledby="simulateur" className="space-y-3 rounded-2xl border bg-white p-5">
              <h2 id="simulateur" className="flex items-center gap-2 text-xl font-bold text-[#052D1E]"><Dna className="size-5 text-[#068132]" aria-hidden /> Drépanocytose : comment se transmet-elle ?</h2>
              <p className="text-sm text-muted-foreground">Choisissez les profils d&apos;hémoglobine connus des deux parents (résultat de l&apos;électrophorèse) pour voir les probabilités théoriques à chaque grossesse.</p>
              <HbSimulator />
            </section>
          </>
        )}

        <FindProfessionals />
        <MedicalDisclaimer />
      </div>
    </div>
  );
}
