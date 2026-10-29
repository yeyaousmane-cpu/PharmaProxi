import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarClock, ChevronLeft, ChevronRight } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { moveAppointment } from "@/app/actions/appointments";
import { addDays, formatApptDay, formatApptTime, todayMali } from "@/lib/appointments";

export const metadata = { title: "Déplacer mon rendez-vous" };
const one = <T,>(v: T | T[] | null | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

export default async function MovePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ debut?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  await requireUser(`/compte/rendez-vous/${id}/deplacer`);
  const supabase = await createClient();
  const { data: a } = await supabase.from("appointments")
    .select("id, status, scheduled_at, site_id, type_id, doctors(title, display_name), clinics(name), appointment_types(name, duration_min)")
    .eq("id", id).maybeSingle();
  if (!a) notFound();
  const doc = one(a.doctors);
  const type = one(a.appointment_types);
  const today = todayMali();
  const start = sp.debut && /^\d{4}-\d{2}-\d{2}$/.test(sp.debut) && sp.debut >= today ? sp.debut : today;
  const movable = a.status === "confirmed" && a.site_id && a.type_id;
  const { data } = movable
    ? await supabase.rpc("available_slots", { p_site: a.site_id, p_type: a.type_id, p_from: start, p_days: 7 })
    : { data: [] };
  const slots = ((data as { slot_start: string }[]) ?? []).map((x) => x.slot_start);
  const byDay = new Map<string, string[]>();
  for (const sl of slots) byDay.set(sl.slice(0, 10), [...(byDay.get(sl.slice(0, 10)) ?? []), sl]);

  return (
    <div className="container-page max-w-3xl space-y-5 py-6">
      <Link prefetch={false} href="/compte/rendez-vous" className="text-sm text-primary underline">← Mes rendez-vous</Link>
      <h1 className="flex items-center gap-2 text-2xl font-bold"><CalendarClock className="size-6 text-brand-blue" aria-hidden /> Déplacer mon rendez-vous</h1>
      <Card>
        <CardContent className="pt-5 text-sm">
          <p><strong>{doc?.title} {doc?.display_name}</strong> · {one(a.clinics)?.name}</p>
          {type && <p className="text-muted-foreground">Motif : {type.name} ({type.duration_min} min)</p>}
          {a.scheduled_at && <p className="mt-1">Rendez-vous actuel : <strong>{formatApptDay(a.scheduled_at)} à {formatApptTime(a.scheduled_at)}</strong></p>}
        </CardContent>
      </Card>
      {!movable ? (
        <Alert tone="info" title="Ce rendez-vous ne peut pas être déplacé en ligne">Annulez-le puis reprenez rendez-vous, ou appelez le cabinet.</Alert>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Choisissez le nouveau créneau</CardTitle>
            <div className="flex items-center justify-between gap-2 text-sm">
              {start > today ? <Link prefetch={false} href={`?debut=${addDays(start, -7) < today ? today : addDays(start, -7)}`} className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5"><ChevronLeft className="size-4" aria-hidden /> Précédent</Link> : <span />}
              <span className="text-muted-foreground">{formatApptDay(`${start}T12:00:00Z`)} – {formatApptDay(`${addDays(start, 6)}T12:00:00Z`)}</span>
              <Link prefetch={false} href={`?debut=${addDays(start, 7)}`} className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5">Suivant <ChevronRight className="size-4" aria-hidden /></Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {byDay.size === 0 ? <p className="text-sm text-muted-foreground">Aucun créneau libre cette semaine : essayez la semaine suivante.</p> : (
              [...byDay.entries()].map(([day, list]) => (
                <div key={day}>
                  <p className="mb-1 text-sm font-semibold">{formatApptDay(`${day}T12:00:00Z`)}</p>
                  <div className="flex flex-wrap gap-2">
                    {list.map((sl) => (
                      <ActionForm key={sl} action={moveAppointment}>
                        <input type="hidden" name="id" value={a.id} /><input type="hidden" name="start" value={sl} />
                        <SubmitButton size="sm" variant="outline" className="border-sky-200 bg-brand-sky font-semibold text-brand-blue"
                          confirm={`Déplacer le rendez-vous au ${formatApptDay(sl)} à ${formatApptTime(sl)} ?`}>{formatApptTime(sl)}</SubmitButton>
                      </ActionForm>
                    ))}
                  </div>
                </div>
              ))
            )}
            <p className="text-xs text-muted-foreground">Votre créneau actuel est libéré dès que le nouveau est confirmé. Le cabinet est prévenu automatiquement.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
