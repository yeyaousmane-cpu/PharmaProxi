import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Input } from "@/components/ui/input";
import { decideDuplicate, reviewCorrection } from "@/app/actions/v036";
import { CORRECTION_KINDS } from "@/lib/national-directory";

export const metadata = { title: "Référentiel national — administration" };
export const dynamic = "force-dynamic";

type Corr = { id: string; facility_id: string; reporter_role: string; kind: string; message: string; contact: string | null; created_at: string; facility_listings: { name: string } | null };
type Dup = { a: string; a_name: string; b: string; b_name: string; region: string | null; similarity: number };

export default async function AdminReferentiel() {
  await requireRole("admin", "/admin/referentiel");
  const supabase = await createClient();
  const [c, d, s] = await Promise.all([
    supabase.from("facility_corrections").select("id, facility_id, reporter_role, kind, message, contact, created_at, facility_listings(name)").eq("status", "nouvelle").order("created_at").limit(100),
    supabase.rpc("admin_duplicate_candidates", { p_limit: 60 }),
    supabase.rpc("directory_stats"),
  ]);
  const corr = (c.data ?? []) as unknown as Corr[]; const dups = (d.data ?? []) as Dup[];
  const st = s.data as { total: number; non_publiees_a_verifier: number; geolocalises: number; verifies: number } | null;
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-brand-deep">Référentiel national des établissements</h1>
        {st && <p className="text-sm text-muted-foreground">{st.total} fiches publiées · {st.geolocalises} géolocalisées · {st.verifies} vérifiées · {st.non_publiees_a_verifier} non publiées à vérifier · <Link prefetch={false} href="/etablissements/couverture" className="underline">couverture</Link> · <Link prefetch={false} href="/admin/centres" className="underline">modifier les fiches</Link></p>}
        <p className="text-sm">Import : le référentiel (CANAM 2022, carte sanitaire du ministère, OCHA) est versionné dans <code>supabase/data/referentiel-sante-mali-2022.json</code> et importé par la fonction <code>referentiel_import</code>, qui ne remplace jamais un champ déjà renseigné et conserve chaque source.</p>
      </header>

      <section id="corrections" className="scroll-mt-24 space-y-2">
        <h2 className="text-lg font-bold text-brand-deep">Signalements et demandes de correction ({corr.length})</h2>
        {corr.length === 0 ? <p className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">Aucun signalement en attente.</p> : (
          <ul className="space-y-2">{corr.map((x) => (
            <li key={x.id} className="space-y-2 rounded-2xl border bg-white p-3 text-sm">
              <p><Link prefetch={false} href={`/etablissements/${x.facility_id}`} className="font-semibold text-primary underline">{x.facility_listings?.name}</Link> · {CORRECTION_KINDS[x.kind]} · {x.reporter_role === "etablissement" ? "par l'établissement" : "par un usager"} · {formatDateTime(x.created_at)}</p>
              <p className="whitespace-pre-wrap rounded-lg bg-muted/50 p-2">{x.message}</p>
              {x.contact && <p className="text-xs">Contact : {x.contact}</p>}
              <ActionForm action={reviewCorrection} className="flex flex-wrap items-end gap-2"><input type="hidden" name="id" value={x.id} />
                <Input name="note" maxLength={500} placeholder="Note (transmise à l'auteur)" className="h-10 min-w-0 flex-1" />
                <SubmitButton size="sm" name="decision" value="acceptee">Accepter</SubmitButton>
                <SubmitButton size="sm" variant="outline" name="decision" value="refusee">Refuser</SubmitButton>
              </ActionForm>
              <p className="text-xs text-muted-foreground">Accepter ne modifie pas la fiche (sauf « fermé ») : faites la correction depuis la fiche, avec sa source.</p>
            </li>))}</ul>)}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-bold text-brand-deep">Doublons possibles ({dups.length})</h2>
        <p className="text-sm text-muted-foreground">Noms proches dans la même région. Rien n&apos;est fusionné automatiquement : deux CSCom de villages voisins peuvent porter des noms semblables.</p>
        {dups.length === 0 ? <p className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">Aucun doublon possible en attente.</p> : (
          <ul className="space-y-2">{dups.map((x) => (
            <li key={x.a + x.b} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border bg-white p-3 text-sm">
              <span><Link prefetch={false} href={`/etablissements/${x.a}`} className="font-semibold underline">{x.a_name}</Link> ↔ <Link prefetch={false} href={`/etablissements/${x.b}`} className="font-semibold underline">{x.b_name}</Link> · {x.region} · {Math.round(x.similarity * 100)} %</span>
              <ActionForm action={decideDuplicate} className="flex gap-2"><input type="hidden" name="a" value={x.a} /><input type="hidden" name="b" value={x.b} />
                <SubmitButton size="sm" variant="outline" name="decision" value="distincts">Distincts</SubmitButton>
                <SubmitButton size="sm" name="decision" value="fusionnes" confirm="Fusionner ? La seconde fiche sera retirée de la recherche (ses sources sont conservées).">Fusionner</SubmitButton>
              </ActionForm>
            </li>))}</ul>)}
      </section>
    </div>
  );
}
