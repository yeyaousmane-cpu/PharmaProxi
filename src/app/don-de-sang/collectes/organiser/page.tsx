import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { BloodNav } from "@/components/blood/blood-nav";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { proposeCampaign, withdrawCampaign, reportCampaignOutcome } from "@/app/actions/v040";
import { ORG_KIND, PROPOSAL_STATUS } from "@/lib/campaigns";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Organiser une collecte de sang" };
export const dynamic = "force-dynamic";

type P = { id: string; reference: string; title: string; organization_name: string; starts_on: string; start_time: string; place: string; status: string; review_note: string | null; campaign_id: string | null; outcome_present: number | null; outcome_collected: number | null; outcome_at: string | null };

export default async function Organiser() {
  await requireUser("/don-de-sang/collectes/organiser");
  const supabase = await createClient();
  const [{ data: regions }, { data: mine }] = await Promise.all([
    supabase.from("regions").select("id, name").order("name"),
    supabase.from("blood_campaign_proposals").select("id, reference, title, organization_name, starts_on, start_time, place, status, review_note, campaign_id, outcome_present, outcome_collected, outcome_at").order("created_at", { ascending: false }).limit(30),
  ]);
  const list = (mine ?? []) as P[];
  const counts = await Promise.all(list.map(async (p) => (p.status === "validee" ? ((await supabase.rpc("campaign_organizer_counts", { p_proposal: p.id })).data as { inscrits_creneaux: number; j_y_serai: number } | null) : null)));
  const today = new Date().toISOString().slice(0, 10);
  const minDate = new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10);
  return (
    <div className="container-page max-w-3xl space-y-5 py-6">
      <BloodNav current="/don-de-sang/collectes" />
      <h1 className="text-2xl font-bold">Organiser une collecte de sang</h1>
      <div className="space-y-1 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-950">
        <p><strong>Comment ça marche.</strong> Votre organisation (association, entreprise, université, lieu de culte, mairie…) mobilise les donneurs et fournit le lieu. Le prélèvement est toujours réalisé par une structure habilitée (CNTS ou banque de sang d&apos;un hôpital), que vous contactez d&apos;abord.</p>
        <p>La collecte n&apos;est publiée qu&apos;après vérification par le CNTS ou l&apos;équipe SantéProxi, et seulement si la structure de collecte a confirmé sa participation.</p>
      </div>
      <section className="space-y-3 rounded-2xl border bg-white p-4">
        <h2 className="text-lg font-bold">Proposer une collecte</h2>
        <ActionForm action={proposeCampaign} className="grid gap-3 sm:grid-cols-2" resetOnSuccess>
          <Field label="Nom de l'organisation" htmlFor="on" required><Input id="on" name="organization_name" maxLength={140} required /></Field>
          <Field label="Type" htmlFor="ok"><Select id="ok" name="organization_kind" defaultValue="association">{Object.entries(ORG_KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
          <Field label="Téléphone du responsable" htmlFor="cp" required><Input id="cp" name="contact_phone" inputMode="tel" required placeholder="+223 70 00 00 00" /></Field>
          <Field label="Titre de la collecte" htmlFor="ti" required><Input id="ti" name="title" maxLength={140} required placeholder="ex. Collecte de la rentrée" /></Field>
          <Field label="Région" htmlFor="rg" required><Select id="rg" name="region_id" required defaultValue="">{[<option key="" value="">—</option>, ...(regions ?? []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)]}</Select></Field>
          <Field label="Lieu précis" htmlFor="pl" required><Input id="pl" name="place" maxLength={200} required placeholder="ex. Cour de la mairie, Commune IV" /></Field>
          <Field label="Date (7 jours à l'avance au moins)" htmlFor="da" required><Input id="da" name="starts_on" type="date" min={minDate} required /></Field>
          <div className="grid grid-cols-2 gap-2"><Field label="Début" htmlFor="st" required><Input id="st" name="start_time" type="time" required /></Field><Field label="Fin" htmlFor="et" required><Input id="et" name="end_time" type="time" required /></Field></div>
          <Field label="Structure qui réalise les prélèvements" htmlFor="cs" required><Input id="cs" name="collecting_structure" maxLength={160} required placeholder="ex. CNTS de Bamako" /></Field>
          <Field label="Accord de cette structure" htmlFor="ca"><Select id="ca" name="collecting_agreement" defaultValue="en_discussion"><option value="confirme">Confirmé</option><option value="en_discussion">En discussion</option></Select></Field>
          <Field label="Donneurs attendus (estimation)" htmlFor="ed"><Input id="ed" name="expected_donors" inputMode="numeric" pattern="\d*" /></Field>
          <div className="grid grid-cols-2 gap-2"><Field label="Créneaux" htmlFor="sm"><Select id="sm" name="slot_minutes" defaultValue=""><option value="">Sans créneau</option><option value="30">30 min</option><option value="60">1 heure</option></Select></Field>
            <Field label="Places par créneau" htmlFor="sc"><Input id="sc" name="slot_capacity" inputMode="numeric" pattern="\d*" /></Field></div>
          <Field label="Informations pour les donneurs" htmlFor="de" className="sm:col-span-2"><Textarea id="de" name="details" maxLength={1000} rows={3} /></Field>
          <label className="flex items-start gap-2 text-xs sm:col-span-2"><input type="checkbox" name="engagement" required className="mt-0.5 size-4" />
            <span>Je m&apos;engage à ce que les informations soient exactes, à ne promettre aucune contrepartie financière aux donneurs et à respecter les consignes de la structure de collecte. Je comprends que SantéProxi ne réalise aucun prélèvement.</span></label>
          <div className="sm:col-span-2"><SubmitButton>Envoyer la proposition</SubmitButton></div>
        </ActionForm>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-bold">Mes propositions</h2>
        {list.length === 0 ? <p className="rounded-xl border bg-white p-4 text-sm text-muted-foreground">Aucune proposition.</p> : (
          <ul className="space-y-2">{list.map((p, i) => (
            <li key={p.id} className="space-y-2 rounded-xl border bg-white p-4 text-sm">
              <p><strong>{p.title}</strong> · {p.reference} · {formatDate(p.starts_on)} {p.start_time} · {p.place}</p>
              <p className="text-xs">Statut : <strong>{PROPOSAL_STATUS[p.status]}</strong>{p.review_note ? ` — ${p.review_note}` : ""}</p>
              {p.campaign_id ? <p className="text-xs"><Link prefetch={false} href={`/don-de-sang/collectes/${p.campaign_id}`} className="underline">Page publique</Link>{counts[i] ? ` · ${counts[i]!.inscrits_creneaux} inscrit(s) sur un créneau · ${counts[i]!.j_y_serai} « j'y serai »` : ""}</p> : null}
              {["soumise", "a_completer"].includes(p.status) ? <ActionForm action={withdrawCampaign}><input type="hidden" name="id" value={p.id} /><SubmitButton size="sm" variant="ghost">Retirer</SubmitButton></ActionForm> : null}
              {p.status === "validee" && p.starts_on <= today ? (p.outcome_at ? <p className="text-xs">Bilan déclaré : {p.outcome_present} personnes venues, {p.outcome_collected} poches prélevées (déclaré par l&apos;organisateur).</p> : (
                <ActionForm action={reportCampaignOutcome} className="grid gap-2 sm:grid-cols-4"><input type="hidden" name="id" value={p.id} />
                  <Field label="Personnes venues" htmlFor={`pr-${p.id}`}><Input id={`pr-${p.id}`} name="present" inputMode="numeric" pattern="\d*" required /></Field>
                  <Field label="Poches prélevées" htmlFor={`co-${p.id}`}><Input id={`co-${p.id}`} name="collected" inputMode="numeric" pattern="\d*" required /></Field>
                  <Field label="Remarque" htmlFor={`no-${p.id}`}><Input id={`no-${p.id}`} name="note" maxLength={500} /></Field>
                  <div className="self-end"><SubmitButton size="sm">Déclarer le bilan</SubmitButton></div>
                </ActionForm>)) : null}
            </li>))}</ul>
        )}
      </section>
    </div>
  );
}
