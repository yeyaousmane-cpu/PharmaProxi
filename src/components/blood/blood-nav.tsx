import Link from "next/link";
import { cn } from "@/lib/utils";

const ITEMS = [["/don-de-sang", "Don de sang"], ["/don-de-sang/sos", "SOS Besoin de sang"], ["/don-de-sang/collectes", "Collectes"], ["/don-de-sang/mon-espace", "Mon espace donneur"], ["/don-de-sang/rendez-vous", "Rendez-vous"],
  ["/don-de-sang/disponibilites", "Besoins des centres"], ["/don-de-sang/suis-je-apte", "Suis-je apte ?"],
  ["/don-de-sang/apres-le-don", "Après le don"], ["/don-de-sang/passeport", "Mon passeport solidaire"], ["/don-de-sang/groupes-rares", "Groupes rares"], ["/don-de-sang/observatoire", "Observatoire"]] as const;

/** Navigation de SantéProxi Solidaire (les espaces institutionnels n'apparaissent qu'aux personnes habilitées). */
export function BloodNav({ current, validator = false }: { current: string; validator?: boolean }) {
  const items: (readonly [string, string])[] = validator ? [...ITEMS, ["/don-de-sang/validation", "Espace CNTS"]] : [...ITEMS];
  return (
    <nav aria-label="SantéProxi Solidaire" className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 text-sm">
      {items.map(([h, l]) => <Link key={h} prefetch={false} href={h} aria-current={h === current ? "page" : undefined}
        className={cn("shrink-0 rounded-full border px-3 py-1.5 font-medium", h === current ? "border-red-600 bg-red-600 text-white" : "bg-white hover:border-red-400")}>{l}</Link>)}
    </nav>
  );
}
