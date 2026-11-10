import Link from "next/link";
import { Ambulance, Droplet, FileHeart, HeartHandshake, Moon, Phone, Siren, WifiOff } from "lucide-react";
import { getSettings } from "@/lib/settings";
import { getT } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { formatPhone } from "@/lib/format";
import { ListenButton } from "@/components/speech/listen-button";
import { EmergencyNumbers, type EmergencyContact } from "@/components/emergency/emergency-numbers";

export const metadata = { title: "SOS Santé — numéros d'urgence au Mali", description: "Numéros d'urgence au Mali avec appel direct, premiers secours, pharmacies de garde, fiche d'urgence : l'essentiel en un seul endroit." };
export const revalidate = 300;

type Row = { kind: string; id: string; name: string; category: string; area: string | null; phone: string | null; verified: boolean };

/** Page d'urgence : accessible sans compte et gardée sur le téléphone pour une consultation hors connexion. */
export default async function SosPage() {
  const [settings, t] = await Promise.all([getSettings(), getT()]);
  let ambulances: Row[] = [];
  let contacts: EmergencyContact[] = [];
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const [{ data }, { data: ec }] = await Promise.all([
      supabase.rpc("emergency_directory", { p_region: null }),
      supabase.from("emergency_contacts").select("id,name,mission,phone,phone_alt,tier,icon,status,source_url,verified_at")
        .eq("country", "ML").eq("active", true).order("tier").order("sort"),
    ]);
    ambulances = ((data as Row[]) ?? []).filter((r) => r.category === "ambulance" && r.phone).slice(0, 6);
    contacts = (ec as EmergencyContact[] | null) ?? [];
  }
  const numbers = settings.emergency_numbers?.trim();
  const tiles = [
    { href: "/urgences", icon: Ambulance, label: t("sos.nearest"), tone: "bg-red-700 text-white" },
    { href: "/premiers-secours", icon: HeartHandshake, label: t("sos.first_aid"), tone: "bg-white text-red-800 border-2 border-red-200" },
    { href: "/garde", icon: Moon, label: t("sos.duty"), tone: "bg-white text-indigo-900 border-2 border-indigo-200" },
    { href: "/ma-sante/dossier/urgence", icon: FileHeart, label: t("sos.card"), tone: "bg-white text-brand-deep border-2 border-emerald-200" },
    { href: "/don-de-sang", icon: Droplet, label: t("sos.blood"), tone: "bg-white text-red-800 border-2 border-red-200" },
  ];
  return (
    <div className="container-page max-w-3xl space-y-4 py-6">
      <header id="sos-texte" className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-950">
        <h1 className="flex items-center gap-2 text-3xl font-extrabold"><Siren className="size-8" aria-hidden /> {t("sos.title")}</h1>
        {numbers && <p className="mt-3 text-xl font-bold">{numbers}</p>}
        {!numbers && contacts.length === 0 && <p className="mt-3 text-sm">{t("sos.pending")}</p>}
        <p className="mt-2 text-lg font-semibold">{t("sos.intro")}</p>
        <p className="mt-2 text-xs">{t("sos.disclaimer")}</p>
        <ListenButton targetId="sos-texte" className="mt-3" />
      </header>

      {contacts.length > 0 && <EmergencyNumbers contacts={contacts} />}

      {ambulances.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-bold text-red-900">{t("sos.call")}</h2>
          <ul className="grid gap-2 sm:grid-cols-2">{ambulances.map((a) => (
            <li key={a.id}><a href={`tel:${a.phone}`} className="flex items-center justify-between gap-3 rounded-2xl bg-red-700 p-4 text-white shadow-sm">
              <span><span className="block font-bold">{a.name}</span><span className="text-sm opacity-90">{a.area ?? ""}</span></span>
              <span className="flex items-center gap-1 font-bold"><Phone className="size-5" aria-hidden /><bdi dir="ltr">{formatPhone(a.phone!)}</bdi></span>
            </a></li>))}</ul>
        </section>
      )}

      <ul className="grid gap-3 sm:grid-cols-2">{tiles.map(({ href, icon: Icon, label, tone }) => (
        <li key={href}><Link prefetch={false} href={href} className={`flex min-h-20 items-center gap-3 rounded-2xl p-4 text-lg font-bold shadow-sm ${tone}`}><Icon className="size-8 shrink-0" aria-hidden />{label}</Link></li>
      ))}</ul>

      <p className="flex items-start gap-2 rounded-xl bg-muted/60 p-3 text-sm text-muted-foreground"><WifiOff className="mt-0.5 size-4 shrink-0" aria-hidden />
        {t("sos.offline")}</p>
    </div>
  );
}
