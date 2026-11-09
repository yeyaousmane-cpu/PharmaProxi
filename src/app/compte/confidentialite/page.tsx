import Link from "next/link";
import { Download, FileLock2, History, LockKeyhole, MonitorSmartphone, ShieldCheck, UserRoundCog } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Field, Select, Textarea } from "@/components/ui/input";
import { createPrivacyRequest, setConsent, signOutOtherDevices } from "@/app/actions/v025";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Mes données et confidentialité" };
export const dynamic = "force-dynamic";

type Purpose = { code: string; title: string; description: string; data_categories: string; recipients: string; legal_basis: string; withdrawal_effect: string | null; version: number };
type Rec = { purpose_code: string; purpose_version: number; decision: "accorde" | "retire"; created_at: string };
type Req = { id: string; kind: string; message: string | null; status: string; admin_note: string | null; created_at: string; updated_at: string };
type Ev = { created_at: string; action: string; entity_type: string; by_me: boolean };

const BASIS: Record<string, string> = { contrat: "Nécessaire au service demandé", obligation_legale: "Obligation légale", interet_vital: "Protection de votre santé en urgence", interet_legitime: "Sécurité de la plateforme" };
const KIND: Record<string, string> = { acces: "Accès à mes données", rectification: "Rectification", export: "Export de mes données", suppression: "Suppression", opposition: "Opposition à un traitement", autre: "Autre question" };
const STATUS: Record<string, [string, string]> = { nouvelle: ["Reçue", "bg-sky-100 text-sky-900"], en_cours: ["En cours", "bg-amber-100 text-amber-900"], traitee: ["Traitée", "bg-emerald-100 text-emerald-900"], refusee: ["Refusée", "bg-red-100 text-red-900"] };
const ACTION: Record<string, string> = {
  "consent.grant": "Consentement accordé", "consent.withdraw": "Consentement retiré", "privacy.request": "Demande sur vos données envoyée",
  "privacy.export": "Export de vos données", "privacy.signout_others": "Déconnexion des autres appareils", "account.delete": "Suppression du compte",
};
const dt = (s: string) => new Date(s).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Bamako" });

export default async function PrivacyCenter() {
  await requireUser("/compte/confidentialite");
  const supabase = await createClient();
  const [{ data: purposes }, { data: recs }, { data: reqs }, { data: events }, { data: aal }] = await Promise.all([
    supabase.from("consent_purposes").select("code,title,description,data_categories,recipients,legal_basis,withdrawal_effect,version").eq("active", true).order("sort"),
    supabase.from("consent_records").select("purpose_code,purpose_version,decision,created_at").order("created_at", { ascending: false }).limit(200),
    supabase.from("privacy_requests").select("id,kind,message,status,admin_note,created_at,updated_at").order("created_at", { ascending: false }),
    supabase.rpc("my_audit_events", { p_limit: 30 }),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ]);
  const all = (purposes as Purpose[] | null) ?? [];
  const history = (recs as Rec[] | null) ?? [];
  const current = new Map<string, Rec>();
  for (const r of history) if (!current.has(r.purpose_code)) current.set(r.purpose_code, r);
  const consents = all.filter((p) => p.legal_basis === "consentement");
  const others = all.filter((p) => p.legal_basis !== "consentement");
  const mfaOn = aal?.nextLevel === "aal2";

  return (
    <div className="container-page max-w-3xl space-y-6 py-6">
      <header className="space-y-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-[#052D1E]"><LockKeyhole className="size-7 text-[#068132]" aria-hidden /> Mes données et confidentialité</h1>
        <p className="text-muted-foreground">Vos choix, vos demandes et l&apos;historique des actions sensibles sur votre compte. <Link prefetch={false} href="/votre-sante-vos-donnees" className="font-semibold text-[#068132] underline">Comment SantéProxi protège vos données</Link></p>
      </header>

      <section className="space-y-3 rounded-2xl border bg-white p-4" aria-labelledby="c-consent">
        <h2 id="c-consent" className="flex items-center gap-2 text-lg font-bold"><ShieldCheck className="size-5 text-[#068132]" aria-hidden /> Mes consentements</h2>
        <p className="text-sm text-muted-foreground">Chaque choix est indépendant et peut être modifié à tout moment. Chaque changement est enregistré avec la version du texte affiché.</p>
        <ul className="space-y-3">{consents.map((p) => {
          const c = current.get(p.code); const on = c?.decision === "accorde";
          return (
            <li key={p.code} className="rounded-xl border p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{p.title} <span className={`ml-1 rounded-full px-2 py-0.5 text-xs ${on ? "bg-emerald-100 text-emerald-900" : "bg-muted text-muted-foreground"}`}>{on ? "Accordé" : "Non accordé"}</span></p>
                  <p className="text-sm">{p.description}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Données : {p.data_categories} · Destinataires : {p.recipients} · Texte v{p.version}</p>
                  {c && <p className="text-xs text-muted-foreground">Dernier choix : {c.decision === "accorde" ? "accordé" : "retiré"} le {dt(c.created_at)} (texte v{c.purpose_version})</p>}
                  {on && p.withdrawal_effect && <p className="mt-1 text-xs text-muted-foreground">En cas de retrait : {p.withdrawal_effect}</p>}
                </div>
                <ActionForm action={setConsent}>
                  <input type="hidden" name="purpose" value={p.code} /><input type="hidden" name="granted" value={on ? "0" : "1"} />
                  <SubmitButton size="sm" variant={on ? "outline" : "default"}>{on ? "Retirer" : "Accepter"}</SubmitButton>
                </ActionForm>
              </div>
            </li>);
        })}</ul>
        <details className="text-sm">
          <summary className="cursor-pointer font-semibold">Traitements qui ne reposent pas sur votre consentement</summary>
          <ul className="mt-2 space-y-2">{others.map((p) => (
            <li key={p.code} className="rounded-lg bg-muted/50 p-2"><strong>{p.title}</strong> — {BASIS[p.legal_basis] ?? p.legal_basis}. {p.description} <span className="text-muted-foreground">Destinataires : {p.recipients}.</span></li>))}</ul>
        </details>
        {history.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer font-semibold">Historique de mes choix ({history.length})</summary>
            <ul className="mt-2 divide-y">{history.map((r, i) => (
              <li key={i} className="py-1.5">{dt(r.created_at)} · {all.find((p) => p.code === r.purpose_code)?.title ?? r.purpose_code} · {r.decision === "accorde" ? "accordé" : "retiré"} (texte v{r.purpose_version})</li>))}</ul>
          </details>
        )}
      </section>

      <section className="space-y-3 rounded-2xl border bg-white p-4" aria-labelledby="c-data">
        <h2 id="c-data" className="flex items-center gap-2 text-lg font-bold"><Download className="size-5 text-[#068132]" aria-hidden /> Mes données</h2>
        <div className="flex flex-wrap gap-2">
          <a href="/compte/confidentialite/export" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#068132] px-4 font-semibold text-white hover:bg-[#052D1E]"><Download className="size-4" aria-hidden /> Télécharger mes données (JSON)</a>
          <Link prefetch={false} href="/compte" className="inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 font-semibold"><UserRoundCog className="size-4" aria-hidden /> Modifier mes informations</Link>
          <Link prefetch={false} href="/ma-sante" className="inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 font-semibold"><FileLock2 className="size-4" aria-hidden /> Mon dossier santé</Link>
        </div>
        <p className="text-xs text-muted-foreground">La suppression de votre compte se fait en bas de la page <Link prefetch={false} href="/compte" className="underline">Mon compte</Link>.</p>
      </section>

      <section className="space-y-3 rounded-2xl border bg-white p-4" aria-labelledby="c-req">
        <h2 id="c-req" className="text-lg font-bold">Faire une demande sur mes données</h2>
        <p className="text-sm text-muted-foreground">Accès, rectification, suppression, opposition : l&apos;équipe SantéProxi traite votre demande et vous répond dans votre compte.</p>
        <ActionForm action={createPrivacyRequest} className="grid gap-3" resetOnSuccess>
          <Field label="Type de demande" htmlFor="kind" required><Select id="kind" name="kind" required defaultValue="">
            <option value="" disabled>Choisir…</option>{Object.entries(KIND).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
          <Field label="Précisez votre demande (facultatif)" htmlFor="msg"><Textarea id="msg" name="message" maxLength={2000} rows={3} placeholder="Ne mettez pas d'informations médicales dans ce message." /></Field>
          <div><SubmitButton>Envoyer la demande</SubmitButton></div>
        </ActionForm>
        {((reqs as Req[] | null) ?? []).length > 0 && (
          <ul className="divide-y rounded-xl border text-sm">{(reqs as Req[]).map((r) => {
            const [l, tone] = STATUS[r.status] ?? STATUS.nouvelle;
            return (<li key={r.id} className="space-y-1 p-3">
              <p><strong>{KIND[r.kind] ?? r.kind}</strong> · {dt(r.created_at)} <span className={`ml-1 rounded-full px-2 py-0.5 text-xs ${tone}`}>{l}</span></p>
              {r.admin_note && <p className="rounded-lg bg-muted/60 p-2">Réponse : {r.admin_note}</p>}
            </li>);
          })}</ul>
        )}
      </section>

      <section className="space-y-3 rounded-2xl border bg-white p-4" aria-labelledby="c-sec">
        <h2 id="c-sec" className="flex items-center gap-2 text-lg font-bold"><MonitorSmartphone className="size-5 text-[#068132]" aria-hidden /> Sécurité et appareils</h2>
        <p className="text-sm">Double authentification : <strong>{mfaOn ? "activée" : "non activée"}</strong>. <Link prefetch={false} href="/compte/securite" className="font-semibold text-[#068132] underline">{mfaOn ? "Gérer" : "L'activer"}</Link></p>
        <ActionForm action={signOutOtherDevices}><SubmitButton size="sm" variant="outline">Déconnecter tous mes autres appareils</SubmitButton></ActionForm>
        <p className="text-sm"><Link prefetch={false} href="/compte/notifications" className="font-semibold text-[#068132] underline">Mes préférences de notification</Link></p>
      </section>

      <section className="space-y-2 rounded-2xl border bg-white p-4" aria-labelledby="c-hist">
        <h2 id="c-hist" className="flex items-center gap-2 text-lg font-bold"><History className="size-5 text-[#068132]" aria-hidden /> Historique des actions sensibles</h2>
        {((events as Ev[] | null) ?? []).length === 0
          ? <p className="text-sm text-muted-foreground">Aucune action enregistrée pour l&apos;instant.</p>
          : <ul className="divide-y text-sm">{(events as Ev[]).map((e, i) => (
            <li key={i} className="py-1.5">{dt(e.created_at)} · {ACTION[e.action] ?? e.action}{!e.by_me && <em className="text-muted-foreground"> (par l&apos;équipe SantéProxi)</em>}</li>))}</ul>}
        <p className="text-xs text-muted-foreground">Ce journal ne peut être ni modifié ni effacé par l&apos;application. Les accès à l&apos;espace Femme sont aussi visibles dans cet espace.</p>
      </section>
      <p className="text-xs text-muted-foreground">Mise à jour : {formatDate(new Date().toISOString())}</p>
    </div>
  );
}
