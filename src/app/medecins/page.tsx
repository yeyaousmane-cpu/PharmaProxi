import Link from "next/link";
import { Building2, CalendarCheck, Search, SearchX, Stethoscope } from "lucide-react";
import { DoctorCard, type DoctorRow } from "@/components/directory/doctor-card";
import { RegisterList, type RegisterRow } from "@/components/directory/register-list";
import { EmergencyBanner, NotDirectoryAdvice } from "@/components/directory/directory-bits";
import { LocationPicker } from "@/components/location-picker";
import { LocateButton } from "@/components/locate-button";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { getGeo } from "@/lib/geo";
import { getSettings } from "@/lib/settings";
import { getSpecialties, groupByFamily, numOrNull, uuidOrNull } from "@/lib/directory-server";
import { createClient } from "@/lib/supabase/server";
import { humanizeError } from "@/lib/errors";
import { allow } from "@/lib/limiter";
import { clientIp } from "@/lib/request";
import { LANGUAGES } from "@/lib/directory";
import { DAYS, DAY_LABELS } from "@/lib/validation";
import { isSupabaseConfigured } from "@/lib/env";
import { cn } from "@/lib/utils";

export const metadata = { title: "Trouver un médecin spécialiste" };

const PAGE_SIZE = 20;
const REG_SIZE = 20;
type SP = Record<string, string | undefined>;

export default async function DoctorsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const [geo, specialties, settings] = await Promise.all([getGeo(), getSpecialties(), getSettings()]);
  const q = (sp.q ?? "").trim().slice(0, 80);
  const specialty = uuidOrNull(sp.specialite);
  const lat = numOrNull(sp.lat);
  const lng = numOrNull(sp.lng);
  const page = Math.max(1, Math.min(50, Number(sp.page) || 1));
  const day = DAYS.includes(sp.jour as (typeof DAYS)[number]) ? sp.jour! : null;
  const sort = sp.tri === "distance" && lat !== null ? "distance" : "name";
  const searching = Boolean(q.length >= 2 || specialty || sp.region || sp.aujourdhui || day || sp.langue || sp.genre || lat !== null);

  let rows: DoctorRow[] = [];
  let reg: RegisterRow[] = [];
  const nextMap = new Map<string, { site_id: string; slot_start: string }>();
  type Summary = { year: number | null; total: number };
  let summary = null as Summary | null;
  let error: string | null = null;
  const rpage = Math.max(1, Math.min(200, Number(sp.rpage) || 1));
  // Le Tableau de l'Ordre ne connaît ni jours, ni langues, ni genre : ces filtres ne s'y appliquent pas
  const regFilters = Boolean(q.length >= 2 || specialty || sp.region);
  if (isSupabaseConfigured() && !searching) {
    const supabase = await createClient();
    const { data } = await supabase.rpc("register_summary");
    summary = data as Summary | null;
  }
  if (searching && isSupabaseConfigured()) {
    if (!(await allow(`dir:${await clientIp()}`, 60, 60_000))) {
      error = "Trop de recherches en peu de temps. Patientez une minute.";
    } else {
      const supabase = await createClient();
      if (regFilters) {
        const { data: rd } = await supabase.rpc("search_doctor_register", {
          p_query: q.length >= 2 ? q : null, p_specialty: specialty, p_region: uuidOrNull(sp.region), p_limit: REG_SIZE, p_offset: (rpage - 1) * REG_SIZE,
        });
        reg = (rd as RegisterRow[]) ?? [];
      }
      const { data, error: e } = await supabase.rpc("search_doctors", {
        p_query: q.length >= 2 ? q : null, p_specialty: specialty, p_region: uuidOrNull(sp.region), p_commune: uuidOrNull(sp.commune),
        p_clinic: null, p_day: day, p_today: sp.aujourdhui === "1", p_language: sp.langue && LANGUAGES[sp.langue] ? sp.langue : null,
        p_gender: sp.genre === "F" || sp.genre === "M" ? sp.genre : null, p_lat: lat, p_lng: lng, p_sort: sort,
        p_limit: PAGE_SIZE, p_offset: (page - 1) * PAGE_SIZE,
      });
      if (e) error = humanizeError(e);
      rows = (data as DoctorRow[]) ?? [];
      if (rows.length) {
        const { data: nx } = await supabase.rpc("next_availabilities", { p_doctors: rows.map((r) => r.doctor_id) });
        for (const n of (nx as { doctor_id: string; site_id: string; slot_start: string }[] | null) ?? []) nextMap.set(n.doctor_id, n);
      }
    }
  }
  const total = Number(rows[0]?.total_count ?? 0);
  const regTotal = Number(reg[0]?.total_count ?? 0);
  const regPages = Math.ceil(regTotal / REG_SIZE);
  const pages = Math.ceil(total / PAGE_SIZE);
  const link = (patch: SP) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, ...patch })) if (v) p.set(k, v);
    return `/medecins?${p}`;
  };
  const specName = specialties.find((s) => s.id === specialty)?.name;

  return (
    <div className="container-page space-y-5 py-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-brand-blue"><Stethoscope className="size-4" aria-hidden /> Annuaire médical</p>
          <h1 className="text-2xl font-bold text-brand-deep sm:text-3xl">Trouver un médecin spécialiste</h1>
          <p className="text-muted-foreground">Le bon spécialiste, l&apos;établissement où il consulte et ses jours de consultation.</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Link prefetch={false} href="/rendez-vous" className={cn(buttonVariants(), "bg-brand-blue hover:bg-brand-blue/90")}><CalendarCheck aria-hidden /> Prendre rendez-vous en ligne</Link>
          <Link prefetch={false} href="/cliniques" className={cn(buttonVariants({ variant: "outline" }))}><Building2 aria-hidden /> Voir les cliniques</Link>
        </div>
      </header>

      <EmergencyBanner numbers={settings.emergency_numbers} />

      <form method="get" action="/medecins" className="space-y-3 rounded-2xl border bg-white p-4 shadow-sm" role="search">
        <div className="grid gap-3 md:grid-cols-[1fr_260px]">
          <div className="space-y-1">
            <Label htmlFor="q">Nom du médecin, spécialité ou établissement</Label>
            <Input id="q" name="q" defaultValue={q} placeholder="Ex. cardiologue, pédiatre, Dr Traoré…" maxLength={80} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="specialite">Spécialité</Label>
            <Select id="specialite" name="specialite" defaultValue={specialty ?? ""}>
              <option value="">Toutes les spécialités</option>
              {groupByFamily(specialties).map(([family, list]) => (
                <optgroup key={family} label={family}>{list.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</optgroup>
              ))}
            </Select>
          </div>
        </div>
        <LocationPicker geo={geo} compact names={{ region: "region", commune: "commune" }} defaults={{ region: sp.region, commune: sp.commune }} className="sm:grid-cols-2" />
        <details open={Boolean(day || sp.langue || sp.genre || sp.aujourdhui)}>
          <summary className="cursor-pointer text-sm font-semibold">Plus de filtres</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <Label htmlFor="jour">Jour de consultation</Label>
              <Select id="jour" name="jour" defaultValue={day ?? ""}>
                <option value="">Tous les jours</option>
                {DAYS.map((d) => <option key={d} value={d}>{DAY_LABELS[d]}</option>)}
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="langue">Langue parlée</Label>
              <Select id="langue" name="langue" defaultValue={sp.langue ?? ""}>
                <option value="">Toutes</option>
                {Object.entries(LANGUAGES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="genre">Médecin</Label>
              <Select id="genre" name="genre" defaultValue={sp.genre ?? ""}>
                <option value="">Indifférent</option>
                <option value="F">Une femme</option>
                <option value="M">Un homme</option>
              </Select>
            </div>
            <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" name="aujourdhui" value="1" defaultChecked={sp.aujourdhui === "1"} className="size-4" /> Consulte aujourd&apos;hui</label>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Le filtre « femme / homme » ne retient que les médecins qui ont choisi de l&apos;indiquer.</p>
        </details>
        {lat !== null && lng !== null && <><input type="hidden" name="lat" value={lat} /><input type="hidden" name="lng" value={lng} /></>}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" className="bg-brand-blue hover:bg-brand-blue/90"><Search aria-hidden /> Rechercher</Button>
          {lat !== null && (
            <Select name="tri" defaultValue={sort} aria-label="Trier par" className="h-11 w-auto">
              <option value="name">Ordre alphabétique</option>
              <option value="distance">Les plus proches</option>
            </Select>
          )}
        </div>
      </form>
      <div className="flex justify-end"><LocateButton basePath="/medecins" /></div>

      {!searching && summary?.total ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <strong>{summary.total.toLocaleString("fr-FR")} médecins</strong> inscrits au Tableau {summary.year} de l&apos;Ordre des médecins du Mali sont consultables : choisissez une spécialité ou tapez un nom.
        </p>
      ) : null}

      {!searching && (
        <section aria-labelledby="spec-title" className="space-y-4">
          <h2 id="spec-title" className="text-lg font-bold">Parcourir par spécialité</h2>
          {groupByFamily(specialties).map(([family, list]) => (
            <div key={family}>
              <h3 className="mb-2 text-sm font-semibold text-muted-foreground">{family}</h3>
              <ul className="flex flex-wrap gap-2">
                {list.map((s) => (
                  <li key={s.id}>
                    <Link prefetch={false} href={`/medecins?specialite=${s.id}`} className="inline-block rounded-full border border-sky-200 bg-brand-sky px-3 py-1.5 text-sm font-medium text-brand-blue hover:bg-sky-100">{s.name}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <p className="text-sm"><Link prefetch={false} href="/specialites" className="font-semibold text-brand-blue underline">Quel spécialiste pour quoi ?</Link> — un guide simple des spécialités.</p>
        </section>
      )}

      <section aria-live="polite" className="space-y-3">
        {error && <Alert tone="error" title={error} />}
        {searching && !error && rows.length === 0 && reg.length > 0 && (
          <p className="rounded-xl border border-dashed bg-white p-4 text-sm text-muted-foreground">
            Aucun médecin de cette recherche n&apos;a encore complété sa fiche (contacts, jours de consultation). Voici les médecins correspondants inscrits au Tableau de l&apos;Ordre.
          </p>
        )}
        {searching && !error && rows.length === 0 && reg.length === 0 && (
          <div className="rounded-xl border border-dashed bg-white p-8 text-center">
            <SearchX className="mx-auto size-8 text-muted-foreground" aria-hidden />
            <p className="mt-2 font-semibold">Aucun médecin référencé ne correspond{specName ? ` (${specName})` : ""}.</p>
            <p className="mt-1 text-sm text-muted-foreground">L&apos;annuaire se construit progressivement avec les médecins qui acceptent d&apos;y figurer. Élargissez la zone ou retirez un filtre.</p>
          </div>
        )}
        {rows.length > 0 && (
          <>
            <p className="text-sm text-muted-foreground">{total} médecin{total > 1 ? "s" : ""}{specName ? ` · ${specName}` : ""}. {sort === "distance" ? "Du plus proche au plus éloigné." : "Par ordre alphabétique."}</p>
            <div className="grid gap-3">{rows.map((d) => <DoctorCard key={d.doctor_id} d={d} next={nextMap.get(d.doctor_id) ?? null} />)}</div>
            {pages > 1 && (
              <nav aria-label="Pagination" className="flex items-center justify-center gap-2">
                {page > 1 && <Link prefetch={false} className={cn(buttonVariants({ variant: "outline", size: "sm" }))} href={link({ page: String(page - 1) })}>Précédent</Link>}
                <span className="text-sm">Page {page} / {pages}</span>
                {page < pages && <Link prefetch={false} className={cn(buttonVariants({ variant: "outline", size: "sm" }))} href={link({ page: String(page + 1) })}>Suivant</Link>}
              </nav>
            )}
          </>
        )}
        {reg.length > 0 && (
          <section aria-labelledby="register-title" className="space-y-3 pt-2">
            <div>
              <h2 id="register-title" className="text-lg font-bold">Médecins inscrits au Tableau de l&apos;Ordre ({regTotal})</h2>
              <p className="text-sm text-muted-foreground">
                Source officielle : Tableau {reg[0].register_year} de l&apos;Ordre des médecins du Mali. Il confirme l&apos;inscription à l&apos;Ordre, la spécialité et la structure déclarées,
                mais ne contient ni téléphone ni jours de consultation : contactez l&apos;établissement indiqué.
                {(day || sp.langue || sp.genre || sp.aujourdhui) ? " Les filtres jour, langue, genre et « aujourd'hui » ne s'appliquent pas à cette liste." : ""}
              </p>
            </div>
            <RegisterList rows={reg} />
            {regPages > 1 && (
              <nav aria-label="Pagination du Tableau" className="flex items-center justify-center gap-2">
                {rpage > 1 && <Link prefetch={false} className={cn(buttonVariants({ variant: "outline", size: "sm" }))} href={link({ rpage: String(rpage - 1) })}>Précédent</Link>}
                <span className="text-sm">Page {rpage} / {regPages}</span>
                {rpage < regPages && <Link prefetch={false} className={cn(buttonVariants({ variant: "outline", size: "sm" }))} href={link({ rpage: String(rpage + 1) })}>Suivant</Link>}
              </nav>
            )}
          </section>
        )}
        <NotDirectoryAdvice />
      </section>

      <aside className="rounded-xl border bg-brand-sky p-4 text-sm">
        <p className="font-semibold text-brand-blue">Vous êtes médecin ou vous gérez une clinique ?</p>
        <p className="mt-1">Le référencement est gratuit, après vérification de votre inscription à l&apos;Ordre ou de votre autorisation d&apos;ouverture.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link prefetch={false} href="/medecin/inscription" className={cn(buttonVariants({ size: "sm" }), "bg-brand-blue hover:bg-brand-blue/90")}>Référencer ma pratique</Link>
          <Link prefetch={false} href="/clinique/inscription" className={cn(buttonVariants({ size: "sm", variant: "outline" }))}>Inscrire un établissement</Link>
        </div>
      </aside>
    </div>
  );
}
