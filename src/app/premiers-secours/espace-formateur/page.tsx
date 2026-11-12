import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { getGeo } from "@/lib/geo";
import { formatDate, formatDateTime, formatPhone } from "@/lib/format";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Input, Select } from "@/components/ui/input";
import { proposeCampaign, proposeCourse, setRegistrationStatus, verifyTraining } from "@/app/actions/v037";
import { AUDIENCE, CAMPAIGN_AUDIENCE, REG_STATUS } from "@/lib/first-aid";

export const metadata = { title: "Espace formateur — premiers secours", robots: { index: false } };
export const dynamic = "force-dynamic";

type Reg = { id: string; reference: string; course: string | null; region: string | null; locality: string | null; audience: string | null; message: string | null; status: string; created_at: string; name: string | null; phone: string | null };
type Cert = { id: string; course_label: string; completed_on: string; evidence_note: string | null; created_at: string; organization_id: string };

/** Réservé aux membres habilités d'un organisme de formation (désignés par l'administration) et à l'administration. */
export default async function EspaceFormateur() {
  const s = await requireUser("/premiers-secours/espace-formateur");
  const supabase = await createClient();
  const geo = await getGeo();
  const isAdmin = !!(await supabase.rpc("is_admin")).data;
  const { data: mem } = await supabase.from("first_aid_org_members").select("organization_id").eq("user_id", s.userId).eq("active", true);
  const { data: allOrgs } = await supabase.from("first_aid_organizations").select("id, name").order("name");
  const orgs = ((allOrgs ?? []) as { id: string; name: string }[]).filter((o) => isAdmin || (mem ?? []).some((m) => m.organization_id === o.id));
  if (orgs.length === 0) return (
    <div className="container-page max-w-2xl space-y-3 py-8"><h1 className="text-2xl font-bold text-brand-deep">Espace formateur</h1>
      <p>Cet espace est réservé aux membres habilités des organismes de formation, désignés par l&apos;administration de SantéProxi après accord de l&apos;organisme.</p>
      <Link prefetch={false} href="/premiers-secours/formations" className="font-semibold text-primary underline">Voir les formations</Link></div>);
  const data = await Promise.all(orgs.map(async (o) => ({
    org: o,
    regs: ((await supabase.rpc("first_aid_registrations_for_org", { p_org: o.id })).data ?? []) as Reg[],
    certs: ((await supabase.from("first_aid_certifications").select("id, course_label, completed_on, evidence_note, created_at, organization_id").eq("organization_id", o.id).eq("status", "declaree").neq("user_id", s.userId).order("created_at")).data ?? []) as Cert[],
  })));
  return (
    <div className="container-page max-w-4xl space-y-6 py-6">
      <h1 className="text-2xl font-bold text-brand-deep">Espace formateur — premiers secours</h1>
      {data.map(({ org, regs, certs }) => (
        <section key={org.id} className="space-y-4 rounded-2xl border bg-white p-4 text-sm">
          <h2 className="text-lg font-bold text-brand-deep">{org.name}</h2>
          <div className="space-y-2"><h3 className="font-semibold">Formations déclarées à vérifier ({certs.length})</h3>
            {certs.length === 0 ? <p className="text-muted-foreground">Aucune.</p> : certs.map((c) => (
              <ActionForm key={c.id} action={verifyTraining} className="flex flex-wrap items-end gap-2 rounded-xl bg-muted/40 p-3"><input type="hidden" name="id" value={c.id} />
                <p className="w-full">{c.course_label} · formation du {formatDate(c.completed_on)}{c.evidence_note ? ` · ${c.evidence_note}` : ""} · déclarée le {formatDateTime(c.created_at)}</p>
                <label className="text-xs">À renouveler avant le (facultatif)<Input name="expires_on" type="date" className="mt-1 h-10" /></label>
                <Input name="note" maxLength={300} placeholder="Note (obligatoire si non confirmée)" className="h-10 min-w-0 flex-1" />
                <SubmitButton size="sm" name="decision" value="verifiee">Vérifiée : délivrer le badge</SubmitButton>
                <SubmitButton size="sm" variant="outline" name="decision" value="non_confirmee">Non confirmée</SubmitButton>
              </ActionForm>))}
          </div>
          <div className="space-y-2"><h3 className="font-semibold">Demandes d&apos;inscription ({regs.length})</h3>
            {regs.length === 0 ? <p className="text-muted-foreground">Aucune.</p> : <ul className="divide-y">{regs.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span><span className="font-mono text-xs">{r.reference}</span> · {r.audience ? AUDIENCE[r.audience] : ""}{r.course ? ` · ${r.course}` : ""} · {[r.locality, r.region].filter(Boolean).join(", ")} · <strong>{REG_STATUS[r.status]}</strong>
                  {r.name && <> · {r.name}</>}{r.phone && <> · <a href={`tel:${r.phone}`} className="text-primary">{formatPhone(r.phone)}</a></>}{r.message ? <span className="block text-xs text-muted-foreground">{r.message}</span> : null}</span>
                {!["terminee", "annulee"].includes(r.status) && <ActionForm action={setRegistrationStatus} className="flex gap-1"><input type="hidden" name="id" value={r.id} />
                  <Select name="status" defaultValue="confirmee" className="h-9 w-36"><option value="en_attente">En attente</option><option value="confirmee">Confirmée</option><option value="terminee">Terminée</option><option value="annulee">Annulée</option></Select>
                  <SubmitButton size="sm" variant="outline">OK</SubmitButton></ActionForm>}
              </li>))}</ul>}
          </div>
          <ActionForm action={proposeCourse} className="grid gap-2 rounded-xl bg-muted/40 p-3 sm:grid-cols-3"><input type="hidden" name="organization_id" value={org.id} />
            <h3 className="font-semibold sm:col-span-3">Proposer une session (publiée après validation)</h3>
            <Input name="title" required minLength={3} placeholder="Intitulé" className="h-10" /><Input name="place" placeholder="Lieu" className="h-10" />
            <Select name="region_id" defaultValue="" className="h-10"><option value="">Région</option>{geo.regions.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</Select>
            <label className="text-xs">Début<Input name="starts_on" type="date" required className="mt-1 h-10" /></label><label className="text-xs">Fin<Input name="ends_on" type="date" className="mt-1 h-10" /></label>
            <label className="text-xs">Places<Input name="capacity" type="number" min={1} max={1000} className="mt-1 h-10" /></label>
            <Input name="conditions" placeholder="Conditions (âge, coût, documents…)" className="h-10 sm:col-span-2" /><Input name="registration_url" type="url" placeholder="Lien d'inscription officiel" className="h-10" />
            <div><SubmitButton size="sm">Proposer</SubmitButton></div>
          </ActionForm>
          <ActionForm action={proposeCampaign} className="grid gap-2 rounded-xl bg-muted/40 p-3 sm:grid-cols-3"><input type="hidden" name="organization_id" value={org.id} />
            <h3 className="font-semibold sm:col-span-3">Proposer une campagne de sensibilisation</h3>
            <Input name="title" required minLength={3} placeholder="Intitulé" className="h-10" />
            <Select name="audience" defaultValue="universites" className="h-10">{Object.entries(CAMPAIGN_AUDIENCE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
            <Input name="place" placeholder="Lieu" className="h-10" />
            <label className="text-xs">Début<Input name="starts_on" type="date" required className="mt-1 h-10" /></label>
            <Select name="region_id" defaultValue="" className="h-10"><option value="">Région</option>{geo.regions.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</Select>
            <div><SubmitButton size="sm">Proposer</SubmitButton></div>
          </ActionForm>
        </section>))}
    </div>
  );
}
