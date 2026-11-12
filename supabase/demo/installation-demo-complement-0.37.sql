-- SantéProxi — complément 0.37 pour le projet de démonstration (après le complément 0.36).
-- 0.36b — Les lieux de démonstration (source « DÉMO ») n'apparaissent jamais dans les filtres de l'annuaire national.
create or replace function public.directory_places()
returns table (level text, id uuid, parent_id uuid, name text, n bigint) language sql stable security definer set search_path = public as $$
  select 'region', r.id, null::uuid, r.name, (select count(*) from public.facility_listings f where f.region_id = r.id and f.is_published and f.claimed_clinic_id is null)
    from public.regions r
  union all
  select 'cercle', c.id, c.region_id, c.name, (select count(*) from public.facility_listings f where f.circle_id = c.id and f.is_published and f.claimed_clinic_id is null)
    from public.circles c
  union all
  select 'commune', m.id, coalesce(m.circle_id, m.region_id), m.name, (select count(*) from public.facility_listings f where f.commune_id = m.id and f.is_published and f.claimed_clinic_id is null)
    from public.communes m where coalesce(m.source, '') <> 'DÉMO'
  order by 1, 4;
$$;
grant execute on function public.directory_places() to anon, authenticated;
-- =============================================================================
-- SantéProxi 0.37 — Premiers secours & citoyens sauveteurs
-- * Organismes de formation présentés comme partenaires POTENTIELS tant qu'aucun accord n'est enregistré ;
--   aucun logo sans autorisation ; contacts repris uniquement des sites officiels.
-- * Demandes d'inscription / de mise en relation suivies (envoyée, en attente, confirmée, terminée, annulée) ;
--   lien direct vers le formulaire officiel quand l'organisme en a un.
-- * Badge « Citoyen sauveteur formé » : jamais automatique ; délivré seulement après validation par un membre
--   habilité de l'organisme formateur ou par l'administration ; vérifiable par QR code sans données personnelles.
-- * Sessions et campagnes publiées par les organismes après validation administrative.
-- * Compteur national calculé sur les attestations réellement vérifiées.
-- Migration additive. Retour arrière : drop des tables first_aid_*.
-- =============================================================================

create table if not exists public.first_aid_organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,60}$'),
  name text not null check (char_length(name) between 3 and 160),
  kind text not null check (kind in ('ong', 'service_public', 'organisme_formation', 'autre')),
  description text check (char_length(coalesce(description, '')) <= 1500),
  website text check (website is null or website ~ '^https?://'),
  phones text[] not null default '{}',
  email text,
  address text check (char_length(coalesce(address, '')) <= 300),
  coverage text check (char_length(coalesce(coverage, '')) <= 300),
  trainings text check (char_length(coalesce(trainings, '')) <= 1500),
  registration_url text check (registration_url is null or registration_url ~ '^https?://'),
  registration_label text,
  partnership_status text not null default 'potentiel' check (partnership_status in ('potentiel', 'en_discussion', 'accord_signe')),
  partnership_note text,
  logo_authorized boolean not null default false,
  source text not null check (char_length(source) between 3 and 300),
  source_url text check (source_url is null or source_url ~ '^https?://'),
  verified_at date,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.first_aid_organizations enable row level security;
drop policy if exists "pp_fa_org_read" on public.first_aid_organizations;
create policy "pp_fa_org_read" on public.first_aid_organizations for select to anon, authenticated using (published or public.is_admin());
revoke all on public.first_aid_organizations from anon, authenticated;
grant select on public.first_aid_organizations to anon, authenticated;

-- Membres habilités d'un organisme (attribués par l'administration) : publient des sessions, valident les formations
create table if not exists public.first_aid_org_members (
  organization_id uuid not null references public.first_aid_organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  active boolean not null default true,
  granted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);
alter table public.first_aid_org_members enable row level security;
drop policy if exists "pp_fa_members_read" on public.first_aid_org_members;
create policy "pp_fa_members_read" on public.first_aid_org_members for select to authenticated using (user_id = auth.uid() or public.is_admin());
revoke all on public.first_aid_org_members from anon, authenticated;
grant select on public.first_aid_org_members to authenticated;

create or replace function public.is_first_aid_trainer(p_org uuid) returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (select 1 from public.first_aid_org_members where organization_id = p_org and user_id = auth.uid() and active);
$$;
grant execute on function public.is_first_aid_trainer(uuid) to authenticated;

create table if not exists public.first_aid_courses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.first_aid_organizations(id) on delete cascade,
  title text not null check (char_length(title) between 3 and 160),
  description text check (char_length(coalesce(description, '')) <= 1000),
  region_id uuid references public.regions(id) on delete set null,
  place text check (char_length(coalesce(place, '')) <= 200),
  starts_on date not null,
  ends_on date,
  capacity int check (capacity is null or capacity between 1 and 1000),
  conditions text check (char_length(coalesce(conditions, '')) <= 500),
  registration_url text check (registration_url is null or registration_url ~ '^https?://'),
  status text not null default 'en_attente' check (status in ('en_attente', 'publiee', 'annulee', 'terminee', 'refusee')),
  created_by uuid references public.profiles(id) on delete set null,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.first_aid_courses enable row level security;
drop policy if exists "pp_fa_courses_read" on public.first_aid_courses;
create policy "pp_fa_courses_read" on public.first_aid_courses for select to anon, authenticated
  using (status in ('publiee', 'terminee') or public.is_first_aid_trainer(organization_id));
revoke all on public.first_aid_courses from anon, authenticated;
grant select on public.first_aid_courses to anon, authenticated;

create table if not exists public.first_aid_registrations (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('PS-' || upper(substr(md5(gen_random_uuid()::text), 1, 8))),
  user_id uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid not null references public.first_aid_organizations(id) on delete cascade,
  course_id uuid references public.first_aid_courses(id) on delete set null,
  region_id uuid references public.regions(id) on delete set null,
  locality text check (char_length(coalesce(locality, '')) <= 120),
  audience text check (audience in ('individuel', 'etudiant', 'eleve', 'entreprise', 'administration', 'association', 'autre')),
  message text check (char_length(coalesce(message, '')) <= 500),
  share_contact boolean not null default false,
  status text not null default 'envoyee' check (status in ('envoyee', 'en_attente', 'confirmee', 'terminee', 'annulee')),
  status_note text check (char_length(coalesce(status_note, '')) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.first_aid_registrations enable row level security;
drop policy if exists "pp_fa_reg_read" on public.first_aid_registrations;
create policy "pp_fa_reg_read" on public.first_aid_registrations for select to authenticated using (user_id = auth.uid() or public.is_first_aid_trainer(organization_id));
revoke all on public.first_aid_registrations from anon, authenticated;
grant select on public.first_aid_registrations to authenticated;

create table if not exists public.first_aid_certifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid not null references public.first_aid_organizations(id) on delete restrict,
  course_label text not null check (char_length(course_label) between 3 and 160),
  completed_on date not null,
  expires_on date,
  region_id uuid references public.regions(id) on delete set null,
  evidence_note text check (char_length(coalesce(evidence_note, '')) <= 300),
  status text not null default 'declaree' check (status in ('declaree', 'verifiee', 'non_confirmee')),
  decision_note text check (char_length(coalesce(decision_note, '')) <= 300),
  verify_token text not null unique default encode(extensions.gen_random_bytes(12), 'hex'),
  show_name boolean not null default false,
  verified_by uuid references public.profiles(id) on delete set null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_on is null or expires_on > completed_on)
);
alter table public.first_aid_certifications enable row level security;
drop policy if exists "pp_fa_cert_read" on public.first_aid_certifications;
create policy "pp_fa_cert_read" on public.first_aid_certifications for select to authenticated using (user_id = auth.uid() or public.is_first_aid_trainer(organization_id));
revoke all on public.first_aid_certifications from anon, authenticated;
grant select on public.first_aid_certifications to authenticated;

create table if not exists public.first_aid_campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.first_aid_organizations(id) on delete set null,
  title text not null check (char_length(title) between 3 and 160),
  description text check (char_length(coalesce(description, '')) <= 1000),
  audience text not null check (audience in ('universites', 'lycees', 'entreprises', 'administrations', 'quartiers', 'tous')),
  region_id uuid references public.regions(id) on delete set null,
  place text check (char_length(coalesce(place, '')) <= 200),
  starts_on date not null,
  ends_on date,
  status text not null default 'en_attente' check (status in ('en_attente', 'publiee', 'terminee', 'refusee')),
  created_by uuid references public.profiles(id) on delete set null,
  approved_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.first_aid_campaigns enable row level security;
drop policy if exists "pp_fa_camp_read" on public.first_aid_campaigns;
create policy "pp_fa_camp_read" on public.first_aid_campaigns for select to anon, authenticated
  using (status in ('publiee', 'terminee') or public.is_admin() or created_by = auth.uid());
revoke all on public.first_aid_campaigns from anon, authenticated;
grant select on public.first_aid_campaigns to anon, authenticated;

-- Organismes identifiés (partenaires POTENTIELS : aucun accord n'est enregistré). Contacts repris des sites officiels.
insert into public.first_aid_organizations (slug, name, kind, description, website, phones, email, address, coverage, trainings, registration_url, registration_label, partnership_status, source, source_url, verified_at)
values
  ('croix-rouge-malienne', 'Croix-Rouge malienne', 'ong',
   'Société nationale de la Croix-Rouge du Mali, fondée le 20 août 1965 sur la base des Conventions de Genève. Elle s''appuie sur un réseau de volontaires présents dans les régions.',
   'https://croix-rouge.ml', array['+22371701999', '+22363202345'], 'crmalienne@croix-rouge.ml', 'Djélibougou, rue 261, porte 02, route de Koulikoro, BP 280, Bamako',
   'Siège à Bamako ; activités dans les régions (cartographie publiée sur le site).',
   'Le calendrier et les modalités des formations aux premiers secours ne sont pas publiés sur le site : à demander directement à la Croix-Rouge malienne.',
   'https://volontariat.croix-rouge.ml/formulaire_d_inscription_adhesion', 'Formulaire officiel d''inscription / adhésion des volontaires', 'potentiel',
   'Site officiel de la Croix-Rouge malienne (pages « Nous contacter » et accueil), consulté le 12/11/2026', 'https://croix-rouge.ml/nous-contacter/', '2026-11-12'),
  ('protection-civile-mali', 'Direction générale de la Protection civile (sapeurs-pompiers)', 'service_public',
   'Service public chargé de la protection des personnes et des biens. Son site indique : « Acteur majeur de la formation aux premiers secours, la Protection Civile forme plus de 50 000 personnes chaque année ».',
   'https://dgpc.gouv.ml', '{}', null, null, 'National',
   'Le site présente l''École nationale de protection civile (ENPC). Les modalités d''inscription du public aux formations de secourisme ne sont pas publiées : à demander à la Protection civile.',
   null, null, 'potentiel', 'Site officiel de la Direction générale de la Protection civile, consulté le 12/11/2026', 'https://dgpc.gouv.ml/', '2026-11-12')
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
create or replace function public.first_aid_register(p jsonb) returns text language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_auth(); org uuid := nullif(p ->> 'organization_id', '')::uuid; crs uuid := nullif(p ->> 'course_id', '')::uuid; ref text;
begin
  if not exists (select 1 from public.first_aid_organizations where id = org and published) then raise exception 'PP404: organisme introuvable'; end if;
  if crs is not null and not exists (select 1 from public.first_aid_courses where id = crs and organization_id = org and status = 'publiee' and starts_on >= current_date) then
    raise exception 'PP409: cette session n''est plus ouverte'; end if;
  if exists (select 1 from public.first_aid_registrations where user_id = uid and organization_id = org and coalesce(course_id, '00000000-0000-0000-0000-000000000000') = coalesce(crs, '00000000-0000-0000-0000-000000000000') and status in ('envoyee', 'en_attente', 'confirmee')) then
    raise exception 'PP409: vous avez déjà une demande en cours auprès de cet organisme'; end if;
  insert into public.first_aid_registrations (user_id, organization_id, course_id, region_id, locality, audience, message, share_contact)
  values (uid, org, crs, nullif(p ->> 'region_id', '')::uuid, nullif(btrim(coalesce(p ->> 'locality', '')), ''), coalesce(nullif(p ->> 'audience', ''), 'individuel'),
    nullif(btrim(coalesce(p ->> 'message', '')), ''), coalesce((p ->> 'share_contact')::boolean, false))
  returning reference into ref;
  insert into public.notifications (user_id, kind, title, body, link)
  select m.user_id, 'premiers_secours', 'Nouvelle demande de formation', ref, '/premiers-secours/espace-formateur' from public.first_aid_org_members m where m.organization_id = org and m.active;
  return ref;
exception when check_violation then raise exception 'PP422: vérifiez les champs de la demande';
end $$;
revoke execute on function public.first_aid_register(jsonb) from public, anon;
grant execute on function public.first_aid_register(jsonb) to authenticated;

create or replace function public.first_aid_set_registration(p_id uuid, p_status text, p_note text default null) returns void language plpgsql security definer set search_path = public as $$
declare r public.first_aid_registrations;
begin
  select * into r from public.first_aid_registrations where id = p_id for update;
  if r.id is null then raise exception 'PP404: demande introuvable'; end if;
  if not (public.is_first_aid_trainer(r.organization_id) or (r.user_id = auth.uid() and p_status = 'annulee')) then raise exception 'PP403: réservé à l''organisme formateur' using errcode = '42501'; end if;
  if p_status not in ('en_attente', 'confirmee', 'terminee', 'annulee') then raise exception 'PP422: statut invalide'; end if;
  update public.first_aid_registrations set status = p_status, status_note = nullif(btrim(coalesce(p_note, '')), ''), updated_at = now() where id = p_id;
  if r.user_id <> auth.uid() then
    insert into public.notifications (user_id, kind, title, body, link)
    values (r.user_id, 'premiers_secours', 'Votre demande de formation : ' || case p_status when 'en_attente' then 'en attente' when 'confirmee' then 'confirmée' when 'terminee' then 'formation terminée' else 'annulée' end,
      r.reference || coalesce(' — ' || nullif(btrim(coalesce(p_note, '')), ''), ''), '/premiers-secours/formations#mes-demandes');
  end if;
end $$;
revoke execute on function public.first_aid_set_registration(uuid, text, text) from public, anon;
grant execute on function public.first_aid_set_registration(uuid, text, text) to authenticated;

-- Coordonnées d'un demandeur : seulement pour l'organisme, et seulement si le demandeur l'a accepté
create or replace function public.first_aid_registrations_for_org(p_org uuid)
returns table (id uuid, reference text, course text, region text, locality text, audience text, message text, status text, created_at timestamptz, name text, phone text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_first_aid_trainer(p_org) then raise exception 'PP403: réservé à l''organisme formateur' using errcode = '42501'; end if;
  return query select r.id, r.reference, c.title, g.name, r.locality, r.audience, r.message, r.status, r.created_at,
      case when r.share_contact then p.full_name end, case when r.share_contact then p.phone end
    from public.first_aid_registrations r join public.profiles p on p.id = r.user_id left join public.first_aid_courses c on c.id = r.course_id left join public.regions g on g.id = r.region_id
   where r.organization_id = p_org order by r.created_at desc limit 300;
end $$;
revoke execute on function public.first_aid_registrations_for_org(uuid) from public, anon;
grant execute on function public.first_aid_registrations_for_org(uuid) to authenticated;

-- Déclaration d'une formation suivie (le badge n'existe qu'après vérification par l'organisme)
create or replace function public.first_aid_declare(p jsonb) returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_auth(); v uuid; d date := nullif(p ->> 'completed_on', '')::date;
begin
  if d is null or d > current_date or d < current_date - interval '15 years' then raise exception 'PP422: date de formation invalide'; end if;
  if (select count(*) from public.first_aid_certifications where user_id = uid and status = 'declaree') >= 3 then raise exception 'PP429: 3 déclarations en attente au plus'; end if;
  insert into public.first_aid_certifications (user_id, organization_id, course_label, completed_on, region_id, evidence_note, show_name)
  values (uid, (p ->> 'organization_id')::uuid, btrim(p ->> 'course_label'), d, nullif(p ->> 'region_id', '')::uuid, nullif(btrim(coalesce(p ->> 'evidence_note', '')), ''),
    coalesce((p ->> 'show_name')::boolean, false))
  returning id into v;
  insert into public.notifications (user_id, kind, title, body, link)
  select m.user_id, 'premiers_secours', 'Formation à vérifier', btrim(p ->> 'course_label'), '/premiers-secours/espace-formateur' from public.first_aid_org_members m where m.organization_id = (p ->> 'organization_id')::uuid and m.active;
  return v;
exception when check_violation or foreign_key_violation then raise exception 'PP422: vérifiez l''organisme, l''intitulé (3 caractères au moins) et la date';
end $$;
revoke execute on function public.first_aid_declare(jsonb) from public, anon;
grant execute on function public.first_aid_declare(jsonb) to authenticated;

create or replace function public.first_aid_verify(p_id uuid, p_decision text, p_expires date default null, p_note text default null) returns void language plpgsql security definer set search_path = public as $$
declare c public.first_aid_certifications;
begin
  select * into c from public.first_aid_certifications where id = p_id for update;
  if c.id is null then raise exception 'PP404: déclaration introuvable'; end if;
  if not public.is_first_aid_trainer(c.organization_id) then raise exception 'PP403: seul l''organisme formateur (ou l''administration) peut valider une formation' using errcode = '42501'; end if;
  if c.user_id = auth.uid() then raise exception 'PP403: vous ne pouvez pas valider votre propre formation'; end if;
  if p_decision not in ('verifiee', 'non_confirmee') then raise exception 'PP422: décision invalide'; end if;
  if p_decision = 'non_confirmee' and char_length(btrim(coalesce(p_note, ''))) < 5 then raise exception 'PP422: indiquez le motif'; end if;
  update public.first_aid_certifications set status = p_decision, expires_on = coalesce(p_expires, expires_on), decision_note = nullif(btrim(coalesce(p_note, '')), ''),
    verified_by = auth.uid(), verified_at = now() where id = p_id;
  perform public.log_audit('first_aid.' || p_decision, 'first_aid_certification', p_id::text);
  insert into public.notifications (user_id, kind, title, body, link)
  values (c.user_id, 'premiers_secours', case p_decision when 'verifiee' then 'Badge « Citoyen sauveteur formé » délivré' else 'Formation non confirmée par l''organisme' end,
    c.course_label || coalesce(' — ' || nullif(btrim(coalesce(p_note, '')), ''), ''), '/premiers-secours/badge');
exception when check_violation then raise exception 'PP422: la date d''expiration doit suivre la date de formation';
end $$;
revoke execute on function public.first_aid_verify(uuid, text, date, text) from public, anon;
grant execute on function public.first_aid_verify(uuid, text, date, text) to authenticated;

create or replace function public.first_aid_set_show_name(p_id uuid, p_show boolean, p_renew boolean default false) returns void language plpgsql security definer set search_path = public as $$
begin
  update public.first_aid_certifications set show_name = coalesce(p_show, false),
    verify_token = case when p_renew then encode(extensions.gen_random_bytes(12), 'hex') else verify_token end
   where id = p_id and user_id = auth.uid();
  if not found then raise exception 'PP404: badge introuvable'; end if;
end $$;
revoke execute on function public.first_aid_set_show_name(uuid, boolean, boolean) from public, anon;
grant execute on function public.first_aid_set_show_name(uuid, boolean, boolean) to authenticated;

-- Vérification publique du badge (QR code) : aucune donnée personnelle, sauf prénom et initiale si le titulaire l'a accepté
create or replace function public.first_aid_badge_lookup(p_token text) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('status', case when c.status <> 'verifiee' then c.status when c.expires_on is not null and c.expires_on < current_date then 'expiree' else 'valide' end,
    'organisation', o.name, 'formation', c.course_label, 'date_formation', c.completed_on, 'expiration', c.expires_on, 'verifie_le', c.verified_at::date,
    'titulaire', case when c.show_name then split_part(btrim(p.full_name), ' ', 1) || coalesce(' ' || left(nullif(split_part(btrim(p.full_name), ' ', 2), ''), 1) || '.', '') end,
    'identifiant', upper(left(c.verify_token, 8)))
  from public.first_aid_certifications c join public.first_aid_organizations o on o.id = c.organization_id join public.profiles p on p.id = c.user_id
  where c.verify_token = p_token and c.status in ('verifiee');
$$;
grant execute on function public.first_aid_badge_lookup(text) to anon, authenticated;

-- Sessions et campagnes : proposées par l'organisme, publiées après validation de l'administration
create or replace function public.first_aid_propose_course(p jsonb) returns uuid language plpgsql security definer set search_path = public as $$
declare v uuid; org uuid := (p ->> 'organization_id')::uuid;
begin
  if not public.is_first_aid_trainer(org) then raise exception 'PP403: réservé aux organismes habilités' using errcode = '42501'; end if;
  if nullif(p ->> 'starts_on', '')::date < current_date then raise exception 'PP422: la session doit être à venir'; end if;
  insert into public.first_aid_courses (organization_id, title, description, region_id, place, starts_on, ends_on, capacity, conditions, registration_url, created_by, status, approved_by, approved_at)
  values (org, btrim(p ->> 'title'), nullif(btrim(coalesce(p ->> 'description', '')), ''), nullif(p ->> 'region_id', '')::uuid, nullif(btrim(coalesce(p ->> 'place', '')), ''),
    (p ->> 'starts_on')::date, nullif(p ->> 'ends_on', '')::date, nullif(p ->> 'capacity', '')::int, nullif(btrim(coalesce(p ->> 'conditions', '')), ''), nullif(btrim(coalesce(p ->> 'registration_url', '')), ''),
    auth.uid(), case when public.is_admin() then 'publiee' else 'en_attente' end, case when public.is_admin() then auth.uid() end, case when public.is_admin() then now() end)
  returning id into v;
  return v;
exception when check_violation or invalid_text_representation then raise exception 'PP422: vérifiez l''intitulé, les dates, la capacité et le lien';
end $$;
revoke execute on function public.first_aid_propose_course(jsonb) from public, anon;
grant execute on function public.first_aid_propose_course(jsonb) to authenticated;

create or replace function public.first_aid_propose_campaign(p jsonb) returns uuid language plpgsql security definer set search_path = public as $$
declare v uuid; org uuid := nullif(p ->> 'organization_id', '')::uuid;
begin
  if not (public.is_admin() or (org is not null and public.is_first_aid_trainer(org))) then raise exception 'PP403: réservé aux organismes habilités' using errcode = '42501'; end if;
  insert into public.first_aid_campaigns (organization_id, title, description, audience, region_id, place, starts_on, ends_on, created_by, status, approved_by)
  values (org, btrim(p ->> 'title'), nullif(btrim(coalesce(p ->> 'description', '')), ''), p ->> 'audience', nullif(p ->> 'region_id', '')::uuid, nullif(btrim(coalesce(p ->> 'place', '')), ''),
    (p ->> 'starts_on')::date, nullif(p ->> 'ends_on', '')::date, auth.uid(), case when public.is_admin() then 'publiee' else 'en_attente' end, case when public.is_admin() then auth.uid() end)
  returning id into v;
  return v;
exception when check_violation or invalid_text_representation then raise exception 'PP422: vérifiez l''intitulé, le public et les dates';
end $$;
revoke execute on function public.first_aid_propose_campaign(jsonb) from public, anon;
grant execute on function public.first_aid_propose_campaign(jsonb) to authenticated;

create or replace function public.admin_first_aid_moderate(p_table text, p_id uuid, p_status text) returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  if p_table = 'course' and p_status in ('publiee', 'refusee', 'annulee', 'terminee') then
    update public.first_aid_courses set status = p_status, approved_by = auth.uid(), approved_at = now() where id = p_id;
  elsif p_table = 'campaign' and p_status in ('publiee', 'refusee', 'terminee') then
    update public.first_aid_campaigns set status = p_status, approved_by = auth.uid() where id = p_id;
  else raise exception 'PP422: requête invalide'; end if;
  perform public.log_audit('first_aid.' || p_table || '.' || p_status, 'first_aid_' || p_table, p_id::text);
end $$;
revoke execute on function public.admin_first_aid_moderate(text, uuid, text) from public, anon;
grant execute on function public.admin_first_aid_moderate(text, uuid, text) to authenticated;

create or replace function public.admin_first_aid_org(p_id uuid, p_status text, p_note text, p_published boolean, p_member_email text default null, p_remove_member uuid default null) returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_admin(); m uuid;
begin
  update public.first_aid_organizations set partnership_status = coalesce(p_status, partnership_status), partnership_note = coalesce(nullif(btrim(coalesce(p_note, '')), ''), partnership_note),
    published = coalesce(p_published, published), updated_at = now() where id = p_id;
  if p_status = 'accord_signe' and char_length(btrim(coalesce(p_note, ''))) < 5 then raise exception 'PP422: un accord signé doit être référencé (date, signataires)'; end if;
  if nullif(btrim(coalesce(p_member_email, '')), '') is not null then
    select id into m from auth.users where lower(email) = lower(btrim(p_member_email));
    if m is null then raise exception 'PP404: aucun compte avec cette adresse'; end if;
    insert into public.first_aid_org_members (organization_id, user_id, granted_by) values (p_id, m, uid) on conflict (organization_id, user_id) do update set active = true;
  end if;
  if p_remove_member is not null then update public.first_aid_org_members set active = false where organization_id = p_id and user_id = p_remove_member; end if;
  perform public.log_audit('first_aid.organization', 'first_aid_organization', p_id::text, jsonb_build_object('status', p_status));
exception when check_violation then raise exception 'PP422: statut invalide';
end $$;
revoke execute on function public.admin_first_aid_org(uuid, text, text, boolean, text, uuid) from public, anon;
grant execute on function public.admin_first_aid_org(uuid, text, text, boolean, text, uuid) to authenticated;

-- Compteur national : uniquement des attestations vérifiées, des sessions publiées et des accords enregistrés
create or replace function public.first_aid_stats() returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'citoyens_formes_verifies', (select count(distinct user_id) from public.first_aid_certifications where status = 'verifiee' and (expires_on is null or expires_on >= current_date)),
    'formations_organisees', (select count(*) from public.first_aid_courses where status in ('publiee', 'terminee')),
    'organismes_partenaires', (select count(*) from public.first_aid_organizations where published and partnership_status = 'accord_signe'),
    'organismes_identifies', (select count(*) from public.first_aid_organizations where published),
    'regions_couvertes', (select count(distinct region_id) from public.first_aid_certifications where status = 'verifiee' and region_id is not null),
    'par_region', (select coalesce(jsonb_object_agg(r.name, n), '{}'::jsonb) from (select region_id, count(distinct user_id) n from public.first_aid_certifications where status = 'verifiee' and region_id is not null group by 1) x join public.regions r on r.id = x.region_id));
$$;
grant execute on function public.first_aid_stats() to anon, authenticated;
