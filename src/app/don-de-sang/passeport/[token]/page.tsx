import Link from "next/link";
import { Award, Droplet, ShieldAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Passeport solidaire — SantéProxi", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
type P = { status: string; donor_code?: string; member_since?: string; name?: string | null; validated_count?: number; badges?: { label: string; threshold: number }[]; by_year?: Record<string, number>; campaigns?: number; certificates?: number };

/** Version publique limitée du passeport solidaire (activée par son titulaire). Aucune donnée médicale. */
export default async function PublicPassport({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createClient();
  const v = (/^[0-9a-f]{32}$/.test(token) ? (await supabase.rpc("passport_public", { p_token: token })).data : { status: "invalide" }) as P;
  if (v.status !== "ok") return (
    <div className="container-page max-w-lg py-10"><section className="space-y-2 rounded-2xl border bg-white p-6 text-center">
      <ShieldAlert className="mx-auto size-10 text-amber-600" aria-hidden /><h1 className="text-xl font-bold text-brand-deep">Passeport introuvable</h1>
      <p className="text-sm text-muted-foreground">Ce lien n&apos;existe pas, ou son titulaire a désactivé la version publique.</p>
      <Link prefetch={false} href="/don-de-sang" className="text-sm text-primary underline">Don de sang</Link></section></div>);
  const years = Object.keys(v.by_year ?? {}).sort();
  return (
    <div className="container-page max-w-lg space-y-4 py-8">
      <section className="space-y-3 rounded-3xl bg-gradient-to-br from-[#7f1d1d] via-[#b91c1c] to-[#052D1E] p-6 text-white">
        <p className="text-xs font-semibold uppercase tracking-widest text-white/80">Passeport solidaire – SantéProxi</p>
        <h1 className="flex items-center gap-2 text-2xl font-extrabold"><Droplet className="size-6 fill-white" aria-hidden />{v.name ?? "Donneur volontaire"}</h1>
        <p className="text-sm text-white/90">Identifiant <span className="font-mono">{v.donor_code}</span> · engagé depuis le {formatDate(v.member_since!)}</p>
        <p className="text-4xl font-black">{v.validated_count} <span className="text-base font-semibold">don{v.validated_count! > 1 ? "s" : ""} de sang validé{v.validated_count! > 1 ? "s" : ""}</span></p>
      </section>
      {years.length > 0 && <p className="text-sm">Par année : {years.map((y) => `${y} : ${v.by_year![y]}`).join(" · ")}</p>}
      {(v.badges ?? []).length > 0 && <p className="flex flex-wrap items-center gap-2 text-sm"><Award className="size-4 text-red-600" aria-hidden />{v.badges!.map((b) => <span key={b.label} className="rounded-full bg-red-100 px-2 py-0.5 font-semibold text-red-900">{b.label}</span>)}</p>}
      <p className="text-sm">{v.campaigns ? `${v.campaigns} collecte${v.campaigns > 1 ? "s" : ""} avec don validé · ` : ""}{v.certificates ? `${v.certificates} certificat${v.certificates > 1 ? "s" : ""} de reconnaissance` : ""}</p>
      <p className="text-xs text-muted-foreground">Les dons sont comptés après validation par le centre de collecte. Ce passeport n&apos;est ni un document médical, ni une pièce d&apos;identité officielle, ni un document du CNTS.</p>
    </div>
  );
}
