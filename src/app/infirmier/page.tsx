import Link from "next/link";
import { BadgeCheck, FileUp, Inbox, Stethoscope } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getGeo } from "@/lib/geo";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Field, Input } from "@/components/ui/input";
import { LocationPicker } from "@/components/location-picker";
import { registerNurse, setHomeCareStatus, updateNurseSelf, uploadNurseDocument } from "@/app/actions/v031";
import { CARE_TYPES } from "@/lib/nurses";
import { HCR_STATUS, NURSE_DOC_LABELS, NURSE_STATUS, SLOTS, type HomeCareRequest } from "@/lib/nurse-space";
import { formatDate, formatDateTime, formatPhone } from "@/lib/format";

export const metadata = { title: "Espace infirmier" };
export const dynamic = "force-dynamic";

type Nurse = { id: string; display_name: string; registration_number: string; specialty: string | null; region_id: string | null; commune_id: string | null; areas: string | null;
  care_types: string[]; hours: string | null; prices: string | null; phone: string | null; phone_public: boolean; accepts_requests: boolean; status: string; status_reason: string | null;
  is_published: boolean; register_id: string | null };

export default async function EspaceInfirmier() {
  await requireUser("/infirmier");
  const supabase = await createClient();
  const [{ data: me }, geo] = await Promise.all([supabase.rpc("nurse_me"), getGeo()]);
  const n = ((me ?? []) as Nurse[])[0];
  if (!n) {
    return (
      <div className="container-page max-w-3xl space-y-5 py-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold"><Stethoscope className="size-6 text-brand-green" aria-hidden /> Espace infirmier</h1>
        <p className="text-sm text-muted-foreground">Infirmier ou infirmière diplômé(e) d&apos;État ? Inscrivez-vous gratuitement : après vérification de votre inscription à l&apos;Ordre, votre fiche apparaît dans l&apos;annuaire des soins à domicile et les patients peuvent vous envoyer des demandes. Vous choisissez ce qui est publié.</p>
        <ol className="list-decimal space-y-1 ps-5 text-sm"><li>Vous remplissez ce formulaire.</li><li>Vous déposez votre attestation de l&apos;Ordre et une pièce d&apos;identité.</li><li>L&apos;équipe SantéProxi vérifie (au besoin avec le tableau de l&apos;Ordre) puis publie votre fiche.</li></ol>
        <ActionForm action={registerNurse} className="space-y-3 rounded-2xl border bg-white p-4" labels={{ display_name: "Nom", registration_number: "Numéro" }}>
          <Field label="Nom et prénom" htmlFor="dn" required><Input id="dn" name="display_name" required minLength={3} maxLength={120} /></Field>
          <Field label="Numéro d'inscription à l'Ordre des infirmiers" htmlFor="rn" required><Input id="rn" name="registration_number" required maxLength={40} dir="ltr" /></Field>
          <Field label="Spécialité ou titre (facultatif)" htmlFor="sp"><Input id="sp" name="specialty" maxLength={160} placeholder="ex. Infirmier d'État, sage-femme" /></Field>
          <div><p className="mb-1 text-sm font-medium">Lieu d&apos;exercice</p><LocationPicker geo={geo} names={{ region: "region_id", commune: "commune_id" }} /></div>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="consent" className="mt-1 size-4" required /><span>J&apos;accepte que ma fiche (nom, spécialité, zone, soins proposés) soit publiée dans l&apos;annuaire <strong>après vérification</strong>. Mon téléphone ne sera affiché que si je l&apos;autorise.</span></label>
          <SubmitButton>M&apos;inscrire</SubmitButton>
        </ActionForm>
      </div>
    );
  }
  const [{ data: docs }, { data: reqs }] = await Promise.all([
    supabase.from("nurse_documents").select("id, doc_type, file_name, created_at").eq("nurse_id", n.id).order("created_at", { ascending: false }),
    supabase.from("home_care_requests").select("id, reference, care_type, preferred_date, preferred_slot, area, contact_phone, message, has_prescription, status, nurse_reply, created_at").eq("nurse_id", n.id).order("preferred_date").limit(200),
  ]);
  const requests = (reqs ?? []) as HomeCareRequest[];
  const pending = requests.filter((r) => r.status === "demande"); const upcoming = requests.filter((r) => r.status === "acceptee");
  const card = (r: HomeCareRequest) => (
    <li key={r.id} className="rounded-xl border bg-white p-3 text-sm">
      <p className="font-semibold"><span className="font-mono" dir="ltr">{r.reference}</span> · {CARE_TYPES[r.care_type]} <span className={`ms-1 rounded-full px-2 py-0.5 text-xs ${HCR_STATUS[r.status][1]}`}>{HCR_STATUS[r.status][0]}</span></p>
      <p>{formatDate(r.preferred_date)} · {SLOTS[r.preferred_slot]} · {r.area}</p>
      <p>Rappeler au <a className="font-semibold underline" href={`tel:${r.contact_phone}`}>{formatPhone(r.contact_phone)}</a>{r.has_prescription ? " · ordonnance disponible" : ""}</p>
      {r.message && <p className="mt-1 rounded-lg bg-muted/50 p-2">{r.message}</p>}
      {r.status === "demande" && (
        <ActionForm action={setHomeCareStatus} className="mt-2 space-y-2"><input type="hidden" name="id" value={r.id} />
          <label className="block"><span className="sr-only">Message au patient</span><Input name="reply" maxLength={500} placeholder="Message au patient (ex. je passe vers 9 h)" /></label>
          <div className="flex gap-2"><button name="status" value="acceptee" className="min-h-10 rounded-lg bg-[#052D1E] px-4 font-semibold text-white">Accepter</button>
            <button name="status" value="refusee" className="min-h-10 rounded-lg border px-4 font-semibold">Refuser</button></div>
        </ActionForm>
      )}
      {r.status === "acceptee" && <ActionForm action={setHomeCareStatus} className="mt-2"><input type="hidden" name="id" value={r.id} /><input type="hidden" name="status" value="terminee" /><SubmitButton size="sm" variant="outline">Soins effectués</SubmitButton></ActionForm>}
    </li>
  );
  return (
    <div className="container-page max-w-4xl space-y-5 py-6">
      <h1 className="flex items-center gap-2 text-2xl font-bold"><Stethoscope className="size-6 text-brand-green" aria-hidden /> Espace infirmier — {n.display_name}</h1>
      <p className={`rounded-xl p-3 text-sm ${n.status === "verified" ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-950"}`}>
        {n.status === "verified" ? <><BadgeCheck className="me-1 inline size-4" aria-hidden />Inscription vérifiée. {n.is_published ? <>Votre fiche est visible dans <Link prefetch={false} href="/infirmiers" className="underline">l&apos;annuaire des soins à domicile</Link>.</> : "Votre fiche est masquée : cochez « Publier ma fiche » ci-dessous."}</>
          : <>Statut : <strong>{NURSE_STATUS[n.status]}</strong>{n.status_reason ? ` — ${n.status_reason}` : ""}. {n.status === "pending" ? "Déposez vos justificatifs : votre fiche sera publiée après vérification." : ""}</>}
        {n.register_id && n.status === "pending" && " Votre numéro a été retrouvé dans le tableau de l'Ordre importé."}
      </p>

      <section className="space-y-2" aria-labelledby="dem"><h2 id="dem" className="flex items-center gap-2 text-lg font-bold"><Inbox className="size-5" aria-hidden /> Demandes à traiter ({pending.length})</h2>
        {pending.length === 0 ? <p className="text-sm text-muted-foreground">Aucune nouvelle demande.</p> : <ul className="grid gap-2 sm:grid-cols-2">{pending.map(card)}</ul>}
        <h2 className="pt-2 text-lg font-bold">Soins acceptés à venir ({upcoming.length})</h2>
        {upcoming.length === 0 ? <p className="text-sm text-muted-foreground">Aucun soin prévu.</p> : <ul className="grid gap-2 sm:grid-cols-2">{upcoming.map(card)}</ul>}
        <p className="text-xs text-muted-foreground">Les demandes contiennent des informations de santé : elles ne sont visibles que par vous et le patient, pas par l&apos;équipe SantéProxi.</p>
      </section>

      <section className="rounded-2xl border bg-white p-4"><h2 className="text-lg font-bold">Ma fiche</h2>
        <ActionForm action={updateNurseSelf} className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Spécialité ou titre" htmlFor="sp2"><Input id="sp2" name="specialty" defaultValue={n.specialty ?? ""} maxLength={160} /></Field>
          <div><p className="mb-1 text-sm font-medium">Lieu d&apos;exercice</p><LocationPicker geo={geo} names={{ region: "region_id", commune: "commune_id" }} defaults={{ region: n.region_id ?? undefined, commune: n.commune_id ?? undefined }} /></div>
          <Field label="Quartiers où je me déplace" htmlFor="ar" className="sm:col-span-2"><Input id="ar" name="areas" defaultValue={n.areas ?? ""} maxLength={300} placeholder="ex. Hamdallaye, Lafiabougou, Djicoroni Para" /></Field>
          <fieldset className="sm:col-span-2"><legend className="text-sm font-medium">Soins proposés</legend>
            <div className="mt-1 grid gap-1 sm:grid-cols-3">{Object.entries(CARE_TYPES).map(([k, l]) => <label key={k} className="flex min-h-10 items-center gap-2 rounded-lg border px-2 text-sm"><input type="checkbox" name="care_types" value={k} defaultChecked={n.care_types.includes(k)} /> {l}</label>)}</div></fieldset>
          <Field label="Horaires" htmlFor="hr"><Input id="hr" name="hours" defaultValue={n.hours ?? ""} maxLength={200} placeholder="ex. lundi au samedi, 8 h – 19 h" /></Field>
          <Field label="Tarifs indicatifs (que vous communiquez)" htmlFor="pr"><Input id="pr" name="prices" defaultValue={n.prices ?? ""} maxLength={300} /></Field>
          <Field label="Téléphone" htmlFor="ph"><Input id="ph" name="phone" type="tel" defaultValue={n.phone ?? ""} dir="ltr" /></Field>
          <div className="space-y-2 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" name="phone_public" defaultChecked={n.phone_public} className="size-4" /> Afficher mon téléphone dans l&apos;annuaire</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="accepts_requests" defaultChecked={n.accepts_requests} className="size-4" /> Recevoir des demandes de soins en ligne</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="published" defaultChecked={n.is_published} disabled={n.status !== "verified"} className="size-4" /> Publier ma fiche{n.status !== "verified" ? " (après vérification)" : ""}</label>
          </div>
          <div className="sm:col-span-2"><SubmitButton>Enregistrer</SubmitButton></div>
        </ActionForm>
      </section>

      <section className="rounded-2xl border bg-white p-4"><h2 className="flex items-center gap-2 text-lg font-bold"><FileUp className="size-5" aria-hidden /> Justificatifs</h2>
        <p className="text-sm text-muted-foreground">Visibles seulement par vous et l&apos;équipe de vérification. Formats PDF, JPEG, PNG ou WebP, 5 Mo maximum.</p>
        {(docs ?? []).length > 0 && <ul className="mt-2 list-disc ps-5 text-sm">{(docs ?? []).map((d) => <li key={d.id}>{NURSE_DOC_LABELS[d.doc_type]} — {d.file_name} ({formatDateTime(d.created_at)})</li>)}</ul>}
        <ActionForm action={uploadNurseDocument} className="mt-3 flex flex-wrap items-end gap-2"><input type="hidden" name="nurse_id" value={n.id} />
          <label className="text-sm"><span className="block font-medium">Type</span><select name="doc_type" className="mt-1 h-10 rounded-lg border bg-white px-2">{Object.entries(NURSE_DOC_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          <label className="text-sm"><span className="block font-medium">Fichier</span><input type="file" name="file" accept="application/pdf,image/jpeg,image/png,image/webp" required className="mt-1 text-sm" /></label>
          <SubmitButton size="sm">Déposer</SubmitButton>
        </ActionForm>
      </section>
    </div>
  );
}
