import { dossierContext, loadItems } from "@/lib/dossier/server";
import { DossierGate, DossierShell } from "@/components/dossier/shell";
import { ItemSection } from "@/components/dossier/item-section";

export const metadata = { title: "Journal de symptômes" };
export const dynamic = "force-dynamic";

export default async function Journal({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const sp = await searchParams;
  const ctx = await dossierContext(sp.p, "/ma-sante/dossier/journal");
  if (ctx.locked) return <DossierGate status={ctx.status} path={`/ma-sante/dossier/journal${sp.p ? `?p=${sp.p}` : ""}`} />;
  const { supabase, person, persons, status } = ctx;
  const back = `/ma-sante/dossier/journal${person.is_self ? "" : `?p=${person.id}`}`;
  const items = await loadItems(supabase, person.id, ["symptome"]);
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
  const counts = new Map<string, number>();
  for (const i of items) if ((i.event_date ?? "") >= since) counts.set(i.title, (counts.get(i.title) ?? 0) + 1);
  return (
    <DossierShell persons={persons} person={person} status={status} current="/journal">
      {counts.size > 0 && (
        <section className="rounded-2xl border bg-white p-4 text-sm">
          <h2 className="font-bold text-brand-deep">Ces 3 derniers mois</h2>
          <ul className="mt-2 flex flex-wrap gap-2">{[...counts].sort((a, b) => b[1] - a[1]).map(([t, n]) => <li key={t} className="rounded-full bg-brand-mint px-3 py-1">{t} : {n} jour{n > 1 ? "s" : ""}</li>)}</ul>
          <p className="mt-2 text-xs text-muted-foreground">À montrer à votre médecin : c&apos;est plus fiable que la mémoire. Ce décompte ne remplace pas un avis médical.</p>
        </section>
      )}
      <ItemSection kind="symptome" items={items} personId={person.id} back={back}
        intro={<p className="text-sm text-muted-foreground">Notez les jours de fièvre, de douleur ou de crise (drépanocytose, asthme, épilepsie…), avec l&apos;intensité et ce qui a aidé. En cas de signe grave, ne notez pas : <a href="/urgences" className="font-semibold text-red-700 underline">appelez les secours</a>.</p>} />
    </DossierShell>
  );
}
