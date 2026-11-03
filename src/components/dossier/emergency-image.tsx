"use client";
import { useState } from "react";
import { Download, Share2 } from "lucide-react";

export type EmergencyData = { name: string; blood: string | null; allergies: string[]; conditions: string[]; contact: string | null; phone: string | null; lang?: "fr" };

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (ctx.measureText(t).width > maxWidth && line) { lines.push(line); line = w; } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}

/** Dessine la fiche d'urgence au format fond d'écran (1080 × 1920), entièrement sur le téléphone : rien n'est envoyé. */
function draw(d: EmergencyData, show: { conditions: boolean; name: boolean }) {
  const c = document.createElement("canvas");
  c.width = 1080; c.height = 1920;
  const x = c.getContext("2d")!;
  x.fillStyle = "#052D1E"; x.fillRect(0, 0, 1080, 1920);
  // Le haut de l'écran reste libre pour l'heure du téléphone
  const top = 760;
  x.fillStyle = "#FFFFFF";
  x.beginPath(); x.roundRect(60, top, 960, 1080, 48); x.fill();
  x.fillStyle = "#C62828"; x.beginPath(); x.roundRect(60, top, 960, 150, [48, 48, 0, 0]); x.fill();
  x.fillStyle = "#FFFFFF"; x.font = "bold 64px Arial, sans-serif"; x.textBaseline = "middle";
  x.fillText("+ URGENCE MÉDICALE", 110, top + 75);
  let y = top + 220;
  const row = (label: string, value: string, color = "#1B2B22", size = 54) => {
    x.fillStyle = "#5B6B63"; x.font = "34px Arial, sans-serif"; x.fillText(label, 110, y); y += 58;
    x.fillStyle = color; x.font = `bold ${size}px Arial, sans-serif`;
    for (const l of wrap(x, value, 860).slice(0, 3)) { x.fillText(l, 110, y); y += size + 12; }
    y += 26;
  };
  if (show.name && d.name) row("Nom", d.name, "#1B2B22", 50);
  row("Groupe sanguin", d.blood ?? "Inconnu", "#C62828", 72);
  row("Allergies graves", d.allergies.length ? d.allergies.join(", ") : "Aucune connue", d.allergies.length ? "#C62828" : "#1B2B22");
  if (show.conditions && d.conditions.length) row("Maladies", d.conditions.join(", "), "#1B2B22", 46);
  if (d.phone) row(`Prévenir${d.contact ? ` : ${d.contact}` : ""}`, d.phone, "#068132", 56);
  x.fillStyle = "#A9DDB8"; x.font = "30px Arial, sans-serif";
  x.fillText("Informations déclarées par la personne · PharmaProxi", 110, 1880);
  return c;
}

export function EmergencyImage({ data }: { data: EmergencyData }) {
  const [show, setShow] = useState({ conditions: true, name: true });
  const [msg, setMsg] = useState("");
  const file = () => new Promise<Blob>((res) => draw(data, show).toBlob((b) => res(b!), "image/png"));
  async function download() {
    const url = URL.createObjectURL(await file());
    const a = document.createElement("a");
    a.href = url; a.download = "fiche-urgence.png"; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    setMsg("Image enregistrée. Ouvrez-la dans votre galerie puis « Définir comme fond d'écran » (écran verrouillé).");
  }
  async function share() {
    const f = new File([await file()], "fiche-urgence.png", { type: "image/png" });
    if (navigator.canShare?.({ files: [f] })) await navigator.share({ files: [f], title: "Fiche d'urgence" }).catch(() => {});
    else await download();
  }
  return (
    <div className="space-y-3">
      <fieldset className="space-y-1 text-sm">
        <legend className="font-semibold">Sur l&apos;image</legend>
        <label className="flex items-center gap-2"><input type="checkbox" className="size-4" checked={show.name} onChange={(e) => setShow({ ...show, name: e.target.checked })} /> Afficher mon nom</label>
        <label className="flex items-center gap-2"><input type="checkbox" className="size-4" checked={show.conditions} onChange={(e) => setShow({ ...show, conditions: e.target.checked })} /> Afficher mes maladies</label>
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={download} className="inline-flex items-center gap-1.5 rounded-xl bg-red-700 px-4 py-2.5 text-sm font-semibold text-white"><Download className="size-4" aria-hidden /> Enregistrer l&apos;image</button>
        <button type="button" onClick={share} className="inline-flex items-center gap-1.5 rounded-xl border px-4 py-2.5 text-sm font-semibold"><Share2 className="size-4" aria-hidden /> Partager</button>
      </div>
      {msg && <p role="status" className="text-sm text-primary">{msg}</p>}
      <p className="text-xs text-muted-foreground">L&apos;image est fabriquée sur votre téléphone : rien n&apos;est envoyé. Attention : un fond d&apos;écran verrouillé est visible par toute personne qui voit votre téléphone. N&apos;y mettez que ce que vous acceptez de montrer.</p>
    </div>
  );
}
