-- SantéProxi — complément 0.31 pour le projet de démonstration (à exécuter après les parties 1 à 5 et le complément 0.28).
-- Contenu identique à la migration 20261111000200 ; aucune donnée réelle.
-- =============================================================================
-- SantéProxi 0.31 — Espace infirmier : inscription vérifiée, fiche publique, demandes de soins à domicile.
-- Migration additive. Les demandes de soins sont des données de santé : seuls le patient et l'infirmier
-- destinataire peuvent les lire (l'administration n'y a pas accès).
-- Retour arrière : drop table public.home_care_requests, public.nurse_documents, public.nurse_accounts cascade ;
--   puis restaurer can_upload_directory_doc / can_read_directory_doc depuis 20261027000100_medical_directory.sql.
-- =============================================================================

create table if not exists public.nurse_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  register_id uuid references public.nurse_register(id) on delete set null,     -- ligne du tableau de l'Ordre, si retrouvée
  display_name text not null check (char_length(btrim(display_name)) between 3 and 120),
  registration_number text not null check (char_length(btrim(registration_number)) between 2 and 40),
  specialty text check (char_length(coalesce(specialty, '')) <= 160),
  region_id uuid references public.regions(id) on delete set null,
  commune_id uuid references public.communes(id) on delete set null,
  areas text check (char_length(coalesce(areas, '')) <= 300),                   -- quartiers desservis
  care_types text[] not null default '{}' check (care_types <@ array['soins_infirmiers', 'pansements', 'injections', 'perfusions', 'post_operatoire',
    'maladies_chroniques', 'personnes_agees', 'prelevements', 'consultation', 'assistance', 'kinesitherapie', 'nursing']::text[]),
  hours text check (char_length(coalesce(hours, '')) <= 200),
  prices text check (char_length(coalesce(prices, '')) <= 300),                 -- tarifs communiqués par l'infirmier
  phone text check (phone is null or public.valid_phone(phone)),
  phone_public boolean not null default false,
  accepts_requests boolean not null default true,
  status public.pharmacy_status not null default 'pending',
  status_reason text check (char_length(coalesce(status_reason, '')) <= 500),
  is_published boolean not null default false,
  publication_consent_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not phone_public or phone is not null),
  check (not is_published or (status = 'verified' and publication_consent_at is not null))
);
alter table public.nurse_accounts enable row level security;
drop policy if exists "pp_nurse_accounts_read" on public.nurse_accounts;
create policy "pp_nurse_accounts_read" on public.nurse_accounts for select to anon, authenticated using (is_published or user_id = auth.uid() or public.is_admin());
revoke all on public.nurse_accounts from anon, authenticated;
-- Colonnes publiques seulement : le téléphone et les motifs ne sont lus que par les fonctions ci-dessous
grant select (id, display_name, specialty, region_id, commune_id, areas, care_types, hours, prices, accepts_requests, status, is_published, verified_at, register_id) on public.nurse_accounts to anon, authenticated;

create or replace function public.nurse_me() returns setof public.nurse_accounts language sql stable security definer set search_path = public as $$
  select * from public.nurse_accounts where user_id = auth.uid();
$$;
revoke execute on function public.nurse_me() from public, anon;
grant execute on function public.nurse_me() to authenticated;

create or replace function public.admin_nurse_accounts()
returns table (id uuid, display_name text, registration_number text, specialty text, status text, status_reason text, register_match boolean,
  register_name text, register_year smallint, phone text, created_at timestamptz, documents int)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_admin();
  return query select n.id, n.display_name, n.registration_number, n.specialty, n.status::text, n.status_reason, n.register_id is not null,
    nullif(btrim(coalesce(r.last_name, '') || ' ' || coalesce(r.first_name, '')), ''), r.register_year, n.phone, n.created_at,
    (select count(*)::int from public.nurse_documents d where d.nurse_id = n.id)
  from public.nurse_accounts n left join public.nurse_register r on r.id = n.register_id
  order by (n.status = 'pending') desc, n.created_at desc;
end $$;
revoke execute on function public.admin_nurse_accounts() from public, anon;
grant execute on function public.admin_nurse_accounts() to authenticated;

-- Le téléphone n'est lisible publiquement que si l'infirmier l'a accepté
create or replace function public.nurse_public_phone(p_id uuid) returns text language sql stable security definer set search_path = public as $$
  select phone from public.nurse_accounts where id = p_id and is_published and phone_public;
$$;
grant execute on function public.nurse_public_phone(uuid) to anon, authenticated;

create or replace function public.owns_nurse_account(p_nurse uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.nurse_accounts where id = p_nurse and user_id = auth.uid());
$$;
grant execute on function public.owns_nurse_account(uuid) to authenticated;

create table if not exists public.nurse_documents (
  id uuid primary key default gen_random_uuid(),
  nurse_id uuid not null references public.nurse_accounts(id) on delete cascade,
  doc_type text not null check (doc_type in ('inscription_ordre', 'diplome', 'piece_identite', 'autre')),
  storage_path text not null unique,
  file_name text check (char_length(file_name) <= 200),
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.nurse_documents enable row level security;
drop policy if exists "pp_nurse_docs_rw" on public.nurse_documents;
create policy "pp_nurse_docs_rw" on public.nurse_documents for all to authenticated
  using (public.is_admin() or public.owns_nurse_account(nurse_id))
  with check (public.owns_nurse_account(nurse_id));
revoke all on public.nurse_documents from anon, authenticated;
grant select, insert, delete on public.nurse_documents to authenticated;

-- Justificatifs stockés comme ceux des médecins (dossier nurse/<id>/)
create or replace function public.can_upload_directory_doc(p_name text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare parts text[] := storage.foldername(p_name); oid uuid;
begin
  if parts is null or array_length(parts, 1) < 2 then return false; end if;
  begin oid := parts[2]::uuid; exception when others then return false; end;
  if parts[1] = 'doctor' then
    return exists (select 1 from public.doctors where id = oid and user_id = auth.uid() and status <> 'suspended');
  elsif parts[1] = 'clinic' then
    return public.can_manage_clinic(oid) and public.is_clinic_owner(oid);
  elsif parts[1] = 'nurse' then
    return exists (select 1 from public.nurse_accounts where id = oid and user_id = auth.uid() and status <> 'suspended');
  end if;
  return false;
end $$;
create or replace function public.can_read_directory_doc(p_name text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare parts text[] := storage.foldername(p_name); oid uuid;
begin
  if public.is_admin() then return true; end if;
  if parts is null or array_length(parts, 1) < 2 then return false; end if;
  begin oid := parts[2]::uuid; exception when others then return false; end;
  if parts[1] = 'doctor' then return exists (select 1 from public.doctors where id = oid and user_id = auth.uid()); end if;
  if parts[1] = 'clinic' then return public.is_clinic_member(oid); end if;
  if parts[1] = 'nurse' then return exists (select 1 from public.nurse_accounts where id = oid and user_id = auth.uid()); end if;
  return false;
end $$;

-- Inscription et mise à jour par l'infirmier
create or replace function public.nurse_register_self(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); v_id uuid; v_reg uuid; nm text := btrim(coalesce(p ->> 'display_name', '')); num text := btrim(coalesce(p ->> 'registration_number', ''));
begin
  if uid is null then raise exception 'PP401: connexion requise'; end if;
  if exists (select 1 from public.nurse_accounts where user_id = uid) then raise exception 'PP409: vous avez déjà un espace infirmier'; end if;
  if p ->> 'consent' is distinct from 'true' then raise exception 'PP422: votre accord est nécessaire pour publier votre fiche après vérification'; end if;
  select id into v_reg from public.nurse_register where num <> '' and public.normalize_text(registration_number) = public.normalize_text(num) limit 1;
  insert into public.nurse_accounts (user_id, register_id, display_name, registration_number, specialty, region_id, commune_id, publication_consent_at)
  values (uid, v_reg, nm, num, nullif(btrim(coalesce(p ->> 'specialty', '')), ''), nullif(p ->> 'region_id', '')::uuid, nullif(p ->> 'commune_id', '')::uuid, now())
  returning id into v_id;
  perform public.log_audit('nurse.register', 'nurse', v_id::text, jsonb_build_object('register_match', v_reg is not null));
  insert into public.notifications (user_id, kind, title, body, link)
  select user_id, 'info', 'Nouvelle inscription d''infirmier à vérifier', nm, '/admin/infirmiers/comptes' from public.user_roles where role = 'admin';
  return v_id;
end $$;
revoke execute on function public.nurse_register_self(jsonb) from public, anon;
grant execute on function public.nurse_register_self(jsonb) to authenticated;

create or replace function public.nurse_update_self(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare n public.nurse_accounts; ph text := nullif(btrim(coalesce(p ->> 'phone', '')), ''); pub boolean := coalesce((p ->> 'phone_public')::boolean, false);
begin
  select * into n from public.nurse_accounts where user_id = auth.uid() for update;
  if n.id is null then raise exception 'PP404: aucun espace infirmier'; end if;
  if n.status = 'suspended' then raise exception 'PP403: espace suspendu'; end if;
  if pub and ph is null then raise exception 'PP422: indiquez un numéro pour pouvoir l''afficher'; end if;
  update public.nurse_accounts set
    specialty = nullif(btrim(coalesce(p ->> 'specialty', '')), ''), region_id = nullif(p ->> 'region_id', '')::uuid, commune_id = nullif(p ->> 'commune_id', '')::uuid,
    areas = nullif(btrim(coalesce(p ->> 'areas', '')), ''), care_types = coalesce(array(select jsonb_array_elements_text(p -> 'care_types')), '{}'),
    hours = nullif(btrim(coalesce(p ->> 'hours', '')), ''), prices = nullif(btrim(coalesce(p ->> 'prices', '')), ''),
    phone = ph, phone_public = pub, accepts_requests = coalesce((p ->> 'accepts_requests')::boolean, true),
    is_published = case when n.status = 'verified' then coalesce((p ->> 'published')::boolean, n.is_published) else false end,
    updated_at = now()
  where id = n.id;
end $$;
revoke execute on function public.nurse_update_self(jsonb) from public, anon;
grant execute on function public.nurse_update_self(jsonb) to authenticated;

-- Vérification par l'administration (justificatifs + tableau de l'Ordre)
create or replace function public.admin_review_nurse(p_id uuid, p_decision text, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare n public.nurse_accounts;
begin
  perform public.require_admin();
  if p_decision not in ('verified', 'rejected', 'suspended') then raise exception 'PP422: décision invalide'; end if;
  if p_decision <> 'verified' and char_length(btrim(coalesce(p_reason, ''))) < 5 then raise exception 'PP422: indiquez le motif'; end if;
  update public.nurse_accounts set status = p_decision::public.pharmacy_status, status_reason = nullif(btrim(coalesce(p_reason, '')), ''),
    verified_at = case when p_decision = 'verified' then now() else verified_at end,
    is_published = (p_decision = 'verified' and publication_consent_at is not null), updated_at = now()
  where id = p_id returning * into n;
  if n.id is null then raise exception 'PP404: inscription introuvable'; end if;
  perform public.log_audit('nurse.review', 'nurse', p_id::text, jsonb_build_object('decision', p_decision));
  insert into public.notifications (user_id, kind, title, body, link)
  values (n.user_id, 'info', case p_decision when 'verified' then 'Votre espace infirmier est vérifié' when 'rejected' then 'Votre inscription d''infirmier n''a pas été validée' else 'Votre espace infirmier est suspendu' end,
          coalesce(n.status_reason, 'Votre fiche est maintenant visible dans l''annuaire des soins à domicile.'), '/infirmier');
end $$;
revoke execute on function public.admin_review_nurse(uuid, text, text) from public, anon;
grant execute on function public.admin_review_nurse(uuid, text, text) to authenticated;

-- Demandes de soins à domicile
create table if not exists public.home_care_requests (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('SAD-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(md5(gen_random_uuid()::text), 1, 5))),
  patient_id uuid not null references public.profiles(id) on delete cascade,
  nurse_id uuid not null references public.nurse_accounts(id) on delete cascade,
  care_type text not null check (care_type in ('soins_infirmiers', 'pansements', 'injections', 'perfusions', 'post_operatoire',
    'maladies_chroniques', 'personnes_agees', 'prelevements', 'consultation', 'assistance', 'kinesitherapie', 'nursing')),
  preferred_date date not null,
  preferred_slot text not null check (preferred_slot in ('matin', 'apres_midi', 'soir')),
  area text not null check (char_length(btrim(area)) between 2 and 160),
  contact_phone text not null check (public.valid_phone(contact_phone)),
  message text check (char_length(coalesce(message, '')) <= 500),
  has_prescription boolean not null default false,
  status text not null default 'demande' check (status in ('demande', 'acceptee', 'refusee', 'annulee', 'terminee')),
  nurse_reply text check (char_length(coalesce(nurse_reply, '')) <= 500),
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists home_care_requests_nurse on public.home_care_requests (nurse_id, status, preferred_date);
create index if not exists home_care_requests_patient on public.home_care_requests (patient_id, created_at desc);
alter table public.home_care_requests enable row level security;
drop policy if exists "pp_hcr_read" on public.home_care_requests;
create policy "pp_hcr_read" on public.home_care_requests for select to authenticated
  using (patient_id = auth.uid() or public.owns_nurse_account(nurse_id));
revoke all on public.home_care_requests from anon, authenticated;
grant select on public.home_care_requests to authenticated;

create or replace function public.request_home_care(p jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); n public.nurse_accounts; r public.home_care_requests; d date := nullif(p ->> 'preferred_date', '')::date;
begin
  if uid is null then raise exception 'PP401: connexion requise'; end if;
  select * into n from public.nurse_accounts where id = nullif(p ->> 'nurse_id', '')::uuid;
  if n.id is null or not n.is_published or n.status <> 'verified' then raise exception 'PP404: cet infirmier ne reçoit pas de demande en ligne'; end if;
  if not n.accepts_requests then raise exception 'PP409: cet infirmier ne prend pas de nouvelles demandes pour le moment'; end if;
  if n.user_id = uid then raise exception 'PP422: vous ne pouvez pas vous adresser une demande'; end if;
  if d is null or d < current_date or d > current_date + 60 then raise exception 'PP422: choisissez une date dans les 60 prochains jours'; end if;
  if (select count(*) from public.home_care_requests where patient_id = uid and created_at > now() - interval '1 day') >= 5 then raise exception 'PP429: trop de demandes aujourd''hui'; end if;
  if p ->> 'accord' is distinct from 'true' then raise exception 'PP422: votre accord est nécessaire pour transmettre la demande'; end if;
  insert into public.home_care_requests (patient_id, nurse_id, care_type, preferred_date, preferred_slot, area, contact_phone, message, has_prescription)
  values (uid, n.id, p ->> 'care_type', d, p ->> 'preferred_slot', btrim(p ->> 'area'), btrim(p ->> 'contact_phone'), nullif(btrim(coalesce(p ->> 'message', '')), ''), coalesce((p ->> 'has_prescription')::boolean, false))
  returning * into r;
  insert into public.notifications (user_id, kind, title, body, link)
  values (n.user_id, 'rendez_vous', 'Nouvelle demande de soins à domicile', r.reference || ' · ' || to_char(r.preferred_date, 'DD/MM/YYYY'), '/infirmier');
  return r.reference;
end $$;
revoke execute on function public.request_home_care(jsonb) from public, anon;
grant execute on function public.request_home_care(jsonb) to authenticated;

create or replace function public.home_care_set_status(p_id uuid, p_status text, p_reply text default null)
returns void language plpgsql security definer set search_path = public as $$
declare r public.home_care_requests; is_nurse boolean; is_patient boolean;
begin
  select * into r from public.home_care_requests where id = p_id for update;
  if r.id is null then raise exception 'PP404: demande introuvable'; end if;
  is_patient := r.patient_id = auth.uid();
  is_nurse := exists (select 1 from public.nurse_accounts n where n.id = r.nurse_id and n.user_id = auth.uid());
  if not (is_patient or is_nurse) then raise exception 'PP403: accès refusé'; end if;
  if p_status in ('acceptee', 'refusee') and not (is_nurse and r.status = 'demande') then raise exception 'PP409: seule une demande en attente peut être acceptée ou refusée par l''infirmier'; end if;
  if p_status = 'terminee' and not (is_nurse and r.status = 'acceptee') then raise exception 'PP409: seuls des soins acceptés peuvent être marqués comme effectués'; end if;
  if p_status = 'annulee' and not (r.status in ('demande', 'acceptee')) then raise exception 'PP409: cette demande ne peut plus être annulée'; end if;
  if p_status not in ('acceptee', 'refusee', 'terminee', 'annulee') then raise exception 'PP422: statut invalide'; end if;
  update public.home_care_requests set status = p_status, nurse_reply = coalesce(nullif(btrim(coalesce(p_reply, '')), ''), nurse_reply),
    confirmed_at = case when p_status = 'acceptee' then now() else confirmed_at end, updated_at = now() where id = p_id;
  insert into public.notifications (user_id, kind, title, body, link)
  select case when is_nurse then r.patient_id else n.user_id end, 'rendez_vous',
    case p_status when 'acceptee' then 'Demande de soins acceptée' when 'refusee' then 'Demande de soins refusée' when 'terminee' then 'Soins effectués' else 'Demande de soins annulée' end,
    r.reference || coalesce(' — ' || nullif(btrim(coalesce(p_reply, '')), ''), ''), case when is_nurse then '/compte/soins-domicile' else '/infirmier' end
  from public.nurse_accounts n where n.id = r.nurse_id;
end $$;
revoke execute on function public.home_care_set_status(uuid, text, text) from public, anon;
grant execute on function public.home_care_set_status(uuid, text, text) to authenticated;

-- Démonstration : un infirmier fictif vérifié (fonction refusée hors environnement de démonstration)
create or replace function public.demo_nurse_install(p_user uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_region uuid; v_commune uuid;
begin
  perform public.demo_guard();
  select id into v_region from public.regions where is_district limit 1;
  select id into v_commune from public.communes where region_id = v_region and official_code = '04' limit 1;
  insert into public.nurse_accounts (user_id, display_name, registration_number, specialty, region_id, commune_id, areas, care_types, hours, prices, phone, phone_public,
    status, is_published, publication_consent_at, verified_at)
  values (p_user, 'Adama Démo (infirmier fictif)', 'DEMO-INF-0001', 'Infirmier d''État', v_region, v_commune, 'Hamdallaye, Lafiabougou, Djicoroni Para (exemple)',
    array['pansements', 'injections', 'perfusions', 'maladies_chroniques', 'personnes_agees'], 'Lundi au samedi, 8 h – 19 h (exemple)', 'Tarifs fictifs de démonstration', null, false,
    'verified', true, now(), now())
  on conflict (user_id) do update set status = 'verified', is_published = true
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.demo_nurse_install(uuid) from public, anon, authenticated;
grant execute on function public.demo_nurse_install(uuid) to service_role;

-- =============================================================================
-- Médecin traitant : le patient désigne le médecin qui le suit habituellement (pour lui ou un proche).
-- Soit un médecin inscrit sur SantéProxi (prévenu seulement si le patient le souhaite), soit un médecin saisi librement.
-- =============================================================================
create table if not exists public.treating_doctors (
  person_id uuid primary key references public.record_persons(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  doctor_id uuid references public.doctors(id) on delete set null,
  free_name text check (char_length(coalesce(free_name, '')) <= 120),
  free_structure text check (char_length(coalesce(free_structure, '')) <= 160),
  free_phone text check (free_phone is null or public.valid_phone(free_phone)),
  notify_doctor boolean not null default false,
  since date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (doctor_id is not null or char_length(btrim(coalesce(free_name, ''))) >= 3),
  check (not notify_doctor or doctor_id is not null)
);
alter table public.treating_doctors enable row level security;
drop policy if exists "pp_treating_doctors_own" on public.treating_doctors;
create policy "pp_treating_doctors_own" on public.treating_doctors for select to authenticated using (owner_id = auth.uid() and public.record_unlocked());
revoke all on public.treating_doctors from anon, authenticated;
grant select on public.treating_doctors to authenticated;

create or replace function public.set_treating_doctor(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); pid uuid := nullif(p ->> 'person_id', '')::uuid; did uuid := nullif(p ->> 'doctor_id', '')::uuid;
  d public.doctors; notify boolean := coalesce((p ->> 'notify_doctor')::boolean, false); prev uuid; prev_notify boolean; pname text;
begin
  if uid is null then raise exception 'PP401: connexion requise'; end if;
  if not public.record_unlocked() then raise exception 'PP423: déverrouillez d''abord votre dossier avec votre code'; end if;
  select display_name into pname from public.record_persons where id = pid and owner_id = uid;
  if pname is null then raise exception 'PP403: dossier d''un autre compte'; end if;
  if did is not null then
    select * into d from public.doctors where id = did and is_published;
    if d.id is null then raise exception 'PP404: médecin introuvable dans l''annuaire'; end if;
    if notify and d.user_id is null then notify := false; end if;
  end if;
  select doctor_id, notify_doctor into prev, prev_notify from public.treating_doctors where person_id = pid;
  insert into public.treating_doctors (person_id, owner_id, doctor_id, free_name, free_structure, free_phone, notify_doctor, since)
  values (pid, uid, did, case when did is null then nullif(btrim(coalesce(p ->> 'free_name', '')), '') end,
          case when did is null then nullif(btrim(coalesce(p ->> 'free_structure', '')), '') end,
          case when did is null then nullif(btrim(coalesce(p ->> 'free_phone', '')), '') end, notify, nullif(p ->> 'since', '')::date)
  on conflict (person_id) do update set doctor_id = excluded.doctor_id, free_name = excluded.free_name, free_structure = excluded.free_structure,
    free_phone = excluded.free_phone, notify_doctor = excluded.notify_doctor, since = excluded.since, updated_at = now();
  if notify and d.user_id is not null and (prev is distinct from did or not coalesce(prev_notify, false)) then
    insert into public.notifications (user_id, kind, title, body, link)
    values (d.user_id, 'info', 'Un patient vous a désigné comme médecin traitant', 'Vous figurez désormais comme médecin traitant de ' || pname || ' sur SantéProxi. Aucune donnée de santé ne vous est transmise par cette désignation.', '/medecin/patients');
  end if;
end $$;
revoke execute on function public.set_treating_doctor(jsonb) from public, anon;
grant execute on function public.set_treating_doctor(jsonb) to authenticated;

create or replace function public.remove_treating_doctor(p_person uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.record_unlocked() then raise exception 'PP423: déverrouillez d''abord votre dossier avec votre code'; end if;
  delete from public.treating_doctors where person_id = p_person and owner_id = auth.uid();
end $$;
revoke execute on function public.remove_treating_doctor(uuid) from public, anon;
grant execute on function public.remove_treating_doctor(uuid) to authenticated;

-- Côté médecin : uniquement les patients qui ont choisi de le prévenir, et seulement leur nom (aucune donnée de santé)
create or replace function public.treating_doctor_patients()
returns table (patient_name text, since date, designated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.display_name, t.since, t.created_at from public.treating_doctors t
    join public.record_persons p on p.id = t.person_id join public.doctors d on d.id = t.doctor_id
  where d.user_id = auth.uid() and t.notify_doctor order by t.created_at desc;
$$;
revoke execute on function public.treating_doctor_patients() from public, anon;
grant execute on function public.treating_doctor_patients() to authenticated;

-- Passeport santé : le médecin traitant peut faire partie d'un partage
alter table public.health_shares drop constraint if exists health_shares_sections_check;
alter table public.health_shares add constraint health_shares_sections_check check (cardinality(sections) between 1 and 9
  and sections <@ array['identite', 'groupe_sanguin', 'allergies', 'maladies', 'traitements', 'vaccins', 'contact_urgence', 'mesures', 'medecin_traitant']::text[]);

create or replace function public.open_health_share(p_token text, p_viewer text default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare s public.health_shares; p public.record_persons; e public.record_essentials; out jsonb; viewer text; is_self boolean;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return jsonb_build_object('status', 'invalide'); end if;
  select * into s from public.health_shares where token_hash = encode(digest(p_token, 'sha256'), 'hex');
  if s.id is null then return jsonb_build_object('status', 'invalide'); end if;
  if s.revoked_at is not null then return jsonb_build_object('status', 'retire'); end if;
  if s.expires_at <= now() then return jsonb_build_object('status', 'expire'); end if;
  select * into p from public.record_persons where id = s.person_id;
  select * into e from public.record_essentials where person_id = s.person_id;
  is_self := p.is_self;
  viewer := coalesce((select 'Compte SantéProxi : ' || full_name from public.profiles where id = auth.uid()), 'Personne non connectée') || coalesce(' · ' || left(nullif(btrim(p_viewer), ''), 80), '');
  out := jsonb_build_object('status', 'ok', 'reference', s.reference, 'expires_at', s.expires_at, 'sections', to_jsonb(s.sections));
  if 'identite' = any(s.sections) then out := out || jsonb_build_object('identite', jsonb_build_object('nom', p.display_name, 'annee_naissance', p.birth_year, 'sexe', p.sex)); end if;
  if 'groupe_sanguin' = any(s.sections) then out := out || jsonb_build_object('groupe_sanguin', e.blood_group); end if;
  if 'contact_urgence' = any(s.sections) then out := out || jsonb_build_object('contact_urgence', jsonb_build_object('nom', e.emergency_name, 'lien', e.emergency_relation, 'telephone', e.emergency_phone)); end if;
  if 'allergies' = any(s.sections) then out := out || jsonb_build_object('allergies', coalesce((select jsonb_agg(jsonb_build_object('titre', title, 'gravite', severity, 'detail', left(detail, 300)) order by title) from public.record_items where person_id = s.person_id and kind = 'allergie'), '[]')); end if;
  if 'maladies' = any(s.sections) then out := out || jsonb_build_object('maladies', coalesce((select jsonb_agg(jsonb_build_object('titre', title, 'annee', year) order by title) from public.record_items where person_id = s.person_id and kind = 'maladie'), '[]')); end if;
  if 'vaccins' = any(s.sections) then out := out || jsonb_build_object('vaccins', coalesce((select jsonb_agg(jsonb_build_object('titre', title, 'date', event_date) order by event_date desc nulls last) from public.record_items where person_id = s.person_id and kind = 'vaccin'), '[]')); end if;
  if 'traitements' = any(s.sections) then
    out := out || jsonb_build_object('traitements', case when is_self then coalesce((select jsonb_agg(jsonb_build_object('nom', name, 'indication', dose_note) order by name) from public.treatments where user_id = s.owner_id and active), '[]') else '[]'::jsonb end);
  end if;
  if 'mesures' = any(s.sections) then
    out := out || jsonb_build_object('mesures', case when is_self then coalesce((select jsonb_agg(m order by m.measured_at desc) from (select kind, systolic, diastolic, pulse, glucose_gl, context, measured_at from public.health_measures where user_id = s.owner_id order by measured_at desc limit 20) m), '[]') else '[]'::jsonb end);
  end if;
  if 'medecin_traitant' = any(s.sections) then
    out := out || jsonb_build_object('medecin_traitant', (select jsonb_build_object('nom', coalesce(nullif(btrim(coalesce(d.title, '') || ' ' || d.display_name), ''), t.free_name), 'structure', t.free_structure, 'telephone', t.free_phone, 'sur_santeproxi', t.doctor_id is not null)
      from public.treating_doctors t left join public.doctors d on d.id = t.doctor_id where t.person_id = s.person_id));
  end if;
  update public.health_shares set views = views + 1, last_viewed_at = now() where id = s.id;
  insert into public.record_access_log (owner_id, person_id, actor_kind, actor_label, action, detail)
  values (s.owner_id, s.person_id, 'lien_partage', left(viewer, 160), 'partage_consulte', s.reference);
  -- Le titulaire est prévenu à la première consultation, puis au plus une fois par heure
  if s.last_viewed_at is null or s.last_viewed_at < now() - interval '1 hour' then
    insert into public.notifications (user_id, kind, title, body, link)
    values (s.owner_id, 'dossier', 'Votre passeport santé a été consulté', 'Partage ' || s.reference || ' ouvert par : ' || left(viewer, 120) || '. Vous pouvez retirer ce partage à tout moment.', '/ma-sante/dossier/autorisations');
  end if;
  return out;
end $$;
revoke execute on function public.open_health_share(text, text) from public;
grant execute on function public.open_health_share(text, text) to anon, authenticated;

-- =============================================================================
-- Audio : voix de synthèse (IA) clairement signalées
-- Un enregistrement peut provenir d'une personne (« enregistrement ») ou d'un modèle de synthèse vocale (« synthese_ia »).
-- Une voix de synthèse n'est publiable qu'après vérification nommée par un locuteur natif, quelle que soit la langue,
-- et elle est toujours annoncée comme telle aux visiteurs.
-- =============================================================================
alter table public.audio_clips add column if not exists origin text not null default 'enregistrement';
alter table public.audio_clips add column if not exists ai_model text;
do $$ begin
  alter table public.audio_clips add constraint audio_clips_origin_chk check (origin in ('enregistrement', 'synthese_ia'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.audio_clips add constraint audio_clips_ai_model_chk check (char_length(coalesce(ai_model, '')) <= 120 and (origin = 'synthese_ia' or ai_model is null));
exception when duplicate_object then null; end $$;

create or replace function public.audio_set_origin(p_id uuid, p_origin text, p_model text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_manage_audio() then raise exception 'PP403: réservé à l''équipe PharmaProxi' using errcode = '42501'; end if;
  if p_origin not in ('enregistrement', 'synthese_ia') then raise exception 'PP422: origine invalide'; end if;
  if p_origin = 'synthese_ia' and char_length(btrim(coalesce(p_model, ''))) < 3 then raise exception 'PP422: indiquez le modèle de synthèse vocale utilisé'; end if;
  update public.audio_clips set origin = p_origin, ai_model = case when p_origin = 'synthese_ia' then btrim(p_model) end,
    -- changer l'origine d'un enregistrement publié le repasse en brouillon : il doit être réécouté et revalidé
    status = case when origin is distinct from p_origin then 'draft' else status end
  where id = p_id;
  if not found then raise exception 'PP404: enregistrement introuvable'; end if;
  perform public.log_audit('audio.origin', 'audio_clip', p_id::text, jsonb_build_object('origin', p_origin));
end $$;
revoke execute on function public.audio_set_origin(uuid, text, text) from public, anon;
grant execute on function public.audio_set_origin(uuid, text, text) to authenticated;

create or replace function public.audio_set_published(p_id uuid, p_publish boolean)
returns void language plpgsql security definer set search_path = public as $$
declare c public.audio_clips;
begin
  if not public.can_manage_audio() then raise exception 'PP403: réservé à l''équipe PharmaProxi' using errcode = '42501'; end if;
  select * into c from public.audio_clips where id = p_id for update;
  if c.id is null then raise exception 'PP404: enregistrement introuvable'; end if;
  if p_publish and c.lang <> 'francais' and c.reviewer is null then
    raise exception 'PP422: indiquez qui a vérifié la traduction (un second locuteur) avant de publier';
  end if;
  if p_publish and c.origin = 'synthese_ia' and c.reviewer is null then
    raise exception 'PP422: une voix de synthèse doit être écoutée et vérifiée par un locuteur natif nommé avant publication';
  end if;
  update public.audio_clips set status = case when p_publish then 'published' else 'draft' end,
    published_at = case when p_publish then coalesce(published_at, now()) else published_at end where id = p_id;
  perform public.log_audit(case when p_publish then 'audio.publish' else 'audio.unpublish' end, 'audio_clip', p_id::text);
end $$;
