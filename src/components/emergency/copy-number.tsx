"use client";
import { useState } from "react";
import { Check, Copy } from "lucide-react";

/** Copie un numéro dans le presse-papiers, avec repli pour les navigateurs sans API Clipboard. */
export function CopyNumber({ value, label, className = "" }: { value: string; label: string; className?: string }) {
  const [done, setDone] = useState<"ok" | "ko" | null>(null);
  async function copy() {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(value);
      else {
        const t = document.createElement("textarea");
        t.value = value; t.setAttribute("readonly", ""); t.style.position = "fixed"; t.style.opacity = "0";
        document.body.appendChild(t); t.select();
        const ok = document.execCommand("copy"); t.remove();
        if (!ok) throw new Error("copy");
      }
      setDone("ok");
    } catch { setDone("ko"); }
    setTimeout(() => setDone(null), 2500);
  }
  return (
    <button type="button" onClick={copy} aria-label={`Copier le numéro ${label}`}
      className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border-2 border-[#068132]/30 bg-white px-3 text-sm font-semibold text-[#052D1E] hover:border-[#068132] ${className}`}>
      {done === "ok" ? <Check className="size-4 text-[#068132]" aria-hidden /> : <Copy className="size-4" aria-hidden />}
      <span aria-live="polite">{done === "ok" ? "Copié" : done === "ko" ? "Copie impossible" : "Copier"}</span>
    </button>
  );
}
