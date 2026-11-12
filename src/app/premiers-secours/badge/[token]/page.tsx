import Link from "next/link";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Vérification d'un badge Citoyen sauveteur formé", robots: { index: false } };
export const dynamic = "force-dynamic";

type B = { status: string; organisation: string; formation: string; date_formation: string; expiration: string | null; verifie_le: string | null; titulaire: string | null; identifiant: string } | null;

/** Page ouverte par le QR code : elle confirme le badge sans révéler de donnée personnelle. */
export default async function VerifyBadge({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createClient();
  const { data } = /^[0-9a-f]{24}$/.test(token) ? await supabase.rpc("first_aid_badge_lookup", { p_token: token }) : { data: null };
  const b = data as B;
  const valid = b?.status === "valide";
  return (
    <div className="container-page max-w-xl space-y-4 py-8">
      <div className={`space-y-2 rounded-2xl border-2 p-5 ${valid ? "border-emerald-500 bg-emerald-50" : "border-red-300 bg-red-50"}`}>
        <p className={`flex items-center gap-2 text-xl font-extrabold ${valid ? "text-emerald-900" : "text-red-900"}`}>{valid ? <ShieldCheck className="size-6" aria-hidden /> : <ShieldAlert className="size-6" aria-hidden />}
          {!b ? "Badge introuvable ou retiré" : valid ? "Badge « Citoyen sauveteur formé » valide" : "Badge expiré : un recyclage est nécessaire"}</p>
        {b && (
          <dl className="space-y-1 text-sm">
            {b.titulaire && <div><dt className="inline font-semibold">Titulaire : </dt><dd className="inline">{b.titulaire}</dd></div>}
            <div><dt className="inline font-semibold">Organisme formateur : </dt><dd className="inline">{b.organisation}</dd></div>
            <div><dt className="inline font-semibold">Formation : </dt><dd className="inline">{b.formation}, le {formatDate(b.date_formation)}</dd></div>
            {b.expiration && <div><dt className="inline font-semibold">Valable jusqu&apos;au : </dt><dd className="inline">{formatDate(b.expiration)}</dd></div>}
            {b.verifie_le && <div><dt className="inline font-semibold">Vérifié le : </dt><dd className="inline">{formatDate(b.verifie_le)}</dd></div>}
            <div><dt className="inline font-semibold">Identifiant : </dt><dd className="inline font-mono">{b.identifiant}</dd></div>
          </dl>
        )}
      </div>
      <p className="text-xs text-muted-foreground">Le badge atteste une formation validée par l&apos;organisme formateur. Ce n&apos;est ni un diplôme ni une pièce d&apos;identité. Aucune donnée personnelle n&apos;est affichée sans l&apos;accord du titulaire.</p>
      <Link prefetch={false} href="/premiers-secours/formations" className="inline-block font-semibold text-primary underline">Se former aux premiers secours</Link>
    </div>
  );
}
