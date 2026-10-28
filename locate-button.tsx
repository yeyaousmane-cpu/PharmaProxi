"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { LocateFixed, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Ajoute la position de l'utilisateur à l'URL courante ; repli manuel si refus. */
export function LocateButton({ basePath }: { basePath: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div>
      <Button type="button" variant="secondary" disabled={busy}
        onClick={() => {
          setErr(null);
          if (!("geolocation" in navigator)) return setErr("Géolocalisation indisponible : utilisez les filtres région / commune.");
          setBusy(true);
          navigator.geolocation.getCurrentPosition(
            (p) => { setBusy(false); router.push(`${basePath}?lat=${p.coords.latitude.toFixed(5)}&lng=${p.coords.longitude.toFixed(5)}`); },
            () => { setBusy(false); setErr("Position refusée ou indisponible : utilisez les filtres région / commune."); },
            { timeout: 10000, maximumAge: 300000 },
          );
        }}>
        {busy ? <Loader2 className="animate-spin" aria-hidden /> : <LocateFixed aria-hidden />} Autour de moi
      </Button>
      {err ? <p role="alert" className="mt-1 text-sm text-amber-800">{err}</p> : null}
    </div>
  );
}
