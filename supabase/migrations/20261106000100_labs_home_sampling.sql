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
