import Link from "next/link";
import { Baby, ChevronRight, FolderHeart, Plus, Users } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SanteNav, PRIVACY_NOTE } from "@/components/sante-perso/nav";
import { RELATIONS } from "@/lib/dossier/config";
import { buildVisits, nextVisit, type Dose } from "@/lib/vaccines";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Santé de ma famille" };
export const dynamic = "force-dynamic";

/** Vue d'ensemble : les dossiers des proches et le carnet de vaccination des enfants, réunis. */
export default async function Famille() {
  const s = await requireUser("/ma-sante/famille");
  const supabase = await createClient();
  const [{ data: persons }, { data: kids }, { data: sched }, { data: vacc }] = await Promise.all([
    supabase.from("record_persons").select("id, display_name, relation, birth_year").eq("owner_id", s.userId).eq("is_self", false).order("created_at"),
    supabase.from("children").select("id, first_name, birth_date, sex").order("birth_date"),
    supabase.from("vaccine_schedule").select("*"),
    supabase.from("child_vaccinations").select("child_id, dose_code, done_on"),
  ]);
  const doneBy = (id: string) => Object.fromEntries((vacc ?? []).filter((v) => v.child_id === id).map((v) => [v.dose_code, v.done_on]));
  const year = new Date().getFullYear();
  return (
    <div className="container-page max-w-4xl space-y-5 py-6">
      <header className="space-y-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-brand-deep"><Users className="size-7 text-primary" aria-hidden /> Santé de ma famille</h1>
        <p className="text-sm text-muted-foreground">{PRIVACY_NOTE} Les informations de vos proches ne sont visibles que par vous.</p>
      </header>
      <SanteNav current="/ma-sante/famille" />

      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-lg font-bold text-brand-deep"><FolderHeart className="size-5 text-primary" aria-hidden /> Dossiers santé de mes proches</h2>
          <Link prefetch={false} href="/ma-sante/dossier/proches" className="flex items-center gap-1 text-sm font-semibold text-primary"><Plus className="size-4" aria-hidden /> Ajouter un proche</Link>
        </div>
        {(persons ?? []).length === 0 ? <p className="rounded-2xl border bg-white p-4 text-sm text-muted-foreground">Ajoutez un parent âgé, un enfant ou votre conjoint pour garder ses allergies, traitements et rendez-vous au même endroit.</p> : (
          <ul className="grid gap-3 sm:grid-cols-2">{(persons ?? []).map((p) => (
            <li key={p.id}><Link prefetch={false} href={`/ma-sante/dossier?p=${p.id}`} className="flex items-center justify-between gap-2 rounded-2xl border bg-white p-4 hover:border-primary">
              <span><span className="block font-semibold text-brand-deep">{p.display_name}</span>
                <span className="text-sm text-muted-foreground">{[p.relation ? RELATIONS[p.relation] : null, p.birth_year ? `${year - p.birth_year} ans` : null].filter(Boolean).join(" · ")}</span></span>
              <ChevronRight className="size-5 text-primary rtl:-scale-x-100" aria-hidden /></Link></li>))}</ul>
        )}
      </section>

      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-lg font-bold text-brand-deep"><Baby className="size-5 text-primary" aria-hidden /> Vaccins des enfants</h2>
          <Link prefetch={false} href="/ma-sante/enfants" className="flex items-center gap-1 text-sm font-semibold text-primary"><Plus className="size-4" aria-hidden /> Ajouter un enfant</Link>
        </div>
        {(kids ?? []).length === 0 ? <p className="rounded-2xl border bg-white p-4 text-sm text-muted-foreground">Ajoutez vos enfants pour suivre leur calendrier de vaccination et recevoir les rappels.</p> : (
          <ul className="grid gap-3 sm:grid-cols-2">{(kids ?? []).map((k) => {
            const next = nextVisit(buildVisits((sched ?? []) as Dose[], k.birth_date, k.sex, doneBy(k.id)));
            return (
              <li key={k.id}><Link prefetch={false} href={`/ma-sante/enfants/${k.id}`} className="flex items-center justify-between gap-2 rounded-2xl border bg-white p-4 hover:border-primary">
                <span><span className="block font-semibold text-brand-deep">{k.first_name}</span>
                  <span className={`text-sm ${next?.status === "en_retard" ? "font-semibold text-red-700" : "text-muted-foreground"}`}>{next ? `${next.label}${next.status === "en_retard" ? " : en retard" : ` · ${formatDate(next.due)}`}` : "Calendrier à jour"}</span></span>
                <ChevronRight className="size-5 text-primary rtl:-scale-x-100" aria-hidden /></Link></li>);
          })}</ul>
        )}
      </section>
    </div>
  );
}
