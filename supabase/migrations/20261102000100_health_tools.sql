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
