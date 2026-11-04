import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildIcs } from "@/lib/ics";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Introuvable", { status: 404 });
  const supabase = await createClient();
  const { data: t } = await supabase.from("treatments").select("id, name, dose_note, times, start_date, duration_days").eq("id", id).maybeSingle();
  if (!t) return new NextResponse("Introuvable", { status: 404 });
  const today = new Date().toISOString().slice(0, 10);
  const start = t.start_date > today ? t.start_date : today;
  const remaining = t.duration_days === null ? null : Math.max(1, t.duration_days - Math.round((Date.parse(start) - Date.parse(t.start_date)) / 86_400_000));
  const ics = buildIcs("Mon traitement", (t.times as string[]).map((slot) => ({
    uid: `traitement-${t.id}-${slot}`, start: `${start}T${slot}`, durationMin: 10,
    title: `Prendre : ${t.name}${t.dose_note ? ` (${t.dose_note})` : ""}`,
    description: "Rappel de traitement — SantéProxi",
    rrule: remaining === null ? "FREQ=DAILY" : `FREQ=DAILY;COUNT=${remaining}`,
  })));
  return new NextResponse(ics, { headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'attachment; filename="traitement.ics"', "Cache-Control": "private, no-store" } });
}
