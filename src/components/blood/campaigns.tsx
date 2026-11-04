import { CalendarDays, MapPin } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { toggleAttendance } from "@/app/actions/authorities";
import { formatDate } from "@/lib/format";

type C = { id: string; title: string; organizer: string; place: string; starts_on: string; start_time: string | null; end_time: string | null; details: string | null; source_url: string; regions: { name: string } | null };

/** Collectes mobiles publiées par le CNTS (source officielle obligatoire) et « J'y serai ». */
export async function BloodCampaigns() {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const [{ data }, session] = await Promise.all([
    supabase.from("blood_campaigns").select("id, title, organizer, place, starts_on, start_time, end_time, details, source_url, regions(name)").eq("published", true).gte("starts_on", today).order("starts_on").limit(12),
    getSession(),
  ]);
  const rows = (data ?? []) as unknown as C[];
  const mine = new Set<string>();
  if (session && rows.length) {
    const { data: a } = await supabase.from("blood_campaign_attendance").select("campaign_id").in("campaign_id", rows.map((r) => r.id));
    for (const x of a ?? []) mine.add(x.campaign_id);
  }
  const going = await Promise.all(rows.map(async (r) => (await supabase.rpc("campaign_going", { p_campaign: r.id })).data as number | null));
  return (
    <section id="campagnes" aria-labelledby="campagnes-t" className="scroll-mt-24 space-y-3">
      <h2 id="campagnes-t" className="flex items-center gap-2 text-lg font-bold"><CalendarDays className="size-5 text-red-600" aria-hidden /> Prochaines collectes</h2>
      {rows.length === 0 ? (
        <p className="rounded-xl border bg-white p-4 text-sm text-muted-foreground">Aucune collecte mobile annoncée pour le moment. Vous pouvez donner à tout moment au CNTS ; les collectes annoncées par le CNTS apparaîtront ici.</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">{rows.map((c, i) => (
          <li key={c.id} className="space-y-2 rounded-xl border bg-white p-4 text-sm">
            <p className="font-bold text-brand-deep">{c.title}</p>
            <p className="flex items-center gap-1.5"><CalendarDays className="size-4 text-red-600" aria-hidden />{formatDate(c.starts_on)}{c.start_time ? `, de ${c.start_time.replace(":", " h ")} à ${(c.end_time ?? "").replace(":", " h ")}` : ""}</p>
            <p className="flex items-start gap-1.5"><MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />{c.place}{c.regions ? ` · ${c.regions.name}` : ""}</p>
            {c.details && <p className="text-muted-foreground">{c.details}</p>}
            {going[i] !== null && <p className="font-semibold text-red-700">{going[i]} personnes ont dit « j&apos;y serai »</p>}
            <div className="flex flex-wrap items-center gap-3">
              <ActionForm action={toggleAttendance}><input type="hidden" name="campaign_id" value={c.id} />
                <SubmitButton size="sm" variant={mine.has(c.id) ? "outline" : "default"}>{mine.has(c.id) ? "Je ne viens plus" : "J'y serai"}</SubmitButton></ActionForm>
              <a href={c.source_url} target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground underline">Source : {c.organizer}</a>
            </div>
          </li>))}</ul>
      )}
    </section>
  );
}
