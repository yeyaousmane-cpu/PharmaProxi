"use client";
import { Button } from "@/components/ui/button";
import { isStaleDeploy, useStaleDeployReload } from "@/lib/stale-deploy";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  useStaleDeployReload(error);
  const stale = isStaleDeploy(error);
  return (
    <div className="container-page py-16 text-center">
      <h1 className="text-2xl font-bold">{stale ? "Le site vient d'être mis à jour" : "Un problème est survenu"}</h1>
      <p className="mt-2 text-muted-foreground">{stale ? "Rechargement de la page… Si rien ne se passe, touchez le bouton ci-dessous puis refaites votre action." : "Vérifiez votre connexion puis réessayez. Si le problème persiste, contactez-nous."}</p>
      <Button className="mt-6" onClick={() => (stale ? window.location.reload() : reset())}>{stale ? "Recharger la page" : "Réessayer"}</Button>
    </div>
  );
}
