import { FileLock2 } from "lucide-react";
import { dossierContext } from "@/lib/dossier/server";
import { DossierGate, DossierShell } from "@/components/dossier/shell";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Field, Input, Select } from "@/components/ui/input";
import { uploadRecordDocument, deleteRecordDocument } from "@/app/actions/health-files";
import { filesEncryptionReady } from "@/lib/health-crypto";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Mes documents de santé" };
export const dynamic = "force-dynamic";

const KIND: Record<string, string> = { ordonnance: "Ordonnance", resultat: "Résultat d'analyse", compte_rendu: "Compte rendu", certificat: "Certificat", vaccination: "Vaccination", autre: "Autre" };
const LABEL: Record<string, string> = { ...KIND, imagerie: "Imagerie médicale" };

export default async function Documents({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const sp = await searchParams;
  const ctx = await dossierContext(sp.p, "/ma-sante/dossier/documents");
  if (ctx.locked) return <DossierGate status={ctx.status} path={`/ma-sante/dossier/documents${sp.p ? `?p=${sp.p}` : ""}`} />;
  const { supabase, person, persons, status } = ctx;
  const { data: docs } = await supabase.from("record_documents").select("id, title, doc_kind, doc_date, mime, size_bytes, created_at").eq("person_id", person.id).order("created_at", { ascending: false });
  const ready = filesEncryptionReady();
  return (
    <DossierShell persons={persons} person={person} status={status} current="/documents">
      <section className="space-y-3 rounded-2xl border bg-white p-4 sm:p-5">
        <h2 className="flex items-center gap-2 text-lg font-bold text-brand-deep"><FileLock2 className="size-5 text-primary" aria-hidden /> Ranger un document</h2>
        <p className="text-sm text-muted-foreground">Photo d&apos;une ordonnance, d&apos;un résultat, d&apos;un compte rendu ou d&apos;un carnet. Le fichier est chiffré avant d&apos;être enregistré : vous seul pouvez l&apos;ouvrir, depuis votre dossier. Aucune intelligence artificielle ne le lit.</p>
        {ready ? (
          <ActionForm action={uploadRecordDocument} className="grid gap-3 sm:grid-cols-2" labels={{ title: "Titre", file: "Fichier" }} resetOnSuccess>
            <input type="hidden" name="person_id" value={person.id} />
            <Field label="Titre" htmlFor="ti" required><Input id="ti" name="title" maxLength={120} required placeholder="ex. Ordonnance du Dr Traoré" /></Field>
            <Field label="Type" htmlFor="ki"><Select id="ki" name="doc_kind" defaultValue="ordonnance">{Object.entries(KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
            <Field label="Date du document" htmlFor="da"><Input id="da" name="doc_date" type="date" /></Field>
            <Field label="Fichier (PDF ou photo, 4 Mo max.)" htmlFor="fi" required><input id="fi" name="file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" capture="environment" required className="block w-full text-sm" /></Field>
            <div className="sm:col-span-2"><SubmitButton>Ranger dans mon dossier</SubmitButton></div>
          </ActionForm>
        ) : <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-950">Le rangement de documents sera ouvert dès que le chiffrement sera configuré sur le serveur.</p>}
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-bold text-brand-deep">Documents rangés</h2>
        {(docs ?? []).length === 0 ? <p className="rounded-xl border bg-white p-4 text-sm text-muted-foreground">Aucun document.</p> : (
          <ul className="divide-y rounded-2xl border bg-white text-sm">{(docs ?? []).map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
              <span><a href={d.mime === "application/dicom" ? `/ma-sante/dossier/imagerie/${d.id}` : `/ma-sante/dossier/documents/${d.id}`} target="_blank" rel="noopener" className="font-semibold text-primary underline">{d.title}</a>
                <span className="block text-xs text-muted-foreground">{LABEL[d.doc_kind]}{d.doc_date ? ` · ${formatDate(d.doc_date)}` : ""} · {Math.max(1, Math.round(d.size_bytes / 1024))} Ko</span></span>
              <ActionForm action={deleteRecordDocument}><input type="hidden" name="id" value={d.id} /><SubmitButton size="sm" variant="ghost" confirm="Supprimer définitivement ce document ?">Supprimer</SubmitButton></ActionForm>
            </li>))}</ul>
        )}
      </section>
    </DossierShell>
  );
}
