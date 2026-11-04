import { labContext } from "@/lib/lab-server";
import { LabShell, NoLab } from "@/components/lab/lab-shell";
import { ProGuard } from "@/components/security/pro-guard";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Field, Input, Select } from "@/components/ui/input";
import { saveLabExam, suggestExam } from "@/app/actions/labs";
import { formatDate, formatXof } from "@/lib/format";

export const metadata = { title: "Espace laboratoire — analyses et prix", robots: { index: false } };
export const dynamic = "force-dynamic";

type Exam = { id: string; name: string; category: string };
type Row = { exam_id: string; price_xof: number | null; price_note: string | null; delay: string | null; verified_at: string | null };
const CAT: Record<string, string> = { biologie: "Biologie", imagerie: "Imagerie", autre: "Autres examens" };

export default async function LabHome({ searchParams }: { searchParams: Promise<{ labo?: string }> }) {
  const sp = await searchParams;
  const ctx = await labContext("/laboratoire", sp.labo);
  if (!ctx.current) return <NoLab />;
  const fid = ctx.current.facility_id;
  const [{ data: exams }, { data: mine }] = await Promise.all([
    ctx.supabase.from("medical_exams").select("id, name, category").eq("is_active", true).order("category").order("name"),
    ctx.supabase.from("facility_exams").select("exam_id, price_xof, price_note, delay, verified_at").eq("facility_id", fid),
  ]);
  const all = (exams ?? []) as Exam[];
  const rows = (mine ?? []) as Row[];
  const byId = new Map(rows.map((r) => [r.exam_id, r]));
  const offered = all.filter((e) => byId.has(e.id));
  const notOffered = all.filter((e) => !byId.has(e.id));
  return (
    <LabShell labs={ctx.labs} current={ctx.current} active="">
      <ProGuard path="/laboratoire" />
      <p className="text-sm text-muted-foreground">Indiquez les analyses que vous réalisez, avec le prix et le délai de résultat. Elles apparaissent sur la page Laboratoires, avec la mention « Déclaré par le laboratoire » et la date. Mettez-les à jour dès qu&apos;un prix change.</p>
      <section className="space-y-3 rounded-2xl border bg-white p-4 sm:p-5">
        <h2 className="text-lg font-bold text-brand-deep">Ajouter une analyse</h2>
        <ActionForm action={saveLabExam} className="grid gap-3 sm:grid-cols-4" resetOnSuccess>
          <input type="hidden" name="facility_id" value={fid} />
          <Field label="Analyse" htmlFor="ex" className="sm:col-span-2"><Select id="ex" name="exam_id" required defaultValue="">
            <option value="" disabled>Choisir…</option>
            {Object.keys(CAT).map((c) => <optgroup key={c} label={CAT[c]}>{notOffered.filter((e) => e.category === c).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</optgroup>)}
          </Select></Field>
          <Field label="Prix (FCFA)" htmlFor="pr"><Input id="pr" name="price_xof" inputMode="numeric" placeholder="ex. 5000" /></Field>
          <Field label="Délai du résultat" htmlFor="dl"><Input id="dl" name="delay" maxLength={60} placeholder="ex. 24 h" /></Field>
          <Field label="Précision sur le prix (facultatif)" htmlFor="pn" className="sm:col-span-2"><Input id="pn" name="price_note" maxLength={80} placeholder="ex. tarif AMO différent" /></Field>
          <SubmitButton size="sm" className="w-fit self-end">Ajouter</SubmitButton>
        </ActionForm>
      </section>
      <section className="space-y-2 rounded-2xl border bg-white p-4 sm:p-5">
        <h2 className="text-lg font-bold text-brand-deep">Mes analyses ({offered.length})</h2>
        {offered.length === 0 ? <p className="text-sm text-muted-foreground">Aucune analyse déclarée pour le moment.</p> : (
          <ul className="divide-y">{offered.map((e) => { const r = byId.get(e.id)!; return (
            <li key={e.id} className="space-y-2 py-3">
              <p className="font-semibold">{e.name} <span className="text-xs font-normal text-muted-foreground">· {CAT[e.category]} · {r.price_xof !== null ? formatXof(r.price_xof) : "prix non indiqué"}{r.delay ? ` · ${r.delay}` : ""}{r.verified_at ? ` · mis à jour le ${formatDate(r.verified_at)}` : ""}</span></p>
              <ActionForm action={saveLabExam} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="facility_id" value={fid} /><input type="hidden" name="exam_id" value={e.id} />
                <label className="text-xs">Prix<Input name="price_xof" inputMode="numeric" defaultValue={r.price_xof ?? ""} className="mt-1 h-9 w-28" /></label>
                <label className="text-xs">Délai<Input name="delay" maxLength={60} defaultValue={r.delay ?? ""} className="mt-1 h-9 w-28" /></label>
                <label className="text-xs">Précision<Input name="price_note" maxLength={80} defaultValue={r.price_note ?? ""} className="mt-1 h-9 w-48" /></label>
                <SubmitButton size="sm">Mettre à jour</SubmitButton>
                <SubmitButton size="sm" variant="ghost" name="remove" value="1" confirm={`Retirer « ${e.name} » ?`}>Retirer</SubmitButton>
              </ActionForm>
            </li>); })}</ul>
        )}
      </section>
      <section className="space-y-2 rounded-2xl border bg-white p-4 sm:p-5">
        <h2 className="text-lg font-bold text-brand-deep">Une analyse manque dans la liste ?</h2>
        <ActionForm action={suggestExam} className="flex flex-wrap items-end gap-2" resetOnSuccess>
          <input type="hidden" name="facility_id" value={fid} />
          <label className="min-w-[240px] flex-1 text-sm">Nom de l&apos;analyse<Input name="name" maxLength={120} required className="mt-1" /></label>
          <label className="text-sm">Type<Select name="category" defaultValue="biologie" className="mt-1 h-11">{Object.entries(CAT).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></label>
          <SubmitButton size="sm" variant="outline">Proposer</SubmitButton>
        </ActionForm>
      </section>
    </LabShell>
  );
}
