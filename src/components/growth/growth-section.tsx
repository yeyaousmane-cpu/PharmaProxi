import { Ruler, Trash2 } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Field, Input } from "@/components/ui/input";
import { saveGrowth } from "@/app/actions/health-tools";
import { growthAdvice, referenceLines, scoreMeasure, type Scored, type Sex } from "@/lib/growth";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

type Row = { id: string; measured_on: string; weight_kg: number | null; height_cm: number | null; place: string | null };

function Chart({ kind, sex, points, maxMonths }: { kind: "wfa" | "lhfa"; sex: Sex; points: Scored[]; maxMonths: number }) {
  const ref = referenceLines(kind, sex, maxMonths);
  const W = 640, H = 300, pl = 40, pr = 12, pt = 12, pb = 30;
  const vals = [...ref.m3, ...ref.p2].map((p) => p[1]);
  const pts = points.filter((p) => (kind === "wfa" ? p.weight_kg : p.height_cm) !== null && p.months >= 0 && p.months <= maxMonths)
    .map((p) => [p.months, Number(kind === "wfa" ? p.weight_kg : p.height_cm)] as [number, number]);
  const ymin = Math.floor(Math.min(...vals, ...pts.map((p) => p[1]))), ymax = Math.ceil(Math.max(...vals, ...pts.map((p) => p[1])));
  const x = (m: number) => pl + (m / maxMonths) * (W - pl - pr), y = (v: number) => pt + (1 - (v - ymin) / (ymax - ymin)) * (H - pt - pb);
  const path = (l: [number, number][]) => l.map((p, i) => `${i ? "L" : "M"}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(" ");
  const band = `${path(ref.m2)} ${[...ref.p2].reverse().map((p) => `L${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(" ")} Z`;
  const step = maxMonths <= 24 ? 3 : 6, ystep = kind === "wfa" ? (ymax - ymin > 12 ? 2 : 1) : 10;
  const label = kind === "wfa" ? "Poids (kg)" : "Taille (cm)";
  return (
    <figure className="space-y-1">
      <figcaption className="text-sm font-semibold text-brand-deep">{kind === "wfa" ? "Poids pour l'âge" : "Taille pour l'âge"}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${label} selon l'âge, comparé aux normes de l'OMS`}>
        <path d={band} fill="#EAF6EE" />
        {Array.from({ length: Math.floor((ymax - ymin) / ystep) + 1 }, (_, i) => Math.ceil(ymin / ystep) * ystep + i * ystep).filter((v) => v <= ymax).map((v) => (
          <g key={v}><line x1={pl} x2={W - pr} y1={y(v)} y2={y(v)} stroke="#E5E7EB" /><text x={pl - 6} y={y(v) + 4} fontSize="11" textAnchor="end" fill="#6B7280">{v}</text></g>
        ))}
        {Array.from({ length: Math.floor(maxMonths / step) + 1 }, (_, i) => i * step).map((m) => (
          <text key={m} x={x(m)} y={H - 10} fontSize="11" textAnchor="middle" fill="#6B7280">{m}</text>
        ))}
        <path d={path(ref.m3)} fill="none" stroke="#C62828" strokeWidth="1.5" strokeDasharray="4 3" />
        <path d={path(ref.m2)} fill="none" stroke="#E09B00" strokeWidth="1.5" />
        <path d={path(ref.med)} fill="none" stroke="#068132" strokeWidth="2" />
        <path d={path(ref.p2)} fill="none" stroke="#E09B00" strokeWidth="1.5" />
        {pts.length > 1 && <path d={path(pts)} fill="none" stroke="#1D5FA8" strokeWidth="2.5" />}
        {pts.map((p, i) => <circle key={i} cx={x(p[0])} cy={y(p[1])} r="5" fill="#1D5FA8" stroke="#fff" strokeWidth="2" />)}
      </svg>
      <p className="text-xs text-muted-foreground">Âge en mois. Zone verte : entre les lignes orange (−2 et +2 écarts-types des normes de l&apos;OMS). Ligne rouge pointillée : −3. Points bleus : vos mesures.</p>
    </figure>
  );
}

const TONE = { ok: "border-emerald-200 bg-emerald-50 text-emerald-900", attention: "border-amber-300 bg-amber-50 text-amber-950", urgent: "border-red-300 bg-red-50 text-red-900" };

export function GrowthSection({ childId, birth, sex, firstName, rows }: { childId: string; birth: string; sex: Sex | null; firstName: string; rows: Row[] }) {
  const today = new Date().toISOString().slice(0, 10);
  const sorted = [...rows].sort((a, b) => a.measured_on.localeCompare(b.measured_on));
  const months = (Date.parse(today) - Date.parse(birth)) / 86_400_000 / 30.4375;
  const scored = sex ? sorted.map((r) => scoreMeasure(r, birth, sex)) : [];
  const advice = sex && months <= 60 ? growthAdvice(scored) : [];
  const maxMonths = Math.min(60, Math.max(12, Math.ceil((months + 3) / 6) * 6));
  return (
    <section id="croissance" className="scroll-mt-24 space-y-4 rounded-2xl border bg-white p-4 sm:p-5">
      <h2 className="flex items-center gap-2 text-lg font-bold text-brand-deep"><Ruler className="size-5 text-primary" aria-hidden /> Courbe de croissance</h2>
      <p className="text-sm text-muted-foreground">Notez le poids et la taille de {firstName} à chaque pesée au centre de santé. La courbe se compare aux normes de croissance de l&apos;OMS (de la naissance à 5 ans). Ces repères ne remplacent pas l&apos;examen par un soignant.</p>
      {!sex && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Indiquez si c&apos;est une fille ou un garçon (« Modifier ce carnet », plus bas) : les normes de l&apos;OMS sont différentes.</p>}
      {months > 60 && <p className="rounded-xl bg-muted p-3 text-sm">Les normes utilisées ici concernent les enfants jusqu&apos;à 5 ans. Pour un enfant plus âgé, demandez conseil au centre de santé.</p>}
      {advice.map((a) => <p key={a.text} role={a.tone === "urgent" ? "alert" : undefined} className={cn("rounded-xl border p-3 text-sm font-medium", TONE[a.tone])}>{a.text}</p>)}
      {sex && scored.length > 0 && months <= 66 && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Chart kind="wfa" sex={sex} points={scored} maxMonths={maxMonths} />
          {scored.some((s) => s.height_cm !== null) && <Chart kind="lhfa" sex={sex} points={scored} maxMonths={maxMonths} />}
        </div>
      )}
      <ActionForm action={saveGrowth} className="grid gap-3 sm:grid-cols-4" resetOnSuccess labels={{ weight_kg: "Poids", height_cm: "Taille", measured_on: "Date" }}>
        <input type="hidden" name="child_id" value={childId} />
        <Field label="Date de la pesée" htmlFor="g-on"><Input id="g-on" name="measured_on" type="date" min={birth} max={today} defaultValue={today} /></Field>
        <Field label="Poids (kg)" htmlFor="g-w"><Input id="g-w" name="weight_kg" inputMode="decimal" placeholder="ex. 7,4" /></Field>
        <Field label="Taille (cm)" htmlFor="g-h"><Input id="g-h" name="height_cm" inputMode="decimal" placeholder="ex. 66" /></Field>
        <Field label="Lieu (facultatif)" htmlFor="g-p"><Input id="g-p" name="place" maxLength={100} placeholder="ex. CSCom" /></Field>
        <SubmitButton size="sm" className="w-fit sm:col-span-4">Enregistrer la mesure</SubmitButton>
      </ActionForm>
      {sorted.length > 0 && (
        <ul className="divide-y text-sm">
          {[...sorted].reverse().map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 py-2">
              <span>{formatDate(r.measured_on)} · {[r.weight_kg !== null && `${String(r.weight_kg).replace(".", ",")} kg`, r.height_cm !== null && `${String(r.height_cm).replace(".", ",")} cm`].filter(Boolean).join(" · ")}{r.place ? ` · ${r.place}` : ""}</span>
              <ActionForm action={saveGrowth}>
                <input type="hidden" name="child_id" value={childId} /><input type="hidden" name="delete" value={r.id} />
                <SubmitButton size="sm" variant="ghost" aria-label="Supprimer cette mesure" confirm="Supprimer cette mesure ?"><Trash2 aria-hidden /></SubmitButton>
              </ActionForm>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">Source : Normes de croissance de l&apos;enfant de l&apos;OMS (2006). Gardez toujours le carnet de santé papier : c&apos;est lui qui fait foi.</p>
    </section>
  );
}
