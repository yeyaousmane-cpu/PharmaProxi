"use client";
import { Printer } from "lucide-react";

export function PrintButton({ label = "Imprimer ou enregistrer en PDF" }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#068132] px-4 font-semibold text-white hover:bg-[#052D1E] print:hidden">
      <Printer className="size-4" aria-hidden /> {label}
    </button>
  );
}
