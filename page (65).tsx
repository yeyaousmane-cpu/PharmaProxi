import Link from "next/link";
import { WifiOff } from "lucide-react";

export const metadata = { title: "Hors connexion" };
export const dynamic = "force-static";

export default function Offline() {
  return (
    <div className="container-page py-16 text-center">
      <WifiOff className="mx-auto size-10 text-muted-foreground" aria-hidden />
      <h1 className="mt-4 text-2xl font-bold">Vous êtes hors connexion</h1>
      <p className="mx-auto mt-2 max-w-md text-muted-foreground">
        PharmaProxi a besoin du réseau pour afficher les disponibilités à jour. Par sécurité, aucune information de stock
        n&apos;est conservée hors ligne. Réessayez dès que la connexion revient.
      </p>
      <Link prefetch={false} href="/" className="mt-6 inline-block font-semibold text-primary underline">Réessayer</Link>
    </div>
  );
}
