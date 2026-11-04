import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getGeo } from "@/lib/geo";
import { ReportForm } from "@/components/signaler/report-form";
import { AudioGuide } from "@/components/audio/audio-guide";

export const metadata = { title: "Signaler un médicament suspect ou un effet indésirable", description: "Boîte douteuse, prix anormal, médicament vendu dans la rue ou mauvaise réaction : signalez-le aux autorités de santé." };
export const dynamic = "force-dynamic";

export default async function Signaler({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const sp = await searchParams;
  await requireUser("/signaler");
  const geo = await getGeo();
  return (
    <div className="container-page max-w-3xl space-y-5 py-6">
      <header className="space-y-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-brand-deep"><ShieldAlert className="size-7 text-red-600" aria-hidden /> Signaler un médicament</h1>
        <p className="text-muted-foreground">Un doute sur un médicament, ou une mauvaise réaction après l&apos;avoir pris ? Votre signalement aide les autorités à repérer les faux médicaments et les produits dangereux. Il est transmis aux autorités de santé, <strong>jamais publié</strong>.</p>
        <AudioGuide target="signaler" />
      </header>
      <section className="rounded-2xl border bg-white p-4 sm:p-5"><ReportForm regions={geo.regions} initialKind={sp.type === "effet" ? "effet" : "suspect"} /></section>
      <p className="text-sm"><Link prefetch={false} href="/signaler/mes-signalements" className="text-primary underline">Mes signalements</Link> · Gardez la boîte et la notice : les autorités pourront vous les demander. Pour un avis sur votre traitement, parlez à votre pharmacien.</p>
    </div>
  );
}
