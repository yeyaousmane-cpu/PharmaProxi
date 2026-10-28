import Link from "next/link";
import { HowItWorks } from "@/components/home/how-it-works";
import { FRESHNESS } from "@/lib/freshness";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Comment ça marche ?" };

export default function Page() {
  return (
    <div className="container-page max-w-4xl space-y-8 py-8">
      <h1 className="text-2xl font-bold">Comment fonctionne PharmaProxi ?</h1>
      <HowItWorks />
      <section>
        <h2 className="text-lg font-bold">Que signifient les indicateurs de disponibilité ?</h2>
        <ul className="mt-3 space-y-3">
          {Object.values(FRESHNESS).map((f) => (
            <li key={f.label} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
              <Badge className={f.className}>{f.label}</Badge>
              <span className="text-sm text-muted-foreground">{f.hint}</span>
            </li>
          ))}
        </ul>
      </section>
      <section className="space-y-2 text-sm">
        <h2 className="text-lg font-bold">Réservation, paiement et livraison</h2>
        <p>Votre demande n&apos;engage la pharmacie qu&apos;après sa confirmation : le produit vous est alors réservé pendant une durée limitée.</p>
        <p>Le paiement se fait directement à la pharmacie (ou au livreur lorsque la livraison est disponible). PharmaProxi n&apos;encaisse aucun paiement.</p>
        <p>La livraison n&apos;est proposée que pour les catégories de produits autorisées, par des livreurs vérifiés, et jamais pour les médicaments sur ordonnance.</p>
        <p><Link prefetch={false} href="/infos/securite" className="font-semibold text-primary underline">Consignes de sécurité</Link></p>
      </section>
    </div>
  );
}
