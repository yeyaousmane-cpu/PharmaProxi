"use client";
import { Printer } from "lucide-react";
export function PrintButton() {
  return <button type="button" onClick={() => window.print()} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#052D1E] px-4 font-semibold text-white"><Printer className="size-4" aria-hidden /> Imprimer ou enregistrer en PDF</button>;
}
