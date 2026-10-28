import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/input";
import { updateContent } from "@/app/actions/admin";

export const metadata = { title: "Contenus — administration" };

export default async function AdminContent() {
  const supabase = await createClient();
  const { data } = await supabase.from("content_pages").select("*").order("slug");
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Pages d&apos;information</h1>
      <p className="text-sm text-muted-foreground">Mise en forme : paragraphes séparés par une ligne vide, listes avec « - », titres avec « ## ». Les textes juridiques doivent être validés par un juriste.</p>
      {(data ?? []).map((p) => (
        <Card key={p.slug}><CardHeader><CardTitle><Link prefetch={false} href={`/infos/${p.slug}`} className="hover:underline">/infos/{p.slug}</Link></CardTitle></CardHeader>
          <CardContent>
            <ActionForm action={updateContent} className="space-y-3">
              <input type="hidden" name="slug" value={p.slug} />
              <Field label="Titre" htmlFor={`t-${p.slug}`}><Input id={`t-${p.slug}`} name="title" defaultValue={p.title} required /></Field>
              <Field label="Contenu" htmlFor={`b-${p.slug}`}><Textarea id={`b-${p.slug}`} name="body" defaultValue={p.body} rows={10} /></Field>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="published" defaultChecked={p.published} className="size-4" /> Publiée</label>
              <SubmitButton size="sm">Enregistrer</SubmitButton>
            </ActionForm>
          </CardContent></Card>
      ))}
      <Card><CardHeader><CardTitle>Nouvelle page</CardTitle></CardHeader>
        <CardContent><ActionForm action={updateContent} resetOnSuccess className="space-y-3">
          <Field label="Identifiant (URL)" htmlFor="new-slug" hint="minuscules, chiffres, tirets"><Input id="new-slug" name="slug" required pattern="[a-z0-9\-]{2,60}" /></Field>
          <Field label="Titre" htmlFor="new-title"><Input id="new-title" name="title" required /></Field>
          <Field label="Contenu" htmlFor="new-body"><Textarea id="new-body" name="body" rows={6} /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="published" className="size-4" /> Publiée</label>
          <SubmitButton size="sm">Créer</SubmitButton>
        </ActionForm></CardContent></Card>
    </div>
  );
}
