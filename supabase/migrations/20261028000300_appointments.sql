-- ============================================================================
-- PharmaProxi — Migration : demandes de rendez-vous avec les médecins
-- Principe : le patient DEMANDE un rendez-vous (jour + moment de la journée) sur un
-- lieu de consultation publié ; le médecin ou le secrétariat de l'établissement
-- CONFIRME avec une heure précise, PROPOSE un autre moment ou REFUSE. Rien n'est
-- garanti avant la confirmation. Aucun conseil médical, aucune téléconsultation.
-- Le motif (facultatif) n'est visible que du patient, du médecin et du secrétariat.
-- Heure du Mali = UTC.
-- ============================================================================

alter table public.doctor_practice_sites add column accepts_appointments boolean not null default false;

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  site_id uuid references public.doctor_practice_sites(id) on delete set null,
  doctor_id uuid not null references public.doctors(id) on delete cascade,
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid not null references public.profiles(id) on delete cascade,
  patient_name text not null check (char_length(btrim(patient_name)) between 2 and 120),
  patient_phone text not null check (public.valid_phone(patient_phone)),
  requested_date date not null,
  requested_period text not null default 'indifferent' check (requested_period in ('matin', 'apres_midi', 'indifferent')),
  reason text check (char_length(coalesce(reason, '')) <= 300),
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'proposed', 'declined', 'cancelled', 'expired', 'completed', 'no_show')),
  scheduled_at timestamptz,          -- heure fixée (confirmée ou proposée)
  response_note text check (char_length(coalesce(response_note, '')) <= 300),
  cancelled_by text check (cancelled_by in ('patient', 'practice')),
  decided_by uuid references public.profiles(id) on delete set null,
  idempotency_key text check (char_length(coalesce(idempotency_key, '')) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status not in ('confirmed', 'proposed') or scheduled_at is not null)
);
create unique index appointments_idem on public.appointments (patient_id, idempotency_key) where idempotency_key is not null;
create index appointments_patient on public.appointments (patient_id, created_at desc);
create index appointments_doctor on public.appointments (doctor_id, status, requested_date);
create index appointments_clinic on public.appointments (clinic_id, status, requested_date);
create trigger appointments_touch before update on public.appointments for each row execute function public.touch_updated_at();

alter table public.appointments enable row level security;
create policy "pp_appointments_read" on public.appointments for select to authenticated using (
  patient_id = auth.uid() or doctor_id = public.my_doctor_id() or public.is_clinic_member(clinic_id));
revoke insert, update, delete on public.appointments from anon, authenticated;
grant select on public.appointments to authenticated;

create or replace function public.appointment_period_label(p text)
returns text language sql immutable as $$
  select case p when 'matin' then 'le matin' when 'apres_midi' then 'l''après-midi' else 'à tout moment' end
$$;

-- Le médecin (ou un membre de l'établissement) peut-il gérer ce rendez-vous ?
create or replace function public.can_manage_appointment(a public.appointments)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(a.doctor_id = public.my_doctor_id(), false) or coalesce(public.is_clinic_member(a.clinic_id), false)
$$;

-- Activer / désactiver les demandes en ligne sur un lieu de consultation
create or replace function public.set_site_appointments(p_site uuid, p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
declare s public.doctor_practice_sites;
begin
  select * into s from public.doctor_practice_sites where id = p_site;
  if s.id is null then raise exception 'PP404: lieu de consultation introuvable'; end if;
  if not (coalesce(s.doctor_id = public.my_doctor_id(), false) or coalesce(public.can_manage_clinic(s.clinic_id), false)) then
    raise exception 'PP403: action réservée au médecin ou à l''établissement' using errcode = '42501';
  end if;
  update public.doctor_practice_sites set accepts_appointments = p_on where id = p_site;
  perform public.log_audit(case when p_on then 'appointments.enable' else 'appointments.disable' end, 'practice_site', p_site::text);
end $$;

-- ---------------------------------------------------------------------------
-- Patient : demande
-- ---------------------------------------------------------------------------
create or replace function public.request_appointment(
  p_site uuid, p_date date, p_period text, p_patient_name text, p_phone text, p_reason text default null, p_key text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  s public.doctor_practice_sites; d public.doctors; c public.clinics;
  slots jsonb; ok_day boolean := false; slot jsonb; aid uuid; dkey text; doc_user uuid;
begin
  if uid is null then raise exception 'PP401: connectez-vous pour demander un rendez-vous' using errcode = '42501'; end if;
  if p_key is not null then
    select id into aid from public.appointments where patient_id = uid and idempotency_key = p_key;
    if aid is not null then return aid; end if;
  end if;
  select * into s from public.doctor_practice_sites where id = p_site;
  if s.id is null or not s.doctor_accepted or not s.clinic_accepted then raise exception 'PP404: lieu de consultation introuvable'; end if;
  select * into d from public.doctors where id = s.doctor_id;
  select * into c from public.clinics where id = s.clinic_id;
  if not public.doctor_is_public(d.id) or c.status <> 'verified' then raise exception 'PP404: ce médecin n''est pas disponible dans l''annuaire'; end if;
  if not s.accepts_appointments then raise exception 'PP409: ce lieu ne prend pas de demandes en ligne : appelez le numéro indiqué'; end if;
  if p_period not in ('matin', 'apres_midi', 'indifferent') then raise exception 'PP422: moment de la journée invalide'; end if;
  if public.normalize_ml_phone(p_phone) is null then raise exception 'PP422: numéro de téléphone invalide'; end if;
  if char_length(btrim(coalesce(p_patient_name, ''))) < 2 then raise exception 'PP422: indiquez le nom du patient'; end if;
  if p_date is null or p_date < (now() at time zone 'UTC')::date then raise exception 'PP422: choisissez une date à venir'; end if;
  if p_date > (now() at time zone 'UTC')::date + 60 then raise exception 'PP422: les demandes sont possibles jusqu''à 60 jours à l''avance'; end if;
  dkey := public.day_key(p_date::timestamp at time zone 'UTC');
  slots := s.schedule -> dkey;
  if slots is not null and jsonb_typeof(slots) = 'array' then
    for slot in select * from jsonb_array_elements(slots) loop
      if p_period = 'indifferent'
         or (p_period = 'matin' and (slot ->> 0) < '13:00')
         or (p_period = 'apres_midi' and (slot ->> 1) > '13:00') then ok_day := true; end if;
    end loop;
  end if;
  if not ok_day then raise exception 'PP422: le médecin ne consulte pas à ce moment dans cet établissement : choisissez un jour de consultation'; end if;
  if exists (select 1 from public.doctor_absences a where a.doctor_id = d.id and p_date between a.starts_on and a.ends_on) then
    raise exception 'PP409: le médecin a annoncé une absence ce jour-là';
  end if;
  if (select count(*) from public.appointments where patient_id = uid and status in ('pending', 'proposed')) >= 3 then
    raise exception 'PP429: vous avez déjà 3 demandes en attente : attendez une réponse ou annulez-en une';
  end if;
  if exists (select 1 from public.appointments where patient_id = uid and doctor_id = d.id and requested_date = p_date
             and status in ('pending', 'proposed', 'confirmed')) then
    raise exception 'PP409: vous avez déjà une demande auprès de ce médecin pour ce jour';
  end if;

  insert into public.appointments (site_id, doctor_id, clinic_id, patient_id, patient_name, patient_phone, requested_date, requested_period, reason, idempotency_key)
  values (s.id, d.id, c.id, uid, btrim(p_patient_name), public.normalize_ml_phone(p_phone), p_date, p_period, nullif(btrim(coalesce(p_reason, '')), ''), p_key)
  returning id into aid;

  select user_id into doc_user from public.doctors where id = d.id;
  perform public.notify_user(doc_user, 'appointment', 'Nouvelle demande de rendez-vous',
    format('%s souhaite vous voir le %s %s à %s.', btrim(p_patient_name), to_char(p_date, 'DD/MM/YYYY'), public.appointment_period_label(p_period), c.name),
    null, '/medecin/rendez-vous');
  perform public.notify_clinic(c.id, 'appointment', 'Nouvelle demande de rendez-vous',
    format('Pour %s %s, le %s %s.', d.title, d.display_name, to_char(p_date, 'DD/MM/YYYY'), public.appointment_period_label(p_period)),
    format('/clinique/%s/rendez-vous', c.id));
  return aid;
exception when check_violation then
  raise exception 'PP422: vérifiez le nom et le numéro de téléphone';
end $$;

-- ---------------------------------------------------------------------------
-- Médecin / secrétariat : réponse
-- p_action : 'confirm' (heure le jour demandé), 'propose' (autre moment), 'decline'
-- ---------------------------------------------------------------------------
create or replace function public.respond_appointment(p_id uuid, p_action text, p_at timestamptz default null, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare a public.appointments; d public.doctors;
begin
  select * into a from public.appointments where id = p_id for update;
  if a.id is null or not public.can_manage_appointment(a) then raise exception 'PP404: rendez-vous introuvable'; end if;
  if a.status not in ('pending', 'proposed') then raise exception 'PP409: cette demande a déjà reçu une réponse'; end if;
  select * into d from public.doctors where id = a.doctor_id;
  if p_action = 'confirm' then
    if p_at is null then raise exception 'PP422: indiquez l''heure du rendez-vous'; end if;
    if (p_at at time zone 'UTC')::date <> a.requested_date then raise exception 'PP422: pour un autre jour, utilisez « Proposer un autre moment »'; end if;
    if p_at < now() then raise exception 'PP422: cette heure est déjà passée'; end if;
    update public.appointments set status = 'confirmed', scheduled_at = p_at, response_note = nullif(btrim(coalesce(p_note, '')), ''), decided_by = auth.uid() where id = p_id;
    perform public.notify_user(a.patient_id, 'appointment', 'Rendez-vous confirmé',
      format('%s %s vous attend le %s à %s.%s', d.title, d.display_name, to_char(p_at at time zone 'UTC', 'DD/MM/YYYY'), to_char(p_at at time zone 'UTC', 'HH24"h"MI'),
             coalesce(' ' || nullif(btrim(coalesce(p_note, '')), ''), '')), null, '/compte/rendez-vous');
  elsif p_action = 'propose' then
    if p_at is null or p_at < now() then raise exception 'PP422: proposez une date et une heure à venir'; end if;
    update public.appointments set status = 'proposed', scheduled_at = p_at, response_note = nullif(btrim(coalesce(p_note, '')), ''), decided_by = auth.uid() where id = p_id;
    perform public.notify_user(a.patient_id, 'appointment', 'Un autre moment vous est proposé',
      format('%s %s propose le %s à %s. Acceptez ou refusez dans « Mes rendez-vous ».', d.title, d.display_name,
             to_char(p_at at time zone 'UTC', 'DD/MM/YYYY'), to_char(p_at at time zone 'UTC', 'HH24"h"MI')), null, '/compte/rendez-vous');
  elsif p_action = 'decline' then
    if char_length(btrim(coalesce(p_note, ''))) < 3 then raise exception 'PP422: indiquez un motif au patient (ex. complet ce jour-là, appelez le secrétariat)'; end if;
    update public.appointments set status = 'declined', response_note = btrim(p_note), decided_by = auth.uid() where id = p_id;
    perform public.notify_user(a.patient_id, 'appointment', 'Demande de rendez-vous non retenue',
      format('%s %s : %s', d.title, d.display_name, btrim(p_note)), null, '/compte/rendez-vous');
  else
    raise exception 'PP422: action inconnue';
  end if;
  perform public.log_audit('appointment.' || p_action, 'appointment', p_id::text);
end $$;

-- Patient : réponse à une proposition
create or replace function public.answer_appointment_proposal(p_id uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = public as $$
declare a public.appointments; doc_user uuid;
begin
  select * into a from public.appointments where id = p_id and patient_id = auth.uid() for update;
  if a.id is null then raise exception 'PP404: rendez-vous introuvable'; end if;
  if a.status <> 'proposed' then raise exception 'PP409: aucune proposition en attente'; end if;
  if p_accept and a.scheduled_at < now() then raise exception 'PP409: le moment proposé est déjà passé'; end if;
  update public.appointments set status = case when p_accept then 'confirmed' else 'cancelled' end,
         cancelled_by = case when p_accept then null else 'patient' end where id = p_id;
  select user_id into doc_user from public.doctors where id = a.doctor_id;
  perform public.notify_user(doc_user, 'appointment',
    case when p_accept then 'Proposition acceptée' else 'Proposition refusée' end,
    format('%s, %s.', a.patient_name, to_char(a.scheduled_at at time zone 'UTC', 'DD/MM/YYYY HH24"h"MI')), null, '/medecin/rendez-vous');
  perform public.notify_clinic(a.clinic_id, 'appointment',
    case when p_accept then 'Proposition acceptée' else 'Proposition refusée' end,
    format('%s, %s.', a.patient_name, to_char(a.scheduled_at at time zone 'UTC', 'DD/MM/YYYY HH24"h"MI')), format('/clinique/%s/rendez-vous', a.clinic_id));
end $$;

-- Annulation : par le patient (demande ou rendez-vous à venir) ou par le médecin / secrétariat (avec motif)
create or replace function public.cancel_appointment(p_id uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare a public.appointments; is_patient boolean; doc_user uuid; d public.doctors;
begin
  select * into a from public.appointments where id = p_id for update;
  if a.id is null then raise exception 'PP404: rendez-vous introuvable'; end if;
  is_patient := a.patient_id = auth.uid();
  if not is_patient and not public.can_manage_appointment(a) then raise exception 'PP404: rendez-vous introuvable'; end if;
  if a.status not in ('pending', 'proposed', 'confirmed') then raise exception 'PP409: ce rendez-vous ne peut plus être annulé'; end if;
  if a.status = 'confirmed' and a.scheduled_at < now() then raise exception 'PP409: l''heure du rendez-vous est passée'; end if;
  if not is_patient and char_length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'PP422: indiquez un motif au patient'; end if;
  update public.appointments set status = 'cancelled', cancelled_by = case when is_patient then 'patient' else 'practice' end,
         response_note = case when is_patient then response_note else btrim(p_reason) end where id = p_id;
  select * into d from public.doctors where id = a.doctor_id;
  if is_patient then
    perform public.notify_user(d.user_id, 'appointment', 'Rendez-vous annulé par le patient',
      format('%s, %s.', a.patient_name, coalesce(to_char(a.scheduled_at at time zone 'UTC', 'DD/MM/YYYY HH24"h"MI'), to_char(a.requested_date, 'DD/MM/YYYY'))), null, '/medecin/rendez-vous');
    perform public.notify_clinic(a.clinic_id, 'appointment', 'Rendez-vous annulé par le patient',
      format('%s, %s.', a.patient_name, coalesce(to_char(a.scheduled_at at time zone 'UTC', 'DD/MM/YYYY HH24"h"MI'), to_char(a.requested_date, 'DD/MM/YYYY'))), format('/clinique/%s/rendez-vous', a.clinic_id));
  else
    perform public.notify_user(a.patient_id, 'appointment', 'Rendez-vous annulé',
      format('%s %s : %s', d.title, d.display_name, btrim(p_reason)), null, '/compte/rendez-vous');
  end if;
  perform public.log_audit('appointment.cancel', 'appointment', p_id::text, jsonb_build_object('by', case when is_patient then 'patient' else 'practice' end));
end $$;

-- Après l'heure : honoré ou patient absent
create or replace function public.close_appointment(p_id uuid, p_outcome text)
returns void language plpgsql security definer set search_path = public as $$
declare a public.appointments;
begin
  select * into a from public.appointments where id = p_id for update;
  if a.id is null or not public.can_manage_appointment(a) then raise exception 'PP404: rendez-vous introuvable'; end if;
  if a.status <> 'confirmed' then raise exception 'PP409: seul un rendez-vous confirmé peut être clôturé'; end if;
  if a.scheduled_at > now() then raise exception 'PP409: le rendez-vous n''a pas encore eu lieu'; end if;
  if p_outcome not in ('completed', 'no_show') then raise exception 'PP422: résultat inconnu'; end if;
  update public.appointments set status = p_outcome where id = p_id;
end $$;

-- ---------------------------------------------------------------------------
-- Listes
-- ---------------------------------------------------------------------------
create or replace function public.my_appointments()
returns table (id uuid, status text, requested_date date, requested_period text, scheduled_at timestamptz, response_note text,
               patient_name text, reason text, cancelled_by text, created_at timestamptz,
               doctor_id uuid, doctor_label text, clinic_id uuid, clinic_name text, clinic_address text, phone text)
language sql stable security definer set search_path = public as $$
  select a.id, a.status, a.requested_date, a.requested_period, a.scheduled_at, a.response_note, a.patient_name, a.reason, a.cancelled_by, a.created_at,
         d.id, d.title || ' ' || d.display_name, c.id, c.name, c.address, coalesce(s.appointment_phone, c.phone)
  from public.appointments a
  join public.doctors d on d.id = a.doctor_id
  join public.clinics c on c.id = a.clinic_id
  left join public.doctor_practice_sites s on s.id = a.site_id
  where a.patient_id = auth.uid()
  order by (a.status in ('pending', 'proposed', 'confirmed')) desc, coalesce(a.scheduled_at, a.requested_date::timestamptz) desc
  limit 100
$$;

-- p_clinic NULL : agenda du médecin connecté ; sinon : agenda de l'établissement (membres seulement)
create or replace function public.practice_appointments(p_clinic uuid default null, p_view text default 'a_traiter')
returns table (id uuid, status text, requested_date date, requested_period text, scheduled_at timestamptz, response_note text,
               patient_name text, patient_phone text, reason text, cancelled_by text, created_at timestamptz,
               doctor_label text, clinic_id uuid, clinic_name text)
language plpgsql stable security definer set search_path = public as $$
declare me uuid := public.my_doctor_id();
begin
  if p_clinic is null and me is null then raise exception 'PP403: espace médecin requis' using errcode = '42501'; end if;
  if p_clinic is not null and not public.is_clinic_member(p_clinic) then raise exception 'PP403: action réservée à l''établissement' using errcode = '42501'; end if;
  return query
  select a.id, a.status, a.requested_date, a.requested_period, a.scheduled_at, a.response_note, a.patient_name, a.patient_phone, a.reason, a.cancelled_by, a.created_at,
         d.title || ' ' || d.display_name, c.id, c.name
  from public.appointments a
  join public.doctors d on d.id = a.doctor_id
  join public.clinics c on c.id = a.clinic_id
  where (case when p_clinic is null then a.doctor_id = me else a.clinic_id = p_clinic end)
    and case p_view
          when 'a_traiter' then a.status in ('pending', 'proposed')
          when 'a_venir' then a.status = 'confirmed' and a.scheduled_at >= date_trunc('day', now())
          when 'a_cloturer' then a.status = 'confirmed' and a.scheduled_at < now()
          else a.status not in ('pending', 'proposed') and not (a.status = 'confirmed' and a.scheduled_at >= date_trunc('day', now()))
        end
  order by case when p_view in ('a_traiter', 'a_venir', 'a_cloturer') then coalesce(a.scheduled_at, a.requested_date::timestamptz) end asc,
           a.updated_at desc
  limit 200;
end $$;

-- ---------------------------------------------------------------------------
-- Expiration automatique (maintenance) : demande sans réponse sous 48 h ou date passée,
-- proposition non acceptée sous 48 h ou moment passé.
-- ---------------------------------------------------------------------------
create or replace function public.expire_appointments()
returns int language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in
    update public.appointments set status = 'expired'
    where (status = 'pending' and (created_at < now() - interval '48 hours' or requested_date < (now() at time zone 'UTC')::date))
       or (status = 'proposed' and (updated_at < now() - interval '48 hours' or scheduled_at < now()))
    returning id, patient_id, requested_date
  loop
    perform public.notify_user(r.patient_id, 'appointment', 'Demande de rendez-vous expirée',
      format('Votre demande pour le %s n''a pas été confirmée à temps. Vous pouvez en faire une nouvelle ou appeler l''établissement.', to_char(r.requested_date, 'DD/MM/YYYY')),
      null, '/compte/rendez-vous');
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.run_maintenance()
returns jsonb language plpgsql security definer set search_path = public as $$
declare expired int; rl int; logs int; notifs int; outbox int; issues int; reminders int; appts int;
begin
  expired := public.expire_overdue_orders();
  appts := public.expire_appointments();
  delete from public.rate_limit_events where at < now() - interval '1 day';
  get diagnostics rl = row_count;
  delete from public.search_logs where created_at < now() - interval '400 days';
  get diagnostics logs = row_count;
  delete from public.notifications where read_at is not null and read_at < now() - interval '180 days';
  get diagnostics notifs = row_count;
  delete from public.notification_outbox where status in ('sent', 'skipped') and created_at < now() - interval '90 days';
  get diagnostics outbox = row_count;
  reminders := public.directory_reminders();
  select count(*) into issues from public.integrity_issues() where severity = 'critique';
  insert into public.maintenance_runs (expired, purged, critical_issues)
  values (expired, jsonb_build_object('rate_limits', rl, 'search_logs', logs, 'notifications', notifs, 'outbox', outbox,
                                      'directory_reminders', reminders, 'appointments_expired', appts), issues);
  delete from public.maintenance_runs where ran_at < now() - interval '30 days';
  return jsonb_build_object('expired', expired, 'appointments_expired', appts, 'purged', jsonb_build_object('rate_limits', rl, 'search_logs', logs,
    'notifications', notifs, 'outbox', outbox, 'directory_reminders', reminders), 'critical_issues', issues);
end $$;
revoke execute on function public.run_maintenance() from public, anon, authenticated;
grant execute on function public.run_maintenance() to service_role;

-- Statistiques (sans aucune donnée de patient)
create or replace function public.admin_appointment_stats()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_admin();
  return jsonb_build_object(
    'sites_open', (select count(*) from public.doctor_practice_sites where accepts_appointments),
    'last_30_days', (select count(*) from public.appointments where created_at > now() - interval '30 days'),
    'by_status', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) from (
       select status, count(*) n from public.appointments where created_at > now() - interval '30 days' group by status) x));
end $$;

revoke execute on function public.can_manage_appointment(public.appointments), public.expire_appointments() from public, anon, authenticated;
revoke execute on function public.set_site_appointments(uuid, boolean), public.request_appointment(uuid, date, text, text, text, text, text),
  public.respond_appointment(uuid, text, timestamptz, text), public.answer_appointment_proposal(uuid, boolean),
  public.cancel_appointment(uuid, text), public.close_appointment(uuid, text), public.my_appointments(),
  public.practice_appointments(uuid, text), public.admin_appointment_stats() from public, anon;
grant execute on function public.set_site_appointments(uuid, boolean), public.request_appointment(uuid, date, text, text, text, text, text),
  public.respond_appointment(uuid, text, timestamptz, text), public.answer_appointment_proposal(uuid, boolean),
  public.cancel_appointment(uuid, text), public.close_appointment(uuid, text), public.my_appointments(),
  public.practice_appointments(uuid, text), public.admin_appointment_stats() to authenticated;
grant execute on function public.expire_appointments() to service_role;
