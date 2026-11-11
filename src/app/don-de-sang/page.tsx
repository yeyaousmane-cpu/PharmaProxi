import Link from "next/link";
import { BellRing, Clock, Droplet, MapPin, Phone, Siren } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { formatDate, formatPhone } from "@/lib/format";
import { cn } from "@/lib/utils";
import { BloodCampaigns } from "@/components/blood/campaigns";
import { AudioGuide } from "@/components/audio/audio-guide";

export const metadata = {
  title: "Don de sang",
  description: "Où et comment donner son sang au Mali : conditions, sites de collecte du CNTS, besoins urgents.",
};
export const revalidate = 0;

type Need = { id: string; facility: string; blood_groups: string[]; message: string | null; where_to_give: string | null; contact_phone: string | null; source: string; expires_at: string; created_at: string; regions: { name: string } | null };

const SITES = {
  "Hôpitaux": ["CHU Gabriel Touré", "Hôpital du Mali", "CHU Point G", "CHU-CNOS", "Hôpital de Kati", "Centre hospitalier Mère-Enfant le Luxembourg", "Hôpital de district de la Commune IV", "Hôpital périnatal Mohammed VI"],
  "Centres de santé de référence (CSRéf)": ["Communes I, II, III, V et VI de Bamako", "Kati", "Kalaban Coro"],
  "Polycliniques": ["Les Orangers (Banankoro)", "Golden Life (Badalabougou)"],
};

export default async function BloodPage() {
  let needs: Need[] = [];
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    needs = ((await supabase.from("blood_needs").select("id, facility, blood_groups, message, where_to_give, contact_phone, source, expires_at, created_at, regions(name)").order("created_at", { ascending: false }).limit(20)).data as unknown as Need[] | null) ?? [];
  }
  return (
    <div className="container-page max-w-4xl space-y-6 py-6">
      <header className="space-y-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-brand-deep"><Droplet className="size-7 text-red-600" aria-hidden /> Don de sang : une poche, des vies sauvées</h1>
        <p className="max-w-3xl text-muted-foreground">Accouchements, accidents, anémies graves, drépanocytose, paludisme sévère de l&apos;enfant : chaque jour, des malades ont besoin de sang. Au Mali, les donneurs volontaires réguliers manquent.</p>
        <AudioGuide target="don-de-sang" />
      </header>

      <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-gradient-to-br from-[#7f1d1d] via-[#b91c1c] to-[#052D1E] p-5 text-white">
        <div className="max-w-xl space-y-1">
          <p className="text-xs font-semibold uppercase tracking-widest text-white/80">SantéProxi Solidaire · Donner. Mobiliser. Sauver.</p>
          <h2 className="text-xl font-extrabold">Mon espace donneur</h2>
          <p className="text-sm text-white/90">Suivez vos dons, votre prochaine date indicative, votre carte de donneur et vos distinctions. Gratuit, privé : votre groupe sanguin n&apos;est jamais rendu public.</p>
        </div>
        <Link prefetch={false} href="/don-de-sang/mon-espace" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-5 font-bold text-red-800 hover:bg-red-50"><Droplet className="size-4 fill-red-600 text-red-600" aria-hidden /> Ouvrir mon espace donneur</Link>
        <nav aria-label="SantéProxi Solidaire" className="flex w-full flex-wrap gap-2 text-sm">
          {[["/don-de-sang/sos", "SOS Besoin de sang"], ["/don-de-sang/rendez-vous", "Prendre rendez-vous"], ["/don-de-sang/disponibilites", "Besoins des centres"], ["/don-de-sang/suis-je-apte", "Suis-je apte à donner ?"], ["/don-de-sang/apres-le-don", "Mon suivi après le don"], ["/don-de-sang/passeport", "Mon passeport solidaire"], ["/don-de-sang/groupes-rares", "Groupes sanguins rares"]].map(([h, l]) =>
            <Link key={h} prefetch={false} href={h} className="rounded-full bg-white/15 px-3 py-1.5 font-semibold text-white hover:bg-white/25">{l}</Link>)}
        </nav>
      </section>

      <section aria-labelledby="besoins" className="space-y-3">
        <h2 id="besoins" className="flex items-center gap-2 text-lg font-bold"><Siren className="size-5 text-red-600" aria-hidden /> Besoins signalés</h2>
        {needs.length === 0 ? (
          <p className="rounded-xl border bg-white p-4 text-sm text-muted-foreground">Aucun besoin urgent signalé pour le moment. Les réserves dépendent des dons réguliers : vous pouvez donner à tout moment au CNTS.</p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {needs.map((n) => (
              <li key={n.id} className="rounded-xl border border-red-200 bg-red-50/50 p-4 text-sm">
                <p className="font-bold text-brand-deep">{n.facility}{n.regions ? <span className="font-normal text-muted-foreground"> · {n.regions.name}</span> : null}</p>
                <div className="mt-1 flex flex-wrap gap-1.5">{n.blood_groups.length ? n.blood_groups.map((g) => <Badge key={g} className="border-red-200 bg-white font-bold text-red-700">{g}</Badge>) : <Badge className="bg-white text-red-700">Tous groupes</Badge>}</div>
                {n.message && <p className="mt-2">{n.message}</p>}
                {n.where_to_give && <p className="mt-1 flex items-start gap-1.5"><MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden />{n.where_to_give}</p>}
                {n.contact_phone && <a href={`tel:${n.contact_phone}`} className="mt-1 inline-flex items-center gap-1.5 font-semibold text-primary"><Phone className="size-3.5" aria-hidden />{formatPhone(n.contact_phone)}</a>}
                <p className="mt-2 text-xs text-muted-foreground">Signalé par : {n.source} · jusqu&apos;au {formatDate(n.expires_at)}</p>
              </li>
            ))}
          </ul>
        )}
        <p className="text-sm">Demandes individuelles vérifiées par le CNTS : <Link prefetch={false} href="/don-de-sang/sos" className="font-semibold text-primary underline">SOS Besoin de sang</Link>.</p>
        <Link prefetch={false} href="/ma-sante#alertes" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}><BellRing aria-hidden /> Être prévenu(e) quand mon groupe est demandé</Link>
      </section>

      {isSupabaseConfigured() && <BloodCampaigns />}

      <div className="grid gap-6 md:grid-cols-2">
        <section className="space-y-2 rounded-2xl border bg-white p-5 text-sm leading-relaxed">
          <h2 className="text-lg font-bold text-brand-deep">Qui peut donner ?</h2>
          <ul className="list-disc space-y-1 ps-5">
            <li>Avoir entre <strong>18 et 60 ans</strong>.</li>
            <li>Peser <strong>au moins 55 kg</strong>.</li>
            <li>Être en bonne santé, et <strong>avoir mangé et bu</strong> avant de venir (ne pas être à jeun).</li>
            <li>Attendre <strong>3 mois</strong> entre deux dons pour un homme, <strong>4 mois</strong> pour une femme.</li>
            <li>Signaler vos médicaments lors de l&apos;entretien : certaines situations empêchent le don pour un temps, le médecin vous le dira.</li>
          </ul>
        </section>
        <section className="space-y-2 rounded-2xl border bg-white p-5 text-sm leading-relaxed">
          <h2 className="text-lg font-bold text-brand-deep">Comment se passe un don ?</h2>
          <ol className="list-decimal space-y-1 ps-5">
            <li><strong>Accueil</strong> : présentez une pièce d&apos;identité.</li>
            <li><strong>Entretien médical</strong> : un médecin vérifie que vous pouvez donner.</li>
            <li><strong>Prélèvement</strong> : 10 à 15 minutes, sous surveillance.</li>
            <li><strong>Collation</strong> : un moment de repos avant de repartir.</li>
          </ol>
          <p>Vos résultats d&apos;analyse peuvent être retirés à partir du 15e jour après le don.</p>
        </section>
      </div>

      <section id="ou-donner" className="scroll-mt-24 space-y-3 rounded-2xl border bg-white p-5 text-sm">
        <h2 className="text-lg font-bold text-brand-deep">Où donner ?</h2>
        <div className="rounded-xl bg-brand-mint p-4">
          <p className="font-bold text-brand-deep">Centre national de transfusion sanguine (CNTS)</p>
          <p className="mt-1 flex items-start gap-1.5"><MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />Quinzambougou, Bamako</p>
          <p className="flex items-start gap-1.5"><Clock className="mt-0.5 size-4 shrink-0" aria-hidden />Lundi au vendredi, 8 h – 14 h</p>
          <a href="tel:+22320213958" className="mt-1 inline-flex items-center gap-1.5 font-semibold text-primary"><Phone className="size-4" aria-hidden />+223 20 21 39 58</a>
        </div>
        <p>Le CNTS collecte aussi dans ces sites :</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {Object.entries(SITES).map(([k, v]) => (
            <div key={k}><p className="font-semibold">{k}</p><ul className="mt-1 list-disc space-y-0.5 ps-5 text-muted-foreground">{v.map((s) => <li key={s}>{s}</li>)}</ul></div>
          ))}
        </div>
        <p className="text-muted-foreground">Dans les régions, renseignez-vous auprès de l&apos;hôpital régional : le pays compte plusieurs banques de sang.</p>
        <p className="rounded-xl bg-amber-50 p-3 text-amber-950">Le don de sang est <strong>gratuit et volontaire</strong>. Ne payez jamais une poche de sang à un intermédiaire : adressez-vous au CNTS ou au service de l&apos;hôpital.</p>
      </section>
      <p className="text-xs text-muted-foreground">Sources : <a href="https://cnts.ml/" target="_blank" rel="noopener noreferrer" className="underline">CNTS Mali</a> (conditions, horaires, sites de collecte) ; <a href="https://www.studiotamani.org/166660-le-defi-du-don-de-sang-face-a-la-demande-croissante-au-mali" target="_blank" rel="noopener noreferrer" className="underline">Studio Tamani, juillet 2024</a>. Vérifié en novembre 2026.</p>
    </div>
  );
}
