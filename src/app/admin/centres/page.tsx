import { createClient } from "@/lib/supabase/server";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Field, Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { addFocus, removeFocus } from "@/app/actions/v023";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Centres spécialisés — administration" };
export const dynamic = "force-dynamic";

export default async function AdminCentres({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().replace(/[%_,()]/g, "").slice(0, 60);
  const supabase = await createClient();
  const [{ data: focus }, { data: links }, clinics, facilities] = await Promise.all([
    supabase.from("care_focus").select("code, label").order("sort"),
    supabase.from("facility_focus").select("id, focus_code, source, verified_at, clinics(name), facility_listings(name)").order("created_at", { ascending: false }).limit(300),
    q.length >= 2 ? supabase.from("clinics").select("id, name, public_code").eq("status", "verified").or(`name.ilike.%${q}%,public_code.ilike.%${q}%`).limit(15) : Promise.resolve({ data: [] as { id: string; name: string; public_code: string }[] }),
    q.length >= 2 ? supabase.from("facility_listings").select("id, name, public_code").eq("is_published", true).or(`name.ilike.%${q}%,public_code.ilike.%${q}%`).limit(15) : Promise.resolve({ data: [] as { id: string; name: string; public_code: string }[] }),
  ]);
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
            <Field label="Source de l'information" htmlFor="so" required className="sm:col-span-2"><Input id="so" name="source" maxLength={200} required placeholder="ex. confirmé par téléphone avec le secrétariat le 5 nov. 2026" /></Field>
            <div className="sm:col-span-2"><SubmitButton>Ajouter</SubmitButton></div>
          </ActionForm>
        ))}
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
