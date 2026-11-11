import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { enforceMfa } from "@/lib/mfa";
import { formatDate } from "@/lib/format";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Input, Select } from "@/components/ui/input";
import { decideDonation, setBadgeThreshold } from "@/app/actions/donor";
import { BLOOD_GROUPS, DONATION_TYPES } from "@/lib/donor";

export const metadata = { title: "Valider les dons de sang", robots: { index: false } };
export const dynamic = "force-dynamic";

type P = { id: string; reference: string; donor_code: string; donor_name: string | null; declared_group: string | null; group_verified: boolean; donated_on: string; center: string; donation_type: string; campaign: string | null; created_at: string };

/** Espace réservé au CNTS (membres désignés) et à l'administration : validation des dons déclarés. */
export default async function Validation() {
  await requireUser("/don-de-sang/validation");
  const supabase = await createClient();
  const { data: ok } = await supabase.rpc("is_blood_validator");
  if (!ok) {
    return (
      <div className="container-page max-w-xl py-10"><section className="space-y-2 rounded-2xl border bg-white p-6 text-center">
        <h1 className="text-xl font-bold text-brand-deep">Accès refusé</h1>
        <p className="text-sm text-muted-foreground">La validation des dons est réservée aux membres désignés du CNTS et à l&apos;administration de SantéProxi.</p>
        <Link prefetch={false} href="/don-de-sang/mon-espace" className="text-sm text-primary underline">Mon espace donneur</Link>
      </section></div>
    );
  }
  await enforceMfa("/don-de-sang/validation", true);
  const [{ data }, { data: isAdmin }, { data: levels }] = await Promise.all([
    supabase.rpc("blood_pending_donations"), supabase.rpc("is_admin"), supabase.from("blood_badge_levels").select("code, label, threshold").order("threshold"),
  ]);
  const rows = (data ?? []) as P[];
  return (
    <div className="container-page max-w-5xl space-y-5 py-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-brand-deep">Valider les dons de sang</h1>
        <p className="text-sm text-muted-foreground">Vérifiez chaque don déclaré dans vos registres de prélèvement. Un don n&apos;est compté (distinctions, certificats, statistiques) qu&apos;une fois validé. Le donneur est prévenu de chaque décision.</p>
      </header>
      <p className="flex items-start gap-2 rounded-xl bg-brand-mint p-3 text-xs text-brand-deep"><ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />Données personnelles : à utiliser uniquement pour la validation. Chaque décision est enregistrée dans le journal d&apos;audit. Confirmer le groupe sanguin n&apos;est utile que si le résultat de qualification du don est disponible.</p>
      {rows.length === 0 ? <p className="rounded-2xl border border-dashed p-5 text-sm text-muted-foreground">Aucun don en attente de validation.</p> : (
        <ul className="space-y-3">{rows.map((r) => (
          <li key={r.id} className="rounded-2xl border bg-white p-4 text-sm">
            <div className="flex flex-wrap justify-between gap-2">
              <p className="font-semibold">{r.donor_name ?? "Donneur"} · <span className="font-mono" dir="ltr">{r.donor_code}</span></p>
              <p className="text-xs text-muted-foreground" dir="ltr">{r.reference} · déclaré le {formatDate(r.created_at)}</p>
            </div>
            <p>Don du <strong>{formatDate(r.donated_on)}</strong> · {DONATION_TYPES[r.donation_type]} · {r.center}{r.campaign ? ` · collecte « ${r.campaign} »` : ""}</p>
            <p className="text-xs">Groupe déclaré : {r.declared_group ?? "non renseigné"}{r.group_verified ? " (déjà confirmé)" : ""}</p>
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              <ActionForm action={decideDonation} className="flex flex-wrap items-end gap-2 rounded-xl bg-emerald-50 p-2">
                <input type="hidden" name="id" value={r.id} /><input type="hidden" name="decision" value="valide" />
                <label className="text-xs">Confirmer le groupe (facultatif)<Select name="confirm_group" defaultValue="" className="mt-1 h-10"><option value="">Ne pas confirmer</option>{BLOOD_GROUPS.map((g) => <option key={g}>{g}</option>)}</Select></label>
                <SubmitButton size="sm">Valider le don</SubmitButton>
              </ActionForm>
              <ActionForm action={decideDonation} className="flex flex-wrap items-end gap-2 rounded-xl bg-red-50 p-2">
                <input type="hidden" name="id" value={r.id} /><input type="hidden" name="decision" value="refuse" />
                <label className="min-w-0 flex-1 text-xs">Motif (transmis au donneur)<Input name="note" maxLength={300} required minLength={5} className="mt-1 h-10" placeholder="ex. aucune trace de ce prélèvement" /></label>
                <SubmitButton size="sm" variant="outline">Refuser</SubmitButton>
              </ActionForm>
            </div>
          </li>))}</ul>
      )}
      {isAdmin && (
        <section className="space-y-2 rounded-2xl border bg-white p-4">
          <h2 className="font-bold text-brand-deep">Paliers des distinctions (administration)</h2>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{((levels ?? []) as { code: string; label: string; threshold: number }[]).map((l) => (
            <li key={l.code}><ActionForm action={setBadgeThreshold} className="flex items-end gap-2 text-sm"><input type="hidden" name="code" value={l.code} />
              <label className="flex-1">{l.label}<Input name="threshold" type="number" min={1} max={500} defaultValue={l.threshold} className="mt-1 h-10" /></label>
              <SubmitButton size="sm" variant="outline">OK</SubmitButton></ActionForm></li>))}</ul>
        </section>
      )}
    </div>
  );
}
