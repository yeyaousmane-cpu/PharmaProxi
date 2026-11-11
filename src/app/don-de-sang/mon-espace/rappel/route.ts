import { createClient } from "@/lib/supabase/server";
import type { DonorSummary } from "@/lib/donor";

export const dynamic = "force-dynamic";

/** Fichier calendrier (.ics) : date indicative de prochain don, à ajouter au calendrier du téléphone. */
export async function GET() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return new Response("Connexion requise", { status: 401 });
  const s = (await supabase.rpc("donor_summary")).data as DonorSummary | null;
  if (!s?.exists || !s.next_indicative) return new Response("Aucune date indicative : enregistrez d'abord un don.", { status: 404 });
  const d = s.next_indicative.replace(/-/g, "");
  const next = new Date(`${s.next_indicative}T00:00:00Z`); next.setUTCDate(next.getUTCDate() + 1);
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//SantéProxi//Don de sang//FR", "BEGIN:VEVENT", `UID:don-${s.donor_code}-${d}@santeproxi`, `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${next.toISOString().slice(0, 10).replace(/-/g, "")}`, "SUMMARY:Date indicative de prochain don de sang",
    "DESCRIPTION:Date indicative de prochain don. Votre aptitude au don doit être confirmée par un professionnel de santé.", "BEGIN:VALARM", "TRIGGER:-P1D", "ACTION:DISPLAY",
    "DESCRIPTION:Don de sang : date indicative demain", "END:VALARM", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
  return new Response(ics, { headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'attachment; filename="prochain-don.ics"', "Cache-Control": "private, no-store" } });
}
