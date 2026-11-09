import Link from "next/link";
import { Download, FileLock2, History, LockKeyhole, MonitorSmartphone, ShieldCheck, UserRoundCog } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Field, Select, Textarea } from "@/components/ui/input";
import { createPrivacyRequest, signOutOtherDevices } from "@/app/actions/v025";
import { changeEmail, createConsentDispute } from "@/app/actions/v026";
import { ConsentChoices, type PurposeView } from "@/components/privacy/consent-choices";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Mes données et confidentialité" };
export const dynamic = "force-dynamic";

type Purpose = { code: string; title: string; description: string; data_categories: string; recipients: string; legal_basis: string; withdrawal_effect: string | null; version: number };
type Rec = { purpose_code: string; purpose_version: number; decision: "accorde" | "refuse" | "retire"; created_at: string };
type Dispute = { reference: string; status: string; created_at: string; report: string | null };
type Login = { created_at: string; device_label: string; new_device: boolean };
const DISPUTE: Record<string, string> = { nouvelle: "Reçue", en_analyse: "En cours d'analyse", preuve_retrouvee: "Preuve retrouvée", preuve_insuffisante: "Preuve insuffisante", traitement_suspendu: "Traitement suspendu", resolue: "Résolue", transmise: "Transmise au responsable" };
const DEC: Record<string, string> = { accorde: "accepté", refuse: "refusé", retire: "retiré" };
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
  const [{ data: purposes }, { data: recs }, { data: reqs }, { data: events }, { data: aal }, { data: disputes }, { data: logins }, { data: me }] = await Promise.all([
    supabase.from("consent_purposes").select("code,title,description,data_categories,recipients,legal_basis,withdrawal_effect,version").eq("active", true).order("sort"),
    supabase.from("consent_records").select("purpose_code,purpose_version,decision,created_at").order("created_at", { ascending: false }).limit(200),
    supabase.from("privacy_requests").select("id,kind,message,status,admin_note,created_at,updated_at").order("created_at", { ascending: false }),
    supabase.rpc("my_audit_events", { p_limit: 30 }),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    supabase.from("consent_disputes").select("reference,status,created_at,report").order("created_at", { ascending: false }),
    supabase.from("login_events").select("created_at,device_label,new_device").order("created_at", { ascending: false }).limit(15),
    supabase.auth.getUser(),
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
        <ConsentChoices purposes={consents.map((p): PurposeView => { const c = current.get(p.code); return { ...p, state: c?.decision ?? null, since: c ? dt(c.created_at) : null }; })} />
        <details className="text-sm">
          <summary className="cursor-pointer font-semibold">Traitements qui ne reposent pas sur votre consentement</summary>
          <ul className="mt-2 space-y-2">{others.map((p) => (
            <li key={p.code} className="rounded-lg bg-muted/50 p-2"><strong>{p.title}</strong> — {BASIS[p.legal_basis] ?? p.legal_basis}. {p.description} <span className="text-muted-foreground">Destinataires : {p.recipients}.</span></li>))}</ul>
        </details>
        {history.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer font-semibold">Historique de mes choix ({history.length})</summary>
            <ul className="mt-2 divide-y">{history.map((r, i) => (
              <li key={i} className="py-1.5">{dt(r.created_at)} · {all.find((p) => p.code === r.purpose_code)?.title ?? r.purpose_code} · {DEC[r.decision]} (texte v{r.purpose_version})</li>))}</ul>
          </details>
        )}
        <div className="flex flex-wrap gap-2">
          <Link prefetch={false} href="/compte/confidentialite/historique" className="inline-flex min-h-11 items-center gap-2 rounded-xl border-2 border-[#068132]/30 px-4 text-sm font-semibold text-[#052D1E]"><Download className="size-4" aria-hidden /> Télécharger mon historique de consentement</Link>
        </div>
        <details className="rounded-xl border p-3 text-sm">
          <summary className="cursor-pointer font-semibold">Je n&apos;ai jamais donné ce consentement : faire une réclamation</summary>
          <ActionForm action={createConsentDispute} className="mt-3 grid gap-3" resetOnSuccess>
            <Field label="Consentement concerné" htmlFor="dp"><Select id="dp" name="purpose" defaultValue=""><option value="">Je ne sais pas</option>{consents.map((p) => <option key={p.code} value={p.code}>{p.title}</option>)}</Select></Field>
            <Field label="Expliquez la situation" htmlFor="dm" required><Textarea id="dm" name="message" rows={3} maxLength={2000} required /></Field>
            <div><SubmitButton size="sm">Envoyer la réclamation</SubmitButton></div>
          </ActionForm>
          {((disputes as Dispute[] | null) ?? []).length > 0 && <ul className="mt-3 divide-y rounded-lg border">{(disputes as Dispute[]).map((d) => (
            <li key={d.reference} className="p-2"><span className="font-mono">{d.reference}</span> · {dt(d.created_at)} · <strong>{DISPUTE[d.status] ?? d.status}</strong>{d.report && <span className="block text-muted-foreground">Conclusion : {d.report}</span>}</li>))}</ul>}
        </details>
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
        <details className="text-sm">
          <summary className="cursor-pointer font-semibold">Mes dernières connexions</summary>
          {((logins as Login[] | null) ?? []).length === 0 ? <p className="mt-2 text-muted-foreground">Aucune connexion enregistrée depuis l&apos;activation de ce journal.</p> : (
            <ul className="mt-2 divide-y">{(logins as Login[]).map((l, i) => <li key={i} className="py-1.5">{dt(l.created_at)} · {l.device_label}{l.new_device && <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900">nouvel appareil</span>}</li>)}</ul>)}
          <p className="mt-1 text-xs text-muted-foreground">Seuls le navigateur et le système sont enregistrés, sans adresse IP, pendant 180 jours. Une connexion depuis un nouveau type d&apos;appareil vous est signalée.</p>
        </details>
        <details className="text-sm">
          <summary className="cursor-pointer font-semibold">Changer mon adresse e-mail</summary>
          <p className="mt-2 text-muted-foreground">Adresse actuelle : {me?.user?.email ?? "aucune"}. Le changement n&apos;est effectif qu&apos;après confirmation par le lien envoyé.</p>
          <ActionForm action={changeEmail} className="mt-2 grid gap-3 sm:grid-cols-2" resetOnSuccess>
            <Field label="Nouvelle adresse" htmlFor="ne" required><Input id="ne" name="email" type="email" autoComplete="email" required /></Field>
            <Field label="Mot de passe actuel" htmlFor="np" required><Input id="np" name="password" type="password" autoComplete="current-password" required /></Field>
            <div><SubmitButton size="sm">Changer l&apos;adresse</SubmitButton></div>
          </ActionForm>
        </details>
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
