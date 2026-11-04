"use client";
import { useEffect } from "react";

/** Compte (anonymement) les appels et les itinéraires lancés depuis une fiche publique. */
export function TrackClicks({ kind, id }: { kind: string; id: string }) {
  useEffect(() => {
    const onClick = (ev: MouseEvent) => {
      const a = (ev.target as HTMLElement | null)?.closest?.("a") as HTMLAnchorElement | null;
      if (!a) return;
      const href = a.getAttribute("href") ?? "";
      const e = href.startsWith("tel:") || href.startsWith("https://wa.me") ? "call" : /maps|itineraire|directions|geo:/.test(href) ? "directions" : null;
      if (!e) return;
      const body = JSON.stringify({ k: kind, id, e });
      try { navigator.sendBeacon?.("/api/evenement", new Blob([body], { type: "application/json" })) || fetch("/api/evenement", { method: "POST", body, keepalive: true, headers: { "content-type": "application/json" } }); } catch { /* sans importance */ }
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [kind, id]);
  return null;
}
