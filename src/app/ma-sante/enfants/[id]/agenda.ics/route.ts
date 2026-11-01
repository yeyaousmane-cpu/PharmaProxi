import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildIcs } from "@/lib/ics";
import { buildVisits, type Dose } from "@/lib/vaccines";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Introuvable", { status: 404 });
  const supabase = await createClient();
  const [{ data: k }, { data: sched }, { data: vacc }] = await Promise.all([
    supabase.from("children").select("id, first_name, birth_date, sex").eq("id", id).maybeSingle(),
    supabase.from("vaccine_schedule").select("*"),
    supabase.from("child_vaccinations").select("dose_code, done_on").eq("child_id", id),
  ]);
  if (!k) return new NextResponse("Introuvable", { status: 404 });
  const today = new Date().toISOString().slice(0, 10);
  const visits = buildVisits((sched ?? []) as Dose[], k.birth_date, k.sex, Object.fromEntries((vacc ?? []).map((v) => [v.dose_code, v.done_on])))
    .filter((v) => v.status !== "fait" && v.due >= today);
  const ics = buildIcs(`Vaccins de ${k.first_name}`, visits.map((v) => ({
    uid: `vaccin-${k.id}-${v.key}`, start: v.due, allDay: true, alarmMin: 3 * 24 * 60 - 9 * 60,
    title: `Vaccins de ${k.first_name} (${v.label})`,
    description: `${v.doses.filter((d) => d.status !== "fait").map((d) => d.label).join(", ")}. Apportez le carnet de vaccination au centre de santé. — PharmaProxi`,
  })));
  return new NextResponse(ics, { headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `attachment; filename="vaccins-${k.first_name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.ics"`, "Cache-Control": "private, no-store" } });
}
