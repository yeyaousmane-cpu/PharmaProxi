import Link from "next/link";
import { authorityContext } from "@/lib/authority-server";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Select, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Pagination, pageRange } from "@/components/pagination";
import { updateReport } from "@/app/actions/authorities";
import { CAN, OUTCOME, PROBLEMS, REPORTER, REPORT_KIND, REPORT_STATUS, SEVERITY, WHERE } from "@/lib/authorities";
import { formatDateTime, formatXof } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Signalements de médicaments — Autorités", robots: { index: false } };

type R = { id: string; kind: string; reporter_type: string; product_name: string; batch_number: string | null; expiry: string | null; manufacturer: string | null; where_bought: string | null;
  place_detail: string | null; region: string | null; price_xof: number | null; problems: string[]; description: string | null; reaction: string | null; severity: string | null; outcome: string | null;
  patient_age: string | null; patient_sex: string | null; pregnant: boolean | null; other_meds: string | null; contact_phone: string | null; status: string; authority_note: string | null; created_at: string; total_count: number };

export default async function Reports({ searchParams }: { searchParams: Promise<{ statut?: string; type?: string; page?: string }> }) {
  const sp = await searchParams;
  const ctx = await authorityContext("/autorites/signalements");
  if (!ctx.ok) return null;
  if (!ctx.admin && !CAN.reports.includes(ctx.scope)) return <p className="rounded-xl border bg-white p-4 text-sm">Les signalements sont réservés au ministère, à la DPM et à l&apos;Ordre des pharmaciens.</p>;
  const status = sp.statut && sp.statut in REPORT_STATUS ? sp.statut : null;
  const kind = sp.type && sp.type in REPORT_KIND ? sp.type : null;
  const range = pageRange(sp.page, 20);
  const { data, error } = await ctx.supabase.rpc("authority_reports", { p_status: status, p_kind: kind, p_region: null, p_limit: 20, p_offset: range.from });
  const rows = (data ?? []) as R[];
  const link = (o: Record<string, string | null>) => `/autorites/signalements?${new URLSearchParams(Object.entries({ statut: status, type: kind, ...o }).filter(([, v]) => v) as [string, string][]).toString()}`;
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Signalements envoyés par des patients, leurs proches, des pharmaciens et des soignants. Ils ne sont jamais publiés. L&apos;identité de la personne n&apos;est pas affichée ; son téléphone seulement si elle a accepté d&apos;être recontactée. Les signalements graves non traités sont en tête.</p>
      <nav className="flex flex-wrap gap-2 text-sm">
        {[[null, "Tous"], ...Object.entries(REPORT_STATUS)].map(([k, l]) => <Link prefetch={false} key={k ?? "all"} href={link({ statut: k, page: null })} className={cn("rounded-full border px-3 py-1", status === k ? "border-primary bg-primary text-white" : "bg-white")}>{l}</Link>)}
        <span className="mx-1 text-muted-foreground">·</span>
        {[[null, "Tous types"], ...Object.entries(REPORT_KIND)].map(([k, l]) => <Link prefetch={false} key={k ?? "allk"} href={link({ type: k, page: null })} className={cn("rounded-full border px-3 py-1", kind === k ? "border-brand-deep bg-brand-deep text-white" : "bg-white")}>{l}</Link>)}
      </nav>
      {error && <p className="text-sm text-red-700">Chargement impossible.</p>}
      {rows.length === 0 ? <p className="rounded-xl border bg-white p-4 text-sm text-muted-foreground">Aucun signalement.</p> : (
        <ul className="space-y-3">{rows.map((r) => (
          <li key={r.id} className={cn("space-y-2 rounded-2xl border bg-white p-4 text-sm", r.severity === "grave" && r.status === "nouveau" && "border-red-300")}>
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={r.kind === "effet" ? "border-blue-200 bg-blue-50 text-brand-blue" : "border-amber-200 bg-amber-50 text-amber-900"}>{REPORT_KIND[r.kind]}</Badge>
              {r.severity && <Badge className={r.severity === "grave" ? "border-red-200 bg-red-50 text-red-800" : "bg-white"}>{SEVERITY[r.severity]}</Badge>}
              <Badge className="bg-muted">{REPORT_STATUS[r.status]}</Badge>
              <span className="text-xs text-muted-foreground">{formatDateTime(r.created_at)} · {REPORTER[r.reporter_type]}{r.region ? ` · ${r.region}` : ""}</span>
            </div>
            <p className="text-base font-bold text-brand-deep">{r.product_name}</p>
            <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
              {[["Lot", r.batch_number], ["Péremption", r.expiry], ["Fabricant", r.manufacturer], ["Acheté", r.where_bought ? WHERE[r.where_bought] : null], ["Lieu", r.place_detail], ["Prix payé", r.price_xof !== null ? formatXof(r.price_xof) : null],
                ["Patient", [r.patient_age && `${r.patient_age} ans`, r.patient_sex === "F" ? "femme" : r.patient_sex === "M" ? "homme" : null, r.pregnant && "enceinte"].filter(Boolean).join(", ") || null],
                ["Évolution", r.outcome ? OUTCOME[r.outcome] : null], ["Autres médicaments", r.other_meds], ["Recontacter au", r.contact_phone]].filter(([, v]) => v).map(([k, v]) => (
                <div key={k as string}><dt className="inline text-muted-foreground">{k} : </dt><dd className="inline">{v}</dd></div>))}
            </dl>
            {r.problems.length > 0 && <p><span className="text-muted-foreground">Problèmes : </span>{r.problems.map((p) => PROBLEMS[p]).join(" · ")}</p>}
            {r.reaction && <p className="whitespace-pre-line"><span className="text-muted-foreground">Réaction : </span>{r.reaction}</p>}
            {r.description && <p className="whitespace-pre-line"><span className="text-muted-foreground">Description : </span>{r.description}</p>}
            <ActionForm action={updateReport} className="flex flex-wrap items-end gap-2 border-t pt-3">
              <input type="hidden" name="id" value={r.id} />
              <label className="text-xs">Statut<Select name="status" defaultValue={r.status} className="mt-1 h-9 w-56">{Object.entries(REPORT_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></label>
              <label className="min-w-[240px] flex-1 text-xs">Note interne<Textarea name="note" rows={1} maxLength={2000} defaultValue={r.authority_note ?? ""} className="mt-1" /></label>
              <SubmitButton size="sm">Enregistrer</SubmitButton>
            </ActionForm>
          </li>))}</ul>
      )}
      <Pagination basePath="/autorites/signalements" params={{ ...(status ? { statut: status } : {}), ...(kind ? { type: kind } : {}) }} page={range.page} total={Number(rows[0]?.total_count ?? 0)} size={20} />
    </div>
  );
}
