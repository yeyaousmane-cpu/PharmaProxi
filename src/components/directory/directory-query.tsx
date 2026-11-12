"use client";
import { useRef, useState } from "react";
import { VoiceSearch } from "@/components/voice-search";

/** Champ de recherche de l'annuaire, avec dictée vocale quand le navigateur la propose. */
export function DirectoryQuery({ value }: { value?: string }) {
  const [q, setQ] = useState(value ?? "");
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="relative">
      <input ref={ref} id="q" name="q" value={q} onChange={(e) => setQ(e.target.value)} type="search" autoComplete="off" enterKeyHint="search"
        placeholder="Nom, village, quartier… ex. CSCOM de Siby, Point G, Kalaban Coro" className="h-12 w-full rounded-xl border-2 bg-white pe-12 ps-3 text-base" />
      <VoiceSearch className="absolute end-2 top-1/2 -translate-y-1/2" onText={(t) => { setQ(t); setTimeout(() => ref.current?.form?.requestSubmit(), 0); }} />
    </div>
  );
}
