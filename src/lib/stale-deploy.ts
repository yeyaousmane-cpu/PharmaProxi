"use client";
import { useEffect } from "react";

/** Erreur due à une page chargée avant une mise à jour du site (formulaire ou fichier d'une ancienne version). */
export const isStaleDeploy = (e: unknown) =>
  /Server Action|older or newer deployment|ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module/i.test(String((e as Error)?.message ?? e));

/** Recharge la page une seule fois (par minute) pour récupérer la nouvelle version du site. */
export function useStaleDeployReload(error: unknown) {
  useEffect(() => {
    if (!isStaleDeploy(error)) return;
    try {
      const last = Number(sessionStorage.getItem("pp_stale_reload") ?? 0);
      if (Date.now() - last < 60_000) return;
      sessionStorage.setItem("pp_stale_reload", String(Date.now()));
    } catch { /* stockage indisponible : on recharge quand même une fois */ }
    window.location.reload();
  }, [error]);
}
