import Link from "next/link";
import { Ambulance, Moon, Phone, ShieldCheck, Siren } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { RecentList } from "@/components/recent/recent-list";
import { getGeo } from "@/lib/geo";
import { getSettings } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { CLINIC_KINDS, FACILITY_KINDS } from "@/lib/directory";
import { formatPhone } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "Urgences",
  description: "Numéros et services d'urgence, ambulances et pharmacies de garde au Mali.",
};
export const revalidate = 0;

type Row = { kind: "clinic" | "listing"; id: string; name: string; category: string; area: string | null; address: string | null; phone: string | null; phone2: string | null; verified: boolean };
const uuid = (v?: string) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : null);

export default async function EmergencyPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const [geo, settings] = await Promise.all([getGeo(), getSettings()]);
  let rows: Row[] = [];
  let dutyCount = 0;
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const [e, d] = await Promise.all([
      supabase.rpc("emergency_directory", { p_region: uuid(sp.region) }),
      supabase.rpc("duty_pharmacies", { p_from: new Date().toISOString(), p_region: uuid(sp.region) }),
    ]);
    rows = (e.data as Row[]) ?? [];
    dutyCount = (d.data as unknown[] | null)?.length ?? 0;
  }
  const numbers = settings.emergency_numbers?.trim();
  const ambulances = rows.filter((r) => r.category === "ambulance");
  const services = rows.filter((r) => r.category !== "ambulance");
  const label = (r: Row) => (r.kind === "clinic" ? CLINIC_KINDS[r.category] : FACILITY_KINDS[r.category]) ?? r.category;

  const Card = ({ r }: { r: Row }) => (
    <li className="flex flex-col gap-2 rounded-xl border bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        {r.kind === "clinic" ? <Link prefetch={false} href={`/cliniques/${r.id}`} className="font-bold hover:underline">{r.name}</Link> : <span className="font-bold">{r.name}</span>}
        {r.verified ? <Badge className="border-emerald-200 bg-emerald-50 text-emerald-800"><ShieldCheck className="size-3" aria-hidden /> Vérifié</Badge> : <Badge className="bg-muted text-muted-foreground">Non vérifié</Badge>}
      </div>
      <p className="text-xs text-muted-foreground">{[label(r), r.area].filter(Boolean).join(" · ")}</p>
      {r.address && <p className="text-sm text-muted-foreground">{r.address}</p>}
      <div className="mt-auto flex flex-wrap gap-2 pt-1">
        {r.phone && <a href={`tel:${r.phone}`} className={cn(buttonVariants({ size: "sm" }), "bg-red-700 hover:bg-red-800")}><Phone aria-hidden /> {formatPhone(r.phone)}</a>}
        {r.phone2 && <a href={`tel:${r.phone2}`} className={cn(buttonVariants({ size: "sm", variant: "outline" }))}><Phone aria-hidden /> {formatPhone(r.phone2)}</a>}
      </div>
    </li>
  );

  return (
    <div className="container-page space-y-5 py-6">
      <header className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-950">
        <h1 className="flex items-center gap-2 text-2xl font-bold"><Siren className="size-7" aria-hidden /> Urgences</h1>
        <p className="mt-2 max-w-2xl">
          En cas d&apos;urgence vitale (perte de connaissance, difficulté à respirer, douleur forte dans la poitrine, hémorragie, accident),
          rendez-vous immédiatement au service d&apos;urgence le plus proche ou appelez les secours.
        </p>
        {numbers ? (
          <p className="mt-3 text-lg font-bold">Numéros d&apos;urgence : {numbers}</p>
        ) : (
          <p className="mt-3 text-sm">Les numéros nationaux d&apos;urgence seront affichés ici après leur vérification par l&apos;équipe PharmaProxi.</p>
        )}
        <p className="mt-2 text-xs">PharmaProxi ne pose aucun diagnostic. Les disponibilités des services ne sont pas garanties : appelez avant de vous déplacer quand c&apos;est possible.</p>
      </header>

      <Link prefetch={false} href={`/garde${sp.region ? `?region=${sp.region}` : ""}`} className="flex items-center justify-between gap-3 rounded-xl border border-indigo-200 bg-indigo-50 p-4 hover:border-indigo-400">
        <span className="flex items-center gap-3"><Moon className="size-6 text-indigo-700" aria-hidden />
          <span><strong>Pharmacies de garde</strong><span className="block text-sm text-muted-foreground">{dutyCount > 0 ? `${dutyCount} pharmacie(s) de garde en ce moment${sp.region ? " dans cette région" : ""}` : "Voir le tableau de garde"}</span></span>
        </span>
        <span className="text-sm font-semibold text-indigo-800">Voir</span>
      </Link>

      <form method="get" className="flex flex-col gap-2 rounded-xl border bg-white p-3 sm:flex-row sm:items-end">
        <Select name="region" defaultValue={sp.region ?? ""} aria-label="Région" className="sm:max-w-xs">
          <option value="">Toutes les régions</option>
          {geo.regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </Select>
        <Button type="submit">Filtrer</Button>
      </form>

      <section aria-labelledby="svc" className="space-y-2">
        <h2 id="svc" className="text-lg font-bold">Services d&apos;urgence et établissements ouverts 24 h/24</h2>
        {services.length === 0 ? <p className="text-sm text-muted-foreground">Aucun service d&apos;urgence renseigné pour cette zone pour le moment.</p> : (
          <ul className="grid gap-3 md:grid-cols-2">{services.map((r) => <Card key={`${r.kind}-${r.id}`} r={r} />)}</ul>
        )}
      </section>
      <section aria-labelledby="amb" className="space-y-2">
        <h2 id="amb" className="flex items-center gap-2 text-lg font-bold"><Ambulance className="size-5" aria-hidden /> Ambulances</h2>
        {ambulances.length === 0 ? <p className="text-sm text-muted-foreground">Aucun service d&apos;ambulance renseigné pour cette zone pour le moment.</p> : (
          <ul className="grid gap-3 md:grid-cols-2">{ambulances.map((r) => <Card key={`${r.kind}-${r.id}`} r={r} />)}</ul>
        )}
      </section>
      <RecentList title="Vos contacts consultés récemment" emptyHidden />
      <p className="text-xs text-muted-foreground">Un numéro ne répond pas ou est erroné ? <Link prefetch={false} href="/infos/contact?sujet=erreur#formulaire" className="underline">Signalez-le-nous</Link> pour que nous le corrigions rapidement.</p>
    </div>
  );
}
