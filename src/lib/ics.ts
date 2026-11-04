/** Petits fichiers d'agenda (.ics) : ajoutés au calendrier du téléphone, ils sonnent même sans connexion. */
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const stamp = () => new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const fold = (line: string) => (line.length <= 74 ? line : line.match(/.{1,74}/g)!.join("\r\n "));

export type IcsEvent = { uid: string; start: string; durationMin?: number; title: string; description?: string; rrule?: string; alarmMin?: number; allDay?: boolean };

/** start : « AAAA-MM-JJ » (journée) ou « AAAA-MM-JJTHH:MM » (heure du Mali = UTC). */
export function buildIcs(name: string, events: IcsEvent[]) {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//SantéProxi//FR", "CALSCALE:GREGORIAN", `X-WR-CALNAME:${esc(name)}`, "X-WR-TIMEZONE:Africa/Bamako"];
  for (const e of events) {
    const d = e.start.replace(/-/g, "").replace(":", "");
    lines.push("BEGIN:VEVENT", `UID:${e.uid}@pharmaproxi`, `DTSTAMP:${stamp()}`);
    if (e.allDay) lines.push(`DTSTART;VALUE=DATE:${d.slice(0, 8)}`);
    else lines.push(`DTSTART:${d}00Z`, `DURATION:PT${e.durationMin ?? 15}M`);
    lines.push(`SUMMARY:${esc(e.title)}`);
    if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`);
    if (e.rrule) lines.push(`RRULE:${e.rrule}`);
    lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${esc(e.title)}`, `TRIGGER:${e.allDay ? `-PT${e.alarmMin ?? 15 * 60}M` : `-PT${e.alarmMin ?? 0}M`}`, "END:VALARM", "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
