import Link from "next/link";
import { Activity, Baby, CalendarCheck, ChevronRight, Droplet, FileText, FlaskConical, FolderHeart, HeartPulse, Lock, Pill, Siren, Users } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getGeo } from "@/lib/geo";
import { SanteNav, PRIVACY_NOTE } from "@/components/sante-perso/nav";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Field, Select } from "@/components/ui/input";
import { saveAlertPrefs } from "@/app/actions/health-tools";
import { buildVisits, nextVisit, type Dose } from "@/lib/vaccines";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Mon espace santé" };

export default async function MaSante() {
  const s = await requireUser("/ma-sante");
  const supabase = await createClient();
  const [{ data: kids }, { data: sched }, { data: vacc }, { data: treatments }, { data: last }, { data: prefs }, geo] = await Promise.all([
    supabase.from("children").select("id, first_name, birth_date, sex").order("birth_date"),
    supabase.from("vaccine_schedule").select("*"),
    supabase.from("child_vaccinations").select("child_id, dose_code, done_on"),
    supabase.from("treatments").select("id, name, times, active").eq("active", true),
    supabase.from("health_measures").select("kind, systolic, diastolic, glucose_gl, measured_at").order("measured_at", { ascending: false }).limit(1),
    supabase.from("user_alert_prefs").select("*").eq("user_id", s.userId).maybeSingle(),
    getGeo(),
  ]);
  const [{ count: rdv }, { count: results }, { count: labReq }, { count: relatives }] = await Promise.all([
    supabase.from("appointments").select("id", { count: "exact", head: true }).eq("patient_id", s.userId).gte("requested_date", new Date().toISOString().slice(0, 10)),
    supabase.from("lab_results").select("id", { count: "exact", head: true }).eq("user_id", s.userId).is("first_opened_at", null),
    supabase.from("home_sampling_requests").select("id", { count: "exact", head: true }).eq("user_id", s.userId).in("status", ["nouvelle", "acceptee", "planifiee"]),
    supabase.from("record_persons").select("id", { count: "exact", head: true }).eq("owner_id", s.userId).eq("is_self", false),
  ]);
  const doneBy = (id: string) => Object.fromEntries((vacc ?? []).filter((v) => v.child_id === id).map((v) => [v.dose_code, v.done_on]));
  const kidsNext = (kids ?? []).map((k) => ({ k, next: nextVisit(buildVisits((sched ?? []) as Dose[], k.birth_date, k.sex, doneBy(k.id))) }));
  const m = last?.[0];
  const cards = [
    { href: "/ma-sante/dossier", icon: FolderHeart, title: "Mon dossier santé", text: "🔒 Protégé par votre code, visible par vous seul. Groupe sanguin, allergies, maladies, analyses, consultations : à montrer à votre médecin. Pour vous et vos proches." },
    { href: "/ma-sante/enfants", icon: Baby, title: "Carnet de vaccination", text: kidsNext.length ? kidsNext.map(({ k, next }) => `${k.first_name} : ${next ? `${next.label}${next.status === "en_retard" ? " (en retard)" : ` le ${formatDate(next.due)}`}` : "à jour"}`).join(" · ") : "Ajoutez vos enfants : rappel avant chaque vaccin." },
    { href: "/ma-sante/traitements", icon: Pill, title: "Mes traitements", text: treatments?.length ? `${treatments.length} traitement(s) en cours · ${treatments.reduce((a, t) => a + t.times.length, 0)} prise(s) par jour` : "Rappel de chaque prise et avant la fin de la boîte." },
    { href: "/ma-sante/mesures", icon: Activity, title: "Tension et glycémie", text: m ? `Dernière mesure : ${m.kind === "tension" ? `${m.systolic}/${m.diastolic}` : `${String(m.glucose_gl).replace(".", ",")} g/L`} le ${formatDate(m.measured_at)}` : "Notez vos mesures et montrez le graphique à votre médecin." },
    { href: "/compte/rendez-vous", icon: CalendarCheck, title: "Mes rendez-vous", text: rdv ? `${rdv} rendez-vous à venir` : "Vos rendez-vous chez le médecin, avec rappels." },
    { href: "/compte/resultats", icon: FileText, title: "Mes résultats d'analyses", text: results ? `${results} nouveau(x) résultat(s) à consulter` : "Les résultats envoyés par votre laboratoire, chiffrés et visibles par vous seul." },
    { href: "/compte/prelevements", icon: FlaskConical, title: "Laboratoire : rendez-vous et prises de sang", text: labReq ? `${labReq} demande(s) en cours` : "Vos demandes de rendez-vous au laboratoire et de prise de sang à domicile." },
    { href: "/ma-sante/famille", icon: Users, title: "Santé de ma famille", text: relatives || (kids ?? []).length ? `${relatives ?? 0} proche(s) dans le dossier · ${(kids ?? []).length} enfant(s) dans le carnet` : "Dossiers de vos proches, vaccins des enfants : tout au même endroit." },
  ];
  return (
    <div className="container-page max-w-4xl space-y-5 py-6">
      <header className="space-y-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-brand-deep"><HeartPulse className="size-7 text-primary" aria-hidden /> Mon espace santé</h1>
        <p className="flex items-start gap-2 text-sm text-muted-foreground"><Lock className="mt-0.5 size-4 shrink-0" aria-hidden />{PRIVACY_NOTE}</p>
      </header>
      <SanteNav current="/ma-sante" />
      <ul className="grid gap-3 sm:grid-cols-2">
        {cards.map(({ href, icon: Icon, title, text }) => (
          <li key={href}>
            <Link prefetch={false} href={href} className="flex h-full flex-col rounded-2xl border bg-white p-4 shadow-sm hover:border-primary">
              <span className="flex items-center gap-2 font-semibold text-brand-deep"><span className="flex size-9 items-center justify-center rounded-full bg-brand-mint"><Icon className="size-5 text-primary" aria-hidden /></span>{title}</span>
              <span className="mt-2 text-sm text-muted-foreground">{text}</span>
              <span className="mt-auto flex items-center gap-1 pt-3 text-sm font-semibold text-primary">Ouvrir <ChevronRight className="size-4 rtl:-scale-x-100" aria-hidden /></span>
            </Link>
          </li>
        ))}
      </ul>

      <section id="alertes" className="scroll-mt-24 rounded-2xl border bg-white p-5">
        <h2 className="text-lg font-bold text-brand-deep">Mes alertes</h2>
        <p className="mt-1 text-sm text-muted-foreground">Recevez une notification quand une alerte officielle est publiée ou quand un hôpital a besoin de sang de votre groupe.</p>
        <ActionForm action={saveAlertPrefs} className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="flex items-start gap-2 text-sm sm:col-span-2"><input type="checkbox" name="health_alerts" defaultChecked={prefs?.health_alerts} className="mt-0.5 size-4" />
            <span><Siren className="me-1 inline size-4 text-red-600" aria-hidden /><strong>Alertes sanitaires officielles</strong> : faux médicaments, rappels de lots, campagnes, épidémies (<Link prefetch={false} href="/alertes" className="text-primary underline">voir</Link>).</span></label>
          <label className="flex items-start gap-2 text-sm sm:col-span-2"><input type="checkbox" name="blood_alerts" defaultChecked={prefs?.blood_alerts} className="mt-0.5 size-4" />
            <span><Droplet className="me-1 inline size-4 text-red-600" aria-hidden /><strong>Besoins en sang</strong> : je suis prêt(e) à donner (<Link prefetch={false} href="/don-de-sang" className="text-primary underline">conditions</Link>).</span></label>
          <Field label="Mon groupe sanguin (facultatif)" htmlFor="bg"><Select id="bg" name="blood_group" defaultValue={prefs?.blood_group ?? ""}><option value="">Je ne sais pas / tous</option>{["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((g) => <option key={g}>{g}</option>)}</Select></Field>
          <Field label="Ma région" htmlFor="rg"><Select id="rg" name="region_id" defaultValue={prefs?.region_id ?? ""}><option value="">Tout le Mali</option>{geo.regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></Field>
          <p className="text-xs text-muted-foreground sm:col-span-2">Votre groupe sanguin sert uniquement à vous prévenir quand votre groupe est demandé. Vous pouvez le retirer à tout moment.</p>
          <SubmitButton size="sm" className="w-fit">Enregistrer</SubmitButton>
        </ActionForm>
      </section>
    </div>
  );
}
