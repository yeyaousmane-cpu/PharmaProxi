import { createClient } from "@/lib/supabase/server";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Field, Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { addFocus, removeFocus } from "@/app/actions/v023";
import { saveFacilityDetails, setFacilityReliability } from "@/app/actions/v033";
import { Textarea } from "@/components/ui/input";
import { FACILITY_KINDS, OWNERSHIP, RELIABILITY } from "@/lib/orientation";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Centres spécialisés — administration" };
export const dynamic = "force-dynamic";

export default async function AdminCentres({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().replace(/[%_,()]/g, "").slice(0, 60);
  const supabase = await createClient();
  const [{ data: focus }, { data: links }, clinics, facilities, { data: fiches }] = await Promise.all([
    supabase.from("care_focus").select("code, label").order("sort"),
    supabase.from("facility_focus").select("id, focus_code, source, verified_at, clinics(name), facility_listings(name)").order("created_at", { ascending: false }).limit(300),
    q.length >= 2 ? supabase.from("clinics").select("id, name, public_code").eq("status", "verified").or(`name.ilike.%${q}%,public_code.ilike.%${q}%`).limit(15) : Promise.resolve({ data: [] as { id: string; name: string; public_code: string }[] }),
    q.length >= 2 ? supabase.from("facility_listings").select("id, name, public_code").eq("is_published", true).or(`name.ilike.%${q}%,public_code.ilike.%${q}%`).limit(15) : Promise.resolve({ data: [] as { id: string; name: string; public_code: string }[] }),
    supabase.from("facility_listings").select("id, name, kind, ownership, quarter, health_district, address, phone, phone2, email, website, hours, access_conditions, latitude, longitude, reliability, verified_at, source, source_url, to_verify, is_reference, reference_source, is_published, regions(name)")
      .in("kind", ["chu", "hopital", "centre_specialise", "clinique", "csref", "cscom"]).order("reliability").order("name").limit(300),
  ]);
  type Fiche = { id: string; name: string; kind: string; ownership: string | null; quarter: string | null; health_district: string | null; address: string | null; phone: string | null; phone2: string | null;
    email: string | null; website: string | null; hours: string | null; access_conditions: string | null; latitude: number | null; longitude: number | null; reliability: string; verified_at: string | null;
    source: string; source_url: string | null; to_verify: string | null; is_reference: boolean; reference_source: string | null; is_published: boolean; regions: { name: string } | null };
  type One<T> = T | T[] | null;
  const one = <T,>(v: One<T>) => (Array.isArray(v) ? v[0] : v) ?? null;
  const label = Object.fromEntries((focus ?? []).map((f) => [f.code, f.label]));
  const candidates = [...(clinics.data ?? []).map((c) => ({ v: `clinic:${c.id}`, l: `${c.name} (${c.public_code}) — clinique` })), ...(facilities.data ?? []).map((f) => ({ v: `facility:${f.id}`, l: `${f.name} (${f.public_code})` }))];
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Centres spécialisés</h1>
      <p className="text-sm text-muted-foreground">Indiquez quelles structures prennent en charge chaque besoin. N&apos;ajoutez une spécialité qu&apos;après l&apos;avoir vérifiée (appel, site officiel, liste du ministère) et notez la source : elle est affichée au public.</p>
      <section className="space-y-3 rounded-2xl border bg-white p-4">
        <form method="get" className="flex flex-wrap items-end gap-2">
          <label className="text-sm">Chercher une structure (nom ou identifiant SP-…)<Input name="q" defaultValue={q} className="mt-1 h-10 w-72" /></label>
          <Button type="submit" size="sm">Chercher</Button>
        </form>
        {q.length >= 2 && (candidates.length === 0 ? <p className="text-sm text-muted-foreground">Aucune structure trouvée.</p> : (
          <ActionForm action={addFocus} className="grid gap-3 sm:grid-cols-2" labels={{ source: "Source" }}>
            <Field label="Structure" htmlFor="tg"><Select id="tg" name="target">{candidates.map((c) => <option key={c.v} value={c.v}>{c.l}</option>)}</Select></Field>
            <Field label="Besoin pris en charge" htmlFor="fc"><Select id="fc" name="focus_code">{(focus ?? []).map((f) => <option key={f.code} value={f.code}>{f.label}</option>)}</Select></Field>
            <Field label="Statut" htmlFor="st"><Select id="st" name="status" defaultValue="a_confirmer"><option value="a_confirmer">À confirmer</option><option value="confirme">Confirmé par une source</option></Select></Field>
            <Field label="Précision affichée (service)" htmlFor="dt"><Input id="dt" name="detail" maxLength={200} placeholder="ex. Hémodialyse, du lundi au samedi" /></Field>
            <Field label="Source de l'information" htmlFor="so" required><Input id="so" name="source" maxLength={200} required placeholder="ex. confirmé par téléphone avec le secrétariat le 5 nov. 2026" /></Field>
            <Field label="Lien de la source (facultatif)" htmlFor="su"><Input id="su" name="source_url" type="url" maxLength={300} placeholder="https://…" /></Field>
            <div className="sm:col-span-2"><SubmitButton>Ajouter</SubmitButton></div>
          </ActionForm>
        ))}
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-bold">Fiches de l&apos;annuaire d&apos;orientation ({(fiches ?? []).length})</h2>
        <p className="text-sm text-muted-foreground">« Vérifié » exige une vérification réelle (appel, site officiel, document) décrite en une phrase ; elle est enregistrée à votre nom et datée. Toute modification d&apos;une fiche vérifiée la repasse « à confirmer ». Ne saisissez jamais une position GPS approximative.</p>
        <ul className="space-y-2">{((fiches ?? []) as unknown as Fiche[]).map((f) => (
          <li key={f.id} className="rounded-2xl border bg-white p-3 text-sm">
            <details>
              <summary className="cursor-pointer"><strong>{f.name}</strong> · {FACILITY_KINDS[f.kind] ?? f.kind} · {f.regions?.name ?? "—"} · <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${RELIABILITY[f.reliability].className}`}>{RELIABILITY[f.reliability].label}</span>{!f.is_published ? " · non publiée" : ""}{f.to_verify ? <span className="block text-xs text-muted-foreground">À vérifier : {f.to_verify}</span> : null}</summary>
              <div className="mt-3 grid gap-4 lg:grid-cols-[2fr_1fr]">
                <ActionForm action={saveFacilityDetails} className="grid gap-2 sm:grid-cols-2">
                  <input type="hidden" name="id" value={f.id} />
                  <Field label="Type" htmlFor={`k-${f.id}`}><Select id={`k-${f.id}`} name="kind" defaultValue={f.kind}>{Object.entries(FACILITY_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
                  <Field label="Statut juridique" htmlFor={`o-${f.id}`}><Select id={`o-${f.id}`} name="ownership" defaultValue={f.ownership ?? ""}><option value="">—</option>{Object.entries(OWNERSHIP).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
                  <Field label="Quartier" htmlFor={`q-${f.id}`}><Input id={`q-${f.id}`} name="quarter" defaultValue={f.quarter ?? ""} maxLength={160} /></Field>
                  <Field label="District sanitaire" htmlFor={`d-${f.id}`}><Input id={`d-${f.id}`} name="health_district" defaultValue={f.health_district ?? ""} maxLength={120} /></Field>
                  <Field label="Adresse" htmlFor={`a-${f.id}`} className="sm:col-span-2"><Input id={`a-${f.id}`} name="address" defaultValue={f.address ?? ""} maxLength={300} /></Field>
                  <Field label="Téléphone" htmlFor={`p-${f.id}`}><Input id={`p-${f.id}`} name="phone" defaultValue={f.phone ?? ""} dir="ltr" /></Field>
                  <Field label="Téléphone 2" htmlFor={`p2-${f.id}`}><Input id={`p2-${f.id}`} name="phone2" defaultValue={f.phone2 ?? ""} dir="ltr" /></Field>
                  <Field label="E-mail" htmlFor={`e-${f.id}`}><Input id={`e-${f.id}`} name="email" type="email" defaultValue={f.email ?? ""} /></Field>
                  <Field label="Site officiel" htmlFor={`w-${f.id}`}><Input id={`w-${f.id}`} name="website" type="url" defaultValue={f.website ?? ""} /></Field>
                  <Field label="Horaires" htmlFor={`h-${f.id}`}><Input id={`h-${f.id}`} name="hours" defaultValue={f.hours ?? ""} maxLength={300} /></Field>
                  <Field label="Lien de la source" htmlFor={`s-${f.id}`}><Input id={`s-${f.id}`} name="source_url" type="url" defaultValue={f.source_url ?? ""} /></Field>
                  <Field label="Conditions d'accès" htmlFor={`c-${f.id}`} className="sm:col-span-2"><Textarea id={`c-${f.id}`} name="access_conditions" defaultValue={f.access_conditions ?? ""} maxLength={500} rows={2} /></Field>
                  <Field label="Latitude" htmlFor={`la-${f.id}`}><Input id={`la-${f.id}`} name="latitude" inputMode="decimal" defaultValue={f.latitude ?? ""} dir="ltr" /></Field>
                  <Field label="Longitude" htmlFor={`lo-${f.id}`}><Input id={`lo-${f.id}`} name="longitude" inputMode="decimal" defaultValue={f.longitude ?? ""} dir="ltr" /></Field>
                  <label className="flex items-start gap-2 sm:col-span-2"><input type="checkbox" name="gps_checked" className="mt-1 size-4" /> La position GPS a été relevée sur place ou vérifiée auprès d&apos;une source fiable</label>
                  <Field label="Reste à vérifier (affiché au public)" htmlFor={`tv-${f.id}`} className="sm:col-span-2"><Input id={`tv-${f.id}`} name="to_verify" defaultValue={f.to_verify ?? ""} maxLength={500} /></Field>
                  <label className="flex items-start gap-2"><input type="checkbox" name="is_reference" defaultChecked={f.is_reference} className="mt-1 size-4" /> Centre de référence</label>
                  <Field label="Source institutionnelle du statut de référence" htmlFor={`rs-${f.id}`}><Input id={`rs-${f.id}`} name="reference_source" defaultValue={f.reference_source ?? ""} maxLength={200} /></Field>
                  <div className="sm:col-span-2"><SubmitButton size="sm">Enregistrer la fiche</SubmitButton></div>
                </ActionForm>
                <ActionForm action={setFacilityReliability} className="space-y-2 rounded-xl bg-muted/40 p-3">
                  <input type="hidden" name="id" value={f.id} />
                  <p className="font-semibold">Niveau de fiabilité</p>
                  <Select name="reliability" defaultValue={f.reliability}>{Object.entries(RELIABILITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select>
                  <Input name="note" maxLength={200} placeholder="Comment avez-vous vérifié ? (obligatoire pour « Vérifié »)" />
                  <SubmitButton size="sm" variant="outline">Enregistrer</SubmitButton>
                  <p className="text-xs text-muted-foreground">Source actuelle : {f.source}{f.verified_at ? ` · vérifié le ${formatDate(f.verified_at)}` : ""}</p>
                </ActionForm>
              </div>
            </details>
          </li>))}</ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-bold">Spécialités enregistrées</h2>
        <ul className="divide-y rounded-2xl border bg-white text-sm">{(links ?? []).map((l) => (
          <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
            <span><strong>{one(l.clinics as One<{ name: string }>)?.name ?? one(l.facility_listings as One<{ name: string }>)?.name}</strong> · {label[l.focus_code]} · {l.source}{l.verified_at ? ` · ${formatDate(l.verified_at)}` : ""}</span>
            <ActionForm action={removeFocus}><input type="hidden" name="id" value={l.id} /><SubmitButton size="sm" variant="ghost" confirm="Retirer cette spécialité ?">Retirer</SubmitButton></ActionForm>
          </li>))}
          {(links ?? []).length === 0 && <li className="p-3 text-muted-foreground">Aucune pour le moment.</li>}</ul>
      </section>
    </div>
  );
}
