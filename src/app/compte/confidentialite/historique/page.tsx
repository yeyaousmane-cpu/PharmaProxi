import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PrintButton } from "@/components/print-button";

export const metadata = { title: "Mon historique de consentement", robots: { index: false } };
export const dynamic = "force-dynamic";

type Rec = { id: number; purpose_code: string; purpose_version: number; decision: string; method: string; policy_version: string | null; lang: string | null; timezone: string | null; text_sha256: string | null; created_at: string };
const DEC: Record<string, string> = { accorde: "Accepté", refuse: "Refusé", retire: "Retiré" };
const METHOD: Record<string, string> = { centre_confidentialite: "Espace personnel", inscription: "Inscription", parcours_service: "Parcours de service" };

/** Historique lisible et imprimable (PDF via le navigateur) de tous les choix de consentement de la personne. */
export default async function ConsentHistory() {
  const user = await requireUser("/compte/confidentialite/historique");
  const supabase = await createClient();
  const [{ data: recs }, { data: purposes }] = await Promise.all([
    supabase.from("consent_records").select("id,purpose_code,purpose_version,decision,method,policy_version,lang,timezone,text_sha256,created_at").order("created_at"),
    supabase.from("consent_purposes").select("code,title"),
  ]);
  const titles = new Map(((purposes as { code: string; title: string }[] | null) ?? []).map((p) => [p.code, p.title]));
  const rows = (recs as Rec[] | null) ?? [];
  const now = new Date().toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short", timeZone: "Africa/Bamako" });
  return (
    <div className="container-page max-w-4xl space-y-4 py-6 print:max-w-none print:py-0">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link prefetch={false} href="/compte/confidentialite" className="text-sm text-muted-foreground hover:underline">← Mes données et confidentialité</Link>
        <PrintButton />
      </div>
      <header className="space-y-1 border-b pb-3">
        <p className="text-sm font-bold uppercase tracking-widest text-[#068132]">SantéProxi</p>
        <h1 className="text-2xl font-bold text-[#052D1E]">Historique de mes consentements</h1>
        <p className="text-sm text-muted-foreground">Titulaire : {user.fullName ?? "—"} · Document généré le {now} (heure de Bamako) · {rows.length} événement(s)</p>
      </header>
      {rows.length === 0 ? <p className="text-muted-foreground">Aucun choix enregistré.</p> : (
        <div className="overflow-x-auto"><table className="w-full text-left text-sm">
          <thead><tr className="border-b"><th className="p-2">Date et heure</th><th className="p-2">Finalité</th><th className="p-2">Choix</th><th className="p-2">Texte</th><th className="p-2">Politique</th><th className="p-2">Canal</th><th className="p-2">Empreinte du texte (SHA-256)</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id} className="border-b align-top">
              <td className="p-2 whitespace-nowrap">{new Date(r.created_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "medium", timeZone: "Africa/Bamako" })}{r.timezone ? <span className="block text-xs text-muted-foreground">{r.timezone}</span> : null}</td>
              <td className="p-2">{titles.get(r.purpose_code) ?? r.purpose_code}</td>
              <td className="p-2 font-semibold">{DEC[r.decision] ?? r.decision}</td>
              <td className="p-2">v{r.purpose_version}</td>
              <td className="p-2">{r.policy_version ? `v${r.policy_version}` : "—"}</td>
              <td className="p-2">{METHOD[r.method] ?? r.method}</td>
              <td className="p-2 font-mono text-[10px] break-all">{r.text_sha256 ?? "antérieur à la v0.26"}</td>
            </tr>))}</tbody>
        </table></div>
      )}
      <p className="text-xs text-muted-foreground">Chaque ligne est un enregistrement en ajout seul : il ne peut être ni modifié ni supprimé. L&apos;empreinte permet de vérifier le texte exact qui vous a été présenté. Le retrait d&apos;un consentement ne remet pas en cause les traitements effectués auparavant.</p>
    </div>
  );
}
