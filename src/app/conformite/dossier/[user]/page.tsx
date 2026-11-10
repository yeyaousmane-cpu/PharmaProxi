import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PrintButton } from "@/components/print-button";
import { DECISION, METHOD, bamako, type ProofRow } from "@/lib/compliance";

type Version = { purpose_code: string; version: number; snapshot: Record<string, string | number | null>; text_sha256: string };

/** Dossier de preuve de consentement d'une personne : imprimable, daté, avec vérification d'intégrité. */
export default async function ProofDossier({ params }: { params: Promise<{ user: string }> }) {
  const { user } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(user)) notFound();
  const supabase = await createClient();
  const [{ data }, { data: chain }, { data: disputes }] = await Promise.all([
    supabase.rpc("compliance_search", { p_user: user, p_export: true }),
    supabase.rpc("consent_chain_verify"),
    supabase.from("consent_disputes").select("reference,status,purpose_code,created_at,report").eq("user_id", user).order("created_at"),
  ]);
  const rows = ((data as ProofRow[] | null) ?? []).slice().reverse();
  const keys = [...new Set(rows.map((r) => `${r.purpose_code}|${r.purpose_version}`))];
  const { data: versions } = keys.length ? await supabase.from("consent_purpose_versions").select("purpose_code,version,snapshot,text_sha256").in("purpose_code", [...new Set(rows.map((r) => r.purpose_code))]) : { data: [] };
  const vmap = new Map(((versions as Version[] | null) ?? []).map((v) => [`${v.purpose_code}|${v.version}`, v]));
  const c = (chain as { checked: number; broken_at: number | null }[] | null)?.[0];
  const ref = `PRV-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${user.slice(0, 8).toUpperCase()}`;
  const allOk = rows.every((r) => !r.text_sha256 || r.text_ok) && c && !c.broken_at;
  return (
    <article className="space-y-4 rounded-2xl border bg-white p-5 print:border-0 print:p-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-xs font-bold uppercase tracking-widest text-[#068132]">Dossier de preuve de consentement</p>
          <h2 className="text-xl font-bold text-[#052D1E]">Référence {ref}</h2>
          <p className="text-sm text-muted-foreground">Personne : {rows[0]?.user_name ?? "—"} ({user}) · établi le {bamako(new Date().toISOString())} (heure de Bamako)</p></div>
        <PrintButton label="Imprimer / PDF" />
      </div>
      <p className={`rounded-xl p-3 text-sm font-semibold ${allOk ? "bg-emerald-100 text-emerald-900" : "bg-red-100 text-red-900"}`}>
        Vérification d&apos;intégrité : {allOk ? `textes conformes à leurs empreintes, registre chaîné intègre (${c?.checked ?? 0} preuves vérifiées).` : "ANOMALIE détectée — ne pas utiliser ce dossier comme preuve avant analyse."}
      </p>
      {rows.length === 0 ? <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-950">Aucune preuve de consentement n&apos;existe pour cette personne. La création d&apos;un compte ne vaut pas consentement.</p> : (
        <ol className="space-y-3">{rows.map((r) => {
          const v = vmap.get(`${r.purpose_code}|${r.purpose_version}`);
          return (
            <li key={r.id} className="rounded-xl border p-3 text-sm break-inside-avoid">
              <p className="font-semibold">N° {r.id} · {bamako(r.created_at)} · {r.purpose_title} · <span className="uppercase">{DECISION[r.decision] ?? r.decision}</span></p>
              <p className="text-muted-foreground">Canal : {METHOD[r.method] ?? r.method} · langue : {r.lang ?? "—"} · fuseau déclaré : {r.timezone ?? "—"} · politique : {r.policy_version ? `v${r.policy_version}` : "—"} · texte v{r.purpose_version}</p>
              {v ? (
                <details className="mt-1"><summary className="cursor-pointer text-[#068132]">Texte exact présenté (v{v.version})</summary>
                  <p className="mt-1">{String(v.snapshot.description ?? "")}</p>
                  <p className="text-muted-foreground">Données : {String(v.snapshot.donnees ?? "")} · Destinataires : {String(v.snapshot.destinataires ?? "")}</p></details>
              ) : <p className="text-muted-foreground">Texte archivé indisponible (choix antérieur à l&apos;archivage des versions).</p>}
              <p className="font-mono text-[10px] break-all">SHA-256 : {r.text_sha256 ?? "—"} {r.text_sha256 && (r.text_ok ? "✓" : "✗")}</p>
            </li>);
        })}</ol>
      )}
      {((disputes as { reference: string; status: string; created_at: string; report: string | null }[] | null) ?? []).length > 0 && (
        <section className="text-sm"><h3 className="font-bold">Réclamations</h3>
          <ul className="list-disc ps-5">{(disputes as { reference: string; status: string; created_at: string; report: string | null }[]).map((d) => <li key={d.reference}>{d.reference} · {bamako(d.created_at)} · {d.status}{d.report ? ` · ${d.report}` : ""}</li>)}</ul></section>
      )}
      <p className="text-xs text-muted-foreground">Les empreintes prouvent l&apos;intégrité des textes ; la preuve du consentement résulte de l&apos;ensemble des éléments de traçabilité (action de la personne connectée, horodatage serveur, version du texte, chaîne d&apos;empreintes). La consultation de ce dossier est journalisée.</p>
    </article>
  );
}
