import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, MapPin } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";
import { BloodNav } from "@/components/blood/blood-nav";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { toggleAttendance } from "@/app/actions/authorities";
import { bookCampaignSlot } from "@/app/actions/v040";
import { type Campaign, regionName } from "@/lib/campaigns";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Collecte de sang" };
export const dynamic = "force-dynamic";

export default async function Collecte({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const [{ data }, session] = await Promise.all([
    supabase.from("blood_campaigns").select("id, title, organizer, place, starts_on, start_time, end_time, details, source_url, validated_at, collecting_structure, slot_minutes, regions(name)").eq("id", id).eq("published", true).maybeSingle(),
    getSession(),
  ]);
  if (!data) notFound();
  const c = data as unknown as Campaign;
  const past = c.starts_on < new Date().toISOString().slice(0, 10);
  const [{ data: slots }, { data: going }, att] = await Promise.all([
    c.slot_minutes ? supabase.rpc("campaign_slots", { p_campaign: c.id }) : Promise.resolve({ data: [] }),
    supabase.rpc("campaign_going", { p_campaign: c.id }),
    session ? supabase.from("blood_campaign_attendance").select("campaign_id").eq("campaign_id", c.id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const sl = (slots ?? []) as { slot_start: string; capacity: number; taken: number; mine: boolean }[];
  const mySlot = sl.find((s) => s.mine);
  return (
    <div className="container-page max-w-3xl space-y-4 py-6">
      <BloodNav current="/don-de-sang/collectes" />
      <p className="text-sm"><Link prefetch={false} href="/don-de-sang/collectes" className="text-primary underline">← Calendrier des collectes</Link></p>
      <h1 className="text-2xl font-bold">{c.title}</h1>
      <div className="space-y-2 rounded-2xl border bg-white p-4 text-sm">
        <p className="flex items-center gap-1.5"><CalendarDays className="size-4 text-red-600" aria-hidden />{formatDate(c.starts_on)}{c.start_time ? `, de ${c.start_time} à ${c.end_time ?? ""}` : ""}</p>
        <p className="flex items-start gap-1.5"><MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />{c.place}{regionName(c) ? ` · ${regionName(c)}` : ""}</p>
        {c.details ? <p className="text-muted-foreground">{c.details}</p> : null}
        <p className="text-xs">Organisée par <strong>{c.organizer}</strong>{c.collecting_structure ? <> · prélèvements réalisés par <strong>{c.collecting_structure}</strong></> : null}</p>
        <p className="text-xs text-muted-foreground">{c.source_url ? <a href={c.source_url} target="_blank" rel="noopener noreferrer" className="underline">Source officielle</a> : `Proposition vérifiée et validée le ${c.validated_at ? formatDate(c.validated_at) : "—"} (CNTS ou équipe SantéProxi).`}</p>
        {going !== null ? <p className="font-semibold text-red-700">{going as number} personnes ont dit « j&apos;y serai »</p> : null}
      </div>
      {past ? <p className="rounded-xl border bg-white p-4 text-sm text-muted-foreground">Cette collecte est passée.</p> : !session ? (
        <Link prefetch={false} href={`/connexion?suite=/don-de-sang/collectes/${c.id}`} className="inline-block rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white">Se connecter pour s&apos;inscrire</Link>
      ) : c.slot_minutes && sl.length ? (
        <section className="space-y-2 rounded-2xl border bg-white p-4" aria-labelledby="cr">
          <h2 id="cr" className="font-semibold">Choisir un créneau</h2>
          <p className="text-xs text-muted-foreground">Un créneau évite l&apos;attente. L&apos;aptitude au don est vérifiée sur place par l&apos;équipe de prélèvement. <Link prefetch={false} href="/don-de-sang/suis-je-apte" className="underline">Suis-je apte ?</Link></p>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">{sl.map((s) => {
            const full = s.taken >= s.capacity && !s.mine;
            return (
              <li key={s.slot_start}><ActionForm action={bookCampaignSlot}><input type="hidden" name="campaign_id" value={c.id} /><input type="hidden" name="slot" value={s.slot_start} />
                <SubmitButton size="sm" variant={s.mine ? "default" : "outline"} disabled={full || s.mine} className="w-full">{s.slot_start} · {s.mine ? "mon créneau" : full ? "complet" : `${s.capacity - s.taken} place(s)`}</SubmitButton></ActionForm></li>);
          })}</ul>
          {mySlot ? <ActionForm action={bookCampaignSlot}><input type="hidden" name="campaign_id" value={c.id} /><input type="hidden" name="slot" value="annuler" /><SubmitButton size="sm" variant="ghost">Libérer mon créneau</SubmitButton></ActionForm> : null}
        </section>
      ) : (
        <ActionForm action={toggleAttendance}><input type="hidden" name="campaign_id" value={c.id} /><SubmitButton variant={att.data ? "outline" : "default"}>{att.data ? "Je ne viens plus" : "J'y serai"}</SubmitButton></ActionForm>
      )}
    </div>
  );
}
