import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function ComplianceHome({ searchParams }: { searchParams: Promise<{ verifier?: string }> }) {
  const { verifier } = await searchParams;
  const supabase = await createClient();
  const [{ data: reg }, { count: disputes }, { data: chain }, { data: policy }] = await Promise.all([
    supabase.from("data_processing_registry").select("legal_status"),
    supabase.from("consent_disputes").select("id", { count: "exact", head: true }).in("status", ["nouvelle", "en_analyse"]),
    verifier ? supabase.rpc("consent_chain_verify") : Promise.resolve({ data: null }),
    supabase.rpc("current_policy_version"),
  ]);
  const rows = (reg as { legal_status: string }[] | null) ?? [];
  const pending = rows.filter((r) => r.legal_status !== "valide").length;
  const c = (chain as { checked: number; broken_at: number | null }[] | null)?.[0];
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Link prefetch={false} href="/conformite/reclamations" className="rounded-2xl border bg-white p-4"><p className="text-3xl font-extrabold text-[#052D1E]">{disputes ?? 0}</p><p className="text-sm text-muted-foreground">réclamation(s) à analyser</p></Link>
        <Link prefetch={false} href="/conformite/registre" className="rounded-2xl border bg-white p-4"><p className="text-3xl font-extrabold text-[#052D1E]">{pending} / {rows.length}</p><p className="text-sm text-muted-foreground">traitements en attente de validation juridique</p></Link>
        <Link prefetch={false} href="/conformite/politique" className="rounded-2xl border bg-white p-4"><p className="text-3xl font-extrabold text-[#052D1E]">{policy ? `v${policy}` : "—"}</p><p className="text-sm text-muted-foreground">politique de confidentialité en vigueur</p></Link>
      </div>
      <section className="space-y-2 rounded-2xl border bg-white p-4">
        <h2 className="font-bold">Intégrité du registre des consentements</h2>
        <p className="text-sm text-muted-foreground">Chaque preuve contient l&apos;empreinte de la précédente. Une modification directe en base est détectée ici.</p>
        <form><input type="hidden" name="verifier" value="1" /><button className="rounded-xl border px-4 py-2 text-sm font-semibold">Vérifier maintenant</button></form>
        {c && (c.broken_at ? <p className="rounded-lg bg-red-100 p-2 text-sm font-semibold text-red-900">Anomalie à la preuve n° {c.broken_at} : déclencher la procédure d&apos;incident.</p>
          : <p className="rounded-lg bg-emerald-100 p-2 text-sm text-emerald-900">Registre intègre : {c.checked} preuve(s) chaînée(s) vérifiée(s).</p>)}
      </section>
      <section className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
        <h2 className="font-bold">À faire valider avant toute affirmation de conformité</h2>
        <ul className="mt-2 list-disc space-y-1 ps-5">
          <li>Identité juridique du responsable de traitement et point de contact (onglet « Responsable du traitement »).</li>
          <li>Bases légales, durées de conservation et formalités APDP de chaque traitement (onglet « Registre des traitements »).</li>
          <li>Transferts hors du Mali (hébergement dans l&apos;Union européenne, fournisseurs américains) : autorisation APDP (loi n° 2013-015, art. 11).</li>
          <li>Textes de consentement et politique de confidentialité : relecture par un juriste spécialisé.</li>
          <li>Données de santé (art. 9 et 10) : formalités spécifiques auprès de l&apos;APDP.</li>
        </ul>
      </section>
    </div>
  );
}
