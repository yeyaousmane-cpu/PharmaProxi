import { AlertTriangle } from "lucide-react";
import { dossierContext, loadItems } from "@/lib/dossier/server";
import { DossierGate, DossierShell } from "@/components/dossier/shell";
import { ItemSection } from "@/components/dossier/item-section";
import { allergyMatches } from "@/lib/dossier/config";

export const metadata = { title: "Antécédents et vaccins" };
export const dynamic = "force-dynamic";

export default async function Antecedents({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const sp = await searchParams;
  const ctx = await dossierContext(sp.p, "/ma-sante/dossier/antecedents");
  if (ctx.locked) return <DossierGate status={ctx.status} path={`/ma-sante/dossier/antecedents${sp.p ? `?p=${sp.p}` : ""}`} />;
  const { supabase, person, persons, status } = ctx;
  const back = `/ma-sante/dossier/antecedents${person.is_self ? "" : `?p=${person.id}`}`;
  const items = await loadItems(supabase, person.id, ["operation", "hospitalisation", "transfusion", "famille", "ancien_traitement", "vaccin", "allergie"]);
  const allergies = items.filter((i) => i.kind === "allergie").map((i) => i.title);
  const props = { items, personId: person.id, back };
  return (
    <DossierShell persons={persons} person={person} status={status} current="/antecedents">
      <ItemSection kind="operation" {...props} />
      <ItemSection kind="hospitalisation" {...props} />
      <ItemSection kind="transfusion" {...props} intro={<p className="text-sm text-muted-foreground">Utile pour le médecin, et à signaler avant un don de sang.</p>} />
      <ItemSection kind="ancien_traitement" {...props}
        intro={<p className="text-sm text-muted-foreground">Les médicaments importants que vous ne prenez plus, et pourquoi (par exemple « mal toléré »).</p>}
        warn={(i) => { const h = allergyMatches(i.title, allergies); return h.length ? <p className="flex items-center gap-1.5 text-xs font-semibold text-red-800"><AlertTriangle className="size-4" aria-hidden />Ressemble à votre allergie déclarée : {h.join(", ")}</p> : null; }} />
      <ItemSection kind="vaccin" {...props}
        intro={<p className="text-sm text-muted-foreground">Vos vaccins d&apos;adulte. Si vous indiquez la date du prochain rappel, vous recevez une notification 7 jours avant. Les vaccins des enfants se suivent dans le <a href="/ma-sante/enfants" className="text-primary underline">carnet de vaccination</a>.</p>} />
      <ItemSection kind="famille" {...props} intro={<p className="text-sm text-muted-foreground">Facultatif : certaines maladies (diabète, hypertension, drépanocytose…) comptent dans la famille proche.</p>} />
    </DossierShell>
  );
}
