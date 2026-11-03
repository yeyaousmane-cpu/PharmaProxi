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
