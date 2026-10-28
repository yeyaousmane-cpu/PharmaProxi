import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/settings";
import { saveSpecialty } from "@/app/actions/directory";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input, Textarea } from "@/components/ui/input";
import { CLINIC_KINDS, REVIEW_STATUS } from "@/lib/directory";
import { formatDate, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Annuaire médical — administration" };
const one = <T,>(v: T | T[] | null | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;
const VIEWS = [["medecins", "Médecins"], ["cliniques", "Cliniques"], ["anciennes", "Fiches à confirmer"], ["specialites", "Spécialités"]] as const;
const STATUSES = ["pending", "verified", "rejected", "suspended"];

export default async function AdminDirectory({ searchParams }: { searchParams: Promise<{ vue?: string; statut?: string }> }) {
  const sp = await searchParams;
  const view = VIEWS.some(([k]) => k === sp.vue) ? sp.vue! : "medecins";
  const statut = STATUSES.includes(sp.statut ?? "") ? sp.statut! : "pending";
  const supabase = await createClient();
  const settings = await getSettings();
  const [{ count: pendingDoctors }, { count: pendingClinics }] = await Promise.all([
    supabase.from("doctors").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("clinics").select("id", { count: "exact", head: true }).eq("status", "pending"),
  ]);
  const tab = (k: string, label: string) => (
    <Link prefetch={false} key={k} href={`/admin/annuaire?vue=${k}`} aria-current={view === k ? "page" : undefined}
      className={cn("rounded-full border px-4 py-2 text-sm font-medium", view === k ? "border-brand-blue bg-brand-sky text-brand-blue" : "bg-white")}>
      {label}{k === "medecins" && pendingDoctors ? ` (${pendingDoctors})` : ""}{k === "cliniques" && pendingClinics ? ` (${pendingClinics})` : ""}
    </Link>
  );
  const statusTabs = (base: string) => (
    <div className="flex flex-wrap gap-2 text-sm">
      {STATUSES.map((s) => <Link prefetch={false} key={s} href={`/admin/annuaire?vue=${base}&statut=${s}`} className={cn("rounded-md px-3 py-1", s === statut ? "bg-muted font-semibold" : "hover:bg-muted")}>{REVIEW_STATUS[s].label}</Link>)}
    </div>
  );

  let body: React.ReactNode = null;
  if (view === "medecins") {
    const { data } = await supabase.from("doctors").select("id, title, display_name, status, is_published, created_at, confirmed_at, doctor_specialties(medical_specialties(name))").eq("status", statut).order("created_at", { ascending: statut !== "pending" ? false : true }).limit(200);
    body = (
      <Card><CardHeader><CardTitle>Médecins</CardTitle>{statusTabs("medecins")}</CardHeader>
        <CardContent>{!data?.length ? <p className="text-sm text-muted-foreground">Aucune fiche dans ce statut.</p> : (
          <ul className="divide-y text-sm">{data.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span><Link prefetch={false} href={`/admin/annuaire/medecins/${d.id}`} className="font-medium text-primary underline">{d.title} {d.display_name}</Link>
                <span className="block text-xs text-muted-foreground">{(d.doctor_specialties ?? []).map((x) => one(x.medical_specialties)?.name).filter(Boolean).join(", ")} · demande du {formatDate(d.created_at)}{!d.is_published ? " · retirée par le médecin" : ""}</span></span>
              <Badge className={REVIEW_STATUS[d.status].className}>{REVIEW_STATUS[d.status].label}</Badge>
            </li>))}</ul>)}
        </CardContent></Card>
    );
  } else if (view === "cliniques") {
    const { data } = await supabase.from("clinics").select("id, name, kind, status, created_at, communes(name), regions(name)").eq("status", statut).order("created_at", { ascending: statut === "pending" }).limit(200);
    body = (
      <Card><CardHeader><CardTitle>Cliniques et établissements</CardTitle>{statusTabs("cliniques")}</CardHeader>
        <CardContent>{!data?.length ? <p className="text-sm text-muted-foreground">Aucun établissement dans ce statut.</p> : (
          <ul className="divide-y text-sm">{data.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span><Link prefetch={false} href={`/admin/annuaire/cliniques/${c.id}`} className="font-medium text-primary underline">{c.name}</Link>
                <span className="block text-xs text-muted-foreground">{CLINIC_KINDS[c.kind]} · {[one(c.communes)?.name, one(c.regions)?.name].filter(Boolean).join(", ")} · demande du {formatDate(c.created_at)}</span></span>
              <Badge className={REVIEW_STATUS[c.status].className}>{REVIEW_STATUS[c.status].label}</Badge>
            </li>))}</ul>)}
        </CardContent></Card>
    );
  } else if (view === "anciennes") {
    const limit = new Date(Date.now() - settings.directory_fresh_days * 86_400_000).toISOString();
    const [{ data: docs }, { data: clis }] = await Promise.all([
      supabase.from("doctors").select("id, title, display_name, confirmed_at, reminded_at").eq("status", "verified").lt("confirmed_at", limit).order("confirmed_at").limit(200),
      supabase.from("clinics").select("id, name, confirmed_at, reminded_at").eq("status", "verified").lt("confirmed_at", limit).order("confirmed_at").limit(200),
    ]);
    const row = (href: string, name: string, confirmed: string, reminded: string | null) => {
      const days = Math.floor((Date.now() - new Date(confirmed).getTime()) / 86_400_000);
      return (
        <li key={href} className="flex flex-wrap items-center justify-between gap-2 py-2">
          <Link prefetch={false} href={href} className="font-medium text-primary underline">{name}</Link>
          <span className="text-xs text-muted-foreground">Confirmée il y a {days} j{days > settings.directory_stale_days ? " — retirée de l'annuaire" : ""}{reminded ? ` · relancée le ${formatDate(reminded)}` : ""}</span>
        </li>
      );
    };
    body = (
      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>Médecins à relancer</CardTitle></CardHeader><CardContent>
          {!docs?.length ? <p className="text-sm text-muted-foreground">Toutes les fiches sont à jour.</p> : <ul className="divide-y text-sm">{docs.map((d) => row(`/admin/annuaire/medecins/${d.id}`, `${d.title} ${d.display_name}`, d.confirmed_at, d.reminded_at))}</ul>}
        </CardContent></Card>
        <Card><CardHeader><CardTitle>Établissements à relancer</CardTitle></CardHeader><CardContent>
          {!clis?.length ? <p className="text-sm text-muted-foreground">Tous les établissements sont à jour.</p> : <ul className="divide-y text-sm">{clis.map((c) => row(`/admin/annuaire/cliniques/${c.id}`, c.name, c.confirmed_at, c.reminded_at))}</ul>}
        </CardContent></Card>
        <p className="text-xs text-muted-foreground lg:col-span-2">Les rappels automatiques partent avec la maintenance planifiée (au plus un tous les 30 jours). Au-delà de {settings.directory_stale_days} jours, la fiche n&apos;est plus publiée.</p>
      </div>
    );
  } else {
    const { data } = await supabase.from("medical_specialties").select("id, code, name, family, description, sort_order, is_active").order("sort_order");
    body = (
      <Card><CardHeader><CardTitle>Spécialités</CardTitle>
        <p className="text-sm text-muted-foreground">Liste à valider avec l&apos;Ordre des médecins. Descriptions neutres, sans conseil médical. Désactiver une spécialité la retire des formulaires (les fiches existantes la conservent).</p></CardHeader>
        <CardContent className="space-y-3">
          {(data ?? []).map((s) => (
            <details key={s.id} className="rounded-lg border p-3">
              <summary className="cursor-pointer text-sm"><strong>{s.name}</strong> <span className="text-muted-foreground">· {s.family}{s.is_active ? "" : " · désactivée"}</span></summary>
              <ActionForm action={saveSpecialty} className="mt-3 grid gap-2 sm:grid-cols-2">
                <input type="hidden" name="id" value={s.id} />
                <Input name="name" defaultValue={s.name} aria-label="Nom" required />
                <Input name="family" defaultValue={s.family} aria-label="Famille" required />
                <Textarea name="description" defaultValue={s.description ?? ""} aria-label="Description" maxLength={400} rows={2} className="sm:col-span-2" />
                <Input name="sort_order" type="number" defaultValue={s.sort_order} aria-label="Ordre d'affichage" />
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_active" defaultChecked={s.is_active} className="size-4" /> Active</label>
                <SubmitButton size="sm" variant="outline">Enregistrer</SubmitButton>
              </ActionForm>
            </details>
          ))}
          <details className="rounded-lg border border-dashed p-3">
            <summary className="cursor-pointer text-sm font-semibold">Ajouter une spécialité</summary>
            <ActionForm action={saveSpecialty} resetOnSuccess className="mt-3 grid gap-2 sm:grid-cols-2">
              <Input name="code" placeholder="code_technique" aria-label="Code" required pattern="[a-z0-9_]{2,40}" />
              <Input name="name" placeholder="Nom" aria-label="Nom" required />
              <Input name="family" placeholder="Famille" aria-label="Famille" required />
              <Input name="sort_order" type="number" defaultValue={100} aria-label="Ordre d'affichage" />
              <Textarea name="description" placeholder="Description neutre (facultative)" aria-label="Description" maxLength={400} rows={2} className="sm:col-span-2" />
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_active" defaultChecked className="size-4" /> Active</label>
              <SubmitButton size="sm">Ajouter</SubmitButton>
            </ActionForm>
          </details>
        </CardContent></Card>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Annuaire médical</h1>
      <nav aria-label="Vues de l'annuaire" className="flex flex-wrap gap-2">{VIEWS.map(([k, l]) => tab(k, l))}</nav>
      {body}
      <p className="text-xs text-muted-foreground">Dernière mise à jour : {formatDateTime(new Date())}</p>
    </div>
  );
}
