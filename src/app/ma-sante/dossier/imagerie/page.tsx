import Link from "next/link";
import { ScanLine, Share2 } from "lucide-react";
import { dossierContext } from "@/lib/dossier/server";
import { DossierGate, DossierShell } from "@/components/dossier/shell";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Field, Input, Select } from "@/components/ui/input";
import { uploadImagingStudy, shareImaging, revokeImaging } from "@/app/actions/health-files";
import { filesEncryptionReady, MAX_FILE_LABEL } from "@/lib/health-crypto";
import { MODALITY, SHARE_DAYS, mimeLabel } from "@/lib/imaging";
import { formatDate, formatDateTime } from "@/lib/format";

export const metadata = { title: "Mon imagerie médicale" };
export const dynamic = "force-dynamic";

type Doc = { id: string; title: string; doc_kind: string; doc_date: string | null; mime: string; size_bytes: number; modality: string | null; body_part: string | null; facility_name: string | null };
type Grant = { id: string; reference: string; document_id: string; expires_at: string; revoked_at: string | null; views: number; last_viewed_at: string | null; purpose: string | null; doctors: { title: string; display_name: string } | { title: string; display_name: string }[] | null };

export default async function Imagerie({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const sp = await searchParams;
  const ctx = await dossierContext(sp.p, "/ma-sante/dossier/imagerie");
  if (ctx.locked) return <DossierGate status={ctx.status} path={`/ma-sante/dossier/imagerie${sp.p ? `?p=${sp.p}` : ""}`} />;
  const { supabase, person, persons, status } = ctx;
  const [{ data: docs }, { data: grants }] = await Promise.all([
    supabase.from("record_documents").select("id, title, doc_kind, doc_date, mime, size_bytes, modality, body_part, facility_name").eq("person_id", person.id).in("doc_kind", ["imagerie", "compte_rendu"]).order("doc_date", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }),
    supabase.from("imaging_grants").select("id, reference, document_id, expires_at, revoked_at, views, last_viewed_at, purpose, doctors(title, display_name)").order("created_at", { ascending: false }).limit(100),
  ]);
  const list = (docs ?? []) as Doc[];
  const byDoc = new Map<string, Grant[]>();
  for (const g of (grants ?? []) as Grant[]) byDoc.set(g.document_id, [...(byDoc.get(g.document_id) ?? []), g]);
  const ready = filesEncryptionReady();
  const now = Date.now();
  return (
    <DossierShell persons={persons} person={person} status={status} current="/imagerie">
      <section className="space-y-3 rounded-2xl border bg-white p-4 sm:p-5">
        <h2 className="flex items-center gap-2 text-lg font-bold text-brand-deep"><ScanLine className="size-5 text-primary" aria-hidden /> Ranger un examen d&apos;imagerie</h2>
        <p className="text-sm text-muted-foreground">Radiographie, échographie, scanner, IRM… Déposez le fichier DICOM remis par le centre d&apos;imagerie (CD, clé USB, lien), une photo du cliché ou le compte rendu en PDF. Le fichier est chiffré avant d&apos;être enregistré ; vous seul pouvez l&apos;ouvrir, et vous décidez de le partager avec un médecin. Aucune intelligence artificielle ne le lit.</p>
        {ready ? (
          <ActionForm action={uploadImagingStudy} className="grid gap-3 sm:grid-cols-2" labels={{ title: "Titre", file: "Fichier" }} resetOnSuccess>
            <input type="hidden" name="person_id" value={person.id} />
            <Field label="Titre" htmlFor="ti" required><Input id="ti" name="title" maxLength={120} required placeholder="ex. Radio du thorax" /></Field>
            <Field label="Contenu" htmlFor="ki"><Select id="ki" name="doc_kind" defaultValue="imagerie"><option value="imagerie">Images de l&apos;examen</option><option value="compte_rendu">Compte rendu du radiologue</option></Select></Field>
            <Field label="Type d'examen" htmlFor="mo"><Select id="mo" name="modality" defaultValue=""><option value="">Je ne sais pas</option>{Object.entries(MODALITY).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
            <Field label="Région examinée" htmlFor="bp"><Input id="bp" name="body_part" maxLength={80} placeholder="ex. Thorax, genou droit" /></Field>
            <Field label="Date de l'examen" htmlFor="da"><Input id="da" name="doc_date" type="date" /></Field>
            <Field label="Centre d'imagerie" htmlFor="fa"><Input id="fa" name="facility_name" maxLength={160} placeholder="Nom du centre (facultatif)" /></Field>
            <Field label={`Fichier (DICOM, PDF ou photo, ${MAX_FILE_LABEL} max.)`} htmlFor="fi" required><input id="fi" name="file" type="file" accept=".dcm,application/dicom,application/pdf,image/jpeg,image/png,image/webp" required className="block w-full text-sm" /></Field>
            <div className="sm:col-span-2"><SubmitButton>Ranger dans mon dossier</SubmitButton></div>
          </ActionForm>
        ) : <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-950">Le rangement d&apos;examens sera ouvert dès que le chiffrement sera configuré sur le serveur.</p>}
        <p className="rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">Limites actuelles : un fichier à la fois, {MAX_FILE_LABEL} au maximum (limite de l&apos;hébergement). Un scanner ou une IRM complète compte souvent des centaines d&apos;images : rangez les images clés ou le compte rendu. L&apos;envoi direct par le centre d&apos;imagerie nécessite un accord avec chaque centre et n&apos;est pas encore ouvert.</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-bold text-brand-deep">Mes examens</h2>
        {list.length === 0 ? <p className="rounded-xl border bg-white p-4 text-sm text-muted-foreground">Aucun examen rangé.</p> : (
          <ul className="space-y-3">{list.map((d) => {
            const gs = byDoc.get(d.id) ?? [];
            return (
              <li key={d.id} className="space-y-3 rounded-2xl border bg-white p-4 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <span><Link prefetch={false} href={`/ma-sante/dossier/imagerie/${d.id}`} className="font-semibold text-primary underline">{d.title}</Link>
                    <span className="block text-xs text-muted-foreground">{[d.modality ? MODALITY[d.modality] : null, d.body_part, d.doc_date ? formatDate(d.doc_date) : null, d.facility_name, d.doc_kind === "compte_rendu" ? "Compte rendu" : null, mimeLabel(d.mime), `${Math.max(1, Math.round(d.size_bytes / 1024))} Ko`].filter(Boolean).join(" · ")}</span></span>
                  <Link prefetch={false} href={`/ma-sante/dossier/imagerie/${d.id}`} className="rounded-lg border px-3 py-2 text-xs font-semibold">Ouvrir</Link>
                </div>
                {gs.length ? (
                  <ul className="space-y-1 rounded-xl bg-muted/40 p-3 text-xs">{gs.map((g) => {
                    const doc = Array.isArray(g.doctors) ? g.doctors[0] : g.doctors;
                    const active = !g.revoked_at && new Date(g.expires_at).getTime() > now;
                    return (
                      <li key={g.id} className="flex flex-wrap items-center justify-between gap-2">
                        <span><strong>{doc ? `${doc.title} ${doc.display_name}` : "Médecin"}</strong> · {g.reference} · {active ? `accès jusqu'au ${formatDateTime(g.expires_at)}` : g.revoked_at ? "accès retiré" : "accès expiré"} · {g.views ? `ouvert ${g.views} fois${g.last_viewed_at ? `, dernière fois le ${formatDateTime(g.last_viewed_at)}` : ""}` : "pas encore ouvert"}</span>
                        {active ? <ActionForm action={revokeImaging}><input type="hidden" name="id" value={g.id} /><SubmitButton size="sm" variant="outline">Retirer l&apos;accès</SubmitButton></ActionForm> : null}
                      </li>);
                  })}</ul>
                ) : null}
                <details className="rounded-xl border p-3">
                  <summary className="flex cursor-pointer items-center gap-2 font-semibold"><Share2 className="size-4" aria-hidden /> Partager avec un médecin</summary>
                  <ActionForm action={shareImaging} className="mt-3 grid gap-3 sm:grid-cols-2" resetOnSuccess>
                    <input type="hidden" name="document_id" value={d.id} />
                    <Field label="Code du médecin" htmlFor={`dc-${d.id}`} required><Input id={`dc-${d.id}`} name="doctor_code" required placeholder="ex. SP-MD-000123" autoComplete="off" /></Field>
                    <Field label="Durée de l'accès" htmlFor={`du-${d.id}`}><Select id={`du-${d.id}`} name="days" defaultValue="7">{SHARE_DAYS.map((n) => <option key={n} value={n}>{n} jour{n > 1 ? "s" : ""}</option>)}</Select></Field>
                    <Field label="Motif (facultatif)" htmlFor={`pu-${d.id}`}><Input id={`pu-${d.id}`} name="purpose" maxLength={200} placeholder="ex. Avis avant consultation" /></Field>
                    <label className="flex items-start gap-2 text-xs sm:col-span-2"><input type="checkbox" name="consent" required className="mt-0.5 size-4" />
                      <span>J&apos;accepte que ce médecin, et lui seul, puisse ouvrir <strong>cet examen uniquement</strong> pendant la durée choisie. Il ne voit rien d&apos;autre de mon dossier. Je peux retirer l&apos;accès à tout moment et je suis prévenu à chaque ouverture.</span></label>
                    <p className="text-xs text-muted-foreground sm:col-span-2">Le médecin trouve son code dans son espace professionnel SantéProxi. Seuls les médecins dont l&apos;inscription a été vérifiée peuvent recevoir un examen.</p>
                    <div className="sm:col-span-2"><SubmitButton size="sm">Partager cet examen</SubmitButton></div>
                  </ActionForm>
                </details>
              </li>);
          })}</ul>
        )}
      </section>
    </DossierShell>
  );
}
