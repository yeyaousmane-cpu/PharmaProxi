import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { saveTranslation } from "@/app/actions/v023";
import { LANGS, UI_TEXTS, type Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const metadata = { title: "Langues nationales — administration" };
export const dynamic = "force-dynamic";

export default async function AdminTranslations({ searchParams }: { searchParams: Promise<{ langue?: string }> }) {
  const sp = await searchParams;
  const lang = (sp.langue && sp.langue in LANGS && sp.langue !== "fr" ? sp.langue : "bm") as Exclude<Lang, "fr">;
  const supabase = await createClient();
  const { data } = await supabase.from("ui_translations").select("*").eq("lang", lang);
  const by = new Map((data ?? []).map((r) => [r.key as string, r]));
  const done = (data ?? []).filter((r) => r.status === "valide").length;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Langues nationales</h1>
      <p className="text-sm text-muted-foreground">Un traducteur propose le texte ; un second locuteur le relit et inscrit son nom dans « Validé par ». Seuls les textes validés s&apos;affichent ; les autres restent en français. Commencez par le bambara.</p>
      <nav className="flex flex-wrap gap-2">{(Object.keys(LANGS) as Lang[]).filter((l) => l !== "fr").map((l) => (
        <Link key={l} prefetch={false} href={`/admin/traductions?langue=${l}`} className={cn("rounded-full border px-3 py-1.5 text-sm", l === lang ? "border-primary bg-primary text-white" : "bg-white")}>{LANGS[l]}</Link>))}</nav>
      <p className="text-sm">{done} / {Object.keys(UI_TEXTS).length} textes validés en {LANGS[lang]}.</p>
      <ul className="space-y-2">{Object.entries(UI_TEXTS).map(([key, fr]) => { const t = by.get(key); return (
        <li key={key} className="rounded-xl border bg-white p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs text-muted-foreground">{key}</span>{t && <Badge className={t.status === "valide" ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900"}>{t.status === "valide" ? `Validé · ${t.validated_by}` : "Proposé"}</Badge>}</div>
          <p className="mt-1">{fr}</p>
          <ActionForm action={saveTranslation} className="mt-2 flex flex-wrap items-end gap-2">
            <input type="hidden" name="key" value={key} /><input type="hidden" name="lang" value={lang} />
            <label className="min-w-[220px] flex-1 text-xs">Traduction<Input name="text" defaultValue={t?.text ?? ""} maxLength={400} className="mt-1 h-9" /></label>
            <label className="text-xs">Proposé par<Input name="proposed_by" defaultValue={t?.proposed_by ?? ""} maxLength={120} className="mt-1 h-9 w-40" /></label>
            <label className="text-xs">Validé par<Input name="validated_by" defaultValue={t?.validated_by ?? ""} maxLength={120} className="mt-1 h-9 w-40" /></label>
            <SubmitButton size="sm">Enregistrer</SubmitButton>
          </ActionForm>
        </li>); })}</ul>
    </div>
  );
}
