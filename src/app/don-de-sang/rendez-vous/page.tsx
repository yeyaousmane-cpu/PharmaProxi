import Link from "next/link";
import { CalendarCheck, Info } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";
import { getGeo } from "@/lib/geo";
import { formatDate } from "@/lib/format";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Input, Select } from "@/components/ui/input";
import { BloodNav } from "@/components/blood/blood-nav";
import { bookDonationSlot, closeDonationSlot, createDonationSlot, setBookingStatus } from "@/app/actions/donor";
import { BOOKING_STATUS, NEXT_DATE_NOTICE } from "@/lib/donor";

export const metadata = { title: "Rendez-vous de don de sang", description: "Créneaux de don publiés par les centres de transfusion habilités." };
export const dynamic = "force-dynamic";

type Slot = { id: string; center: string; address: string | null; slot_date: string; start_time: string; end_time: string; capacity: number; active: boolean; regions: { name: string } | null };
type Booking = { id: string; reference: string; status: string; note: string | null; donor_id: string; blood_donation_slots: { center: string; slot_date: string; start_time: string; end_time: string } | null };

export default async function RendezVous() {
  const session = await getSession();
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const [{ data: slotData }, validator, geo] = await Promise.all([
    supabase.from("blood_donation_slots").select("id, center, address, slot_date, start_time, end_time, capacity, active, regions(name)").eq("active", true).gte("slot_date", today).order("slot_date").order("start_time").limit(100),
    session ? supabase.rpc("is_blood_validator").then((r) => !!r.data) : Promise.resolve(false),
    getGeo(),
  ]);
  const slots = (slotData ?? []) as unknown as Slot[];
  const remaining = await Promise.all(slots.map((s) => supabase.rpc("blood_slot_remaining", { p_slot: s.id }).then((r) => (r.data as number | null) ?? 0)));
  const [summary, bookings] = session ? await Promise.all([
    supabase.rpc("donor_summary").then((r) => r.data as { exists: boolean; next_indicative?: string | null } | null),
    supabase.from("blood_slot_bookings").select("id, reference, status, note, donor_id, blood_donation_slots(center, slot_date, start_time, end_time)").order("created_at", { ascending: false }).limit(validator ? 200 : 20)
      .then((r) => (r.data ?? []) as unknown as Booking[]),
  ]) : [null, [] as Booking[]];
  const mine = session ? bookings.filter((b) => b.donor_id === session.userId) : [];
  const toManage = validator ? bookings.filter((b) => b.donor_id !== session!.userId && ["confirme", "en_attente"].includes(b.status)) : [];
  return (
    <div className="container-page max-w-4xl space-y-5 py-6">
      <BloodNav current="/don-de-sang/rendez-vous" validator={validator} />
      <header className="space-y-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-brand-deep"><CalendarCheck className="size-7 text-red-600" aria-hidden /> Mon rendez-vous de don</h1>
        <p className="text-muted-foreground">Réservez un créneau publié par un centre de transfusion. Réserver n&apos;est pas un don : le jour venu, un professionnel évalue votre aptitude avant tout prélèvement.</p>
      </header>
      {summary?.exists && summary.next_indicative && summary.next_indicative > today && (
        <p className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"><Info className="mt-0.5 size-4 shrink-0" aria-hidden />Date indicative de votre prochain don : {formatDate(summary.next_indicative)}. {NEXT_DATE_NOTICE}</p>
      )}
      {mine.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-bold text-brand-deep">Mes rendez-vous</h2>
          <ul className="space-y-2">{mine.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border bg-white p-3 text-sm">
              <span><strong>{b.blood_donation_slots?.center}</strong> · {b.blood_donation_slots ? `${formatDate(b.blood_donation_slots.slot_date)} ${b.blood_donation_slots.start_time}–${b.blood_donation_slots.end_time}` : ""} · <span className="font-mono text-xs">{b.reference}</span> · {BOOKING_STATUS[b.status]}{b.note ? ` (${b.note})` : ""}</span>
              {["confirme", "en_attente"].includes(b.status) && <ActionForm action={setBookingStatus}><input type="hidden" name="id" value={b.id} /><input type="hidden" name="status" value="annule" />
                <SubmitButton size="sm" variant="outline" confirm="Annuler ce rendez-vous ?">Annuler</SubmitButton></ActionForm>}
            </li>))}</ul>
        </section>
      )}
      <section className="space-y-2">
        <h2 className="text-lg font-bold text-brand-deep">Créneaux disponibles</h2>
        {slots.length === 0 ? <p className="rounded-2xl border border-dashed p-5 text-sm text-muted-foreground">Aucun créneau publié pour le moment. Les centres de transfusion publient eux-mêmes leurs créneaux ; en attendant, vous pouvez vous présenter aux heures d&apos;ouverture indiquées par le centre.</p> : (
          <ul className="grid gap-2 sm:grid-cols-2">{slots.map((s, i) => (
            <li key={s.id} className="space-y-1 rounded-2xl border bg-white p-3 text-sm">
              <p className="font-semibold">{formatDate(s.slot_date)} · {s.start_time}–{s.end_time}</p>
              <p>{s.center}{s.address ? ` · ${s.address}` : ""}{s.regions ? ` · ${s.regions.name}` : ""}</p>
              <p className="text-xs text-muted-foreground">{remaining[i] > 0 ? `${remaining[i]} place(s) sur ${s.capacity}` : "Complet"}</p>
              <div className="flex flex-wrap gap-2">
                {!session ? <Link prefetch={false} href="/connexion?suite=%2Fdon-de-sang%2Frendez-vous" className="text-xs font-semibold text-primary underline">Se connecter pour réserver</Link>
                  : remaining[i] > 0 && <ActionForm action={bookDonationSlot}><input type="hidden" name="id" value={s.id} /><SubmitButton size="sm">Réserver ce créneau</SubmitButton></ActionForm>}
                {validator && <ActionForm action={closeDonationSlot}><input type="hidden" name="id" value={s.id} /><SubmitButton size="sm" variant="ghost" confirm="Fermer ce créneau ? Les donneurs inscrits seront prévenus.">Fermer</SubmitButton></ActionForm>}
              </div>
            </li>))}</ul>
        )}
      </section>
      {validator && (
        <section className="space-y-3 rounded-2xl border border-brand-deep/20 bg-white p-4 text-sm">
          <h2 className="font-bold text-brand-deep">Espace centre : publier un créneau</h2>
          <ActionForm action={createDonationSlot} className="grid gap-2 sm:grid-cols-3">
            <Input name="center" required minLength={3} maxLength={160} placeholder="Centre (ex. CNTS Bamako)" className="h-10" />
            <Input name="address" maxLength={200} placeholder="Adresse (facultatif)" className="h-10" />
            <Select name="region_id" defaultValue="" className="h-10"><option value="">Région non précisée</option>{geo.regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select>
            <label className="text-xs">Date<Input name="slot_date" type="date" required min={today} className="mt-1 h-10" /></label>
            <label className="text-xs">Début<Input name="start_time" type="time" required className="mt-1 h-10" /></label>
            <label className="text-xs">Fin<Input name="end_time" type="time" required className="mt-1 h-10" /></label>
            <label className="text-xs">Places<Input name="capacity" type="number" min={1} max={200} required defaultValue={10} className="mt-1 h-10" /></label>
            <div className="flex items-end"><SubmitButton size="sm">Publier le créneau</SubmitButton></div>
          </ActionForm>
          <h3 className="font-semibold">Rendez-vous à suivre ({toManage.length})</h3>
          {toManage.length === 0 ? <p className="text-muted-foreground">Aucun.</p> : (
            <ul className="divide-y">{toManage.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-2"><span><span className="font-mono">{b.reference}</span> · {b.blood_donation_slots?.center} · {b.blood_donation_slots ? formatDate(b.blood_donation_slots.slot_date) : ""} {b.blood_donation_slots?.start_time}</span>
                <ActionForm action={setBookingStatus} className="flex gap-1"><input type="hidden" name="id" value={b.id} />
                  <Select name="status" defaultValue="present" className="h-9 w-44"><option value="present">Présent</option><option value="absent">Absent</option><option value="reporte">À reporter</option><option value="annule">Annuler</option></Select>
                  <SubmitButton size="sm" variant="outline">OK</SubmitButton></ActionForm></li>))}</ul>
          )}
        </section>
      )}
    </div>
  );
}
