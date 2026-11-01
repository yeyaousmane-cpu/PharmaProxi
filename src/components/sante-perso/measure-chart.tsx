/** Graphique simple (SVG) des mesures, sans aucune zone « normale » ni interprétation. */
type Pt = { t: string; a: number; b?: number | null };

export function MeasureChart({ points, unit, labels }: { points: Pt[]; unit: string; labels: [string, string?] }) {
  if (points.length < 2) return <p className="text-sm text-muted-foreground">Le graphique apparaît à partir de 2 mesures.</p>;
  const W = 640, H = 220, P = { l: 44, r: 12, t: 12, b: 28 };
  const xs = points.map((p) => Date.parse(p.t));
  const vals = points.flatMap((p) => [p.a, p.b ?? p.a]);
  const min = Math.min(...vals), max = Math.max(...vals);
  const pad = (max - min) * 0.15 || 1;
  const y0 = min - pad, y1 = max + pad;
  const x = (t: number) => P.l + ((t - xs[0]) / Math.max(1, xs[xs.length - 1] - xs[0])) * (W - P.l - P.r);
  const y = (v: number) => P.t + (1 - (v - y0) / (y1 - y0)) * (H - P.t - P.b);
  const line = (k: "a" | "b") => points.filter((p) => p[k] != null).map((p, i) => `${i ? "L" : "M"}${x(Date.parse(p.t)).toFixed(1)},${y(p[k] as number).toFixed(1)}`).join(" ");
  const ticks = Array.from({ length: 4 }, (_, i) => y0 + ((y1 - y0) * (i + 0.5)) / 4);
  const fmt = (v: number) => (unit === "g/L" ? v.toFixed(2).replace(".", ",") : Math.round(v).toString());
  const d = (t: string) => new Date(t).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });
  return (
    <figure className="space-y-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Évolution : ${labels.filter(Boolean).join(" et ")}`}>
        {ticks.map((v) => <g key={v}><line x1={P.l} x2={W - P.r} y1={y(v)} y2={y(v)} stroke="currentColor" className="text-slate-200" /><text x={P.l - 6} y={y(v) + 4} textAnchor="end" fontSize="11" className="fill-slate-500">{fmt(v)}</text></g>)}
        <text x={P.l} y={H - 8} fontSize="11" className="fill-slate-500">{d(points[0].t)}</text>
        <text x={W - P.r} y={H - 8} fontSize="11" textAnchor="end" className="fill-slate-500">{d(points[points.length - 1].t)}</text>
        <path d={line("a")} fill="none" stroke="#068132" strokeWidth="2.5" strokeLinejoin="round" />
        {points.some((p) => p.b != null) && <path d={line("b")} fill="none" stroke="#1D5FA8" strokeWidth="2.5" strokeLinejoin="round" />}
        {points.map((p) => <circle key={p.t + "a"} cx={x(Date.parse(p.t))} cy={y(p.a)} r="3.5" fill="#068132" />)}
        {points.filter((p) => p.b != null).map((p) => <circle key={p.t + "b"} cx={x(Date.parse(p.t))} cy={y(p.b as number)} r="3.5" fill="#1D5FA8" />)}
      </svg>
      <figcaption className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="inline-block size-2.5 rounded-full bg-[#068132]" />{labels[0]}</span>
        {labels[1] && <span className="flex items-center gap-1.5"><span className="inline-block size-2.5 rounded-full bg-[#1D5FA8]" />{labels[1]}</span>}
        <span>({unit})</span>
      </figcaption>
    </figure>
  );
}
