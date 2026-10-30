import { Activity, Apple, Baby, Bug, Dna, HeartHandshake, HeartPulse, Pill, ShieldCheck, Siren, VenusAndMars, type LucideIcon } from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  "heart-handshake": HeartHandshake, "venus-and-mars": VenusAndMars, baby: Baby, dna: Dna, bug: Bug, activity: Activity,
  pill: Pill, siren: Siren, apple: Apple, "shield-check": ShieldCheck, "heart-pulse": HeartPulse,
};
export function HealthIcon({ name, className }: { name: string; className?: string }) {
  const I = ICONS[name] ?? HeartPulse;
  return <I className={className} aria-hidden />;
}
