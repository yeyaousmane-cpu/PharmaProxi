-- ============================================================================
-- PharmaProxi — Migration : réservation en ligne par créneaux (type Doctolib)
--   • motifs de consultation (durée, consignes, public, tarif indicatif déclaré)
--   • réservation immédiate d'un créneau libre OU demande à confirmer, au choix du lieu
--   • délais de prévenance (réservation, annulation), informations d'accès
--   • rendez-vous saisis par le cabinet (appel téléphonique), plages bloquées
--   • proches (prendre rendez-vous pour un enfant, un parent)
--   • liste d'attente : alerte quand un créneau se libère
--   • rappel la veille, prochaine disponibilité, informations pratiques du médecin
-- Pas de téléconsultation, pas de paiement, pas de dossier médical.
-- Heure du Mali = UTC.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Informations pratiques du médecin (déclarées par lui, jamais inventées)
-- ---------------------------------------------------------------------------
alter table public.doctors
  add column presentation text check (char_length(coalesce(presentation, '')) <= 1500),
  add column fee_info text check (char_length(coalesce(fee_info, '')) <= 200),
  add column payment_methods text[] not null default '{}'
    check (payment_methods <@ array['especes', 'orange_money', 'moov_money', 'carte', 'assurance', 'cheque']::text[]),
  add column accepts_new_patients boolean not null default true;

create or replace function public.update_doctor_practice_info(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := public.my_doctor_id();
begin
  if me is null then raise exception 'PP403: espace médecin requis' using errcode = '42501'; end if;
  update public.doctors set
    presentation = nullif(btrim(coalesce(p ->> 'presentation', '')), ''),
    fee_info = nullif(btrim(coalesce(p ->> 'fee_info', '')), ''),
    payment_methods = coalesce((select array_agg(distinct x) from jsonb_array_elements_text(coalesce(p -> 'payment_methods', '[]'::jsonb)) x
                                where x in ('especes', 'orange_money', 'moov_money', 'carte', 'assurance', 'cheque')), '{}'),
    accepts_new_patients = coalesce((p ->> 'accepts_new_patients')::boolean, true)
  where id = me;
exception when check_violation then
  raise exception 'PP422: texte trop long (présentation 1 500 caractères, tarifs 200 caractères)';
end $$;

-- ---------------------------------------------------------------------------
-- Réglages de réservation d'un lieu de consultation
-- ---------------------------------------------------------------------------
alter table public.doctor_practice_sites
  add column booking_mode text not null default 'request' check (booking_mode in ('request', 'instant')),
  add column min_notice_hours int not null default 2 check (min_notice_hours between 0 and 168),
  add column cancel_notice_hours int not null default 2 check (cancel_notice_hours between 0 and 168),
  add column access_info text check (char_length(coalesce(access_info, '')) <= 300);

create or replace function public.can_manage_site(p_site uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.doctor_practice_sites s
                 where s.id = p_site and (coalesce(s.doctor_id = public.my_doctor_id(), false) or coalesce(public.can_manage_clinic(s.clinic_id), false)))
$$;

create or replace function public.update_site_booking(p_site uuid, p_mode text, p_min_notice int, p_cancel_notice int, p_access_info text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_manage_site(p_site) then raise exception 'PP403: action réservée au médecin ou à l''établissement' using errcode = '42501'; end if;
  if p_mode not in ('request', 'instant') then raise exception 'PP422: mode de réservation inconnu'; end if;
  if p_mode = 'instant' and not exists (
       select 1 from public.appointment_types t join public.doctor_practice_sites s on s.id = p_site
       where t.doctor_id = s.doctor_id and t.is_active and (t.site_id is null or t.site_id = p_site)) then
    raise exception 'PP422: créez d''abord au moins un motif de consultation (avec sa durée) pour proposer des créneaux';
  end if;
  update public.doctor_practice_sites set booking_mode = p_mode, min_notice_hours = coalesce(p_min_notice, 2),
         cancel_notice_hours = coalesce(p_cancel_notice, 2), access_info = nullif(btrim(coalesce(p_access_info, '')), '')
  where id = p_site;
  perform public.log_audit('booking.settings', 'practice_site', p_site::text, jsonb_build_object('mode', p_mode));
exception when check_violation then
  raise exception 'PP422: délais entre 0 et 168 heures, informations d''accès 300 caractères maximum';
end $$;

-- ---------------------------------------------------------------------------
-- Motifs de consultation
-- ---------------------------------------------------------------------------
create table public.appointment_types (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.doctors(id) on delete cascade,
  site_id uuid references public.doctor_practice_sites(id) on delete cascade,   -- NULL : tous les lieux
  name text not null check (char_length(btrim(name)) between 2 and 80),
  duration_min int not null check (duration_min between 5 and 240),
  audience text not null default 'all' check (audience in ('all', 'new', 'returning')),
  instructions text check (char_length(coalesce(instructions, '')) <= 500),
  fee text check (char_length(coalesce(fee, '')) <= 80),
  sort_order int not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index appointment_types_doctor on public.appointment_types (doctor_id) where is_active;
alter table public.appointment_types enable row level security;
create policy "pp_types_public_read" on public.appointment_types for select to anon, authenticated
  using (is_active and public.doctor_is_public(doctor_id));
create policy "pp_types_practice_read" on public.appointment_types for select to authenticated
  using (doctor_id = public.my_doctor_id() or (site_id is not null and public.can_manage_site(site_id)));
revoke insert, update, delete on public.appointment_types from anon, authenticated;
grant select on public.appointment_types to anon, authenticated;

create or replace function public.save_appointment_type(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  tid uuid := nullif(p ->> 'id', '')::uuid; v_site uuid := nullif(p ->> 'site_id', '')::uuid;
  v_doctor uuid; t public.appointment_types; s public.doctor_practice_sites;
begin
  if tid is not null then
    select * into t from public.appointment_types where id = tid;
    if t.id is null then raise exception 'PP404: motif introuvable'; end if;
    v_doctor := t.doctor_id;
  end if;
  if v_site is not null then
    select * into s from public.doctor_practice_sites where id = v_site;
    if s.id is null or not public.can_manage_site(v_site) then raise exception 'PP403: lieu non autorisé' using errcode = '42501'; end if;
    if v_doctor is not null and v_doctor <> s.doctor_id then raise exception 'PP422: lieu d''un autre médecin'; end if;
    v_doctor := s.doctor_id;
  end if;
  v_doctor := coalesce(v_doctor, public.my_doctor_id());
  if v_doctor is null then raise exception 'PP403: espace médecin requis' using errcode = '42501'; end if;
  -- Un motif « tous lieux » n'est modifiable que par le médecin ; un motif de lieu, aussi par l'établissement
  if not (coalesce(v_doctor = public.my_doctor_id(), false) or (v_site is not null and public.can_manage_site(v_site))
          or (t.site_id is not null and public.can_manage_site(t.site_id))) then
    raise exception 'PP403: action réservée au médecin' using errcode = '42501';
  end if;
  if tid is null then
    insert into public.appointment_types (doctor_id, site_id, name, duration_min, audience, instructions, fee, sort_order)
    values (v_doctor, v_site, btrim(p ->> 'name'), (p ->> 'duration_min')::int, coalesce(nullif(p ->> 'audience', ''), 'all'),
            nullif(btrim(coalesce(p ->> 'instructions', '')), ''), nullif(btrim(coalesce(p ->> 'fee', '')), ''), coalesce((p ->> 'sort_order')::int, 100))
    returning id into tid;
  else
    update public.appointment_types set name = btrim(p ->> 'name'), duration_min = (p ->> 'duration_min')::int,
      audience = coalesce(nullif(p ->> 'audience', ''), 'all'), instructions = nullif(btrim(coalesce(p ->> 'instructions', '')), ''),
      fee = nullif(btrim(coalesce(p ->> 'fee', '')), ''), sort_order = coalesce((p ->> 'sort_order')::int, sort_order),
      is_active = coalesce((p ->> 'is_active')::boolean, is_active), site_id = coalesce(v_site, site_id)
    where id = tid;
  end if;
  return tid;
exception
  when check_violation then raise exception 'PP422: nom (2 à 80 caractères) et durée (5 à 240 minutes) obligatoires';
  when invalid_text_representation then raise exception 'PP422: durée invalide';
end $$;

-- ---------------------------------------------------------------------------
-- Rendez-vous : colonnes de réservation
-- ---------------------------------------------------------------------------
alter table public.appointments
  alter column patient_id drop not null,
  add column type_id uuid references public.appointment_types(id) on delete set null,
  add column ends_at timestamptz,
  add column source text not null default 'online' check (source in ('online', 'practice')),
  add column relative_id uuid,
  add column reminded_at timestamptz,
  add check (source = 'practice' or patient_id is not null);
create index appointments_doctor_time on public.appointments (doctor_id, scheduled_at) where status in ('confirmed', 'proposed');

-- ---------------------------------------------------------------------------
-- Plages bloquées (réunion, garde, congé d'une demi-journée…)
-- ---------------------------------------------------------------------------
create table public.practice_blocks (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.doctors(id) on delete cascade,
  site_id uuid references public.doctor_practice_sites(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  note text check (char_length(coalesce(note, '')) <= 120),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at and ends_at - starts_at <= interval '14 days')
);
create index practice_blocks_doctor on public.practice_blocks (doctor_id, starts_at);
alter table public.practice_blocks enable row level security;
create policy "pp_blocks_practice_read" on public.practice_blocks for select to authenticated
  using (doctor_id = public.my_doctor_id() or (site_id is not null and public.can_manage_site(site_id)));
revoke insert, update, delete on public.practice_blocks from anon, authenticated;
grant select on public.practice_blocks to authenticated;

create or replace function public.add_practice_block(p_site uuid, p_start timestamptz, p_end timestamptz, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare s public.doctor_practice_sites; bid uuid;
begin
  select * into s from public.doctor_practice_sites where id = p_site;
  if s.id is null or not public.can_manage_site(p_site) then raise exception 'PP403: action réservée au médecin ou à l''établissement' using errcode = '42501'; end if;
  insert into public.practice_blocks (doctor_id, site_id, starts_at, ends_at, note, created_by)
  values (s.doctor_id, p_site, p_start, p_end, nullif(btrim(coalesce(p_note, '')), ''), auth.uid()) returning id into bid;
  return bid;
exception when check_violation then
  raise exception 'PP422: la fin doit être après le début (14 jours maximum)';
end $$;

create or replace function public.remove_practice_block(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare b public.practice_blocks;
begin
  select * into b from public.practice_blocks where id = p_id;
  if b.id is null or not (coalesce(b.doctor_id = public.my_doctor_id(), false) or (b.site_id is not null and public.can_manage_site(b.site_id))) then
    raise exception 'PP404: plage introuvable';
  end if;
  delete from public.practice_blocks where id = p_id;
end $$;

-- ---------------------------------------------------------------------------
-- Proches du patient
-- ---------------------------------------------------------------------------
create table public.patient_relatives (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  full_name text not null check (char_length(btrim(full_name)) between 2 and 120),
  relation text not null default 'autre' check (relation in ('enfant', 'parent', 'conjoint', 'frere_soeur', 'autre')),
  phone text check (phone is null or public.valid_phone(phone)),
  created_at timestamptz not null default now()
);
create index patient_relatives_user on public.patient_relatives (user_id);
alter table public.patient_relatives enable row level security;
create policy "pp_relatives_own" on public.patient_relatives for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.patient_relatives from anon, authenticated;
grant select on public.patient_relatives to authenticated;
alter table public.appointments add constraint appointments_relative_fk foreign key (relative_id) references public.patient_relatives(id) on delete set null;

create or replace function public.add_relative(p_name text, p_relation text, p_phone text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); rid uuid; v_phone text := public.normalize_ml_phone(p_phone);
begin
  if uid is null then raise exception 'PP401: connectez-vous' using errcode = '42501'; end if;
  if (select count(*) from public.patient_relatives where user_id = uid) >= 10 then raise exception 'PP429: 10 proches maximum'; end if;
  if nullif(btrim(coalesce(p_phone, '')), '') is not null and v_phone is null then raise exception 'PP422: numéro de téléphone invalide'; end if;
  insert into public.patient_relatives (user_id, full_name, relation, phone)
  values (uid, btrim(p_name), coalesce(nullif(p_relation, ''), 'autre'), v_phone) returning id into rid;
  return rid;
exception when check_violation then
  raise exception 'PP422: nom (2 à 120 caractères) et lien de parenté obligatoires';
end $$;

create or replace function public.remove_relative(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.patient_relatives where id = p_id and user_id = auth.uid();
  if not found then raise exception 'PP404: proche introuvable'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- Créneaux disponibles
-- Créneaux de la durée du motif, découpés dans les plages de consultation du lieu,
-- hors délai de prévenance, absences, plages bloquées et rendez-vous existants
-- du médecin (tous lieux confondus). 60 jours maximum.
-- ---------------------------------------------------------------------------
create or replace function public.site_is_bookable(s public.doctor_practice_sites)
returns boolean language sql stable security definer set search_path = public as $$
  select s.doctor_accepted and s.clinic_accepted and s.accepts_appointments and s.booking_mode = 'instant'
     and public.doctor_is_public(s.doctor_id)
     and exists (select 1 from public.clinics c where c.id = s.clinic_id and c.status = 'verified')
$$;

create or replace function public.available_slots(p_site uuid, p_type uuid, p_from date default null, p_days int default 7)
returns table (slot_start timestamptz, slot_end timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare
  s public.doctor_practice_sites; t public.appointment_types;
  today date := (now() at time zone 'UTC')::date; d date; k text; slot jsonb;
  st timestamptz; en timestamptz; cur timestamptz; dur interval; min_start timestamptz;
begin
  select * into s from public.doctor_practice_sites where id = p_site;
  if s.id is null or not public.site_is_bookable(s) then return; end if;
  select * into t from public.appointment_types where id = p_type and doctor_id = s.doctor_id and is_active and (site_id is null or site_id = p_site);
  if t.id is null then return; end if;
  dur := make_interval(mins => t.duration_min);
  min_start := now() + make_interval(hours => s.min_notice_hours);
  for d in select g::date from generate_series(greatest(coalesce(p_from, today), today),
                                                 least(greatest(coalesce(p_from, today), today) + greatest(least(coalesce(p_days, 7), 31), 1) - 1, today + 60),
                                                 interval '1 day') g loop
    continue when exists (select 1 from public.doctor_absences a where a.doctor_id = s.doctor_id and d between a.starts_on and a.ends_on);
    k := public.day_key(d::timestamp at time zone 'UTC');
    for slot in select * from jsonb_array_elements(coalesce(s.schedule -> k, '[]'::jsonb)) loop
      st := (d::timestamp + (slot ->> 0)::time) at time zone 'UTC';
      en := (d::timestamp + case when slot ->> 1 = '24:00' then interval '24 hours' else (slot ->> 1)::time::interval end) at time zone 'UTC';
      cur := st;
      while cur + dur <= en loop
        if cur >= min_start
           and not exists (select 1 from public.appointments a
                           where a.doctor_id = s.doctor_id and a.status in ('confirmed', 'proposed') and a.scheduled_at is not null
                             and tstzrange(a.scheduled_at, coalesce(a.ends_at, a.scheduled_at + interval '30 minutes')) && tstzrange(cur, cur + dur))
           and not exists (select 1 from public.practice_blocks b
                           where b.doctor_id = s.doctor_id and tstzrange(b.starts_at, b.ends_at) && tstzrange(cur, cur + dur)) then
          slot_start := cur; slot_end := cur + dur;
          return next;
        end if;
        cur := cur + dur;
      end loop;
    end loop;
  end loop;
end $$;
alter function public.available_slots(uuid, uuid, date, int) set statement_timeout = '5s';

-- Prochaine disponibilité de chaque médecin (motif ouvert à tous ou aux nouveaux patients, 30 jours)
create or replace function public.next_availabilities(p_doctors uuid[])
returns table (doctor_id uuid, site_id uuid, type_id uuid, slot_start timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare r record; best timestamptz; v_site uuid; v_type uuid; x timestamptz;
begin
  for r in select distinct unnest(p_doctors[1:30]) as did loop
    best := null;
    for v_site, v_type in
      select s.id, t.id from public.doctor_practice_sites s
      join public.appointment_types t on t.doctor_id = s.doctor_id and t.is_active and (t.site_id is null or t.site_id = s.id) and t.audience <> 'returning'
      where s.doctor_id = r.did and public.site_is_bookable(s)
    loop
      select min(a.slot_start) into x from (select av.slot_start from public.available_slots(v_site, v_type, null, 30) av limit 1) a;
      if x is not null and (best is null or x < best) then best := x; doctor_id := r.did; site_id := v_site; type_id := v_type; slot_start := x; end if;
    end loop;
    if best is not null then return next; end if;
  end loop;
end $$;
alter function public.next_availabilities(uuid[]) set statement_timeout = '8s';

-- ---------------------------------------------------------------------------
-- Réservation immédiate d'un créneau
-- ---------------------------------------------------------------------------
create or replace function public.book_appointment(
  p_site uuid, p_type uuid, p_start timestamptz, p_patient_name text, p_phone text,
  p_reason text default null, p_relative uuid default null, p_key text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid(); s public.doctor_practice_sites; t public.appointment_types; d public.doctors; c public.clinics;
  aid uuid; v_name text := btrim(coalesce(p_patient_name, '')); v_phone text := public.normalize_ml_phone(p_phone); seen boolean; rel public.patient_relatives;
begin
  if uid is null then raise exception 'PP401: connectez-vous pour prendre rendez-vous' using errcode = '42501'; end if;
  if p_key is not null then
    select id into aid from public.appointments where patient_id = uid and idempotency_key = p_key;
    if aid is not null then return aid; end if;
  end if;
  select * into s from public.doctor_practice_sites where id = p_site;
  if s.id is null or not public.site_is_bookable(s) then raise exception 'PP404: la réservation en ligne n''est pas ouverte pour ce lieu'; end if;
  select * into t from public.appointment_types where id = p_type and doctor_id = s.doctor_id and is_active and (site_id is null or site_id = p_site);
  if t.id is null then raise exception 'PP404: motif de consultation introuvable'; end if;
  select * into d from public.doctors where id = s.doctor_id;
  select * into c from public.clinics where id = s.clinic_id;
  if p_relative is not null then
    select * into rel from public.patient_relatives where id = p_relative and user_id = uid;
    if rel.id is null then raise exception 'PP404: proche introuvable'; end if;
    v_name := rel.full_name;
    v_phone := coalesce(v_phone, rel.phone);
  end if;
  if char_length(v_name) < 2 then raise exception 'PP422: indiquez le nom du patient'; end if;
  if v_phone is null then raise exception 'PP422: numéro de téléphone invalide'; end if;

  -- Nouveau patient / patient déjà suivi
  seen := exists (select 1 from public.appointments a where a.patient_id = uid and a.doctor_id = d.id
                  and a.relative_id is not distinct from p_relative and a.status in ('completed', 'confirmed') and a.scheduled_at < now());
  if t.audience = 'new' and seen then raise exception 'PP409: ce motif est réservé aux nouveaux patients : choisissez un motif de suivi'; end if;
  if t.audience = 'returning' and not seen then raise exception 'PP409: ce motif est réservé aux patients déjà suivis par ce médecin'; end if;
  if not d.accepts_new_patients and not seen then raise exception 'PP409: ce médecin n''accepte pas de nouveaux patients en ligne pour le moment'; end if;

  if (select count(*) from public.appointments where patient_id = uid and status in ('pending', 'proposed', 'confirmed') and coalesce(scheduled_at, requested_date::timestamptz) >= now()) >= 5 then
    raise exception 'PP429: vous avez déjà 5 rendez-vous à venir : annulez-en un pour en prendre un autre';
  end if;
  if exists (select 1 from public.appointments where patient_id = uid and doctor_id = d.id and relative_id is not distinct from p_relative
             and status in ('pending', 'proposed', 'confirmed') and coalesce(scheduled_at::date, requested_date) = (p_start at time zone 'UTC')::date) then
    raise exception 'PP409: vous avez déjà un rendez-vous avec ce médecin ce jour-là';
  end if;

  -- Une réservation à la fois par médecin : le créneau est revérifié sous verrou
  perform pg_advisory_xact_lock(hashtextextended(d.id::text, 0));
  if not exists (select 1 from public.available_slots(p_site, p_type, (p_start at time zone 'UTC')::date, 1) a where a.slot_start = p_start) then
    raise exception 'PP409: ce créneau n''est plus disponible : choisissez-en un autre';
  end if;

  insert into public.appointments (site_id, doctor_id, clinic_id, patient_id, patient_name, patient_phone, requested_date, requested_period,
                                   reason, status, scheduled_at, ends_at, type_id, relative_id, idempotency_key, source)
  values (s.id, d.id, c.id, uid, v_name, v_phone, (p_start at time zone 'UTC')::date,
          case when extract(hour from p_start at time zone 'UTC') < 13 then 'matin' else 'apres_midi' end,
          nullif(btrim(coalesce(p_reason, '')), ''), 'confirmed', p_start, p_start + make_interval(mins => t.duration_min), t.id, p_relative, p_key, 'online')
  returning id into aid;

  perform public.notify_user(d.user_id, 'appointment', 'Nouveau rendez-vous',
    format('%s — %s, %s à %s (%s).', v_name, t.name, to_char(p_start at time zone 'UTC', 'DD/MM/YYYY'), to_char(p_start at time zone 'UTC', 'HH24"h"MI'), c.name),
    null, '/medecin/rendez-vous?vue=a_venir');
  perform public.notify_clinic(c.id, 'appointment', 'Nouveau rendez-vous',
    format('%s %s — %s, %s à %s.', d.title, d.display_name, v_name, to_char(p_start at time zone 'UTC', 'DD/MM/YYYY'), to_char(p_start at time zone 'UTC', 'HH24"h"MI')),
    format('/clinique/%s/rendez-vous?vue=a_venir', c.id));
  perform public.notify_user(uid, 'appointment', 'Rendez-vous confirmé',
    format('%s %s, %s à %s, %s.%s', d.title, d.display_name, to_char(p_start at time zone 'UTC', 'DD/MM/YYYY'), to_char(p_start at time zone 'UTC', 'HH24"h"MI'), c.name,
           coalesce(' À savoir : ' || t.instructions, '')), null, '/compte/rendez-vous');
  delete from public.appointment_waitlist w where w.user_id = uid and w.doctor_id = d.id;
  return aid;
end $$;

-- Rendez-vous saisi par le cabinet (patient qui a appelé) : bloque le créneau
create or replace function public.practice_add_appointment(
  p_site uuid, p_start timestamptz, p_duration_min int, p_patient_name text, p_phone text, p_note text default null, p_type uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare s public.doctor_practice_sites; aid uuid; v_phone text := public.normalize_ml_phone(p_phone); dur int := coalesce(p_duration_min, 15);
begin
  select * into s from public.doctor_practice_sites where id = p_site;
  if s.id is null or not public.can_manage_site(p_site) then raise exception 'PP403: action réservée au médecin ou à l''établissement' using errcode = '42501'; end if;
  if v_phone is null then raise exception 'PP422: numéro de téléphone invalide'; end if;
  if char_length(btrim(coalesce(p_patient_name, ''))) < 2 then raise exception 'PP422: indiquez le nom du patient'; end if;
  if dur < 5 or dur > 240 then raise exception 'PP422: durée entre 5 et 240 minutes'; end if;
  perform pg_advisory_xact_lock(hashtextextended(s.doctor_id::text, 0));
  if exists (select 1 from public.appointments a where a.doctor_id = s.doctor_id and a.status in ('confirmed', 'proposed') and a.scheduled_at is not null
             and tstzrange(a.scheduled_at, coalesce(a.ends_at, a.scheduled_at + interval '30 minutes')) && tstzrange(p_start, p_start + make_interval(mins => dur))) then
    raise exception 'PP409: un rendez-vous est déjà prévu sur ce créneau';
  end if;
  insert into public.appointments (site_id, doctor_id, clinic_id, patient_id, patient_name, patient_phone, requested_date, requested_period,
                                   status, scheduled_at, ends_at, type_id, response_note, source, decided_by)
  values (s.id, s.doctor_id, s.clinic_id, null, btrim(p_patient_name), v_phone, (p_start at time zone 'UTC')::date,
          case when extract(hour from p_start at time zone 'UTC') < 13 then 'matin' else 'apres_midi' end,
          'confirmed', p_start, p_start + make_interval(mins => dur), p_type, nullif(btrim(coalesce(p_note, '')), ''), 'practice', auth.uid())
  returning id into aid;
  return aid;
end $$;

-- ---------------------------------------------------------------------------
-- Liste d'attente : prévenir quand un créneau se libère
-- ---------------------------------------------------------------------------
create table public.appointment_waitlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  doctor_id uuid not null references public.doctors(id) on delete cascade,
  site_id uuid not null references public.doctor_practice_sites(id) on delete cascade,
  until_date date not null,
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, site_id)
);
alter table public.appointment_waitlist enable row level security;
create policy "pp_waitlist_own" on public.appointment_waitlist for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.appointment_waitlist from anon, authenticated;
grant select on public.appointment_waitlist to authenticated;

create or replace function public.join_waitlist(p_site uuid, p_until date)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); s public.doctor_practice_sites; wid uuid;
begin
  if uid is null then raise exception 'PP401: connectez-vous' using errcode = '42501'; end if;
  select * into s from public.doctor_practice_sites where id = p_site;
  if s.id is null or not public.site_is_bookable(s) then raise exception 'PP404: la réservation en ligne n''est pas ouverte pour ce lieu'; end if;
  if p_until is null or p_until < (now() at time zone 'UTC')::date or p_until > (now() at time zone 'UTC')::date + 60 then
    raise exception 'PP422: choisissez une date limite dans les 60 prochains jours';
  end if;
  if (select count(*) from public.appointment_waitlist where user_id = uid) >= 5 then raise exception 'PP429: 5 alertes maximum'; end if;
  insert into public.appointment_waitlist (user_id, doctor_id, site_id, until_date) values (uid, s.doctor_id, p_site, p_until)
  on conflict (user_id, site_id) do update set until_date = excluded.until_date, notified_at = null
  returning id into wid;
  return wid;
end $$;

create or replace function public.leave_waitlist(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.appointment_waitlist where id = p_id and user_id = auth.uid();
  if not found then raise exception 'PP404: alerte introuvable'; end if;
end $$;

-- Annulation (remplace la version précédente) : délai d'annulation en ligne + alerte liste d'attente
create or replace function public.cancel_appointment(p_id uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare a public.appointments; is_patient boolean; d public.doctors; s public.doctor_practice_sites; w record; v_when text;
begin
  select * into a from public.appointments where id = p_id for update;
  if a.id is null then raise exception 'PP404: rendez-vous introuvable'; end if;
  is_patient := coalesce(a.patient_id = auth.uid(), false);
  if not is_patient and not public.can_manage_appointment(a) then raise exception 'PP404: rendez-vous introuvable'; end if;
  if a.status not in ('pending', 'proposed', 'confirmed') then raise exception 'PP409: ce rendez-vous ne peut plus être annulé'; end if;
  if a.status = 'confirmed' and a.scheduled_at < now() then raise exception 'PP409: l''heure du rendez-vous est passée'; end if;
  select * into s from public.doctor_practice_sites where id = a.site_id;
  if is_patient and a.status = 'confirmed' and s.id is not null and a.scheduled_at - now() < make_interval(hours => s.cancel_notice_hours) then
    raise exception 'PP409: annulation en ligne impossible moins de % h avant : appelez le cabinet', s.cancel_notice_hours;
  end if;
  if not is_patient and char_length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'PP422: indiquez un motif au patient'; end if;
  update public.appointments set status = 'cancelled', cancelled_by = case when is_patient then 'patient' else 'practice' end,
         response_note = case when is_patient then response_note else btrim(p_reason) end where id = p_id;
  select * into d from public.doctors where id = a.doctor_id;
  v_when := coalesce(to_char(a.scheduled_at at time zone 'UTC', 'DD/MM/YYYY HH24"h"MI'), to_char(a.requested_date, 'DD/MM/YYYY'));
  if is_patient then
    perform public.notify_user(d.user_id, 'appointment', 'Rendez-vous annulé par le patient', format('%s, %s.', a.patient_name, v_when), null, '/medecin/rendez-vous');
    perform public.notify_clinic(a.clinic_id, 'appointment', 'Rendez-vous annulé par le patient', format('%s, %s.', a.patient_name, v_when), format('/clinique/%s/rendez-vous', a.clinic_id));
  elsif a.patient_id is not null then
    perform public.notify_user(a.patient_id, 'appointment', 'Rendez-vous annulé', format('%s %s : %s', d.title, d.display_name, btrim(p_reason)), null, '/compte/rendez-vous');
  end if;
  -- Créneau libéré : prévenir la liste d'attente (10 personnes au plus, une fois par jour)
  if a.status = 'confirmed' and a.scheduled_at > now() and a.site_id is not null then
    for w in select * from public.appointment_waitlist
             where site_id = a.site_id and until_date >= (a.scheduled_at at time zone 'UTC')::date
               and user_id is distinct from a.patient_id and (notified_at is null or notified_at < now() - interval '1 day')
             order by created_at limit 10 loop
      perform public.notify_user(w.user_id, 'appointment', 'Un créneau s''est libéré',
        format('%s %s : le %s à %s. Réservez vite, il est proposé à plusieurs personnes.', d.title, d.display_name,
               to_char(a.scheduled_at at time zone 'UTC', 'DD/MM/YYYY'), to_char(a.scheduled_at at time zone 'UTC', 'HH24"h"MI')),
        null, format('/medecins/%s/rendez-vous?lieu=%s', a.doctor_id, a.site_id));
      update public.appointment_waitlist set notified_at = now() where id = w.id;
    end loop;
  end if;
  perform public.log_audit('appointment.cancel', 'appointment', p_id::text, jsonb_build_object('by', case when is_patient then 'patient' else 'practice' end));
end $$;

-- Rappel la veille (notification ; SMS en file d'attente si un prestataire est branché)
create or replace function public.send_appointment_reminders()
returns int language plpgsql security definer set search_path = public as $$
declare r record; n int := 0; nid uuid;
begin
  for r in
    update public.appointments a set reminded_at = now()
    where a.status = 'confirmed' and a.reminded_at is null and a.patient_id is not null
      and a.scheduled_at between now() + interval '2 hours' and now() + interval '26 hours'
    returning a.id, a.patient_id, a.scheduled_at, a.doctor_id, a.clinic_id
  loop
    insert into public.notifications (user_id, kind, title, body, link)
    select r.patient_id, 'appointment', 'Rappel de rendez-vous',
           format('%s %s, le %s à %s, %s. Empêché ? Annulez pour libérer le créneau.', d.title, d.display_name,
                  to_char(r.scheduled_at at time zone 'UTC', 'DD/MM/YYYY'), to_char(r.scheduled_at at time zone 'UTC', 'HH24"h"MI'), c.name),
           '/compte/rendez-vous'
    from public.doctors d, public.clinics c where d.id = r.doctor_id and c.id = r.clinic_id
    returning id into nid;
    insert into public.notification_outbox (notification_id, channel) values (nid, 'sms');
    n := n + 1;
  end loop;
  delete from public.appointment_waitlist where until_date < (now() at time zone 'UTC')::date;
  return n;
end $$;

create or replace function public.run_maintenance()
returns jsonb language plpgsql security definer set search_path = public as $$
declare expired int; rl int; logs int; notifs int; outbox int; issues int; reminders int; appts int; appt_rem int;
begin
  expired := public.expire_overdue_orders();
  appts := public.expire_appointments();
  appt_rem := public.send_appointment_reminders();
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
                                      'directory_reminders', reminders, 'appointments_expired', appts, 'appointment_reminders', appt_rem), issues);
  delete from public.maintenance_runs where ran_at < now() - interval '30 days';
  return jsonb_build_object('expired', expired, 'appointments_expired', appts, 'appointment_reminders', appt_rem,
    'purged', jsonb_build_object('rate_limits', rl, 'search_logs', logs, 'notifications', notifs, 'outbox', outbox, 'directory_reminders', reminders),
    'critical_issues', issues);
end $$;
revoke execute on function public.run_maintenance() from public, anon, authenticated;
grant execute on function public.run_maintenance() to service_role;

-- ---------------------------------------------------------------------------
-- Listes (versions enrichies)
-- ---------------------------------------------------------------------------
drop function public.my_appointments();
create function public.my_appointments()
returns table (id uuid, status text, requested_date date, requested_period text, scheduled_at timestamptz, ends_at timestamptz, response_note text,
               patient_name text, reason text, cancelled_by text, created_at timestamptz,
               doctor_id uuid, doctor_label text, clinic_id uuid, clinic_name text, clinic_address text, phone text,
               site_id uuid, type_name text, instructions text, access_info text, can_cancel boolean, cancel_notice_hours int)
language sql stable security definer set search_path = public as $$
  select a.id, a.status, a.requested_date, a.requested_period, a.scheduled_at, a.ends_at, a.response_note, a.patient_name, a.reason, a.cancelled_by, a.created_at,
         d.id, d.title || ' ' || d.display_name, c.id, c.name, c.address, coalesce(s.appointment_phone, c.phone),
         a.site_id, t.name, t.instructions, s.access_info,
         a.status in ('pending', 'proposed') or (a.status = 'confirmed' and a.scheduled_at - now() >= make_interval(hours => coalesce(s.cancel_notice_hours, 0))),
         coalesce(s.cancel_notice_hours, 0)
  from public.appointments a
  join public.doctors d on d.id = a.doctor_id
  join public.clinics c on c.id = a.clinic_id
  left join public.doctor_practice_sites s on s.id = a.site_id
  left join public.appointment_types t on t.id = a.type_id
  where a.patient_id = auth.uid()
  order by (a.status in ('pending', 'proposed', 'confirmed')) desc, coalesce(a.scheduled_at, a.requested_date::timestamptz) desc
  limit 100
$$;

drop function public.practice_appointments(uuid, text);
create function public.practice_appointments(p_clinic uuid default null, p_view text default 'a_traiter', p_date date default null)
returns table (id uuid, status text, requested_date date, requested_period text, scheduled_at timestamptz, ends_at timestamptz, response_note text,
               patient_name text, patient_phone text, reason text, cancelled_by text, created_at timestamptz,
               doctor_label text, clinic_id uuid, clinic_name text, type_name text, source text, site_id uuid)
language plpgsql stable security definer set search_path = public as $$
declare me uuid := public.my_doctor_id();
begin
  if p_clinic is null and me is null then raise exception 'PP403: espace médecin requis' using errcode = '42501'; end if;
  if p_clinic is not null and not public.is_clinic_member(p_clinic) then raise exception 'PP403: action réservée à l''établissement' using errcode = '42501'; end if;
  return query
  select a.id, a.status, a.requested_date, a.requested_period, a.scheduled_at, a.ends_at, a.response_note, a.patient_name, a.patient_phone, a.reason, a.cancelled_by, a.created_at,
         d.title || ' ' || d.display_name, c.id, c.name, t.name, a.source, a.site_id
  from public.appointments a
  join public.doctors d on d.id = a.doctor_id
  join public.clinics c on c.id = a.clinic_id
  left join public.appointment_types t on t.id = a.type_id
  where (case when p_clinic is null then a.doctor_id = me else a.clinic_id = p_clinic end)
    and case p_view
          when 'a_traiter' then a.status in ('pending', 'proposed')
          when 'a_venir' then a.status = 'confirmed' and a.scheduled_at >= date_trunc('day', now())
          when 'a_cloturer' then a.status = 'confirmed' and a.scheduled_at < now()
          when 'jour' then a.status in ('confirmed', 'proposed', 'completed', 'no_show')
                           and (a.scheduled_at at time zone 'UTC')::date = coalesce(p_date, (now() at time zone 'UTC')::date)
          else a.status not in ('pending', 'proposed') and not (a.status = 'confirmed' and a.scheduled_at >= date_trunc('day', now()))
        end
  order by case when p_view in ('a_traiter', 'a_venir', 'a_cloturer', 'jour') then coalesce(a.scheduled_at, a.requested_date::timestamptz) end asc,
           a.updated_at desc
  limit 300;
end $$;

-- ---------------------------------------------------------------------------
-- Droits
-- ---------------------------------------------------------------------------
revoke execute on function public.site_is_bookable(public.doctor_practice_sites), public.send_appointment_reminders()
  from public, anon, authenticated;
-- Utilisée par les politiques RLS (se limite aux droits de l'utilisateur connecté)
revoke execute on function public.can_manage_site(uuid) from public, anon;
grant execute on function public.can_manage_site(uuid) to authenticated;
grant execute on function public.send_appointment_reminders() to service_role;
revoke execute on function public.update_doctor_practice_info(jsonb), public.update_site_booking(uuid, text, int, int, text),
  public.save_appointment_type(jsonb), public.add_practice_block(uuid, timestamptz, timestamptz, text), public.remove_practice_block(uuid),
  public.add_relative(text, text, text), public.remove_relative(uuid),
  public.book_appointment(uuid, uuid, timestamptz, text, text, text, uuid, text),
  public.practice_add_appointment(uuid, timestamptz, int, text, text, text, uuid),
  public.join_waitlist(uuid, date), public.leave_waitlist(uuid), public.my_appointments(), public.practice_appointments(uuid, text, date)
  from public, anon;
grant execute on function public.update_doctor_practice_info(jsonb), public.update_site_booking(uuid, text, int, int, text),
  public.save_appointment_type(jsonb), public.add_practice_block(uuid, timestamptz, timestamptz, text), public.remove_practice_block(uuid),
  public.add_relative(text, text, text), public.remove_relative(uuid),
  public.book_appointment(uuid, uuid, timestamptz, text, text, text, uuid, text),
  public.practice_add_appointment(uuid, timestamptz, int, text, text, text, uuid),
  public.join_waitlist(uuid, date), public.leave_waitlist(uuid), public.my_appointments(), public.practice_appointments(uuid, text, date)
  to authenticated;
grant execute on function public.available_slots(uuid, uuid, date, int), public.next_availabilities(uuid[]) to anon, authenticated;
