import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { BloodNav } from "@/components/blood/blood-nav";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Field, Input } from "@/components/ui/input";
import { reviewCampaign } from "@/app/actions/v040";
import { ORG_KIND } from "@/lib/campaigns";
import { formatDate, formatPhone } from "@/lib/format";

export const metadata = { title: "Valider les collectes proposées", robots: { index: false } };
export const dynamic = "force-dynamic";

type P = { id: string; reference: string; organization_name: string; organization_kind: string; contact_phone: string; title: string; place: string; starts_on: string; start_time: string; end_time: string; expected_donors: number | null; collecting_structure: string; collecting_agreement: string; details: string | null; slot_minutes: number | null; slot_capacity: number | null; status: string; regions: { name: string } | null };

export default async function Validation() {
  const s = await requireUser("/don-de-sang/collectes/validation");
  const supabase = await createClient();
  const { data: ok } = await supabase.rpc("has_authority", { p_kind: "cnts" });
  if (!ok && !s.roles.includes("admin")) redirect("/don-de-sang/collectes");
  const { data } = await supabase.from("blood_campaign_proposals").select("id, reference, organization_name, organization_kind, contact_phone, title, place, starts_on, start_time, end_time, expected_donors, collecting_structure, collecting_agreement, details, slot_minutes, slot_capacity, status, regions(name)").in("status", ["soumise", "a_completer"]).order("starts_on");
  const list = (data ?? []) as unknown as P[];
  return (
    <div className="container-page max-w-4xl space-y-4 py-6">
      <BloodNav current="/don-de-sang/collectes" validator />
      <h1 className="text-2xl font-bold">Collectes proposées à valider</h1>
      <p className="text-sm text-muted-foreground">Vérifiez l&apos;organisation et appelez le responsable si besoin. Une collecte n&apos;est publiable que si la structure de prélèvement a confirmé sa participation. Vous ne pouvez pas valider vos propres propositions.</p>
      {list.length === 0 ? <p className="rounded-xl border bg-white p-4 text-sm text-muted-foreground">Aucune proposition en attente.</p> : (
        <ul className="space-y-3">{list.map((p) => (
          <li key={p.id} className="space-y-2 rounded-2xl border bg-white p-4 text-sm">
            <p className="font-bold">{p.title} <span className="font-normal text-muted-foreground">· {p.reference}{p.status === "a_completer" ? " · à compléter" : ""}</span></p>
            <p>{p.organization_name} ({ORG_KIND[p.organization_kind]}) · <a href={`tel:${p.contact_phone}`} className="underline">{formatPhone(p.contact_phone)}</a></p>
            <p>{formatDate(p.starts_on)}, {p.start_time}–{p.end_time} · {p.place}{p.regions ? ` · ${p.regions.name}` : ""}</p>
            <p>Prélèvements : <strong>{p.collecting_structure}</strong> — accord {p.collecting_agreement === "confirme" ? "confirmé (à vérifier)" : <strong className="text-amber-800">en discussion</strong>}{p.expected_donors ? ` · ${p.expected_donors} donneurs attendus` : ""}{p.slot_minutes ? ` · créneaux de ${p.slot_minutes} min, ${p.slot_capacity ?? "?"} places` : ""}</p>
            {p.details ? <p className="text-muted-foreground">{p.details}</p> : null}
            <div className="flex flex-wrap items-end gap-2">
              <ActionForm action={reviewCampaign}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="decision" value="validee" /><SubmitButton size="sm">Valider et publier</SubmitButton></ActionForm>
              <ActionForm action={reviewCampaign} className="flex flex-wrap items-end gap-2"><input type="hidden" name="id" value={p.id} />
                <Field label="Message à l'organisateur" htmlFor={`n-${p.id}`}><Input id={`n-${p.id}`} name="note" minLength={5} maxLength={500} required /></Field>
                <button name="decision" value="a_completer" className="min-h-9 rounded-lg border px-3 text-sm font-semibold">À compléter</button>
                <button name="decision" value="refusee" className="min-h-9 rounded-lg border px-3 text-sm font-semibold text-red-700">Refuser</button>
              </ActionForm>
            </div>
          </li>))}</ul>
      )}
    </div>
  );
}
