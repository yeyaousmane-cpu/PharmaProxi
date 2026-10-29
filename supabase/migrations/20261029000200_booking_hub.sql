-- ============================================================================
-- PharmaProxi — Migration : rubrique « Prendre rendez-vous »
-- Liste publique des médecins vérifiés qui acceptent les rendez-vous en ligne
-- (réservation immédiate ou demande à confirmer), lieu par lieu.
-- ============================================================================
create or replace function public.bookable_doctors(
  p_specialty uuid default null, p_region uuid default null, p_commune uuid default null, p_query text default null,
  p_mode text default null, p_lat double precision default null, p_lng double precision default null,
  p_limit int default 12, p_offset int default 0)
returns table (doctor_id uuid, title text, display_name text, specialties jsonb, site_id uuid, clinic_id uuid, clinic_name text,
               clinic_kind text, area text, booking_mode text, fee_info text, accepts_new_patients boolean, payment_methods text[],
               distance_km double precision, total_count bigint)
language sql stable security definer set search_path = public as $$
  with q as (select nullif(public.normalize_text(left(coalesce(p_query, ''), 80)), '') as t),
  rows as (
    select d.id as doctor_id, d.title, d.display_name,
           (select coalesce(jsonb_agg(jsonb_build_object('id', ms.id, 'name', ms.name) order by ms.sort_order), '[]')
              from public.doctor_specialties ds join public.medical_specialties ms on ms.id = ds.specialty_id where ds.doctor_id = d.id) as specialties,
           s.id as site_id, c.id as clinic_id, c.name as clinic_name, c.kind as clinic_kind,
           concat_ws(', ', cm.name, r.name) as area, s.booking_mode, d.fee_info, d.accepts_new_patients, d.payment_methods,
           public.distance_km(p_lat, p_lng, c.latitude, c.longitude) as distance_km
    from public.doctor_practice_sites s
    join public.doctors d on d.id = s.doctor_id
    join public.clinics c on c.id = s.clinic_id and c.status = 'verified'
    join public.regions r on r.id = c.region_id
    left join public.communes cm on cm.id = c.commune_id
    cross join q
    where s.accepts_appointments and s.doctor_accepted and s.clinic_accepted and public.doctor_is_public(d.id)
      and (p_mode is null or s.booking_mode = p_mode)
      and (p_region is null or c.region_id = p_region)
      and (p_commune is null or c.commune_id = p_commune)
      and (p_specialty is null or exists (select 1 from public.doctor_specialties ds where ds.doctor_id = d.id and ds.specialty_id = p_specialty))
      and (q.t is null or public.normalize_text(d.display_name) like '%' || q.t || '%' or public.normalize_text(c.name) like '%' || q.t || '%')
  )
  select rows.*, count(*) over ()
  from rows
  order by distance_km nulls last, case when booking_mode = 'instant' then 0 else 1 end, public.normalize_text(display_name)
  limit least(greatest(coalesce(p_limit, 12), 1), 30) offset greatest(coalesce(p_offset, 0), 0)
$$;
alter function public.bookable_doctors(uuid, uuid, uuid, text, text, double precision, double precision, int, int) set statement_timeout = '8s';
grant execute on function public.bookable_doctors(uuid, uuid, uuid, text, text, double precision, double precision, int, int) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Déplacer un rendez-vous (patient) : nouveau créneau libre, même lieu et même motif
-- ---------------------------------------------------------------------------
create or replace function public.move_appointment(p_id uuid, p_new_start timestamptz)
returns void language plpgsql security definer set search_path = public as $$
declare a public.appointments; s public.doctor_practice_sites; t public.appointment_types; d public.doctors; old_when text; new_when text;
begin
  select * into a from public.appointments where id = p_id and patient_id = auth.uid() for update;
  if a.id is null then raise exception 'PP404: rendez-vous introuvable'; end if;
  if a.status <> 'confirmed' or a.type_id is null or a.site_id is null then
    raise exception 'PP409: ce rendez-vous ne peut pas être déplacé en ligne : annulez-le ou appelez le cabinet';
  end if;
  select * into s from public.doctor_practice_sites where id = a.site_id;
  if s.id is null or not public.site_is_bookable(s) then raise exception 'PP409: la réservation en ligne est fermée pour ce lieu : appelez le cabinet'; end if;
  if a.scheduled_at - now() < make_interval(hours => s.cancel_notice_hours) then
    raise exception 'PP409: modification en ligne impossible moins de % h avant : appelez le cabinet', s.cancel_notice_hours;
  end if;
  if p_new_start = a.scheduled_at then raise exception 'PP422: choisissez un autre créneau'; end if;
  select * into t from public.appointment_types where id = a.type_id and is_active;
  if t.id is null then raise exception 'PP409: ce motif n''est plus proposé en ligne : annulez puis reprenez rendez-vous'; end if;
  perform pg_advisory_xact_lock(hashtextextended(a.doctor_id::text, 0));
  if not exists (select 1 from public.available_slots(a.site_id, a.type_id, (p_new_start at time zone 'UTC')::date, 1) x where x.slot_start = p_new_start) then
    raise exception 'PP409: ce créneau n''est plus disponible : choisissez-en un autre';
  end if;
  old_when := to_char(a.scheduled_at at time zone 'UTC', 'DD/MM/YYYY HH24"h"MI');
  new_when := to_char(p_new_start at time zone 'UTC', 'DD/MM/YYYY HH24"h"MI');
  update public.appointments set scheduled_at = p_new_start, ends_at = p_new_start + make_interval(mins => t.duration_min),
         requested_date = (p_new_start at time zone 'UTC')::date,
         requested_period = case when extract(hour from p_new_start at time zone 'UTC') < 13 then 'matin' else 'apres_midi' end,
         reminded_at = null
   where id = p_id;
  select * into d from public.doctors where id = a.doctor_id;
  perform public.notify_user(d.user_id, 'appointment', 'Rendez-vous déplacé par le patient', format('%s : %s → %s.', a.patient_name, old_when, new_when), null, '/medecin/rendez-vous?vue=a_venir');
  perform public.notify_clinic(a.clinic_id, 'appointment', 'Rendez-vous déplacé par le patient',
    format('%s %s — %s : %s → %s.', d.title, d.display_name, a.patient_name, old_when, new_when), format('/clinique/%s/rendez-vous?vue=a_venir', a.clinic_id));
  perform public.notify_user(a.patient_id, 'appointment', 'Rendez-vous déplacé', format('%s %s, nouveau rendez-vous le %s.', d.title, d.display_name, new_when), null, '/compte/rendez-vous');
  perform public.log_audit('appointment.move', 'appointment', p_id::text);
end $$;

-- ---------------------------------------------------------------------------
-- Visibilité : nombre de consultations de la fiche d'un médecin (agrégé par jour, sans identité)
-- ---------------------------------------------------------------------------
create table public.doctor_profile_views (
  doctor_id uuid not null references public.doctors(id) on delete cascade,
  day date not null,
  views int not null default 0,
  primary key (doctor_id, day)
);
alter table public.doctor_profile_views enable row level security;
revoke all on public.doctor_profile_views from anon, authenticated;

create or replace function public.record_doctor_view(p_doctor uuid)
returns void language sql volatile security definer set search_path = public as $$
  insert into public.doctor_profile_views (doctor_id, day, views)
  select p_doctor, (now() at time zone 'UTC')::date, 1 where public.doctor_is_public(p_doctor)
  on conflict (doctor_id, day) do update set views = public.doctor_profile_views.views + 1
$$;

-- ---------------------------------------------------------------------------
-- Statistiques d'activité (médecin : ses rendez-vous ; établissement : ceux de ses lieux)
-- ---------------------------------------------------------------------------
create or replace function public.practice_stats(p_clinic uuid default null, p_days int default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := public.my_doctor_id(); days int := least(greatest(coalesce(p_days, 30), 7), 365);
  since timestamptz := now() - make_interval(days => days);
  past jsonb; upcoming int; free int := 0; views bigint; peers jsonb := null; r record; n int;
begin
  if p_clinic is null and me is null then raise exception 'PP403: espace médecin requis' using errcode = '42501'; end if;
  if p_clinic is not null and not public.is_clinic_member(p_clinic) then raise exception 'PP403: réservé à l''équipe de l''établissement' using errcode = '42501'; end if;

  select jsonb_build_object(
      'total', count(*),
      'honores', count(*) filter (where status = 'completed'),
      'absents', count(*) filter (where status = 'no_show'),
      'annules_patient', count(*) filter (where status = 'cancelled' and cancelled_by = 'patient'),
      'annules_cabinet', count(*) filter (where status = 'cancelled' and cancelled_by = 'practice'),
      'refuses', count(*) filter (where status = 'declined'),
      'expires', count(*) filter (where status = 'expired'),
      'en_ligne', count(*) filter (where source = 'online' and status not in ('declined', 'expired')),
      'par_telephone', count(*) filter (where source = 'practice'),
      'nouveaux_patients', count(distinct patient_id) filter (where source = 'online'))
    into past
  from public.appointments a
  where (case when p_clinic is null then a.doctor_id = me else a.clinic_id = p_clinic end)
    and coalesce(a.scheduled_at, a.requested_date::timestamptz) between since and now();

  select count(*) into upcoming from public.appointments a
  where (case when p_clinic is null then a.doctor_id = me else a.clinic_id = p_clinic end)
    and a.status = 'confirmed' and a.scheduled_at between now() and now() + interval '7 days';

  -- Créneaux encore libres sur 7 jours (motif principal de chaque lieu ouvert en réservation immédiate)
  for r in
    select s.id as site_id,
           (select t.id from public.appointment_types t where t.doctor_id = s.doctor_id and t.is_active and (t.site_id is null or t.site_id = s.id)
             order by t.sort_order, t.duration_min limit 1) as type_id
    from public.doctor_practice_sites s
    where (case when p_clinic is null then s.doctor_id = me else s.clinic_id = p_clinic end) and public.site_is_bookable(s)
  loop
    if r.type_id is not null then
      select count(*) into n from public.available_slots(r.site_id, r.type_id, null, 7);
      free := free + n;
    end if;
  end loop;

  select coalesce(sum(v.views), 0) into views from public.doctor_profile_views v
  where v.day >= (since at time zone 'UTC')::date
    and (case when p_clinic is null then v.doctor_id = me
              else v.doctor_id in (select s.doctor_id from public.doctor_practice_sites s where s.clinic_id = p_clinic and s.doctor_accepted and s.clinic_accepted) end);

  -- Repère anonyme : médiane des médecins de même spécialité (au moins 5 médecins ayant 10 rendez-vous ou plus)
  if p_clinic is null then
    with peer as (
      select a.doctor_id,
             count(*) filter (where a.status = 'no_show')::numeric / nullif(count(*) filter (where a.status in ('completed', 'no_show')), 0) as absent_rate,
             count(*) filter (where a.status = 'cancelled')::numeric / count(*) as cancel_rate
      from public.appointments a
      where a.doctor_id <> me and coalesce(a.scheduled_at, a.requested_date::timestamptz) between since and now()
        and exists (select 1 from public.doctor_specialties x join public.doctor_specialties y on y.specialty_id = x.specialty_id
                    where x.doctor_id = me and y.doctor_id = a.doctor_id)
      group by a.doctor_id having count(*) >= 10)
    select case when count(*) >= 5 then jsonb_build_object(
             'medecins', count(*),
             'taux_absence', round(percentile_cont(0.5) within group (order by coalesce(absent_rate, 0))::numeric, 3),
             'taux_annulation', round(percentile_cont(0.5) within group (order by cancel_rate)::numeric, 3)) end
      into peers from peer;
  end if;

  return jsonb_build_object('jours', days, 'passe', past, 'a_venir_7j', upcoming, 'libres_7j', free,
                            'vues_fiche', views, 'repere_specialite', peers);
end $$;

revoke execute on function public.move_appointment(uuid, timestamptz), public.practice_stats(uuid, int) from public, anon;
grant execute on function public.move_appointment(uuid, timestamptz), public.practice_stats(uuid, int) to authenticated;
grant execute on function public.record_doctor_view(uuid) to anon, authenticated;


-- Laboratoires : statut d'autorisation (catégorie) affiché dans les résultats
drop function public.search_labs(uuid, text, uuid, text, int, int);
create or replace function public.search_labs(p_exam uuid default null, p_query text default null, p_region uuid default null,
                                              p_sort text default 'name', p_limit int default 30, p_offset int default 0)
returns table (facility_id uuid, name text, kind text, category_label text, region_name text, city_label text, address text, phone text, phone2 text,
               latitude double precision, longitude double precision, price_xof int, price_note text, delay text, source text,
               verified_at date, exams_count bigint, total_count bigint)
language sql stable security definer set search_path = public, extensions as $$
  with q as (select nullif(public.normalize_text(p_query), '') as t)
  select f.id, f.name, f.kind, f.category_label, r.name, f.city_label, f.address, f.phone, f.phone2, f.latitude, f.longitude,
         fe.price_xof, fe.price_note, fe.delay, coalesce(fe.source, f.source), fe.verified_at,
         (select count(*) from public.facility_exams x where x.facility_id = f.id), count(*) over ()
  from public.facility_listings f cross join q
  left join public.regions r on r.id = f.region_id
  left join public.facility_exams fe on fe.facility_id = f.id and fe.exam_id = p_exam
  where f.is_published and f.claimed_clinic_id is null and f.kind in ('laboratoire', 'imagerie', 'hopital', 'csref', 'clinique')
    and (p_exam is null or fe.id is not null)
    and (p_exam is not null or f.kind in ('laboratoire', 'imagerie'))
    and (p_region is null or f.region_id = p_region)
    and (q.t is null or f.search_name like '%' || q.t || '%' or extensions.similarity(f.search_name, q.t) > 0.3)
  order by case when p_sort = 'price' then fe.price_xof end asc nulls last, f.search_name
  limit least(greatest(coalesce(p_limit, 30), 1), 100) offset greatest(coalesce(p_offset, 0), 0)
$$;
grant execute on function public.search_labs(uuid, text, uuid, text, int, int) to anon, authenticated;
