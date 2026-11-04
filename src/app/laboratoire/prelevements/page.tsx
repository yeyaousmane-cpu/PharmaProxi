import { labContext } from "@/lib/lab-server";
import { LabShell, NoLab } from "@/components/lab/lab-shell";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { updateSampling } from "@/app/actions/labs";
import { uploadLabResult, deleteLabResult } from "@/app/actions/health-files";
import { SAMPLING_STATUS, SLOT } from "@/lib/labs";
import { formatDate, formatDateTime, formatPhone } from "@/lib/format";

export const metadata = { title: "Espace laboratoire — demandes de prélèvement", robots: { index: false } };
export const dynamic = "force-dynamic";

type R = { id: string; mode: string; results_consent: boolean; exam_ids: string[]; other_exams: string | null; patient_name: string; patient_age: number | null; for_relative: boolean; phone: string;
  address: string | null; preferred_date: string; slot: string; has_prescription: boolean; fasting_known: boolean; notes: string | null; status: string; scheduled_at: string | null; lab_note: string | null; created_at: string };

export default async function LabRequests({ searchParams }: { searchParams: Promise<{ labo?: string; vue?: string }> }) {
  const sp = await searchParams;
  const ctx = await labContext("/laboratoire/prelevements", sp.labo);
  if (!ctx.current) return <NoLab />;
  const open = sp.vue !== "toutes";
  let qb = ctx.supabase.from("home_sampling_requests").select("*").eq("facility_id", ctx.current.facility_id);
  if (open) qb = qb.in("status", ["nouvelle", "acceptee", "planifiee", "prelevee", "terminee"]);
  const [{ data }, { data: exams }, { data: svc }, { data: results }] = await Promise.all([qb.order("preferred_date").limit(100), ctx.supabase.from("medical_exams").select("id, name"),
    ctx.supabase.from("lab_home_service").select("results_enabled").eq("facility_id", ctx.current.facility_id).maybeSingle(),
    ctx.supabase.from("lab_results").select("id, request_id, file_name, created_at, first_opened_at").eq("facility_id", ctx.current.facility_id).order("created_at")]);
  const resultsBy = new Map<string, { id: string; file_name: string | null; created_at: string; first_opened_at: string | null }[]>();
  for (const x of results ?? []) resultsBy.set(x.request_id, [...(resultsBy.get(x.request_id) ?? []), x]);
  const name = new Map((exams ?? []).map((e) => [e.id, e.name]));
  const rows = (data ?? []) as R[];
  const today = new Date().toISOString().slice(0, 10);
  return (
    <LabShell labs={ctx.labs} current={ctx.current} active="/prelevements">
      <p className="text-sm text-muted-foreground">Ces informations de santé sont visibles uniquement par votre laboratoire et par le patient. Appelez le patient pour confirmer le passage. {open ? <a href="?vue=toutes" className="text-primary underline">Voir aussi les demandes closes</a> : <a href="?" className="text-primary underline">Seulement les demandes en cours</a>}</p>
      {rows.length === 0 ? <p className="rounded-xl border bg-white p-4 text-sm text-muted-foreground">Aucune demande.</p> : (
        <ul className="space-y-3">{rows.map((r) => (
          <li key={r.id} className="space-y-2 rounded-2xl border bg-white p-4 text-sm">
            <div className="flex flex-wrap items-center gap-2"><Badge className={r.status === "nouvelle" ? "border-amber-200 bg-amber-50 text-amber-900" : "bg-muted"}>{SAMPLING_STATUS[r.status]}</Badge>
              <Badge className={r.mode === "laboratoire" ? "bg-brand-sky text-brand-blue" : "bg-emerald-50 text-emerald-900"}>{r.mode === "laboratoire" ? "Au laboratoire" : "À domicile"}</Badge>
              <span className="text-xs text-muted-foreground">Reçue le {formatDateTime(r.created_at)}</span></div>
            <p className="text-base font-bold text-brand-deep">{r.patient_name}{r.patient_age !== null ? `, ${r.patient_age} ans` : ""}{r.for_relative ? " (demandé par un proche)" : ""}</p>
            <p><span className="text-muted-foreground">Analyses : </span>{[...r.exam_ids.map((id) => name.get(id) ?? "?"), r.other_exams].filter(Boolean).join(", ")}</p>
            <p><span className="text-muted-foreground">Souhaité : </span>{formatDate(r.preferred_date)}, {SLOT[r.slot]}{r.preferred_date < today ? " (date passée)" : ""} · <span className="text-muted-foreground">Ordonnance : </span>{r.has_prescription ? "oui" : "non"}{r.fasting_known ? " · informé(e) du jeûne" : ""}</p>
            <p>{r.address && <><span className="text-muted-foreground">Adresse : </span>{r.address} · </>}<a href={`tel:${r.phone}`} className="font-semibold text-primary">{formatPhone(r.phone) ?? r.phone}</a></p>
            {r.notes && <p><span className="text-muted-foreground">Précisions : </span>{r.notes}</p>}
            {r.scheduled_at && <p className="font-semibold">{r.mode === "laboratoire" ? "Rendez-vous" : "Passage prévu"} le {formatDateTime(r.scheduled_at)}</p>}
            {(resultsBy.get(r.id) ?? []).map((x) => (
              <p key={x.id} className="flex flex-wrap items-center gap-2 text-xs"><span className="rounded bg-emerald-50 px-2 py-0.5 text-emerald-900">Résultat envoyé le {formatDateTime(x.created_at)}{x.first_opened_at ? " · consulté" : ""}</span>
                <ActionForm action={deleteLabResult}><input type="hidden" name="id" value={x.id} /><SubmitButton size="sm" variant="ghost" confirm="Retirer ce résultat (envoyé par erreur) ?">Retirer</SubmitButton></ActionForm></p>))}
            {svc?.results_enabled && r.results_consent && ["acceptee", "planifiee", "prelevee", "terminee"].includes(r.status) && (
              <ActionForm action={uploadLabResult} className="flex flex-wrap items-end gap-2 rounded-xl bg-muted/40 p-3">
                <input type="hidden" name="request_id" value={r.id} /><input type="hidden" name="facility_id" value={ctx.current!.facility_id} />
                <label className="text-xs">Résultat (PDF ou photo, 10 Mo max.)<input name="file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" required className="mt-1 block text-sm" /></label>
                <label className="min-w-[180px] flex-1 text-xs">Message (facultatif)<Input name="note" maxLength={500} placeholder="ex. à montrer à votre médecin" className="mt-1 h-9" /></label>
                <SubmitButton size="sm">Envoyer le résultat chiffré</SubmitButton>
              </ActionForm>
            )}
            {!r.results_consent && ["prelevee", "terminee"].includes(r.status) && <p className="text-xs text-muted-foreground">Le patient n&apos;a pas demandé à recevoir ses résultats sur SantéProxi : remettez-les par vos moyens habituels.</p>}
            {!["terminee", "refusee", "annulee"].includes(r.status) && (
              <ActionForm action={updateSampling} className="flex flex-wrap items-end gap-2 border-t pt-3">
                <input type="hidden" name="id" value={r.id} />
                <label className="text-xs">Statut<Select name="status" defaultValue={r.status === "nouvelle" ? "acceptee" : r.status} className="mt-1 h-9 w-44">
                  {["acceptee", "planifiee", "prelevee", "terminee", "refusee"].map((s) => <option key={s} value={s}>{SAMPLING_STATUS[s]}</option>)}</Select></label>
                <label className="text-xs">Date du passage<Input name="date" type="date" min={today} defaultValue={r.scheduled_at?.slice(0, 10) ?? r.preferred_date} className="mt-1 h-9" /></label>
                <label className="text-xs">Heure<Input name="time" type="time" defaultValue={r.scheduled_at?.slice(11, 16) ?? "08:00"} className="mt-1 h-9 w-28" /></label>
                <label className="min-w-[200px] flex-1 text-xs">Message au patient<Input name="note" maxLength={500} defaultValue={r.lab_note ?? ""} placeholder="ex. venir à jeun" className="mt-1 h-9" /></label>
                <SubmitButton size="sm">Enregistrer</SubmitButton>
              </ActionForm>
            )}
          </li>))}</ul>
      )}
    </LabShell>
  );
}
