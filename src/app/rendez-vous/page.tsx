import Link from "next/link";
import { AudioGuide } from "@/components/audio/audio-guide";
import { Building2, CalendarCheck, CalendarClock, ClipboardList, MapPin, Stethoscope, Users } from "lucide-react";
import { LocationPicker } from "@/components/location-picker";
import { LocateButton } from "@/components/locate-button";
import { Pagination } from "@/components/pagination";
import { EmergencyBanner } from "@/components/directory/directory-bits";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { getGeo } from "@/lib/geo";
import { getSettings } from "@/lib/settings";
import { getSession } from "@/lib/auth";
import { getSpecialties, groupByFamily, numOrNull, uuidOrNull } from "@/lib/directory-server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { CLINIC_KINDS } from "@/lib/directory";
import { formatApptDay, formatApptTime, PAYMENT_LABEL } from "@/lib/appointments";
import { formatDistance } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "Prendre rendez-vous",
  description: "Prenez rendez-vous en ligne avec un médecin vérifié au Mali : choisissez la spécialité, la zone et un créneau libre.",
};
export const revalidate = 0;

type Row = {
  doctor_id: string; title: string; display_name: string; specialties: { id: string; name: string }[]; site_id: string; clinic_id: string;
  clinic_name: string; clinic_kind: string; area: string; booking_mode: "instant" | "request"; fee_info: string | null;
  accepts_new_patients: boolean; payment_methods: string[]; distance_km: number | null; total_count: number;
};
type TypeRow = { id: string; doctor_id: string; site_id: string | null; name: string; duration_min: number; audience: string; fee: string | null; sort_order: number };
const SIZE = 12;

export default async function BookingHub({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const lat = numOrNull(sp.lat);
  const lng = numOrNull(sp.lng);
  const [geo, specialties, settings, session] = await Promise.all([getGeo(), getSpecialties(), getSettings(), getSession()]);
  let rows: Row[] = [];
  let failed = false;
  const slotsBySite = new Map<string, { type: TypeRow; slots: string[] }>();
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("bookable_doctors", {
      p_specialty: uuidOrNull(sp.specialite), p_region: uuidOrNull(sp.region), p_commune: uuidOrNull(sp.commune),
      p_query: sp.q?.trim() || null, p_mode: sp.mode === "immediat" ? "instant" : null,
      p_lat: lat, p_lng: lng, p_limit: SIZE, p_offset: (page - 1) * SIZE,
    });
    rows = (data as Row[]) ?? [];
    failed = Boolean(error);
    // Prochains créneaux libres des lieux en réservation immédiate (motif principal ouvert aux nouveaux patients)
    const instant = rows.filter((r) => r.booking_mode === "instant");
    if (instant.length) {
      const { data: types } = await supabase.from("appointment_types")
        .select("id, doctor_id, site_id, name, duration_min, audience, fee, sort_order")
        .in("doctor_id", [...new Set(instant.map((r) => r.doctor_id))]).eq("is_active", true).order("sort_order").order("name");
      await Promise.all(instant.map(async (r) => {
        const t = ((types as TypeRow[]) ?? []).find((x) => x.doctor_id === r.doctor_id && (x.site_id === null || x.site_id === r.site_id) && x.audience !== "returning");
        if (!t) return;
        const { data: sl } = await supabase.rpc("available_slots", { p_site: r.site_id, p_type: t.id, p_from: null, p_days: 14 });
        const list = ((sl as { slot_start: string }[]) ?? []).slice(0, 4).map((x) => x.slot_start);
        slotsBySite.set(r.site_id, { type: t, slots: list });
      }));
    }
  }
  const total = Number(rows[0]?.total_count ?? 0);
  const groups = groupByFamily(specialties);
  const filtered = Boolean(sp.specialite || sp.region || sp.commune || sp.q || sp.mode);

  return (
    <div className="container-page space-y-5 py-6">
      <section className="rounded-2xl border bg-gradient-to-b from-brand-sky to-white p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-brand-deep sm:text-3xl"><CalendarCheck className="size-7 text-brand-blue" aria-hidden /> Prendre rendez-vous</h1>
            <p className="mt-1 max-w-2xl text-muted-foreground">
              Choisissez une spécialité et votre zone, puis un créneau libre. Seuls les <strong>médecins vérifiés</strong> qui ont ouvert leur agenda en ligne apparaissent ici.
            </p>
          </div>
          {session && (
            <Link prefetch={false} href="/compte/rendez-vous" className={cn(buttonVariants({ variant: "outline" }), "shrink-0 bg-white")}><ClipboardList aria-hidden /> Mes rendez-vous</Link>
          )}
        </div>

        <form method="get" className="mt-4 grid gap-2 rounded-xl border bg-white p-3 sm:grid-cols-2 lg:grid-cols-[1.2fr_2fr_1fr_auto] lg:items-end">
          <Select name="specialite" defaultValue={sp.specialite ?? ""} aria-label="Spécialité">
            <option value="">Toutes les spécialités</option>
            {groups.map(([family, list]) => (
              <optgroup key={family} label={family}>{list.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</optgroup>
            ))}
          </Select>
          <LocationPicker geo={geo} compact names={{ region: "region", commune: "commune" }} defaults={{ region: sp.region, commune: sp.commune }} />
          <Input name="q" defaultValue={sp.q} placeholder="Nom du médecin ou de la clinique" aria-label="Nom du médecin ou de la clinique" />
          {lat !== null && lng !== null && <><input type="hidden" name="lat" value={sp.lat} /><input type="hidden" name="lng" value={sp.lng} /></>}
          <Button type="submit" className="bg-brand-blue hover:bg-brand-blue/90">Rechercher</Button>
          <label className="flex items-center gap-2 text-sm sm:col-span-2 lg:col-span-4">
            <input type="checkbox" name="mode" value="immediat" defaultChecked={sp.mode === "immediat"} className="size-4" />
            Uniquement les créneaux réservables tout de suite
          </label>
        </form>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <LocateButton basePath="/rendez-vous" />
          <Link prefetch={false} href="/specialites" className="text-sm font-semibold text-brand-blue underline">Quel spécialiste pour quoi ?</Link>
        </div>
      </section>

      <AudioGuide target="rendez-vous" />
      <EmergencyBanner numbers={settings.emergency_numbers} />

      <ol className="grid gap-2 text-sm sm:grid-cols-3" aria-label="Comment ça marche">
        {[["1", "Choisissez le médecin et le motif"], ["2", "Touchez un créneau libre"], ["3", "Confirmez : rappel la veille, annulation en ligne"]].map(([n, t]) => (
          <li key={n} className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-blue text-xs font-bold text-white">{n}</span>{t}
          </li>
        ))}
      </ol>

      <p className="text-sm font-medium" aria-live="polite">
        {failed ? "Le service ne répond pas pour le moment. Réessayez dans un instant." : `${total} lieu${total > 1 ? "x" : ""} de consultation avec prise de rendez-vous en ligne${lat !== null ? " — du plus proche au plus éloigné" : ""}`}
      </p>

      {rows.length === 0 && !failed ? (
        <div className="space-y-3 rounded-xl border border-dashed bg-white p-6 text-center">
          <CalendarClock className="mx-auto size-8 text-muted-foreground" aria-hidden />
          <p className="font-semibold">{filtered ? "Aucun médecin ne prend de rendez-vous en ligne avec ces critères." : "Les premiers médecins ouvrent leur agenda en ligne prochainement."}</p>
          <p className="mx-auto max-w-xl text-sm text-muted-foreground">
            En attendant, trouvez un spécialiste dans l&apos;annuaire et appelez son lieu de consultation : les numéros sont affichés sur chaque fiche.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {filtered && <Link prefetch={false} href="/rendez-vous" className={cn(buttonVariants({ variant: "outline" }))}>Retirer les filtres</Link>}
            <Link prefetch={false} href={`/medecins${sp.specialite ? `?specialite=${sp.specialite}` : ""}`} className={cn(buttonVariants(), "bg-brand-blue hover:bg-brand-blue/90")}><Stethoscope aria-hidden /> Voir l&apos;annuaire des médecins</Link>
          </div>
        </div>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {rows.map((r) => {
            const label = `${r.title} ${r.display_name}`;
            const base = `/medecins/${r.doctor_id}/rendez-vous?lieu=${r.site_id}`;
            const av = slotsBySite.get(r.site_id);
            return (
              <li key={r.site_id} className="flex flex-col gap-3 rounded-xl border bg-white p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link prefetch={false} href={`/medecins/${r.doctor_id}`} className="text-lg font-bold text-brand-deep hover:underline">{label}</Link>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {r.specialties.map((s) => <Badge key={s.id} className="border-sky-200 bg-brand-sky text-brand-blue">{s.name}</Badge>)}
                    </div>
                  </div>
                  {r.distance_km !== null && <span className="shrink-0 text-sm font-medium">{formatDistance(r.distance_km)}</span>}
                </div>
                <p className="flex items-start gap-2 text-sm text-muted-foreground">
                  <Building2 className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span><Link prefetch={false} href={`/cliniques/${r.clinic_id}`} className="font-medium text-foreground hover:underline">{r.clinic_name}</Link> · {CLINIC_KINDS[r.clinic_kind] ?? r.clinic_kind}<span className="flex items-center gap-1"><MapPin className="size-3" aria-hidden />{r.area}</span></span>
                </p>
                <div className="flex flex-wrap gap-1.5 text-xs">
                  {r.booking_mode === "instant" ? <Badge className="border-emerald-200 bg-emerald-50 text-emerald-800">Réservation immédiate</Badge> : <Badge className="border-amber-200 bg-amber-50 text-amber-900">Demande confirmée par le cabinet</Badge>}
                  {!r.accepts_new_patients && <Badge className="bg-muted text-muted-foreground"><Users className="size-3" aria-hidden /> Patients déjà suivis uniquement</Badge>}
                  {r.fee_info && <Badge className="bg-white">{r.fee_info}</Badge>}
                  {r.payment_methods?.length > 0 && <Badge className="bg-white">{r.payment_methods.map((p) => PAYMENT_LABEL[p] ?? p).join(", ")}</Badge>}
                </div>

                {r.booking_mode === "instant" ? (
                  av && av.slots.length > 0 ? (
                    <div>
                      <p className="mb-2 text-sm">Prochains créneaux · <span className="text-muted-foreground">{av.type.name} ({av.type.duration_min} min{av.type.fee ? ` · ${av.type.fee}` : ""})</span></p>
                      <ul className="flex flex-wrap gap-2">
                        {av.slots.map((s) => (
                          <li key={s}>
                            <Link prefetch={false} href={`${base}&type=${av.type.id}&creneau=${encodeURIComponent(s)}`}
                              className="inline-flex flex-col rounded-lg border border-sky-200 bg-brand-sky px-3 py-1.5 text-center text-sm font-semibold text-brand-blue hover:border-brand-blue">
                              <span className="text-xs font-normal">{formatApptDay(s)}</span>{formatApptTime(s)}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : <p className="text-sm text-muted-foreground">Aucun créneau libre dans les 14 prochains jours.</p>
                ) : (
                  <p className="text-sm text-muted-foreground">Choisissez un jour et un moment de la journée : le cabinet vous confirme l&apos;heure.</p>
                )}
                <Link prefetch={false} href={base} className={cn(buttonVariants({ size: "sm" }), "mt-auto w-fit bg-brand-blue hover:bg-brand-blue/90")}>
                  <CalendarCheck aria-hidden /> {r.booking_mode === "instant" ? "Voir tous les créneaux" : "Demander un rendez-vous"}
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <Pagination basePath="/rendez-vous" params={sp} page={page} total={total} size={SIZE} />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border bg-white p-4 text-sm">
          <p className="font-semibold">Pour un enfant ou un parent</p>
          <p className="text-muted-foreground">Enregistrez vos proches une fois, puis choisissez-les au moment de réserver.</p>
          <Link prefetch={false} href="/compte/proches" className="mt-1 inline-block font-semibold text-brand-blue underline">Mes proches</Link>
        </div>
        <div className="rounded-xl border bg-white p-4 text-sm">
          <p className="font-semibold">Vous êtes médecin ou clinique ?</p>
          <p className="text-muted-foreground">Ouvrez votre agenda en ligne gratuitement : motifs, horaires, réservation immédiate ou sur demande.</p>
          <Link prefetch={false} href="/medecin/inscription" className="mt-1 inline-block font-semibold text-brand-blue underline">Référencer ma pratique</Link>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Médecins présentés par distance puis par ordre alphabétique, sans classement payant. PharmaProxi ne pose aucun diagnostic.
      </p>
    </div>
  );
}
