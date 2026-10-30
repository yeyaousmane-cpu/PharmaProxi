-- ============================================================================
-- PharmaProxi — Migration : PharmaProxi Femme (espace privé de santé féminine)
--   * Données visibles UNIQUEMENT par l'utilisatrice (aucune politique pour
--     l'administration, aucune fonction d'administration ne les lit).
--   * Activation par déclaration (espace réservé aux femmes) et consentement.
--   * Code secret facultatif : tant que l'espace est verrouillé, la base refuse
--     toute lecture et toute écriture (contrôle fait par la base, pas seulement l'écran).
--   * Adolescentes (13-17 ans) : pas de suivi des rapports, pas de projet de
--     conception, pas de partage partenaire.
--   * Rappels : notifications dans le compte uniquement, au texte neutre.
--   * Export et suppression complète à tout moment ; journal des accès sensibles.
-- Peut être relancé sans erreur.
-- ============================================================================

create table if not exists public.femme_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  declared_woman boolean not null check (declared_woman),
  consent_at timestamptz not null default now(),
  age_band text not null check (age_band in ('13-17', '18-24', '25-34', '35-44', '45-54', '55+')),
  journey text not null default 'cycle' check (journey in ('cycle', 'conception', 'grossesse', 'postpartum', 'menopause')),
  cycle_length int not null default 28 check (cycle_length between 15 and 60),
  period_length int not null default 5 check (period_length between 1 and 15),
  regularity text not null default 'ne_sait_pas' check (regularity in ('regulier', 'irregulier', 'ne_sait_pas')),
  pregnancy_lmp date,            -- premier jour des dernières règles avant la grossesse
  pregnancy_due date,            -- date prévue d'accouchement communiquée par la sage-femme ou le médecin (prioritaire)
  delivery_date date,            -- date de l'accouchement (post-partum)
  discreet boolean not null default false,
  remind_period boolean not null default false,
  remind_days_before int not null default 2 check (remind_days_before between 0 and 7),
  remind_log boolean not null default false,
  last_period_reminder date,
  last_log_reminder date,
  pin_hash text,
  pin_failures int not null default 0,
  pin_blocked_until timestamptz,
  unlocked_until timestamptz,
  partner_token text unique,
  partner_topics text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint femme_teen_limits check (age_band <> '13-17' or (journey <> 'conception' and partner_token is null)),
  constraint femme_partner_topics check (partner_topics <@ array['cycle', 'fertilite', 'grossesse', 'postpartum', 'menopause', 'general']::text[])
);

create table if not exists public.femme_periods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.femme_profiles(user_id) on delete cascade,
  start_date date not null,
  end_date date,
  created_at timestamptz not null default now(),
  unique (user_id, start_date),
  check (end_date is null or (end_date >= start_date and end_date <= start_date + 15))
);
create index if not exists femme_periods_user_idx on public.femme_periods(user_id, start_date desc);

create table if not exists public.femme_days (
  user_id uuid not null references public.femme_profiles(user_id) on delete cascade,
  day date not null,
  flow text check (flow in ('aucun', 'traces', 'leger', 'moyen', 'abondant')),
  symptoms text[] not null default '{}' check (symptoms <@ array['crampes', 'douleur_ventre', 'mal_tete', 'fatigue', 'acne', 'ballonnements',
    'seins_sensibles', 'nausees', 'mal_dos', 'pertes', 'saignement_inhabituel', 'bouffees_chaleur', 'insomnie', 'vertiges', 'envies', 'autre']::text[]),
  mood text check (mood in ('bien', 'calme', 'fatiguee', 'irritable', 'triste', 'anxieuse', 'energique')),
  pain smallint check (pain between 0 and 10),
  sleep smallint check (sleep between 1 and 5),
  mucus text check (mucus in ('aucune', 'collante', 'cremeuse', 'aqueuse', 'blanc_oeuf')),
  temperature numeric(4, 2) check (temperature between 34 and 43),
  intercourse text check (intercourse in ('protege', 'non_protege')),
  test_result text check (test_result in ('ovulation_positif', 'ovulation_negatif', 'grossesse_positif', 'grossesse_negatif')),
  note text check (char_length(note) <= 4000),   -- chiffrée par le serveur du site quand la clé est configurée
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

create table if not exists public.femme_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.femme_profiles(user_id) on delete cascade,
  kind text not null check (kind in ('consultation_prenatale', 'examen', 'traitement', 'rendez_vous', 'autre')),
  label text not null check (char_length(btrim(label)) between 2 and 80),
  due_at timestamptz not null,
  repeat text not null default 'aucune' check (repeat in ('aucune', 'quotidienne', 'hebdomadaire', 'mensuelle')),
  done boolean not null default false,
  notified_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists femme_reminders_due_idx on public.femme_reminders(due_at) where not done;

create table if not exists public.femme_access_log (
  id bigserial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  action text not null,
  at timestamptz not null default now()
);
create index if not exists femme_access_log_user_idx on public.femme_access_log(user_id, at desc);

-- ---------------------------------------------------------------------------
-- Verrou
-- ---------------------------------------------------------------------------
create or replace function public.femme_unlocked(p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.femme_profiles f where f.user_id = p_user and p_user is not null
                 and (f.pin_hash is null or f.unlocked_until > now()))
$$;

-- Contrôle commun aux fonctions : compte connecté, espace activé et déverrouillé ;
-- prolonge le déverrouillage de 30 minutes à chaque action.
create or replace function public.femme_require()
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'PP401: connectez-vous pour accéder à votre espace'; end if;
  if not exists (select 1 from public.femme_profiles where user_id = uid) then raise exception 'PP404: espace non activé'; end if;
  if not public.femme_unlocked(uid) then raise exception 'PP423: espace verrouillé, saisissez votre code'; end if;
  update public.femme_profiles set unlocked_until = now() + interval '30 minutes' where user_id = uid and pin_hash is not null;
  return uid;
end $$;

create or replace function public.femme_log(p_user uuid, p_action text)
returns void language sql security definer set search_path = public as $$
  insert into public.femme_access_log (user_id, action) values (p_user, p_action);
  delete from public.femme_access_log where user_id = p_user and at < now() - interval '365 days';
$$;

-- ---------------------------------------------------------------------------
-- Lecture : uniquement ses propres données, et seulement si l'espace est déverrouillé
-- ---------------------------------------------------------------------------
alter table public.femme_profiles enable row level security;
alter table public.femme_periods enable row level security;
alter table public.femme_days enable row level security;
alter table public.femme_reminders enable row level security;
alter table public.femme_access_log enable row level security;

drop policy if exists "pp_femme_profile_own" on public.femme_profiles;
create policy "pp_femme_profile_own" on public.femme_profiles for select to authenticated using (user_id = auth.uid() and public.femme_unlocked());
drop policy if exists "pp_femme_periods_own" on public.femme_periods;
create policy "pp_femme_periods_own" on public.femme_periods for select to authenticated using (user_id = auth.uid() and public.femme_unlocked());
drop policy if exists "pp_femme_days_own" on public.femme_days;
create policy "pp_femme_days_own" on public.femme_days for select to authenticated using (user_id = auth.uid() and public.femme_unlocked());
drop policy if exists "pp_femme_reminders_own" on public.femme_reminders;
create policy "pp_femme_reminders_own" on public.femme_reminders for select to authenticated using (user_id = auth.uid() and public.femme_unlocked());
drop policy if exists "pp_femme_log_own" on public.femme_access_log;
create policy "pp_femme_log_own" on public.femme_access_log for select to authenticated using (user_id = auth.uid() and public.femme_unlocked());

revoke all on public.femme_profiles, public.femme_periods, public.femme_days, public.femme_reminders, public.femme_access_log from anon;
revoke insert, update, delete on public.femme_profiles, public.femme_periods, public.femme_days, public.femme_reminders, public.femme_access_log from authenticated;
grant select on public.femme_periods, public.femme_days, public.femme_reminders, public.femme_access_log to authenticated;
-- Le code secret (empreinte) et le jeton partenaire ne sont jamais lisibles directement
revoke select on public.femme_profiles from authenticated;
grant select (user_id, consent_at, age_band, journey, cycle_length, period_length, regularity, pregnancy_lmp, pregnancy_due, delivery_date,
              discreet, remind_period, remind_days_before, remind_log, partner_topics, created_at, updated_at) on public.femme_profiles to authenticated;

-- ---------------------------------------------------------------------------
-- État (lisible même verrouillé : n'indique que l'état du verrou)
-- ---------------------------------------------------------------------------
create or replace function public.femme_status()
returns jsonb language sql stable security definer set search_path = public as $$
  select case when auth.uid() is null then jsonb_build_object('signed_in', false)
    else coalesce((select jsonb_build_object('signed_in', true, 'enabled', true, 'has_pin', f.pin_hash is not null,
                     'locked', not public.femme_unlocked(f.user_id), 'discreet', f.discreet,
                     'blocked_until', case when f.pin_blocked_until > now() then f.pin_blocked_until end,
                     'partner', f.partner_token is not null and public.femme_unlocked(f.user_id))
                   from public.femme_profiles f where f.user_id = auth.uid()),
                  jsonb_build_object('signed_in', true, 'enabled', false)) end
$$;

-- Jeton partenaire (seulement si déverrouillé)
create or replace function public.femme_partner_token()
returns text language sql stable security definer set search_path = public as $$
  select f.partner_token from public.femme_profiles f where f.user_id = auth.uid() and public.femme_unlocked(f.user_id)
$$;

-- ---------------------------------------------------------------------------
-- Activation et profil
-- ---------------------------------------------------------------------------
create or replace function public.femme_activate(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'PP401: connectez-vous pour activer votre espace'; end if;
  if coalesce((p ->> 'declared_woman')::boolean, false) is not true then raise exception 'PP422: cet espace est réservé aux femmes'; end if;
  if coalesce((p ->> 'consent')::boolean, false) is not true then raise exception 'PP422: votre accord est nécessaire pour enregistrer ces informations'; end if;
  if exists (select 1 from public.femme_profiles where user_id = uid) then raise exception 'PP409: votre espace est déjà activé'; end if;
  insert into public.femme_profiles (user_id, declared_woman, age_band, journey, cycle_length, period_length, regularity, pregnancy_lmp, pregnancy_due, delivery_date)
  values (uid, true, p ->> 'age_band', coalesce(p ->> 'journey', 'cycle'),
          coalesce((p ->> 'cycle_length')::int, 28), coalesce((p ->> 'period_length')::int, 5), coalesce(p ->> 'regularity', 'ne_sait_pas'),
          nullif(p ->> 'pregnancy_lmp', '')::date, nullif(p ->> 'pregnancy_due', '')::date, nullif(p ->> 'delivery_date', '')::date);
  if nullif(p ->> 'last_period', '') is not null then
    insert into public.femme_periods (user_id, start_date) values (uid, (p ->> 'last_period')::date);
  end if;
  perform public.femme_log(uid, 'activation');
exception
  when check_violation then raise exception 'PP422: informations à vérifier (tranche d''âge, durées, situation — certaines options ne sont pas proposées avant 18 ans)';
  when invalid_datetime_format or datetime_field_overflow or invalid_text_representation then raise exception 'PP422: date ou nombre invalide';
end $$;

create or replace function public.femme_update_profile(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public.femme_require();
begin
  update public.femme_profiles set
    age_band = coalesce(p ->> 'age_band', age_band),
    journey = coalesce(p ->> 'journey', journey),
    cycle_length = coalesce((p ->> 'cycle_length')::int, cycle_length),
    period_length = coalesce((p ->> 'period_length')::int, period_length),
    regularity = coalesce(p ->> 'regularity', regularity),
    pregnancy_lmp = case when p ? 'pregnancy_lmp' then nullif(p ->> 'pregnancy_lmp', '')::date else pregnancy_lmp end,
    pregnancy_due = case when p ? 'pregnancy_due' then nullif(p ->> 'pregnancy_due', '')::date else pregnancy_due end,
    delivery_date = case when p ? 'delivery_date' then nullif(p ->> 'delivery_date', '')::date else delivery_date end,
    discreet = coalesce((p ->> 'discreet')::boolean, discreet),
    remind_period = coalesce((p ->> 'remind_period')::boolean, remind_period),
    remind_days_before = coalesce((p ->> 'remind_days_before')::int, remind_days_before),
    remind_log = coalesce((p ->> 'remind_log')::boolean, remind_log),
    updated_at = now()
  where user_id = uid;
  -- Passage en tranche adolescente : le partage et le suivi des rapports sont retirés
  update public.femme_profiles set partner_token = null, partner_topics = '{}' where user_id = uid and age_band = '13-17';
  update public.femme_days set intercourse = null where user_id = uid and intercourse is not null
    and exists (select 1 from public.femme_profiles where user_id = uid and age_band = '13-17');
exception
  when check_violation then raise exception 'PP422: informations à vérifier (certaines options ne sont pas proposées avant 18 ans)';
  when invalid_datetime_format or datetime_field_overflow or invalid_text_representation then raise exception 'PP422: date ou nombre invalide';
end $$;

-- ---------------------------------------------------------------------------
-- Code secret (4 à 6 chiffres, empreinte bcrypt) et verrouillage
-- ---------------------------------------------------------------------------
create or replace function public.femme_set_pin(p_pin text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare uid uuid := public.femme_require();
begin
  if p_pin is null or p_pin = '' then
    update public.femme_profiles set pin_hash = null, unlocked_until = null, pin_failures = 0 where user_id = uid;
    perform public.femme_log(uid, 'code_retire');
    return;
  end if;
  if p_pin !~ '^[0-9]{4,6}$' then raise exception 'PP422: le code doit contenir 4 à 6 chiffres'; end if;
  update public.femme_profiles set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf', 8)), pin_failures = 0,
         unlocked_until = now() + interval '30 minutes' where user_id = uid;
  perform public.femme_log(uid, 'code_defini');
end $$;

create or replace function public.femme_unlock(p_pin text)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare uid uuid := auth.uid(); f public.femme_profiles;
begin
  select * into f from public.femme_profiles where user_id = uid for update;
  if not found then raise exception 'PP404: espace non activé'; end if;
  if f.pin_hash is null then return true; end if;
  if f.pin_blocked_until > now() then raise exception 'PP429: trop d''essais, réessayez dans quelques minutes'; end if;
  if extensions.crypt(coalesce(p_pin, ''), f.pin_hash) = f.pin_hash then
    update public.femme_profiles set pin_failures = 0, pin_blocked_until = null, unlocked_until = now() + interval '30 minutes' where user_id = uid;
    perform public.femme_log(uid, 'deverrouillage');
    return true;
  end if;
  update public.femme_profiles set
    pin_failures = case when pin_failures + 1 >= 5 then 0 else pin_failures + 1 end,
    pin_blocked_until = case when pin_failures + 1 >= 5 then now() + interval '15 minutes' end
  where user_id = uid;
  perform public.femme_log(uid, 'code_errone');
  return false;
end $$;

create or replace function public.femme_lock()
returns void language sql security definer set search_path = public as $$
  update public.femme_profiles set unlocked_until = null where user_id = auth.uid()
$$;

-- ---------------------------------------------------------------------------
-- Règles
-- ---------------------------------------------------------------------------
create or replace function public.femme_save_period(p_id uuid, p_start date, p_end date)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := public.femme_require(); rid uuid; plen int;
begin
  select period_length - 1 into plen from public.femme_profiles where user_id = uid;
  if p_start is null or p_start > current_date + 1 then raise exception 'PP422: date de début invalide (pas dans le futur)'; end if;
  if p_end is not null and p_end > current_date + 1 then raise exception 'PP422: la date de fin ne peut pas être dans le futur'; end if;
  if p_start < current_date - interval '5 years' then raise exception 'PP422: date trop ancienne'; end if;
  if exists (select 1 from public.femme_periods x where x.user_id = uid and x.id is distinct from p_id
             and daterange(x.start_date, coalesce(x.end_date, x.start_date + plen), '[]') && daterange(p_start, coalesce(p_end, p_start), '[]')) then
    raise exception 'PP409: ces dates chevauchent des règles déjà enregistrées';
  end if;
  if p_id is null then
    insert into public.femme_periods (user_id, start_date, end_date) values (uid, p_start, p_end) returning id into rid;
  else
    update public.femme_periods set start_date = p_start, end_date = p_end where id = p_id and user_id = uid returning id into rid;
    if rid is null then raise exception 'PP404: enregistrement introuvable'; end if;
  end if;
  return rid;
exception
  when check_violation then raise exception 'PP422: la fin doit suivre le début (15 jours au plus)';
  when unique_violation then raise exception 'PP409: des règles commencent déjà ce jour-là';
end $$;

create or replace function public.femme_delete_period(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public.femme_require();
begin
  delete from public.femme_periods where id = p_id and user_id = uid;
end $$;

-- ---------------------------------------------------------------------------
-- Journal du jour
-- ---------------------------------------------------------------------------
create or replace function public.femme_save_day(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public.femme_require(); d date := (p ->> 'day')::date; teen boolean;
begin
  if d is null or d > current_date + 1 or d < current_date - interval '5 years' then raise exception 'PP422: date invalide'; end if;
  select age_band = '13-17' into teen from public.femme_profiles where user_id = uid;
  insert into public.femme_days (user_id, day, flow, symptoms, mood, pain, sleep, mucus, temperature, intercourse, test_result, note, updated_at)
  values (uid, d, nullif(p ->> 'flow', ''),
          coalesce((select array_agg(distinct x) from jsonb_array_elements_text(coalesce(p -> 'symptoms', '[]')) x), '{}'),
          nullif(p ->> 'mood', ''), nullif(p ->> 'pain', '')::smallint, nullif(p ->> 'sleep', '')::smallint, nullif(p ->> 'mucus', ''),
          nullif(replace(p ->> 'temperature', ',', '.'), '')::numeric,
          case when teen then null else nullif(p ->> 'intercourse', '') end,
          case when teen and p ->> 'test_result' like 'ovulation%' then null else nullif(p ->> 'test_result', '') end,
          nullif(p ->> 'note', ''), now())
  on conflict (user_id, day) do update set flow = excluded.flow, symptoms = excluded.symptoms, mood = excluded.mood, pain = excluded.pain,
    sleep = excluded.sleep, mucus = excluded.mucus, temperature = excluded.temperature, intercourse = excluded.intercourse,
    test_result = excluded.test_result, note = excluded.note, updated_at = now();
  -- Une journée entièrement vide est supprimée
  delete from public.femme_days where user_id = uid and day = d and flow is null and symptoms = '{}' and mood is null and pain is null
    and sleep is null and mucus is null and temperature is null and intercourse is null and test_result is null and note is null;
exception
  when check_violation then raise exception 'PP422: valeur invalide (douleur 0 à 10, température 34 à 43 °C, note trop longue)';
  when invalid_datetime_format or datetime_field_overflow or invalid_text_representation then raise exception 'PP422: date ou nombre invalide';
end $$;

-- ---------------------------------------------------------------------------
-- Rappels
-- ---------------------------------------------------------------------------
create or replace function public.femme_save_reminder(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := public.femme_require(); rid uuid; n int;
begin
  select count(*) into n from public.femme_reminders where user_id = uid and not done;
  if (p ->> 'id') is null and n >= 50 then raise exception 'PP429: 50 rappels actifs au maximum'; end if;
  if (p ->> 'id') is null then
    insert into public.femme_reminders (user_id, kind, label, due_at, repeat)
    values (uid, p ->> 'kind', btrim(p ->> 'label'), (p ->> 'due_at')::timestamptz, coalesce(p ->> 'repeat', 'aucune')) returning id into rid;
  else
    update public.femme_reminders set kind = p ->> 'kind', label = btrim(p ->> 'label'), due_at = (p ->> 'due_at')::timestamptz,
           repeat = coalesce(p ->> 'repeat', 'aucune'), notified_at = null, done = false
    where id = (p ->> 'id')::uuid and user_id = uid returning id into rid;
    if rid is null then raise exception 'PP404: rappel introuvable'; end if;
  end if;
  return rid;
exception
  when check_violation or not_null_violation then raise exception 'PP422: type, intitulé (2 à 80 caractères) et date du rappel à vérifier';
  when invalid_datetime_format or datetime_field_overflow or invalid_text_representation then raise exception 'PP422: date invalide';
end $$;

create or replace function public.femme_reminder_action(p_id uuid, p_action text)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public.femme_require();
begin
  if p_action = 'delete' then delete from public.femme_reminders where id = p_id and user_id = uid;
  elsif p_action = 'done' then update public.femme_reminders set done = true where id = p_id and user_id = uid;
  elsif p_action = 'undo' then update public.femme_reminders set done = false where id = p_id and user_id = uid;
  else raise exception 'PP422: action inconnue'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- Espace partenaire : désactivé par défaut, réservé aux majeures, révocable.
-- Le lien ne montre que des contenus pédagogiques choisis, jamais de données personnelles.
-- ---------------------------------------------------------------------------
create or replace function public.femme_set_partner(p_enable boolean, p_topics text[])
returns text language plpgsql security definer set search_path = public, extensions as $$
declare uid uuid := public.femme_require(); tok text;
begin
  if not coalesce(p_enable, false) then
    update public.femme_profiles set partner_token = null, partner_topics = '{}' where user_id = uid;
    perform public.femme_log(uid, 'partage_desactive');
    return null;
  end if;
  if exists (select 1 from public.femme_profiles where user_id = uid and age_band = '13-17') then
    raise exception 'PP403: le partage n''est pas proposé avant 18 ans';
  end if;
  if coalesce(array_length(p_topics, 1), 0) = 0 then raise exception 'PP422: choisissez au moins un thème à partager'; end if;
  update public.femme_profiles set partner_topics = (select array_agg(distinct t) from unnest(p_topics) t),
         partner_token = coalesce(partner_token, encode(extensions.gen_random_bytes(18), 'hex'))
  where user_id = uid returning partner_token into tok;
  perform public.femme_log(uid, 'partage_active');
  return tok;
exception
  when check_violation then raise exception 'PP422: thème inconnu';
end $$;

create or replace function public.femme_partner_view(p_token text)
returns text[] language sql stable security definer set search_path = public as $$
  select f.partner_topics from public.femme_profiles f
  where p_token ~ '^[0-9a-f]{36}$' and f.partner_token = p_token and f.age_band <> '13-17'
$$;

-- ---------------------------------------------------------------------------
-- Export et suppression
-- ---------------------------------------------------------------------------
create or replace function public.femme_export()
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := public.femme_require(); r jsonb;
begin
  select jsonb_build_object(
    'exporte_le', now(),
    'profil', (select to_jsonb(f) - 'pin_hash' - 'partner_token' - 'pin_failures' - 'pin_blocked_until' - 'unlocked_until' from public.femme_profiles f where f.user_id = uid),
    'regles', coalesce((select jsonb_agg(jsonb_build_object('debut', start_date, 'fin', end_date) order by start_date) from public.femme_periods where user_id = uid), '[]'),
    'journal', coalesce((select jsonb_agg(to_jsonb(d) - 'user_id' order by day) from public.femme_days d where user_id = uid), '[]'),
    'rappels', coalesce((select jsonb_agg(to_jsonb(x) - 'user_id' order by due_at) from public.femme_reminders x where user_id = uid), '[]'),
    'journal_des_acces', coalesce((select jsonb_agg(jsonb_build_object('action', action, 'le', at) order by at) from public.femme_access_log where user_id = uid), '[]')
  ) into r;
  perform public.femme_log(uid, 'export');
  return r;
end $$;

create or replace function public.femme_delete_all()
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'PP401: connectez-vous'; end if;
  perform public.femme_require();
  delete from public.femme_profiles where user_id = uid;   -- règles, journal et rappels supprimés en cascade
  delete from public.femme_access_log where user_id = uid;
  delete from public.notifications where user_id = uid and kind = 'femme';
end $$;

-- ---------------------------------------------------------------------------
-- Rappels envoyés par la maintenance : notification dans le compte, texte neutre
-- ---------------------------------------------------------------------------
create or replace function public.femme_next_period(p_user uuid)
returns date language sql stable security definer set search_path = public as $$
  with s as (select start_date, lag(start_date) over (order by start_date) as prev
             from public.femme_periods where user_id = p_user order by start_date desc limit 7),
       gaps as (select start_date - prev as g from s where prev is not null and start_date - prev between 15 and 60)
  select (select max(start_date) from public.femme_periods where user_id = p_user)
         + coalesce((select round(avg(g))::int from gaps), (select cycle_length from public.femme_profiles where user_id = p_user))
$$;

create or replace function public.femme_send_reminders()
returns int language plpgsql security definer set search_path = public as $$
declare n int := 0; k int; today date := (now() at time zone 'utc')::date;
begin
  -- Rappels programmés par l'utilisatrice
  with due as (
    update public.femme_reminders r set notified_at = now(),
      due_at = case r.repeat when 'quotidienne' then r.due_at + interval '1 day' when 'hebdomadaire' then r.due_at + interval '7 days'
                             when 'mensuelle' then r.due_at + interval '1 month' else r.due_at end,
      done = (r.repeat = 'aucune')
    where not r.done and r.due_at <= now() and (r.notified_at is null or r.repeat <> 'aucune')
    returning r.user_id)
  insert into public.notifications (user_id, kind, title, body, link)
  select user_id, 'femme', 'Vous avez un rappel', 'Ouvrez votre espace personnel pour le consulter.', '/femme/rappels' from due;
  get diagnostics k = row_count; n := n + k;

  -- Prochaines règles estimées (suivi du cycle uniquement)
  with p as (
    update public.femme_profiles f set last_period_reminder = today
    where f.remind_period and f.journey in ('cycle', 'conception') and f.last_period_reminder is distinct from today
      and public.femme_next_period(f.user_id) - f.remind_days_before = today
    returning f.user_id)
  insert into public.notifications (user_id, kind, title, body, link)
  select user_id, 'femme', 'Petit rappel', 'Une information vous attend dans votre espace personnel.', '/femme' from p;
  get diagnostics k = row_count; n := n + k;

  -- Rappel de saisie (une fois par semaine au plus, si rien n'a été noté depuis 7 jours)
  with l as (
    update public.femme_profiles f set last_log_reminder = today
    where f.remind_log and (f.last_log_reminder is null or f.last_log_reminder <= today - 7)
      and not exists (select 1 from public.femme_days d where d.user_id = f.user_id and d.day > today - 7)
      and f.created_at < now() - interval '3 days'
    returning f.user_id)
  insert into public.notifications (user_id, kind, title, body, link)
  select user_id, 'femme', 'Petit rappel', 'Pensez à mettre à jour votre espace personnel.', '/femme' from l;
  get diagnostics k = row_count; n := n + k;
  return n;
end $$;

create or replace function public.run_maintenance()
returns jsonb language plpgsql security definer set search_path = public as $$
declare expired int; rl int; logs int; notifs int; outbox int; issues int; reminders int; appts int; appt_rem int; svc int; femme int; ai int;
begin
  expired := public.expire_overdue_orders();
  appts := public.expire_appointments();
  appt_rem := public.send_appointment_reminders();
  svc := public.purge_services();
  femme := public.femme_send_reminders();
  ai := public.purge_assistant_usage();
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
                                      'services', svc, 'femme_reminders', femme, 'assistant_usage', ai), issues);
  delete from public.maintenance_runs where ran_at < now() - interval '30 days';
  return jsonb_build_object('expired', expired, 'appointments_expired', appts, 'appointment_reminders', appt_rem, 'femme_reminders', femme,
    'purged', jsonb_build_object('rate_limits', rl, 'search_logs', logs, 'notifications', notifs, 'outbox', outbox,
                                 'directory_reminders', reminders, 'services', svc, 'assistant_usage', ai),
    'critical_issues', issues);
end $$;
revoke execute on function public.run_maintenance() from public, anon, authenticated;
grant execute on function public.run_maintenance() to service_role;

-- Catégorie de la bibliothèque santé dédiée (gynécologie, ménopause…)
insert into public.health_categories (slug, name, description, icon, sort_order, is_priority) values
  ('sante-femme', 'Santé de la femme', 'Cycle menstruel, gynécologie, contraception, fertilité, grossesse, post-partum et ménopause.', 'flower', 15, false)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Droits
-- ---------------------------------------------------------------------------
revoke execute on function public.femme_unlocked(uuid), public.femme_require(), public.femme_log(uuid, text), public.femme_next_period(uuid),
  public.femme_send_reminders(), public.femme_status(), public.femme_partner_token(), public.femme_activate(jsonb), public.femme_update_profile(jsonb),
  public.femme_set_pin(text), public.femme_unlock(text), public.femme_lock(), public.femme_save_period(uuid, date, date), public.femme_delete_period(uuid),
  public.femme_save_day(jsonb), public.femme_save_reminder(jsonb), public.femme_reminder_action(uuid, text), public.femme_set_partner(boolean, text[]),
  public.femme_partner_view(text), public.femme_export(), public.femme_delete_all() from public, anon;
grant execute on function public.femme_unlocked(uuid) to authenticated;   -- utilisée par les politiques de lecture
grant execute on function public.femme_status(), public.femme_partner_token(), public.femme_activate(jsonb), public.femme_update_profile(jsonb),
  public.femme_set_pin(text), public.femme_unlock(text), public.femme_lock(), public.femme_save_period(uuid, date, date), public.femme_delete_period(uuid),
  public.femme_save_day(jsonb), public.femme_save_reminder(jsonb), public.femme_reminder_action(uuid, text), public.femme_set_partner(boolean, text[]),
  public.femme_export(), public.femme_delete_all() to authenticated;
grant execute on function public.femme_status(), public.femme_partner_view(text) to anon;
revoke execute on function public.femme_require(), public.femme_log(uuid, text), public.femme_next_period(uuid), public.femme_send_reminders() from authenticated;
