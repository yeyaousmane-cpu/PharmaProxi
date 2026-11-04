import Link from "next/link";
import { Droplet, FolderHeart, MessageCircleQuestion, Moon, Search, ShieldAlert, Siren, HeartPulse } from "lucide-react";
import { SearchBar } from "@/components/search-bar";
import { AudioGuide } from "@/components/audio/audio-guide";
import { SimpleToggle } from "./simple-toggle";
import type { GeoData } from "@/lib/geo";

const TILES = [
  { href: "/recherche", label: "Trouver un médicament", icon: Search, tone: "bg-primary text-white" },
  { href: "/garde", label: "Pharmacie de garde", icon: Moon, tone: "bg-brand-deep text-white" },
  { href: "/urgences", label: "Urgences", icon: Siren, tone: "bg-red-700 text-white" },
  { href: "/premiers-secours", label: "Premiers secours", icon: HeartPulse, tone: "bg-red-50 text-red-800 border border-red-200" },
  { href: "/questions-pharmacien", label: "Poser une question à un pharmacien", icon: MessageCircleQuestion, tone: "bg-brand-mint text-brand-deep" },
  { href: "/ma-sante/dossier", label: "Mon dossier santé", icon: FolderHeart, tone: "bg-brand-mint text-brand-deep" },
  { href: "/don-de-sang", label: "Don de sang", icon: Droplet, tone: "bg-red-50 text-red-800 border border-red-200" },
  { href: "/signaler", label: "Signaler un médicament suspect", icon: ShieldAlert, tone: "bg-amber-50 text-amber-900 border border-amber-200" },
];

export function SimpleHome({ geo }: { geo: GeoData }) {
  return (
    <div className="container-page max-w-3xl space-y-5 py-6">
      <section className="space-y-3 rounded-2xl border bg-white p-4">
        <h1 className="text-2xl font-bold text-brand-deep">Quel médicament cherchez-vous ?</h1>
        <SearchBar geo={geo} large />
        <AudioGuide target="accueil" />
      </section>
      <ul className="grid grid-cols-2 gap-3">
        {TILES.map(({ href, label, icon: Icon, tone }) => (
          <li key={href}>
            <Link prefetch={false} href={href} className={`flex min-h-32 flex-col items-center justify-center gap-2 rounded-2xl p-4 text-center text-lg font-bold leading-tight shadow-sm ${tone}`}>
              <Icon className="size-10" aria-hidden />{label}
            </Link>
          </li>
        ))}
      </ul>
      <SimpleToggle on className="text-center" />
    </div>
  );
}
