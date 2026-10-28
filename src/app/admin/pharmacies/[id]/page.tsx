import { transferPharmacyOwner } from "@/app/actions/directory";
import { notFound } from "next/navigation";
import Link from "next/link";
import { FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { OpeningHours } from "@/components/opening-hours";
import { reviewPharmacy, setHoursVerified } from "@/app/actions/admin";
import { PHARMACY_STATUS_LABEL } from "@/lib/pharmacy";
import { DOC_LABELS } from "@/lib/documents";
import { formatDateTime, formatPhone } from "@/lib/format";

export const metadata = { title: "Vérification d'une pharmacie" };

const CHECKS = [
  ["autorisation", "Autorisation d'ouverture valide et au nom de la pharmacie"],
  ["ordre", "Pharmacien responsable inscrit à l'Ordre (vérifié auprès de l'Ordre)"],
  ["identite", "Pièce d'identité du responsable conforme"],
  ["adresse", "Adresse et localisation cohérentes"],
  ["telephone", "Téléphone professionnel joint et vérifié"],
];

export default async function ReviewPharmacy({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const [{ data: p }, { data: priv }, { data: docs }, { data: hist }, { data: members }] = await Promise.all([
    supabase.from("pharmacies").select("*, regions(name), circles(name), communes(name), localities(name)").eq("id", id).maybeSingle(),
    supabase.from("pharmacy_private").select("*").eq("pharmacy_id", id).maybeSingle(),
    supabase.from("pharmacy_documents").select("id, doc_type, file_name, storage_path, created_at").eq("pharmacy_id", id),
    supabase.from("pharmacy_verifications").select("id, decision, reason, checklist, created_at").eq("pharmacy_id", id).order("created_at", { ascending: false }),
    supabase.from("pharmacy_members").select("user_id, member_role").eq("pharmacy_id", id),
  ]);
  if (!p) notFound();
  const signed = await Promise.all((docs ?? []).map(async (d) => ({ ...d, url: (await supabase.storage.from("pharmacy-documents").createSignedUrl(d.storage_path, 300)).data?.signedUrl })));
  const one = <T,>(v: T | T[] | null) => (Array.isArray(v) ? v[0] : v);
  const decisions = p.status === "pending" ? ["verified", "rejected"] : p.status === "verified" ? ["suspended"] : p.status === "suspended" ? ["verified", "rejected"] : [];
  const rows: [string, string | null | undefined][] = [
    ["Adresse", `${p.address} — ${[one(p.localities)?.name, one(p.communes)?.name, one(p.circles)?.name, one(p.regions)?.name].filter(Boolean).join(", ")}`],
    ["Coordonnées GPS", p.latitude !== null ? `${p.latitude}, ${p.longitude}` : "Non renseignées"],
    ["Téléphone", formatPhone(p.phone)], ["WhatsApp", formatPhone(p.whatsapp)], ["E-mail", p.email],
    ["Pharmacien responsable", priv?.pharmacist_in_charge], ["Téléphone du responsable", formatPhone(priv?.manager_phone)],
    ["Raison sociale", priv?.legal_name], ["N° autorisation", priv?.license_number], ["N° Ordre", priv?.order_registration], ["NIF", priv?.tax_id], ["RCCM", priv?.rccm],
    ["Membres", `${members?.length ?? 0} compte(s)`],
  ];
  return (
    <div className="space-y-4">
      <Link prefetch={false} href="/admin/pharmacies" className="text-sm text-primary underline">← Pharmacies</Link>
      <div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-bold">{p.name}</h1><Badge className="bg-white">{PHARMACY_STATUS_LABEL[p.status as keyof typeof PHARMACY_STATUS_LABEL]}</Badge></div>
      <div className="grid gap-4 lg:grid-cols-[1fr_400px]">
        <div className="space-y-4">
          <Card><CardHeader><CardTitle>Informations déclarées</CardTitle></CardHeader>
            <CardContent><dl className="space-y-1 text-sm">{rows.map(([k, v]) => <div key={k} className="grid grid-cols-[180px_1fr] gap-2 border-b py-1"><dt className="text-muted-foreground">{k}</dt><dd>{v || "—"}</dd></div>)}</dl></CardContent></Card>
          <Card><CardHeader><CardTitle>Justificatifs</CardTitle></CardHeader>
            <CardContent>{!signed.length ? <Alert tone="warning" title="Aucun justificatif déposé : validation impossible." /> : (
              <ul className="space-y-2 text-sm">{signed.map((d) => <li key={d.id} className="flex items-center gap-2"><FileText className="size-4" aria-hidden />
                {d.url ? <a href={d.url} target="_blank" rel="noopener noreferrer" className="text-primary underline">{DOC_LABELS[d.doc_type]}</a> : DOC_LABELS[d.doc_type]}
                <span className="text-muted-foreground">({d.file_name}, {formatDateTime(d.created_at)})</span></li>)}</ul>)}
              <p className="mt-2 text-xs text-muted-foreground">Liens temporaires (5 minutes). Ne téléchargez pas ces documents sur des appareils non sécurisés.</p>
            </CardContent></Card>
          <Card><CardHeader><CardTitle>Horaires</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <OpeningHours hours={p.opening_hours} verified={p.hours_verified} />
              <ActionForm action={setHoursVerified}>
                <input type="hidden" name="pharmacy_id" value={p.id} /><input type="hidden" name="verified" value={String(!p.hours_verified)} />
                <SubmitButton size="sm" variant="outline">{p.hours_verified ? "Retirer la vérification des horaires" : "Marquer les horaires comme vérifiés"}</SubmitButton>
              </ActionForm>
            </CardContent></Card>
        </div>
        <div className="space-y-4">
          <Card className="border-2 border-primary/30"><CardHeader><CardTitle>Décision</CardTitle></CardHeader>
            <CardContent>{decisions.length === 0 ? <p className="text-sm text-muted-foreground">Aucune décision possible dans ce statut (la pharmacie doit d&apos;abord soumettre à nouveau).</p> : (
              <ActionForm action={reviewPharmacy} className="space-y-3">
                <input type="hidden" name="pharmacy_id" value={p.id} />
                <fieldset className="space-y-2 text-sm"><legend className="mb-1 font-medium">Points de contrôle (obligatoires pour valider)</legend>
                  {CHECKS.map(([k, label]) => <label key={k} className="flex items-start gap-2"><input type="checkbox" name={`check_${k}`} className="mt-0.5 size-4" />{label}</label>)}
                </fieldset>
                <Field label="Décision" htmlFor="decision" required>
                  <Select id="decision" name="decision" required>{decisions.map((d) => <option key={d} value={d}>{d === "verified" ? (p.status === "suspended" ? "Réactiver" : "Valider") : d === "rejected" ? "Refuser" : "Suspendre"}</option>)}</Select>
                </Field>
                <Field label="Motif / commentaire" htmlFor="reason" hint="Obligatoire pour un refus ou une suspension. Visible par la pharmacie.">
                  <Textarea id="reason" name="reason" rows={3} maxLength={1000} />
                </Field>
                <SubmitButton confirm="Enregistrer cette décision ? Elle sera journalisée.">Enregistrer la décision</SubmitButton>
              </ActionForm>)}
            </CardContent></Card>
          <Card><CardHeader><CardTitle>Historique</CardTitle></CardHeader>
            <CardContent><ul className="space-y-2 text-sm">{(hist ?? []).map((h) => <li key={h.id}><strong>{PHARMACY_STATUS_LABEL[h.decision as keyof typeof PHARMACY_STATUS_LABEL]}</strong> · {formatDateTime(h.created_at)}{h.reason ? <span className="block text-muted-foreground">{h.reason}</span> : null}</li>)}</ul></CardContent></Card>
          <Card><CardHeader><CardTitle>Changement de titulaire</CardTitle></CardHeader>
            <CardContent>
              <p className="mb-3 text-xs text-muted-foreground">Départ du titulaire : vérifiez d&apos;abord les justificatifs du nouveau titulaire (autorisation, inscription à l&apos;Ordre, identité). Le nouveau titulaire doit avoir un compte PharmaProxi ; l&apos;ancien devient collaborateur.</p>
              <ActionForm action={transferPharmacyOwner} resetOnSuccess className="space-y-3">
                <input type="hidden" name="pharmacy_id" value={p.id} />
                <Field label="E-mail du nouveau titulaire" htmlFor="new_owner" required><Input id="new_owner" name="email" type="email" required autoComplete="off" /></Field>
                <Field label="Motif et pièces vérifiées" htmlFor="transfer_reason" required><Textarea id="transfer_reason" name="reason" rows={2} required maxLength={500} /></Field>
                <SubmitButton variant="outline" confirm="Transférer la titularité ? L'opération est journalisée.">Transférer la titularité</SubmitButton>
              </ActionForm>
            </CardContent></Card>
        </div>
      </div>
    </div>
  );
}
