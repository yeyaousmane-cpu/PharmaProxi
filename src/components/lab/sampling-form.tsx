"use client";
import { useMemo, useState } from "react";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { requestSampling } from "@/app/actions/labs";

type Exam = { id: string; name: string; price: number | null };
export function SamplingForm({ facilityId, exams, regions, tomorrow, mode = "domicile", resultsEnabled = false }: { facilityId: string; exams: Exam[]; regions: { id: string; name: string }[]; tomorrow: string; mode?: "domicile" | "laboratoire"; resultsEnabled?: boolean }) {
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const shown = useMemo(() => exams.filter((e) => !q || e.name.toLowerCase().includes(q.toLowerCase())), [q, exams]);
  const total = exams.filter((e) => picked.includes(e.id)).reduce((a, e) => a + (e.price ?? 0), 0);
  return (
    <ActionForm action={requestSampling} className="space-y-4" labels={{ exam_ids: "Analyses", patient_name: "Nom", address: "Adresse", phone: "Téléphone", preferred_date: "Date", patient_age: "Âge" }}>
      <input type="hidden" name="facility_id" value={facilityId} />
      <input type="hidden" name="mode" value={mode} />
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">Analyses demandées par le médecin</legend>
        {exams.length > 8 && <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher une analyse" aria-label="Rechercher une analyse" />}
        <div className="max-h-64 space-y-1 overflow-y-auto rounded-xl border p-2">
          {shown.map((e) => (
            <label key={e.id} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted">
              <span className="flex items-center gap-2"><input type="checkbox" name="exam_ids" value={e.id} checked={picked.includes(e.id)} onChange={(ev) => setPicked((p) => ev.target.checked ? [...p, e.id] : p.filter((x) => x !== e.id))} className="size-4" />{e.name}</span>
              <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">{e.price !== null ? `${e.price.toLocaleString("fr-FR")} F` : ""}</span>
            </label>))}
          {shown.length === 0 && <p className="p-2 text-sm text-muted-foreground">Aucune analyse ne correspond.</p>}
        </div>
        {total > 0 && <p className="text-sm">Total indicatif des analyses cochées : <strong>{total.toLocaleString("fr-FR")} FCFA</strong> (hors frais de déplacement, à confirmer avec le laboratoire).</p>}
        <Field label="Autre analyse (si elle n'est pas dans la liste)" htmlFor="oe"><Input id="oe" name="other_exams" maxLength={300} /></Field>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nom de la personne à prélever" htmlFor="pn" required><Input id="pn" name="patient_name" maxLength={120} required /></Field>
        <Field label="Âge" htmlFor="pa"><Input id="pa" name="patient_age" inputMode="numeric" maxLength={3} /></Field>
        <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="for_relative" className="size-4" /> Je fais la demande pour un proche (parent âgé, enfant…)</label>
        {mode === "domicile" && <Field label="Adresse précise (quartier, rue, porte, repère)" htmlFor="ad" required className="sm:col-span-2"><Textarea id="ad" name="address" rows={2} maxLength={300} required /></Field>}
        <Field label="Région" htmlFor="rg"><Select id="rg" name="region_id" defaultValue=""><option value="">—</option>{regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></Field>
        <Field label="Téléphone à appeler" htmlFor="ph" required><Input id="ph" name="phone" type="tel" inputMode="tel" required placeholder="+223 70 00 00 00" /></Field>
        <Field label={mode === "laboratoire" ? "Jour du rendez-vous souhaité" : "Jour souhaité"} htmlFor="dt" required><Input id="dt" name="preferred_date" type="date" min={tomorrow} defaultValue={tomorrow} required /></Field>
        <Field label="Moment" htmlFor="sl"><Select id="sl" name="slot" defaultValue="matin"><option value="matin">Le matin</option><option value="midi">Vers midi</option><option value="apres_midi">L&apos;après-midi</option></Select></Field>
      </div>
      <div className="space-y-1 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" name="has_prescription" className="size-4" /> J&apos;ai l&apos;ordonnance du médecin</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="fasting_known" className="size-4" /> Je sais que certaines analyses se font à jeun ; le laboratoire me le confirmera</label>
        {resultsEnabled && <label className="flex items-start gap-2"><input type="checkbox" name="results_consent" className="mt-0.5 size-4" /> <span>J&apos;accepte de recevoir les résultats sur SantéProxi. Ils sont chiffrés et visibles seulement par moi et ce laboratoire ; je peux les supprimer à tout moment.</span></label>}
      </div>
      <Field label="Précisions pour le laboratoire (facultatif)" htmlFor="nt"><Textarea id="nt" name="notes" rows={2} maxLength={500} placeholder="ex. personne alitée, appeler avant de venir" /></Field>
      <p className="text-xs text-muted-foreground">Ces informations sont transmises uniquement à ce laboratoire. Elles sont effacées si vous supprimez votre compte.</p>
      <SubmitButton pendingText="Envoi…">Envoyer la demande</SubmitButton>
    </ActionForm>
  );
}
