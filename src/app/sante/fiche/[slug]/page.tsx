import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, BadgeCheck, BookMarked, CircleHelp, FlaskConical, Lightbulb, Phone, Siren, Stethoscope } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Textarea } from "@/components/ui/input";
import { FindProfessionals, MedicalDisclaimer, RecoBadge } from "@/components/health/health-bits";
import { reportHealthArticle } from "@/app/actions/health";
import { createClient } from "@/lib/supabase/server";
import { HEALTH_AUDIENCE, HEALTH_KIND, HEALTH_SECTIONS, HEALTH_STATUS, type HealthArticle, type HealthSource } from "@/lib/health/labels";
import { formatDate, formatPhone, formatXof } from "@/lib/format";

export const revalidate = 0;
const SLUG = /^[a-z0-9-]{3,90}$/;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!SLUG.test(slug)) return { title: "Fiche santé" };
  const supabase = await createClient();
  const { data } = await supabase.from("health_articles").select("title, summary, status").eq("slug", slug).maybeSingle();
  return { title: data ? `${data.title} — Santé essentielle` : "Fiche santé", description: data?.status === "published" ? data.summary : undefined };
}

type Lab = { facility_id: string; name: string; city_label: string | null; region_name: string | null; phone: string | null; price_xof: number | null };

export default async function HealthArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!SLUG.test(slug)) notFound();
  const supabase = await createClient();
  const { data } = await supabase.from("health_articles").select("*, health_categories(slug, name)").eq("slug", slug).maybeSingle();
  if (!data) notFound();
  const a = data as HealthArticle & { health_categories: { slug: string; name: string } | null };
  const published = a.status === "published";
  const [{ data: src }, { data: specs }, { data: exams }] = await Promise.all([
    supabase.from("health_sources").select("*").eq("article_id", a.id).order("sort_order"),
    a.specialty_codes.length ? supabase.from("medical_specialties").select("id, code, name").in("code", a.specialty_codes) : Promise.resolve({ data: [] }),
    a.exam_codes.length ? supabase.from("medical_exams").select("id, code, name").in("code", a.exam_codes) : Promise.resolve({ data: [] }),
  ]);
  const sources = (src as HealthSource[]) ?? [];
  const examList = (exams as { id: string; code: string; name: string }[]) ?? [];
  const labs = await Promise.all(examList.map(async (e) => {
    const { data: l } = await supabase.rpc("search_labs", { p_exam: e.id, p_query: null, p_region: null, p_sort: "name", p_limit: 3, p_offset: 0 });
    return { exam: e, labs: (l as Lab[]) ?? [] };
  }));
  const body = a.body ?? {};
  const reviewed = a.reviewed_at ?? a.validated_at;

  return (
    <article className="bg-[#EAF6EE]/60">
      <header className="border-b bg-gradient-to-b from-[#EAF6EE] to-white">
        <div className="container-page max-w-4xl py-7">
          <nav aria-label="Fil d'Ariane" className="text-sm text-[#068132]">
            <Link prefetch={false} href="/sante" className="underline">Santé essentielle</Link>
            {a.health_categories && <> › <Link prefetch={false} href={`/sante/${a.health_categories.slug}`} className="underline">{a.health_categories.name}</Link></>}
          </nav>
          {!published && (
            <Alert tone="warning" className="mt-3" title={`Aperçu réservé à l'équipe éditoriale — ${HEALTH_STATUS[a.status]?.label ?? a.status}`}>
              Cette fiche n&apos;est pas publiée et n&apos;a pas été validée dans sa version actuelle : elle n&apos;est pas visible du public.{" "}
              <Link prefetch={false} href={`/redaction-sante/${a.id}`} className="font-semibold underline">Ouvrir dans l&apos;espace de rédaction</Link>
            </Alert>
          )}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {a.kind !== "fiche" && <Badge className="bg-white">{HEALTH_KIND[a.kind]}</Badge>}
            <RecoBadge value={a.recommendation} />
            {a.audiences.filter((x) => x !== "tous").map((x) => <Badge key={x} className="bg-white text-muted-foreground">{HEALTH_AUDIENCE[x]}</Badge>)}
          </div>
          <h1 className="mt-2 text-2xl font-bold text-[#052D1E] sm:text-3xl">{a.title}</h1>
          {a.summary && <p className="mt-3 rounded-xl border-l-4 border-[#068132] bg-white p-4 text-base leading-relaxed">{a.summary}</p>}
          <div className="mt-3 flex flex-col gap-1 text-sm">
            {published && a.validator_name && a.validated_at ? (
              <p className="flex items-start gap-1.5 font-medium text-emerald-800"><BadgeCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>Validée par {a.validator_name}{a.validator_credentials ? ` (${a.validator_credentials})` : ""} le {formatDate(a.validated_at)}</span></p>
            ) : (
              <p className="flex items-center gap-1.5 font-medium text-amber-800"><AlertTriangle className="size-4" aria-hidden /> Contenu non validé</p>
            )}
            <p className="text-xs text-muted-foreground">
              {a.author_name ? `Rédaction : ${a.author_name} · ` : ""}{a.published_at ? `Publiée le ${formatDate(a.published_at)} · ` : ""}{reviewed ? `Dernière révision : ${formatDate(reviewed)}` : `Créée le ${formatDate(a.created_at)}`}
            </p>
          </div>
        </div>
      </header>

      <div className="container-page max-w-4xl space-y-6 py-7">
        {HEALTH_SECTIONS.filter(([k]) => body[k]).map(([k, label]) => (
          <section key={k} aria-labelledby={`s-${k}`} className={k === "urgence" ? "rounded-2xl border border-red-200 bg-red-50 p-5 text-red-950" : "rounded-2xl border bg-white p-5"}>
            <h2 id={`s-${k}`} className="flex items-center gap-2 text-lg font-bold">{k === "urgence" && <Siren className="size-5" aria-hidden />}{label}</h2>
            <p className="mt-2 whitespace-pre-line leading-relaxed">{body[k]}</p>
          </section>
        ))}

        {a.myths.length > 0 && (
          <section aria-labelledby="s-myths" className="rounded-2xl border bg-white p-5">
            <h2 id="s-myths" className="flex items-center gap-2 text-lg font-bold"><Lightbulb className="size-5 text-[#068132]" aria-hidden /> Idées reçues</h2>
            <ul className="mt-3 space-y-3">
              {a.myths.map((m, i) => (
                <li key={i} className="rounded-xl bg-[#EAF6EE]/70 p-3">
                  <p className="font-semibold">« {m.idee} »</p>
                  <p className="mt-1 text-sm leading-relaxed">{m.verite}</p>
                </li>
              ))}
            </ul>
          </section>
        )}

        {a.faq.length > 0 && (
          <section aria-labelledby="s-faq" className="rounded-2xl border bg-white p-5">
            <h2 id="s-faq" className="flex items-center gap-2 text-lg font-bold"><CircleHelp className="size-5 text-[#068132]" aria-hidden /> Questions fréquentes</h2>
            <div className="mt-3 divide-y">
              {a.faq.map((f, i) => (
                <details key={i} className="group py-3" open={i === 0}>
                  <summary className="cursor-pointer list-none font-semibold marker:hidden">{f.q}</summary>
                  <p className="mt-2 whitespace-pre-line text-sm leading-relaxed">{f.r}</p>
                </details>
              ))}
            </div>
          </section>
        )}

        {labs.length > 0 && (
          <section aria-labelledby="s-labs" className="rounded-2xl border bg-white p-5">
            <h2 id="s-labs" className="flex items-center gap-2 text-lg font-bold"><FlaskConical className="size-5 text-[#1D5FA8]" aria-hidden /> Où faire l&apos;examen</h2>
            <div className="mt-3 space-y-4">
              {labs.map(({ exam, labs: list }) => (
                <div key={exam.code}>
                  <p className="font-semibold">{exam.name}</p>
                  {list.length === 0 ? <p className="text-sm text-muted-foreground">Aucun établissement n&apos;a encore déclaré cet examen sur PharmaProxi.</p> : (
                    <ul className="mt-1 divide-y text-sm">
                      {list.map((l) => (
                        <li key={l.facility_id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                          <span>{l.name} <span className="text-muted-foreground">· {l.city_label ?? l.region_name ?? ""}</span></span>
                          <span className="flex items-center gap-3">
                            {l.price_xof !== null && <span className="text-xs text-muted-foreground">tarif communiqué : {formatXof(l.price_xof)}</span>}
                            {l.phone && <a href={`tel:${l.phone}`} className="inline-flex items-center gap-1 font-medium text-[#068132]"><Phone className="size-3.5" aria-hidden />{formatPhone(l.phone)}</a>}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <Link prefetch={false} href={`/laboratoires?examen=${exam.id}`} className="text-sm font-semibold text-[#1D5FA8] underline">Tous les établissements pour cet examen</Link>
                </div>
              ))}
            </div>
          </section>
        )}

        {((specs as { id: string; name: string }[]) ?? []).length > 0 && (
          <section aria-labelledby="s-pros" className="rounded-2xl border bg-white p-5">
            <h2 id="s-pros" className="flex items-center gap-2 text-lg font-bold"><Stethoscope className="size-5 text-[#1D5FA8]" aria-hidden /> Quel professionnel consulter</h2>
            <ul className="mt-3 flex flex-wrap gap-2">
              {(specs as { id: string; name: string }[]).map((s) => (
                <li key={s.id}><Link prefetch={false} href={`/medecins?specialite=${s.id}`} className="inline-block rounded-full border border-sky-200 bg-[#1D5FA8]/5 px-4 py-2 text-sm font-semibold text-[#1D5FA8] hover:bg-[#1D5FA8]/10">{s.name}</Link></li>
              ))}
            </ul>
          </section>
        )}

        <section aria-labelledby="s-sources" className="rounded-2xl border bg-white p-5">
          <h2 id="s-sources" className="flex items-center gap-2 text-lg font-bold"><BookMarked className="size-5 text-[#068132]" aria-hidden /> Sources médicales</h2>
          {sources.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">Aucune source enregistrée.</p> : (
            <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm">
              {sources.map((s) => (
                <li key={s.id}>
                  {s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer" className="font-medium text-[#1D5FA8] underline">{s.title}</a> : <span className="font-medium">{s.title}</span>}
                  <span className="text-muted-foreground"> — {s.organization}{s.published_on ? `, ${s.published_on}` : ""}. Consulté le {formatDate(s.accessed_on)}.</span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <MedicalDisclaimer />

        {published && (
          <details className="rounded-2xl border bg-white p-5">
            <summary className="cursor-pointer text-sm font-semibold">Signaler une information obsolète ou erronée</summary>
            <ActionForm action={reportHealthArticle} resetOnSuccess className="mt-3 space-y-2">
              <input type="hidden" name="article_id" value={a.id} />
              <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />
              <label htmlFor="report-reason" className="text-sm">Qu&apos;est-ce qui vous semble inexact ? (sans information personnelle sur votre santé)</label>
              <Textarea id="report-reason" name="reason" rows={3} minLength={10} maxLength={1000} required />
              <SubmitButton size="sm" variant="outline" pendingText="Envoi…">Envoyer le signalement</SubmitButton>
            </ActionForm>
          </details>
        )}

        <FindProfessionals />
      </div>
    </article>
  );
}
