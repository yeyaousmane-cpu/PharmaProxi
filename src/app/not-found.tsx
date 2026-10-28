import Link from "next/link";

export default function NotFound() {
  return (
    <div className="container-page py-16 text-center">
      <h1 className="text-2xl font-bold">Page introuvable</h1>
      <p className="mt-2 text-muted-foreground">Cette page n&apos;existe pas ou n&apos;est plus disponible.</p>
      <Link prefetch={false} href="/" className="mt-6 inline-block font-semibold text-primary underline">Retour à l&apos;accueil</Link>
    </div>
  );
}
