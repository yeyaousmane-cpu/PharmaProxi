import { createClient } from "@/lib/supabase/server";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Field, Input, Select } from "@/components/ui/input";
import { handlePrivacyRequest } from "@/app/actions/v025";

export const metadata = { title: "Gouvernance des données — administration" };
export const dynamic = "force-dynamic";

type Req = { id: string; user_id: string; kind: string; message: string | null; status: string; admin_note: string | null; created_at: string };
const KIND: Record<string, string> = { acces: "Accès", rectification: "Rectification", export: "Export", suppression: "Suppression", opposition: "Opposition", autre: "Autre" };
const dt = (s: string) => new Date(s).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Bamako" });

export default async function AdminPrivacy({ searchParams }: { searchParams: Promise<{ verifier?: string; preuve?: string }> }) {
  const { verifier, preuve } = await searchParams;
  const supabase = await createClient();
  const [{ data: reqs }, { data: stats }, { data: purposes }, chain] = await Promise.all([
    supabase.from("privacy_requests").select("id,user_id,kind,message,status,admin_note,created_at").order("status").order("created_at", { ascending: false }).limit(200),
    supabase.rpc("consent_stats"),
    supabase.from("consent_purposes").select("code,title,legal_basis,data_categories,recipients,version,active").order("sort"),
    verifier ? supabase.rpc("audit_verify_chain") : Promise.resolve({ data: null }),
  ]);
  const rows = (reqs as Req[] | null) ?? [];
  const ids = [...new Set(rows.map((r) => r.user_id))];
  const { data: people } = ids.length ? await supabase.from("profiles").select("id,full_name,phone").in("id", ids) : { data: [] };
  const who = new Map(((people as { id: string; full_name: string | null; phone: string | null }[] | null) ?? []).map((p) => [p.id, p]));
  const st = new Map(((stats as { purpose_code: string; accorde: number; retire: number }[] | null) ?? []).map((s) => [s.purpose_code, s]));
  const c = (chain as { data: { checked: number; broken_at: number | null; first_chained_id: number | null }[] | null }).data?.[0];
  type Proof = { purpose_title: string; purpose_version: number; decision: string; method: string; data_categories: string; recipients: string; created_at: string };
  const proof = preuve && /^[0-9a-f-]{36}$/i.test(preuve) ? (((await supabase.rpc("consent_proof", { p_user: preuve })).data as Proof[] | null) ?? []) : null;
  const open = rows.filter((r) => r.status === "nouvelle" || r.status === "en_cours").length;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Gouvernance des données</h1>

      <section className="space-y-3 rounded-2xl border bg-white p-4">
        <h2 className="font-bold">Demandes d&apos;exercice des droits ({open} à traiter)</h2>
        <p className="text-sm text-muted-foreground">Répondez dans un délai raisonnable ; chaque changement de statut est journalisé et notifié à la personne. Ne demandez jamais d&apos;informations médicales par ce canal.</p>
        {rows.length === 0 ? <p className="text-sm text-muted-foreground">Aucune demande.</p> : (
          <ul className="divide-y rounded-xl border text-sm">{rows.map((r) => {
            const p = who.get(r.user_id);
            return (
              <li key={r.id} className="space-y-2 p-3">
                <p><strong>{KIND[r.kind] ?? r.kind}</strong> · {dt(r.created_at)} · {p?.full_name ?? "Utilisateur"}{p?.phone ? ` · ${p.phone}` : ""} · <em>{r.status}</em></p>
                {r.message && <p className="rounded-lg bg-muted/60 p-2">{r.message}</p>}
                <a href={`?preuve=${r.user_id}#preuve`} className="text-xs font-semibold text-[#068132] underline">Fiche de preuve des consentements</a>
                <ActionForm action={handlePrivacyRequest} className="grid gap-2 sm:grid-cols-[10rem_1fr_auto] sm:items-end">
                  <input type="hidden" name="id" value={r.id} />
                  <Field label="Statut" htmlFor={`s-${r.id}`}><Select id={`s-${r.id}`} name="status" defaultValue={r.status}>
                    <option value="nouvelle">Reçue</option><option value="en_cours">En cours</option><option value="traitee">Traitée</option><option value="refusee">Refusée</option></Select></Field>
                  <Field label="Réponse visible par la personne" htmlFor={`n-${r.id}`}><Input id={`n-${r.id}`} name="note" maxLength={1000} defaultValue={r.admin_note ?? ""} /></Field>
                  <SubmitButton size="sm">Enregistrer</SubmitButton>
                </ActionForm>
              </li>);
          })}</ul>)}
      </section>

      {proof && (
        <section id="preuve" className="space-y-2 rounded-2xl border-2 border-[#068132] bg-white p-4">
          <h2 className="font-bold">Fiche de preuve des consentements — {who.get(preuve!)?.full_name ?? preuve}</h2>
          <p className="text-xs text-muted-foreground">Consultation journalisée. Registre en ajout seul : chaque ligne est un choix horodaté avec la version du texte présenté.</p>
          {proof.length === 0 ? <p className="text-sm text-muted-foreground">Aucun consentement enregistré.</p> : (
            <div className="overflow-x-auto"><table className="w-full text-start text-sm"><thead><tr className="border-b"><th className="p-2">Date</th><th className="p-2">Finalité</th><th className="p-2">Décision</th><th className="p-2">Texte</th><th className="p-2">Méthode</th><th className="p-2">Données / destinataires</th></tr></thead>
              <tbody>{proof.map((p, i) => <tr key={i} className="border-b align-top"><td className="p-2">{dt(p.created_at)}</td><td className="p-2">{p.purpose_title}</td><td className="p-2">{p.decision}</td><td className="p-2">v{p.purpose_version}</td><td className="p-2">{p.method}</td><td className="p-2">{p.data_categories} — {p.recipients}</td></tr>)}</tbody></table></div>)}
        </section>
      )}

      <section className="space-y-2 rounded-2xl border bg-white p-4">
        <h2 className="font-bold">Registre des traitements (projet, à valider par un juriste)</h2>
        <div className="overflow-x-auto"><table className="w-full text-start text-sm">
          <thead><tr className="border-b"><th className="p-2">Traitement</th><th className="p-2">Base</th><th className="p-2">Données</th><th className="p-2">Destinataires</th><th className="p-2">Texte</th><th className="p-2">Consentements actifs / retirés</th></tr></thead>
          <tbody>{((purposes as { code: string; title: string; legal_basis: string; data_categories: string; recipients: string; version: number; active: boolean }[] | null) ?? []).map((p) => {
            const s = st.get(p.code);
            return (<tr key={p.code} className="border-b align-top"><td className="p-2 font-semibold">{p.title}{!p.active && " (inactif)"}</td><td className="p-2">{p.legal_basis}</td><td className="p-2">{p.data_categories}</td><td className="p-2">{p.recipients}</td><td className="p-2">v{p.version}</td>
              <td className="p-2">{p.legal_basis === "consentement" ? `${s?.accorde ?? 0} / ${s?.retire ?? 0}` : "—"}</td></tr>);
          })}</tbody></table></div>
        <p className="text-xs text-muted-foreground">Hébergement de la base de données : Supabase, région eu-west-1 (Irlande, Union européenne). Un transfert hors du Mali suppose une autorisation de l&apos;APDP (loi n° 2013-015, art. 11) : démarche à engager.</p>
      </section>

      <section className="space-y-2 rounded-2xl border bg-white p-4">
        <h2 className="font-bold">Intégrité du journal d&apos;audit</h2>
        <p className="text-sm text-muted-foreground">Chaque entrée contient l&apos;empreinte de la précédente. L&apos;application ne peut ni modifier ni supprimer le journal ; une altération directe en base est détectée ici.</p>
        <form><input type="hidden" name="verifier" value="1" /><button className="rounded-xl border px-4 py-2 text-sm font-semibold">Vérifier maintenant</button></form>
        {c && (c.broken_at
          ? <p className="rounded-lg bg-red-100 p-2 text-sm font-semibold text-red-900">Anomalie détectée à l&apos;entrée n° {c.broken_at} : le journal a été altéré. Déclenchez la procédure d&apos;incident.</p>
          : <p className="rounded-lg bg-emerald-100 p-2 text-sm text-emerald-900">Journal intègre : {c.checked} entrées chaînées vérifiées{c.first_chained_id ? ` (depuis l'entrée n° ${c.first_chained_id} ; les entrées antérieures à la v0.25 ne sont pas chaînées)` : ""}.</p>)}
      </section>
    </div>
  );
}
