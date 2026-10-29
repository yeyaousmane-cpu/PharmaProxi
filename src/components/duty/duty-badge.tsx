import { Moon } from "lucide-react";
import { TIMEZONE } from "@/lib/format";

export type DutySlot = { starts_at: string; ends_at: string; status: "confirmed" | "declared"; source: string };

const fmt = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", { timeZone: TIMEZONE, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export function dutyRange(s: DutySlot) {
  return `du ${fmt(s.starts_at)} au ${fmt(s.ends_at)}`;
}

/** Garde en cours ou à venir (7 jours) pour une pharmacie. */
export function DutyBadge({ slots }: { slots: DutySlot[] }) {
  if (slots.length === 0) return null;
  const now = Date.now();
  const current = slots.find((s) => new Date(s.starts_at).getTime() <= now);
  const next = slots.find((s) => new Date(s.starts_at).getTime() > now);
  const s = current ?? next!;
  return (
    <p className={`mt-2 flex w-fit flex-wrap items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm ${current ? "border-indigo-200 bg-indigo-50 text-indigo-900" : "bg-white"}`}>
      <Moon className="size-4" aria-hidden />
      <strong>{current ? "De garde en ce moment" : "Prochaine garde"}</strong> {dutyRange(s)}
      <span className="text-xs text-muted-foreground">· {s.status === "confirmed" ? s.source : "déclarée par la pharmacie"}</span>
    </p>
  );
}
