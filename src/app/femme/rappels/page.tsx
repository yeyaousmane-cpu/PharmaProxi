import { Check, RotateCcw, Trash2 } from "lucide-react";
import { FemmeGate } from "@/components/femme/gate";
import { fmt } from "@/components/femme/bits";
import { F } from "@/components/femme/ui";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { femmeReminderAction, saveFemmeReminder } from "@/app/actions/femme";
import { femmeStatus } from "@/lib/femme/server";
import { createClient } from "@/lib/supabase/server";
import { todayIso } from "@/lib/femme/cycle";
import { REMINDER_KINDS, REPEATS } from "@/lib/femme/labels";

export const metadata = { title: "Rappels", robots: { index: false } };
type R = { id: string; kind: string; label: string; due_at: string; repeat: string; done: boolean };

export default async function RemindersPage() {
  const st = await femmeStatus();
  const gate = FemmeGate({ st, path: "/femme/rappels" });
  if (gate) return gate;
  const supabase = await createClient();
  const { data } = await supabase.from("femme_reminders").select("id, kind, label, due_at, repeat, done").order("done").order("due_at").limit(100);
  const rows = (data as R[] | null) ?? [];
  const Op = ({ r, op, label, icon }: { r: R; op: string; label: string; icon: React.ReactNode }) => (
    <ActionForm action={femmeReminderAction}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="op" value={op} />
      <SubmitButton variant="ghost" size="sm" aria-label={`${label} : ${r.label}`} confirm={op === "delete" ? "Supprimer ce rappel ?" : undefined}>{icon}</SubmitButton>
    </ActionForm>
  );
  return (
    <div className="space-y-4">
      <section className={`${F.card} space-y-3`}>
        <h1 className="text-xl font-bold text-[#843653]">Nouveau rappel</h1>
        <ActionForm action={saveFemmeReminder} resetOnSuccess className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm font-medium">Type<select name="kind" className={F.input}>{Object.entries(REMINDER_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className="space-y-1 text-sm font-medium">Intitulé (visible seulement par vous)<input name="label" required minLength={2} maxLength={80} placeholder="Ex. : échographie au CSRéf" className={F.input} /></label>
          <label className="space-y-1 text-sm font-medium">Date<input type="date" name="date" required min={todayIso()} className={F.input} /></label>
          <label className="space-y-1 text-sm font-medium">Heure (heure du Mali)<input type="time" name="time" defaultValue="08:00" className={F.input} /></label>
          <label className="space-y-1 text-sm font-medium">Répétition<select name="repeat" className={F.input}>{Object.entries(REPEATS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <div className="flex items-end"><SubmitButton className={`${F.btn} w-full`}>Programmer</SubmitButton></div>
        </ActionForm>
        <p className="text-xs text-muted-foreground">Le rappel arrive dans vos notifications PharmaProxi avec un texte neutre (« Vous avez un rappel ») : son contenu n&apos;apparaît qu&apos;une fois votre espace ouvert. Les rappels de traitement concernent uniquement des traitements prescrits.</p>
      </section>
      <section className={`${F.card} space-y-2`}>
        <h2 className={F.h2}>Mes rappels</h2>
        {rows.length === 0 ? <p className="text-sm text-muted-foreground">Aucun rappel.</p> : (
          <ul className="divide-y">
            {rows.map((r) => (
              <li key={r.id} className={`flex items-center gap-2 py-2 text-sm ${r.done ? "text-muted-foreground line-through" : ""}`}>
                <div className="min-w-0 flex-1"><p className="font-semibold">{r.label}</p>
                  <p className="text-xs">{REMINDER_KINDS[r.kind]} · {fmt(r.due_at.slice(0, 10), { weekday: "short", day: "numeric", month: "short" })} à {r.due_at.slice(11, 16)}{r.repeat !== "aucune" ? ` · ${REPEATS[r.repeat].toLowerCase()}` : ""}</p></div>
                {r.done ? <Op r={r} op="undo" label="Réactiver" icon={<RotateCcw className="size-4" aria-hidden />} /> : <Op r={r} op="done" label="Terminé" icon={<Check className="size-4" aria-hidden />} />}
                <Op r={r} op="delete" label="Supprimer" icon={<Trash2 className="size-4" aria-hidden />} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
