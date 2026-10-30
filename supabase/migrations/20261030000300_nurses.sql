-- ============================================================================
-- PharmaProxi — Migration : infirmiers et soins infirmiers à domicile
--   1. nurse_register : Tableau de l'Ordre des infirmiers (CNOIIM) — nom, n°
--      d'inscription, spécialité, section, structure. Le téléphone n'est publié
--      que si l'infirmier l'a autorisé. Retrait possible (choix conservé aux imports).
--   2. home_care_providers : structures de soins à domicile, statut de vérification.
-- Peut être relancé sans erreur.
-- ============================================================================

create table if not exists public.nurse_register (
  id uuid primary key default gen_random_uuid(),
  register_year smallint not null check (register_year between 2000 and 2100),
  order_no int,
  registration_number text check (char_length(coalesce(registration_number, '')) <= 40),
  last_name text not null check (char_length(last_name) between 1 and 120),
  first_name text not null default '' check (char_length(first_name) <= 120),
  specialty text check (char_length(coalesce(specialty, '')) <= 160),
  section text check (char_length(coalesce(section, '')) <= 80),          -- section / conseil régional de l'Ordre
  region_id uuid references public.regions(id) on delete set null,
  commune_label text check (char_length(coalesce(commune_label, '')) <= 100),
  structure text check (char_length(coalesce(structure, '')) <= 200),
  phone text check (phone is null or public.valid_phone(phone)),
  phone_public boolean not null default false,                              -- publié seulement avec l'accord de l'infirmier
  home_care boolean not null default false,                                 -- se déplace à domicile (déclaré par l'infirmier)
  verification text not null default 'tableau' check (verification in ('tableau', 'verifie')),
  verified_at date,
  is_published boolean not null default true,
  search_text text generated always as (public.normalize_text(
    coalesce(last_name, '') || ' ' || coalesce(first_name, '') || ' ' || coalesce(structure, '') || ' ' || coalesce(specialty, '') || ' ' || coalesce(registration_number, ''))) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not phone_public or phone is not null)
);
create unique index if not exists nurse_register_unique on public.nurse_register
  (register_year, coalesce(registration_number, ''), public.normalize_text(last_name), public.normalize_text(first_name));
create index if not exists nurse_register_trgm on public.nurse_register using gin (search_text extensions.gin_trgm_ops);
create index if not exists nurse_register_filters on public.nurse_register (register_year, region_id) where is_published;

alter table public.nurse_register enable row level security;
drop policy if exists "pp_nurses_admin_read" on public.nurse_register;
create policy "pp_nurses_admin_read" on public.nurse_register for select to authenticated using (public.is_admin());
revoke all on public.nurse_register from anon;
revoke insert, update, delete on public.nurse_register from authenticated;
grant select on public.nurse_register to authenticated;
-- Lecture publique uniquement par search_nurse_register (qui masque les téléphones non autorisés)

create table if not exists public.nurse_optouts (
  registration_number text not null default '',
  last_name_norm text not null,
  first_name_norm text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (registration_number, last_name_norm, first_name_norm)
);
alter table public.nurse_optouts enable row level security;
drop policy if exists "pp_nurse_optouts_admin" on public.nurse_optouts;
create policy "pp_nurse_optouts_admin" on public.nurse_optouts for select to authenticated using (public.is_admin());
revoke all on public.nurse_optouts from anon;
revoke insert, update, delete on public.nurse_optouts from authenticated;

-- Import par lots. p_rows : [{line, ordre, inscription, nom, prenom, specialite, section, region, commune, structure, telephone, telephone_autorise, domicile}]
create or replace function public.admin_import_nurse_register(p_year int, p_rows jsonb, p_replace boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_admin(); rec record; ok int := 0; dup int := 0; errors jsonb := '[]'::jsonb; removed int := 0;
        v_phone text; v_pub boolean; v_region uuid;
begin
  if p_year is null or p_year < 2000 or p_year > 2100 then raise exception 'PP422: année invalide'; end if;
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'PP422: format invalide'; end if;
  if jsonb_array_length(p_rows) > 6000 then raise exception 'PP422: 6 000 lignes maximum par lot'; end if;
  if p_replace then
    delete from public.nurse_register where register_year = p_year;
    get diagnostics removed = row_count;
  end if;
  for rec in select coalesce((e ->> 'line')::int, o::int + 1) as line, e from jsonb_array_elements(p_rows) with ordinality as t(e, o) loop
    begin
      if char_length(btrim(coalesce(rec.e ->> 'nom', ''))) < 1 then raise exception 'PP422: nom manquant'; end if;
      v_phone := nullif(public.normalize_ml_phone(rec.e ->> 'telephone'), '');
      if (v_phone is null and coalesce(rec.e ->> 'telephone', '') ~ '[0-9]') or (v_phone is not null and not public.valid_phone(v_phone)) then
        raise exception 'PP422: téléphone invalide';
      end if;
      v_pub := v_phone is not null and public.normalize_text(coalesce(rec.e ->> 'telephone_autorise', '')) in ('oui', 'o', 'yes', '1', 'vrai', 'x');
      v_region := coalesce(public.resolve_region(rec.e ->> 'region'), public.resolve_crom_region(rec.e ->> 'section'));
      insert into public.nurse_register (register_year, order_no, registration_number, last_name, first_name, specialty, section, region_id, commune_label,
                                         structure, phone, phone_public, home_care, is_published)
      values (p_year, nullif(regexp_replace(coalesce(rec.e ->> 'ordre', ''), '\D', '', 'g'), '')::int, nullif(btrim(rec.e ->> 'inscription'), ''),
              btrim(rec.e ->> 'nom'), coalesce(btrim(rec.e ->> 'prenom'), ''), nullif(btrim(rec.e ->> 'specialite'), ''), nullif(btrim(rec.e ->> 'section'), ''),
              v_region, nullif(btrim(rec.e ->> 'commune'), ''), nullif(btrim(rec.e ->> 'structure'), ''), v_phone, v_pub,
              public.normalize_text(coalesce(rec.e ->> 'domicile', '')) in ('oui', 'o', 'yes', '1', 'vrai', 'x'),
              not exists (select 1 from public.nurse_optouts o
                          where o.registration_number = coalesce(nullif(btrim(rec.e ->> 'inscription'), ''), '')
                            and o.last_name_norm = public.normalize_text(rec.e ->> 'nom')
                            and o.first_name_norm = public.normalize_text(coalesce(rec.e ->> 'prenom', ''))));
      ok := ok + 1;
    exception
      when unique_violation then dup := dup + 1;
      when others then errors := errors || jsonb_build_object('row', rec.line, 'error', regexp_replace(sqlerrm, '^PP[0-9]+: ', ''));
    end;
  end loop;
  perform public.log_audit('nurse_register.import', 'nurse_register', p_year::text,
    jsonb_build_object('imported', ok, 'duplicates', dup, 'failed', jsonb_array_length(errors), 'replaced', removed));
  return jsonb_build_object('imported', ok, 'duplicates', dup, 'failed', jsonb_array_length(errors), 'errors', errors, 'replaced', removed);
end $$;

-- Mise à jour d'une fiche par l'administration (publication, téléphone autorisé, vérification)
create or replace function public.admin_update_nurse(p_id uuid, p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_admin(); r public.nurse_register; v_phone text;
begin
  select * into r from public.nurse_register where id = p_id for update;
  if r.id is null then raise exception 'PP404: entrée introuvable'; end if;
  if p ? 'phone' then
    v_phone := nullif(public.normalize_ml_phone(p ->> 'phone'), '');
    if (v_phone is null and coalesce(p ->> 'phone', '') ~ '[0-9]') or (v_phone is not null and not public.valid_phone(v_phone)) then
      raise exception 'PP422: téléphone invalide';
    end if;
  else v_phone := r.phone; end if;
  update public.nurse_register set
    phone = v_phone,
    phone_public = coalesce((p ->> 'phone_public')::boolean, phone_public) and v_phone is not null,
    home_care = coalesce((p ->> 'home_care')::boolean, home_care),
    verification = coalesce(p ->> 'verification', verification),
    verified_at = case when p ->> 'verification' = 'verifie' then current_date when p ->> 'verification' = 'tableau' then null else verified_at end,
    is_published = coalesce((p ->> 'is_published')::boolean, is_published),
    updated_at = now()
  where id = p_id;
  if (p ->> 'is_published') is not null then
    if (p ->> 'is_published')::boolean then
      delete from public.nurse_optouts where registration_number = coalesce(r.registration_number, '')
        and last_name_norm = public.normalize_text(r.last_name) and first_name_norm = public.normalize_text(r.first_name);
    else
      insert into public.nurse_optouts (registration_number, last_name_norm, first_name_norm, created_by)
      values (coalesce(r.registration_number, ''), public.normalize_text(r.last_name), public.normalize_text(r.first_name), uid) on conflict do nothing;
    end if;
  end if;
  perform public.log_audit('nurse_register.update', 'nurse_register', p_id::text, p - 'phone');
exception
  when check_violation then raise exception 'PP422: valeurs invalides';
end $$;

-- Recherche publique : le téléphone n'est renvoyé que s'il est autorisé
create or replace function public.search_nurse_register(p_query text default null, p_region uuid default null, p_home_care boolean default null,
                                                        p_limit int default 20, p_offset int default 0)
returns table (id uuid, register_year smallint, registration_number text, last_name text, first_name text, specialty text, section text,
               region_name text, commune_label text, structure text, phone text, home_care boolean, verification text, verified_at date, total_count bigint)
language sql stable security definer set search_path = public, extensions as $$
  with q as (select nullif(public.normalize_text(left(coalesce(p_query, ''), 80)), '') as t),
  latest as (select max(register_year) as y from public.nurse_register where is_published)
  select r.id, r.register_year, r.registration_number, r.last_name, r.first_name, r.specialty, r.section, rg.name, r.commune_label, r.structure,
         case when r.phone_public then r.phone end, r.home_care, r.verification, r.verified_at, count(*) over ()
  from public.nurse_register r cross join q cross join latest
  left join public.regions rg on rg.id = r.region_id
  where r.is_published and r.register_year = latest.y
    and (p_region is null or r.region_id = p_region)
    and (p_home_care is null or r.home_care = p_home_care)
    and (q.t is null or not exists (select 1 from regexp_split_to_table(q.t, '\s+') w where w <> '' and r.search_text not like '%' || w || '%'))
  order by (r.verification = 'verifie') desc, public.normalize_text(r.last_name), public.normalize_text(r.first_name), r.id
  limit least(greatest(coalesce(p_limit, 20), 1), 50) offset greatest(coalesce(p_offset, 0), 0)
$$;
alter function public.search_nurse_register(text, uuid, boolean, int, int) set statement_timeout = '5s';

create or replace function public.nurse_register_summary()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('year', max(register_year), 'total', count(*))
  from public.nurse_register where is_published and register_year = (select max(register_year) from public.nurse_register where is_published)
$$;

-- ---------------------------------------------------------------------------
-- 2. Structures de soins infirmiers à domicile
-- ---------------------------------------------------------------------------
create table if not exists public.home_care_providers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 160),
  address text check (char_length(coalesce(address, '')) <= 300),
  region_id uuid references public.regions(id) on delete set null,
  areas text check (char_length(coalesce(areas, '')) <= 300),                -- communes / quartiers desservis
  phone text check (phone is null or public.valid_phone(phone)),
  whatsapp text check (whatsapp is null or public.valid_phone(whatsapp)),
  care_types text[] not null default '{}' check (care_types <@ array['soins_infirmiers', 'pansements', 'injections', 'perfusions', 'post_operatoire',
    'maladies_chroniques', 'personnes_agees', 'prelevements', 'consultation', 'assistance', 'kinesitherapie', 'nursing']::text[]),
  activity text check (char_length(coalesce(activity, '')) <= 300),         -- activité annoncée par la structure
  hours text check (char_length(coalesce(hours, '')) <= 200),
  prices text check (char_length(coalesce(prices, '')) <= 300),             -- tarifs communiqués par la structure
  booking text check (char_length(coalesce(booking, '')) <= 200),
  verification text not null default 'non_verifie' check (verification in ('non_verifie', 'verifie')),
  authorization_ref text check (char_length(coalesce(authorization_ref, '')) <= 200),  -- référence de l'autorisation d'exercer vue par l'équipe
  verified_at date,
  source text not null default 'Saisie administrateur' check (char_length(source) between 1 and 200),
  is_published boolean not null default true,
  search_text text generated always as (public.normalize_text(coalesce(name, '') || ' ' || coalesce(address, '') || ' ' || coalesce(areas, '') || ' ' || coalesce(activity, ''))) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (verification = 'non_verifie' or authorization_ref is not null)
);
create unique index if not exists home_care_providers_name on public.home_care_providers (public.normalize_text(name));

alter table public.home_care_providers enable row level security;
drop policy if exists "pp_homecare_public" on public.home_care_providers;
create policy "pp_homecare_public" on public.home_care_providers for select to anon, authenticated using (is_published or public.is_admin());
revoke insert, update, delete on public.home_care_providers from anon, authenticated;
grant select on public.home_care_providers to anon, authenticated;
-- La référence d'autorisation n'est lisible que par l'administration
revoke select on public.home_care_providers from anon, authenticated;
grant select (id, name, address, region_id, areas, phone, whatsapp, care_types, activity, hours, prices, booking, verification, verified_at, source,
              is_published, created_at, updated_at) on public.home_care_providers to anon, authenticated;

create or replace function public.admin_save_home_care(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_admin(); rid uuid := nullif(p ->> 'id', '')::uuid; v_phone text; v_wa text;
begin
  v_phone := nullif(public.normalize_ml_phone(p ->> 'phone'), '');
  v_wa := nullif(public.normalize_ml_phone(p ->> 'whatsapp'), '');
  if (v_phone is not null and not public.valid_phone(v_phone)) or (v_wa is not null and not public.valid_phone(v_wa))
     or (v_phone is null and coalesce(p ->> 'phone', '') ~ '[0-9]') or (v_wa is null and coalesce(p ->> 'whatsapp', '') ~ '[0-9]') then
    raise exception 'PP422: numéro de téléphone invalide';
  end if;
  if rid is null then
    insert into public.home_care_providers (name, address, region_id, areas, phone, whatsapp, care_types, activity, hours, prices, booking,
                                            verification, authorization_ref, verified_at, source, is_published)
    values (btrim(p ->> 'name'), nullif(btrim(p ->> 'address'), ''), nullif(p ->> 'region_id', '')::uuid, nullif(btrim(p ->> 'areas'), ''), v_phone, v_wa,
            coalesce((select array_agg(distinct x) from jsonb_array_elements_text(coalesce(p -> 'care_types', '[]')) x), '{}'),
            nullif(btrim(p ->> 'activity'), ''), nullif(btrim(p ->> 'hours'), ''), nullif(btrim(p ->> 'prices'), ''), nullif(btrim(p ->> 'booking'), ''),
            coalesce(p ->> 'verification', 'non_verifie'), nullif(btrim(p ->> 'authorization_ref'), ''),
            case when p ->> 'verification' = 'verifie' then current_date end,
            coalesce(nullif(btrim(p ->> 'source'), ''), 'Saisie administrateur'), coalesce((p ->> 'is_published')::boolean, true))
    returning id into rid;
  else
    update public.home_care_providers set name = btrim(p ->> 'name'), address = nullif(btrim(p ->> 'address'), ''), region_id = nullif(p ->> 'region_id', '')::uuid,
      areas = nullif(btrim(p ->> 'areas'), ''), phone = v_phone, whatsapp = v_wa,
      care_types = coalesce((select array_agg(distinct x) from jsonb_array_elements_text(coalesce(p -> 'care_types', '[]')) x), '{}'),
      activity = nullif(btrim(p ->> 'activity'), ''), hours = nullif(btrim(p ->> 'hours'), ''), prices = nullif(btrim(p ->> 'prices'), ''),
      booking = nullif(btrim(p ->> 'booking'), ''), verification = coalesce(p ->> 'verification', verification),
      authorization_ref = nullif(btrim(p ->> 'authorization_ref'), ''),
      verified_at = case when p ->> 'verification' = 'verifie' then coalesce(verified_at, current_date) else null end,
      source = coalesce(nullif(btrim(p ->> 'source'), ''), source), is_published = coalesce((p ->> 'is_published')::boolean, is_published), updated_at = now()
    where id = rid;
    if not found then raise exception 'PP404: structure introuvable'; end if;
  end if;
  perform public.log_audit('home_care.save', 'home_care_providers', rid::text, jsonb_build_object('verification', p ->> 'verification'));
  return rid;
exception
  when unique_violation then raise exception 'PP409: une structure porte déjà ce nom';
  when check_violation or not_null_violation then raise exception 'PP422: nom (2 à 160 caractères) obligatoire ; une structure vérifiée doit avoir une référence d''autorisation';
end $$;

create or replace function public.admin_delete_home_care(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  delete from public.home_care_providers where id = p_id;
  perform public.log_audit('home_care.delete', 'home_care_providers', p_id::text);
end $$;

create or replace function public.admin_home_care_list()
returns setof public.home_care_providers language sql stable security definer set search_path = public as $$
  select h.* from public.home_care_providers h where public.is_admin() order by h.name
$$;

-- Structures signalées à l'équipe (référencement, non vérifiées)
insert into public.home_care_providers (name, address, region_id, areas, phone, care_types, activity, source)
values
  ('Santé Mobile Groupe', 'China Mall, Hamdallaye ACI 2000', public.resolve_region('District de Bamako'), 'Bamako', '+22396969617',
   array['soins_infirmiers', 'consultation'], 'Soins infirmiers et prestations médicales à domicile', 'Référencement transmis à PharmaProxi (octobre 2026)'),
  ('Keneya Assistance', 'Sogoniko', public.resolve_region('District de Bamako'), 'Bamako', '+22373280202',
   array['soins_infirmiers', 'assistance'], 'Soins infirmiers et assistance à domicile', 'Référencement transmis à PharmaProxi (octobre 2026)'),
  ('SMART SANTE', 'Bamako', public.resolve_region('District de Bamako'), 'Bamako', '+22375150211',
   array['consultation', 'assistance'], 'Consultation et assistance médicale à domicile', 'Référencement transmis à PharmaProxi (octobre 2026)'),
  ('Massaya Santé', 'Bacodjicoroni ACI', public.resolve_region('District de Bamako'), 'Bamako', '+22370708094',
   array['soins_infirmiers'], 'Services de santé à domicile', 'Référencement transmis à PharmaProxi (octobre 2026)')
on conflict do nothing;

revoke execute on function public.admin_import_nurse_register(int, jsonb, boolean), public.admin_update_nurse(uuid, jsonb),
  public.admin_save_home_care(jsonb), public.admin_delete_home_care(uuid), public.admin_home_care_list() from public, anon;
grant execute on function public.admin_import_nurse_register(int, jsonb, boolean), public.admin_update_nurse(uuid, jsonb),
  public.admin_save_home_care(jsonb), public.admin_delete_home_care(uuid), public.admin_home_care_list() to authenticated;
grant execute on function public.search_nurse_register(text, uuid, boolean, int, int), public.nurse_register_summary() to anon, authenticated;
