import { redirect } from "next/navigation";
import Link from "next/link";
import { CalendarCheck } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PracticeBoard, type BoardSite } from "@/components/appointments/practice-board";
import type { Schedule } from "@/lib/directory";

export const metadata = { title: "Mes rendez-vous — espace médecin" };
const one = <T,>(v: T | T[] | null | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

export default async function DoctorAppointments({ searchParams }: { searchParams: Promise<{ vue?: string; date?: string }> }) {
  const sp = await searchParams;
  const s = await requireUser("/medecin/rendez-vous");
  if (!s.doctor) redirect("/medecin/inscription");
  const supabase = await createClient();
  const [{ data: d }, { data: sites }] = await Promise.all([
    supabase.from("doctors").select("id, title, display_name, status, is_published").eq("id", s.doctor.id).single(),
    supabase.from("doctor_practice_sites").select("id, schedule, accepts_appointments, booking_mode, min_notice_hours, cancel_notice_hours, access_info, doctor_accepted, clinic_accepted, clinics(name, status)").eq("doctor_id", s.doctor.id).order("created_at"),
  ]);
  const boardSites: BoardSite[] = (sites ?? []).filter((x) => x.doctor_accepted && x.clinic_accepted).map((x) => ({
    id: x.id, label: one(x.clinics)?.name ?? "Établissement", schedule: x.schedule as Schedule, accepts_appointments: x.accepts_appointments,
    booking_mode: x.booking_mode, min_notice_hours: x.min_notice_hours, cancel_notice_hours: x.cancel_notice_hours, access_info: x.access_info,
    published: d?.status === "verified" && Boolean(d?.is_published) && one(x.clinics)?.status === "verified",
  }));
  return (
    <div className="container-page space-y-5 py-6">
      <div>
        <Link prefetch={false} href="/medecin" className="text-sm text-muted-foreground hover:underline">Espace médecin</Link>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-brand-deep"><CalendarCheck className="size-6 text-brand-blue" aria-hidden /> Demandes de rendez-vous</h1>
        <p className="text-muted-foreground">{d?.title} {d?.display_name} · le secrétariat de chaque établissement voit aussi ces demandes.</p>
      </div>
      <PracticeBoard view={sp.vue} date={sp.date} basePath="/medecin/rendez-vous" sites={boardSites} doctorId={s.doctor.id} />
    </div>
  );
}
