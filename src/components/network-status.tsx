"use client";
import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

/** Bandeau hors connexion + enregistrement du service worker (PWA). */
export function NetworkStatus() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  if (online) return null;
  return (
    <div role="status" className="bg-amber-100 px-4 py-2 text-center text-sm font-medium text-amber-900">
      <WifiOff className="mr-1 inline size-4" aria-hidden />
      Vous êtes hors connexion. Les disponibilités affichées peuvent ne plus être à jour ; aucune action ne sera envoyée tant que le réseau n&apos;est pas revenu.
    </div>
  );
}
