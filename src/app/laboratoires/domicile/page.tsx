import Link from "next/link";
import { Home } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatXof } from "@/lib/format";

export const metadata = { title: "Prise de sang à domicile", description: "Des laboratoires envoient une infirmière chez vous pour la prise de sang : utile pour les personnes âgées ou qui se déplacent difficilement." };
export const dynamic = "force-dynamic";

type R = { facility_id: string; fee_xof: number | null; areas: string | null; hours: string | null; partner_name: string | null; facility_listings: { name: string; city_label: string | null; is_published: boolean } | null };

export default async function HomeSampling() {
  const supabase = await createClient();
  const { data } = await supabase.from("lab_home_service").select("facility_id, fee_xof, areas, hours, partner_name, facility_listings(name, city_label, is_published)").eq("enabled", true);
  const rows = ((data ?? []) as unknown as R[]).filter((r) => r.facility_listings?.is_published);
  return (
    <div className="container-page max-w-3xl space-y-4 py-6">
      <h1 className="flex items-center gap-2 text-2xl font-bold text-brand-deep"><Home className="size-7 text-brand-blue" aria-hidden /> Prise de sang à domicile</h1>
      <p className="text-muted-foreground">Pour les personnes âgées, malades ou qui se déplacent difficilement : le laboratoire envoie une infirmière à la maison, puis apporte l&apos;échantillon au laboratoire. Choisissez un laboratoire, indiquez les analyses demandées par le médecin, votre adresse et le jour souhaité ; le laboratoire vous rappelle pour confirmer.</p>
      <p className="rounded-xl bg-muted/60 p-3 text-xs text-muted-foreground">Le prélèvement, la conservation et le transport de l&apos;échantillon sont réalisés sous la responsabilité du laboratoire et de son partenaire. Préparez l&apos;ordonnance. Une urgence ? N&apos;attendez pas : allez au centre de santé.</p>
      {rows.length === 0 ? <p className="rounded-xl border bg-white p-4 text-sm text-muted-foreground">Aucun laboratoire ne propose encore ce service sur PharmaProxi. Les laboratoires peuvent l&apos;activer depuis leur espace.</p> : (
        <ul className="grid gap-3 sm:grid-cols-2">{rows.map((r) => (
          <li key={r.facility_id} className="flex flex-col gap-2 rounded-2xl border bg-white p-4 text-sm">
            <Link prefetch={false} href={`/laboratoires/fiche/${r.facility_id}`} className="text-base font-bold text-brand-deep hover:underline">{r.facility_listings!.name}</Link>
            <p className="text-muted-foreground">{[r.facility_listings!.city_label, r.areas && `Zones : ${r.areas}`, r.hours].filter(Boolean).join(" · ")}</p>
            <p>{r.fee_xof !== null ? `Frais de déplacement : ${formatXof(r.fee_xof)}` : "Frais de déplacement : à demander"}{r.partner_name ? ` · avec ${r.partner_name}` : ""}</p>
            <Link prefetch={false} href={`/laboratoires/domicile/${r.facility_id}`} className="mt-auto w-fit rounded-xl bg-primary px-4 py-2 font-semibold text-white">Demander un passage</Link>
          </li>))}</ul>
      )}
    </div>
  );
}
