"use client";
import { Printer } from "lucide-react";

export function PrintPdfButton({ label }: { label: string }) {
  return (
    <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white">
      <Printer className="size-4" aria-hidden /> {label}
    </button>
  );
}
