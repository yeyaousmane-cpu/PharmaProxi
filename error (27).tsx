"use client";
import { Button } from "@/components/ui/button";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="container-page py-16 text-center">
      <h1 className="text-2xl font-bold">Un problème est survenu</h1>
      <p className="mt-2 text-muted-foreground">Vérifiez votre connexion puis réessayez. Si le problème persiste, contactez-nous.</p>
      <Button className="mt-6" onClick={reset}>Réessayer</Button>
    </div>
  );
}
