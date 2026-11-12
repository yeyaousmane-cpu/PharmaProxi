import { Send } from "lucide-react";
import { dossierContext } from "@/lib/dossier/server";
import { DossierGate, DossierShell } from "@/components/dossier/shell";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Field, Input, Select } from "@/components/ui/input";
import { sendPrescription, prescriptionPatientAction } from "@/app/actions/health-files";
import { filesEncryptionReady, MAX_FILE_LABEL } from "@/lib/health-crypto";
import { RX_STATUS, AVAILABILITY, type RxLine } from "@/lib/prescriptions";
import { formatDate, formatDateTime, formatXof } from "@/lib/format";

export const metadata = { title: "Envoyer une ordonnance à une pharmacie" };
export const dynamic = "force-dynamic";

type Tx = { id: string; reference: string; status: string; patient_note: string | null; created_at: string; expires_at: string; response_valid_until: string | null; hold_until: string | null; pharmacy_message: string | null; close_reason: string | null;
  pharmacies: { name: string; phone: string; address: string | null } | { name: string; phone: string; address: string | null }[] | null; record_documents: { title: string } | { title: string }[] | null; prescription_response_lines: RxLine[] };
const one = <T,>(v: T | T[] | null) => (Array.isArray(v) ? v[0] : v) ?? null;

export default async function Ordonnances({ searchParams }: { searchParams: Promise<{ p?: string; q?: string; pharmacie?: string }> }) {
  const sp = await searchParams;
  const base = "/ma-sante/dossier/ordonnances";
  const ctx = await dossierContext(sp.p, base);
  if (ctx.locked) return <DossierGate status={ctx.status} path={base} />;
  const { supabase, person, persons, status } = ctx;
  await supabase.rpc("rx_expire");
  const q = (sp.q ?? "").trim().slice(0, 60);
  const pre = sp.pharmacie && /^[0-9a-f-]{36}$/i.test(sp.pharmacie) ? sp.pharmacie : null;
  const phQuery = supabase.from("pharmacies").select("id, name, communes(name), regions(name)").eq("status", "verified").order("name").limit(20);
  const [{ data: docs }, { data: txs }, { data: phs }] = await Promise.all([
    supabase.from("record_documents").select("id, title, doc_date, created_at").eq("person_id", person.id).eq("doc_kind", "ordonnance").order("created_at", { ascending: false }).limit(30),
    supabase.from("prescription_transmissions").select("id, reference, status, patient_note, created_at, expires_at, response_valid_until, hold_until, pharmacy_message, close_reason, pharmacies(name, phone, address), record_documents(title), prescription_response_lines(id, position, label, availability, quantity_available, unit_price_xof, delay_days, note)").order("created_at", { ascending: false }).limit(50),
    pre ? phQuery.eq("id", pre) : q.length >= 2 ? phQuery.ilike("name", `%${q.replace(/[%_]/g, "")}%`) : Promise.resolve({ data: [] as never[] }),
  ]);
  const pharmacies = (phs ?? []) as { id: string; name: string; communes: { name: string } | { name: string }[] | null; regions: { name: string } | { name: string }[] | null }[];
  const ready = filesEncryptionReady();
  const now = Date.now();
  return (
    <DossierShell persons={persons} person={person} status={status} current="/ordonnances">
      <section className="space-y-3 rounded-2xl border bg-white p-4 sm:p-5">
        <h2 className="flex items-center gap-2 text-lg font-bold text-brand-deep"><Send className="size-5 text-primary" aria-hidden /> Envoyer une ordonnance à une pharmacie</h2>
        <p className="text-sm text-muted-foreground">La pharmacie vérifie ce qu&apos;elle a pour votre ordonnance et vous répond dans l&apos;application, avec une réponse datée et limitée dans le temps. Vous pouvez alors réserver, sans payer en ligne. <strong>L&apos;ordonnance originale reste à présenter au comptoir.</strong> SantéProxi n&apos;affiche jamais de disponibilité sans réponse de la pharmacie.</p>
        <form method="get" className="flex flex-wrap items-end gap-2" role="search">
          {sp.p ? <input type="hidden" name="p" value={sp.p} /> : null}
          <Field label="Rechercher une pharmacie vérifiée" htmlFor="phq"><Input id="phq" name="q" defaultValue={q} minLength={2} placeholder="Nom de la pharmacie" /></Field>
          <button className="min-h-11 rounded-lg border px-4 text-sm font-semibold">Rechercher</button>
        </form>
        {pharmacies.length === 0 ? (q || pre ? <p className="text-sm text-muted-foreground">Aucune pharmacie vérifiée ne correspond.</p> : null) : (
          <ActionForm action={sendPrescription} className="grid gap-3" labels={{ pharmacy_id: "Pharmacie", document_id: "Ordonnance" }} resetOnSuccess>
            <input type="hidden" name="person_id" value={person.id} />
            <fieldset className="space-y-1"><legend className="text-sm font-semibold">Pharmacie</legend>
              {pharmacies.map((ph, i) => (
                <label key={ph.id} className="flex items-center gap-2 rounded-lg border p-2 text-sm"><input type="radio" name="pharmacy_id" value={ph.id} defaultChecked={i === 0 && pharmacies.length === 1} required className="size-4" />
                  <span><strong>{ph.name}</strong> <span className="text-muted-foreground">{[one(ph.communes)?.name, one(ph.regions)?.name].filter(Boolean).join(", ")}</span></span></label>))}
            </fieldset>
            <Field label="Ordonnance déjà rangée dans mon dossier" htmlFor="doc"><Select id="doc" name="document_id" defaultValue=""><option value="">— Aucune : j&apos;envoie une photo ci-dessous —</option>{(docs ?? []).map((d) => <option key={d.id} value={d.id}>{d.title}{d.doc_date ? ` (${formatDate(d.doc_date)})` : ""}</option>)}</Select></Field>
            {ready ? <Field label={`Ou photo de l'ordonnance (${MAX_FILE_LABEL} max., rangée aussi dans votre dossier)`} htmlFor="rxf"><input id="rxf" name="file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" capture="environment" className="block w-full text-sm" /></Field> : null}
            <Field label="Message pour la pharmacie (facultatif)" htmlFor="nt"><Input id="nt" name="note" maxLength={500} placeholder="ex. Je passe demain matin" /></Field>
            <label className="flex items-start gap-2 text-xs"><input type="checkbox" name="consent" required className="mt-0.5 size-4" />
              <span>J&apos;accepte que <strong>cette pharmacie uniquement</strong> voie cette ordonnance, mon prénom et l&apos;initiale de mon nom, pendant 72 heures au plus (ou jusqu&apos;au retrait si je réserve). Elle ne voit rien d&apos;autre de mon dossier. Je peux annuler à tout moment.</span></label>
            <div><SubmitButton>Transmettre l&apos;ordonnance</SubmitButton></div>
          </ActionForm>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-bold text-brand-deep">Mes ordonnances transmises</h2>
        {(txs ?? []).length === 0 ? <p className="rounded-xl border bg-white p-4 text-sm text-muted-foreground">Aucune ordonnance transmise.</p> : (
          <ul className="space-y-3">{((txs ?? []) as Tx[]).map((t) => {
            const ph = one(t.pharmacies); const st = RX_STATUS[t.status];
            const lines = [...(t.prescription_response_lines ?? [])].sort((a, b) => a.position - b.position);
            const fresh = t.response_valid_until && new Date(t.response_valid_until).getTime() > now;
            return (
              <li key={t.id} className="space-y-2 rounded-2xl border bg-white p-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span><strong>{ph?.name ?? "Pharmacie"}</strong> · {t.reference} · {one(t.record_documents)?.title}<span className="block text-xs text-muted-foreground">Envoyée le {formatDateTime(t.created_at)}{["envoyee", "vue"].includes(t.status) ? ` · réponse attendue avant le ${formatDateTime(t.expires_at)}` : ""}</span></span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${st?.tone}`}>{st?.label ?? t.status}</span>
                </div>
                {lines.length ? (
                  <div className="rounded-xl bg-muted/40 p-3">
                    <p className="text-xs font-semibold">Réponse de la pharmacie {t.response_valid_until ? (fresh ? `— valable jusqu'au ${formatDateTime(t.response_valid_until)}` : `— n'est plus valable depuis le ${formatDateTime(t.response_valid_until)}`) : ""}</p>
                    <ul className="mt-1 space-y-1 text-xs">{lines.map((l) => (
                      <li key={l.id}><strong>{l.label}</strong> : {AVAILABILITY[l.availability]}{l.quantity_available != null ? ` · ${l.quantity_available} boîte(s)` : ""}{l.unit_price_xof != null ? ` · ${formatXof(l.unit_price_xof)} l'unité (indiqué par la pharmacie)` : ""}{l.delay_days != null ? ` · délai ${l.delay_days} j` : ""}{l.note ? ` · ${l.note}` : ""}</li>))}</ul>
                    {t.pharmacy_message ? <p className="mt-1 text-xs">Message : {t.pharmacy_message}</p> : null}
                    <p className="mt-1 text-[11px] text-muted-foreground">Tout changement de produit (générique, autre dosage) se décide avec le pharmacien au comptoir.</p>
                  </div>
                ) : null}
                {t.status === "reservee" || t.status === "prete" ? <p className="text-xs">{t.status === "prete" ? "Prête : " : "Réservée : "}gardée jusqu&apos;au {t.hold_until ? formatDateTime(t.hold_until) : "—"}. Présentez la référence <strong>{t.reference}</strong> et l&apos;ordonnance originale.{ph?.phone ? ` Téléphone : ${ph.phone}.` : ""}</p> : null}
                {t.close_reason && ["refusee", "expiree", "annulee"].includes(t.status) ? <p className="text-xs text-muted-foreground">Motif : {t.close_reason}</p> : null}
                <div className="flex flex-wrap gap-2">
                  {t.status === "repondue" && fresh ? <ActionForm action={prescriptionPatientAction}><input type="hidden" name="id" value={t.id} /><input type="hidden" name="action" value="reserver" /><SubmitButton size="sm">Réserver</SubmitButton></ActionForm> : null}
                  {["envoyee", "vue", "repondue", "reservee", "prete"].includes(t.status) ? <ActionForm action={prescriptionPatientAction}><input type="hidden" name="id" value={t.id} /><input type="hidden" name="action" value="annuler" /><SubmitButton size="sm" variant="ghost" confirm="Annuler cette demande ? La pharmacie ne pourra plus voir l'ordonnance.">Annuler</SubmitButton></ActionForm> : null}
                </div>
              </li>);
          })}</ul>
        )}
      </section>
    </DossierShell>
  );
}
