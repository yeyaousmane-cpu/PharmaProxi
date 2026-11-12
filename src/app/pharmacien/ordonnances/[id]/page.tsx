import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCurrentPharmacy } from "@/lib/pharmacy";
import { createClient } from "@/lib/supabase/server";
import { ImagingViewer } from "@/components/imaging/dicom-viewer";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Field, Input, Select } from "@/components/ui/input";
import { prescriptionRespond, prescriptionPharmacyAction } from "@/app/actions/health-files";
import { RX_STATUS, AVAILABILITY, type RxLine } from "@/lib/prescriptions";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Ordonnance reçue", robots: { index: false } };
export const dynamic = "force-dynamic";

type Row = { id: string; reference: string; patient: string; status: string; patient_note: string | null; created_at: string; expires_at: string; response_valid_until: string | null; hold_until: string | null; mime: string };

export default async function RxDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ph = await requireCurrentPharmacy();
  const supabase = await createClient();
  await supabase.rpc("rx_expire");
  const { data } = await supabase.rpc("rx_pharmacy_inbox", { p_pharmacy: ph.id });
  const r = ((data ?? []) as Row[]).find((x) => x.id === id);
  if (!r) notFound();
  const { data: ln } = await supabase.from("prescription_response_lines").select("id, position, label, availability, quantity_available, unit_price_xof, delay_days, note").eq("transmission_id", id).order("position");
  const lines = (ln ?? []) as RxLine[];
  const open = ["envoyee", "vue", "repondue", "reservee", "prete"].includes(r.status);
  const canRespond = ["envoyee", "vue", "repondue"].includes(r.status);
  const rows = Array.from({ length: Math.max(6, lines.length + 2) }, (_, i) => lines[i]);
  return (
    <div className="space-y-4">
      <p className="text-sm"><Link prefetch={false} href="/pharmacien/ordonnances" className="text-primary underline">← Ordonnances reçues</Link></p>
      <h1 className="text-2xl font-bold">{r.reference} · {r.patient}</h1>
      <p className="text-sm"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${RX_STATUS[r.status]?.tone}`}>{RX_STATUS[r.status]?.label}</span> <span className="text-muted-foreground">Reçue le {formatDateTime(r.created_at)}{canRespond ? ` · répondre avant le ${formatDateTime(r.expires_at)}` : ""}</span></p>
      {r.patient_note ? <p className="rounded-xl bg-muted/50 p-3 text-sm">Message du patient : « {r.patient_note} »</p> : null}
      {open ? <ImagingViewer src={`/pharmacien/ordonnances/${r.id}/fichier`} mime={r.mime} title={`Ordonnance ${r.reference}`} diagnosticNotice={false} /> : <p className="rounded-xl border bg-white p-4 text-sm text-muted-foreground">Demande close : l&apos;ordonnance n&apos;est plus accessible.</p>}

      {canRespond ? (
        <section className="space-y-3 rounded-2xl border bg-white p-4">
          <h2 className="font-semibold">Répondre au patient</h2>
          <p className="text-xs text-muted-foreground">Recopiez les produits de l&apos;ordonnance et indiquez ce que vous avez réellement. La réponse est datée et expire : le patient ne peut réserver que tant qu&apos;elle est valable. Ne proposez pas de substitution sans en parler avec le patient au comptoir.</p>
          <ActionForm action={prescriptionRespond} className="space-y-3">
            <input type="hidden" name="id" value={r.id} />
            {rows.map((l, i) => (
              <fieldset key={i} className="grid gap-2 rounded-xl border p-2 sm:grid-cols-6">
                <legend className="px-1 text-xs font-semibold">Ligne {i + 1}{i > 0 ? " (facultative)" : ""}</legend>
                <Field label="Produit" htmlFor={`l${i}`} className="sm:col-span-2"><Input id={`l${i}`} name={`label_${i}`} maxLength={160} defaultValue={l?.label} required={i === 0} /></Field>
                <Field label="Disponibilité" htmlFor={`a${i}`}><Select id={`a${i}`} name={`availability_${i}`} defaultValue={l?.availability ?? ""}><option value="">—</option>{Object.entries(AVAILABILITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
                <Field label="Boîtes" htmlFor={`q${i}`}><Input id={`q${i}`} name={`quantity_${i}`} inputMode="numeric" pattern="\d*" defaultValue={l?.quantity_available ?? undefined} /></Field>
                <Field label="Prix unitaire (FCFA)" htmlFor={`p${i}`}><Input id={`p${i}`} name={`price_${i}`} inputMode="numeric" pattern="\d*" defaultValue={l?.unit_price_xof ?? undefined} /></Field>
                <Field label="Délai (jours)" htmlFor={`d${i}`}><Input id={`d${i}`} name={`delay_${i}`} inputMode="numeric" pattern="\d*" defaultValue={l?.delay_days ?? undefined} /></Field>
                <Field label="Remarque" htmlFor={`n${i}`} className="sm:col-span-6"><Input id={`n${i}`} name={`note_${i}`} maxLength={300} defaultValue={l?.note ?? undefined} /></Field>
              </fieldset>))}
            <div className="grid gap-2 sm:grid-cols-2">
              <Field label="Réponse valable" htmlFor="vh"><Select id="vh" name="valid_hours" defaultValue="24">{[2, 6, 12, 24, 48].map((h) => <option key={h} value={h}>{h} heures</option>)}</Select></Field>
              <Field label="Message au patient (facultatif)" htmlFor="msg"><Input id="msg" name="message" maxLength={500} /></Field>
            </div>
            <SubmitButton>Envoyer la réponse</SubmitButton>
          </ActionForm>
        </section>
      ) : lines.length ? (
        <section className="rounded-2xl border bg-white p-4 text-sm"><h2 className="mb-1 font-semibold">Réponse envoyée{r.response_valid_until ? ` (valable jusqu'au ${formatDateTime(r.response_valid_until)})` : ""}</h2>
          <ul className="space-y-1 text-xs">{lines.map((l) => <li key={l.id}><strong>{l.label}</strong> : {AVAILABILITY[l.availability]}{l.quantity_available != null ? ` · ${l.quantity_available}` : ""}</li>)}</ul></section>
      ) : null}

      {open ? (
        <section className="flex flex-wrap gap-2 rounded-2xl border bg-white p-4">
          {r.status === "reservee" ? <ActionForm action={prescriptionPharmacyAction}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="action" value="prete" /><SubmitButton size="sm">Prête au comptoir</SubmitButton></ActionForm> : null}
          {["reservee", "prete"].includes(r.status) ? <ActionForm action={prescriptionPharmacyAction}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="action" value="retiree" /><SubmitButton size="sm" variant="outline" confirm="Confirmer le retrait ? L'ordonnance originale a-t-elle été vérifiée ?">Retirée (ordonnance originale vérifiée)</SubmitButton></ActionForm> : null}
          <ActionForm action={prescriptionPharmacyAction} className="flex flex-wrap items-end gap-2"><input type="hidden" name="id" value={r.id} /><input type="hidden" name="action" value="refusee" />
            <Field label="Motif du refus" htmlFor="rf"><Input id="rf" name="note" minLength={5} maxLength={300} required placeholder="ex. Ordonnance illisible" /></Field>
            <SubmitButton size="sm" variant="ghost">Refuser</SubmitButton></ActionForm>
        </section>
      ) : null}
    </div>
  );
}
