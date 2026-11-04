"use client";
import { useEffect } from "react";
import { signOutIdle } from "@/app/actions/security";

/** Déconnexion automatique après une période sans activité (espaces professionnels et sensibles). */
export function IdleLogout({ minutes = 30 }: { minutes?: number }) {
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const reset = () => { clearTimeout(t); t = setTimeout(() => { void signOutIdle(window.location.pathname); }, minutes * 60_000); };
    const ev = ["mousemove", "keydown", "touchstart", "scroll", "click"] as const;
    ev.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => { clearTimeout(t); ev.forEach((e) => window.removeEventListener(e, reset)); };
  }, [minutes]);
  return null;
}
