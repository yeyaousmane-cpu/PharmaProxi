import Link from "next/link";
import { ShieldAlert } from "lucide-react";

export const metadata = { title: "Accès refusé" };

export default function Page() {
  return (
    <div className="container-page py-16 text-center">
      <ShieldAlert className="mx-auto size-10 text-destructive" aria-hidden />
      <h1 className="mt-4 text-2xl font-bold">Accès refusé</h1>
      <p className="mt-2 text-muted-foreground">Votre compte ne dispose pas des droits nécessaires pour cet espace.</p>
      <Link prefetch={false} href="/" className="mt-6 inline-block font-semibold text-primary underline">Retour à l&apos;accueil</Link>
    </div>
  );
}
