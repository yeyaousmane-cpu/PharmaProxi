"use client";
import { useState } from "react";

/** Bloc dépliable qui reste ouvert après un ajout (le message de confirmation ou d'alerte reste visible). */
export function Disclosure({ summary, defaultOpen, className, children }: { summary: React.ReactNode; defaultOpen?: boolean; className?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(Boolean(defaultOpen));
  return (
    <details open={open} onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)} className={className}>
      <summary className="cursor-pointer text-sm font-semibold text-primary">{summary}</summary>
      {open && <div className="mt-3">{children}</div>}
    </details>
  );
}
