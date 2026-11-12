"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import dicomParser from "dicom-parser";
import { Download, RotateCcw, ZoomIn, ZoomOut, Contrast } from "lucide-react";

type Info = { modality?: string; studyDate?: string; bodyPart?: string; description?: string; rows: number; cols: number; frames: number; syntax: string };
type Frame = { kind: "gray"; data: Float32Array; min: number; max: number; mono1: boolean } | { kind: "rgb"; data: Uint8ClampedArray } | { kind: "jpeg"; url: string };

const UNCOMPRESSED = ["1.2.840.10008.1.2", "1.2.840.10008.1.2.1", "1.2.840.10008.1.2.2"];
const JPEG_BASELINE = ["1.2.840.10008.1.2.4.50"];
const SYNTAX_LABEL: Record<string, string> = {
  "1.2.840.10008.1.2": "non compressé (implicite)", "1.2.840.10008.1.2.1": "non compressé", "1.2.840.10008.1.2.2": "non compressé (gros-boutiste)",
  "1.2.840.10008.1.2.4.50": "JPEG de base", "1.2.840.10008.1.2.4.70": "JPEG sans perte", "1.2.840.10008.1.2.4.90": "JPEG 2000 sans perte", "1.2.840.10008.1.2.4.91": "JPEG 2000", "1.2.840.10008.1.2.5": "RLE",
};

function fmtDate(d?: string) { return d && /^\d{8}$/.test(d) ? `${d.slice(6, 8)}/${d.slice(4, 6)}/${d.slice(0, 4)}` : undefined; }

/** Lit un fichier DICOM : formats non compressés et JPEG de base. Les autres compressions sont signalées honnêtement. */
function parse(bytes: Uint8Array): { info: Info; frame: (i: number) => Frame; wc?: number; ww?: number } {
  const ds = dicomParser.parseDicom(bytes);
  const syntax = ds.string("x00020010") ?? "1.2.840.10008.1.2";
  const rows = ds.uint16("x00280010") ?? 0, cols = ds.uint16("x00280011") ?? 0;
  const frames = Math.max(1, parseInt(ds.string("x00280008") ?? "1", 10) || 1);
  const info: Info = { modality: ds.string("x00080060"), studyDate: fmtDate(ds.string("x00080020")), bodyPart: ds.string("x00180015"), description: ds.string("x00081030"), rows, cols, frames, syntax };
  const px = ds.elements.x7fe00010;
  if (!px || !rows || !cols) throw new Error("Ce fichier DICOM ne contient pas d'image affichable (compte rendu ou structure seulement).");
  const spp = ds.uint16("x00280002") ?? 1, bits = ds.uint16("x00280100") ?? 16, signed = ds.uint16("x00280103") === 1;
  const photometric = (ds.string("x00280004") ?? "MONOCHROME2").trim(), planar = ds.uint16("x00280006") ?? 0;
  const slope = ds.floatString("x00281053") ?? 1, intercept = ds.floatString("x00281052") ?? 0;
  const wc = ds.floatString("x00281050", 0), ww = ds.floatString("x00281051", 0);
  const n = rows * cols;
  if (JPEG_BASELINE.includes(syntax)) {
    return { info, frame: (i) => {
      const jpeg = dicomParser.readEncapsulatedImageFrame(ds, px, i, px.basicOffsetTable?.length ? undefined : dicomParser.createJPEGBasicOffsetTable(ds, px));
      return { kind: "jpeg", url: URL.createObjectURL(new Blob([new Uint8Array(jpeg)], { type: "image/jpeg" })) };
    } };
  }
  if (!UNCOMPRESSED.includes(syntax)) throw new Error(`Compression « ${SYNTAX_LABEL[syntax] ?? syntax} » non lisible dans le navigateur : téléchargez le fichier pour l'ouvrir dans un logiciel d'imagerie.`);
  const bigEndian = syntax === "1.2.840.10008.1.2.2";
  const frameBytes = n * spp * (bits / 8);
  return { info, wc, ww, frame: (i) => {
    const off = px.dataOffset + i * frameBytes;
    const raw = bytes.slice(off, off + frameBytes);
    if (spp === 3) {
      const out = new Uint8ClampedArray(n * 4);
      for (let p = 0; p < n; p++) {
        const [r, g, b] = planar === 1 ? [raw[p], raw[p + n], raw[p + 2 * n]] : [raw[3 * p], raw[3 * p + 1], raw[3 * p + 2]];
        out.set([r, g, b, 255], 4 * p);
      }
      return { kind: "rgb", data: out };
    }
    const dv = new DataView(raw.buffer);
    const data = new Float32Array(n); let min = Infinity, max = -Infinity;
    for (let p = 0; p < n; p++) {
      const v = bits === 8 ? (signed ? dv.getInt8(p) : dv.getUint8(p)) : signed ? dv.getInt16(2 * p, !bigEndian) : dv.getUint16(2 * p, !bigEndian);
      const m = v * slope + intercept; data[p] = m; if (m < min) min = m; if (m > max) max = m;
    }
    return { kind: "gray", data, min, max, mono1: photometric === "MONOCHROME1" };
  } };
}

export function ImagingViewer({ src, mime, title, diagnosticNotice = true }: { src: string; mime: string; title: string; diagnosticNotice?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<{ status: "loading" } | { status: "error"; message: string } | { status: "ready"; parsed?: ReturnType<typeof parse>; objectUrl?: string }>({ status: "loading" });
  const [frameIdx, setFrameIdx] = useState(0);
  const [frame, setFrame] = useState<Frame | null>(null);
  const [win, setWin] = useState<{ c: number; w: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [invert, setInvert] = useState(false);

  useEffect(() => {
    let alive = true; let url: string | undefined;
    fetch(src, { credentials: "same-origin", cache: "no-store" }).then(async (r) => {
      if (!r.ok) throw new Error(r.status === 403 ? "Accès expiré ou retiré par le patient." : "Fichier indisponible.");
      const buf = new Uint8Array(await r.arrayBuffer());
      if (!alive) return;
      if (mime === "application/dicom") setState({ status: "ready", parsed: parse(buf) });
      else { url = URL.createObjectURL(new Blob([buf], { type: mime })); setState({ status: "ready", objectUrl: url }); }
    }).catch((e: Error) => alive && setState({ status: "error", message: e.message || "Lecture impossible." }));
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [src, mime]);

  const parsed = state.status === "ready" ? state.parsed : undefined;
  useEffect(() => {
    if (!parsed) return;
    try {
      const f = parsed.frame(frameIdx); setFrame(f);
      if (f.kind === "gray") setWin((w) => w ?? { c: parsed.wc ?? (f.min + f.max) / 2, w: Math.max(1, parsed.ww ?? f.max - f.min) });
      return () => { if (f.kind === "jpeg") URL.revokeObjectURL(f.url); };
    } catch (e) { setState({ status: "error", message: (e as Error).message }); }
  }, [parsed, frameIdx]);

  useEffect(() => {
    const cv = canvas.current; if (!cv || !parsed || !frame || frame.kind === "jpeg") return;
    const { rows, cols } = parsed.info; cv.width = cols; cv.height = rows;
    const ctx = cv.getContext("2d"); if (!ctx) return;
    const img = ctx.createImageData(cols, rows);
    if (frame.kind === "rgb") img.data.set(frame.data);
    else if (win) {
      const lo = win.c - win.w / 2, k = 255 / win.w; const flip = frame.mono1 !== invert;
      for (let p = 0; p < frame.data.length; p++) {
        let g = Math.max(0, Math.min(255, (frame.data[p] - lo) * k)); if (flip) g = 255 - g;
        img.data[4 * p] = img.data[4 * p + 1] = img.data[4 * p + 2] = g; img.data[4 * p + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }, [parsed, frame, win, invert]);

  const range = useMemo(() => (frame?.kind === "gray" ? { min: frame.min, max: frame.max, span: Math.max(1, frame.max - frame.min) } : null), [frame]);
  const reset = () => { setZoom(1); setInvert(false); if (parsed && range) setWin({ c: parsed.wc ?? (range.min + range.max) / 2, w: parsed.ww ?? range.span }); };
  const filter = invert && frame?.kind !== "gray" ? "invert(1)" : undefined;

  if (state.status === "loading") return <p role="status" className="rounded-xl border bg-white p-4 text-sm">Ouverture de l&apos;examen…</p>;
  if (state.status === "error") return (
    <div role="alert" className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
      <p>{state.message}</p>
      <a href={src} download={`${title}.dcm`} className="inline-flex items-center gap-1 font-semibold underline"><Download className="size-4" aria-hidden /> Télécharger le fichier d&apos;origine</a>
    </div>
  );
  if (mime === "application/pdf") return <iframe src={state.objectUrl} title={title} className="h-[75vh] w-full rounded-xl border bg-white" />;
  const btn = "inline-flex min-h-11 items-center gap-1 rounded-lg border bg-white px-3 text-sm font-semibold hover:bg-muted";
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Outils de lecture">
        <button type="button" className={btn} onClick={() => setZoom((z) => Math.min(6, z * 1.25))}><ZoomIn className="size-4" aria-hidden /> Agrandir</button>
        <button type="button" className={btn} onClick={() => setZoom((z) => Math.max(0.25, z / 1.25))}><ZoomOut className="size-4" aria-hidden /> Réduire</button>
        <button type="button" className={btn} aria-pressed={invert} onClick={() => setInvert((v) => !v)}><Contrast className="size-4" aria-hidden /> Inverser</button>
        <button type="button" className={btn} onClick={reset}><RotateCcw className="size-4" aria-hidden /> Réinitialiser</button>
        <a href={src} download={parsed ? `${title}.dcm` : title} className={btn}><Download className="size-4" aria-hidden /> Fichier d&apos;origine</a>
      </div>
      {range && win ? (
        <div className="grid gap-3 rounded-xl border bg-white p-3 text-sm sm:grid-cols-2">
          <label className="grid gap-1">Luminosité (centre de fenêtre : {Math.round(win.c)})
            <input type="range" min={Math.floor(range.min)} max={Math.ceil(range.max)} value={win.c} onChange={(e) => setWin({ ...win, c: Number(e.target.value) })} /></label>
          <label className="grid gap-1">Contraste (largeur de fenêtre : {Math.round(win.w)})
            <input type="range" min={1} max={Math.ceil(range.span * 2)} value={win.w} onChange={(e) => setWin({ ...win, w: Number(e.target.value) })} /></label>
        </div>
      ) : null}
      {parsed && parsed.info.frames > 1 ? (
        <label className="grid gap-1 rounded-xl border bg-white p-3 text-sm">Image {frameIdx + 1} sur {parsed.info.frames}
          <input type="range" min={0} max={parsed.info.frames - 1} value={frameIdx} onChange={(e) => setFrameIdx(Number(e.target.value))} /></label>
      ) : null}
      <div className="overflow-auto rounded-xl bg-black p-2" style={{ maxHeight: "75vh" }}>
        <div style={{ transform: `scale(${zoom})`, transformOrigin: "top left", width: "fit-content" }}>
          {frame?.kind === "gray" || frame?.kind === "rgb"
            ? <canvas ref={canvas} role="img" aria-label={`Image de l'examen : ${title}`} className="max-w-full" style={{ filter, imageRendering: zoom > 1.5 ? "pixelated" : undefined }} />
            // eslint-disable-next-line @next/next/no-img-element
            : <img src={frame?.kind === "jpeg" ? frame.url : state.objectUrl} alt={`Image de l'examen : ${title}`} className="max-w-full" style={{ filter }} />}
        </div>
      </div>
      {parsed ? (
        <dl className="grid gap-x-4 gap-y-1 rounded-xl border bg-white p-3 text-xs sm:grid-cols-3">
          {parsed.info.modality ? <div><dt className="text-muted-foreground">Modalité (fichier)</dt><dd className="font-semibold">{parsed.info.modality}</dd></div> : null}
          {parsed.info.studyDate ? <div><dt className="text-muted-foreground">Date de l&apos;examen (fichier)</dt><dd className="font-semibold">{parsed.info.studyDate}</dd></div> : null}
          {parsed.info.bodyPart ? <div><dt className="text-muted-foreground">Région (fichier)</dt><dd className="font-semibold">{parsed.info.bodyPart}</dd></div> : null}
          {parsed.info.description ? <div><dt className="text-muted-foreground">Description (fichier)</dt><dd className="font-semibold">{parsed.info.description}</dd></div> : null}
          <div><dt className="text-muted-foreground">Taille</dt><dd className="font-semibold">{parsed.info.cols} × {parsed.info.rows} px</dd></div>
          <div><dt className="text-muted-foreground">Codage</dt><dd className="font-semibold">{SYNTAX_LABEL[parsed.info.syntax] ?? parsed.info.syntax}</dd></div>
        </dl>
      ) : null}
      {diagnosticNotice ? <p className="text-xs text-muted-foreground">Visionneuse de consultation : elle ne remplace pas une console de diagnostic agréée. L&apos;interprétation appartient au radiologue ou au médecin.</p> : null}
    </div>
  );
}
