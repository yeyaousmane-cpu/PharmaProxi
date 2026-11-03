import Link from "next/link";
import { AlertTriangle, CalendarPlus } from "lucide-react";
import { dossierContext, loadItems } from "@/lib/dossier/server";
import { DossierGate, DossierShell } from "@/components/dossier/shell";
import { ItemSection } from "@/components/dossier/item-section";
import { Input } from "@/components/ui/input";
import { allergyMatches } from "@/lib/dossier/config";

export const metadata = { title: "Consultations et ordonnances" };
export const dynamic = "force-dynamic";

function RemindFields() {
  return (
    <fieldset className="space-y-2 rounded-xl bg-brand-mint/60 p-3 text-sm sm:col-span-2">
      <label className="flex items-center gap-2 font-medium"><input type="checkbox" name="remind" className="size-4" /> Créer les rappels de prise sur mon téléphone</label>
      <div className="flex flex-wrap items-center gap-2">
        <span>Heures :</span>
        {["08:00", "", "", ""].map((t, i) => <Input key={i} type="time" name="times" defaultValue={t} className="h-9 w-28" aria-label={`Heure de prise ${i + 1}`} />)}
      </div>
      <label className="flex items-center gap-2">Pendant <Input type="number" name="duration_days" min={1} max={730} className="h-9 w-20" aria-label="Nombre de jours" /> jours (laisser vide : au long cours)</label>
    </fieldset>
  );
}

export default async function Consultations({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const sp = await searchParams;
  const ctx = await dossierContext(sp.p, "/ma-sante/dossier/consultations");
  if (ctx.locked) return <DossierGate status={ctx.status} path={`/ma-sante/dossier/consultations${sp.p ? `?p=${sp.p}` : ""}`} />;
  const { supabase, person, persons, status } = ctx;
  const qp = person.is_self ? "" : `?p=${person.id}`;
  const back = `/ma-sante/dossier/consultations${qp}`;
  const items = await loadItems(supabase, person.id, ["rendez_vous", "preparation", "consultation", "ordonnance", "allergie"]);
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = items.filter((i) => i.kind === "rendez_vous" && (i.event_date ?? "") >= today);
  const allergies = items.filter((i) => i.kind === "allergie").map((i) => i.title);
  const props = { items, personId: person.id, back };
  return (
    <DossierShell persons={persons} person={person} status={status} current="/consultations">
      <ItemSection kind="rendez_vous" {...props}
        intro={<p className="text-sm text-muted-foreground">Vous recevez une notification la veille. Pour une alarme fiable même sans connexion, ajoutez-les à l&apos;agenda de votre téléphone.</p>}>
        {upcoming.length > 0 && (
          <a href={`/ma-sante/dossier/rendez-vous.ics${qp}`} className="inline-flex w-fit items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold text-primary"><CalendarPlus className="size-4" aria-hidden /> Ajouter mes rendez-vous à l&apos;agenda</a>
        )}
      </ItemSection>
      <ItemSection kind="preparation" {...props}
        intro={<p className="text-sm text-muted-foreground">Avant d&apos;y aller, notez ce que vous ressentez, depuis quand et vos questions. Après, notez ce que le médecin a dit : on oublie vite en sortant du cabinet.</p>} />
      <ItemSection kind="consultation" {...props} intro={<p className="text-sm text-muted-foreground">Gardez la trace de chaque consultation : au bout d&apos;un an, tout votre parcours est ici.</p>} />
      <ItemSection kind="ordonnance" {...props} extra={<RemindFields />}
        intro={<p className="text-sm text-muted-foreground">Recopiez les médicaments de l&apos;ordonnance. Vous pouvez créer les rappels de prise en même temps (visibles dans <Link prefetch={false} href="/ma-sante/traitements" className="text-primary underline">Traitements</Link>). Si un médicament ressemble à une allergie que vous avez déclarée, un rappel s&apos;affiche.</p>}
        warn={(i) => { const h = allergyMatches(i.title, allergies); return h.length ? <p className="flex items-center gap-1.5 text-xs font-semibold text-red-800"><AlertTriangle className="size-4" aria-hidden />Ressemble à votre allergie déclarée : {h.join(", ")}. Parlez-en à votre pharmacien.</p> : null; }} />
    </DossierShell>
  );
}
