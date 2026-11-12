import Link from "next/link";
import { Phone, Siren } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PlaceSelect } from "@/components/directory/place-select";
import { DIRECTORY_KINDS, type Place } from "@/lib/national-directory";
import { formatPhone } from "@/lib/format";

export const metadata = { title: "Où me faire soigner ? Orientation par niveau de soins", description: "Du centre de santé communautaire au CHU : les structures de votre cercle ou de votre commune, niveau par niveau, d'après le référentiel SantéProxi." };
export const dynamic = "force-dynamic";

type L = { level: number; level_label: string; id: string; name: string; kind: string; place: string | null; phone: string | null; is_partner: boolean; is_reference: boolean };
const U = (v?: string) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : null);
const HELP: Record<number, string> = {
  1: "Premier point de contact : consultations courantes, vaccination, suivi de grossesse, accouchements simples. C'est là qu'on commence, sauf urgence grave.",
  2: "Le CSRéf reçoit les patients orientés par les CSCom : chirurgie courante, césariennes, hospitalisation, examens plus poussés.",
  3: "L'hôpital régional reçoit les cas que le CSRéf ne peut pas prendre en charge.",
  4: "Hôpitaux nationaux et centres spécialisés : en général sur orientation d'un médecin.",
};

export default async function Orientation({ searchParams }: { searchParams: Promise<{ region?: string; cercle?: string; commune?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const region = U(sp.region), circle = U(sp.cercle), commune = U(sp.commune);
  const [{ data: pl }, res] = await Promise.all([
    supabase.rpc("directory_places"),
    region || circle ? supabase.rpc("orientation_levels", { p_region: region, p_circle: circle, p_commune: commune }) : Promise.resolve({ data: null }),
  ]);
  const places = (pl ?? []) as Place[];
  const rows = (res.data ?? []) as L[];
  const levels = [1, 2, 3, 4].map((n) => ({ n, label: rows.find((r) => r.level === n)?.level_label, items: rows.filter((r) => r.level === n) }));
  const LABELS = ["Premier contact : CSCom", "Première référence : CSRéf", "Deuxième référence : hôpital de la région", "Troisième référence : CHU et centres de référence nationaux"];
  return (
    <div className="container-page max-w-4xl space-y-5 py-6">
      <h1 className="text-2xl font-bold">Où me faire soigner ?</h1>
      <div role="alert" className="flex items-start gap-2 rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-red-950">
        <Siren className="mt-0.5 size-5 shrink-0" aria-hidden />
        <p><strong>Urgence grave</strong> (perte de connaissance, difficulté à respirer, saignement abondant, accident) : allez directement aux urgences les plus proches ou appelez les secours. <Link prefetch={false} href="/urgences" className="font-semibold underline">Numéros d&apos;urgence</Link></p>
      </div>
      <p className="text-sm text-muted-foreground">Au Mali, les soins sont organisés en niveaux : on commence par le centre de santé communautaire (CSCom), qui oriente si besoin vers le centre de santé de référence (CSRéf), puis vers l&apos;hôpital. Cette page vous montre les structures de chaque niveau près de chez vous, d&apos;après le référentiel SantéProxi. Elle ne remplace pas l&apos;avis d&apos;un soignant.</p>
      <form method="get" className="grid gap-3 rounded-2xl border bg-white p-4 sm:grid-cols-4">
        <PlaceSelect places={places} region={region ?? undefined} circle={circle ?? undefined} commune={commune ?? undefined} />
        <div className="self-end"><button className="min-h-11 w-full rounded-lg bg-primary px-4 text-sm font-semibold text-white">Voir les structures</button></div>
      </form>
      {!region && !circle ? <p className="rounded-xl border bg-white p-4 text-sm text-muted-foreground">Choisissez votre région, puis votre cercle (ou votre commune à Bamako).</p> : (
        <ol className="space-y-4">{levels.map(({ n, label, items }) => (
          <li key={n} className="space-y-2 rounded-2xl border bg-white p-4" aria-labelledby={`n${n}`}>
            <h2 id={`n${n}`} className="flex items-center gap-2 text-lg font-bold text-brand-deep"><span className="grid size-7 place-items-center rounded-full bg-primary text-sm text-white" aria-hidden>{n}</span>{label ?? LABELS[n - 1]}</h2>
            <p className="text-xs text-muted-foreground">{HELP[n]}</p>
            {items.length === 0 ? <p className="text-sm text-muted-foreground">Aucune structure de ce niveau n&apos;est référencée ici pour le moment. L&apos;absence de fiche ne signifie pas l&apos;absence d&apos;établissement.</p> : (
              <ul className="grid gap-2 sm:grid-cols-2">{items.map((f) => (
                <li key={f.id} className="flex items-start justify-between gap-2 rounded-xl border p-3 text-sm">
                  <span><Link prefetch={false} href={`/etablissements/${f.id}`} className="font-semibold text-primary underline">{f.name}</Link>
                    <span className="block text-xs text-muted-foreground">{[DIRECTORY_KINDS[f.kind] ?? (f.kind === "chu" ? "CHU" : f.kind), f.place].filter(Boolean).join(" · ")}</span>
                    {f.is_partner ? <span className="mt-1 inline-block rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-900">Partenaire SantéProxi</span> : null}</span>
                  {f.phone ? <a href={`tel:${f.phone}`} className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-lg border px-2 text-xs font-semibold" aria-label={`Appeler ${f.name}`}><Phone className="size-4" aria-hidden />{formatPhone(f.phone)}</a> : null}
                </li>))}</ul>
            )}
          </li>))}</ol>
      )}
      <p className="text-xs text-muted-foreground">Organisation des niveaux de soins : <a href="https://www.washinhcf.org/wp-content/uploads/2023/02/herams_mali_rapport_de_reference_20204d70805b-d8fc-487f-a7ab-8aeb051cbf0a.pdf" target="_blank" rel="noopener noreferrer" className="underline">HeRAMS Mali, rapport de référence 2020</a> (CSCom premier contact, CSRéf première référence, établissements de deuxième référence, CHU et hôpitaux nationaux). Liste des structures : <Link prefetch={false} href="/etablissements" className="underline">annuaire national</Link> (CANAM 2022, carte sanitaire du ministère). La liste des structures nationales est établie d&apos;après les noms du référentiel et peut être incomplète.</p>
    </div>
  );
}
