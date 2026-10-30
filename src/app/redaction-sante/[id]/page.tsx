import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireHealthStaff } from "@/lib/health/staff";
import { ArticleForm } from "@/components/health/article-form";
import { deleteHealthArticle, publishHealthArticle, reviewHealthArticle, submitHealthArticle } from "@/app/actions/health";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/input";
import { HEALTH_STATUS, type HealthArticle, type HealthSource } from "@/lib/health/labels";
import { formatDate, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Fiche santé — rédaction" };

export default async function EditHealthArticle({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const st = await requireHealthStaff(`/redaction-sante/${id}`);
  const supabase = await createClient();
  const [{ data: art }, { data: src }, { data: cats }, { data: hist }] = await Promise.all([
    supabase.from("health_articles").select("*").eq("id", id).maybeSingle(),
    supabase.from("health_sources").select("*").eq("article_id", id).order("sort_order"),
    supabase.from("health_categories").select("id, slug, name").order("sort_order"),
    supabase.from("health_article_history").select("id, action, actor_name, from_status, to_status, note, at").eq("article_id", id).order("at", { ascending: false }).limit(50),
  ]);
  if (!art) notFound();
  const a = art as HealthArticle & { author_id: string | null };
  const status = HEALTH_STATUS[a.status];
  const isAuthor = a.author_id === st.userId;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link prefetch={false} href="/redaction-sante" className="text-sm text-[#068132] underline">← Toutes les fiches</Link>
        <Link prefetch={false} href={`/sante/fiche/${a.slug}`} className="inline-flex items-center gap-1 text-sm font-semibold text-[#1D5FA8] underline">
          {a.status === "published" ? "Voir la fiche publiée" : "Aperçu"} <ExternalLink className="size-3.5" aria-hidden />
        </Link>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold">{a.title}</h1>
        <Badge className={cn(status?.className)}>{status?.label}</Badge>
      </div>
      {a.review_note && ["changes_requested", "rejected"].includes(a.status) && (
        <Alert tone="warning" title="Message du validateur">{a.review_note}</Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Circuit de validation</CardTitle>
          <CardDescription>Brouillon → soumission → validation médicale (par un validateur qui n&apos;est pas l&apos;auteur) → publication. Toute modification d&apos;une fiche validée ou publiée la renvoie en brouillon.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {a.validator_name && a.validated_at && <p className="text-sm text-emerald-800">Validée par {a.validator_name}{a.validator_credentials ? ` (${a.validator_credentials})` : ""} le {formatDate(a.validated_at)}.</p>}
          {["draft", "changes_requested"].includes(a.status) && (
            <ActionForm action={submitHealthArticle}>
              <input type="hidden" name="id" value={a.id} />
              <SubmitButton>Soumettre à la validation médicale</SubmitButton>
              <p className="mt-1 text-xs text-muted-foreground">Exige un résumé et au moins une source.</p>
            </ActionForm>
          )}
          {a.status === "in_review" && st.validator && !isAuthor && (
            <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
              <p className="text-sm font-semibold">Votre décision de validateur médical</p>
              <p className="text-xs text-muted-foreground">Vérifiez l&apos;exactitude, les sources, le niveau de recommandation et l&apos;adaptation au contexte malien. Votre nom et votre qualification seront affichés sur la fiche.</p>
              {(["approve", "changes", "reject"] as const).map((d) => (
                <ActionForm key={d} action={reviewHealthArticle} className={d === "approve" ? "" : "space-y-2"}>
                  <input type="hidden" name="id" value={a.id} /><input type="hidden" name="decision" value={d} />
                  {d !== "approve" && <Textarea name="note" rows={2} placeholder={d === "changes" ? "Corrections à apporter…" : "Motif du rejet…"} aria-label="Message au rédacteur" />}
                  <SubmitButton size="sm" variant={d === "approve" ? "default" : d === "changes" ? "outline" : "destructive"}
                    confirm={d === "approve" ? "Je confirme avoir relu cette fiche et la valider sous mon nom." : undefined}>
                    {d === "approve" ? "Valider la fiche" : d === "changes" ? "Demander une correction" : "Rejeter"}
                  </SubmitButton>
                </ActionForm>
              ))}
            </div>
          )}
          {a.status === "in_review" && (!st.validator || isAuthor) && <p className="text-sm text-muted-foreground">En attente de la décision d&apos;un validateur médical{isAuthor ? " (vous ne pouvez pas valider votre propre fiche)" : ""}.</p>}
          {["validated", "unpublished"].includes(a.status) && (st.validator || st.isAdmin) && (
            <ActionForm action={publishHealthArticle}><input type="hidden" name="id" value={a.id} /><input type="hidden" name="publish" value="true" />
              <SubmitButton>Publier la fiche</SubmitButton></ActionForm>
          )}
          {a.status === "published" && (st.validator || st.isAdmin) && (
            <ActionForm action={publishHealthArticle}><input type="hidden" name="id" value={a.id} /><input type="hidden" name="publish" value="false" />
              <SubmitButton variant="outline" confirm="Retirer cette fiche du public ?">Dépublier</SubmitButton></ActionForm>
          )}
          {st.isAdmin && !a.published_at && (
            <ActionForm action={deleteHealthArticle}><input type="hidden" name="id" value={a.id} />
              <SubmitButton size="sm" variant="ghost" className="text-destructive" confirm="Supprimer définitivement ce brouillon ?">Supprimer le brouillon</SubmitButton></ActionForm>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Contenu</CardTitle>{a.status === "in_review" && <CardDescription>Fiche en validation : modification impossible tant que la décision n&apos;est pas rendue.</CardDescription>}</CardHeader>
        <CardContent><ArticleForm article={a} sources={(src as HealthSource[]) ?? []} categories={cats ?? []} readOnly={a.status === "in_review" || !(st.editor || st.validator)} /></CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Historique des modifications</CardTitle></CardHeader>
        <CardContent>
          <ol className="space-y-2 text-sm">
            {(hist ?? []).map((h) => (
              <li key={h.id} className="border-l-2 border-[#068132]/40 pl-3">
                <span className="font-medium">{h.action}</span>{h.to_status && <span className="text-muted-foreground"> → {HEALTH_STATUS[h.to_status]?.label ?? h.to_status}</span>}
                <span className="block text-xs text-muted-foreground">{h.actor_name ?? "—"} · {formatDateTime(h.at)}</span>
                {h.note && <span className="block text-xs">{h.note}</span>}
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
