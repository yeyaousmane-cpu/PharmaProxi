"use client";
import { useEffect, useState } from "react";
import { CheckCircle2, X } from "lucide-react";

/** Affiche le message de confirmation transmis par le serveur, puis l'efface. */
export function FlashToast({ message }: { message: string | null }) {
  const [shown, setShown] = useState<string | null>(null);
  useEffect(() => {
    if (!message) return;
    setShown(message);
    document.cookie = "pp_flash=; Max-Age=0; path=/; SameSite=Lax";
    const t = setTimeout(() => setShown(null), 6000);
    return () => clearTimeout(t);
  }, [message]);
  if (!shown) return null;
  return (
    <div role="status" aria-live="polite" className="fixed inset-x-0 bottom-20 z-50 flex justify-center px-4 md:bottom-6">
      <div className="flex max-w-md items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 shadow-lg">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p className="font-medium">{shown}</p>
        <button type="button" onClick={() => setShown(null)} className="rounded p-0.5 hover:bg-emerald-100" aria-label="Fermer le message"><X className="size-4" /></button>
      </div>
    </div>
  );
}
