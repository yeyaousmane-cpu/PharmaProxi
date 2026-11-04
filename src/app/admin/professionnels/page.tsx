import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Field, Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { authorizePro, revokePro, setProContactStatus } from "@/app/actions/pro";
import { formatDateTime, formatPhone } from "@/lib/format";

export const metadata = { title: "Professionnels — administration" };
export const dynamic = "force-dynamic";

const KIND: Record<string, string> = { pharmacie: "Pharmacie", medecin: "Médecin", clinique: "Clinique / centre", laboratoire: "Laboratoire", autre: "Autre" };
const STATUS: Record<string, [string, string]> = { nouvelle: ["Nouvelle", "bg-amber-100 text-amber-900"], en_cours: ["En cours", "bg-blue-100 text-blue-900"], traitee: ["Traitée", "bg-emerald-100 text-emerald-900"], refusee: ["Refusée", "bg-muted"] };

export default async function AdminPros({ searchParams }: { searchParams: Promise<{ voir?: string }> }) {
  const sp = await searchParams;
  const all = sp.voir === "toutes";
  const supabase = await createClient();
  let rq = supabase.from("pro_contact_requests").select("*, regions(name)").order("created_at", { ascending: false }).limit(100);
  if (!all) rq = rq.in("status", ["nouvelle", "en_cours"]);
  const [{ data: reqs }, { data: auths }, pend] = await Promise.all([
    rq,
    supabase.from("pro_authorizations").select("user_id, kind, note, created_at, profiles!pro_authorizations_user_id_fkey(full_name)").order("created_at", { ascending: false }).limit(300),
    Promise.all([
      supabase.from("pharmacies").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("doctors").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("clinics").select("id", { count: "exact", head: true }).eq("status", "pending"),
    ]),
  ]);
  type One<T> = T | T[] | null;
  const one = <T,>(v: One<T>) => (Array.isArray(v) ? v[0] : v) ?? null;
  const [pPh, pDr, pCl] = pend.map((r) => r.count ?? 0);
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Professionnels de santé</h1>
        <p className="text-sm text-muted-foreground">Personne ne peut s&apos;inscrire seul comme professionnel. Vérifiez l&apos;autorisation d&apos;exercer (Ordre, arrêté, agrément), puis autorisez le compte SantéProxi de la personne. Elle complète alors sa fiche, que vous validez avant publication.</p>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        {[["Pharmacies à valider", pPh, "/admin/pharmacies"], ["Médecins à valider", pDr, "/admin/annuaire/medecins"], ["Établissements à valider", pCl, "/admin/annuaire/cliniques"]].map(([l, n, h]) => (
          <Link key={h as string} prefetch={false} href={h as string} className="rounded-2xl border bg-white p-4 hover:border-primary"><p className="text-sm text-muted-foreground">{l}</p><p className="text-2xl font-bold text-brand-deep">{n}</p></Link>
        ))}
      </section>

      <section className="space-y-3 rounded-2xl border bg-white p-4 sm:p-5">
        <h2 className="text-lg font-bold">Ajouter un professionnel</h2>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
          <li>La personne crée un compte SantéProxi normal avec son adresse e-mail.</li>
          <li>Vous saisissez cette adresse ci-dessous et le type de professionnel.</li>
          <li>Elle reçoit une notification et peut remplir la fiche de sa pharmacie, de sa pratique ou de son établissement.</li>
        </ol>
        <ActionForm action={authorizePro} className="grid gap-3 sm:grid-cols-[1fr_200px]" labels={{ email: "E-mail" }}>
          <Field label="E-mail du compte" htmlFor="em" required><Input id="em" name="email" type="email" required /></Field>
          <Field label="Type" htmlFor="kd" required><Select id="kd" name="kind" defaultValue="pharmacie"><option value="pharmacie">Pharmacie</option><option value="medecin">Médecin</option><option value="clinique">Clinique / centre</option></Select></Field>
          <Field label="Vérification faite (référence, source)" htmlFor="nt" className="sm:col-span-2"><Input id="nt" name="note" maxLength={300} placeholder="ex. Ordre des pharmaciens, n° 1234, vérifié le 4 nov." /></Field>
          <div className="sm:col-span-2"><SubmitButton>Autoriser</SubmitButton></div>
        </ActionForm>
        <p className="text-sm">Laboratoire : rattachez directement le compte au laboratoire de l&apos;annuaire depuis <Link prefetch={false} href="/admin/laboratoires" className="text-primary underline">Laboratoires</Link>. Pharmacie, médecin ou établissement sans compte : ajoutez la fiche dans <Link prefetch={false} href="/admin/pharmacies-non-inscrites" className="text-primary underline">Pharmacies non inscrites</Link> ou <Link prefetch={false} href="/admin/annuaire" className="text-primary underline">Annuaire médical</Link>.</p>
      </section>

      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold">Demandes reçues</h2>
          <Link prefetch={false} href={all ? "/admin/professionnels" : "/admin/professionnels?voir=toutes"} className="text-sm text-primary underline">{all ? "Voir seulement les demandes à traiter" : "Voir toutes les demandes"}</Link>
        </div>
        {(reqs ?? []).length === 0 && <p className="rounded-xl border bg-white p-4 text-sm text-muted-foreground">Aucune demande à traiter.</p>}
        <ul className="space-y-2">{(reqs ?? []).map((r) => (
          <li key={r.id} className="space-y-2 rounded-xl border bg-white p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2"><strong>{r.structure}</strong><Badge className="bg-brand-sky text-brand-blue">{KIND[r.kind]}</Badge><Badge className={STATUS[r.status][1]}>{STATUS[r.status][0]}</Badge><span className="text-xs text-muted-foreground">{formatDateTime(r.created_at)}</span></div>
            <p>{r.full_name} · {formatPhone(r.phone)}{r.email ? ` · ${r.email}` : ""}{one(r.regions as One<{ name: string }>)?.name ? ` · ${one(r.regions as One<{ name: string }>)!.name}` : ""}</p>
            <p>Autorisation déclarée : <strong>{r.authorization_ref ?? "non indiquée"}</strong></p>
            {r.message && <p className="text-muted-foreground">{r.message}</p>}
            {r.admin_note && <p className="text-xs">Note : {r.admin_note}</p>}
            <div className="flex flex-wrap items-end gap-2 border-t pt-2">
              {["pharmacie", "medecin", "clinique"].includes(r.kind) && r.email && r.status !== "traitee" && (
                <ActionForm action={authorizePro} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="email" value={r.email} /><input type="hidden" name="kind" value={r.kind} /><input type="hidden" name="request_id" value={r.id} />
                  <label className="text-xs">Vérification<Input name="note" maxLength={300} defaultValue={r.authorization_ref ?? ""} className="mt-1 h-9 w-56" /></label>
                  <SubmitButton size="sm">Autoriser ce compte</SubmitButton>
                </ActionForm>
              )}
              <ActionForm action={setProContactStatus} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="id" value={r.id} />
                <label className="text-xs">Statut<Select name="status" defaultValue={r.status === "nouvelle" ? "en_cours" : r.status} className="mt-1 h-9 w-36"><option value="en_cours">En cours</option><option value="traitee">Traitée</option><option value="refusee">Refusée</option><option value="nouvelle">Nouvelle</option></Select></label>
                <label className="text-xs">Note<Input name="note" maxLength={500} className="mt-1 h-9 w-48" /></label>
                <SubmitButton size="sm" variant="outline">Mettre à jour</SubmitButton>
              </ActionForm>
            </div>
          </li>))}</ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-bold">Comptes autorisés</h2>
        <ul className="divide-y rounded-2xl border bg-white text-sm">{(auths ?? []).map((a) => (
          <li key={`${a.user_id}-${a.kind}`} className="flex flex-wrap items-center justify-between gap-2 p-3">
            <span><strong>{one(a.profiles as One<{ full_name: string | null }>)?.full_name ?? "—"}</strong> · {KIND[a.kind]} · {formatDateTime(a.created_at)}{a.note ? ` · ${a.note}` : ""}</span>
            <ActionForm action={revokePro}><input type="hidden" name="user_id" value={a.user_id} /><input type="hidden" name="kind" value={a.kind} /><SubmitButton size="sm" variant="ghost" confirm="Retirer cette autorisation ? Les fiches déjà créées ne sont pas supprimées.">Retirer</SubmitButton></ActionForm>
          </li>))}
          {(auths ?? []).length === 0 && <li className="p-3 text-muted-foreground">Aucun compte autorisé.</li>}
        </ul>
      </section>
    </div>
  );
}
