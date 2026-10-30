import Link from "next/link";
import { AudioGuide } from "@/components/audio/audio-guide";
import { MapPin, MessageCircle, Moon, Navigation, Phone, ShieldCheck } from "lucide-react";
import { LocationPicker } from "@/components/location-picker";
import { LocateButton } from "@/components/locate-button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { directionsUrl } from "@/components/result-card";
import { dutyRange } from "@/components/duty/duty-badge";
import { getGeo } from "@/lib/geo";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { formatDistance, formatPhone, TIMEZONE, whatsappUrl } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "Pharmacies de garde",
  description: "Les pharmacies de garde au Mali, par commune : date, horaires, adresse et téléphone.",
};
export const revalidate = 0;

type Row = {
  duty_id: string; kind: "verified" | "listing"; id: string; name: string; address: string | null; area: string | null; phone: string | null;
  whatsapp: string | null; latitude: number | null; longitude: number | null; starts_at: string; ends_at: string;
  status: "confirmed" | "declared"; source: string; distance_km: number | null;
};
const uuid = (v?: string) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : null);
const dayKey = (iso: string) => new Intl.DateTimeFormat("fr-CA", { timeZone: TIMEZONE }).format(new Date(iso));
const dayLabel = (iso: string) => {
  const s = new Intl.DateTimeFormat("fr-FR", { timeZone: TIMEZONE, weekday: "long", day: "numeric", month: "long" }).format(new Date(iso));
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export default async function DutyPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const geo = await getGeo();
  const week = sp.vue === "semaine";
  const lat = sp.lat ? Number(sp.lat) : null;
  const lng = sp.lng ? Number(sp.lng) : null;
  const me = lat !== null && lng !== null && !Number.isNaN(lat) && !Number.isNaN(lng);
  const now = new Date();
  let rows: Row[] = [];
  let failed = false;
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("duty_pharmacies", {
      p_from: now.toISOString(), p_to: week ? new Date(now.getTime() + 7 * 86400_000).toISOString() : null,
      p_region: uuid(sp.region), p_commune: uuid(sp.commune), p_lat: me ? lat : null, p_lng: me ? lng : null,
    });
    rows = (data as Row[]) ?? [];
    failed = Boolean(error);
  }
  if (week) rows = [...rows].sort((a, b) => a.starts_at.localeCompare(b.starts_at) || (a.distance_km ?? 1e9) - (b.distance_km ?? 1e9));
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const k = week ? dayKey(new Date(Math.max(new Date(r.starts_at).getTime(), now.getTime())).toISOString()) : "now";
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const tab = (v: string | null, label: string) => {
    const params = new URLSearchParams(Object.entries(sp).filter(([k, x]) => x && k !== "vue") as [string, string][]);
    if (v) params.set("vue", v);
    const active = (v === "semaine") === week;
    return (
      <Link prefetch={false} href={`/garde${params.size ? `?${params}` : ""}`} aria-current={active ? "page" : undefined}
        className={cn("rounded-lg px-4 py-2 text-sm font-semibold", active ? "bg-brand-deep text-white" : "border bg-white hover:bg-muted")}>{label}</Link>
    );
  };

  return (
    <div className="container-page space-y-4 py-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><Moon className="size-6 text-indigo-700" aria-hidden /> Pharmacies de garde</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Pharmacies ouvertes la nuit, le week-end et les jours fériés selon le tableau de garde. Chaque garde indique sa source.
            <strong> Appelez avant de vous déplacer</strong> : un tableau peut changer au dernier moment.
          </p>
        </div>
        <LocateButton basePath="/garde" />
      </div>

      <AudioGuide target="garde" />
      <nav className="flex gap-2" aria-label="Période">{tab(null, "En ce moment")}{tab("semaine", "7 prochains jours")}</nav>

      <form method="get" className="grid gap-2 rounded-xl border bg-white p-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <LocationPicker geo={geo} compact names={{ region: "region", commune: "commune" }} defaults={{ region: sp.region, commune: sp.commune }} />
        {week && <input type="hidden" name="vue" value="semaine" />}
        {me ? <><input type="hidden" name="lat" value={sp.lat} /><input type="hidden" name="lng" value={sp.lng} /></> : null}
        <Button type="submit">Filtrer</Button>
      </form>

      {failed ? (
        <Alert tone="error" title="Service indisponible">Le service ne répond pas pour le moment. Réessayez dans un instant.</Alert>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-white p-8 text-center text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Aucune garde enregistrée {week ? "pour les 7 prochains jours" : "en ce moment"} dans cette zone.</p>
          <p className="mt-1">Le tableau de garde est publié progressivement, commune par commune. En cas d&apos;urgence, consultez les <Link prefetch={false} href="/urgences" className="font-semibold text-primary underline">numéros d&apos;urgence</Link>.</p>
        </div>
      ) : (
        [...groups.entries()].map(([k, list]) => (
          <section key={k} className="space-y-2" aria-label={k === "now" ? "De garde en ce moment" : dayLabel(`${k}T12:00:00Z`)}>
            {k !== "now" && <h2 className="pt-2 text-lg font-bold">{dayLabel(`${k}T12:00:00Z`)}</h2>}
            <ul className="grid gap-3 md:grid-cols-2">
              {list.map((p) => {
                const wa = whatsappUrl(p.whatsapp, "Bonjour, êtes-vous bien de garde en ce moment ? (vu sur PharmaProxi)");
                return (
                  <li key={p.duty_id} className="flex flex-col gap-2 rounded-xl border border-indigo-100 bg-white p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      {p.kind === "verified" ? (
                        <Link prefetch={false} href={`/pharmacies/${p.id}`} className="text-base font-bold hover:underline">{p.name}</Link>
                      ) : <span className="text-base font-bold">{p.name}</span>}
                      {p.kind === "verified" && <ShieldCheck className="size-4 text-brand-green" aria-label="Inscrite et vérifiée" />}
                      {p.distance_km !== null && <span className="ml-auto text-sm font-medium">{formatDistance(p.distance_km)}</span>}
                    </div>
                    <p className="text-sm font-medium text-indigo-900">Garde {dutyRange(p)}</p>
                    <Badge className={cn("w-fit", p.status === "confirmed" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-900")}>
                      {p.status === "confirmed" ? `Source : ${p.source}` : "Déclarée par la pharmacie"}
                    </Badge>
                    {(p.address || p.area) && (
                      <p className="flex items-start gap-2 text-sm text-muted-foreground"><MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />{[p.address, p.area].filter(Boolean).join(" — ")}</p>
                    )}
                    <div className="mt-auto flex flex-wrap gap-2 pt-1">
                      {p.phone && <a href={`tel:${p.phone}`} className={cn(buttonVariants({ size: "sm" }))}><Phone aria-hidden /> {formatPhone(p.phone)}</a>}
                      {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ size: "sm", variant: "outline" }))}><MessageCircle aria-hidden /> WhatsApp</a>}
                      {p.latitude !== null && p.longitude !== null && (
                        <a href={directionsUrl(p.latitude, p.longitude)} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}><Navigation aria-hidden /> Itinéraire</a>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
      <p className="text-xs text-muted-foreground">
        Vous êtes pharmacien ? Déclarez vos gardes depuis votre <Link prefetch={false} href="/pharmacien" className="underline">tableau de bord</Link>.
        Une garde erronée ? <Link prefetch={false} href="/infos/contact?sujet=erreur#formulaire" className="underline">Signalez-la-nous</Link>.
      </p>
    </div>
  );
}
