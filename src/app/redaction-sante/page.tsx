import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireHealthStaff } from "@/lib/health/staff";
import { closeHealthReport, setHealthStaff } from "@/app/actions/health";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";
import { HEALTH_KIND, HEALTH_STATUS } from "@/lib/health/labels";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const TABS = [["", "Toutes"], ["draft", "Brouillons"], ["changes_requested", "Corrections"], ["in_review", "À valider"], ["validated", "Validées"], ["published", "Publiées"], ["unpublished", "Dépubliées"], ["rejected", "Rejetées"]] as const;
const one = <T,>(v: T | T[] | null | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

export default async function EditorialHome({ searchParams }: { searchParams: Promise<{ statut?: string; q?: string }> }) {
  const sp = await searchParams;
  const st = await requireHealthStaff();
  const statut = TABS.some(([k]) => k === sp.statut) ? sp.statut! : "";
  const supabase = await createClient();
  let query = supabase.from("health_articles").select("id, title, status, kind, updated_at, author_name, health_categories(name)").order("updated_at", { ascending: false }).limit(200);
  if (statut) query = query.eq("status", statut);
  if (sp.q) query = query.ilike("title", `%${sp.q.replace(/[%,]/g, "")}%`);
  const [{ data: list }, { data: all }, { data: reports }, { data: staff }] = await Promise.all([
    query,
    supabase.from("health_articles").select("status"),
    supabase.from("health_reports").select("id, reason, created_at, health_articles(id, title)").eq("status", "open").order("created_at", { ascending: false }).limit(50),
    st.isAdmin ? supabase.from("health_staff").select("user_id, role, display_name, credentials, profiles(full_name)").order("role") : Promise.resolve({ data: [] }),
  ]);
  const count = (k: string) => (all ?? []).filter((a) => !k || a.status === k).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex flex-wrap gap-2" aria-label="Statut">
          {TABS.map(([k, l]) => (
            <Link prefetch={false} key={k} href={`/redaction-sante${k ? `?statut=${k}` : ""}`} aria-current={statut === k ? "page" : undefined}
              className={cn("rounded-full border px-3 py-1.5 text-sm font-medium", statut === k ? "border-[#068132] bg-[#EAF6EE] text-[#052D1E]" : "bg-white")}>
              {l} ({count(k)})
            </Link>
          ))}
        </nav>
        {st.editor || st.validator ? <Link prefetch={false} href="/redaction-sante/nouvelle" className={cn(buttonVariants())}><Plus aria-hidden /> Nouvelle fiche</Link> : null}
      </div>
      {st.validator && count("in_review") > 0 && statut !== "in_review" && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">{count("in_review")} fiche(s) attendent une validation médicale. <Link prefetch={false} href="/redaction-sante?statut=in_review" className="font-semibold underline">Les voir</Link></p>
      )}
      <form method="get" className="flex gap-2">
        {statut && <input type="hidden" name="statut" value={statut} />}
        <Input name="q" defaultValue={sp.q} placeholder="Titre" className="h-9 max-w-xs" aria-label="Rechercher par titre" />
      </form>
      <Card>
        <CardContent className="pt-4">
          {!list?.length ? <p className="text-sm text-muted-foreground">Aucune fiche.</p> : (
            <ul className="divide-y">
              {list.map((a) => (
                <li key={a.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <span className="min-w-0">
                    <Link prefetch={false} href={`/redaction-sante/${a.id}`} className="font-semibold text-[#052D1E] hover:underline">{a.title}</Link>
                    <span className="block text-xs text-muted-foreground">{one(a.health_categories)?.name} · {HEALTH_KIND[a.kind]} · modifiée le {formatDateTime(a.updated_at)}{a.author_name ? ` · ${a.author_name}` : ""}</span>
                  </span>
                  <Badge className={cn("w-fit shrink-0", HEALTH_STATUS[a.status]?.className)}>{HEALTH_STATUS[a.status]?.label}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Signalements du public</CardTitle><CardDescription>Informations signalées comme obsolètes ou erronées.</CardDescription></CardHeader>
        <CardContent>
          {!reports?.length ? <p className="text-sm text-muted-foreground">Aucun signalement en attente.</p> : (
            <ul className="divide-y text-sm">
              {reports.map((r) => {
                const art = one(r.health_articles);
                return (
                  <li key={r.id} className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between">
                    <span><Link prefetch={false} href={`/redaction-sante/${art?.id}`} className="font-medium underline">{art?.title}</Link><span className="block text-muted-foreground">« {r.reason} » · {formatDateTime(r.created_at)}</span></span>
                    <ActionForm action={closeHealthReport}><input type="hidden" name="id" value={r.id} /><SubmitButton size="sm" variant="outline">Traité</SubmitButton></ActionForm>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {st.isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>Rédacteurs et validateurs médicaux</CardTitle>
            <CardDescription>
              La personne doit d&apos;abord avoir un compte PharmaProxi. Un validateur médical doit être un professionnel de santé dont vous avez vérifié l&apos;identité et l&apos;inscription à l&apos;Ordre :
              son nom et sa qualification sont affichés sur chaque fiche qu&apos;il valide.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {(staff ?? []).length > 0 && (
              <ul className="divide-y text-sm">
                {(staff as { user_id: string; role: string; display_name: string; credentials: string | null }[]).map((s) => (
                  <li key={`${s.user_id}-${s.role}`} className="flex items-center justify-between gap-2 py-2">
                    <span><span className="font-medium">{s.display_name}</span> <Badge className="bg-white">{s.role === "validator" ? "Validateur médical" : "Rédacteur"}</Badge>{s.credentials && <span className="block text-xs text-muted-foreground">{s.credentials}</span>}</span>
                  </li>
                ))}
              </ul>
            )}
            <ActionForm action={setHealthStaff} resetOnSuccess className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.2fr_1fr_1.2fr_1fr_auto] lg:items-end">
              <Field label="E-mail du compte" htmlFor="hs-email"><Input id="hs-email" name="email" type="email" required /></Field>
              <Field label="Rôle" htmlFor="hs-role"><Select id="hs-role" name="role" defaultValue="validator"><option value="validator">Validateur médical</option><option value="editor">Rédacteur</option></Select></Field>
              <Field label="Nom affiché" htmlFor="hs-name" hint="Ex. Dr A. Traoré, hématologue"><Input id="hs-name" name="display_name" required maxLength={120} /></Field>
              <Field label="Qualification (facultatif)" htmlFor="hs-cred"><Input id="hs-cred" name="credentials" maxLength={200} placeholder="N° d'Ordre…" /></Field>
              <div className="flex gap-2">
                <SubmitButton size="sm" name="grant" value="true">Attribuer</SubmitButton>
                <SubmitButton size="sm" variant="outline" name="grant" value="false">Retirer</SubmitButton>
              </div>
            </ActionForm>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
