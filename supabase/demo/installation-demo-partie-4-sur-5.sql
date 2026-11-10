-- SantéProxi — installation du projet de DÉMONSTRATION, partie 4/5.
-- À exécuter dans l'ordre, dans l'éditeur SQL du projet « santeproxi-demo » UNIQUEMENT (jamais en production).

-- >>> 20261102000100_health_tools.sql
-- ============================================================================
-- PharmaProxi — Migration : outils de santé personnels et alertes
--   1. Carnet de vaccination des enfants (calendrier officiel du PEV, rappels).
--   2. Traitements : rappels de prise et de renouvellement.
--   3. Tension et glycémie : carnet de mesures (aucune interprétation affichée).
--   4. Don de sang : alertes de besoin publiées par l'administration, abonnement
--      volontaire par groupe sanguin.
--   5. Alertes sanitaires officielles (source obligatoire).
-- Données personnelles de santé : visibles par leur seul propriétaire (RLS),
-- supprimées avec le compte. Peut être relancé sans erreur.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Calendrier vaccinal (ministère de la Santé du Mali) et carnet des enfants
-- ---------------------------------------------------------------------------
create table if not exists public.vaccine_schedule (
  code text primary key,
  label text not null,
  protects text not null,
  visit_key text not null,
  visit_label text not null,
  age_days int not null check (age_days >= 0),
  girls_only boolean not null default false,
  sort int not null
);
alter table public.vaccine_schedule enable row level security;
drop policy if exists "pp_vaccine_schedule_read" on public.vaccine_schedule;
create policy "pp_vaccine_schedule_read" on public.vaccine_schedule for select to anon, authenticated using (true);
revoke insert, update, delete on public.vaccine_schedule from anon, authenticated;
grant select on public.vaccine_schedule to anon, authenticated;

insert into public.vaccine_schedule (code, label, protects, visit_key, visit_label, age_days, girls_only, sort) values
  ('BCG',   'BCG',                          'Tuberculose',                                        'naissance', 'À la naissance', 0,   false, 10),
  ('VPO0',  'Polio oral (VPO 0)',           'Poliomyélite',                                       'naissance', 'À la naissance', 0,   false, 11),
  ('PENTA1','Pentavalent 1',                'Diphtérie, tétanos, coqueluche, hépatite B, Hib',    's6',  '6 semaines',  42,  false, 20),
  ('VPO1',  'Polio oral (VPO 1)',           'Poliomyélite',                                       's6',  '6 semaines',  42,  false, 21),
  ('PCV1',  'Pneumocoque (PCV13) 1',        'Pneumonies, méningites à pneumocoque',               's6',  '6 semaines',  42,  false, 22),
  ('ROTA1', 'Rotavirus 1',                  'Diarrhées graves à rotavirus',                       's6',  '6 semaines',  42,  false, 23),
  ('PENTA2','Pentavalent 2',                'Diphtérie, tétanos, coqueluche, hépatite B, Hib',    's10', '10 semaines', 70,  false, 30),
  ('VPO2',  'Polio oral (VPO 2)',           'Poliomyélite',                                       's10', '10 semaines', 70,  false, 31),
  ('PCV2',  'Pneumocoque (PCV13) 2',        'Pneumonies, méningites à pneumocoque',               's10', '10 semaines', 70,  false, 32),
  ('ROTA2', 'Rotavirus 2',                  'Diarrhées graves à rotavirus',                       's10', '10 semaines', 70,  false, 33),
  ('PENTA3','Pentavalent 3',                'Diphtérie, tétanos, coqueluche, hépatite B, Hib',    's14', '14 semaines', 98,  false, 40),
  ('VPO3',  'Polio oral (VPO 3)',           'Poliomyélite',                                       's14', '14 semaines', 98,  false, 41),
  ('PCV3',  'Pneumocoque (PCV13) 3',        'Pneumonies, méningites à pneumocoque',               's14', '14 semaines', 98,  false, 42),
  ('ROTA3', 'Rotavirus 3',                  'Diarrhées graves à rotavirus',                       's14', '14 semaines', 98,  false, 43),
  ('VPI1',  'Polio injectable (VPI 1)',     'Poliomyélite',                                       's14', '14 semaines', 98,  false, 44),
  ('PALU1', 'Paludisme 1',                  'Paludisme',                                          'm6',  '6 mois',      183, false, 50),
  ('PALU2', 'Paludisme 2',                  'Paludisme',                                          'm7',  '7 mois',      213, false, 60),
  ('PALU3', 'Paludisme 3',                  'Paludisme',                                          'm8',  '8 mois',      244, false, 70),
  ('RR1',   'Rougeole-rubéole (RR 1)',      'Rougeole, rubéole',                                  'm9',  '9 mois',      274, false, 80),
  ('VAA',   'Fièvre jaune (VAA)',           'Fièvre jaune',                                       'm9',  '9 mois',      274, false, 81),
  ('MENA',  'Méningite (MenAfriVac)',       'Méningite A',                                        'm9',  '9 mois',      274, false, 82),
  ('VPI2',  'Polio injectable (VPI 2)',     'Poliomyélite',                                       'm9',  '9 mois',      274, false, 83),
  ('RR2',   'Rougeole-rubéole (RR 2)',      'Rougeole, rubéole',                                  'm15', '15 à 23 mois', 456, false, 90),
  ('ALB',   'Déparasitage (albendazole)',   'Vers intestinaux',                                   'm15', '15 à 23 mois', 456, false, 91),
  ('HPV1',  'HPV 1',                        'Cancer du col de l''utérus',                          'a10', '10 ans (filles)', 3653, true, 100),
  ('HPV2',  'HPV 2',                        'Cancer du col de l''utérus',                          'a10b','10 ans et 6 mois (filles)', 3836, true, 110)
on conflict (code) do update set label = excluded.label, protects = excluded.protects, visit_key = excluded.visit_key,
  visit_label = excluded.visit_label, age_days = excluded.age_days, girls_only = excluded.girls_only, sort = excluded.sort;

create table if not exists public.children (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  first_name text not null check (char_length(btrim(first_name)) between 1 and 60),
  birth_date date not null check (birth_date <= current_date + 1 and birth_date >= date '2008-01-01'),
  sex text check (sex in ('F', 'M')),
  remind boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists children_user on public.children (user_id);
alter table public.children enable row level security;
drop policy if exists "pp_children_owner" on public.children;
create policy "pp_children_owner" on public.children for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.children from anon;
grant select, insert, update, delete on public.children to authenticated;

create table if not exists public.child_vaccinations (
  child_id uuid not null references public.children(id) on delete cascade,
  dose_code text not null references public.vaccine_schedule(code) on delete cascade,
  done_on date not null check (done_on <= current_date + 1),
  place text check (char_length(coalesce(place, '')) <= 100),
  primary key (child_id, dose_code)
);
alter table public.child_vaccinations enable row level security;
drop policy if exists "pp_child_vacc_owner" on public.child_vaccinations;
create policy "pp_child_vacc_owner" on public.child_vaccinations for all to authenticated
  using (exists (select 1 from public.children c where c.id = child_id and c.user_id = auth.uid()))
  with check (exists (select 1 from public.children c where c.id = child_id and c.user_id = auth.uid()));
revoke all on public.child_vaccinations from anon;
grant select, insert, update, delete on public.child_vaccinations to authenticated;

create table if not exists public.child_reminder_log (
  child_id uuid not null references public.children(id) on delete cascade,
  visit_key text not null,
  kind text not null check (kind in ('j-3', 'j0')),
  sent_at timestamptz not null default now(),
  primary key (child_id, visit_key, kind)
);
alter table public.child_reminder_log enable row level security;
revoke all on public.child_reminder_log from anon, authenticated;

create or replace function public.child_limit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.children where user_id = new.user_id) >= 12 then raise exception 'PP429: 12 enfants maximum'; end if;
  return new;
end $$;
drop trigger if exists children_limit on public.children;
create trigger children_limit before insert on public.children for each row execute function public.child_limit();

-- ---------------------------------------------------------------------------
-- 2. Traitements
-- ---------------------------------------------------------------------------
create or replace function public.valid_hhmm_list(p text[])
returns boolean language sql immutable as $$
  select coalesce(bool_and(x ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'), false) from unnest(p) x
$$;
create table if not exists public.treatments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 120),
  dose_note text check (char_length(coalesce(dose_note, '')) <= 120),          -- ex. « 1 comprimé »
  times text[] not null check (cardinality(times) between 1 and 6 and public.valid_hhmm_list(times)),
  start_date date not null default current_date,
  duration_days int check (duration_days is null or duration_days between 1 and 730),   -- null : au long cours
  units_in_stock numeric(7, 1) check (units_in_stock is null or units_in_stock between 0 and 10000),
  units_per_intake numeric(5, 2) not null default 1 check (units_per_intake > 0 and units_per_intake <= 50),
  stock_date date not null default current_date,                             -- date de la saisie du stock
  remind_intake boolean not null default true,
  remind_renewal boolean not null default true,
  active boolean not null default true,
  renewal_notified_on date,
  created_at timestamptz not null default now()
);
create index if not exists treatments_user on public.treatments (user_id);
alter table public.treatments enable row level security;
drop policy if exists "pp_treatments_owner" on public.treatments;
create policy "pp_treatments_owner" on public.treatments for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.treatments from anon;
grant select, insert, update, delete on public.treatments to authenticated;

create table if not exists public.treatment_intakes (
  treatment_id uuid not null references public.treatments(id) on delete cascade,
  day date not null,
  slot text not null,
  taken_at timestamptz,
  notified_at timestamptz,
  primary key (treatment_id, day, slot)
);
alter table public.treatment_intakes enable row level security;
drop policy if exists "pp_intakes_owner" on public.treatment_intakes;
create policy "pp_intakes_owner" on public.treatment_intakes for all to authenticated
  using (exists (select 1 from public.treatments t where t.id = treatment_id and t.user_id = auth.uid()))
  with check (exists (select 1 from public.treatments t where t.id = treatment_id and t.user_id = auth.uid()));
revoke all on public.treatment_intakes from anon;
grant select, insert, update, delete on public.treatment_intakes to authenticated;

create or replace function public.treatment_limit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.treatments where user_id = new.user_id) >= 30 then raise exception 'PP429: 30 traitements maximum'; end if;
  return new;
end $$;
drop trigger if exists treatments_limit on public.treatments;
create trigger treatments_limit before insert on public.treatments for each row execute function public.treatment_limit();

-- Jours de traitement restants selon le stock déclaré (null si stock inconnu)
create or replace function public.treatment_days_left(t public.treatments, p_today date default (now() at time zone 'utc')::date)
returns int language sql stable as $$
  select case when t.units_in_stock is null then null
    else greatest(0, floor(t.units_in_stock / (t.units_per_intake * cardinality(t.times))) - greatest(0, p_today - t.stock_date))::int end
$$;

-- ---------------------------------------------------------------------------
-- 3. Tension et glycémie
-- ---------------------------------------------------------------------------
create table if not exists public.health_measures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('tension', 'glycemie')),
  systolic int check (systolic between 50 and 300),
  diastolic int check (diastolic between 30 and 200),
  pulse int check (pulse between 30 and 250),
  glucose_gl numeric(4, 2) check (glucose_gl between 0.2 and 6),   -- en g/L
  context text check (context in ('a_jeun', 'apres_repas', 'autre')),
  measured_at timestamptz not null default now() check (measured_at <= now() + interval '1 day'),
  note text check (char_length(coalesce(note, '')) <= 200),
  created_at timestamptz not null default now(),
  check ((kind = 'tension' and systolic is not null and diastolic is not null and systolic > diastolic and glucose_gl is null)
      or (kind = 'glycemie' and glucose_gl is not null and systolic is null and diastolic is null))
);
create index if not exists health_measures_user on public.health_measures (user_id, kind, measured_at desc);
alter table public.health_measures enable row level security;
drop policy if exists "pp_measures_owner" on public.health_measures;
create policy "pp_measures_owner" on public.health_measures for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.health_measures from anon;
grant select, insert, update, delete on public.health_measures to authenticated;

create or replace function public.measure_limit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.health_measures where user_id = new.user_id and created_at > now() - interval '1 day') >= 60 then
    raise exception 'PP429: 60 mesures par jour au maximum';
  end if;
  return new;
end $$;
drop trigger if exists measures_limit on public.health_measures;
create trigger measures_limit before insert on public.health_measures for each row execute function public.measure_limit();

-- ---------------------------------------------------------------------------
-- 4 et 5. Préférences d'alerte, besoins en sang, alertes sanitaires
-- ---------------------------------------------------------------------------
create table if not exists public.user_alert_prefs (
  user_id uuid primary key default auth.uid() references public.profiles(id) on delete cascade,
  health_alerts boolean not null default false,
  blood_alerts boolean not null default false,
  blood_group text check (blood_group in ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
  region_id uuid references public.regions(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.user_alert_prefs enable row level security;
drop policy if exists "pp_alert_prefs_owner" on public.user_alert_prefs;
create policy "pp_alert_prefs_owner" on public.user_alert_prefs for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.user_alert_prefs from anon;
grant select, insert, update, delete on public.user_alert_prefs to authenticated;

create table if not exists public.blood_needs (
  id uuid primary key default gen_random_uuid(),
  facility text not null check (char_length(btrim(facility)) between 2 and 150),
  region_id uuid references public.regions(id) on delete set null,
  blood_groups text[] not null default '{}' check (blood_groups <@ array['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']),
  message text check (char_length(coalesce(message, '')) <= 400),
  where_to_give text check (char_length(coalesce(where_to_give, '')) <= 200),
  contact_phone text check (contact_phone is null or public.valid_phone(contact_phone)),
  source text not null check (char_length(btrim(source)) between 3 and 200),     -- qui a signalé le besoin
  expires_at timestamptz not null,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.blood_needs enable row level security;
drop policy if exists "pp_blood_needs_read" on public.blood_needs;
create policy "pp_blood_needs_read" on public.blood_needs for select to anon, authenticated using ((active and expires_at > now()) or public.is_admin());
revoke insert, update, delete on public.blood_needs from anon, authenticated;
grant select on public.blood_needs to anon, authenticated;

create table if not exists public.health_alerts (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('faux_medicament', 'rappel_lot', 'campagne', 'epidemie', 'autre')),
  title text not null check (char_length(btrim(title)) between 5 and 160),
  body text not null check (char_length(btrim(body)) between 10 and 2000),
  source_name text not null check (char_length(btrim(source_name)) between 3 and 160),
  source_url text not null check (source_url ~ '^https?://'),
  region_id uuid references public.regions(id) on delete set null,
  published_at timestamptz not null default now(),
  expires_at timestamptz,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null
);
create index if not exists health_alerts_pub on public.health_alerts (published_at desc);
alter table public.health_alerts enable row level security;
drop policy if exists "pp_health_alerts_read" on public.health_alerts;
create policy "pp_health_alerts_read" on public.health_alerts for select to anon, authenticated
  using ((active and published_at <= now() and (expires_at is null or expires_at > now())) or public.is_admin());
revoke insert, update, delete on public.health_alerts from anon, authenticated;
grant select on public.health_alerts to anon, authenticated;

create or replace function public.admin_save_blood_need(p jsonb, p_notify boolean default true)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_admin(); v_id uuid := nullif(p ->> 'id', '')::uuid; v_phone text; v_groups text[]; n int := 0;
begin
  v_phone := case when btrim(coalesce(p ->> 'contact_phone', '')) = '' then null else public.normalize_ml_phone(p ->> 'contact_phone') end;
  if btrim(coalesce(p ->> 'contact_phone', '')) <> '' and v_phone is null then raise exception 'PP422: téléphone invalide'; end if;
  select coalesce(array_agg(distinct g), '{}') into v_groups from jsonb_array_elements_text(coalesce(p -> 'blood_groups', '[]')) g;
  if v_id is null then
    insert into public.blood_needs (facility, region_id, blood_groups, message, where_to_give, contact_phone, source, expires_at, created_by)
    values (btrim(p ->> 'facility'), nullif(p ->> 'region_id', '')::uuid, v_groups, nullif(btrim(coalesce(p ->> 'message', '')), ''),
            nullif(btrim(coalesce(p ->> 'where_to_give', '')), ''), v_phone, btrim(coalesce(p ->> 'source', '')),
            coalesce(nullif(p ->> 'expires_at', '')::timestamptz, now() + interval '3 days'), uid)
    returning id into v_id;
    if p_notify then
      insert into public.notifications (user_id, kind, title, body, link)
      select a.user_id, 'sang', 'Besoin de sang' || case when cardinality(v_groups) > 0 then ' ' || array_to_string(v_groups, ', ') else '' end,
             btrim(p ->> 'facility') || ' : un don peut sauver une vie. Voir où donner.', '/don-de-sang'
        from public.user_alert_prefs a join public.profiles pr on pr.id = a.user_id and pr.deleted_at is null
       where a.blood_alerts
         and (cardinality(v_groups) = 0 or a.blood_group is null or a.blood_group = any(v_groups))
         and (a.region_id is null or nullif(p ->> 'region_id', '') is null or a.region_id = (p ->> 'region_id')::uuid);
      get diagnostics n = row_count;
    end if;
  elsif not (p ? 'facility') then
    update public.blood_needs set active = coalesce((p ->> 'active')::boolean, active) where id = v_id;
  else
    update public.blood_needs set facility = btrim(p ->> 'facility'), region_id = nullif(p ->> 'region_id', '')::uuid, blood_groups = v_groups,
      message = nullif(btrim(coalesce(p ->> 'message', '')), ''), where_to_give = nullif(btrim(coalesce(p ->> 'where_to_give', '')), ''),
      contact_phone = v_phone, source = btrim(coalesce(p ->> 'source', '')), expires_at = coalesce(nullif(p ->> 'expires_at', '')::timestamptz, expires_at),
      active = coalesce((p ->> 'active')::boolean, active)
    where id = v_id;
  end if;
  perform public.log_audit('blood_need.save', 'blood_need', v_id::text, jsonb_build_object('notified', n));
  return v_id;
exception
  when check_violation or invalid_datetime_format or invalid_text_representation then
    raise exception 'PP422: valeurs invalides (établissement, source du signalement, groupes, date de fin)';
end $$;

create or replace function public.admin_save_health_alert(p jsonb, p_notify boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_admin(); v_id uuid := nullif(p ->> 'id', '')::uuid; n int := 0;
begin
  if v_id is null then
    insert into public.health_alerts (kind, title, body, source_name, source_url, region_id, published_at, expires_at, created_by)
    values (p ->> 'kind', btrim(p ->> 'title'), btrim(p ->> 'body'), btrim(p ->> 'source_name'), btrim(p ->> 'source_url'),
            nullif(p ->> 'region_id', '')::uuid, coalesce(nullif(p ->> 'published_at', '')::timestamptz, now()), nullif(p ->> 'expires_at', '')::timestamptz, uid)
    returning id into v_id;
    if p_notify then
      insert into public.notifications (user_id, kind, title, body, link)
      select a.user_id, 'alerte', 'Alerte sanitaire', btrim(p ->> 'title'), '/alertes'
        from public.user_alert_prefs a join public.profiles pr on pr.id = a.user_id and pr.deleted_at is null
       where a.health_alerts and (a.region_id is null or nullif(p ->> 'region_id', '') is null or a.region_id = (p ->> 'region_id')::uuid);
      get diagnostics n = row_count;
    end if;
  elsif not (p ? 'title') then
    update public.health_alerts set active = coalesce((p ->> 'active')::boolean, active) where id = v_id;
  else
    update public.health_alerts set kind = p ->> 'kind', title = btrim(p ->> 'title'), body = btrim(p ->> 'body'), source_name = btrim(p ->> 'source_name'),
      source_url = btrim(p ->> 'source_url'), region_id = nullif(p ->> 'region_id', '')::uuid, expires_at = nullif(p ->> 'expires_at', '')::timestamptz,
      active = coalesce((p ->> 'active')::boolean, active)
    where id = v_id;
  end if;
  perform public.log_audit('health_alert.save', 'health_alert', v_id::text, jsonb_build_object('notified', n));
  return v_id;
exception
  when check_violation or not_null_violation or invalid_datetime_format or invalid_text_representation then
    raise exception 'PP422: valeurs invalides (titre, texte, nom et lien de la source officielle obligatoires)';
end $$;

revoke execute on function public.admin_save_blood_need(jsonb, boolean), public.admin_save_health_alert(jsonb, boolean) from public, anon;
grant execute on function public.admin_save_blood_need(jsonb, boolean), public.admin_save_health_alert(jsonb, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Rappels (appelés toutes les 10 minutes par run_maintenance). Heure du Mali = UTC.
-- ---------------------------------------------------------------------------
create or replace function public.health_tools_reminders()
returns int language plpgsql security definer set search_path = public as $$
declare n int := 0; k int; today date := (now() at time zone 'utc')::date; hm text := to_char(now() at time zone 'utc', 'HH24:MI');
begin
  -- Vaccins : 3 jours avant et le jour du rendez-vous, s'il reste au moins une dose à faire
  with v as (
    select c.id as child_id, c.user_id, c.first_name, s.visit_key, min(s.visit_label) as visit_label, (c.birth_date + min(s.age_days)) as due,
           case when c.birth_date + min(s.age_days) = today + 3 then 'j-3' else 'j0' end as kind
      from public.children c join public.vaccine_schedule s on (not s.girls_only or c.sex = 'F')
      join public.profiles pr on pr.id = c.user_id and pr.deleted_at is null
     where c.remind and not exists (select 1 from public.child_vaccinations cv where cv.child_id = c.id and cv.dose_code = s.code)
     group by c.id, c.user_id, c.first_name, c.birth_date, s.visit_key
    having c.birth_date + min(s.age_days) in (today, today + 3)),
  ins as (
    insert into public.child_reminder_log (child_id, visit_key, kind)
    select child_id, visit_key, kind from v on conflict do nothing returning child_id, visit_key, kind)
  insert into public.notifications (user_id, kind, title, body, link)
  select v.user_id, 'vaccin', 'Vaccins de ' || v.first_name || case when ins.kind = 'j-3' then ' dans 3 jours' else ' aujourd''hui' end,
         'Rendez-vous des ' || v.visit_label || ' : allez au centre de santé avec le carnet de vaccination.', '/ma-sante/enfants/' || v.child_id
    from ins join v on v.child_id = ins.child_id and v.visit_key = ins.visit_key and v.kind = ins.kind;
  get diagnostics k = row_count; n := n + k;

  -- Prises de traitement : notification à l'heure prévue (fenêtre de 30 minutes)
  with due as (
    select t.id, t.user_id, s.slot
      from public.treatments t cross join unnest(t.times) as s(slot)
      join public.profiles pr on pr.id = t.user_id and pr.deleted_at is null
     where t.active and t.remind_intake and t.start_date <= today
       and (t.duration_days is null or today < t.start_date + t.duration_days)
       and s.slot <= hm and s.slot > to_char((now() at time zone 'utc') - interval '30 minutes', 'HH24:MI')),
  ins as (
    insert into public.treatment_intakes (treatment_id, day, slot, notified_at)
    select id, today, slot, now() from due
    on conflict (treatment_id, day, slot) do nothing returning treatment_id)
  insert into public.notifications (user_id, kind, title, body, link)
  select t.user_id, 'traitement', 'C''est l''heure de votre traitement', 'Ouvrez PharmaProxi pour le noter comme pris.', '/ma-sante/traitements'
    from ins join public.treatments t on t.id = ins.treatment_id;
  get diagnostics k = row_count; n := n + k;

  -- Renouvellement : 5 jours de stock restant (au plus une fois par semaine)
  with r as (
    update public.treatments t set renewal_notified_on = today
     where t.active and t.remind_renewal and public.treatment_days_left(t, today) is not null and public.treatment_days_left(t, today) <= 5
       and (t.duration_days is null or t.start_date + t.duration_days > today + 2)
       and (t.renewal_notified_on is null or t.renewal_notified_on <= today - 7)
       and exists (select 1 from public.profiles pr where pr.id = t.user_id and pr.deleted_at is null)
    returning t.user_id, t.name)
  insert into public.notifications (user_id, kind, title, body, link)
  select user_id, 'traitement', 'Votre traitement se termine bientôt', 'Pensez à renouveler votre ordonnance et à racheter : ' || name || '.',
         '/recherche?q=' || replace(left(name, 60), ' ', '+') from r;
  get diagnostics k = row_count; n := n + k;

  delete from public.treatment_intakes where day < today - 120;
  return n;
end $$;
revoke execute on function public.health_tools_reminders() from public, anon, authenticated;

create or replace function public.run_maintenance()
returns jsonb language plpgsql security definer set search_path = public as $$
declare expired int; rl int; logs int; notifs int; outbox int; issues int; reminders int; appts int; appt_rem int; svc int; femme int; ai int; tools int;
begin
  expired := public.expire_overdue_orders();
  appts := public.expire_appointments();
  appt_rem := public.send_appointment_reminders();
  svc := public.purge_services();
  femme := public.femme_send_reminders();
  ai := public.purge_assistant_usage();
  tools := public.health_tools_reminders();
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
                                      'directory_reminders', reminders, 'appointments_expired', appts, 'appointment_reminders', appt_rem,
                                      'services', svc, 'femme_reminders', femme, 'assistant_usage', ai, 'health_tools', tools), issues);
  delete from public.maintenance_runs where ran_at < now() - interval '30 days';
  return jsonb_build_object('expired', expired, 'appointments_expired', appts, 'appointment_reminders', appt_rem, 'femme_reminders', femme,
    'health_tools', tools,
    'purged', jsonb_build_object('rate_limits', rl, 'search_logs', logs, 'notifications', notifs, 'outbox', outbox,
                                 'directory_reminders', reminders, 'services', svc, 'assistant_usage', ai),
    'critical_issues', issues);
end $$;
revoke execute on function public.run_maintenance() from public, anon, authenticated;

-- Suppression du compte : les données personnelles de santé partent avec lui (y compris PharmaProxi Femme)
create or replace function public.purge_personal_health_data()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    delete from public.children where user_id = new.id;
    delete from public.treatments where user_id = new.id;
    delete from public.health_measures where user_id = new.id;
    delete from public.user_alert_prefs where user_id = new.id;
    delete from public.femme_days where user_id = new.id;
    delete from public.femme_periods where user_id = new.id;
    delete from public.femme_reminders where user_id = new.id;
    delete from public.femme_access_log where user_id = new.id;
    delete from public.femme_profiles where user_id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists profiles_purge_health on public.profiles;
create trigger profiles_purge_health after update of deleted_at on public.profiles for each row execute function public.purge_personal_health_data();
revoke execute on function public.purge_personal_health_data() from public, anon, authenticated;

-- >>> 20261103000100_pharmacist_questions.sql
-- ============================================================================
-- PharmaProxi — Migration : questions aux pharmaciens + comparaison des équivalents
--   1. Un utilisateur pose une question ; les pharmaciens des pharmacies vérifiées
--      répondent sous leur nom. L'identité du demandeur n'est jamais montrée.
--      Publication (anonyme) seulement si le demandeur l'accepte.
--   2. Équivalents d'un médicament : même principe actif et même dosage, avec la
--      fourchette des prix déclarés par les pharmacies vérifiées.
-- Peut être relancé sans erreur.
-- ============================================================================

create table if not exists public.pharmacist_questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  question text not null check (char_length(btrim(question)) between 15 and 1000),
  about text not null default 'moi' check (about in ('moi', 'enfant', 'femme_enceinte', 'personne_agee', 'autre')),
  allow_public boolean not null default false,
  urgent boolean not null default false,
  status text not null default 'open' check (status in ('open', 'answered', 'closed')),
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  search_text text generated always as (public.normalize_text(question)) stored
);
create index if not exists pq_status on public.pharmacist_questions (status, created_at desc) where not hidden;
alter table public.pharmacist_questions enable row level security;
drop policy if exists "pp_pq_owner" on public.pharmacist_questions;
create policy "pp_pq_owner" on public.pharmacist_questions for select to authenticated using (user_id = auth.uid() or public.is_admin());
revoke all on public.pharmacist_questions from anon, authenticated;
grant select on public.pharmacist_questions to authenticated;

create table if not exists public.pharmacist_answers (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.pharmacist_questions(id) on delete cascade,
  pharmacist_id uuid references public.profiles(id) on delete set null,
  pharmacy_id uuid references public.pharmacies(id) on delete set null,
  author_name text not null check (char_length(btrim(author_name)) between 2 and 120),
  pharmacy_name text not null,
  body text not null check (char_length(btrim(body)) between 10 and 2000),
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists pa_question on public.pharmacist_answers (question_id);
create unique index if not exists pa_one_per_pharmacist on public.pharmacist_answers (question_id, pharmacist_id);
alter table public.pharmacist_answers enable row level security;
drop policy if exists "pp_pa_read" on public.pharmacist_answers;
create policy "pp_pa_read" on public.pharmacist_answers for select to authenticated using (
  public.is_admin() or exists (select 1 from public.pharmacist_questions q where q.id = question_id and q.user_id = auth.uid()));
revoke all on public.pharmacist_answers from anon, authenticated;
grant select on public.pharmacist_answers to authenticated;

-- Pharmacien d'une pharmacie vérifiée (au moins une)
create or replace function public.is_verified_pharmacist()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.pharmacy_members m join public.pharmacies p on p.id = m.pharmacy_id
                  where m.user_id = auth.uid() and p.status = 'verified')
$$;

create or replace function public.ask_pharmacist(p_question text, p_about text default 'moi', p_public boolean default false, p_urgent boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_auth(); v_id uuid;
begin
  if (select count(*) from public.pharmacist_questions where user_id = uid and created_at > now() - interval '1 day') >= 3 then
    raise exception 'PP429: 3 questions par jour au maximum';
  end if;
  insert into public.pharmacist_questions (user_id, question, about, allow_public, urgent)
  values (uid, btrim(p_question), coalesce(nullif(p_about, ''), 'moi'), coalesce(p_public, false), coalesce(p_urgent, false))
  returning id into v_id;
  return v_id;
exception
  when check_violation then raise exception 'PP422: question entre 15 et 1 000 caractères';
end $$;

create or replace function public.close_my_question(p_id uuid, p_delete boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_auth();
begin
  if p_delete then delete from public.pharmacist_questions where id = p_id and user_id = uid;
  else update public.pharmacist_questions set status = 'closed' where id = p_id and user_id = uid; end if;
end $$;

-- File des questions pour les pharmaciens (sans identité du demandeur)
create or replace function public.pharmacist_question_queue(p_filter text default 'open', p_limit int default 20, p_offset int default 0)
returns table (id uuid, question text, about text, urgent boolean, status text, created_at timestamptz, answers bigint, mine boolean, total_count bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_verified_pharmacist() then raise exception 'PP403: réservé aux pharmaciens des pharmacies vérifiées'; end if;
  return query
  select q.id, q.question, q.about, q.urgent, q.status, q.created_at,
         (select count(*) from public.pharmacist_answers a where a.question_id = q.id and not a.hidden),
         exists (select 1 from public.pharmacist_answers a where a.question_id = q.id and a.pharmacist_id = auth.uid()),
         count(*) over ()
    from public.pharmacist_questions q
   where not q.hidden and q.status <> 'closed'
     and case p_filter when 'open' then q.status = 'open'
                       when 'mine' then exists (select 1 from public.pharmacist_answers a where a.question_id = q.id and a.pharmacist_id = auth.uid())
                       else true end
   order by q.urgent desc, q.created_at asc
   limit least(greatest(coalesce(p_limit, 20), 1), 50) offset greatest(coalesce(p_offset, 0), 0);
end $$;

create or replace function public.pharmacist_question_answers(p_question uuid)
returns table (id uuid, author_name text, pharmacy_name text, body text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_verified_pharmacist() or public.is_admin()
          or exists (select 1 from public.pharmacist_questions q where q.id = p_question and (q.user_id = auth.uid() or (q.allow_public and not q.hidden)))) then
    raise exception 'PP403: accès refusé';
  end if;
  return query select a.id, a.author_name, a.pharmacy_name, a.body, a.created_at from public.pharmacist_answers a
    where a.question_id = p_question and not a.hidden order by a.created_at;
end $$;

create or replace function public.answer_question(p_question uuid, p_pharmacy uuid, p_body text)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_auth(); v_name text; v_ph text; v_id uuid; v_owner uuid;
begin
  if not public.is_pharmacy_member(p_pharmacy) or not exists (select 1 from public.pharmacies where id = p_pharmacy and status = 'verified') then
    raise exception 'PP403: réservé aux pharmaciens des pharmacies vérifiées';
  end if;
  select nullif(btrim(full_name), '') into v_name from public.profiles where id = uid;
  if v_name is null then raise exception 'PP422: renseignez votre nom dans Mon compte : il est affiché avec votre réponse'; end if;
  select name into v_ph from public.pharmacies where id = p_pharmacy;
  select user_id into v_owner from public.pharmacist_questions where id = p_question and not hidden and status <> 'closed';
  if v_owner is null then raise exception 'PP404: question introuvable ou close'; end if;
  insert into public.pharmacist_answers (question_id, pharmacist_id, pharmacy_id, author_name, pharmacy_name, body)
  values (p_question, uid, p_pharmacy, v_name, v_ph, btrim(p_body))
  on conflict (question_id, pharmacist_id) do update set body = excluded.body, pharmacy_id = excluded.pharmacy_id, pharmacy_name = excluded.pharmacy_name, created_at = now()
  returning id into v_id;
  update public.pharmacist_questions set status = 'answered', answered_at = coalesce(answered_at, now()) where id = p_question;
  perform public.notify_user(v_owner, 'question', 'Un pharmacien a répondu à votre question', 'Réponse de ' || v_name || ' (' || v_ph || ').', null, '/questions-pharmacien/mes-questions');
  return v_id;
exception
  when check_violation then raise exception 'PP422: réponse entre 10 et 2 000 caractères';
end $$;

create or replace function public.public_pharmacist_questions(p_query text default null, p_limit int default 20, p_offset int default 0)
returns table (id uuid, question text, about text, answered_at timestamptz, answers jsonb, total_count bigint)
language sql stable security definer set search_path = public, extensions as $$
  with q0 as (select nullif(public.normalize_text(left(coalesce(p_query, ''), 80)), '') as t)
  select q.id, q.question, q.about, q.answered_at,
         (select coalesce(jsonb_agg(jsonb_build_object('author', a.author_name, 'pharmacy', a.pharmacy_name, 'body', a.body, 'at', a.created_at) order by a.created_at), '[]')
            from public.pharmacist_answers a where a.question_id = q.id and not a.hidden),
         count(*) over ()
    from public.pharmacist_questions q cross join q0
   where q.allow_public and not q.hidden and q.status in ('answered', 'closed')
     and exists (select 1 from public.pharmacist_answers a where a.question_id = q.id and not a.hidden)
     and (q0.t is null or not exists (select 1 from regexp_split_to_table(q0.t, '\s+') w where w <> '' and q.search_text not like '%' || w || '%'))
   order by q.answered_at desc
   limit least(greatest(coalesce(p_limit, 20), 1), 50) offset greatest(coalesce(p_offset, 0), 0)
$$;

create or replace function public.admin_moderate_question(p_question uuid, p_answer uuid, p_hidden boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  if p_answer is not null then update public.pharmacist_answers set hidden = p_hidden where id = p_answer;
  else update public.pharmacist_questions set hidden = p_hidden where id = p_question; end if;
  perform public.log_audit('question.moderate', 'pharmacist_question', coalesce(p_answer, p_question)::text, jsonb_build_object('hidden', p_hidden));
end $$;

revoke execute on function public.ask_pharmacist(text, text, boolean, boolean), public.close_my_question(uuid, boolean), public.pharmacist_question_queue(text, int, int),
  public.answer_question(uuid, uuid, text), public.admin_moderate_question(uuid, uuid, boolean), public.is_verified_pharmacist() from public, anon;
grant execute on function public.ask_pharmacist(text, text, boolean, boolean), public.close_my_question(uuid, boolean), public.pharmacist_question_queue(text, int, int),
  public.answer_question(uuid, uuid, text), public.admin_moderate_question(uuid, uuid, boolean), public.is_verified_pharmacist() to authenticated;
grant execute on function public.public_pharmacist_questions(text, int, int), public.pharmacist_question_answers(uuid) to anon, authenticated;

-- Purge à la suppression du compte (questions privées)
create or replace function public.purge_personal_health_data()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    delete from public.children where user_id = new.id;
    delete from public.treatments where user_id = new.id;
    delete from public.health_measures where user_id = new.id;
    delete from public.user_alert_prefs where user_id = new.id;
    delete from public.pharmacist_questions where user_id = new.id and not (allow_public and status <> 'open');
    delete from public.femme_days where user_id = new.id;
    delete from public.femme_periods where user_id = new.id;
    delete from public.femme_reminders where user_id = new.id;
    delete from public.femme_access_log where user_id = new.id;
    delete from public.femme_profiles where user_id = new.id;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Équivalents : même principe actif et même dosage
-- ---------------------------------------------------------------------------
create or replace function public.ingredient_key(p text)
returns text language sql immutable set search_path = public as $$
  select btrim(regexp_replace(regexp_replace(public.normalize_text(coalesce(p, '')), '[^a-z0-9+ ]+', ' ', 'g'), '\s+', ' ', 'g'))
$$;

create or replace function public.dose_key(p text)
returns text language sql immutable set search_path = public as $$
  select regexp_replace(regexp_replace(public.normalize_text(coalesce(p, '')), ',', '.', 'g'), '\s+', '', 'g')
$$;

-- Prix déclarés (pharmacies vérifiées, stock non périmé) par produit du catalogue
create or replace function public.equivalent_products(p_catalog uuid)
returns table (catalog_id uuid, brand_name text, dosage text, form text, packaging text, manufacturer text, is_same boolean,
               min_price int, max_price int, pharmacies bigint)
language sql stable security definer set search_path = public as $$
  with ref as (select public.ingredient_key(coalesce(nullif(active_ingredient, ''), generic_name)) as ing, public.dose_key(dosage) as dk,
                      public.normalize_text(coalesce(form, '')) as fm
                 from public.medicine_catalog where id = p_catalog),
  cands as (
    select c.* from public.medicine_catalog c, ref
     where c.merged_into is null and c.review_status <> 'rejected' and ref.ing <> ''
       and public.ingredient_key(coalesce(nullif(c.active_ingredient, ''), c.generic_name)) = ref.ing
       and public.dose_key(c.dosage) = ref.dk
       and (ref.fm = '' or public.normalize_text(coalesce(c.form, '')) = '' or public.normalize_text(c.form) = ref.fm))
  select c.id, c.brand_name, c.dosage, c.form, c.packaging, c.manufacturer, c.id = p_catalog,
         min(i.price_xof), max(i.price_xof), count(distinct i.pharmacy_id) filter (where i.price_xof is not null)
    from cands c
    left join public.pharmacy_inventory i on i.catalog_id = c.id and i.price_xof is not null and i.quantity > 0 and i.is_available and i.stock_updated_at > now() - interval '30 days'
     and exists (select 1 from public.pharmacies p where p.id = i.pharmacy_id and p.status = 'verified')
   group by c.id, c.brand_name, c.dosage, c.form, c.packaging, c.manufacturer
   order by min(i.price_xof) nulls last, c.brand_name
   limit 30
$$;

-- Recherche par nom → groupes « principe actif + dosage » avec la fourchette de prix
create or replace function public.compare_prices(p_query text, p_limit int default 20)
returns table (ingredient text, dosage text, form text, products bigint, min_price int, max_price int, pharmacies bigint, sample_catalog uuid, brands text[])
language sql stable security definer set search_path = public, extensions as $$
  with q as (select nullif(public.normalize_text(left(coalesce(p_query, ''), 80)), '') as t),
  hits as (
    select public.ingredient_key(coalesce(nullif(c.active_ingredient, ''), c.generic_name)) as ing, public.dose_key(c.dosage) as dk
      from public.medicine_catalog c, q
     where q.t is not null and c.merged_into is null and c.review_status <> 'rejected'
       and c.search_text like '%' || q.t || '%'
       and public.ingredient_key(coalesce(nullif(c.active_ingredient, ''), c.generic_name)) <> ''
     group by 1, 2 limit 20),
  grp as (
    select h.ing, h.dk, c.id, c.brand_name, coalesce(nullif(c.active_ingredient, ''), c.generic_name) as ing_label, c.dosage, c.form
      from hits h join public.medicine_catalog c on c.merged_into is null and c.review_status <> 'rejected'
       and public.ingredient_key(coalesce(nullif(c.active_ingredient, ''), c.generic_name)) = h.ing and public.dose_key(c.dosage) = h.dk)
  select min(g.ing_label), min(g.dosage), min(g.form), count(distinct g.id), min(i.price_xof), max(i.price_xof),
         count(distinct i.pharmacy_id), (array_agg(g.id order by i.price_xof nulls last))[1], array_agg(distinct g.brand_name)
    from grp g
    left join public.pharmacy_inventory i on i.catalog_id = g.id and i.price_xof is not null and i.quantity > 0 and i.is_available and i.stock_updated_at > now() - interval '30 days'
     and exists (select 1 from public.pharmacies p where p.id = i.pharmacy_id and p.status = 'verified')
   group by g.ing, g.dk
   order by count(distinct i.pharmacy_id) desc, min(g.ing_label)
   limit least(greatest(coalesce(p_limit, 20), 1), 40)
$$;
alter function public.compare_prices(text, int) set statement_timeout = '5s';
grant execute on function public.equivalent_products(uuid), public.compare_prices(text, int) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Santé essentielle : sections « Que faire » et « À ne pas faire » (fiches de premiers secours)
-- ---------------------------------------------------------------------------
create or replace function public.health_clean_body(p jsonb)
returns jsonb language sql immutable as $$
  select coalesce(jsonb_object_agg(k, to_jsonb(left(btrim(v), 6000))), '{}'::jsonb)
  from jsonb_each_text(coalesce(p, '{}'::jsonb)) as t(k, v)
  where k in ('definition', 'gestes', 'a_eviter', 'importance', 'situations', 'prevention', 'examens', 'deroulement', 'preparation',
              'resultats', 'quand_consulter', 'urgence', 'ou_au_mali')
    and nullif(btrim(v), '') is not null
$$;

-- >>> 20261104000100_health_record.sql
-- =============================================================================
-- PharmaProxi 0.19 — Mon dossier santé
-- Dossier tenu par le patient lui-même, pour lui et pour ses proches.
-- Personne d'autre n'y a accès : ni médecin, ni pharmacie, ni assureur, ni administrateur.
-- Protégé par un code à 4–6 chiffres (empreinte bcrypt) ; tout est effacé avec le compte.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Code d'accès
-- ---------------------------------------------------------------------------
create table if not exists public.record_settings (
  user_id uuid primary key default auth.uid() references public.profiles(id) on delete cascade,
  pin_hash text,
  pin_failures int not null default 0,
  pin_blocked_until timestamptz,
  unlocked_until timestamptz,
  created_at timestamptz not null default now()
);
alter table public.record_settings enable row level security;
revoke all on public.record_settings from anon, authenticated;

create or replace function public.record_unlocked(p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select p_user is not null and not exists (
    select 1 from public.record_settings s where s.user_id = p_user and s.pin_hash is not null and coalesce(s.unlocked_until, '-infinity') <= now())
$$;

create or replace function public.record_status()
returns jsonb language sql stable security definer set search_path = public as $$
  select case when auth.uid() is null then jsonb_build_object('signed_in', false)
    else jsonb_build_object('signed_in', true,
      'has_pin', exists (select 1 from public.record_settings s where s.user_id = auth.uid() and s.pin_hash is not null),
      'locked', not public.record_unlocked(auth.uid()),
      'blocked_until', (select s.pin_blocked_until from public.record_settings s where s.user_id = auth.uid() and s.pin_blocked_until > now()))
  end
$$;

create or replace function public.record_set_pin(p_pin text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'PP401: connectez-vous'; end if;
  if not public.record_unlocked(uid) then raise exception 'PP423: dossier verrouillé, saisissez votre code'; end if;
  insert into public.record_settings (user_id) values (uid) on conflict (user_id) do nothing;
  if p_pin is null or p_pin = '' then
    update public.record_settings set pin_hash = null, unlocked_until = null, pin_failures = 0, pin_blocked_until = null where user_id = uid;
    return;
  end if;
  if p_pin !~ '^[0-9]{4,6}$' then raise exception 'PP422: le code doit contenir 4 à 6 chiffres'; end if;
  update public.record_settings set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf', 8)), pin_failures = 0,
         pin_blocked_until = null, unlocked_until = now() + interval '30 minutes' where user_id = uid;
end $$;

create or replace function public.record_unlock(p_pin text)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare uid uuid := auth.uid(); s public.record_settings;
begin
  if uid is null then raise exception 'PP401: connectez-vous'; end if;
  select * into s from public.record_settings where user_id = uid for update;
  if not found or s.pin_hash is null then return true; end if;
  if s.pin_blocked_until > now() then raise exception 'PP429: trop d''essais, réessayez dans quelques minutes'; end if;
  if extensions.crypt(coalesce(p_pin, ''), s.pin_hash) = s.pin_hash then
    update public.record_settings set pin_failures = 0, pin_blocked_until = null, unlocked_until = now() + interval '30 minutes' where user_id = uid;
    return true;
  end if;
  update public.record_settings set
    pin_failures = case when pin_failures + 1 >= 5 then 0 else pin_failures + 1 end,
    pin_blocked_until = case when pin_failures + 1 >= 5 then now() + interval '15 minutes' end
  where user_id = uid;
  return false;
end $$;

create or replace function public.record_lock()
returns void language sql security definer set search_path = public as $$
  update public.record_settings set unlocked_until = null where user_id = auth.uid()
$$;

-- Chaque action prolonge l'ouverture de 30 minutes
create or replace function public.record_touch()
returns void language sql security definer set search_path = public as $$
  update public.record_settings set unlocked_until = now() + interval '30 minutes'
   where user_id = auth.uid() and pin_hash is not null and unlocked_until > now()
$$;

-- ---------------------------------------------------------------------------
-- 2. Personnes : moi et mes proches (enfants, parents âgés…)
-- ---------------------------------------------------------------------------
create table if not exists public.record_persons (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  is_self boolean not null default false,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 60),
  relation text check (relation in ('moi', 'enfant', 'pere', 'mere', 'conjoint', 'grand-parent', 'frere-soeur', 'autre')),
  birth_year int check (birth_year between 1900 and 2100),
  sex text check (sex in ('F', 'M')),
  created_at timestamptz not null default now()
);
create unique index if not exists record_persons_self on public.record_persons (owner_id) where is_self;
create index if not exists record_persons_owner on public.record_persons (owner_id);

create or replace function public.record_owns(p_person uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.record_persons p where p.id = p_person and p.owner_id = auth.uid())
$$;

create or replace function public.record_person_limit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.record_persons where owner_id = new.owner_id) >= 11 then raise exception 'PP429: 10 proches maximum'; end if;
  return new;
end $$;
drop trigger if exists record_persons_limit on public.record_persons;
create trigger record_persons_limit before insert on public.record_persons for each row execute function public.record_person_limit();

-- Dossier « moi » créé à la première ouverture
create or replace function public.record_ensure_self()
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); pid uuid;
begin
  if uid is null then raise exception 'PP401: connectez-vous'; end if;
  if not public.record_unlocked(uid) then raise exception 'PP423: dossier verrouillé, saisissez votre code'; end if;
  select id into pid from public.record_persons where owner_id = uid and is_self;
  if pid is null then
    insert into public.record_persons (owner_id, is_self, display_name, relation)
    values (uid, true, coalesce(nullif(btrim((select full_name from public.profiles where id = uid)), ''), 'Moi'), 'moi')
    on conflict do nothing returning id into pid;
    if pid is null then select id into pid from public.record_persons where owner_id = uid and is_self; end if;
  end if;
  return pid;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Informations essentielles, couverture, don de sang, contact d'urgence
-- ---------------------------------------------------------------------------
create table if not exists public.record_essentials (
  person_id uuid primary key references public.record_persons(id) on delete cascade,
  blood_group text check (blood_group in ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'inconnu')),
  height_cm int check (height_cm between 30 and 250),
  weight_kg numeric(5, 1) check (weight_kg between 1 and 400),
  pregnant boolean not null default false,
  breastfeeding boolean not null default false,
  emergency_name text check (char_length(coalesce(emergency_name, '')) <= 80),
  emergency_relation text check (char_length(coalesce(emergency_relation, '')) <= 40),
  emergency_phone text check (emergency_phone is null or emergency_phone ~ '^\+?[0-9 ]{8,20}$'),
  coverage text check (coverage in ('amo', 'inps', 'assurance', 'mutuelle', 'ramed', 'aucune')),
  insurer text check (char_length(coalesce(insurer, '')) <= 80),
  insured_number text check (char_length(coalesce(insured_number, '')) <= 40),
  last_donation date check (last_donation <= current_date + 1),
  donation_notified_for date,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 4. Éléments du dossier (une seule table, un « type » par rubrique)
-- ---------------------------------------------------------------------------
create table if not exists public.record_items (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.record_persons(id) on delete cascade,
  kind text not null check (kind in (
    'allergie', 'maladie', 'operation', 'hospitalisation', 'transfusion', 'famille', 'ancien_traitement',
    'analyse', 'consultation', 'preparation', 'rendez_vous', 'ordonnance', 'symptome', 'vaccin', 'soignant')),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  category text check (char_length(coalesce(category, '')) <= 60),
  severity text check (severity in ('legere', 'moderee', 'grave')),
  detail text check (char_length(coalesce(detail, '')) <= 4000),
  notes text check (char_length(coalesce(notes, '')) <= 4000),
  result text check (char_length(coalesce(result, '')) <= 4000),
  year int check (year between 1900 and 2100),
  event_date date check (event_date between date '1900-01-01' and current_date + 3660),
  event_time text check (event_time is null or event_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  next_date date check (next_date between date '1900-01-01' and current_date + 3660 * 3),
  place text check (char_length(coalesce(place, '')) <= 120),
  who text check (char_length(coalesce(who, '')) <= 120),
  phone text check (phone is null or phone ~ '^\+?[0-9 ]{8,20}$'),
  treatment_id uuid references public.treatments(id) on delete set null,
  reminded_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists record_items_person on public.record_items (person_id, kind);
create index if not exists record_items_due on public.record_items (kind, event_date) where kind in ('rendez_vous', 'vaccin');

create or replace function public.record_item_limit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.record_items where person_id = new.person_id) >= 600 then raise exception 'PP429: dossier plein (600 éléments)'; end if;
  return new;
end $$;
drop trigger if exists record_items_limit on public.record_items;
create trigger record_items_limit before insert on public.record_items for each row execute function public.record_item_limit();

create or replace function public.record_touch_row()
returns trigger language plpgsql as $$ begin new.updated_at := now(); return new; end $$;
drop trigger if exists record_items_touch on public.record_items;
create trigger record_items_touch before update on public.record_items for each row execute function public.record_touch_row();
drop trigger if exists record_essentials_touch on public.record_essentials;
create trigger record_essentials_touch before update on public.record_essentials for each row execute function public.record_touch_row();

-- ---------------------------------------------------------------------------
-- 5. Droits : uniquement le titulaire du compte, et seulement dossier ouvert
-- ---------------------------------------------------------------------------
alter table public.record_persons enable row level security;
alter table public.record_essentials enable row level security;
alter table public.record_items enable row level security;
drop policy if exists "pp_record_persons_own" on public.record_persons;
create policy "pp_record_persons_own" on public.record_persons for all to authenticated
  using (owner_id = auth.uid() and public.record_unlocked()) with check (owner_id = auth.uid() and public.record_unlocked());
drop policy if exists "pp_record_essentials_own" on public.record_essentials;
create policy "pp_record_essentials_own" on public.record_essentials for all to authenticated
  using (public.record_owns(person_id) and public.record_unlocked()) with check (public.record_owns(person_id) and public.record_unlocked());
drop policy if exists "pp_record_items_own" on public.record_items;
create policy "pp_record_items_own" on public.record_items for all to authenticated
  using (public.record_owns(person_id) and public.record_unlocked()) with check (public.record_owns(person_id) and public.record_unlocked());
revoke all on public.record_persons, public.record_essentials, public.record_items from anon;
grant select, insert, update, delete on public.record_persons, public.record_essentials, public.record_items to authenticated;
-- La date du dernier rappel de don est gérée par le serveur uniquement
revoke update on public.record_essentials from authenticated;
grant update (person_id, blood_group, height_cm, weight_kg, pregnant, breastfeeding, emergency_name, emergency_relation, emergency_phone,
              coverage, insurer, insured_number, last_donation, updated_at) on public.record_essentials to authenticated;
-- Un traitement lié doit appartenir au même compte
create or replace function public.record_item_check_treatment()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.treatment_id is not null and not exists (
      select 1 from public.treatments t join public.record_persons p on p.owner_id = t.user_id where t.id = new.treatment_id and p.id = new.person_id) then
    raise exception 'PP403: traitement inconnu';
  end if;
  return new;
end $$;
drop trigger if exists record_items_treatment on public.record_items;
create trigger record_items_treatment before insert or update of treatment_id on public.record_items for each row execute function public.record_item_check_treatment();

revoke execute on function public.record_status(), public.record_set_pin(text), public.record_unlock(text), public.record_lock(), public.record_touch(),
  public.record_ensure_self(), public.record_owns(uuid), public.record_unlocked(uuid) from public, anon;
grant execute on function public.record_status(), public.record_set_pin(text), public.record_unlock(text), public.record_lock(), public.record_touch(),
  public.record_ensure_self(), public.record_owns(uuid), public.record_unlocked(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Rappels (messages discrets : aucune information médicale dans la notification)
-- ---------------------------------------------------------------------------
create or replace function public.record_reminders()
returns int language plpgsql security definer set search_path = public as $$
declare n int := 0; k int; today date := (now() at time zone 'utc')::date;
begin
  -- Rendez-vous médical : la veille
  with r as (
    update public.record_items i set reminded_on = today
      from public.record_persons p join public.profiles pr on pr.id = p.owner_id and pr.deleted_at is null
     where p.id = i.person_id and i.kind = 'rendez_vous' and i.event_date = today + 1 and i.reminded_on is null
    returning p.owner_id, p.id as person_id, p.is_self, p.display_name, i.event_time)
  insert into public.notifications (user_id, kind, title, body, link)
  select owner_id, 'dossier', case when is_self then 'Rendez-vous médical demain' else 'Rendez-vous médical demain (' || display_name || ')' end,
         'Demain' || coalesce(' à ' || replace(event_time, ':', ' h '), '') || '. Pensez à préparer vos questions dans votre dossier.',
         '/ma-sante/dossier/consultations?p=' || person_id from r;
  get diagnostics k = row_count; n := n + k;

  -- Rappel de vaccin d'adulte : 7 jours avant la date indiquée par le patient
  with r as (
    update public.record_items i set reminded_on = today
      from public.record_persons p join public.profiles pr on pr.id = p.owner_id and pr.deleted_at is null
     where p.id = i.person_id and i.kind = 'vaccin' and i.next_date = today + 7 and (i.reminded_on is null or i.reminded_on < today - 30)
    returning p.owner_id, p.id as person_id, p.is_self, p.display_name)
  insert into public.notifications (user_id, kind, title, body, link)
  select owner_id, 'dossier', case when is_self then 'Rappel de vaccin dans 7 jours' else 'Rappel de vaccin dans 7 jours (' || display_name || ')' end,
         'Un rappel de vaccin est prévu dans une semaine. Vérifiez dans votre dossier.', '/ma-sante/dossier/antecedents?p=' || person_id from r;
  get diagnostics k = row_count; n := n + k;

  -- Don de sang : délai écoulé (3 mois pour un homme, 4 mois pour une femme ou si non précisé)
  with r as (
    update public.record_essentials e set donation_notified_for = e.last_donation
      from public.record_persons p join public.profiles pr on pr.id = p.owner_id and pr.deleted_at is null
     where p.id = e.person_id and p.is_self and e.last_donation is not null
       and e.donation_notified_for is distinct from e.last_donation
       and (e.last_donation + case when p.sex = 'M' then interval '3 months' else interval '4 months' end)::date <= today
       and (e.last_donation + case when p.sex = 'M' then interval '3 months' else interval '4 months' end)::date > today - 7
    returning p.owner_id)
  insert into public.notifications (user_id, kind, title, body, link)
  select owner_id, 'dossier', 'Vous pouvez de nouveau donner votre sang', 'Le délai depuis votre dernier don est écoulé. Merci pour votre générosité.', '/don-de-sang' from r;
  get diagnostics k = row_count; n := n + k;
  return n;
end $$;
revoke execute on function public.record_reminders() from public, anon, authenticated;

create or replace function public.run_maintenance()
returns jsonb language plpgsql security definer set search_path = public as $$
declare expired int; rl int; logs int; notifs int; outbox int; issues int; reminders int; appts int; appt_rem int; svc int; femme int; ai int; tools int; rec int;
begin
  expired := public.expire_overdue_orders();
  appts := public.expire_appointments();
  appt_rem := public.send_appointment_reminders();
  svc := public.purge_services();
  femme := public.femme_send_reminders();
  ai := public.purge_assistant_usage();
  tools := public.health_tools_reminders();
  rec := public.record_reminders();
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
                                      'directory_reminders', reminders, 'appointments_expired', appts, 'appointment_reminders', appt_rem,
                                      'services', svc, 'femme_reminders', femme, 'assistant_usage', ai, 'health_tools', tools, 'health_record', rec), issues);
  delete from public.maintenance_runs where ran_at < now() - interval '30 days';
  return jsonb_build_object('expired', expired, 'appointments_expired', appts, 'appointment_reminders', appt_rem, 'femme_reminders', femme,
    'health_tools', tools, 'health_record', rec,
    'purged', jsonb_build_object('rate_limits', rl, 'search_logs', logs, 'notifications', notifs, 'outbox', outbox,
                                 'directory_reminders', reminders, 'services', svc, 'assistant_usage', ai),
    'critical_issues', issues);
end $$;
revoke execute on function public.run_maintenance() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. Suppression du compte : le dossier part avec lui
-- ---------------------------------------------------------------------------
create or replace function public.purge_personal_health_data()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    delete from public.record_persons where owner_id = new.id;
    delete from public.record_settings where user_id = new.id;
    delete from public.children where user_id = new.id;
    delete from public.treatments where user_id = new.id;
    delete from public.health_measures where user_id = new.id;
    delete from public.user_alert_prefs where user_id = new.id;
    delete from public.pharmacist_questions where user_id = new.id and not (allow_public and status <> 'open');
    delete from public.femme_days where user_id = new.id;
    delete from public.femme_periods where user_id = new.id;
    delete from public.femme_reminders where user_id = new.id;
    delete from public.femme_access_log where user_id = new.id;
    delete from public.femme_profiles where user_id = new.id;
  end if;
  return new;
end $$;


-- >>> 20261105000100_authorities.sql
-- =============================================================================
-- PharmaProxi 0.20 — Espace Autorités, statistiques anonymes, signalements de
-- médicaments, courbe de croissance, campagnes de don de sang, avis des utilisateurs.
--
-- Règles des statistiques :
--   1. Uniquement des chiffres agrégés ; une case de moins de 10 n'est pas affichée.
--   2. Le dossier santé, le suivi Femme, les traitements, les mesures et la croissance
--      des enfants ne nourrissent JAMAIS les statistiques.
--   3. Accès réservé aux comptes désignés par l'administrateur, chaque consultation est
--      journalisée.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Membres des autorités et journal d'accès
-- ---------------------------------------------------------------------------
create table if not exists public.authority_members (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  scope text not null check (scope in ('ministere', 'dpm', 'cnts', 'ordre_pharmaciens', 'ordre_medecins', 'canam', 'autre')),
  organisation text not null check (char_length(btrim(organisation)) between 2 and 120),
  title text check (char_length(coalesce(title, '')) <= 120),
  active boolean not null default true,
  granted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.authority_members enable row level security;
drop policy if exists "pp_authority_self" on public.authority_members;
create policy "pp_authority_self" on public.authority_members for select to authenticated using (user_id = auth.uid() or public.is_admin());
revoke all on public.authority_members from anon;
revoke insert, update, delete on public.authority_members from authenticated;
grant select on public.authority_members to authenticated;

create table if not exists public.authority_access_log (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles(id) on delete set null,
  scope text,
  action text not null,
  params jsonb not null default '{}'::jsonb,
  at timestamptz not null default now()
);
create index if not exists authority_access_log_at on public.authority_access_log (at desc);
alter table public.authority_access_log enable row level security;
drop policy if exists "pp_authority_log_admin" on public.authority_access_log;
create policy "pp_authority_log_admin" on public.authority_access_log for select to authenticated using (public.is_admin());
revoke all on public.authority_access_log from anon;
revoke insert, update, delete on public.authority_access_log from authenticated;
grant select on public.authority_access_log to authenticated;

create or replace function public.authority_scope(p_user uuid default auth.uid())
returns text language sql stable security definer set search_path = public as $$
  select scope from public.authority_members where user_id = p_user and active
$$;

create or replace function public.is_authority()
returns boolean language sql stable security definer set search_path = public as $$
  select public.authority_scope(auth.uid()) is not null
$$;

-- Contrôle d'accès + journal. p_scopes null = toutes les autorités. L'administrateur passe toujours.
create or replace function public.authority_require(p_action text, p_params jsonb default '{}'::jsonb, p_scopes text[] default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_auth(); sc text := public.authority_scope(uid);
begin
  if not public.is_admin() and (sc is null or (p_scopes is not null and not sc = any(p_scopes))) then
    raise exception 'PP403: réservé aux autorités de santé désignées' using errcode = '42501';
  end if;
  insert into public.authority_access_log (user_id, scope, action, params) values (uid, coalesce(sc, 'admin'), p_action, coalesce(p_params, '{}'::jsonb));
  return uid;
end $$;

create or replace function public.admin_set_authority(p_email text, p_scope text, p_organisation text, p_title text default null, p_active boolean default true)
returns uuid language plpgsql security definer set search_path = public, auth as $$
declare uid uuid; me uuid := public.require_admin();
begin
  select u.id into uid from auth.users u join public.profiles p on p.id = u.id and p.deleted_at is null where lower(u.email) = lower(btrim(p_email));
  if uid is null then raise exception 'PP404: aucun compte avec cette adresse e-mail (la personne doit d''abord créer son compte)'; end if;
  insert into public.authority_members (user_id, scope, organisation, title, active, granted_by)
  values (uid, p_scope, btrim(p_organisation), nullif(btrim(coalesce(p_title, '')), ''), coalesce(p_active, true), me)
  on conflict (user_id) do update set scope = excluded.scope, organisation = excluded.organisation, title = excluded.title,
    active = excluded.active, granted_by = me, updated_at = now();
  perform public.log_audit(case when coalesce(p_active, true) then 'authority_grant' else 'authority_revoke' end, 'authority_member', uid::text,
    jsonb_build_object('scope', p_scope, 'organisation', p_organisation));
  return uid;
exception when check_violation then raise exception 'PP422: type d''autorité ou organisation invalide';
end $$;

-- ---------------------------------------------------------------------------
-- 2. Lectures de fiches (compteur anonyme par jour, sans aucune donnée de personne)
-- ---------------------------------------------------------------------------
create table if not exists public.article_daily_views (
  article_id uuid not null references public.health_articles(id) on delete cascade,
  day date not null,
  views int not null default 0,
  primary key (article_id, day)
);
alter table public.article_daily_views enable row level security;
revoke all on public.article_daily_views from anon, authenticated;

create or replace function public.log_article_view(p_slug text)
returns void language sql security definer set search_path = public as $$
  insert into public.article_daily_views (article_id, day, views)
  select id, (now() at time zone 'utc')::date, 1 from public.health_articles where slug = p_slug and status = 'published'
  on conflict (article_id, day) do update set views = public.article_daily_views.views + 1
$$;
revoke execute on function public.log_article_view(text) from public;
grant execute on function public.log_article_view(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Statistiques anonymes (seuil : 10)
-- ---------------------------------------------------------------------------
create or replace function public.stat_k() returns int language sql immutable as $$ select 10 $$;
create or replace function public.stat_mask(n bigint) returns bigint language sql immutable as $$ select case when n >= public.stat_k() then n end $$;

create or replace function public.authority_params(p_region uuid, p_from date, p_to date)
returns jsonb language sql immutable as $$
  select jsonb_build_object('region', p_region, 'from', p_from, 'to', p_to)
$$;

-- Vue d'ensemble
create or replace function public.authority_overview(p_region uuid default null, p_from date default null, p_to date default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare f timestamptz := coalesce(p_from, current_date - 30)::timestamptz; t timestamptz := (coalesce(p_to, current_date) + 1)::timestamptz;
  s_all bigint; s_none bigint; r jsonb;
begin
  perform public.authority_require('stats:overview', public.authority_params(p_region, p_from, p_to));
  select count(*), count(*) filter (where result_count = 0) into s_all, s_none
    from public.search_logs where kind = 'medicine' and created_at >= f and created_at < t and (p_region is null or region_id = p_region);
  r := jsonb_build_object(
    'searches', public.stat_mask(s_all),
    'searches_unfound', public.stat_mask(s_none),
    'unfound_rate', case when s_all >= public.stat_k() then round(100.0 * s_none / s_all) end,
    'pharmacies_verified', (select count(*) from public.pharmacies where status = 'verified' and not is_demo and (p_region is null or region_id = p_region)),
    'pharmacies_fresh_stock', (select count(distinct i.pharmacy_id) from public.pharmacy_inventory i join public.pharmacies p on p.id = i.pharmacy_id
        where p.status = 'verified' and not p.is_demo and i.stock_updated_at > now() - interval '30 days' and (p_region is null or p.region_id = p_region)),
    'on_duty_now', (select count(distinct d.pharmacy_id) from public.pharmacy_duty d join public.pharmacies p on p.id = d.pharmacy_id
        where now() between d.starts_at and d.ends_at and p.status = 'verified' and (p_region is null or p.region_id = p_region)),
    'blood_donors', public.stat_mask((select count(*) from public.user_alert_prefs a join public.profiles pr on pr.id = a.user_id and pr.deleted_at is null
        where a.blood_alerts and (p_region is null or a.region_id = p_region))),
    'questions', public.stat_mask((select count(*) from public.pharmacist_questions where created_at >= f and created_at < t)),
    'reports', public.stat_mask((select count(*) from public.drug_reports where created_at >= f and created_at < t and (p_region is null or region_id = p_region))),
    'k', public.stat_k());
  return r;
end $$;

-- Médicaments cherchés (sans résultat si p_unfound)
create or replace function public.authority_searches(p_region uuid default null, p_from date default null, p_to date default null, p_unfound boolean default true, p_limit int default 20)
returns table (query text, searches bigint, unfound bigint, regions bigint) language plpgsql security definer set search_path = public as $$
declare f timestamptz := coalesce(p_from, current_date - 30)::timestamptz; t timestamptz := (coalesce(p_to, current_date) + 1)::timestamptz;
begin
  perform public.authority_require(case when p_unfound then 'stats:unfound' else 'stats:searches' end, public.authority_params(p_region, p_from, p_to));
  return query
    select s.query_normalized, count(*), count(*) filter (where s.result_count = 0), count(distinct s.region_id)
      from public.search_logs s
     where s.kind = 'medicine' and s.created_at >= f and s.created_at < t and (p_region is null or s.region_id = p_region)
     group by s.query_normalized
    having (case when p_unfound then count(*) filter (where s.result_count = 0) else count(*) end) >= public.stat_k()
     order by (case when p_unfound then count(*) filter (where s.result_count = 0) else count(*) end) desc, s.query_normalized
     limit least(greatest(coalesce(p_limit, 20), 1), 100);
end $$;

-- Évolution par semaine d'un mot (ex. « paludisme »)
create or replace function public.authority_trend(p_term text, p_region uuid default null, p_weeks int default 12)
returns table (week date, searches bigint, unfound bigint) language plpgsql security definer set search_path = public as $$
declare term text := public.normalize_text(coalesce(p_term, '')); w int := least(greatest(coalesce(p_weeks, 12), 4), 52);
begin
  if char_length(term) < 3 then raise exception 'PP422: au moins 3 lettres'; end if;
  perform public.authority_require('stats:trend', jsonb_build_object('term', term, 'region', p_region, 'weeks', w));
  return query
    with weeks as (select generate_series(date_trunc('week', now() - make_interval(weeks => w - 1))::date, date_trunc('week', now())::date, interval '1 week')::date as wk)
    select weeks.wk, public.stat_mask(count(s.id)), public.stat_mask(count(s.id) filter (where s.result_count = 0))
      from weeks left join public.search_logs s on date_trunc('week', s.created_at)::date = weeks.wk and s.kind = 'medicine'
        and s.query_normalized like '%' || term || '%' and (p_region is null or s.region_id = p_region)
     group by weeks.wk order by weeks.wk;
end $$;

-- Par région : recherches, échecs, pharmacies, garde
create or replace function public.authority_regions(p_from date default null, p_to date default null)
returns table (region_id uuid, region text, searches bigint, unfound_rate int, pharmacies bigint, fresh_stock bigint, on_duty_now bigint)
language plpgsql security definer set search_path = public as $$
declare f timestamptz := coalesce(p_from, current_date - 30)::timestamptz; t timestamptz := (coalesce(p_to, current_date) + 1)::timestamptz;
begin
  perform public.authority_require('stats:regions', public.authority_params(null, p_from, p_to));
  return query
    select r.id, r.name,
      public.stat_mask(sl.n),
      case when sl.n >= public.stat_k() then round(100.0 * sl.none / sl.n)::int end,
      coalesce(ph.n, 0), coalesce(ph.fresh, 0), coalesce(ph.duty, 0)
    from public.regions r
    left join lateral (select count(*) n, count(*) filter (where s.result_count = 0) none from public.search_logs s
                        where s.region_id = r.id and s.kind = 'medicine' and s.created_at >= f and s.created_at < t) sl on true
    left join lateral (select count(*) n,
                              count(*) filter (where exists (select 1 from public.pharmacy_inventory i where i.pharmacy_id = p.id and i.stock_updated_at > now() - interval '30 days')) fresh,
                              count(*) filter (where exists (select 1 from public.pharmacy_duty d where d.pharmacy_id = p.id and now() between d.starts_at and d.ends_at)) duty
                         from public.pharmacies p where p.region_id = r.id and p.status = 'verified' and not p.is_demo) ph on true
    order by coalesce(sl.n, 0) desc, coalesce(ph.n, 0) desc, r.name;
end $$;

-- Communes sans pharmacie de garde dans les prochaines 24 heures (données publiques, pas de seuil)
create or replace function public.authority_duty_gaps(p_region uuid default null)
returns table (region text, commune text, pharmacies bigint, on_duty_24h bigint) language plpgsql security definer set search_path = public as $$
begin
  perform public.authority_require('stats:duty', jsonb_build_object('region', p_region));
  return query
    select r.name, c.name, count(p.id),
      count(p.id) filter (where exists (select 1 from public.pharmacy_duty d where d.pharmacy_id = p.id and d.starts_at < now() + interval '24 hours' and d.ends_at > now()))
      from public.communes c join public.regions r on r.id = c.region_id
      join public.pharmacies p on p.commune_id = c.id and p.status = 'verified' and not p.is_demo
     where (p_region is null or c.region_id = p_region) and not c.is_demo
     group by r.name, c.name
     order by 4, 3 desc, 1, 2;
end $$;

-- AMO : prix déclarés par les pharmacies vérifiées (30 derniers jours) comparés au tarif de référence
create or replace function public.authority_amo_prices(p_region uuid default null, p_limit int default 30)
returns table (product text, tariff int, prices bigint, min_price int, avg_price int, max_price int, gap_pct int)
language plpgsql security definer set search_path = public as $$
begin
  perform public.authority_require('stats:amo', jsonb_build_object('region', p_region));
  return query
    select a.name, a.tariff_xof, count(*), min(i.price_xof), round(avg(i.price_xof))::int, max(i.price_xof),
           round(100.0 * (avg(i.price_xof) - a.tariff_xof) / nullif(a.tariff_xof, 0))::int
      from public.amo_catalog_links l join public.amo_medicines a on a.id = l.amo_id and a.tariff_xof > 0
      join public.pharmacy_inventory i on i.catalog_id = l.catalog_id and i.price_xof > 0 and i.stock_updated_at > now() - interval '30 days'
      join public.pharmacies p on p.id = i.pharmacy_id and p.status = 'verified' and not p.is_demo and (p_region is null or p.region_id = p_region)
     group by a.id, a.name, a.tariff_xof
    having count(*) >= 3
     order by abs(avg(i.price_xof) - a.tariff_xof) / nullif(a.tariff_xof, 0) desc nulls last
     limit least(greatest(coalesce(p_limit, 30), 1), 100);
end $$;

-- Sujets qui préoccupent : questions aux pharmaciens par public, fiches les plus lues
create or replace function public.authority_topics(p_from date default null, p_to date default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare f date := coalesce(p_from, current_date - 30); t date := coalesce(p_to, current_date);
begin
  perform public.authority_require('stats:topics', public.authority_params(null, p_from, p_to));
  return jsonb_build_object(
    'questions', coalesce((select jsonb_agg(jsonb_build_object('about', about, 'n', n) order by n desc) from (
        select about, count(*) n from public.pharmacist_questions where created_at::date between f and t group by about having count(*) >= public.stat_k()) x), '[]'::jsonb),
    'urgent_questions', public.stat_mask((select count(*) from public.pharmacist_questions where urgent and created_at::date between f and t)),
    'articles', coalesce((select jsonb_agg(jsonb_build_object('title', title, 'slug', slug, 'n', n) order by n desc) from (
        select a.title, a.slug, sum(v.views) n from public.article_daily_views v join public.health_articles a on a.id = v.article_id
         where v.day between f and t group by a.id, a.title, a.slug having sum(v.views) >= public.stat_k() order by 3 desc limit 15) y), '[]'::jsonb));
end $$;

-- Don de sang : donneurs volontaires par groupe et par région, campagnes
create or replace function public.authority_blood(p_region uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public.authority_require('stats:blood', jsonb_build_object('region', p_region), array['ministere', 'cnts']);
  return jsonb_build_object(
    'by_group', coalesce((select jsonb_agg(jsonb_build_object('group', g, 'n', public.stat_mask(n)) order by g) from (
        select coalesce(a.blood_group, 'inconnu') g, count(*) n from public.user_alert_prefs a join public.profiles pr on pr.id = a.user_id and pr.deleted_at is null
         where a.blood_alerts and (p_region is null or a.region_id = p_region) group by 1) x), '[]'::jsonb),
    'by_region', coalesce((select jsonb_agg(jsonb_build_object('region', coalesce(r.name, 'Non précisée'), 'n', public.stat_mask(n)) order by n desc) from (
        select a.region_id, count(*) n from public.user_alert_prefs a join public.profiles pr on pr.id = a.user_id and pr.deleted_at is null
         where a.blood_alerts group by 1) y left join public.regions r on r.id = y.region_id), '[]'::jsonb),
    'needs_30d', (select count(*) from public.blood_needs where created_at > now() - interval '30 days'),
    'campaigns', coalesce((select jsonb_agg(jsonb_build_object('title', c.title, 'date', c.starts_on, 'place', c.place, 'going', public.stat_mask(
          (select count(*) from public.blood_campaign_attendance x where x.campaign_id = c.id))) order by c.starts_on desc)
        from (select * from public.blood_campaigns where published and starts_on > current_date - 90 and (p_region is null or region_id = p_region) order by starts_on desc limit 20) c), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------------------
-- 4. Signalements : médicament suspect ou effet indésirable
-- ---------------------------------------------------------------------------
create table if not exists public.drug_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.profiles(id) on delete set null,
  kind text not null check (kind in ('suspect', 'effet')),
  reporter_type text not null check (reporter_type in ('patient', 'proche', 'pharmacien', 'medecin', 'autre')),
  product_name text not null check (char_length(btrim(product_name)) between 2 and 160),
  batch_number text check (char_length(coalesce(batch_number, '')) <= 60),
  expiry text check (char_length(coalesce(expiry, '')) <= 20),
  manufacturer text check (char_length(coalesce(manufacturer, '')) <= 120),
  where_bought text check (where_bought in ('pharmacie', 'depot', 'centre_sante', 'rue', 'marche', 'internet', 'autre')),
  place_detail text check (char_length(coalesce(place_detail, '')) <= 160),
  region_id uuid references public.regions(id) on delete set null,
  price_xof int check (price_xof is null or price_xof between 0 and 10000000),
  problems text[] not null default '{}' check (problems <@ array['emballage', 'etiquette', 'aspect', 'prix', 'non_autorise', 'inefficace', 'perime', 'autre']::text[]),
  description text check (char_length(coalesce(description, '')) <= 2000),
  reaction text check (char_length(coalesce(reaction, '')) <= 2000),
  severity text check (severity in ('legere', 'moderee', 'grave')),
  outcome text check (outcome in ('gueri', 'en_cours', 'sequelles', 'inconnu')),
  patient_age text check (patient_age in ('0-4', '5-14', '15-24', '25-49', '50-64', '65+')),
  patient_sex text check (patient_sex in ('F', 'M')),
  pregnant boolean,
  other_meds text check (char_length(coalesce(other_meds, '')) <= 500),
  contact_ok boolean not null default false,
  contact_phone text check (contact_phone is null or contact_phone ~ '^\+?[0-9 ]{8,20}$'),
  status text not null default 'nouveau' check (status in ('nouveau', 'en_cours', 'transmis', 'clos')),
  authority_note text check (char_length(coalesce(authority_note, '')) <= 2000),
  handled_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind = 'suspect' or reaction is not null)
);
create index if not exists drug_reports_status on public.drug_reports (status, created_at desc);
alter table public.drug_reports enable row level security;
drop policy if exists "pp_drug_reports_own" on public.drug_reports;
create policy "pp_drug_reports_own" on public.drug_reports for select to authenticated using (reporter_id = auth.uid());
revoke all on public.drug_reports from anon;
revoke insert, update, delete on public.drug_reports from authenticated;
grant select on public.drug_reports to authenticated;

create or replace function public.submit_drug_report(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_auth(); v_id uuid; k text := p ->> 'kind';
begin
  if coalesce((p ->> 'consent')::boolean, false) is not true then raise exception 'PP422: votre accord pour transmettre le signalement est nécessaire'; end if;
  if (select count(*) from public.drug_reports where reporter_id = uid and created_at > now() - interval '1 day') >= 5 then
    raise exception 'PP429: 5 signalements par jour au maximum';
  end if;
  if k = 'effet' and nullif(btrim(p ->> 'reaction'), '') is null then raise exception 'PP422: décrivez la réaction observée'; end if;
  insert into public.drug_reports (reporter_id, kind, reporter_type, product_name, batch_number, expiry, manufacturer, where_bought, place_detail, region_id,
    price_xof, problems, description, reaction, severity, outcome, patient_age, patient_sex, pregnant, other_meds, contact_ok, contact_phone)
  values (uid, k, coalesce(nullif(p ->> 'reporter_type', ''), 'patient'), btrim(p ->> 'product_name'), nullif(btrim(p ->> 'batch_number'), ''),
    nullif(btrim(p ->> 'expiry'), ''), nullif(btrim(p ->> 'manufacturer'), ''), nullif(p ->> 'where_bought', ''), nullif(btrim(p ->> 'place_detail'), ''),
    nullif(p ->> 'region_id', '')::uuid, nullif(p ->> 'price_xof', '')::int,
    coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p -> 'problems', '[]'::jsonb)) x), '{}'),
    nullif(btrim(p ->> 'description'), ''), nullif(btrim(p ->> 'reaction'), ''), nullif(p ->> 'severity', ''), nullif(p ->> 'outcome', ''),
    nullif(p ->> 'patient_age', ''), nullif(p ->> 'patient_sex', ''), (p ->> 'pregnant')::boolean, nullif(btrim(p ->> 'other_meds'), ''),
    coalesce((p ->> 'contact_ok')::boolean, false), case when coalesce((p ->> 'contact_ok')::boolean, false) then nullif(btrim(p ->> 'contact_phone'), '') end)
  returning id into v_id;
  return v_id;
exception
  when check_violation then raise exception 'PP422: certaines informations sont invalides ou trop longues';
  when invalid_text_representation then raise exception 'PP422: certaines informations sont invalides';
end $$;

-- File des autorités : l'identité de la personne n'est jamais donnée ; son téléphone seulement si elle l'a accepté
create or replace function public.authority_reports(p_status text default null, p_kind text default null, p_region uuid default null, p_limit int default 30, p_offset int default 0)
returns table (id uuid, kind text, reporter_type text, product_name text, batch_number text, expiry text, manufacturer text, where_bought text, place_detail text,
  region text, price_xof int, problems text[], description text, reaction text, severity text, outcome text, patient_age text, patient_sex text, pregnant boolean,
  other_meds text, contact_phone text, status text, authority_note text, created_at timestamptz, total_count bigint)
language plpgsql security definer set search_path = public as $$
begin
  perform public.authority_require('reports:list', jsonb_build_object('status', p_status, 'kind', p_kind, 'region', p_region), array['ministere', 'dpm', 'ordre_pharmaciens']);
  return query
    select d.id, d.kind, d.reporter_type, d.product_name, d.batch_number, d.expiry, d.manufacturer, d.where_bought, d.place_detail, r.name, d.price_xof, d.problems,
           d.description, d.reaction, d.severity, d.outcome, d.patient_age, d.patient_sex, d.pregnant, d.other_meds, case when d.contact_ok then d.contact_phone end,
           d.status, d.authority_note, d.created_at, count(*) over ()
      from public.drug_reports d left join public.regions r on r.id = d.region_id
     where (p_status is null or d.status = p_status) and (p_kind is null or d.kind = p_kind) and (p_region is null or d.region_id = p_region)
     order by coalesce(d.severity = 'grave' and d.status = 'nouveau', false) desc, d.created_at desc
     limit least(greatest(coalesce(p_limit, 30), 1), 100) offset greatest(coalesce(p_offset, 0), 0);
end $$;

create or replace function public.authority_update_report(p_id uuid, p_status text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid; d public.drug_reports;
begin
  uid := public.authority_require('reports:update', jsonb_build_object('id', p_id, 'status', p_status), array['ministere', 'dpm', 'ordre_pharmaciens']);
  if p_status not in ('nouveau', 'en_cours', 'transmis', 'clos') then raise exception 'PP422: statut invalide'; end if;
  update public.drug_reports set status = p_status, authority_note = nullif(btrim(coalesce(p_note, '')), ''), handled_by = uid, updated_at = now()
   where id = p_id returning * into d;
  if not found then raise exception 'PP404: signalement introuvable'; end if;
  if p_status in ('transmis', 'clos') then
    perform public.notify_user(d.reporter_id, 'signalement', 'Votre signalement a été pris en charge',
      'Merci : les autorités de santé ont examiné votre signalement.', null, '/signaler/mes-signalements');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Courbe de croissance des enfants (privée, comme le carnet de vaccination)
-- ---------------------------------------------------------------------------
create table if not exists public.child_growth (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  measured_on date not null check (measured_on <= current_date + 1),
  weight_kg numeric(4, 1) check (weight_kg between 0.5 and 40),
  height_cm numeric(4, 1) check (height_cm between 35 and 130),
  place text check (char_length(coalesce(place, '')) <= 100),
  created_at timestamptz not null default now(),
  check (weight_kg is not null or height_cm is not null),
  unique (child_id, measured_on)
);
alter table public.child_growth enable row level security;
drop policy if exists "pp_child_growth_owner" on public.child_growth;
create policy "pp_child_growth_owner" on public.child_growth for all to authenticated
  using (exists (select 1 from public.children c where c.id = child_id and c.user_id = auth.uid()))
  with check (exists (select 1 from public.children c where c.id = child_id and c.user_id = auth.uid()));
revoke all on public.child_growth from anon;
grant select, insert, update, delete on public.child_growth to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Campagnes de don de sang (collectes mobiles du CNTS) et « j'y serai »
-- ---------------------------------------------------------------------------
create table if not exists public.blood_campaigns (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 3 and 140),
  organizer text not null default 'CNTS' check (char_length(btrim(organizer)) between 2 and 120),
  region_id uuid references public.regions(id) on delete set null,
  place text not null check (char_length(btrim(place)) between 3 and 200),
  starts_on date not null,
  start_time text check (start_time is null or start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  end_time text check (end_time is null or end_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  details text check (char_length(coalesce(details, '')) <= 1000),
  source_url text not null check (source_url ~ '^https?://'),
  published boolean not null default true,
  notified_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.blood_campaigns enable row level security;
drop policy if exists "pp_blood_campaigns_read" on public.blood_campaigns;
create policy "pp_blood_campaigns_read" on public.blood_campaigns for select to anon, authenticated using (published or public.is_admin());
revoke insert, update, delete on public.blood_campaigns from anon, authenticated;
grant select on public.blood_campaigns to anon, authenticated;

create table if not exists public.blood_campaign_attendance (
  campaign_id uuid not null references public.blood_campaigns(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (campaign_id, user_id)
);
alter table public.blood_campaign_attendance enable row level security;
drop policy if exists "pp_campaign_attendance_own" on public.blood_campaign_attendance;
create policy "pp_campaign_attendance_own" on public.blood_campaign_attendance for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.blood_campaign_attendance from anon;
grant select, insert, delete on public.blood_campaign_attendance to authenticated;

-- Nombre de participants annoncés : affiché seulement à partir de 10
create or replace function public.campaign_going(p_campaign uuid)
returns bigint language sql stable security definer set search_path = public as $$
  select public.stat_mask((select count(*) from public.blood_campaign_attendance where campaign_id = p_campaign))
$$;
grant execute on function public.campaign_going(uuid) to anon, authenticated;

create or replace function public.save_blood_campaign(p jsonb, p_notify boolean default true)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid; v_id uuid := nullif(p ->> 'id', '')::uuid; c public.blood_campaigns;
begin
  uid := public.authority_require('campaign:save', jsonb_build_object('id', v_id), array['ministere', 'cnts']);
  if v_id is null then
    insert into public.blood_campaigns (title, organizer, region_id, place, starts_on, start_time, end_time, details, source_url, published, created_by)
    values (btrim(p ->> 'title'), coalesce(nullif(btrim(p ->> 'organizer'), ''), 'CNTS'), nullif(p ->> 'region_id', '')::uuid, btrim(p ->> 'place'),
      (p ->> 'starts_on')::date, nullif(p ->> 'start_time', ''), nullif(p ->> 'end_time', ''), nullif(btrim(p ->> 'details'), ''),
      btrim(p ->> 'source_url'), coalesce((p ->> 'published')::boolean, true), uid)
    returning * into c;
  else
    update public.blood_campaigns set title = btrim(p ->> 'title'), organizer = coalesce(nullif(btrim(p ->> 'organizer'), ''), 'CNTS'),
      region_id = nullif(p ->> 'region_id', '')::uuid, place = btrim(p ->> 'place'), starts_on = (p ->> 'starts_on')::date,
      start_time = nullif(p ->> 'start_time', ''), end_time = nullif(p ->> 'end_time', ''), details = nullif(btrim(p ->> 'details'), ''),
      source_url = btrim(p ->> 'source_url'), published = coalesce((p ->> 'published')::boolean, true)
     where id = v_id returning * into c;
    if not found then raise exception 'PP404: campagne introuvable'; end if;
  end if;
  if p_notify and c.published and c.notified_at is null and c.starts_on >= current_date then
    insert into public.notifications (user_id, kind, title, body, link)
    select a.user_id, 'don', 'Collecte de sang près de chez vous',
           c.title || ' — ' || to_char(c.starts_on, 'DD/MM/YYYY') || ', ' || c.place || '.', '/don-de-sang#campagnes'
      from public.user_alert_prefs a join public.profiles pr on pr.id = a.user_id and pr.deleted_at is null
     where a.blood_alerts and (c.region_id is null or a.region_id is null or a.region_id = c.region_id);
    update public.blood_campaigns set notified_at = now() where id = c.id;
  end if;
  perform public.log_audit('blood_campaign_save', 'blood_campaign', c.id::text, jsonb_build_object('title', c.title));
  return c.id;
exception
  when check_violation then raise exception 'PP422: titre, lieu, date et lien vers la source officielle sont obligatoires';
  when not_null_violation then raise exception 'PP422: titre, lieu, date et lien vers la source officielle sont obligatoires';
  when invalid_datetime_format then raise exception 'PP422: date invalide';
end $$;

-- ---------------------------------------------------------------------------
-- 7. Avis des utilisateurs
-- ---------------------------------------------------------------------------
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  page_path text check (page_path ~ '^/' and char_length(page_path) <= 200),
  mood text check (mood in ('content', 'moyen', 'pas_content')),
  category text not null default 'autre' check (category in ('bug', 'idee', 'contenu', 'difficile', 'autre')),
  message text check (char_length(coalesce(message, '')) <= 1000),
  status text not null default 'nouveau' check (status in ('nouveau', 'lu', 'traite')),
  created_at timestamptz not null default now(),
  check (mood is not null or message is not null)
);
create index if not exists feedback_created on public.feedback (created_at desc);
alter table public.feedback enable row level security;
drop policy if exists "pp_feedback_admin" on public.feedback;
create policy "pp_feedback_admin" on public.feedback for select to authenticated using (public.is_admin());
revoke all on public.feedback from anon;
revoke insert, update, delete on public.feedback from authenticated;
grant select on public.feedback to authenticated;

create or replace function public.submit_feedback(p_page text, p_mood text, p_category text, p_message text)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.feedback (user_id, page_path, mood, category, message)
  values (auth.uid(), nullif(left(p_page, 200), ''), nullif(p_mood, ''), coalesce(nullif(p_category, ''), 'autre'), nullif(btrim(coalesce(p_message, '')), ''));
exception when check_violation then raise exception 'PP422: avis invalide (1 000 caractères au maximum)';
end $$;
grant execute on function public.submit_feedback(text, text, text, text) to anon, authenticated;

create or replace function public.admin_feedback_status(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  update public.feedback set status = p_status where id = p_id;
exception when check_violation then raise exception 'PP422: statut invalide';
end $$;

-- ---------------------------------------------------------------------------
-- 8. Guides audio : nouvelles pages à enregistrer en langues nationales
-- ---------------------------------------------------------------------------
insert into public.audio_targets (key, label, page_path, sort_order, script_fr) values
  ('premiers-secours', 'Premiers secours', '/premiers-secours', 20,
   'En cas d''urgence grave, appelez d''abord les secours ou partez tout de suite vers le centre de santé le plus proche. Cette page explique les gestes simples à faire en attendant : arrêter un saignement en appuyant fort sur la plaie, refroidir une brûlure avec de l''eau propre, mettre sur le côté une personne qui ne répond plus mais qui respire. Chaque fiche est vérifiée par un professionnel de santé. Ouvrez cette page une fois avec une connexion : elle reste ensuite lisible sans réseau.'),
  ('don-de-sang', 'Don de sang', '/don-de-sang', 21,
   'Donner son sang sauve des vies, surtout celles des femmes qui accouchent et des enfants malades du paludisme. Vous pouvez donner si vous avez entre dix-huit et soixante ans, si vous pesez au moins cinquante-cinq kilos et si vous êtes en bonne santé. Un homme peut donner tous les trois mois, une femme tous les quatre mois. Le don est gratuit : le sang ne se vend pas. Rendez-vous au Centre national de transfusion sanguine, ou à une collecte près de chez vous.'),
  ('droits', 'Vos droits', '/droits', 22,
   'Cette rubrique explique vos droits en matière de santé et de protection sociale au Mali : le congé de maternité, les allocations familiales, la déclaration de naissance, l''assurance maladie obligatoire, les soins gratuits, l''accident du travail et la retraite. Chaque fiche cite les textes officiels. Pour votre situation personnelle, renseignez-vous auprès de l''INPS, de la CANAM ou de votre employeur.'),
  ('vaccination-enfants', 'Carnet de vaccination des enfants', '/ma-sante/enfants', 23,
   'Ajoutez votre enfant avec sa date de naissance. PharmaProxi affiche les vaccins du calendrier national et vous prévient trois jours avant chaque rendez-vous. Notez chaque vaccin fait au centre de santé. Vous pouvez aussi noter son poids et sa taille à chaque pesée, pour suivre sa courbe de croissance. Gardez toujours le carnet papier : c''est lui qui fait foi.'),
  ('dossier-sante', 'Mon dossier santé', '/ma-sante/dossier', 24,
   'Mon dossier santé garde votre histoire de santé dans votre téléphone : votre groupe sanguin, vos allergies, vos maladies, vos opérations, vos vaccins, vos analyses et vos ordonnances. Chez le médecin, touchez Montrer à mon médecin : tout s''affiche sur une page. Votre dossier est visible par vous seul et peut être protégé par un code secret.'),
  ('signaler', 'Signaler un médicament suspect', '/signaler', 25,
   'Vous avez un doute sur un médicament : une boîte abîmée, un prix anormal, un produit vendu dans la rue, ou une mauvaise réaction après l''avoir pris ? Signalez-le ici. Votre signalement est transmis aux autorités de santé, qui vérifient. Il n''est jamais publié. Si la réaction est grave, allez d''abord au centre de santé.')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 9. Droits d'exécution, effacement avec le compte
-- ---------------------------------------------------------------------------
revoke execute on function public.authority_require(text, jsonb, text[]), public.stat_k(), public.stat_mask(bigint) from public, anon;
revoke execute on function public.authority_overview(uuid, date, date), public.authority_searches(uuid, date, date, boolean, int), public.authority_trend(text, uuid, int),
  public.authority_regions(date, date), public.authority_duty_gaps(uuid), public.authority_amo_prices(uuid, int), public.authority_topics(date, date),
  public.authority_blood(uuid), public.authority_reports(text, text, uuid, int, int), public.authority_update_report(uuid, text, text),
  public.save_blood_campaign(jsonb, boolean), public.admin_set_authority(text, text, text, text, boolean), public.submit_drug_report(jsonb),
  public.admin_feedback_status(uuid, text), public.is_authority(), public.authority_scope(uuid) from public, anon;
grant execute on function public.authority_overview(uuid, date, date), public.authority_searches(uuid, date, date, boolean, int), public.authority_trend(text, uuid, int),
  public.authority_regions(date, date), public.authority_duty_gaps(uuid), public.authority_amo_prices(uuid, int), public.authority_topics(date, date),
  public.authority_blood(uuid), public.authority_reports(text, text, uuid, int, int), public.authority_update_report(uuid, text, text),
  public.save_blood_campaign(jsonb, boolean), public.admin_set_authority(text, text, text, text, boolean), public.submit_drug_report(jsonb),
  public.admin_feedback_status(uuid, text), public.is_authority(), public.authority_scope(uuid) to authenticated;

create or replace function public.purge_personal_health_data()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    delete from public.record_persons where owner_id = new.id;
    delete from public.record_settings where user_id = new.id;
    delete from public.children where user_id = new.id;
    delete from public.treatments where user_id = new.id;
    delete from public.health_measures where user_id = new.id;
    delete from public.user_alert_prefs where user_id = new.id;
    delete from public.blood_campaign_attendance where user_id = new.id;
    delete from public.authority_members where user_id = new.id;
    update public.drug_reports set reporter_id = null, contact_phone = null, contact_ok = false where reporter_id = new.id;
    delete from public.pharmacist_questions where user_id = new.id and not (allow_public and status <> 'open');
    delete from public.femme_days where user_id = new.id;
    delete from public.femme_periods where user_id = new.id;
    delete from public.femme_reminders where user_id = new.id;
    delete from public.femme_access_log where user_id = new.id;
    delete from public.femme_profiles where user_id = new.id;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- 10. Politique de confidentialité : mise à jour du texte provisoire (seulement s'il n'a pas été réécrit)
-- ---------------------------------------------------------------------------
update public.content_pages set body =
'Version provisoire — à faire valider par un juriste au regard de la loi n° 2013-015 du 21 mai 2013 sur la protection des données à caractère personnel et des exigences de l''Autorité de protection des données à caractère personnel (APDP).

Données de compte : nom, téléphone, adresse e-mail, adresses de livraison, historique des commandes et des rendez-vous.
Espaces de santé personnels (Mon dossier santé, Ma santé, PharmaProxi Femme) : les informations que vous y notez (allergies, maladies, traitements, vaccins, mesures, croissance des enfants, cycle…) sont visibles par vous seul. Ni les pharmacies, ni les médecins, ni les assureurs, ni l''équipe de PharmaProxi n''y ont accès. Elles ne sont utilisées ni pour de la publicité, ni par l''assistant automatique, ni dans les statistiques, et sont effacées avec votre compte.
Finalités : mise en relation avec les pharmacies et les professionnels, suivi des commandes et des rendez-vous, rappels que vous avez demandés, sécurité de la plateforme.
Destinataires : la pharmacie ou le professionnel choisi et, en cas de livraison, le livreur affecté reçoivent uniquement les informations nécessaires.
Statistiques anonymes : les recherches de médicaments sont enregistrées sans votre identité. Des statistiques anonymes et agrégées (par exemple les médicaments les plus cherchés sans résultat) aident les autorités de santé à repérer les ruptures ; un chiffre inférieur à 10 n''est jamais affiché.
Signalements de médicaments : un signalement de médicament suspect ou d''effet indésirable est transmis, avec votre accord, aux autorités de santé (ministère de la Santé, Direction de la pharmacie et du médicament, Ordre des pharmaciens). Il n''est jamais publié ; votre nom n''est pas communiqué, votre téléphone seulement si vous l''acceptez.
Conservation : les commandes sont conservées pour la durée légale applicable ; la suppression du compte efface vos espaces de santé et anonymise le profil.
Droits : accès, rectification, suppression depuis votre espace « Mon compte » ou en écrivant au contact de la plateforme.'
where slug = 'confidentialite' and body like 'Version provisoire%' and body not like '%Mon dossier santé%';


-- >>> 20261106000100_labs_home_sampling.sql
-- =============================================================================
-- PharmaProxi 0.21 — Profil à l'inscription, espace laboratoire (analyses et prix
-- déclarés), prélèvement à domicile, identifiants uniques, statistiques de l'offre
-- de soins pour les autorités.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Profil choisi à l'inscription
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists account_type text not null default 'patient';
do $$ begin
  alter table public.profiles add constraint profiles_account_type_check
    check (account_type in ('patient', 'pharmacien', 'medecin', 'clinique', 'laboratoire', 'autre'));
exception when duplicate_object then null; end $$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, phone, account_type)
  values (
    new.id,
    nullif(left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120), ''),
    case when (new.raw_user_meta_data ->> 'phone') ~ '^\+[1-9][0-9]{7,14}$' then new.raw_user_meta_data ->> 'phone' end,
    case when new.raw_user_meta_data ->> 'account_type' in ('patient', 'pharmacien', 'medecin', 'clinique', 'laboratoire', 'autre')
         then new.raw_user_meta_data ->> 'account_type' else 'patient' end
  )
  on conflict (id) do nothing;
  insert into public.user_roles (user_id, role) values (new.id, 'customer') on conflict do nothing;
  return new;
end $$;

create or replace function public.set_account_type(p_type text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_type not in ('patient', 'pharmacien', 'medecin', 'clinique', 'laboratoire', 'autre') then raise exception 'PP422: profil invalide'; end if;
  update public.profiles set account_type = p_type where id = public.require_auth();
end $$;
revoke execute on function public.set_account_type(text) from public, anon;
grant execute on function public.set_account_type(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Identifiants uniques PharmaProxi (lisibles, stables, jamais réutilisés)
-- ---------------------------------------------------------------------------
create sequence if not exists public.public_code_seq;
create or replace function public.next_public_code(p_prefix text)
returns text language sql volatile as $$
  select p_prefix || '-' || lpad(nextval('public.public_code_seq')::text, 6, '0')
$$;
alter table public.pharmacies add column if not exists public_code text unique;
alter table public.doctors add column if not exists public_code text unique;
alter table public.clinics add column if not exists public_code text unique;
alter table public.facility_listings add column if not exists public_code text unique;
update public.pharmacies set public_code = public.next_public_code('PP-PH') where public_code is null;
update public.doctors set public_code = public.next_public_code('PP-MD') where public_code is null;
update public.clinics set public_code = public.next_public_code('PP-ET') where public_code is null;
update public.facility_listings set public_code = public.next_public_code(case when kind = 'laboratoire' then 'PP-LB' else 'PP-ET' end) where public_code is null;
alter table public.pharmacies alter column public_code set default public.next_public_code('PP-PH');
alter table public.doctors alter column public_code set default public.next_public_code('PP-MD');
alter table public.clinics alter column public_code set default public.next_public_code('PP-ET');
alter table public.facility_listings alter column public_code drop default;
create or replace function public.facility_public_code() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.public_code is null then
    new.public_code := public.next_public_code(case when new.kind = 'laboratoire' then 'PP-LB' else 'PP-ET' end);
  end if;
  return new;
end $$;
drop trigger if exists facility_public_code on public.facility_listings;
create trigger facility_public_code before insert on public.facility_listings
  for each row execute function public.facility_public_code();

-- ---------------------------------------------------------------------------
-- 3. Catalogue d'analyses complété (noms usuels, sans conseil médical)
-- ---------------------------------------------------------------------------
insert into public.medical_exams (code, name, category, synonyms, sort_order) values
  ('glycemie_pp', 'Glycémie postprandiale', 'biologie', 'sucre après repas diabète', 40),
  ('hgpo', 'Hyperglycémie provoquée par voie orale (HGPO)', 'biologie', 'test au glucose diabète grossesse', 41),
  ('acide_urique', 'Acide urique (uricémie)', 'biologie', 'goutte', 42),
  ('bilirubine', 'Bilirubine totale et conjuguée', 'biologie', 'foie jaunisse ictère', 43),
  ('gamma_gt', 'Gamma GT', 'biologie', 'foie ggt', 44),
  ('phosphatases', 'Phosphatases alcalines', 'biologie', 'foie os pal', 45),
  ('proteines_totales', 'Protéines totales et albumine', 'biologie', 'albuminémie', 46),
  ('calcemie', 'Calcémie', 'biologie', 'calcium', 47),
  ('magnesemie', 'Magnésémie', 'biologie', 'magnésium', 48),
  ('fer_ferritine', 'Fer sérique et ferritine', 'biologie', 'anémie carence fer', 49),
  ('reticulocytes', 'Réticulocytes', 'biologie', 'anémie', 60),
  ('tp_inr', 'Taux de prothrombine (TP / INR)', 'biologie', 'coagulation anticoagulant inr', 61),
  ('tca', 'Temps de céphaline activée (TCA)', 'biologie', 'coagulation', 62),
  ('t3_t4', 'T3 et T4 libres (thyroïde)', 'biologie', 'thyroïde ft3 ft4', 63),
  ('vitamine_d', 'Vitamine D', 'biologie', '25-oh vitamine d', 64),
  ('microalbuminurie', 'Microalbuminurie', 'biologie', 'rein urines diabète', 65),
  ('proteinurie', 'Protéinurie des 24 heures', 'biologie', 'urines rein grossesse', 66),
  ('bandelette_urinaire', 'Bandelette urinaire', 'biologie', 'urines', 67),
  ('hemoculture', 'Hémoculture', 'biologie', 'sang infection septicémie', 68),
  ('coproculture', 'Coproculture', 'biologie', 'selles diarrhée', 69),
  ('prelevement_vaginal', 'Prélèvement vaginal', 'biologie', 'pv infection gynécologique', 71),
  ('spermogramme', 'Spermogramme', 'biologie', 'fertilité homme', 72),
  ('test_emmel', 'Test d''Emmel', 'biologie', 'drépanocytose falciformation', 73),
  ('toxoplasmose', 'Sérologie toxoplasmose', 'biologie', 'grossesse toxo', 74),
  ('rubeole', 'Sérologie rubéole', 'biologie', 'grossesse', 75),
  ('syphilis', 'Sérologie syphilis (TPHA / VDRL)', 'biologie', 'tpha vdrl ist', 76),
  ('chlamydia', 'Recherche de chlamydia', 'biologie', 'ist', 77),
  ('aslo', 'ASLO', 'biologie', 'angine streptocoque', 78),
  ('facteur_rhumatoide', 'Facteur rhumatoïde', 'biologie', 'polyarthrite', 79),
  ('cd4', 'Numération des CD4', 'biologie', 'vih suivi lymphocytes', 80),
  ('charge_virale_vih', 'Charge virale VIH', 'biologie', 'vih suivi', 81),
  ('charge_virale_vhb', 'Charge virale hépatite B (ADN VHB)', 'biologie', 'hépatite b suivi', 82),
  ('covid_pcr', 'Test COVID-19 (PCR)', 'biologie', 'coronavirus covid', 83),
  ('bk_crachat', 'Recherche de BK dans les crachats', 'biologie', 'tuberculose', 84),
  ('frottis', 'Frottis cervico-utérin', 'biologie', 'col utérus dépistage', 85),
  ('echo_thyroide', 'Échographie de la thyroïde', 'imagerie', 'thyroïde cou', 58),
  ('echo_doppler', 'Échographie Doppler', 'imagerie', 'vaisseaux veines artères', 59),
  ('echo_cardiaque', 'Échographie cardiaque', 'imagerie', 'cœur échocardiographie', 86),
  ('radio_sinus', 'Radiographie des sinus', 'imagerie', 'sinus', 87),
  ('holter', 'Holter tensionnel ou ECG', 'autre', 'tension cœur 24 heures', 88),
  ('eeg', 'Électroencéphalogramme (EEG)', 'autre', 'cerveau épilepsie', 89)
on conflict (code) do nothing;

-- Analyses proposées par un laboratoire et absentes du catalogue (validées par l'équipe)
create table if not exists public.exam_suggestions (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid references public.facility_listings(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 120),
  category text not null default 'biologie' check (category in ('biologie', 'imagerie', 'autre')),
  suggested_by uuid references public.profiles(id) on delete set null,
  status text not null default 'nouvelle' check (status in ('nouvelle', 'ajoutee', 'refusee')),
  created_at timestamptz not null default now()
);
alter table public.exam_suggestions enable row level security;
drop policy if exists "pp_exam_suggestions_admin" on public.exam_suggestions;
create policy "pp_exam_suggestions_admin" on public.exam_suggestions for select to authenticated using (public.is_admin() or suggested_by = auth.uid());
revoke all on public.exam_suggestions from anon;
revoke insert, update, delete on public.exam_suggestions from authenticated;
grant select on public.exam_suggestions to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Membres des laboratoires (désignés par l'équipe après vérification)
-- ---------------------------------------------------------------------------
create table if not exists public.facility_members (
  facility_id uuid not null references public.facility_listings(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'gestionnaire' check (role in ('responsable', 'gestionnaire')),
  granted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (facility_id, user_id)
);
alter table public.facility_members enable row level security;
drop policy if exists "pp_facility_members_self" on public.facility_members;
create policy "pp_facility_members_self" on public.facility_members for select to authenticated using (user_id = auth.uid() or public.is_admin());
revoke all on public.facility_members from anon;
revoke insert, update, delete on public.facility_members from authenticated;
grant select on public.facility_members to authenticated;

create or replace function public.is_facility_member(p_facility uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.facility_members m where m.facility_id = p_facility and m.user_id = auth.uid())
$$;

-- Demande d'accès d'un laboratoire (vérifiée par l'équipe avant d'ouvrir l'espace)
create table if not exists public.lab_access_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  facility_id uuid references public.facility_listings(id) on delete set null,
  lab_name text not null check (char_length(btrim(lab_name)) between 2 and 160),
  region_id uuid references public.regions(id) on delete set null,
  address text check (char_length(coalesce(address, '')) <= 300),
  phone text not null check (public.valid_phone(phone)),
  authorization_ref text not null check (char_length(btrim(authorization_ref)) between 2 and 120),
  role_in_lab text check (char_length(coalesce(role_in_lab, '')) <= 120),
  message text check (char_length(coalesce(message, '')) <= 1000),
  status text not null default 'nouvelle' check (status in ('nouvelle', 'acceptee', 'refusee')),
  admin_note text check (char_length(coalesce(admin_note, '')) <= 500),
  created_at timestamptz not null default now()
);
alter table public.lab_access_requests enable row level security;
drop policy if exists "pp_lab_requests_own" on public.lab_access_requests;
create policy "pp_lab_requests_own" on public.lab_access_requests for select to authenticated using (user_id = auth.uid() or public.is_admin());
drop policy if exists "pp_lab_requests_insert" on public.lab_access_requests;
create policy "pp_lab_requests_insert" on public.lab_access_requests for insert to authenticated with check (user_id = auth.uid() and status = 'nouvelle' and admin_note is null);
revoke all on public.lab_access_requests from anon;
grant select, insert on public.lab_access_requests to authenticated;

create or replace function public.admin_grant_lab(p_email text, p_facility uuid, p_request uuid default null, p_role text default 'responsable')
returns void language plpgsql security definer set search_path = public, auth as $$
declare me uuid := public.require_admin(); uid uuid;
begin
  if nullif(btrim(coalesce(p_email, '')), '') is null and p_request is not null then
    -- Demande d'accès : le compte est celui qui a fait la demande
    select r.user_id into uid from public.lab_access_requests r join public.profiles p on p.id = r.user_id and p.deleted_at is null where r.id = p_request;
  else
    select u.id into uid from auth.users u join public.profiles p on p.id = u.id and p.deleted_at is null where lower(u.email) = lower(btrim(p_email));
  end if;
  if uid is null then raise exception 'PP404: aucun compte avec cette adresse e-mail'; end if;
  if not exists (select 1 from public.facility_listings where id = p_facility and kind = 'laboratoire') then raise exception 'PP404: laboratoire introuvable dans l''annuaire'; end if;
  insert into public.facility_members (facility_id, user_id, role, granted_by) values (p_facility, uid, coalesce(p_role, 'responsable'), me)
  on conflict (facility_id, user_id) do update set role = excluded.role, granted_by = me;
  if p_request is not null then update public.lab_access_requests set status = 'acceptee', facility_id = p_facility where id = p_request; end if;
  perform public.notify_user(uid, 'laboratoire', 'Votre espace laboratoire est ouvert', 'Vous pouvez maintenant gérer les analyses, les prix et les prélèvements à domicile.', null, '/laboratoire');
  perform public.log_audit('lab_grant', 'facility_listing', p_facility::text, jsonb_build_object('user', uid));
end $$;

create or replace function public.admin_revoke_lab(p_facility uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  delete from public.facility_members where facility_id = p_facility and user_id = p_user;
  perform public.log_audit('lab_revoke', 'facility_listing', p_facility::text, jsonb_build_object('user', p_user));
end $$;

-- Analyses et prix déclarés par le laboratoire lui-même
create or replace function public.lab_save_exam(p_facility uuid, p_exam uuid, p_price int, p_note text, p_delay text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_facility_member(p_facility) then raise exception 'PP403: réservé aux membres de ce laboratoire' using errcode = '42501'; end if;
  if p_price is not null and (p_price < 0 or p_price > 10000000) then raise exception 'PP422: prix invalide'; end if;
  insert into public.facility_exams (facility_id, exam_id, price_xof, price_note, delay, source, verified_at)
  values (p_facility, p_exam, p_price, nullif(btrim(coalesce(p_note, '')), ''), nullif(btrim(coalesce(p_delay, '')), ''), 'Déclaré par le laboratoire', current_date)
  on conflict (facility_id, exam_id) do update set price_xof = excluded.price_xof, price_note = excluded.price_note, delay = excluded.delay,
    source = excluded.source, verified_at = excluded.verified_at, updated_at = now();
exception when check_violation then raise exception 'PP422: note ou délai trop long';
end $$;

create or replace function public.lab_remove_exam(p_facility uuid, p_exam uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_facility_member(p_facility) then raise exception 'PP403: réservé aux membres de ce laboratoire' using errcode = '42501'; end if;
  delete from public.facility_exams where facility_id = p_facility and exam_id = p_exam;
end $$;

create or replace function public.lab_suggest_exam(p_facility uuid, p_name text, p_category text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_facility_member(p_facility) then raise exception 'PP403: réservé aux membres de ce laboratoire' using errcode = '42501'; end if;
  insert into public.exam_suggestions (facility_id, name, category, suggested_by) values (p_facility, btrim(p_name), coalesce(nullif(p_category, ''), 'biologie'), auth.uid());
exception when check_violation then raise exception 'PP422: nom d''analyse invalide';
end $$;

-- ---------------------------------------------------------------------------
-- 5. Prélèvement à domicile
-- ---------------------------------------------------------------------------
create table if not exists public.lab_home_service (
  facility_id uuid primary key references public.facility_listings(id) on delete cascade,
  enabled boolean not null default false,
  fee_xof int check (fee_xof is null or fee_xof between 0 and 1000000),
  partner_name text check (char_length(coalesce(partner_name, '')) <= 120),
  partner_provider_id uuid references public.home_care_providers(id) on delete set null,
  areas text check (char_length(coalesce(areas, '')) <= 300),
  hours text check (char_length(coalesce(hours, '')) <= 200),
  conditions text check (char_length(coalesce(conditions, '')) <= 500),
  updated_at timestamptz not null default now()
);
alter table public.lab_home_service enable row level security;
drop policy if exists "pp_lab_home_read" on public.lab_home_service;
create policy "pp_lab_home_read" on public.lab_home_service for select to anon, authenticated
  using (exists (select 1 from public.facility_listings f where f.id = facility_id and f.is_published) or public.is_admin());
revoke insert, update, delete on public.lab_home_service from anon, authenticated;
grant select on public.lab_home_service to anon, authenticated;

create or replace function public.lab_save_home_service(p_facility uuid, p jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_facility_member(p_facility) then raise exception 'PP403: réservé aux membres de ce laboratoire' using errcode = '42501'; end if;
  insert into public.lab_home_service (facility_id, enabled, fee_xof, partner_name, partner_provider_id, areas, hours, conditions, updated_at)
  values (p_facility, coalesce((p ->> 'enabled')::boolean, false), nullif(p ->> 'fee_xof', '')::int, nullif(btrim(p ->> 'partner_name'), ''),
    nullif(p ->> 'partner_provider_id', '')::uuid, nullif(btrim(p ->> 'areas'), ''), nullif(btrim(p ->> 'hours'), ''), nullif(btrim(p ->> 'conditions'), ''), now())
  on conflict (facility_id) do update set enabled = excluded.enabled, fee_xof = excluded.fee_xof, partner_name = excluded.partner_name,
    partner_provider_id = excluded.partner_provider_id, areas = excluded.areas, hours = excluded.hours, conditions = excluded.conditions, updated_at = now();
exception
  when check_violation then raise exception 'PP422: certaines informations sont trop longues ou invalides';
  when invalid_text_representation then raise exception 'PP422: frais invalides';
end $$;

create table if not exists public.home_sampling_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  facility_id uuid not null references public.facility_listings(id) on delete cascade,
  exam_ids uuid[] not null default '{}',
  other_exams text check (char_length(coalesce(other_exams, '')) <= 300),
  patient_name text not null check (char_length(btrim(patient_name)) between 2 and 120),
  patient_age int check (patient_age between 0 and 120),
  for_relative boolean not null default false,
  address text not null check (char_length(btrim(address)) between 5 and 300),
  region_id uuid references public.regions(id) on delete set null,
  phone text not null check (public.valid_phone(phone)),
  preferred_date date not null check (preferred_date >= current_date - 1),
  slot text not null default 'matin' check (slot in ('matin', 'midi', 'apres_midi')),
  has_prescription boolean not null default false,
  fasting_known boolean not null default false,
  notes text check (char_length(coalesce(notes, '')) <= 500),
  status text not null default 'nouvelle' check (status in ('nouvelle', 'acceptee', 'planifiee', 'prelevee', 'terminee', 'refusee', 'annulee')),
  scheduled_at timestamptz,
  lab_note text check (char_length(coalesce(lab_note, '')) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (cardinality(exam_ids) between 0 and 30 and (cardinality(exam_ids) > 0 or other_exams is not null))
);
create index if not exists home_sampling_facility on public.home_sampling_requests (facility_id, status, preferred_date);
alter table public.home_sampling_requests enable row level security;
drop policy if exists "pp_home_sampling_own" on public.home_sampling_requests;
create policy "pp_home_sampling_own" on public.home_sampling_requests for select to authenticated using (user_id = auth.uid() or public.is_facility_member(facility_id));
revoke all on public.home_sampling_requests from anon;
revoke insert, update, delete on public.home_sampling_requests from authenticated;
grant select on public.home_sampling_requests to authenticated;

create or replace function public.request_home_sampling(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_auth(); fac uuid := (p ->> 'facility_id')::uuid; v_id uuid; ex uuid[];
begin
  if not exists (select 1 from public.lab_home_service s join public.facility_listings f on f.id = s.facility_id and f.is_published where s.facility_id = fac and s.enabled) then
    raise exception 'PP409: ce laboratoire ne propose pas de prélèvement à domicile';
  end if;
  if (select count(*) from public.home_sampling_requests where user_id = uid and created_at > now() - interval '1 day') >= 3 then
    raise exception 'PP429: 3 demandes par jour au maximum';
  end if;
  ex := coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(coalesce(p -> 'exam_ids', '[]'::jsonb)) x), '{}');
  if exists (select 1 from unnest(ex) e where not exists (select 1 from public.medical_exams m where m.id = e)) then raise exception 'PP422: analyse inconnue'; end if;
  insert into public.home_sampling_requests (user_id, facility_id, exam_ids, other_exams, patient_name, patient_age, for_relative, address, region_id, phone,
    preferred_date, slot, has_prescription, fasting_known, notes)
  values (uid, fac, ex, nullif(btrim(p ->> 'other_exams'), ''), btrim(p ->> 'patient_name'), nullif(p ->> 'patient_age', '')::int,
    coalesce((p ->> 'for_relative')::boolean, false), btrim(p ->> 'address'), nullif(p ->> 'region_id', '')::uuid, btrim(p ->> 'phone'),
    (p ->> 'preferred_date')::date, coalesce(nullif(p ->> 'slot', ''), 'matin'), coalesce((p ->> 'has_prescription')::boolean, false),
    coalesce((p ->> 'fasting_known')::boolean, false), nullif(btrim(p ->> 'notes'), ''))
  returning id into v_id;
  insert into public.notifications (user_id, kind, title, body, link)
  select m.user_id, 'laboratoire', 'Nouvelle demande de prélèvement à domicile', 'Une demande attend votre réponse.', '/laboratoire/prelevements'
    from public.facility_members m where m.facility_id = fac;
  return v_id;
exception
  when check_violation then raise exception 'PP422: vérifiez le nom, l''adresse, le téléphone, la date et les analyses';
  when invalid_text_representation or invalid_datetime_format then raise exception 'PP422: informations invalides';
end $$;

create or replace function public.lab_update_sampling(p_id uuid, p_status text, p_scheduled timestamptz default null, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare r public.home_sampling_requests; lbl text;
begin
  select * into r from public.home_sampling_requests where id = p_id for update;
  if not found or not public.is_facility_member(r.facility_id) then raise exception 'PP403: demande introuvable' using errcode = '42501'; end if;
  if p_status not in ('acceptee', 'planifiee', 'prelevee', 'terminee', 'refusee') then raise exception 'PP422: statut invalide'; end if;
  if r.status in ('annulee', 'terminee', 'refusee') then raise exception 'PP409: cette demande est close'; end if;
  update public.home_sampling_requests set status = p_status, scheduled_at = coalesce(p_scheduled, scheduled_at),
    lab_note = coalesce(nullif(btrim(coalesce(p_note, '')), ''), lab_note), updated_at = now() where id = p_id;
  lbl := case p_status when 'acceptee' then 'Votre demande de prélèvement est acceptée'
    when 'planifiee' then 'Votre prélèvement à domicile est planifié' when 'prelevee' then 'Prélèvement effectué'
    when 'terminee' then 'Votre demande de prélèvement est terminée' else 'Votre demande de prélèvement n''a pas pu être acceptée' end;
  perform public.notify_user(r.user_id, 'laboratoire', lbl,
    case when p_status = 'planifiee' and coalesce(p_scheduled, r.scheduled_at) is not null
      then 'Rendez-vous le ' || to_char(coalesce(p_scheduled, r.scheduled_at) at time zone 'utc', 'DD/MM/YYYY à HH24"h"MI') || '.' else 'Ouvrez PharmaProxi pour voir le détail.' end,
    null, '/compte/prelevements');
end $$;

create or replace function public.cancel_home_sampling(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.home_sampling_requests set status = 'annulee', updated_at = now()
   where id = p_id and user_id = public.require_auth() and status in ('nouvelle', 'acceptee', 'planifiee');
  if not found then raise exception 'PP409: cette demande ne peut plus être annulée'; end if;
end $$;

revoke execute on function public.lab_save_exam(uuid, uuid, int, text, text), public.lab_remove_exam(uuid, uuid), public.lab_suggest_exam(uuid, text, text),
  public.lab_save_home_service(uuid, jsonb), public.request_home_sampling(jsonb), public.lab_update_sampling(uuid, text, timestamptz, text),
  public.cancel_home_sampling(uuid), public.admin_grant_lab(text, uuid, uuid, text), public.admin_revoke_lab(uuid, uuid), public.is_facility_member(uuid) from public, anon;
grant execute on function public.lab_save_exam(uuid, uuid, int, text, text), public.lab_remove_exam(uuid, uuid), public.lab_suggest_exam(uuid, text, text),
  public.lab_save_home_service(uuid, jsonb), public.request_home_sampling(jsonb), public.lab_update_sampling(uuid, text, timestamptz, text),
  public.cancel_home_sampling(uuid), public.admin_grant_lab(text, uuid, uuid, text), public.admin_revoke_lab(uuid, uuid), public.is_facility_member(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Statistiques de l'offre de soins (données publiques de l'annuaire, sans seuil)
-- ---------------------------------------------------------------------------
create or replace function public.authority_supply(p_region uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare yr int := (select max(register_year) from public.doctor_register where is_published);
begin
  perform public.authority_require('stats:supply', jsonb_build_object('region', p_region));
  return jsonb_build_object(
    'register_year', yr,
    'by_region', coalesce((select jsonb_agg(x order by x ->> 'region') from (
      select jsonb_build_object('region', r.name, 'region_id', r.id,
        'pharmacies', (select count(*) from public.pharmacies p where p.region_id = r.id and p.status = 'verified' and not p.is_demo),
        'pharmacies_listed', (select count(*) from public.pharmacy_listings l where l.region_id = r.id and l.is_published and l.claimed_pharmacy_id is null),
        'doctors_register', (select count(*) from public.doctor_register d where d.region_id = r.id and d.is_published and d.register_year = yr),
        'labs', (select count(*) from public.facility_listings f where f.region_id = r.id and f.is_published and f.kind = 'laboratoire'),
        'health_facilities', (select count(*) from public.facility_listings f where f.region_id = r.id and f.is_published and f.kind <> 'laboratoire'),
        'home_care', (select count(*) from public.home_care_providers h where h.region_id = r.id and h.is_published),
        'home_sampling', (select count(*) from public.lab_home_service s join public.facility_listings f on f.id = s.facility_id where f.region_id = r.id and s.enabled and f.is_published)) x
      from public.regions r where p_region is null or r.id = p_region) y), '[]'::jsonb),
    'specialties', coalesce((select jsonb_agg(jsonb_build_object('specialty', s, 'n', n) order by n desc) from (
      select coalesce(ms.name, nullif(btrim(d.specialty_label), ''), 'Non précisée') s, count(*) n
        from public.doctor_register d left join public.medical_specialties ms on ms.id = d.specialty_id
       where d.is_published and d.register_year = yr and (p_region is null or d.region_id = p_region)
       group by 1 order by 2 desc limit 25) z), '[]'::jsonb),
    'facility_kinds', coalesce((select jsonb_agg(jsonb_build_object('kind', kind, 'n', n) order by n desc) from (
      select kind, count(*) n from public.facility_listings where is_published and (p_region is null or region_id = p_region) group by kind) k), '[]'::jsonb),
    'exams_with_price', (select count(*) from public.facility_exams fe join public.facility_listings f on f.id = fe.facility_id
                          where f.is_published and fe.price_xof is not null and (p_region is null or f.region_id = p_region)));
end $$;
revoke execute on function public.authority_supply(uuid) from public, anon;
grant execute on function public.authority_supply(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Effacement avec le compte
-- ---------------------------------------------------------------------------
create or replace function public.purge_personal_health_data()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    delete from public.record_persons where owner_id = new.id;
    delete from public.record_settings where user_id = new.id;
    delete from public.children where user_id = new.id;
    delete from public.treatments where user_id = new.id;
    delete from public.health_measures where user_id = new.id;
    delete from public.user_alert_prefs where user_id = new.id;
    delete from public.blood_campaign_attendance where user_id = new.id;
    delete from public.authority_members where user_id = new.id;
    delete from public.facility_members where user_id = new.id;
    delete from public.home_sampling_requests where user_id = new.id;
    update public.drug_reports set reporter_id = null, contact_phone = null, contact_ok = false where reporter_id = new.id;
    delete from public.pharmacist_questions where user_id = new.id and not (allow_public and status <> 'open');
    delete from public.femme_days where user_id = new.id;
    delete from public.femme_periods where user_id = new.id;
    delete from public.femme_reminders where user_id = new.id;
    delete from public.femme_access_log where user_id = new.id;
    delete from public.femme_profiles where user_id = new.id;
  end if;
  return new;
end $$;


-- >>> 20261107000100_santeproxi_pro_admin.sql
-- =============================================================================
-- SantéProxi 0.22 — inscription réservée aux patients ; les professionnels de
-- santé sont ajoutés par l'administrateur ; identifiants SP-… ; nom SantéProxi.
--
-- Règle : toute personne qui crée un compte est un patient. Un compte ne peut
-- créer une pharmacie, une fiche médecin ou une clinique que si l'administrateur
-- l'y a autorisé (après vérification de son autorisation d'exercer). Les
-- laboratoires sont rattachés directement par l'administrateur.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Inscription : toujours « patient »
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, phone, account_type)
  values (
    new.id,
    nullif(left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120), ''),
    case when (new.raw_user_meta_data ->> 'phone') ~ '^\+[1-9][0-9]{7,14}$' then new.raw_user_meta_data ->> 'phone' end,
    'patient'
  )
  on conflict (id) do nothing;
  insert into public.user_roles (user_id, role) values (new.id, 'customer') on conflict do nothing;
  return new;
end $$;

-- Le type de compte n'est plus choisi par l'utilisateur
revoke execute on function public.set_account_type(text) from authenticated;
create or replace function public.set_account_type(p_type text)
returns void language plpgsql security definer set search_path = public as $$
begin
  raise exception 'PP403: le type de compte est attribué par l''administrateur';
end $$;

-- ---------------------------------------------------------------------------
-- 2. Autorisations d'inscription professionnelle (données par l'administrateur)
-- ---------------------------------------------------------------------------
create table if not exists public.pro_authorizations (
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('pharmacie', 'medecin', 'clinique')),
  note text check (char_length(coalesce(note, '')) <= 300),
  granted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, kind)
);
alter table public.pro_authorizations enable row level security;
drop policy if exists "pp_pro_auth_read" on public.pro_authorizations;
create policy "pp_pro_auth_read" on public.pro_authorizations for select to authenticated using (user_id = auth.uid() or public.is_admin());
revoke all on public.pro_authorizations from anon, authenticated;
grant select on public.pro_authorizations to authenticated;

create or replace function public.has_pro_authorization(p_kind text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (select 1 from public.pro_authorizations where user_id = auth.uid() and kind = p_kind);
$$;
grant execute on function public.has_pro_authorization(text) to authenticated;

-- Compte d'un utilisateur à partir de son e-mail (réservé à l'administrateur)
create or replace function public.admin_user_by_email(p_email text)
returns uuid language plpgsql stable security definer set search_path = public, auth as $$
declare uid uuid;
begin
  perform public.require_admin();
  select u.id into uid from auth.users u join public.profiles p on p.id = u.id and p.deleted_at is null
   where lower(u.email) = lower(btrim(p_email));
  if uid is null then raise exception 'PP404: aucun compte avec cette adresse e-mail. La personne doit d''abord créer un compte patient.'; end if;
  return uid;
end $$;
revoke execute on function public.admin_user_by_email(text) from public, anon, authenticated;

create or replace function public.admin_authorize_pro(p_email text, p_kind text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := public.require_admin(); uid uuid;
begin
  if p_kind not in ('pharmacie', 'medecin', 'clinique') then raise exception 'PP422: type de professionnel invalide'; end if;
  uid := public.admin_user_by_email(p_email);
  insert into public.pro_authorizations (user_id, kind, note, granted_by) values (uid, p_kind, nullif(btrim(coalesce(p_note, '')), ''), me)
  on conflict (user_id, kind) do update set note = excluded.note, granted_by = me, created_at = now();
  update public.profiles set account_type = case p_kind when 'pharmacie' then 'pharmacien' else p_kind end where id = uid;
  perform public.notify_user(uid, 'compte', 'Inscription professionnelle autorisée',
    case p_kind when 'pharmacie' then 'Vous pouvez maintenant inscrire votre pharmacie.'
                when 'medecin' then 'Vous pouvez maintenant créer votre fiche de médecin.'
                else 'Vous pouvez maintenant inscrire votre établissement.' end, null,
    case p_kind when 'pharmacie' then '/pharmacien/inscription' when 'medecin' then '/medecin/inscription' else '/clinique/inscription' end);
  perform public.log_audit('pro_authorize', 'profile', uid::text, jsonb_build_object('kind', p_kind));
end $$;
revoke execute on function public.admin_authorize_pro(text, text, text) from public, anon;
grant execute on function public.admin_authorize_pro(text, text, text) to authenticated;

create or replace function public.admin_revoke_pro_authorization(p_user uuid, p_kind text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  delete from public.pro_authorizations where user_id = p_user and kind = p_kind;
  perform public.log_audit('pro_revoke', 'profile', p_user::text, jsonb_build_object('kind', p_kind));
end $$;
revoke execute on function public.admin_revoke_pro_authorization(uuid, text) from public, anon;
grant execute on function public.admin_revoke_pro_authorization(uuid, text) to authenticated;

-- Garde-fou en base : pas de pharmacie, de fiche médecin ni de clinique créée
-- par un compte sans autorisation (les créations par l'administrateur, la
-- maintenance et les données de démonstration ne sont pas concernées).
create or replace function public.guard_pro_creation()
returns trigger language plpgsql security definer set search_path = public as $$
declare k text := tg_argv[0];
begin
  if auth.uid() is null or public.is_admin() then return new; end if;
  if coalesce((to_jsonb(new) ->> 'is_demo')::boolean, false) then return new; end if;
  if not exists (select 1 from public.pro_authorizations where user_id = auth.uid() and kind = k) then
    raise exception 'PP403: inscription professionnelle réservée : l''administrateur doit d''abord vérifier et autoriser votre compte';
  end if;
  return new;
end $$;
drop trigger if exists guard_pro_creation on public.pharmacies;
create trigger guard_pro_creation before insert on public.pharmacies for each row execute function public.guard_pro_creation('pharmacie');
drop trigger if exists guard_pro_creation on public.doctors;
create trigger guard_pro_creation before insert on public.doctors for each row execute function public.guard_pro_creation('medecin');
drop trigger if exists guard_pro_creation on public.clinics;
create trigger guard_pro_creation before insert on public.clinics for each row execute function public.guard_pro_creation('clinique');

-- Message clair dès le début : l'autorisation est vérifiée avant le reste du formulaire.
do $$
declare f text; k text;
begin
  foreach f in array array['register_pharmacy', 'register_doctor', 'register_clinic'] loop
    if to_regprocedure('public.' || f || '_checked(jsonb)') is null then
      execute format('alter function public.%I(jsonb) rename to %I', f, f || '_checked');
    end if;
    execute format('revoke execute on function public.%I(jsonb) from public, anon, authenticated', f || '_checked');
    k := case f when 'register_pharmacy' then 'pharmacie' when 'register_doctor' then 'medecin' else 'clinique' end;
    execute format($f$
      create or replace function public.%I(p jsonb) returns uuid
      language plpgsql security definer set search_path = public as $b$
      begin
        perform public.require_auth();
        if not public.has_pro_authorization(%L) then
          raise exception 'PP403: inscription professionnelle réservée : l''administrateur doit d''abord vérifier et autoriser votre compte';
        end if;
        return public.%I(p);
      end $b$;$f$, f, k, f || '_checked');
    execute format('revoke execute on function public.%I(jsonb) from public, anon', f);
    execute format('grant execute on function public.%I(jsonb) to authenticated', f);
  end loop;
end $$;

-- Les demandes d'accès des laboratoires passent désormais par le formulaire de contact
drop policy if exists "pp_lab_requests_insert" on public.lab_access_requests;
revoke insert on public.lab_access_requests from authenticated;

-- ---------------------------------------------------------------------------
-- 3. Demandes de contact des professionnels (aucun compte n'est créé)
-- ---------------------------------------------------------------------------
create table if not exists public.pro_contact_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  kind text not null check (kind in ('pharmacie', 'medecin', 'clinique', 'laboratoire', 'autre')),
  full_name text not null check (char_length(btrim(full_name)) between 2 and 120),
  structure text not null check (char_length(btrim(structure)) between 2 and 160),
  region_id uuid references public.regions(id) on delete set null,
  phone text not null check (public.valid_phone(phone)),
  email text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  authorization_ref text check (char_length(coalesce(authorization_ref, '')) <= 160),
  message text check (char_length(coalesce(message, '')) <= 1000),
  status text not null default 'nouvelle' check (status in ('nouvelle', 'en_cours', 'traitee', 'refusee')),
  admin_note text check (char_length(coalesce(admin_note, '')) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists pro_contact_requests_status on public.pro_contact_requests (status, created_at desc);
alter table public.pro_contact_requests enable row level security;
drop policy if exists "pp_pro_contact_admin" on public.pro_contact_requests;
create policy "pp_pro_contact_admin" on public.pro_contact_requests for select to authenticated using (public.is_admin() or user_id = auth.uid());
revoke all on public.pro_contact_requests from anon, authenticated;
grant select on public.pro_contact_requests to authenticated;

create or replace function public.submit_pro_contact(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare id uuid; uid uuid := auth.uid();
begin
  if uid is not null and (select count(*) from public.pro_contact_requests where user_id = uid and created_at > now() - interval '1 day') >= 3 then
    raise exception 'PP429: trop de demandes aujourd''hui';
  end if;
  if (select count(*) from public.pro_contact_requests where created_at > now() - interval '1 hour') >= 60 then
    raise exception 'PP429: trop de demandes, réessayez plus tard';
  end if;
  insert into public.pro_contact_requests (user_id, kind, full_name, structure, region_id, phone, email, authorization_ref, message)
  values (uid, coalesce(nullif(p ->> 'kind', ''), 'autre'), btrim(p ->> 'full_name'), btrim(p ->> 'structure'),
          nullif(p ->> 'region_id', '')::uuid, p ->> 'phone', nullif(lower(btrim(coalesce(p ->> 'email', ''))), ''),
          nullif(btrim(coalesce(p ->> 'authorization_ref', '')), ''), nullif(btrim(coalesce(p ->> 'message', '')), ''))
  returning pro_contact_requests.id into id;
  return id;
end $$;
revoke execute on function public.submit_pro_contact(jsonb) from public;
grant execute on function public.submit_pro_contact(jsonb) to anon, authenticated;

create or replace function public.admin_pro_contact_status(p_id uuid, p_status text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  if p_status not in ('nouvelle', 'en_cours', 'traitee', 'refusee') then raise exception 'PP422: statut invalide'; end if;
  update public.pro_contact_requests set status = p_status, admin_note = coalesce(nullif(btrim(coalesce(p_note, '')), ''), admin_note), updated_at = now() where id = p_id;
end $$;
revoke execute on function public.admin_pro_contact_status(uuid, text, text) from public, anon;
grant execute on function public.admin_pro_contact_status(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Comptes existants : un profil n'est professionnel que s'il l'est vraiment
-- ---------------------------------------------------------------------------
update public.profiles p set account_type = 'patient'
 where account_type <> 'patient'
   and not exists (select 1 from public.user_roles r where r.user_id = p.id and r.role in ('pharmacist', 'admin'))
   and not exists (select 1 from public.doctors d where d.user_id = p.id)
   and not exists (select 1 from public.clinic_members c where c.user_id = p.id)
   and not exists (select 1 from public.facility_members f where f.user_id = p.id)
   and not exists (select 1 from public.pro_authorizations a where a.user_id = p.id);

-- Les professionnels déjà en place gardent leur accès : on leur donne l'autorisation correspondante
insert into public.pro_authorizations (user_id, kind, note)
select distinct r.user_id, 'pharmacie', 'Pharmacien déjà inscrit avant la 0.22' from public.user_roles r where r.role = 'pharmacist'
on conflict do nothing;
insert into public.pro_authorizations (user_id, kind, note)
select distinct d.user_id, 'medecin', 'Médecin déjà inscrit avant la 0.22' from public.doctors d where d.user_id is not null and not d.is_demo
on conflict do nothing;
insert into public.pro_authorizations (user_id, kind, note)
select distinct c.user_id, 'clinique', 'Établissement déjà inscrit avant la 0.22' from public.clinic_members c
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 5. Identifiants SantéProxi : SP-PH, SP-MD, SP-LB, SP-ET
-- ---------------------------------------------------------------------------
update public.pharmacies set public_code = 'SP-' || substr(public_code, 4) where public_code like 'PP-%';
update public.doctors set public_code = 'SP-' || substr(public_code, 4) where public_code like 'PP-%';
update public.clinics set public_code = 'SP-' || substr(public_code, 4) where public_code like 'PP-%';
update public.facility_listings set public_code = 'SP-' || substr(public_code, 4) where public_code like 'PP-%';
alter table public.pharmacies alter column public_code set default public.next_public_code('SP-PH');
alter table public.doctors alter column public_code set default public.next_public_code('SP-MD');
alter table public.clinics alter column public_code set default public.next_public_code('SP-ET');
create or replace function public.facility_public_code() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.public_code is null then
    new.public_code := public.next_public_code(case when new.kind = 'laboratoire' then 'SP-LB' else 'SP-ET' end);
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Effacement avec le compte
-- ---------------------------------------------------------------------------
create or replace function public.purge_pro_on_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    delete from public.pro_authorizations where user_id = new.id;
    update public.pro_contact_requests set user_id = null where user_id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists purge_pro_on_delete on public.profiles;
create trigger purge_pro_on_delete after update of deleted_at on public.profiles
  for each row execute function public.purge_pro_on_delete();

-- ---------------------------------------------------------------------------
-- 7. Nouveau nom : SantéProxi (contenus publiés et messages automatiques)
--    Les journaux et historiques ne sont pas modifiés.
-- ---------------------------------------------------------------------------
update public.content_pages set body = replace(replace(body, 'PharmaProxi', 'SantéProxi'), 'Votre pharmacie, plus proche de vous', 'Toute la santé, près de chez vous') where body like '%PharmaProxi%' or body like '%Votre pharmacie, plus proche de vous%';
update public.health_articles set body = replace(body::text, 'PharmaProxi', 'SantéProxi')::jsonb where body::text like '%PharmaProxi%';
update public.health_articles set faq = replace(faq::text, 'PharmaProxi', 'SantéProxi')::jsonb where faq::text like '%PharmaProxi%';
update public.health_articles set author_name = replace(author_name, 'PharmaProxi', 'SantéProxi') where author_name like '%PharmaProxi%';
update public.audio_targets set label = replace(label, 'PharmaProxi', 'SantéProxi') where label like '%PharmaProxi%';
update public.audio_targets set script_fr = replace(script_fr, 'PharmaProxi', 'SantéProxi') where script_fr like '%PharmaProxi%';
update public.home_care_providers set source = replace(source, 'PharmaProxi', 'SantéProxi') where source like '%PharmaProxi%';

-- Messages produits par les fonctions (notifications, erreurs, textes)
do $$
declare r record; def text;
begin
  for r in select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.prokind = 'f' and p.prosrc like '%PharmaProxi%' loop
    def := pg_get_functiondef(r.oid);
    execute replace(def, 'PharmaProxi', 'SantéProxi');
  end loop;
end $$;


-- >>> 20261108000100_v023_espace_data_partenaires.sql
-- =============================================================================
-- SantéProxi 0.23 — centres spécialisés, statistiques des établissements,
-- lexique des analyses, SantéProxi Data (évolution, carte, communiqués officiels,
-- validation des données), rendez-vous et résultats chiffrés des laboratoires,
-- documents personnels chiffrés, scanner de médicaments, santé mentale (lignes
-- d'écoute), langues nationales (traductions validées).
--
-- Rien n'est inventé : les spécialités des centres, les codes-barres, les lignes
-- d'écoute, les traductions et les textes du lexique sont saisis ou validés par
-- l'équipe. Les fichiers de santé (résultats, documents) sont chiffrés par le
-- serveur avant d'être stockés et ne sont lus par aucune intelligence artificielle.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Centres spécialisés (diabète, drépanocytose, maternité…)
-- ---------------------------------------------------------------------------
create table if not exists public.care_focus (
  code text primary key check (code ~ '^[a-z0-9_]{2,40}$'),
  label text not null,
  hint text,
  sort int not null default 100
);
alter table public.care_focus enable row level security;
drop policy if exists "pp_care_focus_read" on public.care_focus;
create policy "pp_care_focus_read" on public.care_focus for select to anon, authenticated using (true);
revoke insert, update, delete on public.care_focus from anon, authenticated;
grant select on public.care_focus to anon, authenticated;
insert into public.care_focus (code, label, hint, sort) values
  ('diabete', 'Diabète', 'Suivi du diabète, glycémie, pied diabétique', 10),
  ('drepanocytose', 'Drépanocytose', 'Suivi des enfants et adultes drépanocytaires', 20),
  ('hypertension_coeur', 'Cœur et hypertension', 'Cardiologie, tension artérielle', 30),
  ('cancer', 'Cancers', 'Oncologie, dépistage, traitements', 40),
  ('sante_mentale', 'Santé mentale', 'Psychiatrie, psychologie, addictions', 50),
  ('maternite', 'Maternité et accouchement', 'Consultations prénatales, accouchement', 60),
  ('pediatrie', 'Enfants', 'Pédiatrie, néonatologie, nutrition', 70),
  ('vih', 'VIH', 'Dépistage, traitement et suivi', 80),
  ('tuberculose', 'Tuberculose', 'Dépistage et traitement', 90),
  ('rein_dialyse', 'Reins et dialyse', 'Néphrologie, dialyse', 100),
  ('yeux', 'Yeux', 'Ophtalmologie', 110),
  ('dents', 'Dents', 'Soins dentaires', 120),
  ('orl', 'Oreilles, nez, gorge', 'ORL', 130),
  ('handicap_reeducation', 'Rééducation et handicap', 'Kinésithérapie, appareillage', 140),
  ('urgences_24h', 'Urgences 24 h/24', 'Accueil des urgences jour et nuit', 150),
  ('vaccination', 'Vaccination', 'Centres de vaccination', 160)
on conflict (code) do nothing;

create table if not exists public.facility_focus (
  id uuid primary key default gen_random_uuid(),
  focus_code text not null references public.care_focus(code) on delete cascade,
  clinic_id uuid references public.clinics(id) on delete cascade,
  facility_id uuid references public.facility_listings(id) on delete cascade,
  source text not null check (char_length(btrim(source)) between 3 and 200),
  verified_at date,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (num_nonnulls(clinic_id, facility_id) = 1)
);
create unique index if not exists facility_focus_unique on public.facility_focus (focus_code, coalesce(clinic_id, facility_id));
alter table public.facility_focus enable row level security;
drop policy if exists "pp_facility_focus_read" on public.facility_focus;
create policy "pp_facility_focus_read" on public.facility_focus for select to anon, authenticated using (true);
drop policy if exists "pp_facility_focus_admin" on public.facility_focus;
create policy "pp_facility_focus_admin" on public.facility_focus for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.facility_focus from anon;
grant select on public.facility_focus to anon;
grant select, insert, update, delete on public.facility_focus to authenticated;

create or replace function public.specialized_centres(p_focus text, p_region uuid default null, p_limit int default 100)
returns table (kind text, id uuid, name text, category text, city text, address text, phone text, latitude double precision, longitude double precision,
               source text, verified_at date, link text)
language sql stable security definer set search_path = public as $$
  select 'clinique', c.id, c.name, c.kind, coalesce(co.name, r.name), c.address, c.phone, c.latitude, c.longitude, ff.source, ff.verified_at, '/cliniques/' || c.id
    from public.facility_focus ff join public.clinics c on c.id = ff.clinic_id and c.status = 'verified' and not c.is_demo
    left join public.communes co on co.id = c.commune_id left join public.regions r on r.id = c.region_id
   where ff.focus_code = p_focus and (p_region is null or c.region_id = p_region)
  union all
  select case when f.kind = 'laboratoire' then 'laboratoire' else 'etablissement' end, f.id, f.name, f.kind, coalesce(f.city_label, r.name), f.address, f.phone,
         f.latitude, f.longitude, ff.source, ff.verified_at, case when f.kind = 'laboratoire' then '/laboratoires/fiche/' || f.id else null end
    from public.facility_focus ff join public.facility_listings f on f.id = ff.facility_id and f.is_published
    left join public.regions r on r.id = f.region_id
   where ff.focus_code = p_focus and (p_region is null or f.region_id = p_region)
  order by 3 limit greatest(1, least(p_limit, 300));
$$;
grant execute on function public.specialized_centres(text, uuid, int) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Statistiques de consultation des fiches (aucune donnée personnelle)
-- ---------------------------------------------------------------------------
create table if not exists public.listing_daily_stats (
  entity_kind text not null check (entity_kind in ('pharmacie', 'medecin', 'clinique', 'laboratoire', 'etablissement')),
  entity_id uuid not null,
  day date not null default current_date,
  views int not null default 0,
  calls int not null default 0,
  directions int not null default 0,
  requests int not null default 0,
  primary key (entity_kind, entity_id, day)
);
alter table public.listing_daily_stats enable row level security;
revoke all on public.listing_daily_stats from anon, authenticated;

create or replace function public.track_listing_event(p_kind text, p_id uuid, p_event text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_kind not in ('pharmacie', 'medecin', 'clinique', 'laboratoire', 'etablissement') or p_event not in ('view', 'call', 'directions', 'request') then return; end if;
  insert into public.listing_daily_stats (entity_kind, entity_id, day, views, calls, directions, requests)
  values (p_kind, p_id, current_date, (p_event = 'view')::int, (p_event = 'call')::int, (p_event = 'directions')::int, (p_event = 'request')::int)
  on conflict (entity_kind, entity_id, day) do update set
    views = listing_daily_stats.views + excluded.views, calls = listing_daily_stats.calls + excluded.calls,
    directions = listing_daily_stats.directions + excluded.directions, requests = listing_daily_stats.requests + excluded.requests;
end $$;
revoke execute on function public.track_listing_event(text, uuid, text) from public;
grant execute on function public.track_listing_event(text, uuid, text) to anon, authenticated;

create or replace function public.can_see_listing_stats(p_kind text, p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or case p_kind
    when 'pharmacie' then public.is_pharmacy_member(p_id)
    when 'medecin' then exists (select 1 from public.doctors d where d.id = p_id and d.user_id = auth.uid())
    when 'clinique' then public.is_clinic_member(p_id)
    else public.is_facility_member(p_id) end;
$$;

create or replace function public.my_listing_stats(p_kind text, p_id uuid, p_days int default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare d int := greatest(7, least(coalesce(p_days, 30), 365));
begin
  perform public.require_auth();
  if not public.can_see_listing_stats(p_kind, p_id) then raise exception 'PP403: statistiques réservées à l''établissement' using errcode = '42501'; end if;
  return jsonb_build_object(
    'days', d,
    'total', (select jsonb_build_object('views', coalesce(sum(views), 0), 'calls', coalesce(sum(calls), 0), 'directions', coalesce(sum(directions), 0), 'requests', coalesce(sum(requests), 0))
                from public.listing_daily_stats where entity_kind = p_kind and entity_id = p_id and day > current_date - d),
    'previous', (select jsonb_build_object('views', coalesce(sum(views), 0), 'calls', coalesce(sum(calls), 0))
                from public.listing_daily_stats where entity_kind = p_kind and entity_id = p_id and day <= current_date - d and day > current_date - 2 * d),
    'weeks', coalesce((select jsonb_agg(jsonb_build_object('week', w, 'views', v, 'calls', c) order by w) from (
                select date_trunc('week', day)::date w, sum(views) v, sum(calls) c from public.listing_daily_stats
                 where entity_kind = p_kind and entity_id = p_id and day > current_date - d group by 1) x), '[]'::jsonb));
end $$;
revoke execute on function public.my_listing_stats(text, uuid, int) from public, anon;
grant execute on function public.my_listing_stats(text, uuid, int) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Lexique des analyses (textes publiés seulement après validation)
-- ---------------------------------------------------------------------------
alter table public.medical_exams add column if not exists lay_text text check (char_length(coalesce(lay_text, '')) <= 900);
alter table public.medical_exams add column if not exists lay_status text not null default 'brouillon' check (lay_status in ('brouillon', 'valide'));
alter table public.medical_exams add column if not exists lay_validated_by text check (char_length(coalesce(lay_validated_by, '')) <= 160);
alter table public.medical_exams add column if not exists lay_validated_at date;

create or replace function public.admin_save_lexicon(p_exam uuid, p_text text, p_validated_by text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  if char_length(btrim(coalesce(p_text, ''))) < 20 then raise exception 'PP422: texte trop court'; end if;
  update public.medical_exams set lay_text = btrim(p_text),
    lay_status = case when nullif(btrim(coalesce(p_validated_by, '')), '') is null then 'brouillon' else 'valide' end,
    lay_validated_by = nullif(btrim(coalesce(p_validated_by, '')), ''),
    lay_validated_at = case when nullif(btrim(coalesce(p_validated_by, '')), '') is null then null else current_date end
  where id = p_exam;
  perform public.log_audit('lexicon_save', 'medical_exam', p_exam::text, jsonb_build_object('validated', p_validated_by is not null));
end $$;
revoke execute on function public.admin_save_lexicon(uuid, text, text) from public, anon;
grant execute on function public.admin_save_lexicon(uuid, text, text) to authenticated;

-- Brouillons rédigés par l'équipe : à relire et valider par un biologiste avant publication.
update public.medical_exams m set lay_text = x.t
  from (values
  ('nfs', 'Compte les globules rouges, les globules blancs et les plaquettes du sang. Le médecin la demande souvent en cas de fatigue, de fièvre, de pâleur ou pour un bilan général. Prise de sang au bras.'),
  ('glycemie', 'Mesure le sucre (glucose) dans le sang, le matin avant de manger. Sert à rechercher ou suivre un diabète. Il faut être à jeun : demandez au laboratoire combien d''heures avant.'),
  ('glycemie_pp', 'Mesure le sucre dans le sang environ deux heures après un repas. Complète la glycémie à jeun pour le suivi du diabète. Le laboratoire vous indique l''heure exacte du prélèvement.'),
  ('hba1c', 'Reflète la moyenne du sucre dans le sang sur les deux à trois derniers mois. Utilisée pour suivre un diabète. Il n''est en général pas nécessaire d''être à jeun.'),
  ('hgpo', 'Mesure la façon dont le corps gère le sucre : on boit une boisson sucrée puis on fait plusieurs prises de sang. Utilisée notamment pendant la grossesse. L''examen dure environ deux heures.'),
  ('groupe_sanguin', 'Détermine votre groupe sanguin (A, B, AB ou O) et le rhésus (positif ou négatif). Indispensable avant une transfusion, une opération ou pendant la grossesse. Un résultat à garder toute la vie.'),
  ('paludisme', 'Recherche le parasite du paludisme dans le sang, par une goutte de sang au doigt (test rapide) ou au bras (goutte épaisse). À faire dès qu''il y a de la fièvre, surtout chez l''enfant.'),
  ('crp', 'Mesure une protéine qui augmente lors d''une inflammation ou d''une infection. Aide le médecin à suivre une maladie ou l''effet d''un traitement. Prise de sang au bras.'),
  ('vs', 'Mesure la vitesse à laquelle les globules rouges tombent au fond d''un tube. Elle peut augmenter lors d''inflammations. Le médecin l''interprète avec les autres examens.'),
  ('creatinine', 'Mesure une substance éliminée par les reins. Sert à vérifier que les reins fonctionnent bien, par exemple en cas de diabète, d''hypertension ou avant certains médicaments.'),
  ('uree', 'Mesure un déchet éliminé par les reins. Souvent demandée avec la créatinine pour évaluer le fonctionnement des reins.'),
  ('ionogramme', 'Mesure le sodium, le potassium et d''autres sels minéraux du sang. Utile en cas de diarrhée, de vomissements, de déshydratation ou de traitement par certains médicaments.'),
  ('transaminases', 'Mesure deux enzymes (ASAT et ALAT) qui renseignent sur l''état du foie. Demandées en cas de suspicion d''hépatite ou pour surveiller certains traitements.'),
  ('gamma_gt', 'Mesure une enzyme du foie et des voies biliaires. Le médecin l''interprète avec les autres analyses du foie.'),
  ('bilirubine', 'Mesure un pigment jaune issu de la destruction des globules rouges. Aide à comprendre une jaunisse (yeux ou peau jaunes), chez l''adulte comme chez le nouveau-né.'),
  ('bilan_lipidique', 'Mesure le cholestérol et les triglycérides (graisses du sang). Sert à évaluer le risque pour le cœur et les vaisseaux. Il faut souvent être à jeun : demandez au laboratoire.'),
  ('acide_urique', 'Mesure l''acide urique dans le sang. Le médecin le demande notamment en cas de douleurs articulaires évoquant la goutte.'),
  ('aghbs', 'Recherche le virus de l''hépatite B dans le sang. Recommandé pendant la grossesse et lors d''un dépistage. Un résultat positif doit être expliqué par un médecin, qui propose le suivi adapté.'),
  ('charge_virale_vhb', 'Mesure la quantité de virus de l''hépatite B dans le sang. Sert au suivi des personnes porteuses du virus et à décider d''un traitement.'),
  ('hepatite_c', 'Recherche une infection par le virus de l''hépatite C. Le résultat est expliqué par le médecin, qui demande d''autres examens si besoin.'),
  ('vih', 'Recherche une infection par le VIH. Le dépistage est confidentiel. Un résultat positif est toujours confirmé par un second test et expliqué par un professionnel ; des traitements efficaces existent.'),
  ('charge_virale_vih', 'Mesure la quantité de VIH dans le sang des personnes suivies. Elle montre si le traitement est efficace.'),
  ('cd4', 'Compte certaines cellules de défense du corps (lymphocytes CD4). Utilisé dans le suivi des personnes vivant avec le VIH.'),
  ('syphilis', 'Recherche une infection par la syphilis, une infection sexuellement transmissible qui se soigne. Recommandé pendant la grossesse.'),
  ('widal', 'Recherche des anticorps liés à la fièvre typhoïde. Son interprétation est délicate : seul le médecin peut conclure, souvent avec d''autres examens comme l''hémoculture.'),
  ('hemoculture', 'Recherche des microbes dans le sang en le mettant en culture. Demandée en cas de fièvre importante. Le résultat peut prendre plusieurs jours.'),
  ('ecbu', 'Analyse les urines pour rechercher une infection urinaire et le microbe en cause. Il faut recueillir les urines proprement, de préférence le matin : le laboratoire explique comment.'),
  ('bandelette_urinaire', 'Test rapide des urines avec une bandelette qui change de couleur. Il oriente vers une infection, du sucre ou du sang dans les urines.'),
  ('selles', 'Recherche des parasites dans les selles (vers, amibes…). Le laboratoire indique comment recueillir l''échantillon.'),
  ('coproculture', 'Recherche des microbes dans les selles, par exemple en cas de diarrhée qui dure.'),
  ('tsh', 'Mesure une hormone qui commande la glande thyroïde. Premier examen pour vérifier le fonctionnement de la thyroïde.'),
  ('t3_t4', 'Mesure les hormones fabriquées par la thyroïde. Souvent demandées en complément de la TSH.'),
  ('bhcg', 'Recherche dans le sang l''hormone de la grossesse. Permet de confirmer une grossesse débutante.'),
  ('electrophorese_hb', 'Analyse les différents types d''hémoglobine du sang. C''est l''examen qui permet de savoir si l''on est porteur de la drépanocytose (AS) ou malade (SS). Recommandé avant le mariage.'),
  ('test_emmel', 'Test de dépistage simple de la drépanocytose. Un résultat positif doit être confirmé par l''électrophorèse de l''hémoglobine.'),
  ('tp_inr', 'Mesure la capacité du sang à coaguler. Sert à surveiller certains traitements anticoagulants ou avant une opération.'),
  ('fer_ferritine', 'Mesure le fer et les réserves de fer du corps. Utile en cas d''anémie ou de fatigue, notamment pendant la grossesse.'),
  ('psa', 'Mesure une protéine fabriquée par la prostate. Le médecin l''utilise pour surveiller la prostate chez l''homme ; un résultat élevé n''est pas forcément un cancer et doit être discuté avec lui.'),
  ('frottis', 'Prélèvement de cellules du col de l''utérus, fait par un professionnel. Sert à dépister tôt les lésions qui peuvent mener au cancer du col.'),
  ('bk_crachat', 'Recherche le microbe de la tuberculose dans les crachats. Le laboratoire explique comment recueillir les crachats, souvent le matin.'),
  ('microalbuminurie', 'Recherche de petites quantités de protéines dans les urines. Permet de surveiller les reins chez les personnes diabétiques ou hypertendues.'),
  ('calcemie', 'Mesure le calcium dans le sang, important pour les os, les muscles et le cœur.'),
  ('vitamine_d', 'Mesure la vitamine D dans le sang, utile pour les os.'),
  ('spermogramme', 'Analyse le sperme (nombre et mobilité des spermatozoïdes). Demandé dans le bilan d''un couple qui n''arrive pas à avoir d''enfant. Le laboratoire donne les consignes à respecter.')
  ) as x(code, t)
 where m.code = x.code and m.lay_text is null;

-- ---------------------------------------------------------------------------
-- 4. SantéProxi Data : évolution du référentiel, carte, communiqués, validation
-- ---------------------------------------------------------------------------
create or replace function public.authority_registry_trend(p_region uuid default null, p_months int default 12)
returns table (month date, pharmacies_verified bigint, pharmacies_listed bigint, facilities bigint, labs bigint, doctors bigint, exams_with_price bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.authority_require('stats:registry_trend', jsonb_build_object('region', p_region));
  return query
  select m::date,
    (select count(*) from public.pharmacies p where p.status = 'verified' and not p.is_demo and coalesce(p.verified_at, p.created_at) < m + interval '1 month' and (p_region is null or p.region_id = p_region)),
    (select count(*) from public.pharmacy_listings l where l.is_published and l.created_at < m + interval '1 month' and (p_region is null or l.region_id = p_region)),
    (select count(*) from public.facility_listings f where f.is_published and f.kind <> 'laboratoire' and f.created_at < m + interval '1 month' and (p_region is null or f.region_id = p_region)),
    (select count(*) from public.facility_listings f where f.is_published and f.kind = 'laboratoire' and f.created_at < m + interval '1 month' and (p_region is null or f.region_id = p_region)),
    (select count(*) from public.doctors d where d.status = 'verified' and not d.is_demo and coalesce(d.verified_at, d.created_at) < m + interval '1 month'),
    (select count(*) from public.facility_exams fe join public.facility_listings f on f.id = fe.facility_id
      where fe.price_xof is not null and fe.updated_at < m + interval '1 month' and (p_region is null or f.region_id = p_region))
  from generate_series(date_trunc('month', current_date) - make_interval(months => greatest(1, least(p_months, 36)) - 1), date_trunc('month', current_date), interval '1 month') m;
end $$;

create or replace function public.authority_map_points(p_region uuid default null)
returns table (kind text, name text, latitude double precision, longitude double precision)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.authority_require('stats:map', jsonb_build_object('region', p_region));
  return query
  select 'pharmacie'::text, p.name, p.latitude, p.longitude from public.pharmacies p
   where p.status = 'verified' and not p.is_demo and p.latitude is not null and (p_region is null or p.region_id = p_region)
  union all
  select 'officine', l.name, l.latitude, l.longitude from public.pharmacy_listings l
   where l.is_published and l.claimed_pharmacy_id is null and l.latitude is not null and (p_region is null or l.region_id = p_region)
  union all
  select case when f.kind = 'laboratoire' then 'laboratoire' else 'etablissement' end, f.name, f.latitude, f.longitude from public.facility_listings f
   where f.is_published and f.latitude is not null and (p_region is null or f.region_id = p_region)
  union all
  select 'clinique', c.name, c.latitude, c.longitude from public.clinics c
   where c.status = 'verified' and not c.is_demo and c.latitude is not null and (p_region is null or c.region_id = p_region)
  limit 20000;
end $$;

-- Communiqués officiels publiés par les institutions sous convention
alter table public.authority_members add column if not exists can_publish boolean not null default false;

create table if not exists public.official_communiques (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references public.profiles(id) on delete set null,
  organisation text not null check (char_length(btrim(organisation)) between 2 and 120),
  title text not null check (char_length(btrim(title)) between 5 and 160),
  body text not null check (char_length(btrim(body)) between 20 and 4000),
  link text check (link is null or link ~ '^https?://'),
  region_id uuid references public.regions(id) on delete set null,
  status text not null default 'publie' check (status in ('publie', 'retire')),
  published_at timestamptz not null default now()
);
create index if not exists official_communiques_pub on public.official_communiques (status, published_at desc);
alter table public.official_communiques enable row level security;
drop policy if exists "pp_communiques_read" on public.official_communiques;
create policy "pp_communiques_read" on public.official_communiques for select to anon, authenticated using (status = 'publie' or public.is_admin() or author_id = auth.uid());
revoke insert, update, delete on public.official_communiques from anon, authenticated;
grant select on public.official_communiques to anon, authenticated;

create or replace function public.authority_publish(p_title text, p_body text, p_link text default null, p_region uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_auth(); org text; v_id uuid;
begin
  select organisation into org from public.authority_members where user_id = uid and active and can_publish;
  if org is null and not public.is_admin() then raise exception 'PP403: publication réservée aux institutions sous convention' using errcode = '42501'; end if;
  insert into public.official_communiques (author_id, organisation, title, body, link, region_id)
  values (uid, coalesce(org, 'SantéProxi'), btrim(p_title), btrim(p_body), nullif(btrim(coalesce(p_link, '')), ''), p_region)
  returning id into v_id;
  perform public.log_audit('communique_publish', 'official_communique', v_id::text, '{}'::jsonb);
  return v_id;
exception when check_violation then raise exception 'PP422: vérifiez le titre (5 caractères minimum), le texte (20 minimum) et le lien (https://…)';
end $$;

create or replace function public.withdraw_communique(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.official_communiques set status = 'retire' where id = p_id and (author_id = auth.uid() or public.is_admin());
  if not found then raise exception 'PP403: communiqué introuvable'; end if;
end $$;

create or replace function public.admin_set_can_publish(p_user uuid, p_value boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  update public.authority_members set can_publish = coalesce(p_value, false) where user_id = p_user;
  perform public.log_audit('authority_can_publish', 'profile', p_user::text, jsonb_build_object('value', p_value));
end $$;

-- Validation des données du référentiel par les institutions
create table if not exists public.data_validation_reports (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references public.profiles(id) on delete set null,
  organisation text,
  public_code text not null check (public_code ~ '^SP-(PH|MD|LB|ET)-[0-9]{6}$'),
  verdict text not null check (verdict in ('confirme', 'a_corriger', 'ferme', 'inconnu')),
  comment text check (char_length(coalesce(comment, '')) <= 1000),
  status text not null default 'nouveau' check (status in ('nouveau', 'traite')),
  created_at timestamptz not null default now()
);
alter table public.data_validation_reports enable row level security;
drop policy if exists "pp_data_validation_read" on public.data_validation_reports;
create policy "pp_data_validation_read" on public.data_validation_reports for select to authenticated using (public.is_admin() or author_id = auth.uid());
revoke all on public.data_validation_reports from anon, authenticated;
grant select on public.data_validation_reports to authenticated;

create or replace function public.authority_validate_data(p_code text, p_verdict text, p_comment text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := public.authority_require('data:validate', jsonb_build_object('code', p_code)); org text; v_id uuid; c text := upper(btrim(p_code));
begin
  select organisation into org from public.authority_members where user_id = uid;
  if not exists (select 1 from public.pharmacies where public_code = c union all select 1 from public.doctors where public_code = c
                 union all select 1 from public.clinics where public_code = c union all select 1 from public.facility_listings where public_code = c) then
    raise exception 'PP404: aucun établissement avec cet identifiant';
  end if;
  insert into public.data_validation_reports (author_id, organisation, public_code, verdict, comment)
  values (uid, org, c, p_verdict, nullif(btrim(coalesce(p_comment, '')), '')) returning id into v_id;
  return v_id;
exception when check_violation then raise exception 'PP422: identifiant ou avis invalide';
end $$;

create or replace function public.admin_close_data_report(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  update public.data_validation_reports set status = 'traite' where id = p_id;
end $$;

revoke execute on function public.authority_registry_trend(uuid, int), public.authority_map_points(uuid), public.authority_publish(text, text, text, uuid),
  public.withdraw_communique(uuid), public.admin_set_can_publish(uuid, boolean), public.authority_validate_data(text, text, text), public.admin_close_data_report(uuid) from public, anon;
grant execute on function public.authority_registry_trend(uuid, int), public.authority_map_points(uuid), public.authority_publish(text, text, text, uuid),
  public.withdraw_communique(uuid), public.admin_set_can_publish(uuid, boolean), public.authority_validate_data(text, text, text), public.admin_close_data_report(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Laboratoires : rendez-vous au laboratoire et consentement aux résultats
-- ---------------------------------------------------------------------------
alter table public.lab_home_service add column if not exists appointments_enabled boolean not null default false;
alter table public.lab_home_service add column if not exists appointment_hours text check (char_length(coalesce(appointment_hours, '')) <= 200);
alter table public.lab_home_service add column if not exists results_enabled boolean not null default false;
-- un laboratoire peut proposer les rendez-vous sans le domicile : la ligne existe dès que l'un des deux est réglé
alter table public.home_sampling_requests add column if not exists mode text not null default 'domicile';
alter table public.home_sampling_requests drop constraint if exists home_sampling_requests_mode_check;
alter table public.home_sampling_requests add constraint home_sampling_requests_mode_check check (mode in ('domicile', 'laboratoire'));
alter table public.home_sampling_requests add column if not exists results_consent boolean not null default false;
alter table public.home_sampling_requests alter column address drop not null;
alter table public.home_sampling_requests drop constraint if exists home_sampling_address_needed;
alter table public.home_sampling_requests add constraint home_sampling_address_needed check (mode = 'laboratoire' or address is not null);

create or replace function public.lab_save_options(p_facility uuid, p_appointments boolean, p_hours text, p_results boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_facility_member(p_facility) then raise exception 'PP403: réservé aux membres de ce laboratoire' using errcode = '42501'; end if;
  insert into public.lab_home_service (facility_id, enabled, appointments_enabled, appointment_hours, results_enabled)
  values (p_facility, false, coalesce(p_appointments, false), nullif(btrim(coalesce(p_hours, '')), ''), coalesce(p_results, false))
  on conflict (facility_id) do update set appointments_enabled = excluded.appointments_enabled,
    appointment_hours = excluded.appointment_hours, results_enabled = excluded.results_enabled, updated_at = now();
end $$;
revoke execute on function public.lab_save_options(uuid, boolean, text, boolean) from public, anon;
grant execute on function public.lab_save_options(uuid, boolean, text, boolean) to authenticated;

create or replace function public.request_home_sampling(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_auth(); fac uuid := (p ->> 'facility_id')::uuid; v_id uuid; ex uuid[];
        md text := coalesce(nullif(p ->> 'mode', ''), 'domicile');
begin
  if md = 'laboratoire' then
    if not exists (select 1 from public.lab_home_service s join public.facility_listings f on f.id = s.facility_id and f.is_published where s.facility_id = fac and s.appointments_enabled) then
      raise exception 'PP409: ce laboratoire ne prend pas encore de rendez-vous sur SantéProxi';
    end if;
  elsif not exists (select 1 from public.lab_home_service s join public.facility_listings f on f.id = s.facility_id and f.is_published where s.facility_id = fac and s.enabled) then
    raise exception 'PP409: ce laboratoire ne propose pas de prélèvement à domicile';
  end if;
  if (select count(*) from public.home_sampling_requests where user_id = uid and created_at > now() - interval '1 day') >= 3 then
    raise exception 'PP429: 3 demandes par jour au maximum';
  end if;
  ex := coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(coalesce(p -> 'exam_ids', '[]'::jsonb)) x), '{}');
  if exists (select 1 from unnest(ex) e where not exists (select 1 from public.medical_exams m where m.id = e)) then raise exception 'PP422: analyse inconnue'; end if;
  insert into public.home_sampling_requests (user_id, facility_id, mode, exam_ids, other_exams, patient_name, patient_age, for_relative, address, region_id, phone,
    preferred_date, slot, has_prescription, fasting_known, notes, results_consent)
  values (uid, fac, md, ex, nullif(btrim(p ->> 'other_exams'), ''), btrim(p ->> 'patient_name'), nullif(p ->> 'patient_age', '')::int,
    coalesce((p ->> 'for_relative')::boolean, false), case when md = 'laboratoire' then null else btrim(p ->> 'address') end,
    nullif(p ->> 'region_id', '')::uuid, btrim(p ->> 'phone'),
    (p ->> 'preferred_date')::date, coalesce(nullif(p ->> 'slot', ''), 'matin'), coalesce((p ->> 'has_prescription')::boolean, false),
    coalesce((p ->> 'fasting_known')::boolean, false), nullif(btrim(p ->> 'notes'), ''), coalesce((p ->> 'results_consent')::boolean, false))
  returning id into v_id;
  insert into public.notifications (user_id, kind, title, body, link)
  select m.user_id, 'laboratoire',
         case when md = 'laboratoire' then 'Nouvelle demande de rendez-vous au laboratoire' else 'Nouvelle demande de prélèvement à domicile' end,
         'Une demande attend votre réponse.', '/laboratoire/prelevements'
    from public.facility_members m where m.facility_id = fac;
  perform public.track_listing_event('laboratoire', fac, 'request');
  return v_id;
exception
  when check_violation then raise exception 'PP422: vérifiez le nom, l''adresse, le téléphone, la date et les analyses';
  when invalid_text_representation or invalid_datetime_format then raise exception 'PP422: informations invalides';
end $$;

create or replace function public.lab_update_sampling(p_id uuid, p_status text, p_scheduled timestamptz default null, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare r public.home_sampling_requests; lbl text; what text;
begin
  select * into r from public.home_sampling_requests where id = p_id for update;
  if not found or not public.is_facility_member(r.facility_id) then raise exception 'PP403: demande introuvable' using errcode = '42501'; end if;
  if p_status not in ('acceptee', 'planifiee', 'prelevee', 'terminee', 'refusee') then raise exception 'PP422: statut invalide'; end if;
  if r.status in ('annulee', 'terminee', 'refusee') then raise exception 'PP409: cette demande est close'; end if;
  update public.home_sampling_requests set status = p_status, scheduled_at = coalesce(p_scheduled, scheduled_at),
    lab_note = coalesce(nullif(btrim(coalesce(p_note, '')), ''), lab_note), updated_at = now() where id = p_id;
  what := case when r.mode = 'laboratoire' then 'rendez-vous au laboratoire' else 'prélèvement à domicile' end;
  lbl := case p_status when 'acceptee' then 'Votre demande de ' || what || ' est acceptée'
    when 'planifiee' then 'Votre ' || what || ' est planifié' when 'prelevee' then 'Prélèvement effectué'
    when 'terminee' then 'Votre demande de ' || what || ' est terminée' else 'Votre demande de ' || what || ' n''a pas pu être acceptée' end;
  perform public.notify_user(r.user_id, 'laboratoire', lbl,
    case when p_status = 'planifiee' and coalesce(p_scheduled, r.scheduled_at) is not null
      then 'Rendez-vous le ' || to_char(coalesce(p_scheduled, r.scheduled_at) at time zone 'utc', 'DD/MM/YYYY à HH24"h"MI') || '.' else 'Ouvrez SantéProxi pour voir le détail.' end,
    null, '/compte/prelevements');
end $$;

-- ---------------------------------------------------------------------------
-- 6. Résultats d'analyses envoyés par le laboratoire (fichier chiffré)
-- ---------------------------------------------------------------------------
create table if not exists public.lab_results (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.home_sampling_requests(id) on delete cascade,
  facility_id uuid not null references public.facility_listings(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null unique,
  file_name text check (char_length(coalesce(file_name, '')) <= 160),
  mime text not null check (mime in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  size_bytes int not null check (size_bytes between 1 and 10485760),
  note text check (char_length(coalesce(note, '')) <= 500),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  first_opened_at timestamptz
);
create index if not exists lab_results_user on public.lab_results (user_id, created_at desc);
alter table public.lab_results enable row level security;
drop policy if exists "pp_lab_results_read" on public.lab_results;
create policy "pp_lab_results_read" on public.lab_results for select to authenticated using (user_id = auth.uid() or public.is_facility_member(facility_id));
revoke all on public.lab_results from anon, authenticated;
grant select on public.lab_results to authenticated;

create or replace function public.lab_can_upload_result(p_request uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.home_sampling_requests r join public.lab_home_service s on s.facility_id = r.facility_id and s.results_enabled
                  where r.id = p_request and r.results_consent and r.status in ('prelevee', 'terminee', 'planifiee', 'acceptee')
                    and public.is_facility_member(r.facility_id));
$$;

create or replace function public.lab_add_result(p_request uuid, p_path text, p_name text, p_mime text, p_size int, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare r public.home_sampling_requests; v_id uuid;
begin
  select * into r from public.home_sampling_requests where id = p_request;
  if not found or not public.lab_can_upload_result(p_request) then
    raise exception 'PP403: envoi impossible : le patient doit avoir accepté de recevoir ses résultats sur SantéProxi' using errcode = '42501';
  end if;
  if p_path !~ ('^' || r.facility_id::text || '/' || r.id::text || '/[0-9a-f-]{36}\.bin$') then raise exception 'PP422: fichier invalide'; end if;
  insert into public.lab_results (request_id, facility_id, user_id, storage_path, file_name, mime, size_bytes, note, created_by)
  values (r.id, r.facility_id, r.user_id, p_path, left(p_name, 160), p_mime, p_size, nullif(btrim(coalesce(p_note, '')), ''), auth.uid())
  returning id into v_id;
  perform public.notify_user(r.user_id, 'laboratoire', 'Vos résultats d''analyses sont disponibles',
    'Ouvrez SantéProxi pour les consulter. Faites-les interpréter par votre médecin.', null, '/compte/resultats');
  perform public.log_audit('lab_result_add', 'lab_result', v_id::text, jsonb_build_object('request', r.id));
  return v_id;
end $$;

create or replace function public.mark_result_opened(p_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.lab_results set first_opened_at = coalesce(first_opened_at, now()) where id = p_id and user_id = auth.uid();
$$;

create or replace function public.delete_lab_result(p_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare p text;
begin
  delete from public.lab_results where id = p_id and (user_id = auth.uid() or public.is_facility_member(facility_id)) returning storage_path into p;
  if p is null then raise exception 'PP404: résultat introuvable'; end if;
  return p;
end $$;
revoke execute on function public.lab_add_result(uuid, text, text, text, int, text), public.mark_result_opened(uuid), public.delete_lab_result(uuid) from public, anon;
grant execute on function public.lab_add_result(uuid, text, text, text, int, text), public.mark_result_opened(uuid), public.delete_lab_result(uuid) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('lab-results', 'lab-results', false, 11534336, array['application/octet-stream'])
on conflict (id) do nothing;
drop policy if exists "pp_lab_results_insert" on storage.objects;
create policy "pp_lab_results_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'lab-results' and public.lab_can_upload_result(((storage.foldername(name))[2])::uuid)
              and exists (select 1 from public.home_sampling_requests r where r.id = ((storage.foldername(name))[2])::uuid and r.facility_id::text = (storage.foldername(name))[1]));
drop policy if exists "pp_lab_results_select" on storage.objects;
create policy "pp_lab_results_select" on storage.objects for select to authenticated
  using (bucket_id = 'lab-results' and exists (select 1 from public.lab_results x where x.storage_path = name and (x.user_id = auth.uid() or public.is_facility_member(x.facility_id))));
drop policy if exists "pp_lab_results_delete" on storage.objects;
create policy "pp_lab_results_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'lab-results' and (public.is_facility_member(((storage.foldername(name))[1])::uuid)
         or exists (select 1 from public.home_sampling_requests r where r.id = ((storage.foldername(name))[2])::uuid and r.user_id = auth.uid())));

-- ---------------------------------------------------------------------------
-- 7. Documents personnels du dossier santé (fichiers chiffrés, visibles par le seul titulaire)
-- ---------------------------------------------------------------------------
create table if not exists public.record_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  person_id uuid not null references public.record_persons(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 2 and 120),
  doc_kind text not null default 'autre' check (doc_kind in ('ordonnance', 'resultat', 'compte_rendu', 'certificat', 'vaccination', 'autre')),
  doc_date date,
  storage_path text not null unique,
  mime text not null check (mime in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  size_bytes int not null check (size_bytes between 1 and 10485760),
  created_at timestamptz not null default now()
);
create index if not exists record_documents_person on public.record_documents (person_id, created_at desc);
alter table public.record_documents enable row level security;
drop policy if exists "pp_record_documents_owner" on public.record_documents;
create policy "pp_record_documents_owner" on public.record_documents for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists (select 1 from public.record_persons p where p.id = person_id and p.owner_id = auth.uid())
              and storage_path like auth.uid()::text || '/%');
revoke all on public.record_documents from anon;
grant select, insert, delete on public.record_documents to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('personal-documents', 'personal-documents', false, 11534336, array['application/octet-stream'])
on conflict (id) do nothing;
drop policy if exists "pp_personal_docs_insert" on storage.objects;
create policy "pp_personal_docs_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'personal-documents' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "pp_personal_docs_select" on storage.objects;
create policy "pp_personal_docs_select" on storage.objects for select to authenticated
  using (bucket_id = 'personal-documents' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "pp_personal_docs_delete" on storage.objects;
create policy "pp_personal_docs_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'personal-documents' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- 8. Scanner de médicaments : propositions de codes-barres (validées par l'équipe)
-- ---------------------------------------------------------------------------
create table if not exists public.gtin_suggestions (
  id uuid primary key default gen_random_uuid(),
  code text not null check (code ~ '^[0-9]{8,14}$'),
  catalog_id uuid not null references public.medicine_catalog(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  status text not null default 'nouvelle' check (status in ('nouvelle', 'acceptee', 'refusee')),
  created_at timestamptz not null default now(),
  unique (code, catalog_id)
);
alter table public.gtin_suggestions enable row level security;
drop policy if exists "pp_gtin_suggestions_admin" on public.gtin_suggestions;
create policy "pp_gtin_suggestions_admin" on public.gtin_suggestions for select to authenticated using (public.is_admin() or user_id = auth.uid());
revoke all on public.gtin_suggestions from anon, authenticated;
grant select on public.gtin_suggestions to authenticated;

create or replace function public.suggest_gtin(p_code text, p_catalog uuid)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_auth();
begin
  if (select count(*) from public.gtin_suggestions where user_id = uid and created_at > now() - interval '1 day') >= 10 then raise exception 'PP429: trop de propositions aujourd''hui'; end if;
  if exists (select 1 from public.medicine_identifiers where id_type = 'gtin' and value = btrim(p_code)) then raise exception 'PP409: ce code est déjà connu'; end if;
  insert into public.gtin_suggestions (code, catalog_id, user_id) values (btrim(p_code), p_catalog, uid) on conflict do nothing;
exception when check_violation then raise exception 'PP422: code-barres invalide (8 à 14 chiffres)';
end $$;

create or replace function public.admin_review_gtin(p_id uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = public as $$
declare s public.gtin_suggestions;
begin
  perform public.require_admin();
  select * into s from public.gtin_suggestions where id = p_id for update;
  if not found then raise exception 'PP404: proposition introuvable'; end if;
  if p_accept then
    insert into public.medicine_identifiers (catalog_id, id_type, value) values (s.catalog_id, 'gtin', s.code) on conflict (id_type, value) do nothing;
  end if;
  update public.gtin_suggestions set status = case when p_accept then 'acceptee' else 'refusee' end where id = p_id;
end $$;
revoke execute on function public.suggest_gtin(text, uuid), public.admin_review_gtin(uuid, boolean) from public, anon;
grant execute on function public.suggest_gtin(text, uuid), public.admin_review_gtin(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. Santé mentale : lignes d'écoute et d'aide (saisies et vérifiées par l'équipe)
-- ---------------------------------------------------------------------------
create table if not exists public.support_lines (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  phone text not null check (char_length(btrim(phone)) between 3 and 30),
  hours text check (char_length(coalesce(hours, '')) <= 120),
  description text check (char_length(coalesce(description, '')) <= 400),
  topic text not null default 'sante_mentale' check (topic in ('sante_mentale', 'violences', 'addictions', 'jeunes', 'autre')),
  source text not null check (char_length(btrim(source)) between 3 and 200),
  verified_at date not null default current_date,
  active boolean not null default true,
  sort int not null default 100
);
alter table public.support_lines enable row level security;
drop policy if exists "pp_support_lines_read" on public.support_lines;
create policy "pp_support_lines_read" on public.support_lines for select to anon, authenticated using (active or public.is_admin());
drop policy if exists "pp_support_lines_admin" on public.support_lines;
create policy "pp_support_lines_admin" on public.support_lines for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.support_lines from anon;
grant select on public.support_lines to anon;
grant select, insert, update, delete on public.support_lines to authenticated;

-- ---------------------------------------------------------------------------
-- 10. Langues nationales : traductions de l'interface, publiées après validation
-- ---------------------------------------------------------------------------
create table if not exists public.ui_translations (
  key text not null check (key ~ '^[a-z0-9_.]{2,80}$'),
  lang text not null check (lang in ('bm', 'snk', 'ff', 'son')),
  text text not null check (char_length(btrim(text)) between 1 and 400),
  status text not null default 'propose' check (status in ('propose', 'valide')),
  proposed_by text check (char_length(coalesce(proposed_by, '')) <= 120),
  validated_by text check (char_length(coalesce(validated_by, '')) <= 120),
  updated_at timestamptz not null default now(),
  primary key (key, lang)
);
alter table public.ui_translations enable row level security;
drop policy if exists "pp_translations_read" on public.ui_translations;
create policy "pp_translations_read" on public.ui_translations for select to anon, authenticated using (status = 'valide' or public.is_admin());
drop policy if exists "pp_translations_admin" on public.ui_translations;
create policy "pp_translations_admin" on public.ui_translations for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.ui_translations from anon;
grant select on public.ui_translations to anon;
grant select, insert, update, delete on public.ui_translations to authenticated;

-- ---------------------------------------------------------------------------
-- 11. Effacement avec le compte
-- ---------------------------------------------------------------------------
create or replace function public.purge_v023_on_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    delete from public.record_documents where user_id = new.id;
    delete from public.lab_results where user_id = new.id;
    update public.gtin_suggestions set user_id = null where user_id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists purge_v023_on_delete on public.profiles;
create trigger purge_v023_on_delete after update of deleted_at on public.profiles
  for each row execute function public.purge_v023_on_delete();


-- >>> 20261109000100_v024_sos_numeros_urgence.sql
-- =============================================================================
-- SantéProxi 0.24.0 — SOS Santé : annuaire des numéros d'urgence administrable
-- Migration additive : crée une table, ne modifie ni ne supprime aucune donnée.
-- Retour arrière : drop table if exists public.emergency_contacts;
-- =============================================================================

create table if not exists public.emergency_contacts (
  id uuid primary key default gen_random_uuid(),
  country text not null default 'ML' check (country ~ '^[A-Z]{2}$'),
  region text check (char_length(coalesce(region, '')) <= 80),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  mission text check (char_length(coalesce(mission, '')) <= 300),
  phone text not null check (phone ~ '^[0-9+ ]{3,20}$'),
  phone_alt text check (phone_alt is null or phone_alt ~ '^[0-9+ ]{3,20}$'),
  tier text not null default 'principal' check (tier in ('principal', 'complementaire')),
  icon text not null default 'autre' check (icon in ('sante', 'protection_civile', 'police', 'gendarmerie', 'crise', 'garde', 'ambulance', 'autre')),
  status text not null default 'a_verifier' check (status in ('a_verifier', 'verifie', 'a_actualiser')),
  source_url text check (source_url is null or source_url ~ '^https://'),
  source_note text check (char_length(coalesce(source_note, '')) <= 200),
  verified_at date,
  active boolean not null default true,
  sort int not null default 100,
  updated_at timestamptz not null default now(),
  unique (country, phone)
);
create index if not exists emergency_contacts_country_idx on public.emergency_contacts (country, active, tier, sort);

alter table public.emergency_contacts enable row level security;
drop policy if exists "pp_emergency_contacts_read" on public.emergency_contacts;
create policy "pp_emergency_contacts_read" on public.emergency_contacts for select to anon, authenticated using (active or public.is_admin());
drop policy if exists "pp_emergency_contacts_admin" on public.emergency_contacts;
create policy "pp_emergency_contacts_admin" on public.emergency_contacts for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.emergency_contacts from anon;
grant select on public.emergency_contacts to anon;
grant select, insert, update, delete on public.emergency_contacts to authenticated;

create or replace function public.touch_emergency_contacts()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists touch_emergency_contacts on public.emergency_contacts;
create trigger touch_emergency_contacts before update on public.emergency_contacts
  for each row execute function public.touch_emergency_contacts();

-- Numéros communiqués par le porteur du projet, avec les sources officielles indiquées.
-- Statut « à vérifier » : la vérification auprès des autorités reste à faire (l'administrateur la confirme dans /admin/urgences).
-- Les anciens numéros 15, 17 et 18 ne sont volontairement pas ajoutés.
insert into public.emergency_contacts (country, name, mission, phone, phone_alt, tier, icon, status, source_url, sort) values
  ('ML', 'Numéro vert Santé', 'Information et orientation sanitaire du ministère de la Santé.', '36061', null, 'principal', 'sante', 'a_verifier', 'https://sante.gov.ml/index.php?Itemid=111&id=187&option=com_content&view=article', 10),
  ('ML', 'Protection civile', 'Secours aux personnes, accidents, incendies, évacuations.', '122', null, 'principal', 'protection_civile', 'a_verifier', 'https://dgpc.gouv.ml/', 20),
  ('ML', 'Police nationale', 'Sécurité des personnes, agressions, troubles à l''ordre public.', '101', null, 'principal', 'police', 'a_verifier', 'https://police.gouv.ml/services', 30),
  ('ML', 'Gendarmerie nationale', 'Sécurité des personnes et des biens, secours.', '111', null, 'principal', 'gendarmerie', 'a_verifier', null, 40),
  ('ML', 'Gestion des crises', 'Signalement des situations de crise et de catastrophe.', '144', null, 'principal', 'crise', 'a_verifier', null, 50),
  ('ML', 'Garde nationale', 'Appui sécuritaire et intervention.', '145', null, 'principal', 'garde', 'a_verifier', null, 60),
  ('ML', 'Protection civile', 'Lignes complémentaires de la Protection civile.', '80001201', '20228081', 'complementaire', 'protection_civile', 'a_verifier', 'https://dgpc.gouv.ml/', 110),
  ('ML', 'Police secours', 'Lignes complémentaires de Police secours.', '80001115', '20239511', 'complementaire', 'police', 'a_verifier', 'https://police.gouv.ml/services', 120),
  ('ML', 'Police nationale', 'Ligne complémentaire de la Police nationale.', '80001125', null, 'complementaire', 'police', 'a_verifier', 'https://police.gouv.ml/services', 130),
  ('ML', 'Gendarmerie', 'Ligne complémentaire de la Gendarmerie.', '80001114', null, 'complementaire', 'gendarmerie', 'a_verifier', null, 140)
on conflict (country, phone) do nothing;


