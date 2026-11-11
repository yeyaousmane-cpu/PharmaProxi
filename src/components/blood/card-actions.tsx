"use client";
import { useState } from "react";
import { Download, Share2 } from "lucide-react";

/** Télécharger la carte (avec ou sans groupe) et la partager (toujours sans groupe sanguin). */
export function CardActions({ hasGroup }: { hasGroup: boolean }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [withGroup, setWithGroup] = useState(false);
  const share = async () => {
    setMsg(null);
    try {
      const res = await fetch("/don-de-sang/mon-espace/carte?partage=1");
      if (!res.ok) throw new Error();
      const file = new File([await res.blob()], "carte-donneur-santeproxi.png", { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "Je suis donneur de sang", text: "Je donne mon sang avec SantéProxi Solidaire. Et vous ? https://santeproxi.vercel.app/don-de-sang" });
      } else {
        const a = document.createElement("a"); a.href = URL.createObjectURL(file); a.download = file.name; a.click();
        setMsg("Votre appareil ne permet pas le partage direct : l'image a été téléchargée, vous pouvez l'envoyer vous-même.");
      }
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") setMsg("Partage impossible pour le moment. Vérifiez votre connexion et réessayez.");
    }
  };
  return (
    <div className="space-y-2">
      {hasGroup && (
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4" checked={withGroup} onChange={(e) => setWithGroup(e.target.checked)} /> Faire figurer mon groupe sanguin sur l&apos;image téléchargée</label>
      )}
      <div className="flex flex-wrap gap-2">
        <a href={`/don-de-sang/mon-espace/carte${withGroup ? "?groupe=1" : ""}`} download="carte-donneur-santeproxi.png" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#052D1E] px-4 font-semibold text-white hover:bg-[#068132]"><Download className="size-4" aria-hidden /> Télécharger la carte</a>
        <button type="button" onClick={share} className="inline-flex min-h-11 items-center gap-2 rounded-xl border-2 px-4 font-semibold text-[#052D1E]"><Share2 className="size-4" aria-hidden /> Partager (sans groupe sanguin)</button>
      </div>
      {msg && <p role="status" className="text-sm text-muted-foreground">{msg}</p>}
    </div>
  );
}
