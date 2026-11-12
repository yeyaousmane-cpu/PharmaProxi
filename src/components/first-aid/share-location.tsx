"use client";
import { useState } from "react";
import { LocateFixed } from "lucide-react";

/** Affiche la position du téléphone pour la dicter aux secours. Rien n'est envoyé ni enregistré par SantéProxi. */
export function ShareLocation() {
  const [pos, setPos] = useState<{ lat: number; lng: number; acc: number } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const locate = () => {
    if (!("geolocation" in navigator)) return setMsg("La localisation n'est pas disponible sur ce téléphone : décrivez un repère connu (mosquée, école, marché, carrefour).");
    setMsg("Recherche de votre position…");
    navigator.geolocation.getCurrentPosition(
      (p) => { setPos({ lat: p.coords.latitude, lng: p.coords.longitude, acc: Math.round(p.coords.accuracy) }); setMsg(null); },
      () => setMsg("Position introuvable (autorisation refusée ou pas de signal) : décrivez un repère connu (mosquée, école, marché, carrefour)."),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
  };
  const text = pos ? `Ma position : latitude ${pos.lat.toFixed(5)}, longitude ${pos.lng.toFixed(5)} (précision environ ${pos.acc} m)` : "";
  return (
    <div className="space-y-2">
      <button type="button" onClick={locate} className="inline-flex min-h-11 items-center gap-2 rounded-xl border-2 border-red-700 bg-white px-4 font-semibold text-red-800"><LocateFixed className="size-4" aria-hidden /> Afficher ma position à dicter</button>
      {msg && <p className="text-sm" role="status">{msg}</p>}
      {pos && (
        <div className="space-y-1 rounded-xl bg-white p-3 text-sm" role="status">
          <p className="font-mono text-base font-bold">{pos.lat.toFixed(5)}, {pos.lng.toFixed(5)}</p>
          <p className="text-xs text-muted-foreground">Précision : environ {pos.acc} m. Donnez aussi un repère connu. Cette position n&apos;est ni envoyée ni enregistrée par SantéProxi.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => navigator.clipboard?.writeText(text).then(() => setMsg("Position copiée : collez-la dans un SMS ou WhatsApp."), () => setMsg(null))} className="rounded-lg border px-3 py-1.5 text-xs font-semibold">Copier</button>
            <a href={`sms:?body=${encodeURIComponent(text)}`} className="rounded-lg border px-3 py-1.5 text-xs font-semibold">Envoyer par SMS</a>
          </div>
        </div>
      )}
    </div>
  );
}
