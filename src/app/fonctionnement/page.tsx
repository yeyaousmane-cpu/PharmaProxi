import Link from "next/link";
import { HowItWorks } from "@/components/home/how-it-works";
import { FRESHNESS, NOT_LISTED, type Freshness } from "@/lib/freshness";

const PUBLIC_STATUSES: Freshness[] = ["available", "low", "to_confirm", "on_order", "unavailable", "stale"];
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Comment ça marche ?" };

export default function Page() {
  return (
    <div className="container-page max-w-4xl space-y-8 py-8">
      <h1 className="text-2xl font-bold">Comment fonctionne SantéProxi ?</h1>
      <HowItWorks />
      <section>
        <h2 className="text-lg font-bold">Que signifient les indicateurs de disponibilité ?</h2>
        <ul className="mt-3 space-y-3">
          {PUBLIC_STATUSES.map((k) => FRESHNESS[k]).map((f) => (
            <li key={f.label} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
              <Badge className={f.className}>{f.label}</Badge>
              <span className="text-sm text-muted-foreground">{f.hint}</span>
            </li>
          ))}
          <li className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
            <Badge className="border-slate-300 bg-white text-slate-700">{NOT_LISTED.label}</Badge>
            <span className="text-sm text-muted-foreground">{NOT_LISTED.hint}</span>
          </li>
        </ul>
        <p className="mt-3 text-sm text-muted-foreground">
          Chaque indication porte la date et l&apos;heure de la dernière mise à jour par la pharmacie. Un médicament n&apos;est jamais affiché comme disponible si la pharmacie ne l&apos;a pas confirmé dans les dernières 24 heures.
        </p>
      </section>
      <section className="space-y-2 text-sm">
        <h2 className="text-lg font-bold">Réservation et paiement</h2>
        <p>Votre demande n&apos;engage la pharmacie qu&apos;après sa confirmation : le produit vous est alors réservé pendant une durée limitée, à retirer sur place.</p>
        <p>Le paiement se fait directement à la pharmacie. SantéProxi n&apos;encaisse aucun paiement et ne livre pas de médicaments.</p>
        <p>Les médicaments sur ordonnance sont remis par le pharmacien sur présentation de l&apos;ordonnance. Les stupéfiants, psychotropes et produits réservés à l&apos;usage hospitalier ne peuvent pas être réservés en ligne.</p>
        <p><Link prefetch={false} href="/infos/securite" className="font-semibold text-primary underline">Consignes de sécurité</Link></p>
      </section>
    </div>
  );
}
