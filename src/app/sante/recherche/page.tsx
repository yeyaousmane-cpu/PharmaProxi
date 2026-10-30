import Link from "next/link";
import { Building2, Droplets, FlaskConical, Pill, Search, Stethoscope } from "lucide-react";
import { ArticleCard, FindProfessionals, HealthSearchBar, MedicalDisclaimer, type ArticleRow } from "@/components/health/health-bits";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";

export const metadata = { title: "Recherche — Santé essentielle" };
export const revalidate = 0;

const norm = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const BLOOD = /^(groupe\s*)?(a|b|ab|o)\s*(\+|-|−|positif|negatif)?$/i;
const BLOOD_WORDS = /(groupe(s)? sanguin|rhesus|transfusion|compatibilite sanguine)/;

type Med = { catalog_id: string; label: string; active_ingredient: string | null };

export default async function HealthSearch({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 80);
  let articles: ArticleRow[] = [], exams: { id: string; name: string }[] = [], specs: { id: string; name: string }[] = [], meds: Med[] = [];
  if (q && isSupabaseConfigured()) {
    const supabase = await createClient();
    const n = norm(q);
    const [a, e, s, m] = await Promise.all([
      supabase.rpc("health_search", { p_query: q, p_category: null, p_audience: null, p_kind: null, p_limit: 20, p_offset: 0 }),
      supabase.from("medical_exams").select("id, name").ilike("search_text", `%${n}%`).limit(6),
      supabase.from("medical_specialties").select("id, name, description").or(`name.ilike.%${q.replace(/[%,()]/g, "")}%,description.ilike.%${q.replace(/[%,()]/g, "")}%`).limit(6),
      supabase.rpc("suggest_medicines", { p_query: q, p_limit: 6 }),
    ]);
    articles = (a.data as ArticleRow[]) ?? [];
    exams = (e.data as { id: string; name: string }[]) ?? [];
    specs = (s.data as { id: string; name: string }[]) ?? [];
    meds = (m.data as Med[]) ?? [];
  }
  const blood = BLOOD.test(norm(q).replace(/\s+/g, " ")) || BLOOD_WORDS.test(norm(q));
  const nothing = q && !articles.length && !exams.length && !specs.length && !meds.length && !blood;
  const enc = encodeURIComponent(q);

  return (
    <div className="bg-[#EAF6EE]/60">
      <div className="container-page max-w-5xl space-y-6 py-7">
        <Link prefetch={false} href="/sante" className="text-sm text-[#068132] underline">← Santé essentielle</Link>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-[#052D1E]"><Search className="size-6 text-[#068132]" aria-hidden /> Rechercher</h1>
        <HealthSearchBar defaultValue={q} />
        {!q ? (
          <p className="text-sm text-muted-foreground">Tapez une maladie, un symptôme, un examen, un médicament, un groupe sanguin ou une question de santé.</p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">Résultats pour « {q} ». La recherche porte sur les fiches déjà validées et les données référencées sur PharmaProxi : elle n&apos;est pas exhaustive et n&apos;établit aucun diagnostic.</p>
            {blood && (
              <Link prefetch={false} href="/sante/mariage#groupes" className="flex items-center gap-3 rounded-xl border border-[#068132]/30 bg-white p-4 hover:shadow-sm">
                <Droplets className="size-6 text-[#068132]" aria-hidden />
                <span><span className="block font-bold">Comprendre les groupes sanguins</span><span className="text-sm text-muted-foreground">Transfusion, grossesse et Rhésus, transmission aux enfants</span></span>
              </Link>
            )}
            <section aria-labelledby="r-fiches" className="space-y-3">
              <h2 id="r-fiches" className="text-lg font-bold text-[#052D1E]">Fiches santé ({articles.length})</h2>
              {articles.length === 0 ? <p className="rounded-xl border border-dashed bg-white p-4 text-sm text-muted-foreground">Aucune fiche validée sur ce sujet pour le moment.</p> : (
                <ul className="grid gap-3 sm:grid-cols-2">{articles.map((a) => <li key={a.id}><ArticleCard a={a} showCategory /></li>)}</ul>
              )}
            </section>
            <div className="grid gap-4 md:grid-cols-3">
              <section aria-labelledby="r-exams" className="rounded-xl border bg-white p-4">
                <h2 id="r-exams" className="flex items-center gap-2 font-bold"><FlaskConical className="size-4 text-[#1D5FA8]" aria-hidden /> Examens</h2>
                {exams.length === 0 ? <p className="mt-1 text-sm text-muted-foreground">Aucun examen correspondant.</p> : (
                  <ul className="mt-2 space-y-1 text-sm">{exams.map((e) => <li key={e.id}><Link prefetch={false} href={`/laboratoires?examen=${e.id}`} className="text-[#1D5FA8] underline">{e.name}</Link></li>)}</ul>
                )}
              </section>
              <section aria-labelledby="r-meds" className="rounded-xl border bg-white p-4">
                <h2 id="r-meds" className="flex items-center gap-2 font-bold"><Pill className="size-4 text-[#068132]" aria-hidden /> Médicaments</h2>
                {meds.length === 0 ? <p className="mt-1 text-sm text-muted-foreground">Aucun médicament correspondant au catalogue.</p> : (
                  <ul className="mt-2 space-y-1 text-sm">{meds.map((m) => <li key={m.catalog_id}><Link prefetch={false} href={`/produits/${m.catalog_id}`} className="text-[#068132] underline">{m.label}</Link></li>)}</ul>
                )}
                <Link prefetch={false} href={`/recherche?q=${enc}`} className="mt-2 inline-block text-xs font-semibold text-[#068132] underline">Où le trouver en pharmacie</Link>
              </section>
              <section aria-labelledby="r-pros" className="rounded-xl border bg-white p-4">
                <h2 id="r-pros" className="flex items-center gap-2 font-bold"><Stethoscope className="size-4 text-[#1D5FA8]" aria-hidden /> Professionnels</h2>
                {specs.length > 0 && <ul className="mt-2 space-y-1 text-sm">{specs.map((s) => <li key={s.id}><Link prefetch={false} href={`/medecins?specialite=${s.id}`} className="text-[#1D5FA8] underline">{s.name}</Link></li>)}</ul>}
                <ul className="mt-2 space-y-1 text-sm">
                  <li><Link prefetch={false} href={`/medecins?q=${enc}`} className="underline">Médecins : « {q} »</Link></li>
                  <li><Link prefetch={false} href={`/cliniques?q=${enc}`} className="inline-flex items-center gap-1 underline"><Building2 className="size-3.5" aria-hidden />Établissements : « {q} »</Link></li>
                </ul>
              </section>
            </div>
            {nothing && <p className="text-sm">Essayez un autre mot (par exemple « palu » pour paludisme, « drépano » pour drépanocytose) ou parcourez les <Link prefetch={false} href="/sante" className="font-semibold text-[#068132] underline">catégories</Link>.</p>}
          </>
        )}
        <FindProfessionals />
        <MedicalDisclaimer />
      </div>
    </div>
  );
}
