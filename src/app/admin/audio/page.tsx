import Link from "next/link";
import { Check, Headphones, Printer } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { saveAudioTarget } from "@/app/actions/audio";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Select } from "@/components/ui/input";

export const metadata = { title: "Guides audio — administration" };

export default async function AdminAudio() {
  const supabase = await createClient();
  const [{ data: langs }, { data: targets }, { data: clips }, { data: fiches }] = await Promise.all([
    supabase.from("audio_languages").select("code, name").eq("is_active", true).order("sort_order"),
    supabase.from("audio_targets").select("key, label, page_path").order("sort_order").order("label"),
    supabase.from("audio_clips").select("target_key, lang, status"),
    supabase.from("health_articles").select("slug, title").eq("status", "published").order("title"),
  ]);
  const cell = (t: string, l: string) => (clips ?? []).find((c) => c.target_key === t && c.lang === l)?.status;
  const published = (clips ?? []).filter((c) => c.status === "published").length;
  return (
    <div className="space-y-4">
      <h1 className="flex items-center gap-2 text-2xl font-bold"><Headphones className="size-6 text-brand-green" aria-hidden /> Guides audio en langues nationales</h1>
      <p className="max-w-3xl text-sm text-muted-foreground">
        Chaque page a un texte français simple. Un locuteur natif le traduit oralement et l&apos;enregistre (un message vocal WhatsApp convient) ; un second locuteur vérifie le sens,
        puis vous publiez. Aucune voix de synthèse n&apos;est utilisée : un message de santé mal traduit peut être dangereux. {published} enregistrement(s) publié(s).
      </p>
      <Link prefetch={false} href="/admin/audio/kit" className="inline-flex items-center gap-2 rounded-lg border bg-white px-4 py-2 text-sm font-semibold hover:bg-muted"><Printer className="size-4" aria-hidden /> Kit d&apos;enregistrement (textes à lire, à imprimer)</Link>
      <Card>
        <CardHeader><CardTitle>Avancement</CardTitle><CardDescription>✓ publié · ● déposé, à vérifier · vide : à enregistrer. Cliquez sur une page pour déposer un enregistrement.</CardDescription></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-2 pr-2">Page</th>{(langs ?? []).map((l) => <th key={l.code} className="px-1 text-center font-medium">{l.name}</th>)}</tr></thead>
            <tbody>
              {(targets ?? []).map((t) => (
                <tr key={t.key} className="border-t">
                  <td className="py-2 pr-2"><Link prefetch={false} href={`/admin/audio/${encodeURIComponent(t.key)}`} className="font-medium text-primary underline">{t.label}</Link></td>
                  {(langs ?? []).map((l) => {
                    const st = cell(t.key, l.code);
                    return <td key={l.code} className="px-1 text-center">{st === "published" ? <Check className="mx-auto size-4 text-emerald-600" aria-label="publié" /> : st === "draft" ? <span className="text-amber-500" aria-label="à vérifier">●</span> : <span className="text-muted-foreground/40">·</span>}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Ajouter une fiche santé à enregistrer</CardTitle><CardDescription>Le résumé de la fiche sert de texte à lire ; vous pourrez le modifier.</CardDescription></CardHeader>
        <CardContent>
          {!fiches?.length ? <p className="text-sm text-muted-foreground">Aucune fiche santé publiée pour le moment.</p> : (
            <ActionForm action={saveAudioTarget} className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <Field label="Fiche publiée" htmlFor="au-fiche" className="flex-1"><Select id="au-fiche" name="article_slug">{fiches.map((f) => <option key={f.slug} value={f.slug}>{f.title}</option>)}</Select></Field>
              <SubmitButton size="sm">Ajouter</SubmitButton>
            </ActionForm>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
