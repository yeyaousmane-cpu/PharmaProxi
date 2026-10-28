-- ============================================================================
-- PharmaProxi — Migration : annuaire des pharmacies non encore inscrites
-- Fiches d'annuaire simples (nom, zone, adresse, téléphone, position), gérées
-- par l'administration. Elles n'ont ni stock, ni prix, ni commande : elles
-- permettent au public de trouver et d'appeler une officine qui n'a pas encore
-- rejoint PharmaProxi. Une fiche est masquée dès qu'elle est rattachée à la
-- pharmacie vérifiée correspondante.
-- ============================================================================

create table public.pharmacy_listings (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 160),
  region_id uuid not null references public.regions(id) on delete restrict,
  commune_id uuid references public.communes(id) on delete set null,
  locality_id uuid references public.localities(id) on delete set null,
  area_label text check (char_length(coalesce(area_label, '')) <= 200),
  address text check (char_length(coalesce(address, '')) <= 300),
  phone text check (phone is null or public.valid_phone(phone)),
  latitude double precision check (latitude is null or latitude between 9.5 and 25.5),
  longitude double precision check (longitude is null or longitude between -12.8 and 4.8),
  source text not null default 'Saisie administrateur' check (char_length(source) between 1 and 200),
  is_published boolean not null default true,
  claimed_pharmacy_id uuid references public.pharmacies(id) on delete set null,
  search_name text generated always as (public.normalize_text(name)) stored,
  is_demo boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((latitude is null) = (longitude is null))
);

create unique index pharmacy_listings_dedup
  on public.pharmacy_listings (search_name, region_id, coalesce(commune_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index pharmacy_listings_name_trgm on public.pharmacy_listings using gin (search_name extensions.gin_trgm_ops);
create index pharmacy_listings_zone on public.pharmacy_listings (region_id, commune_id) where is_published and claimed_pharmacy_id is null;
create index pharmacy_listings_claimed on public.pharmacy_listings (claimed_pharmacy_id) where claimed_pharmacy_id is not null;

alter table public.pharmacy_listings enable row level security;

create policy "pp_listings_public_read" on public.pharmacy_listings for select to anon, authenticated
  using (is_published and claimed_pharmacy_id is null);
create policy "pp_listings_admin_read" on public.pharmacy_listings for select to authenticated
  using (public.is_admin());

revoke insert, update, delete on public.pharmacy_listings from anon, authenticated;
grant select on public.pharmacy_listings to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Normalisation d'un numéro malien : « 76-32-23-41 », « 76 32 23 41 »,
-- « 00223 76322341 », « +223 76 32 23 41 » → « +22376322341 ». NULL si invalide.
-- ---------------------------------------------------------------------------
create or replace function public.normalize_ml_phone(p text)
returns text language plpgsql immutable as $$
declare d text := regexp_replace(coalesce(p, ''), '[^0-9+]', '', 'g');
begin
  if d = '' then return null; end if;
  if d like '+%' then d := substr(d, 2);
  elsif d like '00%' then d := substr(d, 3);
  elsif char_length(d) = 8 then d := '223' || d;
  end if;
  d := regexp_replace(d, '[^0-9]', '', 'g');
  if ('+' || d) ~ '^\+[1-9][0-9]{7,14}$' then return '+' || d; end if;
  return null;
end $$;

-- Résolution d'une région / commune / quartier saisis en texte libre
create or replace function public.resolve_region(p text)
returns uuid language sql stable set search_path = public as $$
  select id from public.regions
  where public.normalize_text(name) = public.normalize_text(p)
     or (public.normalize_text(p) in ('bamako', 'district de bamako', 'district bamako') and name = 'District de Bamako')
  limit 1
$$;

create or replace function public.resolve_commune(p_region uuid, p text)
returns uuid language plpgsql stable set search_path = public as $$
declare t text := public.normalize_text(p); r uuid;
begin
  if p_region is null or t = '' then return null; end if;
  -- « Commune 4 », « C4 », « CIV », « commune iv » → « Commune IV »
  t := regexp_replace(t, '^(commune|com\.?|c)\s*', 'commune ');
  t := case regexp_replace(t, '^commune ', '')
         when '1' then 'commune i' when '2' then 'commune ii' when '3' then 'commune iii'
         when '4' then 'commune iv' when '5' then 'commune v' when '6' then 'commune vi'
         else t end;
  select id into r from public.communes where region_id = p_region and public.normalize_text(name) = t limit 1;
  if r is null then
    select id into r from public.communes where region_id = p_region and public.normalize_text(name) = public.normalize_text(p) limit 1;
  end if;
  return r;
end $$;

create or replace function public.resolve_locality(p_commune uuid, p text)
returns uuid language sql stable set search_path = public as $$
  select id from public.localities
  where p_commune is not null and commune_id = p_commune and public.normalize_text(name) = public.normalize_text(p)
  limit 1
$$;

-- ---------------------------------------------------------------------------
-- Administration
-- ---------------------------------------------------------------------------
create or replace function public.admin_save_listing(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid uuid := public.require_admin();
  lid uuid := nullif(p ->> 'id', '')::uuid;
  v_phone text := public.normalize_ml_phone(p ->> 'phone');
  v_lat double precision := nullif(p ->> 'latitude', '')::double precision;
  v_lng double precision := nullif(p ->> 'longitude', '')::double precision;
begin
  if nullif(btrim(p ->> 'phone'), '') is not null and v_phone is null then
    raise exception 'PP422: numéro de téléphone invalide';
  end if;
  if (v_lat is null) <> (v_lng is null) then
    raise exception 'PP422: renseignez la latitude ET la longitude, ou aucune des deux';
  end if;
  if lid is null then
    insert into public.pharmacy_listings (name, region_id, commune_id, locality_id, area_label, address, phone, latitude, longitude, source, created_by)
    values (btrim(p ->> 'name'), (p ->> 'region_id')::uuid, nullif(p ->> 'commune_id', '')::uuid, nullif(p ->> 'locality_id', '')::uuid,
            nullif(btrim(p ->> 'area_label'), ''), nullif(btrim(p ->> 'address'), ''), v_phone, v_lat, v_lng,
            coalesce(nullif(btrim(p ->> 'source'), ''), 'Saisie administrateur'), uid)
    returning id into lid;
    perform public.log_audit('listing.create', 'pharmacy_listing', lid::text, jsonb_build_object('name', p ->> 'name'));
  else
    update public.pharmacy_listings set
      name = btrim(p ->> 'name'), region_id = (p ->> 'region_id')::uuid,
      commune_id = nullif(p ->> 'commune_id', '')::uuid, locality_id = nullif(p ->> 'locality_id', '')::uuid,
      area_label = nullif(btrim(p ->> 'area_label'), ''), address = nullif(btrim(p ->> 'address'), ''),
      phone = v_phone, latitude = v_lat, longitude = v_lng,
      source = coalesce(nullif(btrim(p ->> 'source'), ''), source), updated_at = now()
    where id = lid;
    if not found then raise exception 'PP404: fiche introuvable'; end if;
    perform public.log_audit('listing.update', 'pharmacy_listing', lid::text, jsonb_build_object('name', p ->> 'name'));
  end if;
  return lid;
exception when unique_violation then
  raise exception 'PP409: une fiche porte déjà ce nom dans cette zone';
end $$;

create or replace function public.admin_set_listing_published(p_id uuid, p_published boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  update public.pharmacy_listings set is_published = p_published, updated_at = now() where id = p_id;
  if not found then raise exception 'PP404: fiche introuvable'; end if;
  perform public.log_audit(case when p_published then 'listing.publish' else 'listing.unpublish' end, 'pharmacy_listing', p_id::text);
end $$;

create or replace function public.admin_delete_listing(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare n text;
begin
  perform public.require_admin();
  delete from public.pharmacy_listings where id = p_id returning name into n;
  if n is null then raise exception 'PP404: fiche introuvable'; end if;
  perform public.log_audit('listing.delete', 'pharmacy_listing', p_id::text, jsonb_build_object('name', n));
end $$;

create or replace function public.admin_link_listing(p_id uuid, p_pharmacy uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  if p_pharmacy is not null and not exists (select 1 from public.pharmacies where id = p_pharmacy and status = 'verified') then
    raise exception 'PP422: seule une pharmacie vérifiée peut être rattachée';
  end if;
  update public.pharmacy_listings set claimed_pharmacy_id = p_pharmacy, updated_at = now() where id = p_id;
  if not found then raise exception 'PP404: fiche introuvable'; end if;
  perform public.log_audit(case when p_pharmacy is null then 'listing.unlink' else 'listing.link' end, 'pharmacy_listing', p_id::text,
    jsonb_build_object('pharmacy', p_pharmacy));
end $$;

-- Pharmacies vérifiées dont le nom ressemble à la fiche (aide au rattachement)
create or replace function public.admin_listing_matches(p_id uuid)
returns table (id uuid, name text, commune_name text, similarity real)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  perform public.require_admin();
  return query
  select p.id, p.name, c.name, extensions.similarity(public.normalize_text(p.name), l.search_name)
  from public.pharmacy_listings l
  join public.pharmacies p on p.status = 'verified' and p.region_id = l.region_id
  left join public.communes c on c.id = p.commune_id
  where l.id = p_id and extensions.similarity(public.normalize_text(p.name), l.search_name) > 0.25
  order by 4 desc limit 5;
end $$;

-- Import en masse. p_rows : [{line, name, region, commune, quartier, address, phone, latitude, longitude, source}]
-- Les doublons (même nom dans la même zone) sont ignorés, jamais écrasés.
create or replace function public.admin_import_listings(p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := public.require_admin();
  rec record; ok int := 0; dup int := 0; errors jsonb := '[]'::jsonb;
  v_region uuid; v_commune uuid; v_locality uuid; v_phone text; v_lat double precision; v_lng double precision; v_area text;
begin
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'PP422: format invalide'; end if;
  if jsonb_array_length(p_rows) > 5000 then raise exception 'PP422: 5 000 lignes maximum par import'; end if;
  for rec in select coalesce((e ->> 'line')::int, (o)::int + 1) as line, e from jsonb_array_elements(p_rows) with ordinality as t(e, o) loop
    begin
      if char_length(btrim(coalesce(rec.e ->> 'name', ''))) < 2 then raise exception 'PP422: nom manquant'; end if;
      v_region := public.resolve_region(rec.e ->> 'region');
      if v_region is null then raise exception 'PP422: région inconnue « % »', coalesce(rec.e ->> 'region', ''); end if;
      v_commune := public.resolve_commune(v_region, rec.e ->> 'commune');
      v_locality := public.resolve_locality(v_commune, rec.e ->> 'quartier');
      v_area := nullif(concat_ws(', ',
        case when v_locality is null then nullif(btrim(rec.e ->> 'quartier'), '') end,
        case when v_commune is null then nullif(btrim(rec.e ->> 'commune'), '') end), '');
      v_phone := public.normalize_ml_phone(rec.e ->> 'phone');
      if nullif(btrim(rec.e ->> 'phone'), '') is not null and v_phone is null then
        raise exception 'PP422: téléphone invalide « % »', rec.e ->> 'phone';
      end if;
      v_lat := nullif(replace(btrim(rec.e ->> 'latitude'), ',', '.'), '')::double precision;
      v_lng := nullif(replace(btrim(rec.e ->> 'longitude'), ',', '.'), '')::double precision;
      if (v_lat is null) <> (v_lng is null) then raise exception 'PP422: latitude et longitude vont ensemble'; end if;

      if exists (select 1 from public.pharmacy_listings l
                 where l.search_name = public.normalize_text(rec.e ->> 'name') and l.region_id = v_region
                   and l.commune_id is not distinct from v_commune) then
        dup := dup + 1;
        continue;
      end if;
      insert into public.pharmacy_listings (name, region_id, commune_id, locality_id, area_label, address, phone, latitude, longitude, source, created_by)
      values (btrim(rec.e ->> 'name'), v_region, v_commune, v_locality, v_area, nullif(btrim(rec.e ->> 'address'), ''),
              v_phone, v_lat, v_lng, coalesce(nullif(btrim(rec.e ->> 'source'), ''), 'Import CSV'), uid);
      ok := ok + 1;
    exception
      when invalid_text_representation then
        errors := errors || jsonb_build_object('row', rec.line, 'error', 'coordonnées invalides');
      when check_violation then
        errors := errors || jsonb_build_object('row', rec.line, 'error', 'valeur hors limites (nom trop long ou coordonnées hors du Mali)');
      when unique_violation then
        dup := dup + 1;
      when others then
        errors := errors || jsonb_build_object('row', rec.line, 'error', regexp_replace(sqlerrm, '^PP[0-9]+: ', ''));
    end;
  end loop;
  perform public.log_audit('listing.import', 'pharmacy_listing', null,
    jsonb_build_object('imported', ok, 'duplicates', dup, 'failed', jsonb_array_length(errors)));
  return jsonb_build_object('imported', ok, 'duplicates', dup, 'failed', jsonb_array_length(errors), 'errors', errors);
end $$;

-- ---------------------------------------------------------------------------
-- Annuaire public : pharmacies vérifiées + fiches non inscrites
-- Ordre neutre : distance si une position est donnée, sinon alphabétique.
-- ---------------------------------------------------------------------------
create or replace function public.pharmacy_directory(
  p_query text default null, p_region uuid default null, p_commune uuid default null,
  p_lat double precision default null, p_lng double precision default null,
  p_kind text default 'all', p_limit int default 30, p_offset int default 0)
returns table (kind text, id uuid, name text, address text, area text, phone text,
               latitude double precision, longitude double precision, distance_km double precision,
               is_demo boolean, total_count bigint)
language sql stable security definer set search_path = public, extensions as $$
  with q as (select nullif(public.normalize_text(p_query), '') as t),
  d as (
    select 'verified'::text as kind, p.id, p.name, p.address,
           concat_ws(', ', lo.name, c.name, r.name) as area, p.phone, p.latitude, p.longitude,
           public.distance_km(p_lat, p_lng, p.latitude, p.longitude) as distance_km, p.is_demo, public.normalize_text(p.name) as sn
    from public.pharmacies p
    join public.regions r on r.id = p.region_id
    left join public.communes c on c.id = p.commune_id
    left join public.localities lo on lo.id = p.locality_id
    where p.status = 'verified' and coalesce(p_kind, 'all') in ('all', 'verified')
      and (p_region is null or p.region_id = p_region) and (p_commune is null or p.commune_id = p_commune)
    union all
    select 'listing', l.id, l.name, l.address,
           concat_ws(', ', lo.name, l.area_label, c.name, r.name), l.phone, l.latitude, l.longitude,
           public.distance_km(p_lat, p_lng, l.latitude, l.longitude), l.is_demo, l.search_name
    from public.pharmacy_listings l
    join public.regions r on r.id = l.region_id
    left join public.communes c on c.id = l.commune_id
    left join public.localities lo on lo.id = l.locality_id
    where l.is_published and l.claimed_pharmacy_id is null and coalesce(p_kind, 'all') in ('all', 'listing')
      and (p_region is null or l.region_id = p_region) and (p_commune is null or l.commune_id = p_commune)
  )
  select d.kind, d.id, d.name, d.address, d.area, d.phone, d.latitude, d.longitude, d.distance_km, d.is_demo,
         count(*) over ()
  from d, q
  where q.t is null or d.sn like '%' || q.t || '%' or extensions.similarity(d.sn, q.t) > 0.3
  order by d.distance_km nulls last, d.sn, d.id
  limit least(greatest(coalesce(p_limit, 30), 1), 100) offset greatest(coalesce(p_offset, 0), 0)
$$;
alter function public.pharmacy_directory(text, uuid, uuid, double precision, double precision, text, int, int) set statement_timeout = '5s';

-- Points de la carte pour les fiches non inscrites géolocalisées
create or replace function public.map_listings(p_region uuid default null, p_commune uuid default null,
                                                p_lat double precision default null, p_lng double precision default null)
returns table (id uuid, name text, address text, phone text, latitude double precision, longitude double precision,
               area text, distance_km double precision)
language sql stable security definer set search_path = public as $$
  select l.id, l.name, l.address, l.phone, l.latitude, l.longitude,
         concat_ws(', ', l.area_label, c.name), public.distance_km(p_lat, p_lng, l.latitude, l.longitude)
  from public.pharmacy_listings l
  left join public.communes c on c.id = l.commune_id
  where l.is_published and l.claimed_pharmacy_id is null and l.latitude is not null
    and (p_region is null or l.region_id = p_region) and (p_commune is null or l.commune_id = p_commune)
  order by 8 nulls last, l.name
  limit 500
$$;

revoke execute on function public.admin_save_listing(jsonb), public.admin_set_listing_published(uuid, boolean),
  public.admin_delete_listing(uuid), public.admin_link_listing(uuid, uuid), public.admin_listing_matches(uuid),
  public.admin_import_listings(jsonb) from public, anon;
grant execute on function public.admin_save_listing(jsonb), public.admin_set_listing_published(uuid, boolean),
  public.admin_delete_listing(uuid), public.admin_link_listing(uuid, uuid), public.admin_listing_matches(uuid),
  public.admin_import_listings(jsonb) to authenticated;
grant execute on function public.pharmacy_directory(text, uuid, uuid, double precision, double precision, text, int, int),
  public.map_listings(uuid, uuid, double precision, double precision) to anon, authenticated;

-- Statistiques d'administration
create or replace function public.admin_listing_stats()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_admin();
  return jsonb_build_object(
    'total', (select count(*) from public.pharmacy_listings),
    'published', (select count(*) from public.pharmacy_listings where is_published and claimed_pharmacy_id is null),
    'claimed', (select count(*) from public.pharmacy_listings where claimed_pharmacy_id is not null),
    'with_phone', (select count(*) from public.pharmacy_listings where phone is not null),
    'with_position', (select count(*) from public.pharmacy_listings where latitude is not null));
end $$;
revoke execute on function public.admin_listing_stats() from public, anon;
grant execute on function public.admin_listing_stats() to authenticated;
