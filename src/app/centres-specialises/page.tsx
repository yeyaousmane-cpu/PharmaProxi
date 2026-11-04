import Link from "next/link";
import { HeartPulse, MapPin, Phone } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getGeo } from "@/lib/geo";
import { isSupabaseConfigured } from "@/lib/env";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { formatDate, formatPhone } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Centres spécialisés", description: "Trouver un centre selon son besoin : diabète, drépanocytose, cœur, cancers, santé mentale, maternité, enfants, VIH, dialyse…" };
export const dynamic = "force-dynamic";

type Focus = { code: string; label: string; hint: string | null };
type Row = { kind: string; id: string; name: string; category: string; city: string | null; address: string | null; phone: string | null; source: string; verified_at: string | null; link: string | null };

export default async function Centres({ searchParams }: { searchParams: Promise<{ besoin?: string; region?: string }> }) {
  const sp = await searchParams;
  const geo = await getGeo();
  let focus: Focus[] = [];
  let rows: Row[] = [];
  const region = geo.regions.some((r) => r.id === sp.region) ? sp.region! : null;
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    focus = ((await supabase.from("care_focus").select("code, label, hint").order("sort")).data ?? []) as Focus[];
    if (sp.besoin && focus.some((f) => f.code === sp.besoin)) rows = ((await supabase.rpc("specialized_centres", { p_focus: sp.besoin, p_region: region })).data ?? []) as Row[];
  }
  const current = focus.find((f) => f.code === sp.besoin);
  return (
    <div className="container-page max-w-4xl space-y-5 py-6">
      <header className="space-y-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-brand-deep"><HeartPulse className="size-7 text-primary" aria-hidden /> Centres spécialisés</h1>
        <p className="text-muted-foreground">Choisissez votre besoin pour trouver les structures qui le prennent en charge. Chaque information indique sa source et sa date de vérification : appelez avant de vous déplacer.</p>
      </header>
      <nav aria-label="Besoins" className="flex flex-wrap gap-2">{focus.map((f) => (
        <Link key={f.code} prefetch={false} href={`/centres-specialises?besoin=${f.code}${region ? `&region=${region}` : ""}`} aria-current={f.code === sp.besoin ? "page" : undefined}
          className={cn("rounded-full border px-3 py-1.5 text-sm font-medium", f.code === sp.besoin ? "border-primary bg-primary text-white" : "bg-white hover:border-primary")}>{f.label}</Link>))}</nav>
      {current && (
        <section className="space-y-3">
          <form method="get" className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="besoin" value={current.code} />
            <label className="text-sm">Région<Select name="region" defaultValue={region ?? ""} className="mt-1 h-10 w-56"><option value="">Tout le Mali</option>{geo.regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></label>
            <Button type="submit" size="sm">Filtrer</Button>
          </form>
          <h2 className="text-lg font-bold text-brand-deep">{current.label}{current.hint ? <span className="ml-2 text-sm font-normal text-muted-foreground">{current.hint}</span> : null}</h2>
          {rows.length === 0 ? (
            <p className="rounded-2xl border bg-white p-4 text-sm text-muted-foreground">Aucune structure n&apos;est encore référencée pour ce besoin{region ? " dans cette région" : ""}. L&apos;équipe ajoute les centres au fur et à mesure de leur vérification. En attendant, demandez conseil à votre médecin ou à votre centre de santé, ou cherchez un <Link prefetch={false} href="/medecins" className="text-primary underline">médecin par spécialité</Link>.</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">{rows.map((r) => (
              <li key={`${r.kind}-${r.id}`} className="flex flex-col gap-1.5 rounded-2xl border bg-white p-4 text-sm">
                {r.link ? <Link prefetch={false} href={r.link} className="text-base font-bold text-brand-deep hover:underline">{r.name}</Link> : <span className="text-base font-bold text-brand-deep">{r.name}</span>}
                {(r.city || r.address) && <p className="flex items-start gap-1 text-muted-foreground"><MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />{[r.address, r.city].filter(Boolean).join(", ")}</p>}
                {r.phone && <a href={`tel:${r.phone}`} className="flex w-fit items-center gap-1 font-semibold text-primary"><Phone className="size-4" aria-hidden />{formatPhone(r.phone)}</a>}
                <p className="mt-auto pt-1 text-xs text-muted-foreground">Source : {r.source}{r.verified_at ? ` · vérifié le ${formatDate(r.verified_at)}` : ""}</p>
              </li>))}</ul>
          )}
        </section>
      )}
      {!current && <p className="rounded-2xl bg-muted/50 p-4 text-sm text-muted-foreground">Touchez un besoin ci-dessus. Un centre manque ou une information est fausse ? Signalez-le depuis la page <Link prefetch={false} href="/infos/contact" className="underline">Contact</Link>.</p>}
    </div>
  );
}
