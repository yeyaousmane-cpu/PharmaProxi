import { FlaskConical } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getGeo } from "@/lib/geo";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { requestLabAccess } from "@/app/actions/labs";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Espace laboratoire — demander l'accès" };
export const dynamic = "force-dynamic";

export default async function LabSignup() {
  const s = await requireUser("/laboratoire/inscription");
  const supabase = await createClient();
  const [geo, { data: mine }, { data: labs }] = await Promise.all([
    getGeo(),
    supabase.from("lab_access_requests").select("id, lab_name, status, created_at").eq("user_id", s.userId).order("created_at", { ascending: false }),
    supabase.from("facility_listings").select("id, name, city_label").eq("kind", "laboratoire").eq("is_published", true).order("name").limit(500),
  ]);
  return (
    <div className="container-page max-w-2xl space-y-4 py-6">
      <h1 className="flex items-center gap-2 text-2xl font-bold text-brand-deep"><FlaskConical className="size-7 text-brand-blue" aria-hidden /> Espace laboratoire</h1>
      <p className="text-muted-foreground">Gérez gratuitement la liste de vos analyses, vos prix et vos délais, et recevez des demandes de prélèvement à domicile. L&apos;équipe vérifie l&apos;autorisation d&apos;exercer du laboratoire avant d&apos;ouvrir l&apos;espace.</p>
      {(mine ?? []).length > 0 && (
        <ul className="space-y-2">{(mine ?? []).map((r) => <li key={r.id} className="flex items-center justify-between rounded-xl border bg-white p-3 text-sm"><span>{r.lab_name} · {formatDateTime(r.created_at)}</span>
          <Badge className="bg-muted">{r.status === "nouvelle" ? "En cours de vérification" : r.status === "acceptee" ? "Acceptée" : "Refusée"}</Badge></li>)}</ul>
      )}
      <section className="rounded-2xl border bg-white p-5">
        <ActionForm action={requestLabAccess} className="grid gap-3 sm:grid-cols-2" labels={{ lab_name: "Laboratoire", phone: "Téléphone", authorization_ref: "Autorisation" }}>
          <Field label="Votre laboratoire dans l'annuaire (s'il y figure)" htmlFor="fi" className="sm:col-span-2"><Select id="fi" name="facility_id" defaultValue=""><option value="">Il n&apos;y figure pas encore</option>{(labs ?? []).map((l) => <option key={l.id} value={l.id}>{l.name}{l.city_label ? ` — ${l.city_label}` : ""}</option>)}</Select></Field>
          <Field label="Nom du laboratoire" htmlFor="ln" required><Input id="ln" name="lab_name" maxLength={160} required /></Field>
          <Field label="Région" htmlFor="rg"><Select id="rg" name="region_id" defaultValue=""><option value="">—</option>{geo.regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></Field>
          <Field label="Adresse" htmlFor="ad" className="sm:col-span-2"><Input id="ad" name="address" maxLength={300} /></Field>
          <Field label="Téléphone du laboratoire" htmlFor="ph" required><Input id="ph" name="phone" type="tel" inputMode="tel" required placeholder="+223 20 00 00 00" /></Field>
          <Field label="Référence de l'autorisation d'ouverture" htmlFor="au" required hint="Arrêté ou agrément ; l'équipe peut demander une copie"><Input id="au" name="authorization_ref" maxLength={120} required /></Field>
          <Field label="Votre fonction" htmlFor="ro"><Input id="ro" name="role_in_lab" maxLength={120} placeholder="ex. biologiste responsable" /></Field>
          <Field label="Message (facultatif)" htmlFor="ms" className="sm:col-span-2"><Textarea id="ms" name="message" rows={2} maxLength={1000} /></Field>
          <SubmitButton className="w-fit">Envoyer la demande</SubmitButton>
        </ActionForm>
      </section>
    </div>
  );
}
