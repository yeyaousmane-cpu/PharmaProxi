import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { deleteAudio, publishAudio, saveAudioTarget, uploadAudio } from "@/app/actions/audio";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/input";
import { audioPublicUrl, formatDuration } from "@/lib/audio";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Guide audio — administration" };

type Clip = { id: string; lang: string; storage_path: string; size_bytes: number; duration_s: number | null; speaker: string | null; translator: string | null; reviewer: string | null; status: string; created_at: string };

export default async function AdminAudioTarget({ params }: { params: Promise<{ key: string }> }) {
  const key = decodeURIComponent((await params).key);
  if (!/^[a-z0-9:-]{2,100}$/.test(key)) notFound();
  const supabase = await createClient();
  const [{ data: t }, { data: langs }, { data: clips }] = await Promise.all([
    supabase.from("audio_targets").select("key, label, page_path, script_fr").eq("key", key).maybeSingle(),
    supabase.from("audio_languages").select("code, name, native_name").eq("is_active", true).order("sort_order"),
    supabase.from("audio_clips").select("id, lang, storage_path, size_bytes, duration_s, speaker, translator, reviewer, status, created_at").eq("target_key", key),
  ]);
  if (!t) notFound();
  const byLang = new Map(((clips as Clip[]) ?? []).map((c) => [c.lang, c]));
  return (
    <div className="space-y-4">
      <Link prefetch={false} href="/admin/audio" className="text-sm text-primary underline">← Guides audio</Link>
      <h1 className="text-2xl font-bold">{t.label}</h1>
      <Card>
        <CardHeader><CardTitle>Texte à faire traduire oralement</CardTitle><CardDescription>Page : <Link prefetch={false} href={t.page_path} className="underline">{t.page_path}</Link>. Le locuteur garde le sens exact, sans rien ajouter (pas de conseil médical personnel).</CardDescription></CardHeader>
        <CardContent>
          <ActionForm action={saveAudioTarget} className="space-y-2">
            <input type="hidden" name="key" value={t.key} /><input type="hidden" name="label" value={t.label} /><input type="hidden" name="page_path" value={t.page_path} />
            <Textarea name="script" rows={6} defaultValue={t.script_fr} maxLength={3000} aria-label="Texte français" />
            <SubmitButton size="sm" variant="outline">Enregistrer le texte</SubmitButton>
          </ActionForm>
        </CardContent>
      </Card>
      <div className="grid gap-3 lg:grid-cols-2">
        {(langs ?? []).map((l) => {
          const c = byLang.get(l.code);
          return (
            <Card key={l.code}>
              <CardHeader className="pb-2">
                <CardTitle className="flex flex-wrap items-center gap-2 text-base">{l.name}{l.native_name && <span className="text-sm font-normal text-muted-foreground">{l.native_name}</span>}
                  {c && <Badge className={c.status === "published" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-900"}>{c.status === "published" ? "Publié" : "À vérifier"}</Badge>}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {c && (
                  <div className="space-y-2 rounded-lg bg-muted/50 p-3">
                    <audio controls preload="none" src={audioPublicUrl(c.storage_path)} className="w-full" />
                    <p className="text-xs text-muted-foreground">
                      {[formatDuration(c.duration_s), `${Math.round(c.size_bytes / 1024)} Ko`, c.speaker && `voix : ${c.speaker}`, c.translator && `traduction : ${c.translator}`, c.reviewer ? `vérifié par : ${c.reviewer}` : "relecture non indiquée", formatDateTime(c.created_at)].filter(Boolean).join(" · ")}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <ActionForm action={publishAudio}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="target" value={key} /><input type="hidden" name="publish" value={c.status === "published" ? "false" : "true"} />
                        <SubmitButton size="sm" variant={c.status === "published" ? "outline" : "default"}>{c.status === "published" ? "Retirer du site" : "Publier"}</SubmitButton></ActionForm>
                      <ActionForm action={deleteAudio}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="target" value={key} />
                        <SubmitButton size="sm" variant="ghost" className="text-destructive" confirm="Supprimer cet enregistrement ?">Supprimer</SubmitButton></ActionForm>
                    </div>
                  </div>
                )}
                <details open={!c}>
                  <summary className="cursor-pointer text-sm font-semibold">{c ? "Remplacer l'enregistrement" : "Déposer un enregistrement"}</summary>
                  <ActionForm action={uploadAudio} resetOnSuccess className="mt-2 grid gap-2 sm:grid-cols-2">
                    <input type="hidden" name="target" value={key} /><input type="hidden" name="lang" value={l.code} />
                    <Field label="Fichier audio (4 Mo max.)" htmlFor={`f-${l.code}`} className="sm:col-span-2" hint="MP3, M4A, OPUS/OGG (message vocal WhatsApp), WEBM ou WAV.">
                      <Input id={`f-${l.code}`} type="file" name="file" accept="audio/*,.opus,.m4a" required />
                    </Field>
                    <Field label="Voix (affichée)" htmlFor={`s-${l.code}`}><Input id={`s-${l.code}`} name="speaker" maxLength={120} /></Field>
                    <Field label="Durée (secondes)" htmlFor={`d-${l.code}`}><Input id={`d-${l.code}`} name="duration" type="number" min={1} max={900} /></Field>
                    <Field label="Traduction orale par" htmlFor={`t-${l.code}`}><Input id={`t-${l.code}`} name="translator" maxLength={120} /></Field>
                    <Field label="Vérifiée par (second locuteur)" htmlFor={`r-${l.code}`} hint={l.code === "francais" ? undefined : "Obligatoire pour publier."}><Input id={`r-${l.code}`} name="reviewer" maxLength={120} /></Field>
                    <SubmitButton size="sm" pendingText="Envoi…" className="w-fit">Déposer</SubmitButton>
                  </ActionForm>
                </details>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
