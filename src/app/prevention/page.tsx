import Link from "next/link";
import { CalendarDays, ExternalLink, ShieldCheck, Syringe } from "lucide-react";
import { getLang, getT } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { formatDate } from "@/lib/format";
import { PREVENTION_KINDS, type PreventionEvent } from "@/lib/prevention";
import { ListenButton } from "@/components/speech/listen-button";
import { StateMessage } from "@/components/ui/state-message";

export const metadata = { title: "Prévention — campagnes, dépistages, vaccination", description: "Calendrier des campagnes de santé, dépistages, vaccinations et journées mondiales de santé au Mali, avec leurs sources officielles." };
export const revalidate = 600;

export default async function Page({ searchParams }: { searchParams: Promise<{ type?: string; region?: string }> }) {
  const [sp, t, lang] = await Promise.all([searchParams, getT(), getLang()]);
  const kind = PREVENTION_KINDS.find((k) => k === sp.type);
  let events: PreventionEvent[] = [];
  let regions: { id: string; name: string }[] = [];
  let fiches: { slug: string; title: string }[] = [];
  let failed = false;
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const since = new Date(Date.now() - 60 * 86400_000).toISOString().slice(0, 10);
    let q = supabase.from("prevention_events").select("*, regions(name)").in("status", ["publie", "annule"]).gte("starts_on", since).order("starts_on").limit(200);
    if (kind) q = q.eq("kind", kind);
    if (sp.region && /^[0-9a-f-]{36}$/.test(sp.region)) q = q.eq("region_id", sp.region);
    const [e, r, f] = await Promise.all([
      q, supabase.from("regions").select("id, name").order("name"),
      supabase.from("health_articles").select("slug, title").eq("status", "published").eq("kind", "prevention").order("title").limit(20),
    ]);
    failed = Boolean(e.error);
    events = (e.data ?? []) as PreventionEvent[];
    regions = r.data ?? [];
    fiches = f.data ?? [];
  }
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = events.filter((e) => (e.ends_on ?? e.starts_on) >= today);
  const past = events.filter((e) => (e.ends_on ?? e.starts_on) < today).reverse();
  const card = (e: PreventionEvent) => (
    <li key={e.id} className={`rounded-2xl border bg-white p-4 ${e.status === "annule" ? "opacity-70" : ""}`}>
      <p className="flex flex-wrap items-center gap-2 text-xs font-semibold">
        <span className="rounded-full bg-[#EAF6EE] px-2 py-0.5 text-[#052D1E]">{t(`prev.kind.${e.kind}`)}</span>
        {e.status === "annule" && <span className="rounded-full bg-red-100 px-2 py-0.5 text-red-900">{t("prev.cancelled")}</span>}
        {e.is_free && <span className="rounded-full bg-sky-100 px-2 py-0.5 text-sky-900">{t("prev.free")}</span>}
      </p>
      <h3 className="mt-2 text-lg font-bold text-[#052D1E]" lang="fr" dir="auto">{e.title}</h3>
      <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold"><CalendarDays className="size-4 text-[#068132]" aria-hidden />
        {e.ends_on && e.ends_on !== e.starts_on ? t("prev.from_to", { a: formatDate(e.starts_on), b: formatDate(e.ends_on) }) : formatDate(e.starts_on)}</p>
      {e.description && <p className="mt-2 whitespace-pre-line text-sm" lang="fr" dir="auto">{e.description}</p>}
      <dl className="mt-2 grid gap-1 text-sm">
        {(e.place || e.regions?.name) && <div><dt className="inline font-semibold">{t("prev.where")} : </dt><dd className="inline" dir="auto">{[e.place, e.regions?.name].filter(Boolean).join(", ")}</dd></div>}
        {e.public_concerned && <div><dt className="inline font-semibold">{t("prev.who")} : </dt><dd className="inline" dir="auto">{e.public_concerned}</dd></div>}
        <div><dt className="inline font-semibold">{t("prev.organizer")} : </dt><dd className="inline" dir="auto">{e.organizer}</dd></div>
        <div><dt className="inline font-semibold">{t("prev.source")} : </dt><dd className="inline" dir="auto">{e.source_url ? <a href={e.source_url} rel="noopener noreferrer" target="_blank" className="inline-flex items-center gap-1 text-primary underline">{e.source_name} <ExternalLink className="size-3" aria-hidden /></a> : e.source_name}</dd></div>
      </dl>
    </li>
  );
  return (
    <div id="prev-texte" className="container-page max-w-4xl space-y-6 py-6">
      <header>
        <h1 className="flex items-center gap-2 text-3xl font-extrabold text-[#052D1E]"><Syringe className="size-8 text-[#068132]" aria-hidden /> {t("prev.title")}</h1>
        <p className="mt-2 text-muted-foreground">{t("prev.sub")}</p>
        <p className="mt-2 flex items-start gap-2 rounded-xl bg-[#EAF6EE] p-3 text-sm text-[#052D1E]"><ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />{t("prev.rule")}</p>
      </header>
      <ListenButton targetId="prev-texte" lang={lang} />
      <Link prefetch={false} href="/prevention/programmes" className="block rounded-2xl border-2 border-[#068132] bg-white p-4 hover:bg-[#EAF6EE]" data-no-listen>
        <span className="block text-lg font-bold text-[#052D1E]">Les 8 programmes de prévention</span>
        <span className="block text-sm text-muted-foreground">Paludisme, vaccination, grossesse et nouveau-né, nutrition de l&apos;enfant, hypertension et diabète, VIH et hépatites, tuberculose, eau et hygiène.</span>
      </Link>
      <form method="get" className="flex flex-wrap items-end gap-2" data-no-listen>
        <select name="type" defaultValue={kind ?? ""} aria-label={t("prev.all_kinds")} className="h-11 rounded-lg border bg-white px-2 text-sm">
          <option value="">{t("prev.all_kinds")}</option>{PREVENTION_KINDS.map((k) => <option key={k} value={k}>{t(`prev.kind.${k}`)}</option>)}
        </select>
        <select name="region" defaultValue={sp.region ?? ""} aria-label={t("prev.all_regions")} className="h-11 rounded-lg border bg-white px-2 text-sm">
          <option value="">{t("prev.all_regions")}</option>{regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <button className="h-11 rounded-lg bg-[#052D1E] px-4 text-sm font-semibold text-white">{t("prev.filter")}</button>
      </form>
      {failed ? <StateMessage state="unavailable">{t("state.unavailable")}</StateMessage> : (
        <>
          <section aria-labelledby="prev-up" className="space-y-3">
            <h2 id="prev-up" className="text-xl font-bold">{t("prev.upcoming")}</h2>
            {upcoming.length === 0 ? <StateMessage state="empty">{t("prev.empty")}</StateMessage> : <ul className="grid gap-3 sm:grid-cols-2">{upcoming.map(card)}</ul>}
          </section>
          {past.length > 0 && (
            <section aria-labelledby="prev-past" className="space-y-3">
              <h2 id="prev-past" className="text-xl font-bold">{t("prev.past")}</h2>
              <ul className="grid gap-3 sm:grid-cols-2">{past.slice(0, 10).map(card)}</ul>
            </section>
          )}
        </>
      )}
      <section className="grid gap-3 sm:grid-cols-2">
        <Link prefetch={false} href="/ma-sante/famille" className="rounded-2xl border bg-white p-4 font-semibold text-[#052D1E] hover:border-[#068132]">{t("prev.vaccins")}</Link>
        <Link prefetch={false} href="/sante/depistage-prevention" className="rounded-2xl border bg-white p-4 font-semibold text-[#052D1E] hover:border-[#068132]">{t("prev.articles")}{fiches.length ? ` (${fiches.length})` : ""}</Link>
      </section>
    </div>
  );
}
