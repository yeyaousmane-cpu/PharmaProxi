import { createClient } from "@/lib/supabase/server";
import { getGeo } from "@/lib/geo";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { saveBloodNeed, saveHealthAlert, toggleAlert } from "@/app/actions/health-tools";
import { ALERT_KIND } from "@/lib/health-alerts";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Administration — Alertes" };

export default async function AdminAlerts() {
  const supabase = await createClient();
  const [{ data: alerts }, { data: needs }, geo] = await Promise.all([
    supabase.from("health_alerts").select("*").order("published_at", { ascending: false }).limit(50),
    supabase.from("blood_needs").select("*").order("created_at", { ascending: false }).limit(50),
    getGeo(),
  ]);
  const now = new Date().toISOString();
  const in3 = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
  const regions = <><option value="">Tout le Mali</option>{geo.regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</>;
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Alertes sanitaires et besoins en sang</h1>
        <p className="text-sm text-muted-foreground">Ne publiez que des informations venant d&apos;une autorité ou d&apos;un établissement identifié. Les abonnés reçoivent une notification si vous cochez « Prévenir ».</p>
      </header>

      <Card>
        <CardHeader><CardTitle>Nouvelle alerte sanitaire officielle</CardTitle>
          <CardDescription>Faux médicament, rappel de lot, campagne, épidémie. Le lien vers le communiqué officiel est obligatoire.</CardDescription></CardHeader>
        <CardContent>
          <ActionForm action={saveHealthAlert} className="grid gap-3 sm:grid-cols-2" resetOnSuccess>
            <Field label="Type" htmlFor="k"><Select id="k" name="kind" defaultValue="rappel_lot">{Object.entries(ALERT_KIND).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select></Field>
            <Field label="Région concernée" htmlFor="r1"><Select id="r1" name="region_id" defaultValue="">{regions}</Select></Field>
            <div className="sm:col-span-2"><Field label="Titre" htmlFor="t"><Input id="t" name="title" required minLength={5} maxLength={160} /></Field></div>
            <div className="sm:col-span-2"><Field label="Texte (ce que les gens doivent savoir et faire)" htmlFor="b"><Textarea id="b" name="body" rows={4} required minLength={10} maxLength={2000} /></Field></div>
            <Field label="Source officielle" htmlFor="sn"><Input id="sn" name="source_name" required placeholder="ex. Ministère de la Santé, DPM" /></Field>
            <Field label="Lien vers la source" htmlFor="su"><Input id="su" name="source_url" type="url" required placeholder="https://…" /></Field>
            <Field label="Fin d'affichage (facultatif)" htmlFor="e1"><Input id="e1" name="expires_at" type="date" /></Field>
            <label className="flex items-center gap-2 self-end text-sm"><input type="checkbox" name="notify" defaultChecked className="size-4" /> Prévenir les abonnés</label>
            <SubmitButton className="w-fit" confirm="Publier cette alerte ?">Publier</SubmitButton>
          </ActionForm>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Nouveau besoin en sang</CardTitle>
          <CardDescription>Signalé par le CNTS ou un établissement : indiquez qui l&apos;a signalé. Les donneurs abonnés du groupe demandé et de la région sont prévenus.</CardDescription></CardHeader>
        <CardContent>
          <ActionForm action={saveBloodNeed} className="grid gap-3 sm:grid-cols-2" resetOnSuccess>
            <Field label="Établissement" htmlFor="f"><Input id="f" name="facility" required placeholder="ex. CHU Gabriel Touré, maternité" /></Field>
            <Field label="Région" htmlFor="r2"><Select id="r2" name="region_id" defaultValue="">{regions}</Select></Field>
            <fieldset className="sm:col-span-2"><legend className="mb-1 text-sm font-medium">Groupes demandés (aucun = tous)</legend>
              <div className="flex flex-wrap gap-3 text-sm">{["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((g) => <label key={g} className="flex items-center gap-1.5"><input type="checkbox" name="blood_groups" value={g} className="size-4" />{g}</label>)}</div></fieldset>
            <div className="sm:col-span-2"><Field label="Message" htmlFor="m"><Textarea id="m" name="message" rows={2} maxLength={400} /></Field></div>
            <Field label="Où donner" htmlFor="w"><Input id="w" name="where_to_give" maxLength={200} placeholder="ex. CNTS Quinzambougou ou banque de sang de l'hôpital" /></Field>
            <Field label="Téléphone de contact" htmlFor="p"><Input id="p" name="contact_phone" inputMode="tel" /></Field>
            <Field label="Signalé par (obligatoire)" htmlFor="s"><Input id="s" name="source" required minLength={3} placeholder="ex. CNTS, service de maternité" /></Field>
            <Field label="Valable jusqu'au" htmlFor="e2"><Input id="e2" name="expires_at" type="date" defaultValue={in3} required /></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="notify" defaultChecked className="size-4" /> Prévenir les donneurs abonnés</label>
            <SubmitButton className="w-fit" confirm="Publier ce besoin en sang ?">Publier</SubmitButton>
          </ActionForm>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Publiés</CardTitle></CardHeader>
        <CardContent>
          <ul className="divide-y text-sm">
            {(alerts ?? []).map((a) => {
              const live = a.active && (!a.expires_at || a.expires_at > now);
              return (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span><Badge className={ALERT_KIND[a.kind]?.tone}>{ALERT_KIND[a.kind]?.label}</Badge> <strong>{a.title}</strong> <span className="text-muted-foreground">· {formatDate(a.published_at)} · {a.source_name}</span> {!live && <Badge className="bg-muted text-muted-foreground">Retirée</Badge>}</span>
                  <ActionForm action={toggleAlert}><input type="hidden" name="id" value={a.id} /><input type="hidden" name="type" value="alerte" /><input type="hidden" name="active" value={String(!a.active)} /><SubmitButton size="sm" variant="ghost">{a.active ? "Retirer" : "Republier"}</SubmitButton></ActionForm>
                </li>
              );
            })}
            {(needs ?? []).map((n) => {
              const live = n.active && n.expires_at > now;
              return (
                <li key={n.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span><Badge className="border-red-200 bg-red-50 text-red-800">Sang {n.blood_groups.join(" ") || "tous groupes"}</Badge> <strong>{n.facility}</strong> <span className="text-muted-foreground">· jusqu&apos;au {formatDate(n.expires_at)} · {n.source}</span> {!live && <Badge className="bg-muted text-muted-foreground">Terminé</Badge>}</span>
                  <ActionForm action={toggleAlert}><input type="hidden" name="id" value={n.id} /><input type="hidden" name="type" value="sang" /><input type="hidden" name="active" value={String(!n.active)} /><SubmitButton size="sm" variant="ghost">{n.active ? "Clore" : "Rouvrir"}</SubmitButton></ActionForm>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
