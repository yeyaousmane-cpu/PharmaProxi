import { createClient } from "@/lib/supabase/server";
import { bamako } from "@/lib/compliance";

const LABEL: Record<string, string> = { "compliance.search": "Recherche de preuves", "compliance.export": "Export de preuves", "compliance.find_user": "Recherche d'une personne", "admin.consent_proof": "Consultation d'une fiche de preuve",
  "compliance.registry": "Modification du registre", "compliance.policy_publish": "Publication d'une politique", "compliance.setting": "Modification de l'identité du responsable",
  "compliance.dispute_create": "Réclamation reçue", "compliance.dispute_status": "Traitement d'une réclamation", "compliance.member": "Changement d'habilitation" };

export default async function AccessLog() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("compliance_access_log", { p_limit: 200 });
  const rows = (data as { created_at: string; actor_name: string | null; action: string; entity_id: string; details: Record<string, unknown> }[] | null) ?? [];
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">Toutes les consultations, recherches et exports de preuves sont inscrits dans le journal d&apos;audit chaîné, qui ne peut être ni modifié ni effacé.</p>
      <div className="overflow-x-auto rounded-2xl border bg-white"><table className="w-full text-start text-sm">
        <thead><tr className="border-b"><th className="p-2">Date</th><th className="p-2">Personne habilitée</th><th className="p-2">Action</th><th className="p-2">Objet</th></tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} className="border-b"><td className="p-2 whitespace-nowrap">{bamako(r.created_at)}</td><td className="p-2">{r.actor_name ?? "—"}</td><td className="p-2">{LABEL[r.action] ?? r.action}</td><td className="p-2 font-mono text-xs">{r.entity_id}</td></tr>)}</tbody>
      </table></div>
    </div>
  );
}
