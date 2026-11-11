-- =============================================================================
-- SantéProxi 0.32 — Mon espace donneur (don de sang)
-- Profil donneur volontaire, dons déclarés puis validés par le CNTS (ou l'administration), calendrier indicatif,
-- carte numérique avec QR code opaque, distinctions symboliques, certificat vérifiable.
-- Principes :
--   * un don déclaré n'est compté nulle part tant qu'il n'est pas validé (statistiques, distinctions, certificat) ;
--   * l'utilisateur ne peut jamais modifier lui-même le statut d'un don ;
--   * le groupe sanguin n'est jamais public ; le QR code ne contient qu'un jeton aléatoire ;
--   * les délais entre dons sont des paramètres, affichés comme indicatifs tant que le CNTS ne les a pas confirmés.
-- Migration additive. Retour arrière : drop table public.blood_certificates, public.blood_donor_badges,
--   public.blood_badge_levels, public.blood_donations, public.blood_donor_profiles cascade ;
--   puis restaurer run_maintenance depuis 20261110000300_v028_passeport_suivi.sql.
-- =============================================================================

insert into public.platform_settings (key, value, description) values
  ('blood_interval_months_m', '3', 'Don de sang total : délai indicatif entre deux dons pour un homme (mois). À confirmer par le CNTS.'),
  ('blood_interval_months_f', '4', 'Don de sang total : délai indicatif entre deux dons pour une femme (mois). À confirmer par le CNTS.'),
  ('blood_intervals_cnts_confirmed', 'false', 'Vrai lorsque le CNTS a confirmé officiellement les délais entre dons.')
on conflict (key) do nothing;

-- Validateur des dons : administration SantéProxi ou membre actif désigné du CNTS
create or replace function public.is_blood_validator() returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (select 1 from public.authority_members where user_id = auth.uid() and active and scope = 'cnts');
$$;
grant execute on function public.is_blood_validator() to authenticated;

-- ---------------------------------------------------------------------------
-- Profil donneur
-- ---------------------------------------------------------------------------
create table if not exists public.blood_donor_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  donor_code text not null unique default ('DSP-' || upper(substr(md5(gen_random_uuid()::text), 1, 8))),
  card_token text not null unique default encode(extensions.gen_random_bytes(16), 'hex'),
  blood_group text check (blood_group in ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
  blood_group_verified boolean not null default false,
  group_verified_at timestamptz,
  sex text check (sex in ('M', 'F')),
  usual_center text check (char_length(coalesce(usual_center, '')) <= 160),
  region_id uuid references public.regions(id) on delete set null,
  status text not null default 'actif' check (status in ('actif', 'pause')),
  card_show_name boolean not null default false,
  card_show_last_donation boolean not null default false,
  reminders boolean not null default true,
  accepts_solicitations boolean not null default false,
  consent_at timestamptz not null default now(),
  reminded_for date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not blood_group_verified or blood_group is not null)
);
alter table public.blood_donor_profiles enable row level security;
drop policy if exists "pp_donor_profiles_read" on public.blood_donor_profiles;
create policy "pp_donor_profiles_read" on public.blood_donor_profiles for select to authenticated using (user_id = auth.uid() or public.is_blood_validator());
revoke all on public.blood_donor_profiles from anon, authenticated;
grant select on public.blood_donor_profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Dons : déclarés par le donneur, décidés par un validateur
-- ---------------------------------------------------------------------------
create table if not exists public.blood_donations (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('DON-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(md5(gen_random_uuid()::text), 1, 5))),
  donor_id uuid not null references public.blood_donor_profiles(user_id) on delete cascade,
  donated_on date not null check (donated_on > date '1970-01-01'),
  center text not null check (char_length(btrim(center)) between 3 and 160),
  donation_type text not null default 'sang_total' check (donation_type in ('sang_total', 'plasma', 'plaquettes')),
  campaign_id uuid references public.blood_campaigns(id) on delete set null,
  status text not null default 'en_attente' check (status in ('en_attente', 'valide', 'refuse')),
  decision_note text check (char_length(coalesce(decision_note, '')) <= 300),
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (donor_id, donated_on, donation_type)
);
create index if not exists blood_donations_status on public.blood_donations (status, created_at);
create index if not exists blood_donations_donor on public.blood_donations (donor_id, donated_on desc);
alter table public.blood_donations enable row level security;
drop policy if exists "pp_blood_donations_read" on public.blood_donations;
create policy "pp_blood_donations_read" on public.blood_donations for select to authenticated using (donor_id = auth.uid() or public.is_blood_validator());
revoke all on public.blood_donations from anon, authenticated;
grant select on public.blood_donations to authenticated;

-- ---------------------------------------------------------------------------
-- Distinctions : paliers configurables, calculés à partir des seuls dons validés
-- ---------------------------------------------------------------------------
create table if not exists public.blood_badge_levels (
  code text primary key check (code ~ '^[a-z_]{3,40}$'),
  label text not null check (char_length(btrim(label)) between 3 and 60),
  threshold int not null unique check (threshold between 1 and 500),
  updated_at timestamptz not null default now()
);
insert into public.blood_badge_levels (code, label, threshold) values
  ('premier_geste', 'Premier geste', 1), ('donneur_fidele', 'Donneur fidèle', 3), ('donneur_solidaire', 'Donneur solidaire', 5),
  ('donneur_engage', 'Donneur engagé', 7), ('ambassadeur', 'Ambassadeur du don de sang', 10), ('heros_solidarite', 'Héros de la solidarité', 15)
on conflict (code) do nothing;
alter table public.blood_badge_levels enable row level security;
drop policy if exists "pp_badge_levels_read" on public.blood_badge_levels;
create policy "pp_badge_levels_read" on public.blood_badge_levels for select to anon, authenticated using (true);
revoke insert, update, delete on public.blood_badge_levels from anon, authenticated;
grant select on public.blood_badge_levels to anon, authenticated;

create table if not exists public.blood_donor_badges (
  user_id uuid not null references public.blood_donor_profiles(user_id) on delete cascade,
  code text not null references public.blood_badge_levels(code) on delete cascade,
  awarded_at timestamptz not null default now(),
  primary key (user_id, code)
);
alter table public.blood_donor_badges enable row level security;
drop policy if exists "pp_donor_badges_own" on public.blood_donor_badges;
create policy "pp_donor_badges_own" on public.blood_donor_badges for select to authenticated using (user_id = auth.uid() or public.is_blood_validator());
revoke all on public.blood_donor_badges from anon, authenticated;
grant select on public.blood_donor_badges to authenticated;

create or replace function public.blood_validated_count(p_user uuid) returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from public.blood_donations where donor_id = p_user and status = 'valide';
$$;
revoke execute on function public.blood_validated_count(uuid) from public, anon, authenticated;

create or replace function public.blood_badge_for(p_count int) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'current', (select jsonb_build_object('code', code, 'label', label, 'threshold', threshold) from public.blood_badge_levels where threshold <= p_count order by threshold desc limit 1),
    'next', (select jsonb_build_object('code', code, 'label', label, 'threshold', threshold) from public.blood_badge_levels where threshold > p_count order by threshold limit 1));
$$;
grant execute on function public.blood_badge_for(int) to authenticated;

-- Attribue les distinctions atteintes (notification une seule fois par palier)
create or replace function public.blood_award_badges(p_user uuid) returns void language plpgsql security definer set search_path = public as $$
declare n int := public.blood_validated_count(p_user); b record;
begin
  for b in select l.code, l.label from public.blood_badge_levels l
           where l.threshold <= n and not exists (select 1 from public.blood_donor_badges x where x.user_id = p_user and x.code = l.code) order by l.threshold loop
    insert into public.blood_donor_badges (user_id, code) values (p_user, b.code) on conflict do nothing;
    insert into public.notifications (user_id, kind, title, body, link)
    values (p_user, 'don_sang', 'Nouvelle distinction : ' || b.label, 'Merci : vos dons validés vous valent la distinction « ' || b.label || ' ». C''est une reconnaissance symbolique, sans aucune valeur marchande.', '/don-de-sang/mon-espace#distinctions');
  end loop;
end $$;
revoke execute on function public.blood_award_badges(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Actions du donneur
-- ---------------------------------------------------------------------------
create or replace function public.donor_save_profile(p jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_auth(); cur public.blood_donor_profiles; g text := nullif(p ->> 'blood_group', '');
begin
  select * into cur from public.blood_donor_profiles where user_id = uid for update;
  if cur.user_id is null and p ->> 'consent' is distinct from 'true' then
    raise exception 'PP422: votre accord est nécessaire pour créer votre espace donneur';
  end if;
  if g is not null and g not in ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-') then raise exception 'PP422: groupe sanguin invalide'; end if;
  if cur.user_id is null then
    insert into public.blood_donor_profiles (user_id, blood_group, sex, usual_center, region_id, card_show_name, card_show_last_donation, reminders, accepts_solicitations)
    values (uid, g, nullif(p ->> 'sex', ''), nullif(btrim(coalesce(p ->> 'usual_center', '')), ''), nullif(p ->> 'region_id', '')::uuid,
      coalesce((p ->> 'card_show_name')::boolean, false), coalesce((p ->> 'card_show_last_donation')::boolean, false),
      coalesce((p ->> 'reminders')::boolean, true), coalesce((p ->> 'accepts_solicitations')::boolean, false))
    returning * into cur;
    perform public.log_audit('donor.create', 'blood_donor', uid::text);
  else
    update public.blood_donor_profiles set
      blood_group = g,
      -- un groupe modifié par le donneur n'est plus considéré comme vérifié
      blood_group_verified = case when g is not distinct from cur.blood_group then cur.blood_group_verified else false end,
      group_verified_at = case when g is not distinct from cur.blood_group then cur.group_verified_at else null end,
      sex = nullif(p ->> 'sex', ''), usual_center = nullif(btrim(coalesce(p ->> 'usual_center', '')), ''), region_id = nullif(p ->> 'region_id', '')::uuid,
      status = coalesce(nullif(p ->> 'status', ''), cur.status),
      card_show_name = coalesce((p ->> 'card_show_name')::boolean, false), card_show_last_donation = coalesce((p ->> 'card_show_last_donation')::boolean, false),
      reminders = coalesce((p ->> 'reminders')::boolean, true), accepts_solicitations = coalesce((p ->> 'accepts_solicitations')::boolean, false),
      updated_at = now()
    where user_id = uid returning * into cur;
  end if;
  return cur.donor_code;
exception when check_violation then raise exception 'PP422: vérifiez les informations saisies';
end $$;
revoke execute on function public.donor_save_profile(jsonb) from public, anon;
grant execute on function public.donor_save_profile(jsonb) to authenticated;

-- Retrait du consentement : suppression complète de l'espace donneur (dons, distinctions, certificats)
create or replace function public.donor_delete_space() returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_auth();
begin
  delete from public.blood_donor_profiles where user_id = uid;
  if found then perform public.log_audit('donor.delete', 'blood_donor', uid::text); end if;
end $$;
revoke execute on function public.donor_delete_space() from public, anon;
grant execute on function public.donor_delete_space() to authenticated;

-- Nouveau QR code (l'ancien cesse de fonctionner)
create or replace function public.donor_renew_card_token() returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  update public.blood_donor_profiles set card_token = encode(gen_random_bytes(16), 'hex'), updated_at = now() where user_id = auth.uid();
  if not found then raise exception 'PP404: aucun espace donneur'; end if;
end $$;
revoke execute on function public.donor_renew_card_token() from public, anon;
grant execute on function public.donor_renew_card_token() to authenticated;

create or replace function public.donor_declare_donation(p jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_auth(); d date := nullif(p ->> 'donated_on', '')::date; r public.blood_donations; camp uuid := nullif(p ->> 'campaign_id', '')::uuid;
begin
  if not exists (select 1 from public.blood_donor_profiles where user_id = uid) then raise exception 'PP404: créez d''abord votre espace donneur'; end if;
  if d is null or d > current_date or d < current_date - interval '10 years' then raise exception 'PP422: date du don invalide (au plus tard aujourd''hui, au plus tôt il y a 10 ans)'; end if;
  if (select count(*) from public.blood_donations where donor_id = uid and status = 'en_attente') >= 10 then
    raise exception 'PP429: 10 dons sont déjà en attente de validation : attendez leur vérification';
  end if;
  if camp is not null and not exists (select 1 from public.blood_campaigns where id = camp and published) then camp := null; end if;
  insert into public.blood_donations (donor_id, donated_on, center, donation_type, campaign_id)
  values (uid, d, btrim(coalesce(p ->> 'center', '')), coalesce(nullif(p ->> 'donation_type', ''), 'sang_total'), camp)
  returning * into r;
  return r.reference;
exception
  when unique_violation then raise exception 'PP409: ce don est déjà enregistré à cette date';
  when check_violation then raise exception 'PP422: indiquez le centre de collecte et le type de don';
end $$;
revoke execute on function public.donor_declare_donation(jsonb) from public, anon;
grant execute on function public.donor_declare_donation(jsonb) to authenticated;

create or replace function public.donor_cancel_donation(p_id uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.blood_donations where id = p_id and donor_id = auth.uid() and status = 'en_attente';
  if not found then raise exception 'PP409: seul un don en attente de validation peut être retiré'; end if;
end $$;
revoke execute on function public.donor_cancel_donation(uuid) from public, anon;
grant execute on function public.donor_cancel_donation(uuid) to authenticated;

-- Résumé de l'espace donneur (pour la page « Mon espace donneur »)
create or replace function public.donor_summary() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid(); pr public.blood_donor_profiles; n int; last_v date; last_any date; months int; next_d date;
begin
  select * into pr from public.blood_donor_profiles where user_id = uid;
  if pr.user_id is null then return jsonb_build_object('exists', false); end if;
  n := public.blood_validated_count(uid);
  select max(donated_on) into last_v from public.blood_donations where donor_id = uid and status = 'valide';
  select max(donated_on) into last_any from public.blood_donations where donor_id = uid and status <> 'refuse';
  months := case when pr.sex = 'M' then public.setting_int('blood_interval_months_m', 3) else public.setting_int('blood_interval_months_f', 4) end;
  next_d := case when last_any is not null then (last_any + make_interval(months => months))::date end;
  return jsonb_build_object('exists', true, 'donor_code', pr.donor_code, 'validated_count', n,
    'pending_count', (select count(*) from public.blood_donations where donor_id = uid and status = 'en_attente'),
    'last_validated', last_v, 'last_declared', last_any, 'next_indicative', next_d, 'interval_months', months,
    'interval_sex_known', pr.sex is not null, 'intervals_confirmed', public.setting_bool('blood_intervals_cnts_confirmed', false),
    'badge', public.blood_badge_for(n));
end $$;
revoke execute on function public.donor_summary() from public, anon;
grant execute on function public.donor_summary() to authenticated;

-- ---------------------------------------------------------------------------
-- Validation par le CNTS ou l'administration
-- ---------------------------------------------------------------------------
create or replace function public.blood_pending_donations()
returns table (id uuid, reference text, donor_code text, donor_name text, declared_group text, group_verified boolean, donated_on date,
  center text, donation_type text, campaign text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_blood_validator() then raise exception 'PP403: réservé au CNTS et à l''administration' using errcode = '42501'; end if;
  return query select d.id, d.reference, p.donor_code, pf.full_name, p.blood_group, p.blood_group_verified, d.donated_on, d.center, d.donation_type, c.title, d.created_at
    from public.blood_donations d join public.blood_donor_profiles p on p.user_id = d.donor_id join public.profiles pf on pf.id = d.donor_id
    left join public.blood_campaigns c on c.id = d.campaign_id
   where d.status = 'en_attente' order by d.created_at limit 200;
end $$;
revoke execute on function public.blood_pending_donations() from public, anon;
grant execute on function public.blood_pending_donations() to authenticated;

create or replace function public.blood_decide_donation(p_id uuid, p_decision text, p_note text default null, p_confirm_group text default null)
returns void language plpgsql security definer set search_path = public as $$
declare d public.blood_donations; uid uuid := auth.uid();
begin
  if not public.is_blood_validator() then raise exception 'PP403: réservé au CNTS et à l''administration' using errcode = '42501'; end if;
  if p_decision not in ('valide', 'refuse') then raise exception 'PP422: décision invalide'; end if;
  if p_decision = 'refuse' and char_length(btrim(coalesce(p_note, ''))) < 5 then raise exception 'PP422: indiquez le motif du refus'; end if;
  select * into d from public.blood_donations where id = p_id for update;
  if d.id is null then raise exception 'PP404: don introuvable'; end if;
  if d.donor_id = uid then raise exception 'PP403: vous ne pouvez pas valider votre propre don'; end if;
  if d.status <> 'en_attente' and not public.is_admin() then raise exception 'PP409: ce don a déjà été traité'; end if;
  update public.blood_donations set status = p_decision, decision_note = nullif(btrim(coalesce(p_note, '')), ''), decided_by = uid, decided_at = now() where id = p_id;
  -- Groupe sanguin confirmé par le centre (seulement lors d'une validation)
  if p_decision = 'valide' and p_confirm_group in ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-') then
    update public.blood_donor_profiles set blood_group = p_confirm_group, blood_group_verified = true, group_verified_at = now(), updated_at = now() where user_id = d.donor_id;
  end if;
  perform public.log_audit('blood_donation.' || p_decision, 'blood_donation', p_id::text, jsonb_build_object('reference', d.reference, 'group_confirmed', p_confirm_group is not null));
  insert into public.notifications (user_id, kind, title, body, link)
  values (d.donor_id, 'don_sang', case when p_decision = 'valide' then 'Votre don a été validé' else 'Votre don n''a pas été validé' end,
    d.reference || ' du ' || to_char(d.donated_on, 'DD/MM/YYYY') || coalesce(' — ' || nullif(btrim(coalesce(p_note, '')), ''), ''), '/don-de-sang/mon-espace#historique');
  if p_decision = 'valide' then perform public.blood_award_badges(d.donor_id); end if;
end $$;
revoke execute on function public.blood_decide_donation(uuid, text, text, text) from public, anon;
grant execute on function public.blood_decide_donation(uuid, text, text, text) to authenticated;

create or replace function public.admin_set_badge_threshold(p_code text, p_threshold int) returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  update public.blood_badge_levels set threshold = p_threshold, updated_at = now() where code = p_code;
  if not found then raise exception 'PP404: distinction inconnue'; end if;
  perform public.log_audit('blood_badge.threshold', 'blood_badge', p_code, jsonb_build_object('threshold', p_threshold));
exception
  when unique_violation then raise exception 'PP409: un autre palier utilise déjà ce nombre de dons';
  when check_violation then raise exception 'PP422: seuil entre 1 et 500';
end $$;
revoke execute on function public.admin_set_badge_threshold(text, int) from public, anon;
grant execute on function public.admin_set_badge_threshold(text, int) to authenticated;

-- ---------------------------------------------------------------------------
-- Carte numérique : le QR code ne contient qu'un jeton ; lecture réservée aux personnes connectées
-- ---------------------------------------------------------------------------
create or replace function public.donor_card_lookup(p_token text) returns jsonb language plpgsql security definer set search_path = public as $$
declare pr public.blood_donor_profiles; viewer uuid := auth.uid(); full_access boolean; n int; nm text;
begin
  if viewer is null then return jsonb_build_object('status', 'connexion'); end if;
  if p_token is null or p_token !~ '^[0-9a-f]{32}$' then return jsonb_build_object('status', 'invalide'); end if;
  select * into pr from public.blood_donor_profiles where card_token = p_token;
  if pr.user_id is null then return jsonb_build_object('status', 'invalide'); end if;
  full_access := pr.user_id = viewer or public.is_blood_validator();
  n := public.blood_validated_count(pr.user_id);
  select full_name into nm from public.profiles where id = pr.user_id;
  if pr.user_id <> viewer then perform public.log_audit('donor.card_viewed', 'blood_donor', pr.user_id::text, jsonb_build_object('full', full_access)); end if;
  return jsonb_build_object('status', 'ok', 'full_access', full_access, 'donor_code', pr.donor_code, 'validated_count', n,
    'badge', public.blood_badge_for(n) -> 'current', 'member_since', pr.created_at,
    'name', case when full_access or pr.card_show_name then nm end,
    'blood_group', case when full_access and pr.blood_group_verified then pr.blood_group end,
    'group_verified', full_access and pr.blood_group_verified,
    'last_donation', case when full_access or pr.card_show_last_donation then (select max(donated_on) from public.blood_donations where donor_id = pr.user_id and status = 'valide') end);
end $$;
revoke execute on function public.donor_card_lookup(text) from public, anon;
grant execute on function public.donor_card_lookup(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Certificat de reconnaissance, vérifiable publiquement par sa référence
-- ---------------------------------------------------------------------------
create table if not exists public.blood_certificates (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('CDS-' || upper(substr(md5(gen_random_uuid()::text), 1, 10))),
  user_id uuid not null references public.blood_donor_profiles(user_id) on delete cascade,
  validated_count int not null check (validated_count >= 1),
  period_from date not null,
  period_to date not null,
  holder_name text check (char_length(coalesce(holder_name, '')) <= 160),
  issued_at timestamptz not null default now()
);
alter table public.blood_certificates enable row level security;
drop policy if exists "pp_blood_certificates_own" on public.blood_certificates;
create policy "pp_blood_certificates_own" on public.blood_certificates for select to authenticated using (user_id = auth.uid());
revoke all on public.blood_certificates from anon, authenticated;
grant select on public.blood_certificates to authenticated;

create or replace function public.donor_issue_certificate(p_show_name boolean) returns text language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_auth(); n int; f date; t date; r text;
begin
  if not exists (select 1 from public.blood_donor_profiles where user_id = uid) then raise exception 'PP404: aucun espace donneur'; end if;
  select count(*)::int, min(donated_on), max(donated_on) into n, f, t from public.blood_donations where donor_id = uid and status = 'valide';
  if n = 0 then raise exception 'PP409: le certificat est disponible après la validation d''au moins un don'; end if;
  if (select count(*) from public.blood_certificates where user_id = uid and issued_at > now() - interval '1 day') >= 3 then raise exception 'PP429: 3 certificats par jour au plus'; end if;
  insert into public.blood_certificates (user_id, validated_count, period_from, period_to, holder_name)
  values (uid, n, f, t, case when p_show_name then (select full_name from public.profiles where id = uid) end)
  returning reference into r;
  return r;
end $$;
revoke execute on function public.donor_issue_certificate(boolean) from public, anon;
grant execute on function public.donor_issue_certificate(boolean) to authenticated;

create or replace function public.verify_blood_certificate(p_ref text) returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((select jsonb_build_object('status', 'ok', 'reference', reference, 'validated_count', validated_count, 'period_from', period_from,
      'period_to', period_to, 'holder_name', holder_name, 'issued_at', issued_at)
    from public.blood_certificates where reference = upper(btrim(p_ref))), jsonb_build_object('status', 'introuvable'));
$$;
grant execute on function public.verify_blood_certificate(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Rappel personnel : date indicative atteinte (une fois par don), si le donneur l'a demandé
-- ---------------------------------------------------------------------------
create or replace function public.blood_donor_reminders() returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  with due as (
    select p.user_id, x.last_d from public.blood_donor_profiles p
      cross join lateral (select max(donated_on) last_d from public.blood_donations d where d.donor_id = p.user_id and d.status <> 'refuse') x
     where p.reminders and p.status = 'actif' and x.last_d is not null and p.reminded_for is distinct from x.last_d
       and (x.last_d + make_interval(months => case when p.sex = 'M' then public.setting_int('blood_interval_months_m', 3) else public.setting_int('blood_interval_months_f', 4) end))::date <= current_date),
  upd as (update public.blood_donor_profiles p set reminded_for = due.last_d from due where p.user_id = due.user_id returning p.user_id)
  insert into public.notifications (user_id, kind, title, body, link)
  select user_id, 'don_sang', 'Date indicative de prochain don atteinte',
    'Date indicative de prochain don. Votre aptitude au don doit être confirmée par un professionnel de santé.', '/don-de-sang/mon-espace#calendrier' from upd;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.blood_donor_reminders() from public, anon, authenticated;

create or replace function public.run_maintenance()
returns jsonb language plpgsql security definer set search_path = public as $$
declare expired int; rl int; logs int; notifs int; outbox int; issues int; reminders int; appts int; appt_rem int; svc int; femme int; ai int; tools int; rec int; chronic int; donors int;
begin
  expired := public.expire_overdue_orders();
  appts := public.expire_appointments();
  appt_rem := public.send_appointment_reminders();
  svc := public.purge_services();
  femme := public.femme_send_reminders();
  ai := public.purge_assistant_usage();
  tools := public.health_tools_reminders();
  rec := public.record_reminders();
  chronic := public.chronic_reminders();
  donors := public.blood_donor_reminders();
  delete from public.rate_limit_events where at < now() - interval '1 day';
  get diagnostics rl = row_count;
  delete from public.search_logs where created_at < now() - interval '400 days';
  get diagnostics logs = row_count;
  delete from public.notifications where read_at is not null and read_at < now() - interval '180 days';
  get diagnostics notifs = row_count;
  delete from public.notification_outbox where status in ('sent', 'skipped') and created_at < now() - interval '90 days';
  get diagnostics outbox = row_count;
  delete from public.record_access_log where created_at < now() - interval '2 years';
  reminders := public.directory_reminders();
  select count(*) into issues from public.integrity_issues() where severity = 'critique';
  insert into public.maintenance_runs (expired, purged, critical_issues)
  values (expired, jsonb_build_object('rate_limits', rl, 'search_logs', logs, 'notifications', notifs, 'outbox', outbox,
                                      'directory_reminders', reminders, 'appointments_expired', appts, 'appointment_reminders', appt_rem,
                                      'services', svc, 'femme_reminders', femme, 'assistant_usage', ai, 'health_tools', tools, 'health_record', rec, 'chronic', chronic,
                                      'blood_donors', donors), issues);
  delete from public.maintenance_runs where ran_at < now() - interval '30 days';
  return jsonb_build_object('expired', expired, 'appointments_expired', appts, 'appointment_reminders', appt_rem, 'femme_reminders', femme,
    'health_tools', tools, 'health_record', rec, 'chronic', chronic, 'blood_donors', donors,
    'purged', jsonb_build_object('rate_limits', rl, 'search_logs', logs, 'notifications', notifs, 'outbox', outbox,
                                 'directory_reminders', reminders, 'services', svc, 'assistant_usage', ai),
    'critical_issues', issues);
end $$;
revoke execute on function public.run_maintenance() from public, anon, authenticated;

-- Démonstration : espace donneur fictif du patient de démonstration (refusé hors environnement de démonstration)
create or replace function public.demo_donor_install(p_user uuid, p_validator uuid)
returns int language plpgsql security definer set search_path = public as $$
begin
  perform public.demo_guard();
  insert into public.blood_donor_profiles (user_id, blood_group, blood_group_verified, group_verified_at, sex, usual_center, card_show_name, reminders)
  values (p_user, 'O+', true, now(), 'M', 'CNTS Quinzambougou (exemple)', true, true) on conflict (user_id) do nothing;
  insert into public.blood_donations (donor_id, donated_on, center, donation_type, status, decided_by, decided_at) values
    (p_user, current_date - 400, 'CNTS Quinzambougou (exemple)', 'sang_total', 'valide', p_validator, now()),
    (p_user, current_date - 280, 'CHU Gabriel Touré (exemple)', 'sang_total', 'valide', p_validator, now()),
    (p_user, current_date - 150, 'CNTS Quinzambougou (exemple)', 'sang_total', 'valide', p_validator, now()),
    (p_user, current_date - 20, 'Collecte fictive de démonstration', 'sang_total', 'en_attente', null, null)
  on conflict do nothing;
  perform public.blood_award_badges(p_user);
  return public.blood_validated_count(p_user);
end $$;
revoke execute on function public.demo_donor_install(uuid, uuid) from public, anon, authenticated;
grant execute on function public.demo_donor_install(uuid, uuid) to service_role;
