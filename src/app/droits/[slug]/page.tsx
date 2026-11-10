import Link from "next/link";
import { notFound } from "next/navigation";
import { BookOpen, CheckCircle2, Info } from "lucide-react";
import { Rich, TopicIcon } from "@/components/droits/topic-icon";
import { DROITS_CHECKED, TOPICS, topicBySlug, type Block } from "@/lib/droits";

export function generateStaticParams() {
  return TOPICS.map((t) => ({ slug: t.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const t = topicBySlug((await params).slug);
  return t ? { title: t.title, description: t.summary } : { title: "Vos droits" };
}

function Render({ b }: { b: Block }) {
  if ("h" in b) return <h2 className="pt-2 text-lg font-bold text-brand-deep">{b.h}</h2>;
  if ("p" in b) return <p><Rich text={b.p} /></p>;
  if ("ul" in b) return <ul className="list-disc space-y-1.5 ps-5">{b.ul.map((x, i) => <li key={i}><Rich text={x} /></li>)}</ul>;
  if ("ol" in b) return <ol className="list-decimal space-y-1.5 ps-5">{b.ol.map((x, i) => <li key={i}><Rich text={x} /></li>)}</ol>;
  if ("note" in b) return <p className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-950"><Info className="mt-0.5 size-4 shrink-0" aria-hidden /><span><Rich text={b.note} /></span></p>;
  return (
    <div className="space-y-2">
      {b.table.rows.map((r, i) => (
        <div key={i} className="rounded-xl border p-3 text-sm">
          {r.map((cell, j) => (
            <p key={j} className={j === 0 ? "font-semibold text-brand-deep" : ""}>{j > 0 && b.table.head[j] ? <span className="text-muted-foreground">{b.table.head[j]} : </span> : null}<Rich text={cell} /></p>
          ))}
        </div>
      ))}
    </div>
  );
}

export default async function TopicPage({ params }: { params: Promise<{ slug: string }> }) {
  const t = topicBySlug((await params).slug);
  if (!t) notFound();
  const i = TOPICS.indexOf(t);
  const others = [TOPICS[(i + 1) % TOPICS.length], TOPICS[(i + 2) % TOPICS.length]];
  return (
    <div className="container-page max-w-3xl space-y-5 py-6">
      <p className="text-sm"><Link prefetch={false} href="/droits" className="text-primary underline">Vos droits et votre santé</Link> › {t.title}</p>
      <header className="space-y-2">
        <h1 className="flex items-center gap-3 text-2xl font-bold text-brand-deep"><span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-mint"><TopicIcon icon={t.icon} className="size-6 text-primary" /></span>{t.title}</h1>
        <p className="text-muted-foreground">{t.summary}</p>
      </header>
      <section aria-label="L'essentiel" className="rounded-2xl border border-emerald-200 bg-brand-mint p-4">
        <p className="mb-2 font-semibold text-brand-deep">L&apos;essentiel</p>
        <ul className="space-y-1.5">{t.keyFacts.map((k) => <li key={k} className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />{k}</li>)}</ul>
      </section>
      <article className="space-y-3 rounded-2xl border bg-white p-5 text-[15px] leading-relaxed">
        {t.blocks.map((b, k) => <Render key={k} b={b} />)}
      </article>
      {t.sources.length > 0 && (
        <section className="rounded-2xl border bg-white p-5 text-sm">
          <h2 className="flex items-center gap-2 font-bold"><BookOpen className="size-4 text-primary" aria-hidden /> Sources</h2>
          <ul className="mt-2 list-disc space-y-1 ps-5">{t.sources.map((s) => <li key={s.label}>{s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-primary underline">{s.label}</a> : s.label}</li>)}</ul>
          <p className="mt-2 text-xs text-muted-foreground">Vérifié en {DROITS_CHECKED}. Résumé de textes publics : ni avis juridique, ni avis médical.</p>
        </section>
      )}
      {t.slug === "medicaments-de-la-rue" && (
        <p className="text-sm"><Link prefetch={false} href="/pharmacies" className="font-semibold text-primary underline">Trouver une pharmacie près de chez vous</Link> · <Link prefetch={false} href="/infos/securite" className="font-semibold text-primary underline">Bon usage et sécurité</Link></p>
      )}
      <nav aria-label="Autres fiches" className="grid gap-3 sm:grid-cols-2">
        {others.map((o) => (
          <Link key={o.slug} prefetch={false} href={`/droits/${o.slug}`} className="rounded-xl border bg-white p-3 text-sm hover:border-primary">
            <span className="text-xs text-muted-foreground">À lire aussi</span><span className="block font-semibold text-brand-deep">{o.title}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
