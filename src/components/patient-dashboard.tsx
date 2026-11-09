import Link from "next/link";
import { Bell, CalendarClock, FileLock2, FlaskConical, Heart, LockKeyhole, Syringe } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

type Fav = { kind: string; label: string; href: string };
const KIND: Record<string, string> = { medecin: "Médecin", pharmacie: "Pharmacie", etablissement: "Établissement", laboratoire: "Laboratoire" };

/** Tableau de bord patient : uniquement des données réelles de la personne connectée. */
export async function PatientDashboard({ userId, firstName }: { userId: string; firstName: string | null }) {
  const supabase = await createClient();
  const [{ data: next }, { data: favs }, { count: unread }, { count: docs }, { count: results }] = await Promise.all([
    supabase.from("appointments").select("id, scheduled_at, status").eq("patient_id", userId).in("status", ["confirmed", "proposed", "pending"]).gte("scheduled_at", new Date().toISOString()).order("scheduled_at").limit(1),
    supabase.from("favorites").select("kind,label,href").order("created_at", { ascending: false }).limit(6),
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", userId).is("read_at", null),
    supabase.from("record_documents").select("id", { count: "exact", head: true }).eq("user_id", userId),
    supabase.from("lab_results").select("id", { count: "exact", head: true }).eq("user_id", userId),
  ]);
  const n = (next as { id: string; scheduled_at: string; status: string }[] | null)?.[0];
  const tiles: [string, string, typeof Bell, string][] = [
    ["/compte/rendez-vous", "Mes rendez-vous", CalendarClock, n ? `Prochain : ${new Date(n.scheduled_at).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Bamako" })}${n.status !== "confirmed" ? " (à confirmer)" : ""}` : "Aucun rendez-vous à venir"],
    ["/ma-sante/dossier", "Documents et ordonnances", FileLock2, `${docs ?? 0} document(s)`],
    ["/compte/resultats", "Résultats d'analyses", FlaskConical, `${results ?? 0} résultat(s)`],
    ["/ma-sante/enfants", "Vaccinations", Syringe, "Carnet des enfants"],
    ["/compte/notifications", "Notifications", Bell, `${unread ?? 0} non lue(s)`],
    ["/compte/confidentialite", "Confidentialité", LockKeyhole, "Consentements et données"],
  ];
  const list = (favs as Fav[] | null) ?? [];
  return (
    <section aria-labelledby="espace" className="space-y-3">
      <h2 id="espace" className="text-xl font-bold text-[#052D1E]">Bonjour{firstName ? ` ${firstName}` : ""} 👋</h2>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{tiles.map(([href, t, Icon, d]) => (
        <li key={href}><Link prefetch={false} href={href} className="flex h-full items-start gap-3 rounded-2xl border bg-white p-4 hover:border-[#068132]">
          <Icon className="mt-0.5 size-5 shrink-0 text-[#068132]" aria-hidden /><span><span className="block font-semibold text-[#052D1E]">{t}</span><span className="text-sm text-muted-foreground">{d}</span></span></Link></li>))}</ul>
      <div className="rounded-2xl border bg-white p-4">
        <p className="flex items-center gap-2 font-semibold text-[#052D1E]"><Heart className="size-4 text-red-600" aria-hidden /> Mes favoris</p>
        {list.length === 0 ? <p className="mt-1 text-sm text-muted-foreground">Ajoutez des médecins, pharmacies ou établissements depuis leur fiche avec le bouton « Ajouter aux favoris ».</p> : (
          <ul className="mt-2 flex flex-wrap gap-2">{list.map((f) => <li key={f.href}><Link prefetch={false} href={f.href} className="inline-flex rounded-full border px-3 py-1 text-sm hover:border-[#068132]"><span className="text-muted-foreground">{KIND[f.kind]} ·</span>&nbsp;{f.label}</Link></li>)}</ul>)}
      </div>
    </section>
  );
}
