import { createClient } from "@/lib/supabase/server";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { publishPolicy } from "@/app/actions/v026";
import { bamako } from "@/lib/compliance";

type V = { version: string; title: string; body: string; sha256: string; status: string; published_at: string | null };

export default async function PolicyVersions() {
  const supabase = await createClient();
  const [{ data }, { data: canEdit }] = await Promise.all([supabase.from("privacy_policy_versions").select("version,title,body,sha256,status,published_at").order("created_at", { ascending: false }), supabase.rpc("can_edit_compliance")]);
  const rows = (data as V[] | null) ?? [];
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Une version publiée est figée : elle ne peut être ni modifiée ni supprimée. Chaque nouveau consentement enregistre la version en vigueur. Publier une nouvelle version archive la précédente.</p>
      {rows.map((v) => (
        <details key={v.version} className="rounded-2xl border bg-white p-4">
          <summary className="cursor-pointer font-semibold">Version {v.version} · {v.title} · <span className={v.status === "publiee" ? "text-emerald-700" : "text-muted-foreground"}>{v.status === "publiee" ? "en vigueur" : v.status}</span>{v.published_at && ` · publiée le ${bamako(v.published_at)}`}</summary>
          <p className="mt-2 font-mono text-[10px] break-all">SHA-256 : {v.sha256}</p>
          <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-muted/50 p-3 text-sm">{v.body}</pre>
        </details>))}
      {canEdit && (
        <section className="rounded-2xl border bg-white p-4">
          <h2 className="font-bold">Publier une nouvelle version</h2>
          <p className="text-sm text-muted-foreground">À faire seulement après relecture par un juriste. Pensez à mettre à jour la page « Confidentialité » avec le même texte.</p>
          <ActionForm action={publishPolicy} className="mt-3 grid gap-2 text-sm">
            <label>Numéro de version<input name="version" required maxLength={20} placeholder="ex. 2" className="mt-1 h-10 w-full rounded-md border px-2" /></label>
            <label>Titre<input name="title" required maxLength={160} defaultValue="Politique de confidentialité" className="mt-1 h-10 w-full rounded-md border px-2" /></label>
            <label>Texte intégral<textarea name="body" required rows={10} className="mt-1 w-full rounded-md border p-2" /></label>
            <div><SubmitButton size="sm" confirm="Publier cette version ? Elle ne pourra plus être modifiée.">Publier</SubmitButton></div>
          </ActionForm>
        </section>)}
    </div>
  );
}
