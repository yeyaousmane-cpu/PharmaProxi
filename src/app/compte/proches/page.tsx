import Link from "next/link";
import { Users } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";
import { addRelative, removeRelative } from "@/app/actions/appointments";
import { RELATION_LABEL } from "@/lib/appointments";
import { formatPhone } from "@/lib/format";
import { safeNext } from "@/lib/redirect";

export const metadata = { title: "Mes proches" };

export default async function RelativesPage({ searchParams }: { searchParams: Promise<{ retour?: string }> }) {
  const sp = await searchParams;
  await requireUser("/compte/proches");
  const supabase = await createClient();
  const { data } = await supabase.from("patient_relatives").select("id, full_name, relation, phone").order("created_at");
  const back = sp.retour ? safeNext(sp.retour, "/compte/rendez-vous") : null;
  return (
    <div className="container-page max-w-2xl space-y-5 py-6">
      <Link prefetch={false} href={back ?? "/compte/rendez-vous"} className="text-sm text-primary underline">← {back ? "Revenir à la prise de rendez-vous" : "Mes rendez-vous"}</Link>
      <h1 className="flex items-center gap-2 text-2xl font-bold"><Users className="size-6 text-brand-blue" aria-hidden /> Mes proches</h1>
      <p className="text-sm text-muted-foreground">Prenez rendez-vous pour vos enfants ou vos parents depuis votre compte. Seuls leur nom et, si vous le souhaitez, leur téléphone sont enregistrés.</p>
      <Card>
        <CardHeader><CardTitle>Proches enregistrés</CardTitle></CardHeader>
        <CardContent>
          {!data?.length ? <p className="text-sm text-muted-foreground">Aucun proche enregistré.</p> : (
            <ul className="divide-y">
              {data.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span><strong>{r.full_name}</strong> <span className="text-muted-foreground">({RELATION_LABEL[r.relation] ?? r.relation}){r.phone ? ` · ${formatPhone(r.phone)}` : ""}</span></span>
                  <ActionForm action={removeRelative}><input type="hidden" name="id" value={r.id} /><SubmitButton size="sm" variant="ghost" confirm={`Retirer ${r.full_name} ?`}>Retirer</SubmitButton></ActionForm>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Ajouter un proche</CardTitle><CardDescription>10 proches au maximum.</CardDescription></CardHeader>
        <CardContent>
          <ActionForm action={addRelative} resetOnSuccess className="grid gap-3 sm:grid-cols-2">
            <Field label="Nom et prénom" htmlFor="full_name" required><Input id="full_name" name="full_name" required minLength={2} maxLength={120} /></Field>
            <Field label="Lien" htmlFor="relation">
              <Select id="relation" name="relation" defaultValue="enfant">{Object.entries(RELATION_LABEL).map(([k, l]) => <option key={k} value={k}>{l.charAt(0).toUpperCase() + l.slice(1)}</option>)}</Select>
            </Field>
            <Field label="Téléphone (facultatif)" htmlFor="phone"><Input id="phone" name="phone" type="tel" /></Field>
            <div className="flex items-end"><SubmitButton>Ajouter</SubmitButton></div>
          </ActionForm>
          {back && <Link prefetch={false} href={back} className="mt-4 inline-block text-sm font-semibold text-brand-blue underline">Continuer la prise de rendez-vous →</Link>}
        </CardContent>
      </Card>
    </div>
  );
}
