import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PROGRAM_EMOJI, type Program } from "@/lib/prevention-programs";

export const metadata = { title: "Programmes de prévention", description: "Paludisme, vaccination, grossesse, nutrition, hypertension et diabète, VIH, tuberculose, hygiène : fiches validées par des professionnels, campagnes et lieux de soins." };
export const revalidate = 600;

export default async function Programmes() {
  const supabase = await createClient();
  const { data } = await supabase.from("prevention_programs").select("*").order("sort_order");
  const list = (data ?? []) as Program[];
  return (
    <div className="container-page max-w-4xl space-y-5 py-6">
      <p className="text-sm"><Link prefetch={false} href="/prevention" className="text-primary underline">← Prévention</Link></p>
      <h1 className="text-2xl font-bold">Programmes de prévention</h1>
      <p className="text-sm text-muted-foreground">Huit thèmes prioritaires. Chaque programme rassemble les fiches relues et validées par un professionnel de santé, les campagnes publiées avec leur source et les lieux où se faire soigner. Une fiche n&apos;est jamais publiée avant cette validation.</p>
      <ul className="grid gap-3 sm:grid-cols-2">{list.map((p) => (
        <li key={p.slug}><Link prefetch={false} href={`/prevention/programmes/${p.slug}`} className="flex h-full items-start gap-3 rounded-2xl border bg-white p-4 hover:border-primary">
          <span className="text-3xl" aria-hidden>{PROGRAM_EMOJI[p.slug] ?? "🛡️"}</span>
          <span><span className="block text-lg font-bold text-brand-deep">{p.title}</span><span className="block text-sm text-muted-foreground">{p.audience}</span></span>
        </Link></li>))}</ul>
    </div>
  );
}
