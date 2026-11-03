import Link from "next/link";
import { dossierContext, loadItems } from "@/lib/dossier/server";
import { DossierGate, DossierShell } from "@/components/dossier/shell";
import { ItemSection } from "@/components/dossier/item-section";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Analyses et examens" };
export const dynamic = "force-dynamic";

export default async function Analyses({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const sp = await searchParams;
  const ctx = await dossierContext(sp.p, "/ma-sante/dossier/analyses");
  if (ctx.locked) return <DossierGate status={ctx.status} path={`/ma-sante/dossier/analyses${sp.p ? `?p=${sp.p}` : ""}`} />;
  const { supabase, person, persons, status } = ctx;
  const back = `/ma-sante/dossier/analyses${person.is_self ? "" : `?p=${person.id}`}`;
  const [items, { data: measures }] = await Promise.all([
    loadItems(supabase, person.id, ["analyse"]),
    person.is_self ? supabase.from("health_measures").select("kind, systolic, diastolic, pulse, glucose_gl, context, measured_at").order("measured_at", { ascending: false }).limit(6)
      : Promise.resolve({ data: [] as { kind: string; systolic: number | null; diastolic: number | null; pulse: number | null; glucose_gl: number | null; context: string | null; measured_at: string }[] }),
  ]);
  return (
    <DossierShell persons={persons} person={person} status={status} current="/analyses">
      <ItemSection kind="analyse" items={items} personId={person.id} back={back}
        intro={<p className="text-sm text-muted-foreground">Recopiez le nom de l&apos;analyse, la date, le laboratoire et le résultat important. Gardez toujours le compte rendu papier : c&apos;est lui qui fait foi.</p>} />
      {person.is_self && (
        <section className="space-y-2 rounded-2xl border bg-white p-4 sm:p-5">
          <h2 className="text-lg font-bold text-brand-deep">Mes dernières mesures</h2>
          <p className="text-sm text-muted-foreground">Reprises automatiquement de <Link prefetch={false} href="/ma-sante/mesures" className="text-primary underline">Tension et glycémie</Link>.</p>
          {measures?.length ? (
            <ul className="divide-y text-sm">
              {measures.map((m) => (
                <li key={m.measured_at} className="flex justify-between gap-3 py-2">
                  <span>{m.kind === "tension" ? `Tension ${m.systolic}/${m.diastolic}${m.pulse ? ` · pouls ${m.pulse}` : ""}` : `Glycémie ${String(m.glucose_gl).replace(".", ",")} g/L${m.context === "a_jeun" ? " (à jeun)" : m.context === "apres_repas" ? " (après repas)" : ""}`}</span>
                  <span className="text-muted-foreground">{formatDate(m.measured_at)}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted-foreground">Aucune mesure notée.</p>}
        </section>
      )}
    </DossierShell>
  );
}
