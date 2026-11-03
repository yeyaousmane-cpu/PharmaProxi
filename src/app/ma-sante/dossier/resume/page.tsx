import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { dossierContext, loadEssentials, loadItems, type Item } from "@/lib/dossier/server";
import { DossierGate } from "@/components/dossier/shell";
import { PrintPdfButton } from "@/components/dossier/print";
import { COVERAGE, KINDS, SEVERITY, allergyMatches, sortItems, tr, type ItemKind, type Lang } from "@/lib/dossier/config";
import { pregnancy } from "@/lib/femme/cycle";
import { formatPhone } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Résumé pour mon médecin", robots: { index: false } };
export const dynamic = "force-dynamic";

const fmtDate = (d: string | null, lang: Lang) => d ? new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString(lang === "en" ? "en-GB" : "fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "";

function Line({ i, lang }: { i: Item; lang: Lang }) {
  const def = KINDS[i.kind];
  const lab = (n: string) => { const f = def.fields.find((x) => x.name === n); return f ? (lang === "en" ? f.en : f.label) : n; };
  const meta = [i.category, i.event_date ? fmtDate(i.event_date, lang) : null, i.event_time, i.year ? String(i.year) : null, i.place, i.who,
    i.next_date ? `${lang === "en" ? "next" : "rappel"} ${fmtDate(i.next_date, lang)}` : null].filter(Boolean).join(" · ");
  const extra = (["result", "detail", "notes"] as const).filter((k) => i[k]).map((k) => `${lab(k)} : ${i[k]}`);
  return (
    <li className="py-1">
      <span className="font-semibold">{i.title}</span>
      {i.severity && <span className={cn("ml-1 text-xs font-bold uppercase", i.severity === "grave" ? "text-red-700" : "text-amber-700")}>({SEVERITY[i.severity][lang]})</span>}
      {meta && <span className="text-muted-foreground"> — {meta}</span>}
      {extra.map((e) => <span key={e} className="block whitespace-pre-line pl-3 text-[13px]">{e}</span>)}
    </li>
  );
}

function Block({ title, children, empty, show = true }: { title: string; children: React.ReactNode; empty?: boolean; show?: boolean }) {
  if (!show) return null;
  return (
    <section className="break-inside-avoid border-t py-2">
      <h2 className="text-sm font-bold uppercase tracking-wide text-brand-deep">{title}</h2>
      {empty ? <p className="text-sm text-muted-foreground">—</p> : children}
    </section>
  );
}

export default async function Resume({ searchParams }: { searchParams: Promise<{ p?: string; lang?: string; complet?: string }> }) {
  const sp = await searchParams;
  const lang: Lang = sp.lang === "en" ? "en" : "fr";
  const full = sp.complet === "1";
  const ctx = await dossierContext(sp.p, "/ma-sante/dossier/resume");
  if (ctx.locked) return <DossierGate status={ctx.status} path={`/ma-sante/dossier/resume${sp.p ? `?p=${sp.p}` : ""}`} />;
  const { supabase, person } = ctx;
  const [items, ess, { data: treatments }, { data: measures }, { data: femme }] = await Promise.all([
    loadItems(supabase, person.id),
    loadEssentials(supabase, person.id),
    person.is_self ? supabase.from("treatments").select("name, dose_note, times").eq("active", true) : Promise.resolve({ data: [] as { name: string; dose_note: string | null; times: string[] }[] }),
    person.is_self ? supabase.from("health_measures").select("kind, systolic, diastolic, glucose_gl, measured_at").order("measured_at", { ascending: false }).limit(full ? 30 : 5) : Promise.resolve({ data: [] as { kind: string; systolic: number | null; diastolic: number | null; glucose_gl: number | null; measured_at: string }[] }),
    person.is_self && person.sex !== "M" ? supabase.from("femme_profiles").select("journey, pregnancy_lmp, pregnancy_due").maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const of = (k: ItemKind, limit?: number) => { const l = sortItems(items.filter((i) => i.kind === k), KINDS[k].order); return limit && !full ? l.slice(0, limit) : l; };
  const name = (k: ItemKind) => (lang === "en" ? KINDS[k].en : KINDS[k].label);
  const severe = of("allergie").filter((a) => a.severity === "grave");
  const allergyNames = of("allergie").map((a) => a.title);
  const preg = femme?.journey === "grossesse" ? pregnancy(femme.pregnancy_lmp, femme.pregnancy_due) : null;
  const since = new Date(Date.now() - 183 * 86_400_000).toISOString().slice(0, 10);
  const recentRx = of("ordonnance").filter((i) => full || (i.event_date ?? i.created_at.slice(0, 10)) >= since);
  const base = `/ma-sante/dossier/resume?${new URLSearchParams({ ...(person.is_self ? {} : { p: person.id }) }).toString()}`;
  const link = (o: Record<string, string>) => `${base}${base.endsWith("?") ? "" : "&"}${new URLSearchParams(o).toString()}`;
  const age = person.birth_year ? new Date().getUTCFullYear() - person.birth_year : null;
  const kindList = (k: ItemKind, limit?: number) => <Block title={name(k)} empty={!of(k).length}><ul className="text-sm">{of(k, limit).map((i) => <Line key={i.id} i={i} lang={lang} />)}</ul></Block>;

  return (
    <div className="container-page max-w-3xl space-y-4 py-6 print:max-w-none print:py-0">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Link prefetch={false} href={`/ma-sante/dossier${person.is_self ? "" : `?p=${person.id}`}`} className="text-sm text-primary underline">← Retour au dossier</Link>
        <span className="flex-1" />
        <Link prefetch={false} href={link({ lang: lang === "en" ? "fr" : "en", ...(full ? { complet: "1" } : {}) })} className="rounded-xl border px-3 py-2 text-sm font-semibold">{lang === "en" ? "Version française" : "English version"}</Link>
        <Link prefetch={false} href={link({ lang, ...(full ? {} : { complet: "1" }) })} className="rounded-xl border px-3 py-2 text-sm font-semibold">{full ? "Résumé d'une page" : "Copie complète (sauvegarde)"}</Link>
        <PrintPdfButton label={lang === "en" ? "Print / save as PDF" : "Imprimer ou enregistrer en PDF"} />
      </div>
      <p className="rounded-xl bg-brand-mint p-3 text-xs text-brand-deep print:hidden">Tendez ce résumé à votre médecin, ou enregistrez-le en PDF : choisissez « Enregistrer au format PDF » dans la fenêtre d&apos;impression. Le PDF reste sur votre téléphone ; gardez-le en lieu sûr.</p>

      <article className="space-y-1 rounded-2xl border bg-white p-5 text-[15px] print:border-0 print:p-0">
        <header className="flex flex-wrap items-baseline justify-between gap-2 pb-2">
          <div>
            <h1 className="text-2xl font-bold text-brand-deep">{person.display_name}</h1>
            <p className="text-sm">{[person.birth_year ? `${tr("born", lang)} ${person.birth_year}${age !== null ? ` (${age} ${lang === "en" ? "years" : "ans"})` : ""}` : null, person.sex ? tr(person.sex as "F" | "M", lang) : null].filter(Boolean).join(" · ")}</p>
          </div>
          <p className="text-xs text-muted-foreground">{tr("summary", lang)}{full ? (lang === "en" ? " — full copy" : " — copie complète") : ""} · {tr("printed", lang)} {fmtDate(new Date().toISOString(), lang)} · PharmaProxi</p>
        </header>
        <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">{tr("declared", lang)}</p>

        {severe.length > 0 && (
          <p className="flex items-center gap-2 rounded-lg border-2 border-red-600 p-2 font-bold text-red-700"><AlertTriangle className="size-5 shrink-0" aria-hidden />{tr("allergyWarn", lang)} : {severe.map((a) => a.title).join(", ")}</p>
        )}

        <Block title={tr("essentials", lang)}>
          <ul className="grid gap-x-6 text-sm sm:grid-cols-2">
            <li><strong>{tr("blood", lang)} :</strong> {ess?.blood_group && ess.blood_group !== "inconnu" ? ess.blood_group : tr("unknown", lang)}</li>
            {ess?.height_cm && <li><strong>{tr("height", lang)} :</strong> {ess.height_cm} cm</li>}
            {ess?.weight_kg && <li><strong>{tr("weight", lang)} :</strong> {String(ess.weight_kg).replace(".", lang === "en" ? "." : ",")} kg</li>}
            {ess?.pregnant && <li className="font-semibold">{tr("pregnant", lang)}{preg ? ` — ${preg.weeks} ${tr("weeks", lang)}, ${tr("due", lang)} ${fmtDate(preg.due, lang)}` : ""}</li>}
            {!ess?.pregnant && preg && <li className="font-semibold">{tr("pregnancy", lang)} : {preg.weeks} {tr("weeks", lang)}, {tr("due", lang)} {fmtDate(preg.due, lang)}</li>}
            {ess?.breastfeeding && <li className="font-semibold">{tr("breastfeeding", lang)}</li>}
            {ess?.emergency_phone && <li><strong>{tr("emergency", lang)} :</strong> {[ess.emergency_name, ess.emergency_relation && `(${ess.emergency_relation})`].filter(Boolean).join(" ")} {formatPhone(ess.emergency_phone) ?? ess.emergency_phone}</li>}
            {ess?.coverage && <li><strong>{tr("coverage", lang)} :</strong> {COVERAGE[ess.coverage]?.[lang]}{ess.insurer ? ` — ${ess.insurer}` : ""}{ess.insured_number ? ` n° ${ess.insured_number}` : ""}</li>}
          </ul>
        </Block>

        <Block title={name("allergie")} empty={!of("allergie").length}><ul className="text-sm">{of("allergie").map((i) => <Line key={i.id} i={i} lang={lang} />)}</ul></Block>
        {kindList("maladie")}

        <Block title={tr("current", lang)} empty={!(treatments ?? []).length && !recentRx.length}>
          <ul className="text-sm">
            {(treatments ?? []).map((t) => { const h = allergyMatches(t.name, allergyNames); return <li key={t.name} className="py-1"><span className="font-semibold">{t.name}</span>{t.dose_note ? ` — ${t.dose_note}` : ""} · {t.times.join(", ")}{h.length > 0 && <span className="ml-1 font-bold text-red-700">⚠ {lang === "en" ? "similar to declared allergy" : "ressemble à une allergie déclarée"} ({h.join(", ")})</span>}</li>; })}
            {recentRx.filter((r) => !(treatments ?? []).some((t) => t.name.endsWith(r.title))).map((i) => <Line key={i.id} i={i} lang={lang} />)}
          </ul>
        </Block>
        {kindList("ancien_traitement", 5)}
        <Block title={lang === "en" ? "Medical history" : "Antécédents"} empty={!(["operation", "hospitalisation", "transfusion"] as ItemKind[]).some((k) => of(k).length)}>
          <ul className="text-sm">{(["operation", "hospitalisation", "transfusion"] as ItemKind[]).flatMap((k) => of(k).map((i) => <Line key={i.id} i={{ ...i, category: name(k) }} lang={lang} />))}</ul>
        </Block>
        <Block title={name("famille")} show={of("famille").length > 0}><ul className="text-sm">{of("famille").map((i) => <Line key={i.id} i={i} lang={lang} />)}</ul></Block>
        <Block title={name("vaccin")} show={of("vaccin").length > 0}><ul className="text-sm">{of("vaccin", 8).map((i) => <Line key={i.id} i={i} lang={lang} />)}</ul></Block>
        {kindList("analyse", 8)}
        <Block title={tr("measures", lang)} show={(measures ?? []).length > 0}>
          <ul className="text-sm">{(measures ?? []).map((m) => <li key={m.measured_at}>{m.kind === "tension" ? `${tr("bp", lang)} ${m.systolic}/${m.diastolic}` : `${tr("glucose", lang)} ${m.glucose_gl} g/L`} — {fmtDate(m.measured_at, lang)}</li>)}</ul>
        </Block>
        <Block title={name("consultation")} show={of("consultation").length > 0}><ul className="text-sm">{of("consultation", 3).map((i) => <Line key={i.id} i={i} lang={lang} />)}</ul></Block>
        {full && (["symptome", "rendez_vous", "preparation", "soignant"] as ItemKind[]).map((k) => <Block key={k} title={name(k)} show={of(k).length > 0}><ul className="text-sm">{of(k).map((i) => <Line key={i.id} i={i} lang={lang} />)}</ul></Block>)}
        {lang === "en" && <p className="pt-2 text-xs text-muted-foreground">Free-text notes are shown in the language in which the patient wrote them.</p>}
      </article>
    </div>
  );
}
