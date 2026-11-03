import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildIcs } from "@/lib/ics";

export const dynamic = "force-dynamic";

/** Rendez-vous médicaux à venir, pour l'agenda du téléphone (dossier ouvert uniquement). */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/connexion?suite=/ma-sante/dossier/consultations", req.url));
  const p = req.nextUrl.searchParams.get("p");
  let person = supabase.from("record_persons").select("id, is_self, display_name");
  person = p && /^[0-9a-f-]{36}$/i.test(p) ? person.eq("id", p) : person.eq("is_self", true);
  const { data: who } = await person.maybeSingle();
  if (!who) return new NextResponse("Dossier verrouillé ou introuvable. Ouvrez votre dossier puis réessayez.", { status: 403 });
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabase.from("record_items").select("id, title, event_date, event_time, place").eq("person_id", who.id).eq("kind", "rendez_vous").gte("event_date", today).limit(50);
  const ics = buildIcs("PharmaProxi — rendez-vous", (data ?? []).map((r) => ({
    uid: `rdv-${r.id}`, start: r.event_time ? `${r.event_date}T${r.event_time}` : r.event_date!, allDay: !r.event_time, durationMin: 60, alarmMin: r.event_time ? 120 : undefined,
    title: `Rendez-vous médical${who.is_self ? "" : ` (${who.display_name})`}`, description: [r.title, r.place].filter(Boolean).join(" — "),
  })));
  return new NextResponse(ics, { headers: { "content-type": "text/calendar; charset=utf-8", "content-disposition": 'attachment; filename="rendez-vous.ics"', "cache-control": "private, no-store" } });
}
