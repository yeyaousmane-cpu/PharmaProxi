import Link from "next/link";
import { Siren, ShieldCheck, TriangleAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";
import { getGeo } from "@/lib/geo";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { BloodNav } from "@/components/blood/blood-nav";
import { createBloodRequest } from "@/app/actions/donor";
import { BLOOD_GROUPS, COMPAT_NOTICE, PRODUCTS, REQUESTER_KINDS, URGENCY } from "@/lib/donor";
import { RequestCard, type BloodRequest } from "@/components/blood/request-card";

export const metadata = { title: "SOS Besoin de sang", description: "Besoins de sang vérifiés par le CNTS et demande de mobilisation de donneurs volontaires." };
export const dynamic = "force-dynamic";

const COLS = "id, reference, requester_kind, blood_group, product, units, facility_name, region_id, place_detail, needed_at, urgency, status, verified_at, expires_at, created_at, regions(name)";

export default async function Sos({ searchParams }: { searchParams: Promise<{ groupe?: string; region?: string }> }) {
  const sp = await searchParams;
  const session = await getSession();
  const supabase = await createClient();
  const geo = await getGeo();
  let pub = supabase.from("blood_requests").select(COLS).in("status", ["verifiee", "mobilisation", "prise_en_charge"]).gt("expires_at", new Date().toISOString())
    .order("urgency").order("needed_at").limit(50);
  if (BLOOD_GROUPS.includes(sp.groupe as (typeof BLOOD_GROUPS)[number])) pub = pub.eq("blood_group", sp.groupe!);
  if (sp.region && /^[0-9a-f-]{36}$/.test(sp.region)) pub = pub.eq("region_id", sp.region);
  const [{ data: list }, validator, mine] = await Promise.all([
    pub,
    session ? supabase.rpc("is_blood_validator").then((r) => !!r.data) : Promise.resolve(false),
    session ? supabase.rpc("blood_my_requests").then(async (r) => { const ids = (r.data ?? []) as string[]; if (!ids.length) return [] as BloodRequest[];
      const { data } = await supabase.from("blood_requests").select(COLS).in("id", ids).order("created_at", { ascending: false }); return (data ?? []) as unknown as BloodRequest[]; }) : Promise.resolve([] as BloodRequest[]),
  ]);
  const rows = (list ?? []) as unknown as BloodRequest[];
  const order: Record<string, number> = { critique: 0, elevee: 1, programme: 2 };
  rows.sort((a, b) => order[a.urgency] - order[b.urgency] || a.needed_at.localeCompare(b.needed_at));
  return (
    <div className="container-page max-w-4xl space-y-5 py-6">
      <BloodNav current="/don-de-sang/sos" validator={validator} />
      <header className="space-y-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-brand-deep"><Siren className="size-7 text-red-600" aria-hidden /> SOS Besoin de sang</h1>
        <p className="text-muted-foreground">Les besoins affichés ici ont été vérifiés par le CNTS ou l&apos;administration auprès de l&apos;établissement. Aucune information médicale sur le patient n&apos;est publiée, et les coordonnées des familles ne sont visibles que par le CNTS.</p>
      </header>
      <p className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"><TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>Le don se fait toujours dans un centre de transfusion ou un site de collecte, jamais de personne à personne. Ne versez jamais d&apos;argent pour du sang ou pour un donneur : signalez toute demande de paiement. {COMPAT_NOTICE}</span></p>

      <form method="get" className="flex flex-wrap items-end gap-2 rounded-2xl border bg-white p-3 text-sm">
        <label>Groupe<Select name="groupe" defaultValue={sp.groupe ?? ""} className="mt-1 h-10 w-28"><option value="">Tous</option>{BLOOD_GROUPS.map((g) => <option key={g}>{g}</option>)}</Select></label>
        <label>Région<Select name="region" defaultValue={sp.region ?? ""} className="mt-1 h-10 w-48"><option value="">Toutes</option>{geo.regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></label>
        <button type="submit" className="h-10 rounded-lg bg-[#052D1E] px-4 font-semibold text-white">Filtrer</button>
      </form>

      <section aria-labelledby="besoins" className="space-y-2">
        <h2 id="besoins" className="text-lg font-bold text-brand-deep">Besoins vérifiés en cours</h2>
        {rows.length === 0 ? <p className="rounded-2xl border border-dashed p-5 text-sm text-muted-foreground">Aucun besoin vérifié en cours{sp.groupe || sp.region ? " pour ces critères" : ""}. Les centres de transfusion ont besoin de dons réguliers : vous pouvez <Link prefetch={false} href="/don-de-sang/rendez-vous" className="font-semibold text-primary underline">prendre rendez-vous</Link>.</p> : (
          <ul className="grid gap-3 sm:grid-cols-2">{rows.map((r) => <RequestCard key={r.id} r={r} />)}</ul>
        )}
      </section>

      {mine.length > 0 && (
        <section aria-labelledby="mes" className="space-y-2">
          <h2 id="mes" className="text-lg font-bold text-brand-deep">Mes demandes</h2>
          <ul className="grid gap-3 sm:grid-cols-2">{mine.map((r) => <RequestCard key={r.id} r={r} />)}</ul>
        </section>
      )}

      <section aria-labelledby="demander" className="space-y-3 rounded-2xl border bg-white p-4">
        <h2 id="demander" className="text-lg font-bold text-brand-deep">Signaler un besoin de sang</h2>
        <p className="flex items-start gap-2 rounded-xl bg-brand-mint p-3 text-xs text-brand-deep"><ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />Votre demande n&apos;est pas publiée tout de suite : le CNTS la vérifie d&apos;abord auprès de l&apos;établissement. N&apos;indiquez ni le nom ni la maladie du patient. Votre numéro reste privé (CNTS et administration).</p>
        {!session ? <p className="text-sm"><Link prefetch={false} href="/connexion?suite=%2Fdon-de-sang%2Fsos" className="font-semibold text-primary underline">Connectez-vous</Link> pour signaler un besoin.</p> : (
          <ActionForm action={createBloodRequest} className="grid gap-3 sm:grid-cols-2">
            <Field label="Vous êtes" htmlFor="rk" required><Select id="rk" name="requester_kind" required defaultValue="famille">{Object.entries(REQUESTER_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
            <Field label="Groupe sanguin prescrit" htmlFor="bg" required hint="Tel qu'indiqué par l'équipe soignante."><Select id="bg" name="blood_group" required defaultValue=""><option value="" disabled>Choisir</option>{BLOOD_GROUPS.map((g) => <option key={g}>{g}</option>)}</Select></Field>
            <Field label="Produit demandé" htmlFor="pr"><Select id="pr" name="product" defaultValue="non_precise">{Object.entries(PRODUCTS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
            <Field label="Nombre de poches" htmlFor="un"><Input id="un" name="units" type="number" min={1} max={20} defaultValue={1} /></Field>
            <Field label="Établissement de santé" htmlFor="fn" required><Input id="fn" name="facility_name" required minLength={3} maxLength={160} placeholder="ex. CHU, CSRéf, clinique…" /></Field>
            <Field label="Service ou précision du lieu" htmlFor="pd"><Input id="pd" name="place_detail" maxLength={200} placeholder="ex. maternité" /></Field>
            <Field label="Région" htmlFor="rg"><Select id="rg" name="region_id" defaultValue=""><option value="">Non précisée</option>{geo.regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></Field>
            <Field label="Nécessaire pour (heure de Bamako)" htmlFor="na" required><Input id="na" name="needed_at" type="datetime-local" required /></Field>
            <Field label="Urgence" htmlFor="ur" required><Select id="ur" name="urgency" required defaultValue="elevee">{Object.entries(URGENCY).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
            <Field label="Nom de la personne à contacter" htmlFor="cn" required><Input id="cn" name="contact_name" required minLength={2} maxLength={120} /></Field>
            <Field label="Téléphone (privé)" htmlFor="cp" required><Input id="cp" name="contact_phone" type="tel" required inputMode="tel" placeholder="+223 …" /></Field>
            <Field label="Informations utiles pour le CNTS (privé)" htmlFor="ds" className="sm:col-span-2" hint="Nom du médecin ou du service à appeler pour la vérification. Pas d'information médicale."><Textarea id="ds" name="description" maxLength={500} rows={2} /></Field>
            <label className="flex items-start gap-2 rounded-xl bg-muted/50 p-3 text-sm sm:col-span-2"><input type="checkbox" name="accord" required className="mt-1 size-4" />
              <span>Je confirme que ce besoin est réel et a été prescrit par un professionnel de santé, et j&apos;accepte que le CNTS m&apos;appelle pour le vérifier. Une fausse demande peut être signalée aux autorités.</span></label>
            <div className="sm:col-span-2"><SubmitButton>Transmettre au CNTS pour vérification</SubmitButton></div>
          </ActionForm>
        )}
      </section>
    </div>
  );
}
