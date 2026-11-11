import Link from "next/link";
import { redirect } from "next/navigation";
import { BadgeCheck, Droplet, ShieldAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { CARD_NOTICE } from "@/lib/donor";

export const metadata = { title: "Vérification d'une carte de donneur", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Lookup = { status: "ok" | "invalide" | "connexion"; full_access?: boolean; donor_code?: string; validated_count?: number; badge?: { label: string } | null;
  member_since?: string; name?: string | null; blood_group?: string | null; group_verified?: boolean; last_donation?: string | null };

/** Page ouverte par le QR code de la carte : connexion exigée, informations selon les droits de la personne qui consulte. */
export default async function CardCheck({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f]{32}$/.test(token)) return <Invalid />;
  if (!(await getSession())) redirect(`/connexion?suite=${encodeURIComponent(`/don-de-sang/carte/${token}`)}`);
  const supabase = await createClient();
  const { data } = await supabase.rpc("donor_card_lookup", { p_token: token });
  const r = (data ?? { status: "invalide" }) as Lookup;
  if (r.status !== "ok") return <Invalid />;
  return (
    <div className="container-page max-w-lg py-8">
      <section className="space-y-3 rounded-2xl border bg-white p-6">
        <p className="flex items-center gap-2 font-bold text-emerald-800"><BadgeCheck className="size-6" aria-hidden /> Carte de donneur authentique</p>
        <h1 className="flex items-center gap-2 text-xl font-bold text-brand-deep"><Droplet className="size-6 fill-red-100 text-red-600" aria-hidden />{r.name ?? "Donneur volontaire (nom masqué)"}</h1>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div><dt className="text-muted-foreground">Identifiant</dt><dd className="font-mono font-semibold" dir="ltr">{r.donor_code}</dd></div>
          <div><dt className="text-muted-foreground">Dons validés</dt><dd className="text-lg font-bold">{r.validated_count}</dd></div>
          <div><dt className="text-muted-foreground">Distinction</dt><dd className="font-semibold">{r.badge?.label ?? "—"}</dd></div>
          <div><dt className="text-muted-foreground">Membre depuis</dt><dd>{r.member_since ? formatDate(r.member_since) : "—"}</dd></div>
          {r.last_donation && <div><dt className="text-muted-foreground">Dernier don validé</dt><dd>{formatDate(r.last_donation)}</dd></div>}
          {r.full_access && <div><dt className="text-muted-foreground">Groupe sanguin</dt><dd className="font-bold">{r.blood_group ?? "Non confirmé par un centre"}</dd></div>}
        </dl>
        {!r.full_access && <p className="rounded-xl bg-muted/50 p-3 text-xs">Le groupe sanguin et les données de santé ne sont jamais affichés ici. Seuls le titulaire et le CNTS y ont accès. Cette consultation est enregistrée.</p>}
        <p className="text-xs text-muted-foreground">{CARD_NOTICE} Le groupe indiqué ne remplace en aucun cas les examens réalisés par le centre de transfusion.</p>
      </section>
    </div>
  );
}

function Invalid() {
  return (
    <div className="container-page max-w-lg py-8">
      <section className="space-y-2 rounded-2xl border bg-white p-6 text-center">
        <ShieldAlert className="mx-auto size-10 text-amber-600" aria-hidden />
        <h1 className="text-xl font-bold text-brand-deep">Carte introuvable</h1>
        <p className="text-sm text-muted-foreground">Ce QR code n&apos;est pas valide ou a été remplacé par son titulaire.</p>
        <Link prefetch={false} href="/don-de-sang" className="inline-block text-sm text-primary underline">Don de sang</Link>
      </section>
    </div>
  );
}
