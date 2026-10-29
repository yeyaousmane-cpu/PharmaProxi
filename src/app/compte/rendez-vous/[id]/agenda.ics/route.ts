import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type Row = { id: string; status: string; scheduled_at: string | null; ends_at: string | null; doctor_label: string; clinic_name: string; clinic_address: string; type_name: string | null; instructions: string | null; phone: string | null };

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Fichier agenda (.ics) d'un rendez-vous confirmé : à ouvrir avec l'agenda du téléphone. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Introuvable", { status: 404 });
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_appointments");
  if (error) return new NextResponse("Connectez-vous pour télécharger ce rendez-vous.", { status: 401 });
  const a = ((data as Row[]) ?? []).find((r) => r.id === id);
  if (!a || a.status !== "confirmed" || !a.scheduled_at) return new NextResponse("Rendez-vous introuvable", { status: 404 });
  const start = new Date(a.scheduled_at);
  const end = a.ends_at ? new Date(a.ends_at) : new Date(start.getTime() + 30 * 60_000);
  const desc = [a.type_name && `Motif : ${a.type_name}`, a.instructions && `À savoir : ${a.instructions}`, a.phone && `Téléphone : ${a.phone}`, "Rendez-vous pris sur PharmaProxi"].filter(Boolean).join("\n");
  const ics = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//PharmaProxi//Rendez-vous//FR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VEVENT", `UID:${a.id}@pharmaproxi`, `DTSTAMP:${stamp(new Date())}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(`Rendez-vous — ${a.doctor_label}`)}`, `LOCATION:${esc(`${a.clinic_name}, ${a.clinic_address}`)}`, `DESCRIPTION:${esc(desc)}`,
    "BEGIN:VALARM", "TRIGGER:-PT2H", "ACTION:DISPLAY", "DESCRIPTION:Rendez-vous médical dans 2 heures", "END:VALARM",
    "END:VEVENT", "END:VCALENDAR", "",
  ].join("\r\n");
  return new NextResponse(ics, {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `attachment; filename="rendez-vous-${start.toISOString().slice(0, 10)}.ics"`, "Cache-Control": "private, no-store" },
  });
}
