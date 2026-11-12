-- SantéProxi — complément 0.41 pour le projet de démonstration (après le complément 0.40).
-- =============================================================================
-- SantéProxi 0.41 — Orientation, phases 2 à 4
-- Phase 2 : établissements partenaires (membres désignés par l'administration après vérification) :
--   conditions d'accès sourcées (tarifs indicatifs, CANAM/AMO, accessibilité), état temporaire d'un service avec
--   expiration, demandes de rendez-vous (l'établissement propose un créneau, le patient confirme).
-- Phase 3 : orientation par niveau de la pyramide sanitaire (CSCom → CSRéf → hôpital régional → CHU / centre de
--   référence), calculée à partir du référentiel. Aucune « référence » médicale automatique : simple repérage.
-- Phase 4 : couverture territoriale enrichie pour les autorités (partenaires, alertes de service, demandes masquées).
-- Rien n'est présenté comme officiel ; aucun établissement n'est « partenaire » sans membre désigné.
-- Migration additive. Retour arrière : drop des tables facility_partner_* / facility_access_info / facility_service_status / facility_appointment_requests.
-- =============================================================================

create table if not exists public.facility_partner_members (
  facility_id uuid not null references public.facility_listings(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role_label text check (char_length(coalesce(role_label, '')) <= 80),
  designated_by uuid references public.profiles(id) on delete set null,
  verification_note text not null check (char_length(btrim(verification_note)) >= 5),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (facility_id, user_id)
);
alter table public.facility_partner_members enable row level security;
drop policy if exists "pp_fpm_read" on public.facility_partner_members;
create policy "pp_fpm_read" on public.facility_partner_members for select to authenticated using (user_id = auth.uid() or public.is_admin());
revoke all on public.facility_partner_members from anon, authenticated;
grant select on public.facility_partner_members to authenticated;

create or replace function public.is_facility_partner(p_facility uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.facility_partner_members where facility_id = p_facility and user_id = auth.uid() and active)
$$;
grant execute on function public.is_facility_partner(uuid) to authenticated;

-- Un établissement est « partenaire actif » s'il a au moins un membre actif désigné
create or replace function public.facility_is_partner(p_facility uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.facility_partner_members where facility_id = p_facility and active)
$$;
grant execute on function public.facility_is_partner(uuid) to anon, authenticated;

create or replace function public.admin_facility_partner(p_facility uuid, p_email text, p_role text, p_note text, p_active boolean default true) returns void language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  perform public.require_admin();
  if char_length(btrim(coalesce(p_note, ''))) < 5 then raise exception 'PP422: décrivez la vérification (appel au standard, document, visite…)'; end if;
  select id into uid from auth.users where lower(email) = lower(btrim(p_email));
  if uid is null then raise exception 'PP404: aucun compte avec cette adresse'; end if;
  if not exists (select 1 from public.facility_listings where id = p_facility and is_published) then raise exception 'PP404: établissement introuvable'; end if;
  insert into public.facility_partner_members (facility_id, user_id, role_label, designated_by, verification_note, active)
  values (p_facility, uid, nullif(btrim(coalesce(p_role, '')), ''), auth.uid(), btrim(p_note), p_active)
  on conflict (facility_id, user_id) do update set role_label = excluded.role_label, verification_note = excluded.verification_note, active = excluded.active, designated_by = excluded.designated_by;
  perform public.log_audit('facility.partner', 'facility_listing', p_facility::text, jsonb_build_object('user', uid, 'active', p_active));
end $$;
revoke execute on function public.admin_facility_partner(uuid, text, text, text, boolean) from public, anon;
grant execute on function public.admin_facility_partner(uuid, text, text, text, boolean) to authenticated;

-- Conditions d'accès : chaque information porte sa source et sa date
create table if not exists public.facility_access_info (
  facility_id uuid not null references public.facility_listings(id) on delete cascade,
  field text not null check (field in ('tarif_consultation', 'tarif_urgence', 'canam_amo', 'autres_assurances', 'accessibilite_fauteuil', 'langues', 'horaires', 'conditions_acces')),
  value text not null check (char_length(btrim(value)) between 1 and 300),
  source_kind text not null check (source_kind in ('etablissement', 'source_publique', 'administration')),
  source_url text check (source_url is null or source_url ~ '^https?://'),
  confirmed_at timestamptz not null default now(),
  confirmed_by uuid references public.profiles(id) on delete set null,
  primary key (facility_id, field),
  check (source_kind <> 'source_publique' or source_url is not null)
);
alter table public.facility_access_info enable row level security;
drop policy if exists "pp_fai_read" on public.facility_access_info;
create policy "pp_fai_read" on public.facility_access_info for select to anon, authenticated using (true);
revoke all on public.facility_access_info from anon, authenticated;
grant select on public.facility_access_info to anon, authenticated;

create or replace function public.facility_set_access(p_facility uuid, p_field text, p_value text, p_source_url text default null) returns void language plpgsql security definer set search_path = public as $$
declare kind text;
begin
  if public.is_facility_partner(p_facility) then kind := 'etablissement';
  elsif public.is_admin() then kind := case when nullif(btrim(coalesce(p_source_url, '')), '') is null then 'administration' else 'source_publique' end;
  else raise exception 'PP403: réservé aux membres de l''établissement' using errcode = '42501'; end if;
  if nullif(btrim(coalesce(p_value, '')), '') is null then
    delete from public.facility_access_info where facility_id = p_facility and field = p_field;
  else
    insert into public.facility_access_info (facility_id, field, value, source_kind, source_url, confirmed_at, confirmed_by)
    values (p_facility, p_field, btrim(p_value), kind, nullif(btrim(coalesce(p_source_url, '')), ''), now(), auth.uid())
    on conflict (facility_id, field) do update set value = excluded.value, source_kind = excluded.source_kind, source_url = excluded.source_url, confirmed_at = now(), confirmed_by = auth.uid();
  end if;
  perform public.log_audit('facility.access', 'facility_listing', p_facility::text, jsonb_build_object('field', p_field));
exception when check_violation then raise exception 'PP422: valeur invalide (300 caractères au maximum)';
end $$;
revoke execute on function public.facility_set_access(uuid, text, text, text) from public, anon;
grant execute on function public.facility_set_access(uuid, text, text, text) to authenticated;

-- État temporaire d'un service (déclaré par l'établissement, expire au plus tard après 72 h)
create table if not exists public.facility_service_status (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facility_listings(id) on delete cascade,
  service text not null check (char_length(btrim(service)) between 2 and 80),
  status text not null check (status in ('fonctionne', 'perturbe', 'ferme_temporairement', 'sature')),
  message text check (char_length(coalesce(message, '')) <= 300),
  valid_until timestamptz not null,
  declared_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists facility_service_status_f on public.facility_service_status (facility_id, valid_until desc);
alter table public.facility_service_status enable row level security;
drop policy if exists "pp_fss_read" on public.facility_service_status;
create policy "pp_fss_read" on public.facility_service_status for select to anon, authenticated using (valid_until > now() or public.is_facility_partner(facility_id) or public.is_admin());
revoke all on public.facility_service_status from anon, authenticated;
grant select on public.facility_service_status to anon, authenticated;

create or replace function public.facility_declare_service(p_facility uuid, p_service text, p_status text, p_hours int, p_message text default null) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.is_facility_partner(p_facility) then raise exception 'PP403: réservé aux membres de l''établissement' using errcode = '42501'; end if;
  if p_hours not between 1 and 72 then raise exception 'PP422: durée de 1 à 72 heures'; end if;
  update public.facility_service_status set valid_until = now() where facility_id = p_facility and lower(service) = lower(btrim(p_service)) and valid_until > now();
  insert into public.facility_service_status (facility_id, service, status, message, valid_until, declared_by)
  values (p_facility, btrim(p_service), p_status, nullif(btrim(coalesce(p_message, '')), ''), now() + make_interval(hours => p_hours), auth.uid()) returning id into v_id;
  perform public.log_audit('facility.service_status', 'facility_listing', p_facility::text, jsonb_build_object('service', p_service, 'status', p_status));
  return v_id;
exception when check_violation then raise exception 'PP422: service ou état invalide';
end $$;
revoke execute on function public.facility_declare_service(uuid, text, text, int, text) from public, anon;
grant execute on function public.facility_declare_service(uuid, text, text, int, text) to authenticated;

create or replace function public.facility_end_service_status(p_id uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  update public.facility_service_status s set valid_until = now() where s.id = p_id and public.is_facility_partner(s.facility_id) and s.valid_until > now();
  if not found then raise exception 'PP404: information introuvable ou déjà expirée'; end if;
end $$;
revoke execute on function public.facility_end_service_status(uuid) from public, anon;
grant execute on function public.facility_end_service_status(uuid) to authenticated;

-- Demandes de rendez-vous auprès d'un établissement partenaire
create table if not exists public.facility_appointment_requests (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('RDV-' || upper(substr(md5(gen_random_uuid()::text), 1, 8))),
  facility_id uuid not null references public.facility_listings(id) on delete cascade,
  patient_id uuid not null references public.profiles(id) on delete cascade,
  service text not null check (char_length(btrim(service)) between 2 and 80),
  reason text check (char_length(coalesce(reason, '')) <= 300),
  preferred text not null check (char_length(btrim(preferred)) between 3 and 200),
  share_phone boolean not null default false,
  status text not null default 'envoyee' check (status in ('envoyee', 'proposee', 'confirmee', 'refusee', 'annulee', 'honoree', 'non_venu')),
  proposed_at timestamptz,
  facility_message text check (char_length(coalesce(facility_message, '')) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists facility_appt_f on public.facility_appointment_requests (facility_id, status, created_at desc);
create index if not exists facility_appt_p on public.facility_appointment_requests (patient_id, created_at desc);
alter table public.facility_appointment_requests enable row level security;
drop policy if exists "pp_far_read" on public.facility_appointment_requests;
create policy "pp_far_read" on public.facility_appointment_requests for select to authenticated using (patient_id = auth.uid() or public.is_facility_partner(facility_id));
revoke all on public.facility_appointment_requests from anon, authenticated;
grant select on public.facility_appointment_requests to authenticated;

create or replace function public.facility_request_appointment(p_facility uuid, p_service text, p_preferred text, p_reason text default null, p_share_phone boolean default false) returns text language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_auth(); ref text; fname text;
begin
  if not public.facility_is_partner(p_facility) then raise exception 'PP409: cet établissement ne reçoit pas encore de demandes par SantéProxi : appelez-le directement'; end if;
  if (select count(*) from public.facility_appointment_requests where patient_id = uid and status in ('envoyee', 'proposee')) >= 5 then raise exception 'PP429: 5 demandes en attente au maximum'; end if;
  insert into public.facility_appointment_requests (facility_id, patient_id, service, preferred, reason, share_phone)
  values (p_facility, uid, btrim(p_service), btrim(p_preferred), nullif(btrim(coalesce(p_reason, '')), ''), coalesce(p_share_phone, false))
  returning reference into ref;
  select name into fname from public.facility_listings where id = p_facility;
  insert into public.notifications (user_id, kind, title, body, link)
    select m.user_id, 'rendez_vous', 'Nouvelle demande de rendez-vous', ref || ' — ' || btrim(p_service), '/etablissements/espace' from public.facility_partner_members m where m.facility_id = p_facility and m.active;
  return ref;
exception when check_violation then raise exception 'PP422: indiquez le service et vos disponibilités';
end $$;
revoke execute on function public.facility_request_appointment(uuid, text, text, text, boolean) from public, anon;
grant execute on function public.facility_request_appointment(uuid, text, text, text, boolean) to authenticated;

create or replace function public.facility_appointment_inbox(p_facility uuid)
returns table (id uuid, reference text, patient text, phone text, service text, reason text, preferred text, status text, proposed_at timestamptz, facility_message text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_facility_partner(p_facility) then raise exception 'PP403: accès refusé' using errcode = '42501'; end if;
  return query select r.id, r.reference, split_part(btrim(p.full_name), ' ', 1) || coalesce(' ' || left(nullif(split_part(btrim(p.full_name), ' ', 2), ''), 1) || '.', ''),
    case when r.share_phone then p.phone end, r.service, r.reason, r.preferred, r.status, r.proposed_at, r.facility_message, r.created_at
  from public.facility_appointment_requests r join public.profiles p on p.id = r.patient_id where r.facility_id = p_facility order by r.created_at desc limit 200;
end $$;
revoke execute on function public.facility_appointment_inbox(uuid) from public, anon;
grant execute on function public.facility_appointment_inbox(uuid) to authenticated;

create or replace function public.facility_appointment_action(p_id uuid, p_action text, p_at timestamptz default null, p_message text default null) returns void language plpgsql security definer set search_path = public as $$
declare r public.facility_appointment_requests; is_p boolean; msg text;
begin
  select * into r from public.facility_appointment_requests where id = p_id for update;
  if r.id is null then raise exception 'PP404: demande introuvable'; end if;
  is_p := public.is_facility_partner(r.facility_id);
  if p_action = 'proposer' and is_p and r.status in ('envoyee', 'proposee') then
    if p_at is null or p_at < now() then raise exception 'PP422: proposez une date et une heure à venir'; end if;
    update public.facility_appointment_requests set status = 'proposee', proposed_at = p_at, facility_message = nullif(btrim(coalesce(p_message, '')), ''), updated_at = now() where id = r.id;
    msg := 'L''établissement vous propose un rendez-vous';
  elsif p_action = 'refuser' and is_p and r.status in ('envoyee', 'proposee') then
    if char_length(btrim(coalesce(p_message, ''))) < 5 then raise exception 'PP422: indiquez la raison au patient'; end if;
    update public.facility_appointment_requests set status = 'refusee', facility_message = btrim(p_message), updated_at = now() where id = r.id; msg := 'Votre demande de rendez-vous n''a pas pu être acceptée';
  elsif p_action in ('honoree', 'non_venu') and is_p and r.status = 'confirmee' then
    update public.facility_appointment_requests set status = p_action, updated_at = now() where id = r.id;
  elsif p_action = 'confirmer' and r.patient_id = auth.uid() and r.status = 'proposee' then
    if r.proposed_at < now() then raise exception 'PP410: créneau dépassé : faites une nouvelle demande'; end if;
    update public.facility_appointment_requests set status = 'confirmee', updated_at = now() where id = r.id;
    insert into public.notifications (user_id, kind, title, body, link)
      select m.user_id, 'rendez_vous', 'Rendez-vous confirmé par le patient', r.reference, '/etablissements/espace' from public.facility_partner_members m where m.facility_id = r.facility_id and m.active;
  elsif p_action = 'annuler' and r.patient_id = auth.uid() and r.status in ('envoyee', 'proposee', 'confirmee') then
    update public.facility_appointment_requests set status = 'annulee', updated_at = now() where id = r.id;
  else raise exception 'PP409: action impossible'; end if;
  if msg is not null then
    insert into public.notifications (user_id, kind, title, body, link) values (r.patient_id, 'rendez_vous', msg, r.reference, '/compte/rendez-vous-etablissements');
  end if;
end $$;
revoke execute on function public.facility_appointment_action(uuid, text, timestamptz, text) from public, anon;
grant execute on function public.facility_appointment_action(uuid, text, timestamptz, text) to authenticated;

-- Phase 3 : orientation par niveau à partir d'un cercle, ou d'une commune du District de Bamako (sans cercle)
create or replace function public.orientation_levels(p_region uuid, p_circle uuid default null, p_commune uuid default null)
returns table (level int, level_label text, id uuid, name text, kind text, place text, phone text, is_partner boolean, is_reference boolean)
language sql stable security definer set search_path = public as $$
  with z as (select coalesce((select region_id from public.circles where id = p_circle), p_region) reg),
  base as (
    select f.*, coalesce(m.name, f.locality) place_name from public.facility_listings f left join public.communes m on m.id = f.commune_id
    where f.is_published and f.claimed_clinic_id is null),
  loc as (select b.* from base b, z where b.region_id = z.reg and (p_circle is null or b.circle_id = p_circle)),
  nat as (select b.* from base b where b.kind = 'chu' or b.is_reference or (b.kind = 'hopital' and b.name ~* '(Hôpital du Mali|Luxembourg|Universitaire|dermatologie)'))
  (select 1, 'Premier contact : CSCom', l.id, l.name, l.kind, l.place_name, l.phone, public.facility_is_partner(l.id), l.is_reference
     from loc l where l.kind = 'cscom' and (p_circle is not null or p_commune is null or l.commune_id = p_commune) order by (l.commune_id = p_commune) desc nulls last, l.name limit 12)
  union all
  (select 2, 'Première référence : CSRéf', l.id, l.name, l.kind, l.place_name, l.phone, public.facility_is_partner(l.id), l.is_reference
     from loc l where l.kind = 'csref' order by (l.commune_id = p_commune) desc nulls last, l.name limit 6)
  union all
  (select 3, 'Deuxième référence : hôpital de la région', l.id, l.name, l.kind, l.place_name, l.phone, public.facility_is_partner(l.id), l.is_reference
     from base l, z where l.kind = 'hopital' and l.region_id = z.reg and l.id not in (select id from nat) order by l.name limit 6)
  union all
  (select 4, 'Troisième référence : CHU et centres de référence nationaux', n.id, n.name, n.kind, n.place_name, n.phone, public.facility_is_partner(n.id), n.is_reference
     from nat n order by n.is_reference desc, n.name limit 12)
$$;
grant execute on function public.orientation_levels(uuid, uuid, uuid) to anon, authenticated;

-- Phase 4 : couverture pour les autorités (activité de la plateforme, masquée sous le seuil)
create or replace function public.authority_territory() returns table (region text, circle text, fiches bigint, cscom bigint, csref bigint, hopitaux bigint, partenaires bigint, alertes_service bigint, demandes_rdv bigint)
language plpgsql security definer set search_path = public as $$
begin
  perform public.authority_require('territory:view');
  return query select r.name, c.name, count(f.id), count(f.id) filter (where f.kind = 'cscom'), count(f.id) filter (where f.kind = 'csref'), count(f.id) filter (where f.kind in ('hopital', 'chu')),
    count(f.id) filter (where public.facility_is_partner(f.id)),
    (select count(*) from public.facility_service_status s join public.facility_listings g on g.id = s.facility_id where g.circle_id = c.id and s.valid_until > now() and s.status <> 'fonctionne'),
    public.stat_mask((select count(*) from public.facility_appointment_requests a join public.facility_listings g on g.id = a.facility_id where g.circle_id = c.id and a.created_at > now() - interval '90 days'))
  from public.circles c join public.regions r on r.id = c.region_id left join public.facility_listings f on f.circle_id = c.id and f.is_published and f.claimed_clinic_id is null
  where c.official_code is not null group by r.name, c.name, c.id order by r.name, c.name;
end $$;
revoke execute on function public.authority_territory() from public, anon;
grant execute on function public.authority_territory() to authenticated;
