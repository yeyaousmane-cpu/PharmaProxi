import Link from "next/link";
import { BellRing, Stethoscope } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SanteNav } from "@/components/sante-perso/nav";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { deleteMeasureReminder, requestFollow, saveMeasureReminder, setFollowStatus } from "@/app/actions/v028";
import { WEEKDAYS } from "@/lib/passeport";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Suivi et rappels de mesure" };
export const dynamic = "force-dynamic";

type Reminder = { id: string; kind: "tension" | "glycemie"; weekdays: number[]; at_time: string };
type Follow = { id: string; status: string; reason: string | null; share_treatments: boolean; created_at: string; doctors: { title: string | null; display_name: string } | null; care_notes: { id: string; body: string; created_at: string }[] };
const KIND = { tension: "Tension", glycemie: "Glycémie" } as const;
const STATUS: Record<string, string> = { demande: "En attente de la réponse du médecin", actif: "En cours", refuse: "Refusé par le médecin", termine: "Terminé" };

export default async function Suivi() {
  await requireUser("/ma-sante/suivi");
  const supabase = await createClient();
  const [{ data: rem }, { data: fol }, { data: enabled }, { data: docs }] = await Promise.all([
    supabase.from("measure_reminders").select("id, kind, weekdays, at_time").order("kind"),
    supabase.from("care_follows").select("id, status, reason, share_treatments, created_at, doctors(title, display_name), care_notes(id, body, created_at)").order("created_at", { ascending: false }).limit(20),
    supabase.rpc("care_follow_enabled"),
    supabase.from("doctors").select("id, title, display_name").eq("is_published", true).not("user_id", "is", null).order("display_name").limit(200),
  ]);
  const reminders = (rem ?? []) as Reminder[];
  const follows = (fol ?? []) as unknown as Follow[];
  const docName = (f: Follow) => `${f.doctors?.title ?? ""} ${f.doctors?.display_name ?? "Médecin"}`.trim();
  return (
    <div className="container-page max-w-4xl space-y-5 py-6">
      <SanteNav current="/ma-sante/suivi" />
      <header>
        <h1 className="text-2xl font-extrabold text-[#052D1E]">Suivi et rappels de mesure</h1>
        <p className="mt-1 text-sm text-muted-foreground">Pour les personnes qui vivent avec une maladie nécessitant un suivi régulier (hypertension, diabète…). SantéProxi affiche vos mesures telles que vous les notez : il ne les interprète pas et ne remplace pas votre soignant.</p>
      </header>

      <section className="space-y-3 rounded-2xl border bg-white p-4 sm:p-5">
        <h2 className="flex items-center gap-2 text-lg font-bold text-[#052D1E]"><BellRing className="size-5" aria-hidden /> Mes rappels de mesure</h2>
        <p className="text-sm text-muted-foreground">Recevez une notification dans votre compte les jours choisis (heure du Mali). <Link prefetch={false} href="/ma-sante/mesures" className="text-primary underline">Noter une mesure</Link></p>
        {(["tension", "glycemie"] as const).map((k) => {
          const r = reminders.find((x) => x.kind === k);
          return (
            <div key={k} className="rounded-xl border p-3">
              <ActionForm action={saveMeasureReminder} className="flex flex-wrap items-end gap-3">
                <input type="hidden" name="kind" value={k} />
                <fieldset><legend className="text-sm font-semibold">{KIND[k]} — jours</legend>
                  <div className="mt-1 flex flex-wrap gap-1">{WEEKDAYS.map(([d, l]) => (
                    <label key={d} className="flex min-h-10 items-center gap-1 rounded-lg border px-2 text-sm"><input type="checkbox" name="days" value={d} defaultChecked={r?.weekdays.includes(d)} /> {l}</label>))}</div></fieldset>
                <label className="text-sm"><span className="font-semibold">Heure</span><input type="time" name="at_time" defaultValue={r?.at_time ?? "08:00"} required className="mt-1 block h-10 rounded-lg border px-2" /></label>
                <SubmitButton size="sm">{r ? "Modifier" : "Activer le rappel"}</SubmitButton>
              </ActionForm>
              {r && <ActionForm action={deleteMeasureReminder} className="mt-2"><input type="hidden" name="id" value={r.id} /><SubmitButton size="sm" variant="outline">Supprimer ce rappel</SubmitButton></ActionForm>}
            </div>
          );
        })}
      </section>

      <section className="space-y-3 rounded-2xl border bg-white p-4 sm:p-5">
        <h2 className="flex items-center gap-2 text-lg font-bold text-[#052D1E]"><Stethoscope className="size-5" aria-hidden /> Suivi par mon médecin</h2>
        {follows.length > 0 && (
          <ul className="space-y-2">{follows.map((f) => (
            <li key={f.id} className="rounded-xl border p-3 text-sm">
              <p className="font-semibold">{docName(f)} <span className="ms-1 rounded-full bg-muted px-2 py-0.5 text-xs font-normal">{STATUS[f.status]}</span></p>
              <p className="text-muted-foreground">Demandé le {formatDateTime(f.created_at)}{f.reason ? ` · ${f.reason}` : ""} · partage : mesures{f.share_treatments ? " et traitements" : ""}</p>
              {f.care_notes.length > 0 && <ul className="mt-2 space-y-1">{[...f.care_notes].sort((a, b) => b.created_at.localeCompare(a.created_at)).map((n) => (
                <li key={n.id} className="rounded-lg bg-[#EAF6EE] p-2"><span className="text-xs text-muted-foreground">Note du {formatDateTime(n.created_at)}</span><br />{n.body}</li>))}</ul>}
              {["demande", "actif"].includes(f.status) && (
                <ActionForm action={setFollowStatus} className="mt-2"><input type="hidden" name="id" value={f.id} /><input type="hidden" name="status" value="termine" />
                  <SubmitButton size="sm" variant="outline" confirm="Arrêter ce suivi ? Le médecin ne pourra plus voir vos mesures.">{f.status === "actif" ? "Arrêter le suivi" : "Annuler ma demande"}</SubmitButton></ActionForm>
              )}
            </li>))}</ul>
        )}
        {!enabled ? (
          <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-950">Le suivi de vos mesures par un médecin n&apos;est pas encore ouvert : il sera activé avec un partenaire clinique. En attendant, vous pouvez montrer vos mesures à votre soignant avec un <Link prefetch={false} href="/ma-sante/dossier/autorisations" className="underline">partage temporaire du passeport santé</Link>.</p>
        ) : (docs ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun médecin inscrit ne peut encore recevoir de demande de suivi.</p>
        ) : (
          <ActionForm action={requestFollow} className="space-y-3 rounded-xl border p-3">
            <p className="text-sm font-semibold">Demander à un médecin de suivre mes mesures</p>
            <label className="block text-sm"><span>Médecin</span>
              <select name="doctor_id" required defaultValue="" className="mt-1 h-11 w-full rounded-lg border bg-white px-2"><option value="" disabled>Choisir…</option>
                {(docs ?? []).map((d) => <option key={d.id} value={d.id}>{`${d.title ?? ""} ${d.display_name}`.trim()}</option>)}</select></label>
            <label className="block text-sm"><span>Motif (facultatif)</span><input name="reason" maxLength={200} className="mt-1 h-11 w-full rounded-lg border px-3" placeholder="ex. suivi de ma tension" /></label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="share_treatments" className="size-4" /> Partager aussi la liste de mes traitements en cours</label>
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="accord" className="mt-1 size-4" required /><span>J&apos;autorise ce médecin à voir les mesures de tension et de glycémie que je note. Je peux arrêter à tout moment ; chacune de ses consultations apparaît dans mon historique des accès.</span></label>
            <SubmitButton size="sm">Envoyer la demande</SubmitButton>
          </ActionForm>
        )}
      </section>
    </div>
  );
}
