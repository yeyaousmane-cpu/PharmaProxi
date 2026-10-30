import { notFound } from "next/navigation";
import Link from "next/link";
import { Flower2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PARTNER_CONTENT } from "@/lib/femme/content";
import { PARTNER_TOPICS } from "@/lib/femme/labels";

export const metadata = { title: "Contenus partagés", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Page partenaire : uniquement des contenus pédagogiques choisis, aucune donnée personnelle. */
export default async function PartnerPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f]{36}$/.test(token)) notFound();
  const supabase = await createClient();
  const { data } = await supabase.rpc("femme_partner_view", { p_token: token });
  const topics = (data as string[] | null) ?? null;
  if (!topics?.length) notFound();
  return (
    <div className="bg-[#FFF9FB]">
      <div className="container-page max-w-3xl space-y-4 py-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-[#843653]"><Flower2 className="size-7 text-[#D96A91]" aria-hidden /> Des informations pour l&apos;accompagner</h1>
        <p className="text-sm text-muted-foreground">Une personne proche a choisi de partager ces contenus avec vous. Ils sont généraux : aucune information personnelle la concernant n&apos;est affichée ici.</p>
        {Object.keys(PARTNER_TOPICS).filter((t) => topics.includes(t)).map((t) => (
          <section key={t} className="rounded-2xl border border-[#D96A91]/20 bg-white p-4">
            <h2 className="mb-2 text-lg font-bold text-[#843653]">{PARTNER_TOPICS[t]}</h2>
            <ul className="list-disc space-y-1 pl-5 text-sm">{(PARTNER_CONTENT[t] ?? []).map((x) => <li key={x}>{x}</li>)}</ul>
          </section>
        ))}
        <p className="text-sm">Pour aller plus loin : <Link prefetch={false} href="/sante" className="font-semibold text-[#843653] underline">Santé essentielle</Link> · <Link prefetch={false} href="/urgences" className="font-semibold text-red-700 underline">Urgences</Link></p>
      </div>
    </div>
  );
}
