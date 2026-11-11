import { Droplet } from "lucide-react";
import { BADGE_STYLE, CARD_NOTICE, type Badge } from "@/lib/donor";
import { formatDate } from "@/lib/format";

/** Carte numérique de donneur (affichage écran). Le QR code ne contient qu'un lien avec jeton aléatoire. */
export function DonorCard({ name, code, group, groupVerified, count, badge, since, lastDonation, qrSvg }:
  { name: string | null; code: string; group: string | null; groupVerified: boolean; count: number; badge: Badge; since: string; lastDonation: string | null; qrSvg: string }) {
  return (
    <figure className="w-full max-w-md">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#7f1d1d] via-[#b91c1c] to-[#052D1E] p-5 text-white shadow-lg" data-testid="donor-card">
        <div className="pointer-events-none absolute -end-10 -top-10 size-40 rounded-full bg-white/10" aria-hidden />
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-white/80">SantéProxi Solidaire</p>
            <p className="text-lg font-extrabold">Carte de donneur volontaire</p>
          </div>
          <Droplet className="size-8 shrink-0 fill-white/90 text-white/90" aria-hidden />
        </div>
        <div className="mt-4 flex items-end justify-between gap-3">
          <dl className="min-w-0 space-y-1.5 text-sm">
            <div><dt className="text-[11px] uppercase text-white/70">Donneur</dt><dd className="truncate text-base font-bold">{name ?? "Nom masqué"}</dd></div>
            <div className="flex gap-5">
              <div><dt className="text-[11px] uppercase text-white/70">Groupe</dt><dd className="text-2xl font-black leading-none">{group && groupVerified ? group : "—"}</dd></div>
              <div><dt className="text-[11px] uppercase text-white/70">Dons validés</dt><dd className="text-2xl font-black leading-none">{count}</dd></div>
            </div>
            <div><dt className="text-[11px] uppercase text-white/70">Identifiant</dt><dd className="font-mono font-semibold" dir="ltr">{code}</dd></div>
          </dl>
          <div className="shrink-0 rounded-xl bg-white p-1.5 [&_svg]:size-24" aria-label="QR code de vérification de la carte" role="img" dangerouslySetInnerHTML={{ __html: qrSvg }} />
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs">
          {badge ? <span className={`rounded-full bg-gradient-to-r px-3 py-1 font-bold ${BADGE_STYLE[badge.code] ?? "from-white to-white text-red-900"}`}>{badge.label}</span> : <span className="rounded-full bg-white/15 px-3 py-1">Premier don à valider</span>}
          <span className="text-white/80">Membre depuis le {formatDate(since)}{lastDonation ? ` · dernier don le ${formatDate(lastDonation)}` : ""}</span>
        </div>
      </div>
      <figcaption className="mt-2 text-xs text-muted-foreground">{CARD_NOTICE}{group && !groupVerified ? " Votre groupe n'apparaît qu'une fois confirmé par un centre de collecte." : ""}</figcaption>
    </figure>
  );
}
