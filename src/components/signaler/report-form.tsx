"use client";
import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { submitDrugReport } from "@/app/actions/authorities";
import { AGES, OUTCOME, PROBLEMS, REPORTER, SEVERITY, WHERE } from "@/lib/authorities";
import { cn } from "@/lib/utils";

export function ReportForm({ regions, initialKind }: { regions: { id: string; name: string }[]; initialKind: "suspect" | "effet" }) {
  const [kind, setKind] = useState(initialKind);
  const [contact, setContact] = useState(false);
  return (
    <ActionForm action={submitDrugReport} className="space-y-4" labels={{ product_name: "Médicament", reaction: "Réaction", description: "Description", consent: "Accord", contact_phone: "Téléphone", price_xof: "Prix" }}>
      <fieldset className="grid gap-2 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold">Que voulez-vous signaler ?</legend>
        {(["suspect", "effet"] as const).map((k) => (
          <label key={k} className={cn("flex cursor-pointer items-start gap-3 rounded-xl border p-3", kind === k ? "border-primary bg-brand-mint" : "bg-white")}>
            <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} className="mt-1 size-4" />
            <span><span className="font-semibold">{k === "suspect" ? "Un médicament suspect" : "Une mauvaise réaction"}</span>
              <span className="block text-xs text-muted-foreground">{k === "suspect" ? "Boîte douteuse, prix anormal, vendu dans la rue, étiquette étrange…" : "Un effet gênant ou grave après avoir pris un médicament."}</span></span>
          </label>
        ))}
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Je suis" htmlFor="rt"><Select id="rt" name="reporter_type" defaultValue="patient">{Object.entries(REPORTER).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
        <Field label="Nom du médicament (et dosage)" htmlFor="pn" required><Input id="pn" name="product_name" maxLength={160} required placeholder="ex. Coartem 20/120" /></Field>
        <Field label="Numéro de lot (sur la boîte)" htmlFor="bn" hint="Souvent noté « Lot » ou « LOT » à côté de la date"><Input id="bn" name="batch_number" maxLength={60} /></Field>
        <Field label="Date de péremption" htmlFor="ex"><Input id="ex" name="expiry" maxLength={20} placeholder="ex. 08/2027" /></Field>
        <Field label="Fabricant (si indiqué)" htmlFor="mf"><Input id="mf" name="manufacturer" maxLength={120} /></Field>
        <Field label="Où l'avez-vous obtenu ?" htmlFor="wb"><Select id="wb" name="where_bought" defaultValue=""><option value="">—</option>{Object.entries(WHERE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
        <Field label="Précisez le lieu (facultatif)" htmlFor="pd" hint="Il ne sera jamais publié"><Input id="pd" name="place_detail" maxLength={160} placeholder="ex. marché de Médine" /></Field>
        <Field label="Région" htmlFor="rg"><Select id="rg" name="region_id" defaultValue=""><option value="">—</option>{regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></Field>
        <Field label="Prix payé (FCFA)" htmlFor="pr"><Input id="pr" name="price_xof" inputMode="numeric" maxLength={9} /></Field>
      </div>

      {kind === "suspect" ? (
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold">Qu&apos;est-ce qui vous paraît suspect ?</legend>
          <div className="grid gap-2 sm:grid-cols-2">{Object.entries(PROBLEMS).map(([k, l]) => <label key={k} className="flex items-start gap-2 text-sm"><input type="checkbox" name="problems" value={k} className="mt-0.5 size-4" />{l}</label>)}</div>
          <Field label="Décrivez (facultatif)" htmlFor="ds"><Textarea id="ds" name="description" rows={3} maxLength={2000} /></Field>
        </fieldset>
      ) : (
        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold">La réaction</legend>
          <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">Difficulté à respirer, gonflement du visage, malaise, perte de connaissance : <strong>allez tout de suite au centre de santé</strong> ou appelez les secours. Signalez ensuite.</p>
          <Field label="Qu'avez-vous observé ? Combien de temps après la prise ?" htmlFor="re" required><Textarea id="re" name="reaction" rows={3} maxLength={2000} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Gravité" htmlFor="sv"><Select id="sv" name="severity" defaultValue=""><option value="">—</option>{Object.entries(SEVERITY).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
            <Field label="Évolution" htmlFor="oc"><Select id="oc" name="outcome" defaultValue=""><option value="">—</option>{Object.entries(OUTCOME).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
            <Field label="Âge de la personne" htmlFor="ag"><Select id="ag" name="patient_age" defaultValue=""><option value="">—</option>{AGES.map((a) => <option key={a} value={a}>{a} ans</option>)}</Select></Field>
            <Field label="Sexe" htmlFor="ps"><Select id="ps" name="patient_sex" defaultValue=""><option value="">—</option><option value="F">Femme</option><option value="M">Homme</option></Select></Field>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="pregnant" className="size-4" /> La personne est enceinte</label>
          <Field label="Autres médicaments pris en même temps (facultatif)" htmlFor="om"><Input id="om" name="other_meds" maxLength={500} /></Field>
          <Field label="Autres précisions (facultatif)" htmlFor="ds2"><Textarea id="ds2" name="description" rows={2} maxLength={2000} /></Field>
        </fieldset>
      )}

      <fieldset className="space-y-2 rounded-xl bg-muted/50 p-3 text-sm">
        <label className="flex items-start gap-2"><input type="checkbox" name="contact_ok" checked={contact} onChange={(e) => setContact(e.target.checked)} className="mt-0.5 size-4" />J&apos;accepte que les autorités de santé me rappellent si besoin</label>
        {contact && <Field label="Mon téléphone" htmlFor="cp"><Input id="cp" name="contact_phone" type="tel" inputMode="tel" placeholder="+223 70 00 00 00" /></Field>}
        <label className="flex items-start gap-2"><input type="checkbox" name="consent" required className="mt-0.5 size-4" /><span>J&apos;accepte que ce signalement soit transmis aux autorités de santé (ministère de la Santé, Direction de la pharmacie et du médicament, Ordre des pharmaciens). <strong>Il n&apos;est jamais publié</strong> et mon nom n&apos;est pas communiqué.</span></label>
      </fieldset>
      <SubmitButton pendingText="Envoi…">Envoyer le signalement</SubmitButton>
    </ActionForm>
  );
}
