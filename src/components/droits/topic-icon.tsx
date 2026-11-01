import { Baby, Calendar, FileText, Gift, HandHeart, HardHat, Heart, Landmark, Pill, Syringe, Thermometer, Users } from "lucide-react";
import type { Topic } from "@/lib/droits";

const ICONS = { baby: Baby, heart: Heart, users: Users, file: FileText, syringe: Syringe, gift: Gift, hardhat: HardHat, thermo: Thermometer, calendar: Calendar, landmark: Landmark, hand: HandHeart, pill: Pill };

export function TopicIcon({ icon, className }: { icon: Topic["icon"]; className?: string }) {
  const I = ICONS[icon];
  return <I className={className} aria-hidden />;
}

/** Rendu du gras « **texte** » sans HTML brut. */
export function Rich({ text }: { text: string }) {
  return <>{text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : part))}</>;
}
