import Link from "next/link";
import { FileText, Trash2 } from "lucide-react";
import { requireCurrentPharmacy } from "@/lib/pharmacy";
import { createClient } from "@/lib/supabase/server";
import { getGeo } from "@/lib/geo";
import { PharmacyHeader } from "@/components/pharmacy/pharmacy-header";
import { PharmacyFormFields, PHARMACY_LABELS } from "@/components/pharmacy/pharmacy-form-fields";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { deleteDocument, resubmitPharmacy, updatePharmacy, uploadDocument } from "@/app/actions/pharmacy";
import { formatDateTime } from "@/lib/format";
import { PHARMACY_STATUS_LABEL } from "@/lib/pharmacy";
import { DOC_LABELS } from "@/lib/documents";
import { TeamCard } from "@/components/pharmacy/team-card";
import { requireUser } from "@/lib/auth";

export const metadata = { title: "Ma pharmacie" };


export default async function MyPharmacy({ searchParams }: { searchParams: Promise<{ inscrite?: string }> }) {
  const sp = await searchParams;
  const ph = await requireCurrentPharmacy();
  const me = await requireUser("/pharmacien/ma-pharmacie");
  const supabase = await createClient();
  const [{ data: p }, { data: priv }, { data: docs }, { data: history }, geo] = await Promise.all([
    supabase.from("pharmacies").select("*").eq("id", ph.id).single(),
    supabase.from("pharmacy_private").select("*").eq("pharmacy_id", ph.id).maybeSingle(),
    supabase.from("pharmacy_documents").select("id, doc_type, file_name, storage_path, created_at").eq("pharmacy_id", ph.id).order("created_at"),
    supabase.from("pharmacy_verifications").select("id, decision, reason, created_at").eq("pharmacy_id", ph.id).order("created_at", { ascending: false }),
    getGeo(),
  ]);
  const links = await Promise.all((docs ?? []).map(async (d) => {
    const { data } = await supabase.storage.from("pharmacy-documents").createSignedUrl(d.storage_path, 300);
    return { ...d, url: data?.signedUrl ?? null };
  }));
  const { data: membership } = await supabase.from("pharmacy_members").select("member_role").eq("pharmacy_id", ph.id).eq("user_id", me.userId).maybeSingle();
  const isOwner = membership?.member_role === "owner";
  const editable = ph.status !== "suspended";
  const docsEditable = isOwner && (ph.status === "pending" || ph.status === "rejected");
  return (
    <>
      <PharmacyHeader current={ph} title="Ma pharmacie" />
      {sp.inscrite && <Alert tone="success" className="mb-4" title="Demande enregistrée">Étape suivante : déposez vos justificatifs ci-dessous pour permettre la vérification.</Alert>}
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader><CardTitle>Informations</CardTitle><CardDescription><Link prefetch={false} href={`/pharmacies/${ph.id}`} className="text-primary underline">Voir la fiche publique</Link></CardDescription></CardHeader>
          <CardContent>
            {editable ? (
              <ActionForm action={updatePharmacy} className="space-y-6" labels={PHARMACY_LABELS}>
                <input type="hidden" name="pharmacy_id" value={ph.id} />
                <PharmacyFormFields geo={geo} v={{ ...p, ...(priv ?? {}) }} />
                <SubmitButton>Enregistrer les modifications</SubmitButton>
              </ActionForm>
            ) : <Alert tone="warning" title="Modification impossible dans le statut actuel." />}
          </CardContent>
        </Card>
        <div className="space-y-6">
          <TeamCard pharmacyId={ph.id} userId={me.userId} editable={ph.status !== "suspended"} />
          <Card id="justificatifs">
            <CardHeader><CardTitle>Justificatifs</CardTitle><CardDescription>Stockage privé : seuls votre équipe et les administrateurs habilités y ont accès.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              {!links.length ? <p className="text-sm text-muted-foreground">Aucun document déposé.</p> : (
                <ul className="divide-y text-sm">
                  {links.map((d) => (
                    <li key={d.id} className="flex items-center justify-between gap-2 py-2">
                      <span className="flex items-center gap-2"><FileText className="size-4" aria-hidden />
                        {d.url ? <a href={d.url} target="_blank" rel="noopener noreferrer" className="underline">{DOC_LABELS[d.doc_type]}</a> : DOC_LABELS[d.doc_type]}
                      </span>
                      {docsEditable && <form action={deleteDocument}><input type="hidden" name="document_id" value={d.id} />
                        <button className="rounded p-2 text-destructive hover:bg-red-50" aria-label="Supprimer le document"><Trash2 className="size-4" /></button></form>}
                    </li>
                  ))}
                </ul>
              )}
              {!isOwner && <p className="text-xs text-muted-foreground">Seul le propriétaire de la pharmacie peut déposer ou retirer des justificatifs.</p>}
              {isOwner && (docsEditable || ph.status === "verified") && (
                <ActionForm action={uploadDocument} resetOnSuccess className="space-y-3">
                  <input type="hidden" name="pharmacy_id" value={ph.id} />
                  <Field label="Type de document" htmlFor="doc_type" required>
                    <Select id="doc_type" name="doc_type" required>{Object.entries(DOC_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
                  </Field>
                  <Field label="Fichier (PDF, JPEG, PNG, WebP — 5 Mo max.)" htmlFor="file" required>
                    <Input id="file" name="file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" required />
                  </Field>
                  <SubmitButton variant="secondary" pendingText="Envoi…">Déposer</SubmitButton>
                </ActionForm>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Historique de vérification</CardTitle></CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                {(history ?? []).map((h) => (
                  <li key={h.id}><span className="font-medium">{PHARMACY_STATUS_LABEL[h.decision as keyof typeof PHARMACY_STATUS_LABEL]}</span> · {formatDateTime(h.created_at)}{h.reason ? <span className="block text-muted-foreground">{h.reason}</span> : null}</li>
                ))}
              </ul>
              {ph.status === "rejected" && (
                <form action={resubmitPharmacy} className="mt-4"><input type="hidden" name="pharmacy_id" value={ph.id} />
                  <Button type="submit">Soumettre à nouveau après corrections</Button></form>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
