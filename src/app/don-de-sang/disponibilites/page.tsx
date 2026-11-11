import { Activity, Info } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";
import { getGeo } from "@/lib/geo";
import { formatDateTime } from "@/lib/format";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Input, Select } from "@/components/ui/input";
import { BloodNav } from "@/components/blood/blood-nav";
import { updateBloodStock } from "@/app/actions/donor";
import { BLOOD_GROUPS, PRODUCTS, STOCK_LEVEL } from "@/lib/donor";

export const metadata = { title: "Besoins des centres de transfusion", description: "Niveaux de besoin en sang déclarés et datés par le CNTS, par groupe sanguin." };
export const dynamic = "force-dynamic";

type Row = { center: string; region: string | null; blood_group: string; product: string; level: string; note: string | null; organisation: string; updated_at: string; stale: boolean };

export default async function Disponibilites() {
  const session = await getSession();
  const supabase = await createClient();
  const [{ data }, validator, geo] = await Promise.all([
    supabase.rpc("blood_stock_current"),
    session ? supabase.rpc("is_blood_validator").then((r) => !!r.data) : Promise.resolve(false),
    getGeo(),
  ]);
  const rows = (data ?? []) as Row[];
  const centers = new Map<string, Row[]>();
  for (const r of rows) { const k = `${r.center}|${r.product}`; centers.set(k, [...(centers.get(k) ?? []), r]); }
  return (
    <div className="container-page max-w-4xl space-y-5 py-6">
      <BloodNav current="/don-de-sang/disponibilites" validator={validator} />
      <header className="space-y-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-brand-deep"><Activity className="size-7 text-red-600" aria-hidden /> Besoins des centres de transfusion</h1>
        <p className="text-muted-foreground">Niveaux de besoin déclarés par les centres habilités, groupe par groupe. SantéProxi n&apos;affiche aucune quantité de stock et ne calcule rien : seules les déclarations datées des centres apparaissent.</p>
      </header>
      <p className="flex items-start gap-2 rounded-xl bg-brand-mint p-3 text-sm text-brand-deep"><Info className="mt-0.5 size-4 shrink-0" aria-hidden />Une déclaration de plus de 48 heures est marquée « non actualisée ». Pour toute information officielle, adressez-vous directement au CNTS.</p>
      {centers.size === 0 ? (
        <p className="rounded-2xl border border-dashed p-5 text-sm text-muted-foreground">Aucune information actualisée. Aucun centre n&apos;a encore publié de niveau de besoin dans SantéProxi.</p>
      ) : [...centers.entries()].map(([k, list]) => {
        const first = list[0]; const latest = list.reduce((a, b) => (a.updated_at > b.updated_at ? a : b));
        return (
          <section key={k} className="space-y-2 rounded-2xl border bg-white p-4">
            <h2 className="font-bold text-brand-deep">{first.center} <span className="text-sm font-normal text-muted-foreground">· {PRODUCTS[first.product]}{first.region ? ` · ${first.region}` : ""}</span></h2>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">{BLOOD_GROUPS.map((g) => {
              const r = list.find((x) => x.blood_group === g);
              return (
                <li key={g} className={`rounded-xl border p-2 text-center text-sm ${r?.stale ? "opacity-60" : ""}`}>
                  <p className="font-mono text-lg font-bold">{g}</p>
                  {r ? <><p className={`mt-1 rounded-full px-2 py-0.5 text-xs font-semibold ${STOCK_LEVEL[r.level][1]}`}>{STOCK_LEVEL[r.level][0]}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">{r.stale ? "Non actualisé · " : ""}{formatDateTime(r.updated_at)}</p></>
                    : <p className="mt-1 text-xs text-muted-foreground">Aucune information</p>}
                </li>);
            })}</ul>
            <p className="text-xs text-muted-foreground">Déclaré par : {latest.organisation}{latest.note ? ` · ${latest.note}` : ""}</p>
          </section>
        );
      })}
      {validator && (
        <section className="space-y-2 rounded-2xl border border-brand-deep/20 bg-white p-4 text-sm">
          <h2 className="font-bold text-brand-deep">Publier les niveaux de besoin (CNTS, centres habilités)</h2>
          <ActionForm action={updateBloodStock} className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-3">
              <Input name="center" required minLength={3} maxLength={160} placeholder="Centre (ex. CNTS Bamako)" className="h-10" />
              <Select name="product" defaultValue="globules_rouges" className="h-10">{Object.entries(PRODUCTS).filter(([k]) => k !== "non_precise").map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
              <Select name="region_id" defaultValue="" className="h-10"><option value="">Région non précisée</option>{geo.regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{BLOOD_GROUPS.map((g) => (
              <label key={g} className="text-xs font-semibold">{g}<Select name={`lvl_${g}`} defaultValue="" className="mt-1 h-10"><option value="">Ne pas modifier</option>
                {Object.entries(STOCK_LEVEL).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</Select></label>))}</div>
            <Input name="note" maxLength={200} placeholder="Note publique (facultatif)" className="h-10" />
            <SubmitButton size="sm">Publier, daté de maintenant</SubmitButton>
          </ActionForm>
        </section>
      )}
    </div>
  );
}
