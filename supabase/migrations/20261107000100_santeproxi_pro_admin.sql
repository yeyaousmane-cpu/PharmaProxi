-- =============================================================================
-- SantéProxi 0.22 — inscription réservée aux patients ; les professionnels de
-- santé sont ajoutés par l'administrateur ; identifiants SP-… ; nom SantéProxi.
--
-- Règle : toute personne qui crée un compte est un patient. Un compte ne peut
-- créer une pharmacie, une fiche médecin ou une clinique que si l'administrateur
-- l'y a autorisé (après vérification de son autorisation d'exercer). Les
-- laboratoires sont rattachés directement par l'administrateur.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Inscription : toujours « patient »
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, phone, account_type)
  values (
    new.id,
    nullif(left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120), ''),
    case when (new.raw_user_meta_data ->> 'phone') ~ '^\+[1-9][0-9]{7,14}$' then new.raw_user_meta_data ->> 'phone' end,
    'patient'
  )
  on conflict (id) do nothing;
  insert into public.user_roles (user_id, role) values (new.id, 'customer') on conflict do nothing;
  return new;
end $$;

-- Le type de compte n'est plus choisi par l'utilisateur
revoke execute on function public.set_account_type(text) from authenticated;
create or replace function public.set_account_type(p_type text)
returns void language plpgsql security definer set search_path = public as $$
begin
  raise exception 'PP403: le type de compte est attribué par l''administrateur';
end $$;

-- ---------------------------------------------------------------------------
-- 2. Autorisations d'inscription professionnelle (données par l'administrateur)
-- ---------------------------------------------------------------------------
create table if not exists public.pro_authorizations (
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('pharmacie', 'medecin', 'clinique')),
  note text check (char_length(coalesce(note, '')) <= 300),
  granted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, kind)
);
alter table public.pro_authorizations enable row level security;
drop policy if exists "pp_pro_auth_read" on public.pro_authorizations;
create policy "pp_pro_auth_read" on public.pro_authorizations for select to authenticated using (user_id = auth.uid() or public.is_admin());
revoke all on public.pro_authorizations from anon, authenticated;
grant select on public.pro_authorizations to authenticated;

create or replace function public.has_pro_authorization(p_kind text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (select 1 from public.pro_authorizations where user_id = auth.uid() and kind = p_kind);
$$;
grant execute on function public.has_pro_authorization(text) to authenticated;

-- Compte d'un utilisateur à partir de son e-mail (réservé à l'administrateur)
create or replace function public.admin_user_by_email(p_email text)
returns uuid language plpgsql stable security definer set search_path = public, auth as $$
declare uid uuid;
begin
  perform public.require_admin();
  select u.id into uid from auth.users u join public.profiles p on p.id = u.id and p.deleted_at is null
   where lower(u.email) = lower(btrim(p_email));
  if uid is null then raise exception 'PP404: aucun compte avec cette adresse e-mail. La personne doit d''abord créer un compte patient.'; end if;
  return uid;
end $$;
revoke execute on function public.admin_user_by_email(text) from public, anon, authenticated;

create or replace function public.admin_authorize_pro(p_email text, p_kind text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := public.require_admin(); uid uuid;
begin
  if p_kind not in ('pharmacie', 'medecin', 'clinique') then raise exception 'PP422: type de professionnel invalide'; end if;
  uid := public.admin_user_by_email(p_email);
  insert into public.pro_authorizations (user_id, kind, note, granted_by) values (uid, p_kind, nullif(btrim(coalesce(p_note, '')), ''), me)
  on conflict (user_id, kind) do update set note = excluded.note, granted_by = me, created_at = now();
  update public.profiles set account_type = case p_kind when 'pharmacie' then 'pharmacien' else p_kind end where id = uid;
  perform public.notify_user(uid, 'compte', 'Inscription professionnelle autorisée',
    case p_kind when 'pharmacie' then 'Vous pouvez maintenant inscrire votre pharmacie.'
                when 'medecin' then 'Vous pouvez maintenant créer votre fiche de médecin.'
                else 'Vous pouvez maintenant inscrire votre établissement.' end, null,
    case p_kind when 'pharmacie' then '/pharmacien/inscription' when 'medecin' then '/medecin/inscription' else '/clinique/inscription' end);
  perform public.log_audit('pro_authorize', 'profile', uid::text, jsonb_build_object('kind', p_kind));
end $$;
revoke execute on function public.admin_authorize_pro(text, text, text) from public, anon;
grant execute on function public.admin_authorize_pro(text, text, text) to authenticated;

create or replace function public.admin_revoke_pro_authorization(p_user uuid, p_kind text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  delete from public.pro_authorizations where user_id = p_user and kind = p_kind;
  perform public.log_audit('pro_revoke', 'profile', p_user::text, jsonb_build_object('kind', p_kind));
end $$;
revoke execute on function public.admin_revoke_pro_authorization(uuid, text) from public, anon;
grant execute on function public.admin_revoke_pro_authorization(uuid, text) to authenticated;

-- Garde-fou en base : pas de pharmacie, de fiche médecin ni de clinique créée
-- par un compte sans autorisation (les créations par l'administrateur, la
-- maintenance et les données de démonstration ne sont pas concernées).
create or replace function public.guard_pro_creation()
returns trigger language plpgsql security definer set search_path = public as $$
declare k text := tg_argv[0];
begin
  if auth.uid() is null or public.is_admin() then return new; end if;
  if coalesce((to_jsonb(new) ->> 'is_demo')::boolean, false) then return new; end if;
  if not exists (select 1 from public.pro_authorizations where user_id = auth.uid() and kind = k) then
    raise exception 'PP403: inscription professionnelle réservée : l''administrateur doit d''abord vérifier et autoriser votre compte';
  end if;
  return new;
end $$;
drop trigger if exists guard_pro_creation on public.pharmacies;
create trigger guard_pro_creation before insert on public.pharmacies for each row execute function public.guard_pro_creation('pharmacie');
drop trigger if exists guard_pro_creation on public.doctors;
create trigger guard_pro_creation before insert on public.doctors for each row execute function public.guard_pro_creation('medecin');
drop trigger if exists guard_pro_creation on public.clinics;
create trigger guard_pro_creation before insert on public.clinics for each row execute function public.guard_pro_creation('clinique');

-- Message clair dès le début : l'autorisation est vérifiée avant le reste du formulaire.
do $$
declare f text; k text;
begin
  foreach f in array array['register_pharmacy', 'register_doctor', 'register_clinic'] loop
    if to_regprocedure('public.' || f || '_checked(jsonb)') is null then
      execute format('alter function public.%I(jsonb) rename to %I', f, f || '_checked');
    end if;
    execute format('revoke execute on function public.%I(jsonb) from public, anon, authenticated', f || '_checked');
    k := case f when 'register_pharmacy' then 'pharmacie' when 'register_doctor' then 'medecin' else 'clinique' end;
    execute format($f$
      create or replace function public.%I(p jsonb) returns uuid
      language plpgsql security definer set search_path = public as $b$
      begin
        perform public.require_auth();
        if not public.has_pro_authorization(%L) then
          raise exception 'PP403: inscription professionnelle réservée : l''administrateur doit d''abord vérifier et autoriser votre compte';
        end if;
        return public.%I(p);
      end $b$;$f$, f, k, f || '_checked');
    execute format('revoke execute on function public.%I(jsonb) from public, anon', f);
    execute format('grant execute on function public.%I(jsonb) to authenticated', f);
  end loop;
end $$;

-- Les demandes d'accès des laboratoires passent désormais par le formulaire de contact
drop policy if exists "pp_lab_requests_insert" on public.lab_access_requests;
revoke insert on public.lab_access_requests from authenticated;

-- ---------------------------------------------------------------------------
-- 3. Demandes de contact des professionnels (aucun compte n'est créé)
-- ---------------------------------------------------------------------------
create table if not exists public.pro_contact_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  kind text not null check (kind in ('pharmacie', 'medecin', 'clinique', 'laboratoire', 'autre')),
  full_name text not null check (char_length(btrim(full_name)) between 2 and 120),
  structure text not null check (char_length(btrim(structure)) between 2 and 160),
  region_id uuid references public.regions(id) on delete set null,
  phone text not null check (public.valid_phone(phone)),
  email text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  authorization_ref text check (char_length(coalesce(authorization_ref, '')) <= 160),
  message text check (char_length(coalesce(message, '')) <= 1000),
  status text not null default 'nouvelle' check (status in ('nouvelle', 'en_cours', 'traitee', 'refusee')),
  admin_note text check (char_length(coalesce(admin_note, '')) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists pro_contact_requests_status on public.pro_contact_requests (status, created_at desc);
alter table public.pro_contact_requests enable row level security;
drop policy if exists "pp_pro_contact_admin" on public.pro_contact_requests;
create policy "pp_pro_contact_admin" on public.pro_contact_requests for select to authenticated using (public.is_admin() or user_id = auth.uid());
revoke all on public.pro_contact_requests from anon, authenticated;
grant select on public.pro_contact_requests to authenticated;

create or replace function public.submit_pro_contact(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare id uuid; uid uuid := auth.uid();
begin
  if uid is not null and (select count(*) from public.pro_contact_requests where user_id = uid and created_at > now() - interval '1 day') >= 3 then
    raise exception 'PP429: trop de demandes aujourd''hui';
  end if;
  if (select count(*) from public.pro_contact_requests where created_at > now() - interval '1 hour') >= 60 then
    raise exception 'PP429: trop de demandes, réessayez plus tard';
  end if;
  insert into public.pro_contact_requests (user_id, kind, full_name, structure, region_id, phone, email, authorization_ref, message)
  values (uid, coalesce(nullif(p ->> 'kind', ''), 'autre'), btrim(p ->> 'full_name'), btrim(p ->> 'structure'),
          nullif(p ->> 'region_id', '')::uuid, p ->> 'phone', nullif(lower(btrim(coalesce(p ->> 'email', ''))), ''),
          nullif(btrim(coalesce(p ->> 'authorization_ref', '')), ''), nullif(btrim(coalesce(p ->> 'message', '')), ''))
  returning pro_contact_requests.id into id;
  return id;
end $$;
revoke execute on function public.submit_pro_contact(jsonb) from public;
grant execute on function public.submit_pro_contact(jsonb) to anon, authenticated;

create or replace function public.admin_pro_contact_status(p_id uuid, p_status text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  if p_status not in ('nouvelle', 'en_cours', 'traitee', 'refusee') then raise exception 'PP422: statut invalide'; end if;
  update public.pro_contact_requests set status = p_status, admin_note = coalesce(nullif(btrim(coalesce(p_note, '')), ''), admin_note), updated_at = now() where id = p_id;
end $$;
revoke execute on function public.admin_pro_contact_status(uuid, text, text) from public, anon;
grant execute on function public.admin_pro_contact_status(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Comptes existants : un profil n'est professionnel que s'il l'est vraiment
-- ---------------------------------------------------------------------------
update public.profiles p set account_type = 'patient'
 where account_type <> 'patient'
   and not exists (select 1 from public.user_roles r where r.user_id = p.id and r.role in ('pharmacist', 'admin'))
   and not exists (select 1 from public.doctors d where d.user_id = p.id)
   and not exists (select 1 from public.clinic_members c where c.user_id = p.id)
   and not exists (select 1 from public.facility_members f where f.user_id = p.id)
   and not exists (select 1 from public.pro_authorizations a where a.user_id = p.id);

-- Les professionnels déjà en place gardent leur accès : on leur donne l'autorisation correspondante
insert into public.pro_authorizations (user_id, kind, note)
select distinct r.user_id, 'pharmacie', 'Pharmacien déjà inscrit avant la 0.22' from public.user_roles r where r.role = 'pharmacist'
on conflict do nothing;
insert into public.pro_authorizations (user_id, kind, note)
select distinct d.user_id, 'medecin', 'Médecin déjà inscrit avant la 0.22' from public.doctors d where d.user_id is not null and not d.is_demo
on conflict do nothing;
insert into public.pro_authorizations (user_id, kind, note)
select distinct c.user_id, 'clinique', 'Établissement déjà inscrit avant la 0.22' from public.clinic_members c
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 5. Identifiants SantéProxi : SP-PH, SP-MD, SP-LB, SP-ET
-- ---------------------------------------------------------------------------
update public.pharmacies set public_code = 'SP-' || substr(public_code, 4) where public_code like 'PP-%';
update public.doctors set public_code = 'SP-' || substr(public_code, 4) where public_code like 'PP-%';
update public.clinics set public_code = 'SP-' || substr(public_code, 4) where public_code like 'PP-%';
update public.facility_listings set public_code = 'SP-' || substr(public_code, 4) where public_code like 'PP-%';
alter table public.pharmacies alter column public_code set default public.next_public_code('SP-PH');
alter table public.doctors alter column public_code set default public.next_public_code('SP-MD');
alter table public.clinics alter column public_code set default public.next_public_code('SP-ET');
create or replace function public.facility_public_code() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.public_code is null then
    new.public_code := public.next_public_code(case when new.kind = 'laboratoire' then 'SP-LB' else 'SP-ET' end);
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Effacement avec le compte
-- ---------------------------------------------------------------------------
create or replace function public.purge_pro_on_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    delete from public.pro_authorizations where user_id = new.id;
    update public.pro_contact_requests set user_id = null where user_id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists purge_pro_on_delete on public.profiles;
create trigger purge_pro_on_delete after update of deleted_at on public.profiles
  for each row execute function public.purge_pro_on_delete();

-- ---------------------------------------------------------------------------
-- 7. Nouveau nom : SantéProxi (contenus publiés et messages automatiques)
--    Les journaux et historiques ne sont pas modifiés.
-- ---------------------------------------------------------------------------
update public.content_pages set body = replace(replace(body, 'PharmaProxi', 'SantéProxi'), 'Votre pharmacie, plus proche de vous', 'Toute la santé, près de chez vous') where body like '%PharmaProxi%' or body like '%Votre pharmacie, plus proche de vous%';
update public.health_articles set body = replace(body::text, 'PharmaProxi', 'SantéProxi')::jsonb where body::text like '%PharmaProxi%';
update public.health_articles set faq = replace(faq::text, 'PharmaProxi', 'SantéProxi')::jsonb where faq::text like '%PharmaProxi%';
update public.health_articles set author_name = replace(author_name, 'PharmaProxi', 'SantéProxi') where author_name like '%PharmaProxi%';
update public.audio_targets set label = replace(label, 'PharmaProxi', 'SantéProxi') where label like '%PharmaProxi%';
update public.audio_targets set script_fr = replace(script_fr, 'PharmaProxi', 'SantéProxi') where script_fr like '%PharmaProxi%';
update public.home_care_providers set source = replace(source, 'PharmaProxi', 'SantéProxi') where source like '%PharmaProxi%';

-- Messages produits par les fonctions (notifications, erreurs, textes)
do $$
declare r record; def text;
begin
  for r in select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.prokind = 'f' and p.prosrc like '%PharmaProxi%' loop
    def := pg_get_functiondef(r.oid);
    execute replace(def, 'PharmaProxi', 'SantéProxi');
  end loop;
end $$;
