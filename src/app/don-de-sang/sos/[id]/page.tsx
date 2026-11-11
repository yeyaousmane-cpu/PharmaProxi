import Link from "next/link";
import { notFound } from "next/navigation";
import { HandHeart, Phone, ShieldCheck, TriangleAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";
import { formatDateTime, formatPhone } from "@/lib/format";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Input, Select } from "@/components/ui/input";
import { BloodNav } from "@/components/blood/blood-nav";
import { mobilizeDonors, reportBloodRequest, respondBloodRequest, setBloodRequestStatus } from "@/app/actions/donor";
import { COMPAT_NOTICE, PRODUCTS, REQUEST_STATUS, REQUESTER_KINDS, URGENCY } from "@/lib/donor";
import type { BloodRequest } from "@/components/blood/request-card";

export const metadata = { title: "Demande de sang", robots: { index: false } };
export const dynamic = "force-dynamic";

type Resp = { donor_code: string; name: string | null; phone: string | null; blood_group: string | null; group_verified: boolean; status: string; created_at: string };
type Hist = { status: string; note: string | null; created_at: string };

export default async function SosDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const session = await getSession();
  const supabase = await createClient();
  const { data } = await supabase.from("blood_requests")
    .select("id, reference, requester_kind, blood_group, product, units, facility_name, region_id, place_detail, needed_at, urgency, status, verified_at, expires_at, created_at, regions(name)").eq("id", id).maybeSingle();
  if (!data) notFound();
  const r = data as unknown as BloodRequest;
  const [validator, isRequester, donor, myResp] = session ? await Promise.all([
    supabase.rpc("is_blood_validator").then((x) => !!x.data),
    supabase.rpc("blood_request_is_mine", { p_id: id }).then((x) => !!x.data),
    supabase.from("blood_donor_profiles").select("blood_group, accepts_solicitations").eq("user_id", session.userId).maybeSingle().then((x) => x.data as { blood_group: string | null } | null),
    supabase.from("blood_request_responses").select("status, share_phone").eq("request_id", id).eq("donor_id", session.userId).maybeSingle().then((x) => x.data as { status: string; share_phone: boolean } | null),
  ]) : [false, false, null, null];
  const privileged = validator || isRequester;
  const [contact, responders, history] = privileged ? await Promise.all([
    supabase.rpc("blood_request_contact", { p_id: id }).then((x) => x.data as { contact_name: string; contact_phone: string; description: string | null; status_note: string | null } | null),
    supabase.rpc("blood_request_responders", { p_id: id }).then((x) => (x.data ?? []) as Resp[]),
    supabase.from("blood_request_history").select("status, note, created_at").eq("request_id", id).order("created_at").then((x) => (x.data ?? []) as Hist[]),
  ]) : [null, [] as Resp[], [] as Hist[]];
  const open = ["verifiee", "mobilisation"].includes(r.status) && new Date(r.expires_at) > new Date();
  const [ul, uc] = URGENCY[r.urgency]; const [sl, sc] = REQUEST_STATUS[r.status];
  return (
    <div className="container-page max-w-3xl space-y-5 py-6">
      <BloodNav current="/don-de-sang/sos" validator={validator} />
      <header className="space-y-2">
        <p className="text-sm"><Link prefetch={false} href="/don-de-sang/sos" className="text-primary underline">← SOS Besoin de sang</Link></p>
        <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold text-brand-deep"><span className="rounded-lg bg-red-50 px-2 py-1 font-mono text-red-700">{r.blood_group}</span> {r.facility_name}</h1>
        <div className="flex flex-wrap gap-2"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${uc}`}>{ul}</span><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${sc}`}>{sl}</span>
          <span className="text-xs text-muted-foreground" dir="ltr">{r.reference}</span></div>
      </header>
      <dl className="grid gap-2 rounded-2xl border bg-white p-4 text-sm sm:grid-cols-2">
        <div><dt className="text-muted-foreground">Produit</dt><dd className="font-semibold">{PRODUCTS[r.product]} · {r.units} poche{r.units > 1 ? "s" : ""}</dd></div>
        <div><dt className="text-muted-foreground">Nécessaire pour</dt><dd className="font-semibold">{formatDateTime(r.needed_at)}</dd></div>
        <div><dt className="text-muted-foreground">Lieu</dt><dd>{r.facility_name}{r.place_detail ? ` — ${r.place_detail}` : ""} · {r.regions?.name ?? "région non précisée"}</dd></div>
        <div><dt className="text-muted-foreground">Signalé par</dt><dd>{REQUESTER_KINDS[r.requester_kind]}</dd></div>
        <div><dt className="text-muted-foreground">Vérifiée</dt><dd>{r.verified_at ? `le ${formatDateTime(r.verified_at)} par le CNTS ou l'administration` : "pas encore"}</dd></div>
        <div><dt className="text-muted-foreground">Visible jusqu&apos;au</dt><dd>{formatDateTime(r.expires_at)}</dd></div>
      </dl>
      <p className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"><TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />{COMPAT_NOTICE} Ne versez jamais d&apos;argent.</p>

      {open && !isRequester && (
        <section className="space-y-2 rounded-2xl border bg-white p-4">
          <h2 className="flex items-center gap-2 font-bold text-brand-deep"><HandHeart className="size-5 text-red-600" aria-hidden /> Je peux aider</h2>
          {!session ? <p className="text-sm"><Link prefetch={false} href={`/connexion?suite=${encodeURIComponent(`/don-de-sang/sos/${id}`)}`} className="font-semibold text-primary underline">Connectez-vous</Link> pour indiquer que vous êtes disponible.</p>
          : !donor ? <p className="text-sm">Créez d&apos;abord votre <Link prefetch={false} href="/don-de-sang/mon-espace" className="font-semibold text-primary underline">espace donneur</Link> (groupe sanguin, région).</p>
          : myResp && myResp.status === "disponible" ? (
            <ActionForm action={respondBloodRequest} className="space-y-2 text-sm"><input type="hidden" name="id" value={id} /><input type="hidden" name="withdraw" value="1" />
              <p>Vous avez indiqué être disponible{myResp.share_phone ? " et accepté de partager votre numéro avec le demandeur" : ""}. Attendez la confirmation du CNTS ou de la famille avant de vous déplacer.</p>
              <SubmitButton size="sm" variant="outline">Je ne suis plus disponible</SubmitButton></ActionForm>
          ) : (
            <ActionForm action={respondBloodRequest} className="space-y-2 text-sm"><input type="hidden" name="id" value={id} />
              <p>Votre groupe déclaré : <strong>{donor.blood_group ?? "non renseigné"}</strong>. Le centre vérifiera votre aptitude et la compatibilité sur place.</p>
              <label className="flex items-start gap-2"><input type="checkbox" name="share_phone" className="mt-1 size-4" /> J&apos;accepte que le demandeur voie mon numéro de téléphone (le CNTS le voit dans tous les cas).</label>
              <SubmitButton>Je suis disponible</SubmitButton></ActionForm>
          )}
        </section>
      )}

      {privileged && (
        <section className="space-y-3 rounded-2xl border border-brand-deep/20 bg-white p-4 text-sm">
          <h2 className="flex items-center gap-2 font-bold text-brand-deep"><ShieldCheck className="size-5" aria-hidden /> {validator ? "Espace CNTS" : "Votre demande"} (non public)</h2>
          {contact && <p className="flex flex-wrap items-center gap-2"><Phone className="size-4" aria-hidden /> {contact.contact_name} · <a href={`tel:${contact.contact_phone}`} className="font-semibold text-primary" dir="ltr">{formatPhone(contact.contact_phone)}</a>{contact.description ? ` · ${contact.description}` : ""}</p>}
          {contact?.status_note && <p>Note : {contact.status_note}</p>}
          <div>
            <h3 className="font-semibold">Donneurs qui se sont manifestés ({responders.filter((x) => x.status !== "annule").length})</h3>
            {responders.length === 0 ? <p className="text-muted-foreground">Personne pour le moment.</p> : (
              <ul className="divide-y">{responders.map((x) => (
                <li key={x.donor_code} className="py-1.5">{x.name ?? "Donneur"} · <span className="font-mono">{x.donor_code}</span> · groupe {x.blood_group ?? "?"}{x.group_verified ? " (confirmé)" : " (déclaré)"}{x.status === "annule" ? " · retiré" : ""}
                  {x.phone && <> · <a href={`tel:${x.phone}`} className="font-semibold text-primary" dir="ltr">{formatPhone(x.phone)}</a></>}</li>))}</ul>
            )}
          </div>
          {validator && (
            <div className="grid gap-2 md:grid-cols-2">
              {["verifiee", "mobilisation"].includes(r.status) && (
                <ActionForm action={mobilizeDonors} className="space-y-1 rounded-xl bg-red-50 p-3"><input type="hidden" name="id" value={id} />
                  <p className="text-xs">Prévient dans SantéProxi les donneurs qui ont accepté d&apos;être sollicités, de groupe théoriquement compatible, de la même région, dont la date indicative est passée et non sollicités dans les 7 derniers jours. Aucun SMS n&apos;est envoyé.</p>
                  <SubmitButton size="sm">Prévenir les donneurs volontaires</SubmitButton></ActionForm>
              )}
              <ActionForm action={setBloodRequestStatus} className="space-y-2 rounded-xl bg-muted/50 p-3"><input type="hidden" name="id" value={id} />
                <Select name="status" defaultValue={r.status === "en_attente" ? "verifiee" : "prise_en_charge"} className="h-10">
                  {r.status === "en_attente" && <option value="verifiee">Vérifiée auprès de l&apos;établissement</option>}
                  <option value="prise_en_charge">Prise en charge par le centre</option><option value="satisfaite">Besoin satisfait</option><option value="cloturee">Clôturer</option><option value="rejetee">Rejeter</option></Select>
                <Input name="note" maxLength={300} placeholder="Note (obligatoire pour un rejet, transmise au demandeur)" className="h-10" />
                <SubmitButton size="sm" variant="outline">Mettre à jour</SubmitButton></ActionForm>
            </div>
          )}
          {isRequester && !validator && !["satisfaite", "cloturee", "rejetee"].includes(r.status) && (
            <div className="flex flex-wrap gap-2">
              <ActionForm action={setBloodRequestStatus}><input type="hidden" name="id" value={id} /><input type="hidden" name="status" value="satisfaite" /><SubmitButton size="sm">Le besoin est satisfait</SubmitButton></ActionForm>
              <ActionForm action={setBloodRequestStatus}><input type="hidden" name="id" value={id} /><input type="hidden" name="status" value="cloturee" /><SubmitButton size="sm" variant="outline">Clôturer ma demande</SubmitButton></ActionForm>
            </div>
          )}
          {history.length > 0 && <ol className="space-y-0.5 border-s ps-3 text-xs text-muted-foreground">{history.map((h, i) => <li key={i}>{formatDateTime(h.created_at)} — {REQUEST_STATUS[h.status]?.[0] ?? h.status}{h.note ? ` : ${h.note}` : ""}</li>)}</ol>}
        </section>
      )}

      {session && !privileged && (
        <details className="rounded-2xl border bg-white p-4 text-sm">
          <summary className="cursor-pointer font-semibold">Signaler une demande suspecte</summary>
          <ActionForm action={reportBloodRequest} className="mt-2 flex flex-wrap items-end gap-2"><input type="hidden" name="id" value={id} />
            <label className="min-w-0 flex-1 text-xs">Ce qui vous paraît suspect<Input name="reason" required minLength={5} maxLength={300} className="mt-1 h-10" placeholder="ex. on m'a demandé de l'argent" /></label>
            <SubmitButton size="sm" variant="outline">Signaler</SubmitButton></ActionForm>
          <p className="mt-1 text-xs text-muted-foreground">Après 3 signalements, la demande est masquée jusqu&apos;à l&apos;examen du CNTS.</p>
        </details>
      )}
    </div>
  );
}
