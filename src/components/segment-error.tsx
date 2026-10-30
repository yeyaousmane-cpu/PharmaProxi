"use client";
import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStaleDeployReload } from "@/lib/stale-deploy";

/**
 * Erreur dans un espace (pharmacien, administration…) : la navigation reste
 * disponible et l'utilisateur peut réessayer sans recharger tout le site.
 */
export function SegmentError({ error, reset, home, label }: { error: Error & { digest?: string }; reset: () => void; home: string; label: string }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  useStaleDeployReload(error);
  const offline = typeof navigator !== "undefined" && !navigator.onLine;
  return (
    <div role="alert" className="mx-auto max-w-lg rounded-2xl border bg-white p-6 text-center">
      <AlertTriangle className="mx-auto size-8 text-amber-600" aria-hidden />
      <h2 className="mt-3 text-lg font-bold">{offline ? "Vous êtes hors connexion" : "Cette page n'a pas pu s'afficher"}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {offline ? "Reconnectez-vous au réseau puis réessayez." : "Le service a peut-être mis trop de temps à répondre. Vos données enregistrées ne sont pas perdues."}
        {error.digest ? <span className="block text-xs">Référence : {error.digest}</span> : null}
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <Button onClick={reset}>Réessayer</Button>
        <Link prefetch={false} href={home} className="inline-flex h-11 items-center rounded-lg border px-4 text-sm font-semibold">{label}</Link>
      </div>
    </div>
  );
}
