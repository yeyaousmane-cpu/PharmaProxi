import Link from "next/link";
import { Eye, History, Share2 } from "lucide-react";
import { dossierContext } from "@/lib/dossier/server";
import { DossierGate, DossierShell } from "@/components/dossier/shell";
import { ShareForm } from "@/components/passeport/share-form";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { revokeShare } from "@/app/actions/v028";
import { ACCESS_ACTIONS, SHARE_SECTIONS } from "@/lib/passeport";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Partages et accès à mon dossier" };
export const dynamic = "force-dynamic";

type Share = { id: string; reference: string; person_id: string; label: string | null; sections: string[]; expires_at: string; revoked_at: string | null; views: number; last_viewed_at: string | null; created_at: string };
type Log = { id: number; actor_kind: string; actor_label: string; action: string; detail: string | null; created_at: string };

export default async function Autorisations({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const sp = await searchParams;
  const ctx = await dossierContext(sp.p, "/ma-sante/dossier/autorisations");
  if (ctx.locked) return <DossierGate status={ctx.status} path={`/ma-sante/dossier/autorisations${sp.p ? `?p=${sp.p}` : ""}`} />;
  const { supabase, person, persons, status } = ctx;
  const [{ data: sh }, { data: lg }, { data: fo }] = await Promise.all([
    supabase.from("health_shares").select("*").order("created_at", { ascending: false }).limit(50),
    supabase.from("record_access_log").select("id, actor_kind, actor_label, action, detail, created_at").order("id", { ascending: false }).limit(100),
    supabase.from("care_follows").select("id, status").in("status", ["demande", "actif"]),
  ]);
  const shares = (sh ?? []) as Share[];
  const logs = (lg ?? []) as Log[];
  const now = Date.now();
  const state = (s: Share) => s.revoked_at ? "retire" : new Date(s.expires_at).getTime() <= now ? "expire" : "actif";
  const active = shares.filter((s) => state(s) === "actif");
  const past = shares.filter((s) => state(s) !== "actif");
  const name = (id: string) => persons.find((p) => p.id === id)?.display_name ?? "—";
  const row = (s: Share) => (
    <li key={s.id} className="rounded-xl border p-3 text-sm">
      <p className="font-semibold"><span className="font-mono" dir="ltr">{s.reference}</span>{s.label ? ` · ${s.label}` : ""} · {name(s.person_id)}</p>
      <p className="text-muted-foreground">{s.sections.map((k) => SHARE_SECTIONS[k]?.split(" (")[0] ?? k).join(", ")}</p>
      <p className="text-muted-foreground">Créé le {formatDateTime(s.created_at)} · {state(s) === "actif" ? `valable jusqu'au ${formatDateTime(s.expires_at)}` : state(s) === "retire" ? `retiré le ${formatDateTime(s.revoked_at!)}` : `expiré le ${formatDateTime(s.expires_at)}`}</p>
      <p className="flex items-center gap-1"><Eye className="size-4" aria-hidden /> {s.views === 0 ? "Jamais consulté" : `Consulté ${s.views} fois, dernière fois le ${formatDateTime(s.last_viewed_at!)}`}</p>
      {state(s) === "actif" && (
        <ActionForm action={revokeShare} className="mt-2"><input type="hidden" name="id" value={s.id} />
          <SubmitButton size="sm" variant="outline" confirm="Retirer ce partage ? Le lien et le QR code cesseront de fonctionner immédiatement.">Retirer ce partage</SubmitButton></ActionForm>
      )}
    </li>
  );
  return (
    <DossierShell persons={persons} person={person} status={status} current="/autorisations">
      <section className="space-y-3 rounded-2xl border bg-white p-4 sm:p-5">
        <h2 className="flex items-center gap-2 text-lg font-bold text-brand-deep"><Share2 className="size-5" aria-hidden /> Passeport santé : partager l&apos;essentiel</h2>
        <p className="text-sm text-muted-foreground">Créez un lien ou un QR code temporaire pour montrer à un soignant les informations que vous choisissez. Vous décidez quoi, pour combien de temps, et vous pouvez retirer le partage à tout moment.</p>
        <ShareForm personId={person.id} personName={person.is_self ? "votre dossier" : person.display_name} selfOnly={person.is_self} />
      </section>

      <section className="space-y-3 rounded-2xl border bg-white p-4 sm:p-5">
        <h2 className="text-lg font-bold text-brand-deep">Partages en cours ({active.length})</h2>
        {active.length === 0 ? <p className="text-sm text-muted-foreground">Aucun partage actif : personne d&apos;autre que vous ne peut voir votre dossier par lien.</p> : <ul className="space-y-2">{active.map(row)}</ul>}
        {(fo ?? []).length > 0 && <p className="text-sm">Un médecin suit vos mesures ou attend votre réponse : <Link prefetch={false} href="/ma-sante/suivi" className="text-primary underline">gérer mes suivis</Link>.</p>}
        {past.length > 0 && <details className="text-sm"><summary className="cursor-pointer font-semibold">Partages terminés ({past.length})</summary><ul className="mt-2 space-y-2">{past.map(row)}</ul></details>}
      </section>

      <section className="space-y-3 rounded-2xl border bg-white p-4 sm:p-5">
        <h2 className="flex items-center gap-2 text-lg font-bold text-brand-deep"><History className="size-5" aria-hidden /> Historique des accès</h2>
        <p className="text-sm text-muted-foreground">Qui a ouvert votre dossier, quand, et par quel moyen. Conservé deux ans. L&apos;équipe SantéProxi n&apos;a pas accès au contenu de votre dossier.</p>
        {logs.length === 0 ? <p className="text-sm text-muted-foreground">Aucun accès enregistré pour le moment.</p> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-sm">
            <thead><tr className="border-b text-xs text-muted-foreground"><th className="p-2 text-start">Date</th><th className="p-2 text-start">Qui</th><th className="p-2 text-start">Quoi</th><th className="p-2 text-start">Détail</th></tr></thead>
            <tbody>{logs.map((l) => (
              <tr key={l.id} className="border-b last:border-0"><td className="whitespace-nowrap p-2">{formatDateTime(l.created_at)}</td><td className="p-2">{l.actor_label}</td><td className="p-2">{ACCESS_ACTIONS[l.action] ?? l.action}</td><td className="p-2 text-muted-foreground">{l.detail ?? ""}</td></tr>))}</tbody>
          </table></div>
        )}
      </section>
    </DossierShell>
  );
}
