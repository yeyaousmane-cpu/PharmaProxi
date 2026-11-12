import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Field, Input, Select } from "@/components/ui/input";
import { setAccessInfo, declareServiceStatus, endServiceStatus, facilityAppointmentAction } from "@/app/actions/v041";
import { ACCESS_FIELDS, SERVICE_STATUS, APPT_STATUS } from "@/lib/orientation-partners";
import { formatDateTime, formatPhone } from "@/lib/format";

export const metadata = { title: "Espace établissement partenaire", robots: { index: false } };
export const dynamic = "force-dynamic";

type Appt = { id: string; reference: string; patient: string; phone: string | null; service: string; reason: string | null; preferred: string; status: string; proposed_at: string | null; facility_message: string | null; created_at: string };

export default async function Espace({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const sp = await searchParams;
  const s = await requireUser("/etablissements/espace");
  const supabase = await createClient();
  const { data: mem } = await supabase.from("facility_partner_members").select("facility_id, role_label, facility_listings(id, name)").eq("user_id", s.userId).eq("active", true);
  const list = ((mem ?? []) as unknown as { facility_id: string; role_label: string | null; facility_listings: { id: string; name: string } | null }[]).filter((m) => m.facility_listings);
  if (!list.length) return (
    <div className="container-page max-w-2xl space-y-3 py-8">
      <h1 className="text-2xl font-bold">Espace établissement partenaire</h1>
      <p className="rounded-xl border bg-white p-4 text-sm">Votre compte n&apos;est rattaché à aucun établissement. Le rattachement est fait par l&apos;équipe SantéProxi après vérification auprès de l&apos;établissement (appel au standard, document de la direction). Écrivez-nous depuis la page <Link prefetch={false} href="/infos/contact" className="underline">Contact</Link>.</p>
    </div>
  );
  const cur = list.find((m) => m.facility_id === sp.f) ?? list[0];
  const fid = cur.facility_id;
  const [{ data: acc }, { data: st }, { data: ap }] = await Promise.all([
    supabase.from("facility_access_info").select("field, value, source_kind, confirmed_at").eq("facility_id", fid),
    supabase.from("facility_service_status").select("id, service, status, message, valid_until").eq("facility_id", fid).gt("valid_until", new Date().toISOString()).order("created_at", { ascending: false }),
    supabase.rpc("facility_appointment_inbox", { p_facility: fid }),
  ]);
  const access = new Map(((acc ?? []) as { field: string; value: string; source_kind: string; confirmed_at: string }[]).map((a) => [a.field, a]));
  const appts = (ap ?? []) as Appt[];
  const minDt = new Date(Date.now() + 3600_000).toISOString().slice(0, 16);
  return (
    <div className="container-page max-w-4xl space-y-5 py-6">
      <h1 className="text-2xl font-bold">Espace établissement : {cur.facility_listings!.name}</h1>
      {list.length > 1 ? <p className="flex flex-wrap gap-2 text-sm">{list.map((m) => <Link key={m.facility_id} prefetch={false} href={`/etablissements/espace?f=${m.facility_id}`} className="rounded-full border bg-white px-3 py-1">{m.facility_listings!.name}</Link>)}</p> : null}
      <p className="text-sm"><Link prefetch={false} href={`/etablissements/${fid}`} className="text-primary underline">Voir la fiche publique</Link> · Tout ce que vous publiez ici est daté et affiché « indiqué par l&apos;établissement ».</p>

      <section className="space-y-3 rounded-2xl border bg-white p-4" aria-labelledby="rv">
        <h2 id="rv" className="text-lg font-bold">Demandes de rendez-vous ({appts.filter((a) => ["envoyee", "proposee", "confirmee"].includes(a.status)).length} en cours)</h2>
        {appts.length === 0 ? <p className="text-sm text-muted-foreground">Aucune demande.</p> : (
          <ul className="space-y-2">{appts.map((a) => (
            <li key={a.id} className="space-y-2 rounded-xl border p-3 text-sm">
              <p><strong>{a.reference}</strong> · {a.patient}{a.phone ? <> · <a href={`tel:${a.phone}`} className="underline">{formatPhone(a.phone)}</a></> : " · téléphone non partagé"} · <strong>{APPT_STATUS[a.status]}</strong></p>
              <p>{a.service} — disponibilités : {a.preferred}{a.reason ? ` — motif : ${a.reason}` : ""}</p>
              {a.proposed_at ? <p className="text-xs">Créneau proposé : {formatDateTime(a.proposed_at)}{a.facility_message ? ` — ${a.facility_message}` : ""}</p> : null}
              {["envoyee", "proposee"].includes(a.status) ? (
                <div className="flex flex-wrap items-end gap-2">
                  <ActionForm action={facilityAppointmentAction} className="flex flex-wrap items-end gap-2"><input type="hidden" name="id" value={a.id} /><input type="hidden" name="action" value="proposer" />
                    <Field label="Date et heure" htmlFor={`at-${a.id}`}><Input id={`at-${a.id}`} name="at" type="datetime-local" min={minDt} required /></Field>
                    <Field label="Message" htmlFor={`m-${a.id}`}><Input id={`m-${a.id}`} name="message" maxLength={300} placeholder="ex. Venez avec votre carnet" /></Field>
                    <SubmitButton size="sm">Proposer ce créneau</SubmitButton></ActionForm>
                  <ActionForm action={facilityAppointmentAction} className="flex flex-wrap items-end gap-2"><input type="hidden" name="id" value={a.id} /><input type="hidden" name="action" value="refuser" />
                    <Field label="Raison" htmlFor={`r-${a.id}`}><Input id={`r-${a.id}`} name="message" minLength={5} maxLength={300} required /></Field>
                    <SubmitButton size="sm" variant="ghost">Refuser</SubmitButton></ActionForm>
                </div>
              ) : a.status === "confirmee" ? (
                <div className="flex gap-2">{(["honoree", "non_venu"] as const).map((k) => <ActionForm key={k} action={facilityAppointmentAction}><input type="hidden" name="id" value={a.id} /><input type="hidden" name="action" value={k} /><SubmitButton size="sm" variant="outline">{k === "honoree" ? "Venu" : "Absent"}</SubmitButton></ActionForm>)}</div>
              ) : null}
            </li>))}</ul>
        )}
      </section>

      <section className="space-y-3 rounded-2xl border bg-white p-4" aria-labelledby="sv">
        <h2 id="sv" className="text-lg font-bold">État temporaire d&apos;un service</h2>
        <p className="text-xs text-muted-foreground">Ex. maternité saturée, bloc fermé pour travaux, panne du scanner. L&apos;information disparaît automatiquement à l&apos;échéance (72 h au maximum).</p>
        {((st ?? []) as { id: string; service: string; status: string; message: string | null; valid_until: string }[]).map((x) => (
          <div key={x.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-muted/40 p-2 text-sm"><span><strong>{x.service}</strong> : {SERVICE_STATUS[x.status]?.label}{x.message ? ` — ${x.message}` : ""} · jusqu&apos;au {formatDateTime(x.valid_until)}</span>
            <ActionForm action={endServiceStatus}><input type="hidden" name="id" value={x.id} /><SubmitButton size="sm" variant="ghost">Retirer</SubmitButton></ActionForm></div>))}
        <ActionForm action={declareServiceStatus} className="grid gap-2 sm:grid-cols-4" resetOnSuccess><input type="hidden" name="id" value={fid} />
          <Field label="Service" htmlFor="sv-s"><Input id="sv-s" name="service" required minLength={2} maxLength={80} placeholder="ex. Maternité" /></Field>
          <Field label="État" htmlFor="sv-t"><Select id="sv-t" name="status" defaultValue="perturbe">{Object.entries(SERVICE_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select></Field>
          <Field label="Pendant" htmlFor="sv-h"><Select id="sv-h" name="hours" defaultValue="24">{[2, 6, 12, 24, 48, 72].map((h) => <option key={h} value={h}>{h} heures</option>)}</Select></Field>
          <Field label="Message" htmlFor="sv-m"><Input id="sv-m" name="message" maxLength={300} placeholder="ex. Orientez vers le CSRéf voisin" /></Field>
          <div><SubmitButton size="sm">Publier</SubmitButton></div>
        </ActionForm>
      </section>

      <section className="space-y-3 rounded-2xl border bg-white p-4" aria-labelledby="ac">
        <h2 id="ac" className="text-lg font-bold">Conditions d&apos;accès</h2>
        <p className="text-xs text-muted-foreground">Indiquez seulement ce qui est exact aujourd&apos;hui. Les tarifs sont affichés comme « indicatifs, à confirmer sur place ». Laissez vide et enregistrez pour retirer une information.</p>
        <ul className="space-y-2">{Object.entries(ACCESS_FIELDS).map(([k, label]) => {
          const a = access.get(k);
          return (
            <li key={k}><ActionForm action={setAccessInfo} className="grid gap-2 sm:grid-cols-[14rem_1fr_auto] sm:items-end"><input type="hidden" name="id" value={fid} /><input type="hidden" name="field" value={k} />
              <span className="text-sm font-medium">{label}{a ? <span className="block text-xs font-normal text-muted-foreground">mis à jour le {formatDateTime(a.confirmed_at)}</span> : null}</span>
              <Input name="value" defaultValue={a?.value} maxLength={300} aria-label={label} className="h-10" />
              <SubmitButton size="sm" variant="outline">Enregistrer</SubmitButton></ActionForm></li>);
        })}</ul>
      </section>
    </div>
  );
}
