import Link from "next/link";
import { Droplet, ShieldAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import { PrintButton } from "@/components/blood/print-button";

export const metadata = { title: "Certificat de reconnaissance — don de sang", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type V = { status: "ok" | "introuvable"; reference?: string; validated_count?: number; period_from?: string; period_to?: string; holder_name?: string | null; issued_at?: string };

/** Certificat imprimable et vérifiable publiquement par sa référence (aucune donnée médicale). */
export default async function Certificate({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const supabase = await createClient();
  const v = (/^CDS-[0-9A-Za-z]{10}$/.test(ref) ? (await supabase.rpc("verify_blood_certificate", { p_ref: ref })).data : { status: "introuvable" }) as V;
  if (v.status !== "ok") {
    return (
      <div className="container-page max-w-lg py-8"><section className="space-y-2 rounded-2xl border bg-white p-6 text-center">
        <ShieldAlert className="mx-auto size-10 text-amber-600" aria-hidden />
        <h1 className="text-xl font-bold text-brand-deep">Certificat introuvable</h1>
        <p className="text-sm text-muted-foreground">Aucun certificat ne porte cette référence. Vérifiez la saisie.</p>
        <Link prefetch={false} href="/don-de-sang" className="text-sm text-primary underline">Don de sang</Link>
      </section></div>
    );
  }
  return (
    <div className="container-page max-w-3xl space-y-4 py-6">
      <div className="flex justify-end print:hidden"><PrintButton /></div>
      <article className="relative overflow-hidden rounded-3xl border-4 border-double border-red-700 bg-white p-8 text-center sm:p-12">
        <Droplet className="mx-auto size-12 fill-red-600 text-red-600" aria-hidden />
        <p className="mt-2 text-sm font-semibold uppercase tracking-[0.3em] text-red-700">SantéProxi Solidaire</p>
        <h1 className="mt-2 text-3xl font-extrabold text-brand-deep">Certificat de reconnaissance</h1>
        <p className="mt-6 text-lg">Ce certificat est remis à</p>
        <p className="mt-1 text-2xl font-bold">{v.holder_name ?? "un donneur volontaire de sang"}</p>
        <p className="mt-6 text-lg">en reconnaissance de <strong>{v.validated_count} don{v.validated_count! > 1 ? "s" : ""} de sang validé{v.validated_count! > 1 ? "s" : ""}</strong></p>
        <p className="text-muted-foreground">{v.period_from === v.period_to ? `le ${formatDate(v.period_from!)}` : `entre le ${formatDate(v.period_from!)} et le ${formatDate(v.period_to!)}`}</p>
        <p className="mt-6 italic">« Donner. Mobiliser. Sauver. » Merci pour ce geste gratuit et volontaire.</p>
        <div className="mt-8 grid gap-2 text-sm sm:grid-cols-2">
          <p>Émis par : <strong>SantéProxi</strong>, le {formatDate(v.issued_at!)}</p>
          <p>Identifiant de vérification : <strong className="font-mono" dir="ltr">{v.reference}</strong></p>
        </div>
        <p className="mt-6 text-xs text-muted-foreground">Vérifiable sur santeproxi.vercel.app/don-de-sang/certificat/{v.reference}. Les dons sont comptés après validation par le centre de collecte. Ce document est une reconnaissance symbolique : ce n&apos;est pas un document officiel du CNTS et il n&apos;a aucune valeur marchande.</p>
      </article>
    </div>
  );
}
