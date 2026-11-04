import Link from "next/link";
import { Activity, Baby, BellRing, FolderHeart, HeartPulse, Lock, Pill } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/ma-sante", label: "Accueil", icon: HeartPulse },
  { href: "/ma-sante/dossier", label: "Mon dossier", icon: FolderHeart },
  { href: "/ma-sante/enfants", label: "Vaccins des enfants", icon: Baby },
  { href: "/ma-sante/traitements", label: "Traitements", icon: Pill },
  { href: "/ma-sante/mesures", label: "Tension, glycémie", icon: Activity },
  { href: "/ma-sante#alertes", label: "Alertes", icon: BellRing },
] as const;

export function SanteNav({ current }: { current: string }) {
  return (
    <nav aria-label="Ma santé" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
      {ITEMS.map(({ href, label, icon: Icon }) => (
        <Link key={href} prefetch={false} href={href} aria-current={current === href ? "page" : undefined}
          className={cn("flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium", current === href ? "border-primary bg-primary text-white" : "bg-white hover:border-primary")}>
          <Icon className="size-4" aria-hidden />{label}{href === "/ma-sante/dossier" && <Lock className="size-3.5 opacity-80" aria-label="protégé" />}
        </Link>
      ))}
    </nav>
  );
}

export const PRIVACY_NOTE = "Visible par vous seul. Rien n'est partagé, ni utilisé pour de la publicité. Tout est effacé si vous supprimez votre compte.";
