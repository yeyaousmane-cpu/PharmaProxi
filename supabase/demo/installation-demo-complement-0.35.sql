-- SantéProxi — complément 0.35 pour le projet de démonstration (après le complément 0.34).
-- =============================================================================
-- SantéProxi 0.35 — SantéProxi Solidaire : SOS Besoin de sang, mise en relation, disponibilités, rendez-vous de don
-- Principes :
--   * une demande n'est jamais publique avant vérification par le CNTS ou l'administration ;
--   * aucune information médicale du patient n'est publiée ; les coordonnées du demandeur restent privées ;
--   * la mise en relation propose aux donneurs volontaires (accord explicite) de se manifester : compatibilité
--     ABO/Rh théorique seulement, la décision transfusionnelle reste au centre ; ce n'est pas de l'intelligence artificielle ;
--   * niveaux de disponibilité déclarés par le CNTS, datés, marqués « non actualisés » au-delà de 48 h, jamais inventés ;
--   * créneaux de don publiés par les centres : une réservation n'est pas une validation médicale.
-- Migration additive. Retour arrière : drop des tables blood_request*, blood_stock_levels, blood_donation_slots, blood_slot_bookings.
-- =============================================================================

-- Compatibilité théorique ABO/Rh (globules rouges : donneur → receveur ; plasma : sens inverse)
create or replace function public.blood_compatible_donors(p_recipient text, p_product text default null) returns text[] language sql immutable as $$
  select case when p_product = 'plasma' then
    case p_recipient when 'O+' then array['O+','O-','A+','A-','B+','B-','AB+','AB-'] when 'O-' then array['O+','O-','A+','A-','B+','B-','AB+','AB-']
      when 'A+' then array['A+','A-','AB+','AB-'] when 'A-' then array['A+','A-','AB+','AB-'] when 'B+' then array['B+','B-','AB+','AB-'] when 'B-' then array['B+','B-','AB+','AB-']
      when 'AB+' then array['AB+','AB-'] when 'AB-' then array['AB+','AB-'] end
  else
    case p_recipient when 'O-' then array['O-'] when 'O+' then array['O-','O+'] when 'A-' then array['A-','O-'] when 'A+' then array['A+','A-','O+','O-']
      when 'B-' then array['B-','O-'] when 'B+' then array['B+','B-','O+','O-'] when 'AB-' then array['AB-','A-','B-','O-']
      when 'AB+' then array['A+','A-','B+','B-','AB+','AB-','O+','O-'] end
  end;
$$;
grant execute on function public.blood_compatible_donors(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1. SOS Besoin de sang
-- ---------------------------------------------------------------------------
create table if not exists public.blood_requests (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('SOS-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(md5(gen_random_uuid()::text), 1, 5))),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  requester_kind text not null check (requester_kind in ('famille', 'etablissement', 'professionnel')),
  blood_group text not null check (blood_group in ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
  product text not null default 'non_precise' check (product in ('non_precise', 'sang_total', 'globules_rouges', 'plaquettes', 'plasma')),
  units int not null default 1 check (units between 1 and 20),
  facility_name text not null check (char_length(btrim(facility_name)) between 3 and 160),
  region_id uuid references public.regions(id) on delete set null,
  commune_id uuid references public.communes(id) on delete set null,
  place_detail text check (char_length(coalesce(place_detail, '')) <= 200),
  needed_at timestamptz not null,
  urgency text not null check (urgency in ('critique', 'elevee', 'programme')),
  contact_name text not null check (char_length(btrim(contact_name)) between 2 and 120),
  contact_phone text not null check (public.valid_phone(contact_phone)),
  description text check (char_length(coalesce(description, '')) <= 500),
  status text not null default 'en_attente' check (status in ('en_attente', 'verifiee', 'mobilisation', 'prise_en_charge', 'satisfaite', 'cloturee', 'rejetee')),
  status_note text check (char_length(coalesce(status_note, '')) <= 300),
  verified_by uuid references public.profiles(id) on delete set null,
  verified_at timestamptz,
  hidden boolean not null default false,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists blood_requests_public on public.blood_requests (status, urgency, needed_at) where not hidden;
alter table public.blood_requests enable row level security;
drop policy if exists "pp_blood_requests_read" on public.blood_requests;
create policy "pp_blood_requests_read" on public.blood_requests for select to anon, authenticated
  using ((status in ('verifiee', 'mobilisation', 'prise_en_charge') and not hidden and expires_at > now()) or requester_id = auth.uid() or public.is_blood_validator());
revoke all on public.blood_requests from anon, authenticated;
-- Colonnes publiques seulement : ni contact, ni demandeur, ni description libre
grant select (id, reference, requester_kind, blood_group, product, units, facility_name, region_id, commune_id, place_detail, needed_at, urgency, status, verified_at, expires_at, created_at, updated_at)
  on public.blood_requests to anon, authenticated;

create table if not exists public.blood_request_history (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.blood_requests(id) on delete cascade,
  status text not null,
  note text,
  actor_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.blood_request_history enable row level security;
drop policy if exists "pp_blood_request_history_read" on public.blood_request_history;
create policy "pp_blood_request_history_read" on public.blood_request_history for select to authenticated
  using (public.is_blood_validator() or exists (select 1 from public.blood_requests r where r.id = request_id and r.requester_id = auth.uid()));
revoke all on public.blood_request_history from anon, authenticated;
grant select on public.blood_request_history to authenticated;

create table if not exists public.blood_request_responses (
  request_id uuid not null references public.blood_requests(id) on delete cascade,
  donor_id uuid not null references public.blood_donor_profiles(user_id) on delete cascade,
  share_phone boolean not null default false,
  status text not null default 'disponible' check (status in ('disponible', 'annule', 'venu')),
  created_at timestamptz not null default now(),
  primary key (request_id, donor_id)
);
alter table public.blood_request_responses enable row level security;
drop policy if exists "pp_blood_request_responses_read" on public.blood_request_responses;
create policy "pp_blood_request_responses_read" on public.blood_request_responses for select to authenticated
  using (donor_id = auth.uid() or public.is_blood_validator() or exists (select 1 from public.blood_requests r where r.id = request_id and r.requester_id = auth.uid()));
revoke all on public.blood_request_responses from anon, authenticated;
grant select on public.blood_request_responses to authenticated;

create table if not exists public.blood_request_reports (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.blood_requests(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (char_length(btrim(reason)) between 5 and 300),
  handled boolean not null default false,
  created_at timestamptz not null default now(),
  unique (request_id, reporter_id)
);
alter table public.blood_request_reports enable row level security;
drop policy if exists "pp_blood_request_reports_read" on public.blood_request_reports;
create policy "pp_blood_request_reports_read" on public.blood_request_reports for select to authenticated using (reporter_id = auth.uid() or public.is_blood_validator());
revoke all on public.blood_request_reports from anon, authenticated;
grant select on public.blood_request_reports to authenticated;

create table if not exists public.blood_request_solicitations (
  request_id uuid not null references public.blood_requests(id) on delete cascade,
  donor_id uuid not null references public.blood_donor_profiles(user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (request_id, donor_id)
);
create index if not exists blood_request_solicitations_donor on public.blood_request_solicitations (donor_id, created_at desc);
alter table public.blood_request_solicitations enable row level security;
revoke all on public.blood_request_solicitations from anon, authenticated;

insert into public.platform_settings (key, value, description) values
  ('blood_sos_solicitation_days', '7', 'Nombre minimal de jours entre deux sollicitations d''un même donneur (mise en relation SOS).'),
  ('blood_stock_stale_hours', '48', 'Au-delà de ce délai, un niveau de disponibilité est affiché comme « non actualisé ».')
on conflict (key) do nothing;

create or replace function public.blood_request_create(p jsonb) returns text language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_auth(); r public.blood_requests; t timestamptz := nullif(p ->> 'needed_at', '')::timestamptz;
begin
  if p ->> 'accord' is distinct from 'true' then raise exception 'PP422: confirmez que la demande est réelle et validée par un professionnel de santé'; end if;
  if t is null or t < now() - interval '1 day' or t > now() + interval '30 days' then raise exception 'PP422: date du besoin invalide (dans les 30 prochains jours)'; end if;
  if (select count(*) from public.blood_requests where requester_id = uid and created_at > now() - interval '1 day') >= 3 then raise exception 'PP429: 3 demandes par jour au plus'; end if;
  insert into public.blood_requests (requester_id, requester_kind, blood_group, product, units, facility_name, region_id, commune_id, place_detail, needed_at, urgency,
    contact_name, contact_phone, description, expires_at)
  values (uid, p ->> 'requester_kind', p ->> 'blood_group', coalesce(nullif(p ->> 'product', ''), 'non_precise'), coalesce(nullif(p ->> 'units', '')::int, 1),
    btrim(p ->> 'facility_name'), nullif(p ->> 'region_id', '')::uuid, nullif(p ->> 'commune_id', '')::uuid, nullif(btrim(coalesce(p ->> 'place_detail', '')), ''), t,
    p ->> 'urgency', btrim(p ->> 'contact_name'), p ->> 'contact_phone', nullif(btrim(coalesce(p ->> 'description', '')), ''), greatest(t, now()) + interval '3 days')
  returning * into r;
  insert into public.blood_request_history (request_id, status, actor_id) values (r.id, 'en_attente', uid);
  insert into public.notifications (user_id, kind, title, body, link)
  select am.user_id, 'don_sang', 'Demande de sang à vérifier', r.reference || ' — ' || r.blood_group || ' — ' || r.facility_name, '/don-de-sang/validation#sos'
    from public.authority_members am where am.active and am.scope = 'cnts';
  return r.reference;
exception when check_violation then raise exception 'PP422: vérifiez les champs (groupe, établissement, urgence, téléphone au format +223…)';
end $$;
revoke execute on function public.blood_request_create(jsonb) from public, anon;
grant execute on function public.blood_request_create(jsonb) to authenticated;

create or replace function public.blood_request_set_status(p_id uuid, p_status text, p_note text default null) returns void language plpgsql security definer set search_path = public as $$
declare r public.blood_requests; uid uuid := auth.uid(); is_val boolean := public.is_blood_validator();
begin
  select * into r from public.blood_requests where id = p_id for update;
  if r.id is null then raise exception 'PP404: demande introuvable'; end if;
  if p_status not in ('verifiee', 'mobilisation', 'prise_en_charge', 'satisfaite', 'cloturee', 'rejetee') then raise exception 'PP422: statut invalide'; end if;
  -- Le demandeur peut seulement clore sa demande ou la déclarer satisfaite
  if not is_val and not (r.requester_id = uid and p_status in ('satisfaite', 'cloturee')) then raise exception 'PP403: réservé au CNTS et à l''administration' using errcode = '42501'; end if;
  if p_status in ('verifiee', 'mobilisation') and r.requester_id = uid then raise exception 'PP403: vous ne pouvez pas vérifier votre propre demande'; end if;
  if p_status = 'rejetee' and char_length(btrim(coalesce(p_note, ''))) < 5 then raise exception 'PP422: indiquez le motif du rejet'; end if;
  if p_status in ('mobilisation', 'prise_en_charge') and r.status = 'en_attente' then raise exception 'PP409: vérifiez d''abord la demande'; end if;
  update public.blood_requests set status = p_status, status_note = nullif(btrim(coalesce(p_note, '')), ''),
    verified_by = case when p_status = 'verifiee' then uid else verified_by end, verified_at = case when p_status = 'verifiee' then now() else verified_at end, updated_at = now()
  where id = p_id;
  insert into public.blood_request_history (request_id, status, note, actor_id) values (p_id, p_status, nullif(btrim(coalesce(p_note, '')), ''), uid);
  perform public.log_audit('blood_request.' || p_status, 'blood_request', p_id::text);
  if r.requester_id <> uid then
    insert into public.notifications (user_id, kind, title, body, link)
    values (r.requester_id, 'don_sang', 'Votre demande de sang : ' || case p_status when 'verifiee' then 'vérifiée' when 'mobilisation' then 'mobilisation en cours' when 'prise_en_charge' then 'prise en charge par le centre'
      when 'satisfaite' then 'besoin satisfait' when 'cloturee' then 'clôturée' else 'rejetée' end, r.reference || coalesce(' — ' || nullif(btrim(coalesce(p_note, '')), ''), ''), '/don-de-sang/sos/' || r.id);
  end if;
end $$;
revoke execute on function public.blood_request_set_status(uuid, text, text) from public, anon;
grant execute on function public.blood_request_set_status(uuid, text, text) to authenticated;

-- Mise en relation : donneurs volontaires (accord explicite), actifs, de groupe théoriquement compatible,
-- de la même région si elle est connue, dont la date indicative est passée, non sollicités récemment.
create or replace function public.blood_request_mobilize(p_id uuid) returns int language plpgsql security definer set search_path = public as $$
declare r public.blood_requests; n int; groups text[];
begin
  if not public.is_blood_validator() then raise exception 'PP403: réservé au CNTS et à l''administration' using errcode = '42501'; end if;
  select * into r from public.blood_requests where id = p_id;
  if r.id is null then raise exception 'PP404: demande introuvable'; end if;
  if r.status not in ('verifiee', 'mobilisation') then raise exception 'PP409: la demande doit être vérifiée avant toute mobilisation'; end if;
  groups := public.blood_compatible_donors(r.blood_group, r.product);
  with cand as (
    select p.user_id from public.blood_donor_profiles p
    where p.accepts_solicitations and p.status = 'actif' and p.blood_group = any(groups)
      and (r.region_id is null or p.region_id = r.region_id)
      and coalesce(public.blood_next_indicative(
            (select max(donated_on) from public.blood_donations d where d.donor_id = p.user_id and d.status <> 'refuse'),
            (select donation_type from public.blood_donations d where d.donor_id = p.user_id and d.status <> 'refuse' order by donated_on desc limit 1), p.sex), current_date) <= current_date
      and not exists (select 1 from public.blood_request_solicitations s where s.donor_id = p.user_id and s.created_at > now() - make_interval(days => public.setting_int('blood_sos_solicitation_days', 7)))
      and not exists (select 1 from public.blood_request_solicitations s where s.donor_id = p.user_id and s.request_id = r.id)
      and p.user_id <> r.requester_id
    limit 500),
  ins as (insert into public.blood_request_solicitations (request_id, donor_id) select r.id, user_id from cand returning donor_id)
  insert into public.notifications (user_id, kind, title, body, link)
  select donor_id, 'don_sang', 'Besoin de sang vérifié près de chez vous',
    'Groupe ' || r.blood_group || ' — ' || r.facility_name || '. Votre groupe est théoriquement compatible : le centre de transfusion confirmera. Dites si vous êtes disponible.',
    '/don-de-sang/sos/' || r.id from ins;
  get diagnostics n = row_count;
  if r.status = 'verifiee' then
    update public.blood_requests set status = 'mobilisation', updated_at = now() where id = r.id;
    insert into public.blood_request_history (request_id, status, note, actor_id) values (r.id, 'mobilisation', n || ' donneur(s) sollicité(s)', auth.uid());
  end if;
  perform public.log_audit('blood_request.mobilize', 'blood_request', p_id::text, jsonb_build_object('solicited', n));
  return n;
end $$;
revoke execute on function public.blood_request_mobilize(uuid) from public, anon;
grant execute on function public.blood_request_mobilize(uuid) to authenticated;

create or replace function public.blood_request_respond(p_id uuid, p_share_phone boolean) returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_auth(); r public.blood_requests;
begin
  select * into r from public.blood_requests where id = p_id;
  if r.id is null or r.status not in ('verifiee', 'mobilisation') or r.hidden or r.expires_at < now() then raise exception 'PP409: cette demande n''attend plus de donneurs'; end if;
  if not exists (select 1 from public.blood_donor_profiles where user_id = uid) then raise exception 'PP404: créez d''abord votre espace donneur'; end if;
  insert into public.blood_request_responses (request_id, donor_id, share_phone) values (p_id, uid, coalesce(p_share_phone, false))
  on conflict (request_id, donor_id) do update set status = 'disponible', share_phone = excluded.share_phone;
  insert into public.notifications (user_id, kind, title, body, link)
  values (r.requester_id, 'don_sang', 'Un donneur volontaire se manifeste', r.reference, '/don-de-sang/sos/' || r.id);
end $$;
revoke execute on function public.blood_request_respond(uuid, boolean) from public, anon;
grant execute on function public.blood_request_respond(uuid, boolean) to authenticated;

create or replace function public.blood_request_withdraw_response(p_id uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  update public.blood_request_responses set status = 'annule' where request_id = p_id and donor_id = auth.uid();
end $$;
revoke execute on function public.blood_request_withdraw_response(uuid) from public, anon;
grant execute on function public.blood_request_withdraw_response(uuid) to authenticated;

-- Donneurs qui se sont manifestés : visibles par le demandeur et le CNTS (téléphone seulement si le donneur l'a accepté)
create or replace function public.blood_request_responders(p_id uuid)
returns table (donor_code text, name text, phone text, blood_group text, group_verified boolean, status text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_blood_validator() or exists (select 1 from public.blood_requests where id = p_id and requester_id = auth.uid())) then
    raise exception 'PP403: accès refusé' using errcode = '42501';
  end if;
  return query select p.donor_code, pf.full_name, case when x.share_phone then pf.phone end, p.blood_group, p.blood_group_verified, x.status, x.created_at
    from public.blood_request_responses x join public.blood_donor_profiles p on p.user_id = x.donor_id join public.profiles pf on pf.id = x.donor_id
   where x.request_id = p_id order by x.created_at;
end $$;
revoke execute on function public.blood_request_responders(uuid) from public, anon;
grant execute on function public.blood_request_responders(uuid) to authenticated;

-- Contact du demandeur : CNTS, administration et demandeur seulement
create or replace function public.blood_request_contact(p_id uuid) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r public.blood_requests;
begin
  select * into r from public.blood_requests where id = p_id;
  if r.id is null or not (public.is_blood_validator() or r.requester_id = auth.uid()) then raise exception 'PP403: accès refusé' using errcode = '42501'; end if;
  return jsonb_build_object('contact_name', r.contact_name, 'contact_phone', r.contact_phone, 'description', r.description, 'status_note', r.status_note);
end $$;
revoke execute on function public.blood_request_contact(uuid) from public, anon;
grant execute on function public.blood_request_contact(uuid) to authenticated;

create or replace function public.blood_request_report(p_id uuid, p_reason text) returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_auth(); n int;
begin
  insert into public.blood_request_reports (request_id, reporter_id, reason) values (p_id, uid, btrim(p_reason));
  select count(*) into n from public.blood_request_reports where request_id = p_id and not handled;
  -- 3 signalements distincts : la demande est masquée en attendant l'examen du CNTS
  if n >= 3 then update public.blood_requests set hidden = true, updated_at = now() where id = p_id; end if;
  insert into public.notifications (user_id, kind, title, body, link)
  select am.user_id, 'don_sang', 'Demande de sang signalée', (select reference from public.blood_requests where id = p_id), '/don-de-sang/validation#sos'
    from public.authority_members am where am.active and am.scope = 'cnts';
exception
  when unique_violation then raise exception 'PP409: vous avez déjà signalé cette demande';
  when check_violation then raise exception 'PP422: expliquez en quelques mots le problème';
end $$;
revoke execute on function public.blood_request_report(uuid, text) from public, anon;
grant execute on function public.blood_request_report(uuid, text) to authenticated;

create or replace function public.blood_request_unhide(p_id uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_blood_validator() then raise exception 'PP403: réservé au CNTS et à l''administration' using errcode = '42501'; end if;
  update public.blood_requests set hidden = false, updated_at = now() where id = p_id;
  update public.blood_request_reports set handled = true where request_id = p_id;
  perform public.log_audit('blood_request.unhide', 'blood_request', p_id::text);
end $$;
revoke execute on function public.blood_request_unhide(uuid) from public, anon;
grant execute on function public.blood_request_unhide(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Besoins et disponibilités déclarés par les centres (niveau de tension, jamais de quantité inventée)
-- ---------------------------------------------------------------------------
create table if not exists public.blood_stock_levels (
  id uuid primary key default gen_random_uuid(),
  center text not null check (char_length(btrim(center)) between 3 and 160),
  region_id uuid references public.regions(id) on delete set null,
  blood_group text not null check (blood_group in ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
  product text not null default 'globules_rouges' check (product in ('sang_total', 'globules_rouges', 'plaquettes', 'plasma')),
  level text not null check (level in ('normal', 'tension', 'urgent')),
  note text check (char_length(coalesce(note, '')) <= 200),
  organisation text not null check (char_length(btrim(organisation)) between 2 and 120),
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists blood_stock_levels_latest on public.blood_stock_levels (center, blood_group, product, created_at desc);
alter table public.blood_stock_levels enable row level security;
drop policy if exists "pp_blood_stock_read" on public.blood_stock_levels;
create policy "pp_blood_stock_read" on public.blood_stock_levels for select to anon, authenticated using (true);
revoke all on public.blood_stock_levels from anon, authenticated;
grant select (id, center, region_id, blood_group, product, level, note, organisation, created_at) on public.blood_stock_levels to anon, authenticated;

create or replace function public.blood_stock_update(p_center text, p_region uuid, p_product text, p_levels jsonb, p_note text default null) returns int language plpgsql security definer set search_path = public as $$
declare g text; lv text; n int := 0; org text;
begin
  if not public.is_blood_validator() then raise exception 'PP403: réservé au CNTS et aux centres habilités' using errcode = '42501'; end if;
  select coalesce((select organisation from public.authority_members where user_id = auth.uid() and active), 'Administration SantéProxi') into org;
  for g, lv in select key, value #>> '{}' from jsonb_each(p_levels) loop
    if lv in ('normal', 'tension', 'urgent') then
      insert into public.blood_stock_levels (center, region_id, blood_group, product, level, note, organisation, updated_by)
      values (btrim(p_center), p_region, g, coalesce(nullif(p_product, ''), 'globules_rouges'), lv, nullif(btrim(coalesce(p_note, '')), ''), org, auth.uid());
      n := n + 1;
    end if;
  end loop;
  if n = 0 then raise exception 'PP422: indiquez au moins un niveau'; end if;
  perform public.log_audit('blood_stock.update', 'blood_stock', btrim(p_center), jsonb_build_object('levels', n));
  return n;
exception when check_violation then raise exception 'PP422: vérifiez le centre et les groupes';
end $$;
revoke execute on function public.blood_stock_update(text, uuid, text, jsonb, text) from public, anon;
grant execute on function public.blood_stock_update(text, uuid, text, jsonb, text) to authenticated;

-- Dernier niveau déclaré par centre, groupe et produit
create or replace function public.blood_stock_current(p_region uuid default null)
returns table (center text, region text, blood_group text, product text, level text, note text, organisation text, updated_at timestamptz, stale boolean)
language sql stable security definer set search_path = public as $$
  select distinct on (s.center, s.blood_group, s.product) s.center, r.name, s.blood_group, s.product, s.level, s.note, s.organisation, s.created_at,
    s.created_at < now() - make_interval(hours => public.setting_int('blood_stock_stale_hours', 48))
  from public.blood_stock_levels s left join public.regions r on r.id = s.region_id
  where p_region is null or s.region_id = p_region
  order by s.center, s.blood_group, s.product, s.created_at desc;
$$;
grant execute on function public.blood_stock_current(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Mon rendez-vous de don : créneaux publiés par les centres habilités
-- ---------------------------------------------------------------------------
create table if not exists public.blood_donation_slots (
  id uuid primary key default gen_random_uuid(),
  center text not null check (char_length(btrim(center)) between 3 and 160),
  region_id uuid references public.regions(id) on delete set null,
  address text check (char_length(coalesce(address, '')) <= 200),
  slot_date date not null,
  start_time text not null check (start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  end_time text not null check (end_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  capacity int not null check (capacity between 1 and 200),
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (end_time > start_time)
);
create index if not exists blood_donation_slots_date on public.blood_donation_slots (slot_date, center);
alter table public.blood_donation_slots enable row level security;
drop policy if exists "pp_blood_slots_read" on public.blood_donation_slots;
create policy "pp_blood_slots_read" on public.blood_donation_slots for select to anon, authenticated using (active or public.is_blood_validator());
revoke all on public.blood_donation_slots from anon, authenticated;
grant select on public.blood_donation_slots to anon, authenticated;

create table if not exists public.blood_slot_bookings (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('RDD-' || upper(substr(md5(gen_random_uuid()::text), 1, 8))),
  slot_id uuid not null references public.blood_donation_slots(id) on delete cascade,
  donor_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'confirme' check (status in ('en_attente', 'confirme', 'annule', 'reporte', 'present', 'absent')),
  note text check (char_length(coalesce(note, '')) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists blood_slot_bookings_active on public.blood_slot_bookings (slot_id, donor_id) where status in ('en_attente', 'confirme');
alter table public.blood_slot_bookings enable row level security;
drop policy if exists "pp_blood_bookings_read" on public.blood_slot_bookings;
create policy "pp_blood_bookings_read" on public.blood_slot_bookings for select to authenticated using (donor_id = auth.uid() or public.is_blood_validator());
revoke all on public.blood_slot_bookings from anon, authenticated;
grant select on public.blood_slot_bookings to authenticated;

create or replace function public.blood_slot_remaining(p_slot uuid) returns int language sql stable security definer set search_path = public as $$
  select s.capacity - (select count(*)::int from public.blood_slot_bookings b where b.slot_id = s.id and b.status in ('en_attente', 'confirme', 'present'))
  from public.blood_donation_slots s where s.id = p_slot;
$$;
grant execute on function public.blood_slot_remaining(uuid) to anon, authenticated;

create or replace function public.blood_slot_create(p jsonb) returns uuid language plpgsql security definer set search_path = public as $$
declare id uuid; d date := nullif(p ->> 'slot_date', '')::date;
begin
  if not public.is_blood_validator() then raise exception 'PP403: réservé au CNTS et aux centres habilités' using errcode = '42501'; end if;
  if d is null or d < current_date or d > current_date + 90 then raise exception 'PP422: date invalide (dans les 90 prochains jours)'; end if;
  insert into public.blood_donation_slots (center, region_id, address, slot_date, start_time, end_time, capacity, created_by)
  values (btrim(p ->> 'center'), nullif(p ->> 'region_id', '')::uuid, nullif(btrim(coalesce(p ->> 'address', '')), ''), d, p ->> 'start_time', p ->> 'end_time', (p ->> 'capacity')::int, auth.uid())
  returning blood_donation_slots.id into id;
  perform public.log_audit('blood_slot.create', 'blood_slot', id::text);
  return id;
exception when check_violation or invalid_text_representation then raise exception 'PP422: vérifiez le centre, les heures (fin après début) et la capacité (1 à 200)';
end $$;
revoke execute on function public.blood_slot_create(jsonb) from public, anon;
grant execute on function public.blood_slot_create(jsonb) to authenticated;

create or replace function public.blood_slot_close(p_slot uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_blood_validator() then raise exception 'PP403: réservé au CNTS et aux centres habilités' using errcode = '42501'; end if;
  update public.blood_donation_slots set active = false where id = p_slot;
  insert into public.notifications (user_id, kind, title, body, link)
  select b.donor_id, 'don_sang', 'Créneau de don annulé par le centre', b.reference || ' : choisissez un autre créneau.', '/don-de-sang/rendez-vous'
    from public.blood_slot_bookings b where b.slot_id = p_slot and b.status in ('en_attente', 'confirme');
  update public.blood_slot_bookings set status = 'annule', note = 'Créneau annulé par le centre', updated_at = now() where slot_id = p_slot and status in ('en_attente', 'confirme');
end $$;
revoke execute on function public.blood_slot_close(uuid) from public, anon;
grant execute on function public.blood_slot_close(uuid) to authenticated;

create or replace function public.blood_slot_book(p_slot uuid) returns text language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_auth(); s public.blood_donation_slots; r text;
begin
  select * into s from public.blood_donation_slots where id = p_slot and active for update;
  if s.id is null or s.slot_date < current_date then raise exception 'PP404: créneau indisponible'; end if;
  if public.blood_slot_remaining(p_slot) <= 0 then raise exception 'PP409: ce créneau est complet'; end if;
  if (select count(*) from public.blood_slot_bookings b join public.blood_donation_slots x on x.id = b.slot_id where b.donor_id = uid and b.status in ('en_attente', 'confirme') and x.slot_date >= current_date) >= 2 then
    raise exception 'PP409: vous avez déjà 2 rendez-vous à venir';
  end if;
  insert into public.blood_slot_bookings (slot_id, donor_id) values (p_slot, uid) returning reference into r;
  insert into public.notifications (user_id, kind, title, body, link)
  values (uid, 'don_sang', 'Rendez-vous de don réservé', r || ' — ' || s.center || ', ' || to_char(s.slot_date, 'DD/MM/YYYY') || ' ' || s.start_time || '. L''aptitude au don sera évaluée sur place.', '/don-de-sang/rendez-vous');
  return r;
exception when unique_violation then raise exception 'PP409: vous avez déjà réservé ce créneau';
end $$;
revoke execute on function public.blood_slot_book(uuid) from public, anon;
grant execute on function public.blood_slot_book(uuid) to authenticated;

create or replace function public.blood_booking_set_status(p_id uuid, p_status text, p_note text default null) returns void language plpgsql security definer set search_path = public as $$
declare b public.blood_slot_bookings; is_val boolean := public.is_blood_validator();
begin
  select * into b from public.blood_slot_bookings where id = p_id for update;
  if b.id is null then raise exception 'PP404: rendez-vous introuvable'; end if;
  if p_status not in ('annule', 'reporte', 'present', 'absent', 'confirme') then raise exception 'PP422: statut invalide'; end if;
  if not is_val and not (b.donor_id = auth.uid() and p_status = 'annule') then raise exception 'PP403: réservé au centre' using errcode = '42501'; end if;
  update public.blood_slot_bookings set status = p_status, note = coalesce(nullif(btrim(coalesce(p_note, '')), ''), note), updated_at = now() where id = p_id;
  if is_val and b.donor_id <> auth.uid() then
    insert into public.notifications (user_id, kind, title, body, link)
    values (b.donor_id, 'don_sang', 'Votre rendez-vous de don : ' || case p_status when 'annule' then 'annulé' when 'reporte' then 'à reporter' when 'present' then 'présence enregistrée' when 'absent' then 'absence constatée' else 'confirmé' end,
      b.reference || coalesce(' — ' || nullif(btrim(coalesce(p_note, '')), ''), ''), '/don-de-sang/rendez-vous');
  end if;
end $$;
revoke execute on function public.blood_booking_set_status(uuid, text, text) from public, anon;
grant execute on function public.blood_booking_set_status(uuid, text, text) to authenticated;

-- Démonstration : créneaux et niveaux fictifs, clairement libellés (refusé hors démonstration)
create or replace function public.demo_blood_sos_install(p_admin uuid) returns int language plpgsql security definer set search_path = public as $$
declare bko uuid;
begin
  perform public.demo_guard();
  select id into bko from public.regions where is_district limit 1;
  insert into public.blood_donation_slots (center, region_id, address, slot_date, start_time, end_time, capacity, created_by)
  select 'CNTS Quinzambougou (créneaux fictifs de démonstration)', bko, 'Quinzambougou, Bamako', current_date + d, '08:00', '11:00', 10, p_admin from generate_series(1, 5) d
  where not exists (select 1 from public.blood_donation_slots where center like '%démonstration%');
  insert into public.blood_stock_levels (center, region_id, blood_group, product, level, note, organisation, updated_by)
  select 'CNTS (niveaux fictifs de démonstration)', bko, g, 'globules_rouges', case when g in ('O-', 'B-') then 'urgent' when g in ('O+', 'A-') then 'tension' else 'normal' end,
    'Données fictives de démonstration', 'Démonstration', p_admin
  from unnest(array['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']) g
  where not exists (select 1 from public.blood_stock_levels where organisation = 'Démonstration');
  return 1;
end $$;
revoke execute on function public.demo_blood_sos_install(uuid) from public, anon, authenticated;
grant execute on function public.demo_blood_sos_install(uuid) to service_role;

-- Le demandeur peut savoir qu'il est l'auteur d'une demande (la colonne requester_id n'est pas exposée)
create or replace function public.blood_request_is_mine(p_id uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.blood_requests where id = p_id and requester_id = auth.uid());
$$;
revoke execute on function public.blood_request_is_mine(uuid) from public, anon;
grant execute on function public.blood_request_is_mine(uuid) to authenticated;
-- Liste « Mes demandes »
create or replace function public.blood_my_requests() returns setof uuid language sql stable security definer set search_path = public as $$
  select id from public.blood_requests where requester_id = auth.uid() order by created_at desc limit 20;
$$;
revoke execute on function public.blood_my_requests() from public, anon;
grant execute on function public.blood_my_requests() to authenticated;
-- Demandes masquées après signalements (CNTS et administration)
create or replace function public.blood_hidden_requests() returns table (id uuid, reference text, reports int, reasons text[]) language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_blood_validator() then raise exception 'PP403: réservé au CNTS et à l''administration' using errcode = '42501'; end if;
  return query select r.id, r.reference, count(x.id)::int, array_agg(x.reason order by x.created_at)
    from public.blood_requests r join public.blood_request_reports x on x.request_id = r.id and not x.handled
   where r.hidden group by r.id, r.reference order by r.reference;
end $$;
revoke execute on function public.blood_hidden_requests() from public, anon;
grant execute on function public.blood_hidden_requests() to authenticated;
