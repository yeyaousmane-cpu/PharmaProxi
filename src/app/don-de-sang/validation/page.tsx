import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { enforceMfa } from "@/lib/mfa";
import { formatDate } from "@/lib/format";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Input, Select } from "@/components/ui/input";
import { decideDonation, reviewRare, unhideBloodRequest, setBadgeThreshold, setEventStatus, validateQuestionnaire } from "@/app/actions/donor";
import { EVENT_KINDS, QUESTIONNAIRE_VERSION } from "@/lib/eligibility";
import { BloodNav } from "@/components/blood/blood-nav";
import { BLOOD_GROUPS, DONATION_TYPES, URGENCY } from "@/lib/donor";

export const metadata = { title: "Valider les dons de sang", robots: { index: false } };
export const dynamic = "force-dynamic";

type P = { id: string; reference: string; donor_code: string; donor_name: string | null; declared_group: string | null; group_verified: boolean; donated_on: string; center: string; donation_type: string; campaign: string | null; created_at: string };

/** Espace réservé au CNTS (membres désignés) et à l'administration : validation des dons déclarés. */
export default async function Validation({ searchParams }: { searchParams: Promise<{ groupe?: string; attente?: string }> }) {
  const sp = await searchParams;
  await requireUser("/don-de-sang/validation");
  const supabase = await createClient();
  const { data: ok } = await supabase.rpc("is_blood_validator");
  if (!ok) {
    return (
      <div className="container-page max-w-xl py-10"><section className="space-y-2 rounded-2xl border bg-white p-6 text-center">
        <h1 className="text-xl font-bold text-brand-deep">Accès refusé</h1>
        <p className="text-sm text-muted-foreground">La validation des dons est réservée aux membres désignés du CNTS et à l&apos;administration de SantéProxi.</p>
        <Link prefetch={false} href="/don-de-sang/mon-espace" className="text-sm text-primary underline">Mon espace donneur</Link>
      </section></div>
    );
  }
  await enforceMfa("/don-de-sang/validation", true);
  const group = BLOOD_GROUPS.includes(sp.groupe as (typeof BLOOD_GROUPS)[number]) ? sp.groupe! : null;
  const [{ data }, { data: isAdmin }, { data: levels }, { data: events }, { data: pendingRare }, { data: q }, { data: sosPending }, { data: sosHidden }, rareRes] = await Promise.all([
    supabase.rpc("blood_pending_donations"), supabase.rpc("is_admin"), supabase.from("blood_badge_levels").select("code, label, threshold").order("threshold"),
    supabase.from("blood_donation_events").select("id, reference, kind, occurred_on, description, contact_ok, status, created_at, donor_id").neq("status", "clos").order("created_at").limit(100),
    supabase.from("blood_rare_registry").select("user_id, phenotype_note, consent_at, blood_donor_profiles(donor_code, blood_group, blood_group_verified)").eq("status", "en_attente").order("consent_at").limit(100),
    supabase.from("platform_settings").select("value").eq("key", "blood_questionnaire_validation").maybeSingle(),
    supabase.from("blood_requests").select("id, reference, blood_group, facility_name, urgency, needed_at, status, created_at").eq("status", "en_attente").order("created_at").limit(100),
    supabase.rpc("blood_hidden_requests"),
    sp.groupe !== undefined ? supabase.rpc("rare_search", { p_group: group, p_region: null, p_include_pending: sp.attente === "1" }) : Promise.resolve({ data: null }),
  ]);
  type Ev = { id: string; reference: string; kind: string; occurred_on: string; description: string | null; contact_ok: boolean; status: string; created_at: string };
  type PR = { user_id: string; phenotype_note: string | null; consent_at: string; blood_donor_profiles: { donor_code: string; blood_group: string | null; blood_group_verified: boolean } | null };
  type RS = { user_id: string; donor_code: string; name: string | null; phone: string | null; blood_group: string | null; group_verified: boolean; phenotype_note: string | null; rare_criteria: string | null; status: string; availability: string; region: string | null; verified_center: string | null };
  type SR = { id: string; reference: string; blood_group: string; facility_name: string; urgency: string; needed_at: string; status: string; created_at: string };
  type HR = { id: string; reference: string; reports: number; reasons: string[] };
  const qv = (q?.value ?? null) as { version: string; validateur: string; organisme: string; date: string } | null;
  const rows = (data ?? []) as P[];
  return (
    <div className="container-page max-w-5xl space-y-5 py-6">
      <BloodNav current="/don-de-sang/validation" validator />
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-brand-deep">Espace CNTS — valider les dons de sang</h1>
        <p className="text-sm text-muted-foreground">Vérifiez chaque don déclaré dans vos registres de prélèvement. Un don n&apos;est compté (distinctions, certificats, statistiques) qu&apos;une fois validé. Le donneur est prévenu de chaque décision.</p>
      </header>
      <p className="flex items-start gap-2 rounded-xl bg-brand-mint p-3 text-xs text-brand-deep"><ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />Données personnelles : à utiliser uniquement pour la validation. Chaque décision est enregistrée dans le journal d&apos;audit. Confirmer le groupe sanguin n&apos;est utile que si le résultat de qualification du don est disponible.</p>
      {rows.length === 0 ? <p className="rounded-2xl border border-dashed p-5 text-sm text-muted-foreground">Aucun don en attente de validation.</p> : (
        <ul className="space-y-3">{rows.map((r) => (
          <li key={r.id} className="rounded-2xl border bg-white p-4 text-sm">
            <div className="flex flex-wrap justify-between gap-2">
              <p className="font-semibold">{r.donor_name ?? "Donneur"} · <span className="font-mono" dir="ltr">{r.donor_code}</span></p>
              <p className="text-xs text-muted-foreground" dir="ltr">{r.reference} · déclaré le {formatDate(r.created_at)}</p>
            </div>
            <p>Don du <strong>{formatDate(r.donated_on)}</strong> · {DONATION_TYPES[r.donation_type]} · {r.center}{r.campaign ? ` · collecte « ${r.campaign} »` : ""}</p>
            <p className="text-xs">Groupe déclaré : {r.declared_group ?? "non renseigné"}{r.group_verified ? " (déjà confirmé)" : ""}</p>
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              <ActionForm action={decideDonation} className="flex flex-wrap items-end gap-2 rounded-xl bg-emerald-50 p-2">
                <input type="hidden" name="id" value={r.id} /><input type="hidden" name="decision" value="valide" />
                <label className="text-xs">Confirmer le groupe (facultatif)<Select name="confirm_group" defaultValue="" className="mt-1 h-10"><option value="">Ne pas confirmer</option>{BLOOD_GROUPS.map((g) => <option key={g}>{g}</option>)}</Select></label>
                <SubmitButton size="sm">Valider le don</SubmitButton>
              </ActionForm>
              <ActionForm action={decideDonation} className="flex flex-wrap items-end gap-2 rounded-xl bg-red-50 p-2">
                <input type="hidden" name="id" value={r.id} /><input type="hidden" name="decision" value="refuse" />
                <label className="min-w-0 flex-1 text-xs">Motif (transmis au donneur)<Input name="note" maxLength={300} required minLength={5} className="mt-1 h-10" placeholder="ex. aucune trace de ce prélèvement" /></label>
                <SubmitButton size="sm" variant="outline">Refuser</SubmitButton>
              </ActionForm>
            </div>
          </li>))}</ul>
      )}
      <section id="sos" className="scroll-mt-24 space-y-2">
        <h2 className="text-lg font-bold text-brand-deep">SOS Besoin de sang — demandes à vérifier</h2>
        {((sosPending ?? []) as SR[]).length === 0 ? <p className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">Aucune demande en attente de vérification.</p> : (
          <ul className="space-y-2">{((sosPending ?? []) as SR[]).map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border bg-white p-3 text-sm">
              <span><strong className="font-mono">{r.blood_group}</strong> · {r.facility_name} · {URGENCY[r.urgency][0]} · transmise le {formatDate(r.created_at)} <span className="text-xs text-muted-foreground">{r.reference}</span></span>
              <Link prefetch={false} href={`/don-de-sang/sos/${r.id}`} className="font-semibold text-primary underline">Vérifier</Link>
            </li>))}</ul>)}
        {((sosHidden ?? []) as HR[]).length > 0 && <>
          <h3 className="font-semibold">Demandes masquées après signalements</h3>
          <ul className="space-y-2">{((sosHidden ?? []) as HR[]).map((r) => (
            <li key={r.id} className="space-y-1 rounded-2xl border border-red-200 bg-white p-3 text-sm">
              <p><Link prefetch={false} href={`/don-de-sang/sos/${r.id}`} className="font-semibold underline">{r.reference}</Link> · {r.reports} signalement(s)</p>
              <ul className="list-disc ps-5 text-xs">{r.reasons.map((x, i) => <li key={i}>{x}</li>)}</ul>
              <div className="flex flex-wrap gap-2"><ActionForm action={unhideBloodRequest}><input type="hidden" name="id" value={r.id} /><SubmitButton size="sm" variant="outline">Remettre en ligne</SubmitButton></ActionForm>
                <Link prefetch={false} href={`/don-de-sang/sos/${r.id}`} className="text-xs font-semibold text-primary underline">Rejeter depuis la fiche</Link></div>
            </li>))}</ul></>}
      </section>

      <section id="declarations" className="scroll-mt-24 space-y-2">
        <h2 className="text-lg font-bold text-brand-deep">Déclarations après un don</h2>
        {((events ?? []) as Ev[]).length === 0 ? <p className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">Aucune déclaration en cours.</p> : (
          <ul className="space-y-2">{((events ?? []) as Ev[]).map((e) => (
            <li key={e.id} className="rounded-2xl border bg-white p-3 text-sm">
              <p className="font-semibold">{EVENT_KINDS[e.kind]} · {formatDate(e.occurred_on)} <span className="text-xs font-normal text-muted-foreground">{e.reference} · {e.status === "nouveau" ? "nouvelle" : "prise en compte"}</span></p>
              {e.description && <p>{e.description}</p>}
              <p className="text-xs text-muted-foreground">{e.contact_ok ? "Le donneur accepte d'être recontacté (numéro de son compte)." : "Le donneur n'a pas demandé à être recontacté."}</p>
              <ActionForm action={setEventStatus} className="mt-2 flex flex-wrap items-end gap-2"><input type="hidden" name="id" value={e.id} />
                <label className="min-w-0 flex-1 text-xs">Réponse transmise au donneur (facultatif)<Input name="note" maxLength={500} className="mt-1 h-10" /></label>
                <Select name="status" defaultValue="pris_en_compte" className="h-10 w-48"><option value="pris_en_compte">Prise en compte</option><option value="clos">Close</option></Select>
                <SubmitButton size="sm">Enregistrer</SubmitButton></ActionForm>
            </li>))}</ul>)}
      </section>

      <section id="registre" className="scroll-mt-24 space-y-3">
        <h2 className="text-lg font-bold text-brand-deep">Registre des groupes sanguins rares</h2>
        {((pendingRare ?? []) as unknown as PR[]).length > 0 && <ul className="space-y-2">{((pendingRare ?? []) as unknown as PR[]).map((r) => (
          <li key={r.user_id} className="rounded-2xl border bg-white p-3 text-sm">
            <p className="font-semibold"><span className="font-mono">{r.blood_donor_profiles?.donor_code}</span> · groupe {r.blood_donor_profiles?.blood_group ?? "non renseigné"}{r.blood_donor_profiles?.blood_group_verified ? " (confirmé)" : " (déclaré)"} · inscrit le {formatDate(r.consent_at)}</p>
            <p>Phénotype indiqué : {r.phenotype_note ?? "—"}</p>
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              <ActionForm action={reviewRare} className="grid gap-2 rounded-xl bg-emerald-50 p-2"><input type="hidden" name="user_id" value={r.user_id} /><input type="hidden" name="decision" value="verifie" />
                <Input name="center" required minLength={3} maxLength={160} placeholder="Centre qui a vérifié (ex. CNTS)" className="h-10" />
                <Input name="criteria" required minLength={3} maxLength={300} placeholder="Critère retenu par les spécialistes" className="h-10" />
                <SubmitButton size="sm">Valider l&apos;inscription</SubmitButton></ActionForm>
              <ActionForm action={reviewRare} className="grid gap-2 rounded-xl bg-red-50 p-2"><input type="hidden" name="user_id" value={r.user_id} /><input type="hidden" name="decision" value="refuse" />
                <Input name="note" maxLength={300} placeholder="Message au donneur (facultatif)" className="h-10" />
                <SubmitButton size="sm" variant="outline">Ne pas retenir</SubmitButton></ActionForm>
            </div>
          </li>))}</ul>}
        <form method="get" action="/don-de-sang/validation#registre" className="flex flex-wrap items-end gap-2 rounded-2xl border bg-white p-3 text-sm">
          <label>Rechercher un groupe<Select name="groupe" defaultValue={group ?? ""} className="mt-1 h-10 w-36"><option value="">Tous</option>{BLOOD_GROUPS.map((g) => <option key={g}>{g}</option>)}</Select></label>
          <label className="flex items-center gap-2"><input type="checkbox" name="attente" value="1" defaultChecked={sp.attente === "1"} className="size-4" /> Inclure les inscriptions non vérifiées</label>
          <button type="submit" className="h-10 rounded-lg bg-[#052D1E] px-4 font-semibold text-white">Rechercher</button>
          <span className="w-full text-xs text-muted-foreground">Chaque recherche est enregistrée dans le journal d&apos;audit. À utiliser uniquement pour un besoin transfusionnel.</span>
        </form>
        {rareRes.data && (((rareRes.data ?? []) as RS[]).length === 0 ? <p className="text-sm text-muted-foreground">Aucun donneur trouvé.</p> : (
          <ul className="divide-y rounded-2xl border bg-white text-sm">{((rareRes.data ?? []) as RS[]).map((x) => (
            <li key={x.user_id} className="p-3"><p className="font-semibold">{x.name ?? "—"} · {x.blood_group ?? "?"}{x.group_verified ? " ✓" : ""} · {x.region ?? "région non renseignée"} · <span className={x.availability === "disponible" ? "text-emerald-700" : "text-muted-foreground"}>{x.availability}</span></p>
              <p className="text-xs">{x.status === "verifie" ? `Vérifié (${x.verified_center}) — ${x.rare_criteria}` : "Inscription non vérifiée"}{x.phenotype_note ? ` · ${x.phenotype_note}` : ""}</p>
              {x.phone && <a href={`tel:${x.phone}`} className="text-xs font-semibold text-primary">{x.phone}</a>}</li>))}</ul>))}
      </section>

      {isAdmin && (
        <section className="space-y-2 rounded-2xl border bg-white p-4 text-sm">
          <h2 className="font-bold text-brand-deep">Questionnaire « Suis-je apte ? » (version {QUESTIONNAIRE_VERSION})</h2>
          {qv && qv.version === QUESTIONNAIRE_VERSION ? (
            <ActionForm action={validateQuestionnaire} className="space-y-2"><p>Publié : validé par {qv.validateur} ({qv.organisme}) le {formatDate(qv.date)}.</p><input type="hidden" name="revoke" value="1" /><SubmitButton size="sm" variant="outline">Retirer la validation</SubmitButton></ActionForm>
          ) : (
            <ActionForm action={validateQuestionnaire} className="grid gap-2 sm:grid-cols-3"><input type="hidden" name="version" value={QUESTIONNAIRE_VERSION} />
              <p className="sm:col-span-3">Non publié. Enregistrez la validation seulement après relecture écrite par le CNTS de la version affichée sur <a href="/don-de-sang/suis-je-apte" className="underline">/don-de-sang/suis-je-apte</a> (aperçu visible pour vous).</p>
              <Input name="validator" required minLength={3} placeholder="Nom de la personne qui a validé" className="h-10" />
              <Input name="org" required minLength={2} defaultValue="CNTS" className="h-10" />
              <SubmitButton size="sm">Enregistrer la validation</SubmitButton></ActionForm>
          )}
        </section>
      )}

      {isAdmin && (
        <section className="space-y-2 rounded-2xl border bg-white p-4">
          <h2 className="font-bold text-brand-deep">Paliers des distinctions (administration)</h2>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{((levels ?? []) as { code: string; label: string; threshold: number }[]).map((l) => (
            <li key={l.code}><ActionForm action={setBadgeThreshold} className="flex items-end gap-2 text-sm"><input type="hidden" name="code" value={l.code} />
              <label className="flex-1">{l.label}<Input name="threshold" type="number" min={1} max={500} defaultValue={l.threshold} className="mt-1 h-10" /></label>
              <SubmitButton size="sm" variant="outline">OK</SubmitButton></ActionForm></li>))}</ul>
        </section>
      )}
    </div>
  );
}
