import Link from "next/link";
import { CalendarDays, MapPin } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { BloodNav } from "@/components/blood/blood-nav";
import { type Campaign, regionName } from "@/lib/campaigns";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Calendrier des collectes de sang", description: "Collectes de sang annoncées au Mali : publiées par le CNTS ou validées par lui avant publication." };
export const dynamic = "force-dynamic";

export default async function Collectes({ searchParams }: { searchParams: Promise<{ region?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const region = sp.region && /^[0-9a-f-]{36}$/i.test(sp.region) ? sp.region : null;
  let q = supabase.from("blood_campaigns").select("id, title, organizer, place, starts_on, start_time, end_time, details, source_url, validated_at, collecting_structure, slot_minutes, regions(name)").eq("published", true).gte("starts_on", today).order("starts_on").limit(200);
  if (region) q = q.eq("region_id", region);
  const [{ data }, { data: regions }] = await Promise.all([q, supabase.from("regions").select("id, name").order("name")]);
  const rows = (data ?? []) as unknown as Campaign[];
  const months = new Map<string, Campaign[]>();
  for (const c of rows) { const k = c.starts_on.slice(0, 7); months.set(k, [...(months.get(k) ?? []), c]); }
  const monthLabel = (k: string) => new Date(`${k}-01T12:00:00Z`).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  return (
    <div className="container-page max-w-4xl space-y-4 py-6">
      <BloodNav current="/don-de-sang/collectes" />
      <h1 className="text-2xl font-bold">Calendrier des collectes de sang</h1>
      <p className="text-sm text-muted-foreground">Chaque collecte est publiée par le CNTS (avec un lien vers sa source) ou proposée par une organisation puis validée par le CNTS ou l&apos;équipe SantéProxi, avec la structure qui réalise le prélèvement. SantéProxi ne collecte pas de sang : il aide à faire connaître les collectes.</p>
      <div className="flex flex-wrap items-end gap-2">
        <form method="get" className="flex items-end gap-2"><label className="grid gap-1 text-sm">Région
          <select name="region" defaultValue={region ?? ""} className="min-h-11 rounded-lg border bg-white px-3"><option value="">Toutes les régions</option>{(regions ?? []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
          <button className="min-h-11 rounded-lg border bg-white px-4 text-sm font-semibold">Filtrer</button></form>
        <Link prefetch={false} href="/don-de-sang/collectes/organiser" className="ms-auto min-h-11 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white">Organiser une collecte</Link>
      </div>
      {rows.length === 0 ? <p className="rounded-xl border bg-white p-4 text-sm text-muted-foreground">Aucune collecte annoncée{region ? " dans cette région" : ""} pour le moment. Vous pouvez donner à tout moment dans un centre du CNTS.</p> : (
        [...months.entries()].map(([k, list]) => (
          <section key={k} className="space-y-2" aria-labelledby={`m-${k}`}>
            <h2 id={`m-${k}`} className="text-lg font-bold capitalize text-brand-deep">{monthLabel(k)}</h2>
            <ul className="grid gap-2 md:grid-cols-2">{list.map((c) => (
              <li key={c.id}><Link prefetch={false} href={`/don-de-sang/collectes/${c.id}`} className="block space-y-1 rounded-xl border bg-white p-4 text-sm hover:border-red-400">
                <p className="font-bold">{c.title}</p>
                <p className="flex items-center gap-1.5"><CalendarDays className="size-4 text-red-600" aria-hidden />{formatDate(c.starts_on)}{c.start_time ? `, ${c.start_time}–${c.end_time ?? ""}` : ""}</p>
                <p className="flex items-start gap-1.5"><MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />{c.place}{regionName(c) ? ` · ${regionName(c)}` : ""}</p>
                <p className="text-xs text-muted-foreground">{c.organizer}{c.slot_minutes ? " · inscription par créneau" : ""}</p>
              </Link></li>))}</ul>
          </section>))
      )}
    </div>
  );
}
