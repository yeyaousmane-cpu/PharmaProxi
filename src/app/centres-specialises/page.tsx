import Link from "next/link";
import { BadgeCheck, Compass, ExternalLink, HeartPulse, Info, MapPin, Navigation, Phone, Search, Siren } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getGeo } from "@/lib/geo";
import { isSupabaseConfigured } from "@/lib/env";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { LocateButton } from "@/components/locate-button";
import { formatPhone } from "@/lib/format";
import { cn } from "@/lib/utils";
import { FACILITY_KINDS, FOCUS_NOTES, FOCUS_STATUS, RELIABILITY, focusFromText, mapsUrl, type OrientationRow } from "@/lib/orientation";

export const metadata = { title: "Centres spécialisés — SantéProxi Orientation", description: "Trouver le bon établissement au Mali selon son besoin : diabète, drépanocytose, cœur, cancers, santé mentale, maternité, enfants, dialyse, yeux, dents, ORL, rééducation, urgences, vaccination." };
export const dynamic = "force-dynamic";

type Focus = { code: string; label: string; hint: string | null };
type Clinic = { kind: string; id: string; name: string; category: string; city: string | null; address: string | null; phone: string | null; source: string; link: string | null };
type SP = { besoin?: string; q?: string; region?: string; commune?: string; type?: string; fiabilite?: string; lat?: string; lng?: string };

export default async function Centres({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const geo = await getGeo();
  const region = geo.regions.some((r) => r.id === sp.region) ? sp.region! : null;
  const commune = region && geo.communes.some((c) => c.id === sp.commune && c.region_id === region) ? sp.commune! : null;
  const q = (sp.q ?? "").trim().slice(0, 80);
  const kind = sp.type && sp.type in FACILITY_KINDS ? sp.type : null;
  const rel = sp.fiabilite && sp.fiabilite in RELIABILITY ? sp.fiabilite : null;
  const lat = Number(sp.lat), lng = Number(sp.lng);
  const hasPos = Number.isFinite(lat) && Number.isFinite(lng) && lat > 9 && lat < 26 && lng > -13 && lng < 5;

  let focus: Focus[] = [];
  let rows: OrientationRow[] = [];
  let partners: Clinic[] = [];
  let counts: Record<string, number> = {};
  const guessed = !sp.besoin && q ? focusFromText(q) : null;
  const besoin = sp.besoin ?? guessed ?? null;
  const searching = !!(besoin || q.length >= 2 || region || kind || rel || hasPos);
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    focus = ((await supabase.from("care_focus").select("code, label, hint").order("sort")).data ?? []) as Focus[];
    const valid = besoin && focus.some((f) => f.code === besoin) ? besoin : null;
    const [res, cnt, cl] = await Promise.all([
      searching ? supabase.rpc("orientation_search", { p_focus: valid, p_q: valid && guessed ? null : q || null, p_region: region, p_commune: commune, p_kind: kind, p_reliability: rel, p_lat: hasPos ? lat : null, p_lng: hasPos ? lng : null, p_limit: 80 }) : Promise.resolve({ data: [] }),
      supabase.rpc("orientation_focus_counts", { p_region: region }),
      valid ? supabase.rpc("specialized_centres", { p_focus: valid, p_region: region }) : Promise.resolve({ data: [] }),
    ]);
    rows = (res.data ?? []) as OrientationRow[];
    counts = Object.fromEntries(((cnt.data ?? []) as { code: string; n: number }[]).map((c) => [c.code, Number(c.n)]));
    partners = ((cl.data ?? []) as Clinic[]).filter((c) => c.kind === "clinique");
  }
  const current = focus.find((f) => f.code === besoin);
  const keep = new URLSearchParams(Object.entries({ besoin: besoin ?? "", q: guessed ? "" : q, region: region ?? "", type: kind ?? "", fiabilite: rel ?? "" }).filter(([, v]) => v)).toString();
  const regionCommunes = region ? geo.communes.filter((c) => c.region_id === region) : [];
  const link = (code: string) => `/centres-specialises?besoin=${code}${region ? `&region=${region}` : ""}`;

  return (
    <div className="container-page max-w-5xl space-y-5 py-6">
      <header className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-wide text-primary">SantéProxi Orientation</p>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-brand-deep"><HeartPulse className="size-7 text-primary" aria-hidden /> Trouver le bon établissement</h1>
        <p className="text-muted-foreground">Choisissez un besoin ou tapez une maladie, puis votre région. Chaque fiche indique sa source et son niveau de fiabilité : appelez avant de vous déplacer.</p>
      </header>

      <p className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-950"><Siren className="mt-0.5 size-4 shrink-0" aria-hidden /><span>Urgence vitale ? N&apos;attendez pas : <Link prefetch={false} href="/urgences" className="font-semibold underline">numéros d&apos;urgence</Link> et service d&apos;urgences le plus proche.</span></p>

      <form method="get" role="search" className="grid gap-3 rounded-2xl border bg-white p-4 sm:grid-cols-6">
        <label className="text-sm sm:col-span-3">Maladie, service ou établissement
          <span className="relative mt-1 block"><Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input name="q" defaultValue={guessed ? "" : q} placeholder="ex. dialyse, diabète, CHU, Badalabougou" className="h-11 ps-9" /></span></label>
        <label className="text-sm sm:col-span-3">Besoin
          <Select name="besoin" defaultValue={besoin ?? ""} className="mt-1 h-11"><option value="">Tous les besoins</option>{focus.map((f) => <option key={f.code} value={f.code}>{f.label}</option>)}</Select></label>
        <label className="text-sm sm:col-span-2">Région
          <Select name="region" defaultValue={region ?? ""} className="mt-1 h-11"><option value="">Tout le Mali</option>{geo.regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></label>
        <details className="sm:col-span-4" open={!!(commune || kind || rel)}>
          <summary className="cursor-pointer py-1 text-sm font-semibold text-primary">Plus de filtres (commune, type, fiabilité)</summary>
          <div className="mt-2 grid gap-3 sm:grid-cols-3">
        <label className="text-sm">Commune ou arrondissement
          <Select name="commune" defaultValue={commune ?? ""} className="mt-1 h-11" disabled={!region}><option value="">{region ? "Toutes" : "Choisissez d'abord la région"}</option>{regionCommunes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></label>
        <label className="text-sm">Type
          <Select name="type" defaultValue={kind ?? ""} className="mt-1 h-11"><option value="">Tous</option>{Object.entries(FACILITY_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></label>
        <label className="text-sm">Fiabilité
          <Select name="fiabilite" defaultValue={rel ?? ""} className="mt-1 h-11"><option value="">Toutes</option>{Object.entries(RELIABILITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select></label>
          </div>
        </details>
        <div className="flex flex-wrap items-center gap-2 sm:col-span-6">
          <Button type="submit"><Search aria-hidden /> Rechercher</Button>
          <LocateButton basePath="/centres-specialises" keep={keep} />
          {searching && <Link prefetch={false} href="/centres-specialises" className="text-sm text-muted-foreground underline">Effacer</Link>}
        </div>
        {region && !commune && <p className="text-xs text-muted-foreground sm:col-span-6">Astuce : après avoir choisi la région, touchez « Rechercher » pour afficher ses communes et arrondissements.</p>}
      </form>

      <nav aria-label="Besoins" className="flex flex-wrap gap-2">{focus.map((f) => (
        <Link key={f.code} prefetch={false} href={link(f.code)} aria-current={f.code === besoin ? "page" : undefined}
          className={cn("rounded-full border px-3 py-1.5 text-sm font-medium", f.code === besoin ? "border-primary bg-primary text-white" : "bg-white hover:border-primary")}>
          {f.label}{counts[f.code] ? <span className={cn("ms-1.5 rounded-full px-1.5 text-xs", f.code === besoin ? "bg-white/20" : "bg-muted")}>{counts[f.code]}</span> : null}</Link>))}</nav>

      {searching ? (
        <section className="space-y-3" aria-live="polite">
          {current && <h2 className="text-lg font-bold text-brand-deep">{current.label}{current.hint ? <span className="ms-2 text-sm font-normal text-muted-foreground">{current.hint}</span> : null}</h2>}
          {guessed && current && <p className="text-sm text-muted-foreground">Résultats pour « {q} » : besoin « {current.label} ».</p>}
          {hasPos && <p className="flex items-center gap-1.5 text-sm text-muted-foreground"><Compass className="size-4" aria-hidden />Classement par distance pour les structures dont la position est connue. Votre position n&apos;est pas enregistrée. La proximité ne dit rien de la qualité des soins.</p>}
          {current && FOCUS_NOTES[current.code] && <p className="flex items-start gap-2 rounded-xl bg-brand-mint p-3 text-sm text-brand-deep"><Info className="mt-0.5 size-4 shrink-0" aria-hidden />{FOCUS_NOTES[current.code]}</p>}
          {rows.length === 0 && partners.length === 0 ? (
            <p className="rounded-2xl border bg-white p-4 text-sm text-muted-foreground">Aucune structure référencée pour cette recherche{region ? " dans cette zone" : ""}. Cela ne veut pas dire qu&apos;aucun service n&apos;existe : l&apos;annuaire s&apos;enrichit au fur et à mesure des vérifications. Demandez conseil à votre centre de santé ou cherchez un <Link prefetch={false} href="/medecins" className="text-primary underline">médecin par spécialité</Link>.</p>
          ) : (
            <ul className="grid gap-3 md:grid-cols-2">
              {partners.map((c) => (
                <li key={`p-${c.id}`} className="flex flex-col gap-1.5 rounded-2xl border-2 border-primary/30 bg-white p-4 text-sm">
                  <span className="w-fit rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-900">Établissement partenaire vérifié</span>
                  {c.link ? <Link prefetch={false} href={c.link} className="text-base font-bold text-brand-deep hover:underline">{c.name}</Link> : <span className="text-base font-bold">{c.name}</span>}
                  {(c.city || c.address) && <p className="flex items-start gap-1 text-muted-foreground"><MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />{[c.address, c.city].filter(Boolean).join(", ")}</p>}
                  {c.phone && <a href={`tel:${c.phone}`} className="flex w-fit items-center gap-1 font-semibold text-primary"><Phone className="size-4" aria-hidden />{formatPhone(c.phone)}</a>}
                  <p className="text-xs text-muted-foreground">Source : {c.source}</p>
                </li>))}
              {rows.map((r) => <FacilityCard key={r.id} r={r} besoin={besoin} />)}
            </ul>
          )}
        </section>
      ) : (
        <section className="grid gap-3 md:grid-cols-3">
          {[["Trouver un établissement", "Tapez son nom ou son quartier.", Search], ["Trouver un service", "Choisissez un besoin : dialyse, maternité, yeux…", HeartPulse], ["Autour de moi", "Touchez « Autour de moi » : votre position n'est pas enregistrée.", Compass]].map(([t, d, I]) => {
            const Icon = I as typeof Search;
            return <div key={t as string} className="rounded-2xl border bg-white p-4"><Icon className="mb-1 size-5 text-primary" aria-hidden /><p className="font-semibold text-brand-deep">{t as string}</p><p className="text-sm text-muted-foreground">{d as string}</p></div>;
          })}
        </section>
      )}

      <section className="space-y-1 rounded-2xl bg-muted/50 p-4 text-xs text-muted-foreground">
        <p className="font-semibold text-foreground">Niveaux de fiabilité</p>
        <ul className="space-y-0.5">{Object.values(RELIABILITY).map((v) => <li key={v.label}><span className={cn("me-1 rounded-full px-2 py-0.5 font-semibold", v.className)}>{v.label}</span>{v.help}</li>)}</ul>
        <p className="pt-1">Les données de SantéProxi ne sont pas une statistique officielle du ministère de la Santé. Un centre manque ou une information est fausse ? <Link prefetch={false} href="/infos/contact" className="underline">Signalez-le</Link>.</p>
      </section>
    </div>
  );
}

function FacilityCard({ r, besoin }: { r: OrientationRow; besoin: string | null }) {
  const relv = RELIABILITY[r.reliability];
  const matched = besoin ? r.focus.find((f) => f.code === besoin) : null;
  const place = [r.quarter, r.commune, r.region].filter(Boolean).join(" · ");
  return (
    <li className="flex flex-col gap-2 rounded-2xl border bg-white p-4 text-sm">
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="rounded-full bg-brand-mint px-2 py-0.5 font-semibold text-brand-deep">{FACILITY_KINDS[r.kind] ?? r.kind}</span>
        <span className={cn("rounded-full px-2 py-0.5 font-semibold", relv.className)}>{r.reliability === "verifie" && <BadgeCheck className="me-0.5 inline size-3" aria-hidden />}{relv.label}</span>
        {r.is_reference && <span className="rounded-full bg-sky-100 px-2 py-0.5 font-semibold text-sky-900">Centre de référence</span>}
        {r.distance_km !== null && <span className="text-muted-foreground">à {r.distance_km.toLocaleString("fr-FR")} km</span>}
      </div>
      <Link prefetch={false} href={`/centres-specialises/etablissement/${r.id}`} className="text-base font-bold text-brand-deep hover:underline">{r.name}</Link>
      {matched && <p><span className={cn("rounded px-1.5 py-0.5 text-xs font-semibold", FOCUS_STATUS[matched.status].className)}>{FOCUS_STATUS[matched.status].label}</span> {matched.detail}</p>}
      {!matched && r.focus.length > 0 && <p className="text-xs text-muted-foreground">{r.focus.map((f) => f.label).join(" · ")}</p>}
      <p className="flex items-start gap-1 text-muted-foreground"><MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />{[r.address, r.address && r.quarter && r.address.includes(r.quarter) ? [r.commune, r.region].filter(Boolean).join(" · ") : place].filter(Boolean).join(", ") || r.city || "Localisation non renseignée"}</p>
      <div className="mt-auto flex flex-wrap gap-2 pt-1">
        {r.phone ? <a href={`tel:${r.phone}`} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-[#052D1E] px-3 font-semibold text-white"><Phone className="size-4" aria-hidden />Appeler</a>
          : <span className="inline-flex min-h-10 items-center rounded-lg bg-muted px-3 text-xs text-muted-foreground">Téléphone non renseigné</span>}
        {r.latitude !== null && r.longitude !== null && <a href={mapsUrl(r.latitude, r.longitude)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border px-3 font-semibold"><Navigation className="size-4" aria-hidden />Itinéraire<ExternalLink className="size-3" aria-hidden /></a>}
        <Link prefetch={false} href={`/centres-specialises/etablissement/${r.id}`} className="inline-flex min-h-10 items-center rounded-lg border px-3 font-semibold text-primary">Voir les détails</Link>
      </div>
    </li>
  );
}
