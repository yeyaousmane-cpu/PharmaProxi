"use client";
import { useEffect, useState } from "react";
import { History, Phone } from "lucide-react";
import { clearRecent, readRecent, type RecentItem } from "./recent";

const KIND: Record<RecentItem["kind"], string> = { pharmacie: "Pharmacie", medecin: "Médecin", etablissement: "Établissement" };

function prettyPhone(p: string) {
  const d = p.replace(/^\+223/, "").replace(/\D/g, "");
  return d.length === 8 ? d.replace(/(\d{2})(?=\d)/g, "$1 ").trim() : p;
}

/** Liste des coordonnées consultées récemment (fonctionne hors connexion). */
export function RecentList({ title = "Consultés récemment", emptyHidden = false }: { title?: string; emptyHidden?: boolean }) {
  const [items, setItems] = useState<RecentItem[] | null>(null);
  useEffect(() => setItems(readRecent()), []);
  if (items === null) return null;
  if (items.length === 0) {
    return emptyHidden ? null : <p className="text-sm text-muted-foreground">Les pharmacies et médecins que vous consultez apparaîtront ici, même sans connexion.</p>;
  }
  return (
    <section aria-labelledby="recent-seen" className="space-y-2 text-left">
      <div className="flex items-center justify-between gap-2">
        <h2 id="recent-seen" className="flex items-center gap-2 text-lg font-bold"><History className="size-5 text-muted-foreground" aria-hidden /> {title}</h2>
        <button type="button" className="text-xs text-muted-foreground underline" onClick={() => { clearRecent(); setItems([]); }}>Effacer</button>
      </div>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((i) => (
          <li key={`${i.kind}-${i.id}`} className="flex min-w-0 items-center justify-between gap-3 rounded-xl border bg-white p-3">
            <a href={i.href} className="min-w-0">
              <span className="block text-xs text-muted-foreground">{KIND[i.kind] ?? ""}</span>
              <span className="block truncate font-semibold hover:underline">{i.name}</span>
              {i.place && <span className="block truncate text-xs text-muted-foreground">{i.place}</span>}
            </a>
            {i.phone && (
              <a href={`tel:${i.phone}`} className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg border px-3 text-sm font-medium hover:bg-muted" aria-label={`Appeler ${i.name}`}>
                <Phone className="size-4" aria-hidden /> {prettyPhone(i.phone)}
              </a>
            )}
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">Gardé uniquement sur ce téléphone. Les stocks ne sont jamais conservés hors ligne : appelez avant de vous déplacer.</p>
    </section>
  );
}
