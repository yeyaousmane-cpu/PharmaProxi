-- SantéProxi — complément 0.34 pour le projet de démonstration (après le complément 0.33).
-- =============================================================================
-- SantéProxi 0.34 — SantéProxi Solidaire : parcours du donneur
-- 1. Délais indicatifs par type de don (OMS 2012 : plasma 2 semaines, plaquettes 4 semaines), en paramètres.
-- 2. Questionnaire « Suis-je apte ? » : la validation par le CNTS est enregistrée (version, personne, organisme).
--    Les réponses ne sont jamais enregistrées : le calcul se fait sur le téléphone.
-- 3. Suivi après le don : déclaration privée d'un effet indésirable, lisible par le donneur et le CNTS seulement ;
--    rappel de suivi après le don, désactivé tant qu'un professionnel n'a pas validé le délai.
-- 4. Registre volontaire des groupes sanguins rares : inscription avec accord, validation par un centre habilité,
--    qualification « rare » saisie par le validateur (jamais automatique), recherche réservée au CNTS, journalisée.
-- 5. Mon passeport solidaire : version publique limitée, désactivée par défaut, par lien à jeton aléatoire.
-- Migration additive. Retour arrière : drop des tables blood_donation_events, blood_rare_registry ;
--   colonnes passport_token, passport_public ; restaurer donor_summary, blood_donor_reminders depuis 0.32.
-- =============================================================================

insert into public.platform_settings (key, value, description) values
  ('blood_interval_weeks_plasma', '2', 'Don de plasma : délai indicatif avant le don suivant (semaines). OMS 2012 ; à confirmer par le CNTS.'),
  ('blood_interval_weeks_platelets', '4', 'Don de plaquettes : délai indicatif avant le don suivant (semaines). OMS 2012 ; à confirmer par le CNTS.'),
  ('blood_questionnaire_validation', 'null', 'Validation du questionnaire « Suis-je apte ? » par le CNTS : {version, validateur, organisme, date}.'),
  ('blood_followup_enabled', 'false', 'Notification de suivi après un don : à activer seulement après validation médicale du délai.'),
  ('blood_followup_days', '2', 'Notification de suivi : nombre de jours après le don (validé médicalement).')
on conflict (key) do nothing;

-- Date indicative selon le type du dernier don
create or replace function public.blood_next_indicative(p_last date, p_type text, p_sex text) returns date language sql stable security definer set search_path = public as $$
  select case
    when p_last is null then null
    when p_type = 'plasma' then p_last + 7 * public.setting_int('blood_interval_weeks_plasma', 2)
    when p_type = 'plaquettes' then p_last + 7 * public.setting_int('blood_interval_weeks_platelets', 4)
    else (p_last + make_interval(months => case when p_sex = 'M' then public.setting_int('blood_interval_months_m', 3) else public.setting_int('blood_interval_months_f', 4) end))::date end;
$$;
grant execute on function public.blood_next_indicative(date, text, text) to authenticated;

create or replace function public.donor_summary() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid(); pr public.blood_donor_profiles; n int; last_v date; last_any date; last_type text; months int; next_d date;
begin
  select * into pr from public.blood_donor_profiles where user_id = uid;
  if pr.user_id is null then return jsonb_build_object('exists', false); end if;
  n := public.blood_validated_count(uid);
  select max(donated_on) into last_v from public.blood_donations where donor_id = uid and status = 'valide';
  select donated_on, donation_type into last_any, last_type from public.blood_donations where donor_id = uid and status <> 'refuse' order by donated_on desc, created_at desc limit 1;
  months := case when pr.sex = 'M' then public.setting_int('blood_interval_months_m', 3) else public.setting_int('blood_interval_months_f', 4) end;
  next_d := public.blood_next_indicative(last_any, last_type, pr.sex);
  return jsonb_build_object('exists', true, 'donor_code', pr.donor_code, 'validated_count', n,
    'pending_count', (select count(*) from public.blood_donations where donor_id = uid and status = 'en_attente'),
    'last_validated', last_v, 'last_declared', last_any, 'last_type', last_type, 'next_indicative', next_d, 'interval_months', months,
    'interval_sex_known', pr.sex is not null, 'intervals_confirmed', public.setting_bool('blood_intervals_cnts_confirmed', false),
    'badge', public.blood_badge_for(n));
end $$;

-- Validation du questionnaire (administration, au nom du CNTS)
create or replace function public.admin_validate_blood_questionnaire(p_version text, p_validator text, p_org text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  if p_version is null or char_length(btrim(p_version)) < 3 then raise exception 'PP422: version invalide'; end if;
  if char_length(btrim(coalesce(p_validator, ''))) < 3 or char_length(btrim(coalesce(p_org, ''))) < 2 then
    raise exception 'PP422: indiquez le nom de la personne qui a validé et son organisme';
  end if;
  update public.platform_settings set value = jsonb_build_object('version', btrim(p_version), 'validateur', btrim(p_validator), 'organisme', btrim(p_org), 'date', current_date),
    updated_at = now() where key = 'blood_questionnaire_validation';
  perform public.log_audit('blood_questionnaire.validate', 'setting', 'blood_questionnaire_validation', jsonb_build_object('version', p_version, 'organisme', p_org));
end $$;
revoke execute on function public.admin_validate_blood_questionnaire(text, text, text) from public, anon;
grant execute on function public.admin_validate_blood_questionnaire(text, text, text) to authenticated;

create or replace function public.admin_revoke_blood_questionnaire() returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  update public.platform_settings set value = 'null'::jsonb, updated_at = now() where key = 'blood_questionnaire_validation';
  perform public.log_audit('blood_questionnaire.revoke', 'setting', 'blood_questionnaire_validation');
end $$;
revoke execute on function public.admin_revoke_blood_questionnaire() from public, anon;
grant execute on function public.admin_revoke_blood_questionnaire() to authenticated;

-- ---------------------------------------------------------------------------
-- Suivi après le don : déclarations privées
-- ---------------------------------------------------------------------------
create table if not exists public.blood_donation_events (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('EVD-' || upper(substr(md5(gen_random_uuid()::text), 1, 8))),
  donor_id uuid not null references public.blood_donor_profiles(user_id) on delete cascade,
  donation_id uuid references public.blood_donations(id) on delete set null,
  kind text not null check (kind in ('malaise', 'vertiges', 'fatigue', 'point_prelevement', 'autre')),
  occurred_on date not null,
  description text check (char_length(coalesce(description, '')) <= 1000),
  contact_ok boolean not null default false,
  status text not null default 'nouveau' check (status in ('nouveau', 'pris_en_compte', 'clos')),
  handled_by uuid references public.profiles(id) on delete set null,
  handler_note text check (char_length(coalesce(handler_note, '')) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists blood_donation_events_status on public.blood_donation_events (status, created_at);
alter table public.blood_donation_events enable row level security;
drop policy if exists "pp_blood_events_read" on public.blood_donation_events;
create policy "pp_blood_events_read" on public.blood_donation_events for select to authenticated using (donor_id = auth.uid() or public.is_blood_validator());
revoke all on public.blood_donation_events from anon, authenticated;
grant select on public.blood_donation_events to authenticated;

create or replace function public.donor_report_event(p jsonb) returns text language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_auth(); r public.blood_donation_events; d date := nullif(p ->> 'occurred_on', '')::date; don uuid := nullif(p ->> 'donation_id', '')::uuid;
begin
  if not exists (select 1 from public.blood_donor_profiles where user_id = uid) then raise exception 'PP404: créez d''abord votre espace donneur'; end if;
  if d is null or d > current_date or d < current_date - 90 then raise exception 'PP422: date invalide (dans les 90 derniers jours)'; end if;
  if don is not null and not exists (select 1 from public.blood_donations where id = don and donor_id = uid) then don := null; end if;
  if (select count(*) from public.blood_donation_events where donor_id = uid and created_at > now() - interval '1 day') >= 5 then raise exception 'PP429: trop de déclarations aujourd''hui'; end if;
  insert into public.blood_donation_events (donor_id, donation_id, kind, occurred_on, description, contact_ok)
  values (uid, don, p ->> 'kind', d, nullif(btrim(coalesce(p ->> 'description', '')), ''), coalesce((p ->> 'contact_ok')::boolean, false))
  returning * into r;
  -- Les validateurs du CNTS sont prévenus (sans détail de santé dans la notification)
  insert into public.notifications (user_id, kind, title, body, link)
  select am.user_id, 'don_sang', 'Nouvelle déclaration après un don', r.reference, '/don-de-sang/validation#declarations'
    from public.authority_members am where am.active and am.scope = 'cnts';
  return r.reference;
exception when check_violation then raise exception 'PP422: choisissez ce qui s''est passé';
end $$;
revoke execute on function public.donor_report_event(jsonb) from public, anon;
grant execute on function public.donor_report_event(jsonb) to authenticated;

create or replace function public.blood_event_set_status(p_id uuid, p_status text, p_note text default null) returns void language plpgsql security definer set search_path = public as $$
declare e public.blood_donation_events;
begin
  if not public.is_blood_validator() then raise exception 'PP403: réservé au CNTS et à l''administration' using errcode = '42501'; end if;
  if p_status not in ('pris_en_compte', 'clos') then raise exception 'PP422: statut invalide'; end if;
  update public.blood_donation_events set status = p_status, handled_by = auth.uid(), handler_note = coalesce(nullif(btrim(coalesce(p_note, '')), ''), handler_note), updated_at = now()
   where id = p_id returning * into e;
  if e.id is null then raise exception 'PP404: déclaration introuvable'; end if;
  perform public.log_audit('blood_event.' || p_status, 'blood_event', p_id::text);
  insert into public.notifications (user_id, kind, title, body, link)
  values (e.donor_id, 'don_sang', 'Votre déclaration a été prise en compte', e.reference || coalesce(' — ' || nullif(btrim(coalesce(p_note, '')), ''), ''), '/don-de-sang/apres-le-don');
end $$;
revoke execute on function public.blood_event_set_status(uuid, text, text) from public, anon;
grant execute on function public.blood_event_set_status(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Registre des groupes sanguins rares (volontaire)
-- ---------------------------------------------------------------------------
create table if not exists public.blood_rare_registry (
  user_id uuid primary key references public.blood_donor_profiles(user_id) on delete cascade,
  phenotype_note text check (char_length(coalesce(phenotype_note, '')) <= 300),
  consent_at timestamptz not null default now(),
  availability text not null default 'disponible' check (availability in ('disponible', 'indisponible')),
  status text not null default 'en_attente' check (status in ('en_attente', 'verifie', 'refuse')),
  rare_criteria text check (char_length(coalesce(rare_criteria, '')) <= 300),
  verified_center text check (char_length(coalesce(verified_center, '')) <= 160),
  verified_by uuid references public.profiles(id) on delete set null,
  verified_at date,
  decision_note text check (char_length(coalesce(decision_note, '')) <= 300),
  updated_at timestamptz not null default now(),
  check (status <> 'verifie' or (rare_criteria is not null and verified_center is not null and verified_at is not null))
);
alter table public.blood_rare_registry enable row level security;
drop policy if exists "pp_rare_registry_read" on public.blood_rare_registry;
create policy "pp_rare_registry_read" on public.blood_rare_registry for select to authenticated using (user_id = auth.uid() or public.is_blood_validator());
revoke all on public.blood_rare_registry from anon, authenticated;
grant select on public.blood_rare_registry to authenticated;

create or replace function public.rare_register(p_note text, p_consent boolean) returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_auth();
begin
  if not exists (select 1 from public.blood_donor_profiles where user_id = uid) then raise exception 'PP404: créez d''abord votre espace donneur'; end if;
  if not coalesce(p_consent, false) then raise exception 'PP422: votre accord est nécessaire pour rejoindre le registre'; end if;
  insert into public.blood_rare_registry (user_id, phenotype_note) values (uid, nullif(btrim(coalesce(p_note, '')), ''))
  on conflict (user_id) do update set phenotype_note = excluded.phenotype_note, consent_at = now(), updated_at = now(),
    status = case when public.blood_rare_registry.status = 'refuse' then 'en_attente' else public.blood_rare_registry.status end;
  perform public.log_audit('rare_registry.join', 'blood_donor', uid::text);
end $$;
revoke execute on function public.rare_register(text, boolean) from public, anon;
grant execute on function public.rare_register(text, boolean) to authenticated;

create or replace function public.rare_set_availability(p_available boolean) returns void language plpgsql security definer set search_path = public as $$
begin
  update public.blood_rare_registry set availability = case when p_available then 'disponible' else 'indisponible' end, updated_at = now() where user_id = auth.uid();
  if not found then raise exception 'PP404: vous n''êtes pas inscrit au registre'; end if;
end $$;
revoke execute on function public.rare_set_availability(boolean) from public, anon;
grant execute on function public.rare_set_availability(boolean) to authenticated;

create or replace function public.rare_withdraw() returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.blood_rare_registry where user_id = auth.uid();
  if found then perform public.log_audit('rare_registry.withdraw', 'blood_donor', auth.uid()::text); end if;
end $$;
revoke execute on function public.rare_withdraw() from public, anon;
grant execute on function public.rare_withdraw() to authenticated;

create or replace function public.rare_review(p_user uuid, p_decision text, p_center text, p_criteria text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_blood_validator() then raise exception 'PP403: réservé au CNTS et à l''administration' using errcode = '42501'; end if;
  if p_decision not in ('verifie', 'refuse') then raise exception 'PP422: décision invalide'; end if;
  if p_decision = 'verifie' and (char_length(btrim(coalesce(p_center, ''))) < 3 or char_length(btrim(coalesce(p_criteria, ''))) < 3) then
    raise exception 'PP422: indiquez le centre qui a vérifié et le critère retenu par les spécialistes';
  end if;
  if p_user = auth.uid() then raise exception 'PP403: vous ne pouvez pas valider votre propre inscription'; end if;
  update public.blood_rare_registry set status = p_decision,
    verified_center = case when p_decision = 'verifie' then btrim(p_center) end, rare_criteria = case when p_decision = 'verifie' then btrim(p_criteria) end,
    verified_at = case when p_decision = 'verifie' then current_date end, verified_by = auth.uid(), decision_note = nullif(btrim(coalesce(p_note, '')), ''), updated_at = now()
  where user_id = p_user;
  if not found then raise exception 'PP404: inscription introuvable'; end if;
  perform public.log_audit('rare_registry.' || p_decision, 'blood_donor', p_user::text);
  insert into public.notifications (user_id, kind, title, body, link)
  values (p_user, 'don_sang', case when p_decision = 'verifie' then 'Inscription au registre des groupes rares validée' else 'Inscription au registre des groupes rares non retenue' end,
    coalesce(nullif(btrim(coalesce(p_note, '')), ''), 'Merci pour votre engagement.'), '/don-de-sang/groupes-rares');
end $$;
revoke execute on function public.rare_review(uuid, text, text, text, text) from public, anon;
grant execute on function public.rare_review(uuid, text, text, text, text) to authenticated;

-- Recherche sécurisée : CNTS et administration seulement, chaque recherche est journalisée
create or replace function public.rare_search(p_group text default null, p_region uuid default null, p_include_pending boolean default false)
returns table (user_id uuid, donor_code text, name text, phone text, blood_group text, group_verified boolean, phenotype_note text, rare_criteria text,
  status text, availability text, region text, verified_center text, verified_at date)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_blood_validator() then raise exception 'PP403: réservé au CNTS et à l''administration' using errcode = '42501'; end if;
  perform public.log_audit('rare_registry.search', 'blood_rare_registry', null, jsonb_build_object('group', p_group, 'region', p_region));
  return query select r.user_id, p.donor_code, pf.full_name, pf.phone, p.blood_group, p.blood_group_verified, r.phenotype_note, r.rare_criteria, r.status, r.availability,
      rg.name, r.verified_center, r.verified_at
    from public.blood_rare_registry r join public.blood_donor_profiles p on p.user_id = r.user_id join public.profiles pf on pf.id = r.user_id
    left join public.regions rg on rg.id = p.region_id
   where (p_include_pending or r.status = 'verifie') and r.status <> 'refuse'
     and (p_group is null or p.blood_group = p_group) and (p_region is null or p.region_id = p_region)
   order by (r.status = 'verifie') desc, (r.availability = 'disponible') desc, r.updated_at desc limit 200;
end $$;
revoke execute on function public.rare_search(text, uuid, boolean) from public, anon;
grant execute on function public.rare_search(text, uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Mon passeport solidaire : version publique limitée (désactivée par défaut)
-- ---------------------------------------------------------------------------
alter table public.blood_donor_profiles add column if not exists passport_token text unique default encode(extensions.gen_random_bytes(16), 'hex');
alter table public.blood_donor_profiles add column if not exists passport_public boolean not null default false;
update public.blood_donor_profiles set passport_token = encode(extensions.gen_random_bytes(16), 'hex') where passport_token is null;

create or replace function public.donor_set_passport_public(p_public boolean, p_renew boolean default false) returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  update public.blood_donor_profiles set passport_public = p_public,
    passport_token = case when p_renew then encode(gen_random_bytes(16), 'hex') else passport_token end, updated_at = now()
  where user_id = auth.uid();
  if not found then raise exception 'PP404: aucun espace donneur'; end if;
end $$;
revoke execute on function public.donor_set_passport_public(boolean, boolean) from public, anon;
grant execute on function public.donor_set_passport_public(boolean, boolean) to authenticated;

-- Aucune donnée médicale : ni groupe sanguin, ni dates précises de dons, ni centres
create or replace function public.passport_public(p_token text) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare pr public.blood_donor_profiles; n int;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{32}$' then return jsonb_build_object('status', 'invalide'); end if;
  select * into pr from public.blood_donor_profiles where passport_token = p_token and passport_public;
  if pr.user_id is null then return jsonb_build_object('status', 'invalide'); end if;
  n := public.blood_validated_count(pr.user_id);
  return jsonb_build_object('status', 'ok', 'donor_code', pr.donor_code, 'member_since', pr.created_at,
    'name', case when pr.card_show_name then (select full_name from public.profiles where id = pr.user_id) end,
    'validated_count', n, 'badges', coalesce((select jsonb_agg(jsonb_build_object('label', l.label, 'threshold', l.threshold) order by l.threshold) from public.blood_badge_levels l where l.threshold <= n), '[]'::jsonb),
    'by_year', coalesce((select jsonb_object_agg(y, c) from (select extract(year from donated_on)::int y, count(*) c from public.blood_donations where donor_id = pr.user_id and status = 'valide' group by 1) t), '{}'::jsonb),
    'campaigns', (select count(distinct campaign_id) from public.blood_donations where donor_id = pr.user_id and status = 'valide' and campaign_id is not null),
    'certificates', (select count(*) from public.blood_certificates where user_id = pr.user_id));
end $$;
grant execute on function public.passport_public(text) to anon, authenticated;

-- Rappel de suivi après un don (seulement si l'administration l'a activé après validation médicale du délai)
alter table public.blood_donations add column if not exists followup_sent boolean not null default false;
create or replace function public.blood_donor_reminders() returns int language plpgsql security definer set search_path = public as $$
declare n int; f int := 0;
begin
  with due as (
    select p.user_id, x.last_d, x.last_t from public.blood_donor_profiles p
      cross join lateral (select donated_on last_d, donation_type last_t from public.blood_donations d where d.donor_id = p.user_id and d.status <> 'refuse' order by donated_on desc limit 1) x
     where p.reminders and p.status = 'actif' and x.last_d is not null and p.reminded_for is distinct from x.last_d
       and public.blood_next_indicative(x.last_d, x.last_t, p.sex) <= current_date),
  upd as (update public.blood_donor_profiles p set reminded_for = due.last_d from due where p.user_id = due.user_id returning p.user_id)
  insert into public.notifications (user_id, kind, title, body, link)
  select user_id, 'don_sang', 'Date indicative de prochain don atteinte',
    'Date indicative de prochain don. Votre aptitude au don doit être confirmée par un professionnel de santé.', '/don-de-sang/mon-espace#calendrier' from upd;
  get diagnostics n = row_count;
  if public.setting_bool('blood_followup_enabled', false) then
    with fu as (update public.blood_donations d set followup_sent = true
                 where not d.followup_sent and d.status <> 'refuse' and d.donated_on = current_date - public.setting_int('blood_followup_days', 2)
                 returning d.donor_id)
    insert into public.notifications (user_id, kind, title, body, link)
    select donor_id, 'don_sang', 'Comment allez-vous depuis votre don ?', 'Conseils après le don et déclaration d''un malaise ou d''une gêne : votre espace de suivi.', '/don-de-sang/apres-le-don' from fu;
    get diagnostics f = row_count;
  end if;
  return n + f;
end $$;
revoke execute on function public.blood_donor_reminders() from public, anon, authenticated;
