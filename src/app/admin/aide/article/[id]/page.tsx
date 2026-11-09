import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { deleteHelpArticle, saveHelpArticle } from "@/app/actions/help";

export const metadata = { title: "Article d'aide — administration" };
export const dynamic = "force-dynamic";

type Art = { id: string; slug: string; category_slug: string; section: string; title: string; summary: string; body: string; keywords: string; status: string; sort: number };

export default async function EditHelpArticle({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const isNew = id === "nouveau";
  if (!isNew && !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [{ data: cats }, art] = await Promise.all([
    supabase.from("help_categories").select("slug,title").order("sort"),
    isNew ? Promise.resolve({ data: null }) : supabase.from("help_articles").select("*").eq("id", id).maybeSingle(),
  ]);
  const a = art.data as Art | null;
  if (!isNew && !a) notFound();
  return (
    <div className="space-y-4">
      <Link prefetch={false} href="/admin/aide" className="text-sm text-muted-foreground hover:underline">← Centre d&apos;aide</Link>
      <h1 className="text-2xl font-bold">{isNew ? "Nouvel article" : a!.title}</h1>
      <p className="text-sm text-muted-foreground">Mise en forme : ligne vide entre paragraphes, « - » pour une liste, « 1. » pour des étapes, **gras**, *italique*, « ## » pour un intertitre. Ne décrivez que des fonctions réellement disponibles.</p>
      <ActionForm action={saveHelpArticle} className="grid gap-3 rounded-2xl border bg-white p-4 sm:grid-cols-2">
        {a && <input type="hidden" name="id" value={a.id} />}
        <Field label="Titre (question de l'utilisateur)" htmlFor="title" required className="sm:col-span-2"><Input id="title" name="title" maxLength={140} required defaultValue={a?.title} /></Field>
        <Field label="Adresse (slug)" htmlFor="slug" required><Input id="slug" name="slug" maxLength={90} required defaultValue={a?.slug} placeholder="ex. annuler-un-rendez-vous" /></Field>
        <Field label="Rubrique" htmlFor="cat" required><Select id="cat" name="category_slug" defaultValue={a?.category_slug ?? ""} required>
          <option value="" disabled>Choisir…</option>{((cats as { slug: string; title: string }[] | null) ?? []).map((c) => <option key={c.slug} value={c.slug}>{c.title}</option>)}</Select></Field>
        <Field label="Section" htmlFor="section" required><Input id="section" name="section" maxLength={80} required defaultValue={a?.section} /></Field>
        <Field label="Ordre" htmlFor="sort"><Input id="sort" name="sort" type="number" min={0} max={9999} defaultValue={a?.sort ?? 100} /></Field>
        <Field label="Résumé" htmlFor="summary" required className="sm:col-span-2"><Input id="summary" name="summary" maxLength={300} required defaultValue={a?.summary} /></Field>
        <Field label="Contenu" htmlFor="body" required className="sm:col-span-2"><Textarea id="body" name="body" rows={14} maxLength={20000} required defaultValue={a?.body} /></Field>
        <Field label="Mots-clés et synonymes (pour la recherche)" htmlFor="kw" className="sm:col-span-2"><Input id="kw" name="keywords" maxLength={500} defaultValue={a?.keywords} placeholder="ex. rdv annuler report" /></Field>
        <Field label="Statut" htmlFor="status"><Select id="status" name="status" defaultValue={a?.status ?? "brouillon"}><option value="brouillon">Brouillon</option><option value="publie">Publié</option></Select></Field>
        <div className="flex items-end gap-2 sm:col-span-2"><SubmitButton>Enregistrer</SubmitButton>{a?.status === "publie" && <Link prefetch={false} href={`/aide/article/${a.slug}`} className="rounded-xl border px-4 py-2 text-sm font-semibold">Voir l&apos;article</Link>}</div>
      </ActionForm>
      {a && <ActionForm action={deleteHelpArticle}><input type="hidden" name="id" value={a.id} /><SubmitButton variant="outline" size="sm" confirm={`Supprimer définitivement « ${a.title} » ?`}>Supprimer l&apos;article</SubmitButton></ActionForm>}
    </div>
  );
}
