import { notFound } from "next/navigation";
import Link from "next/link";
import { CalendarCheck } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PracticeBoard, type BoardSite } from "@/components/appointments/practice-board";
import type { Schedule } from "@/lib/directory";

export const metadata = { title: "Rendez-vous — établissement" };
const one = <T,>(v: T | T[] | null | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

export default async function ClinicAppointments({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ vue?: string; date?: string; jours?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const me = await requireUser(`/clinique/${id}/rendez-vous`);
  const supabase = await createClient();
  const { data: membership } = await supabase.from("clinic_members").select("member_role").eq("clinic_id", id).eq("user_id", me.userId).maybeSingle();
  if (!membership) notFound();
  const [{ data: c }, { data: sites }] = await Promise.all([
    supabase.from("clinics").select("id, name, status").eq("id", id).single(),
    supabase.from("doctor_practice_sites").select("id, schedule, accepts_appointments, booking_mode, min_notice_hours, cancel_notice_hours, access_info, doctor_accepted, clinic_accepted, doctors(title, display_name, status, is_published)").eq("clinic_id", id).order("created_at"),
  ]);
  if (!c) notFound();
  const boardSites: BoardSite[] = (sites ?? []).filter((x) => x.doctor_accepted && x.clinic_accepted).map((x) => {
    const d = one(x.doctors);
    return {
      id: x.id, label: d ? `${d.title} ${d.display_name}` : "Médecin", schedule: x.schedule as Schedule, accepts_appointments: x.accepts_appointments,
    booking_mode: x.booking_mode, min_notice_hours: x.min_notice_hours, cancel_notice_hours: x.cancel_notice_hours, access_info: x.access_info,
      published: c.status === "verified" && d?.status === "verified" && Boolean(d?.is_published),
    };
  });
  return (
    <div className="container-page space-y-5 py-6">
      <div>
        <Link prefetch={false} href={`/clinique/${id}`} className="text-sm text-muted-foreground hover:underline">{c.name}</Link>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-brand-deep"><CalendarCheck className="size-6 text-brand-blue" aria-hidden /> Rendez-vous</h1>
        <p className="text-muted-foreground">Demandes des patients pour les médecins de l&apos;établissement. Chaque médecin voit aussi les siennes.</p>
      </div>
      <PracticeBoard clinicId={id} view={sp.vue} date={sp.date} days={sp.jours} basePath={`/clinique/${id}/rendez-vous`} sites={boardSites} />
    </div>
  );
}
