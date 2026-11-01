-- ============================================================================
-- PharmaProxi — Migration : assurances santé et réseaux de soins (tiers payant)
--   * insurers : compagnies d'assurance / mutuelles, avec la date et l'origine de
--     la liste de leurs partenaires (liste communiquée par l'assureur).
--   * insurer_providers : pharmacies, cliniques, laboratoires… partenaires.
--     Seuls le nom de la structure, la catégorie, la zone, l'adresse et les
--     téléphones sont enregistrés (pas de nom de praticien ni d'e-mail personnel).
--   * lien automatique avec les pharmacies inscrites (même nom, même région),
--     corrigeable par l'administration.
-- Peut être relancé sans erreur.
-- ============================================================================

create table if not exists public.insurers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  kind text not null default 'assurance' check (kind in ('assurance', 'mutuelle', 'autre')),
  phone text check (phone is null or public.valid_phone(phone)),
  website text check (website is null or website ~ '^https?://'),
  network_date date,              -- date de la liste des partenaires
  network_source text check (char_length(coalesce(network_source, '')) <= 300),
  notes text check (char_length(coalesce(notes, '')) <= 600),   -- conditions affichées (carte, plafonds…)
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.insurers enable row level security;
drop policy if exists "pp_insurers_read" on public.insurers;
create policy "pp_insurers_read" on public.insurers for select to anon, authenticated using (is_published or public.is_admin());
revoke insert, update, delete on public.insurers from anon, authenticated;
grant select on public.insurers to anon, authenticated;

create table if not exists public.insurer_providers (
  id uuid primary key default gen_random_uuid(),
  insurer_id uuid not null references public.insurers(id) on delete cascade,
  category text not null check (category in ('pharmacie', 'clinique', 'laboratoire', 'imagerie', 'dentaire', 'optique', 'reeducation', 'hopital', 'autre')),
  name text not null check (char_length(btrim(name)) between 2 and 200),
  area text check (char_length(coalesce(area, '')) <= 80),        -- commune ou ville, telle que dans la liste
  region_id uuid references public.regions(id) on delete set null,
  commune_id uuid references public.communes(id) on delete set null,
  address text check (char_length(coalesce(address, '')) <= 250),
  phones text[] not null default '{}',
  pharmacy_id uuid references public.pharmacies(id) on delete set null,
  link_manual boolean not null default false,
  is_published boolean not null default true,
  search_text text generated always as (public.normalize_text(name || ' ' || coalesce(area, '') || ' ' || coalesce(address, ''))) stored,
  created_at timestamptz not null default now()
);
create unique index if not exists insurer_providers_unique on public.insurer_providers (insurer_id, public.normalize_text(name), public.normalize_text(coalesce(area, '')));
create index if not exists insurer_providers_trgm on public.insurer_providers using gin (search_text extensions.gin_trgm_ops);
create index if not exists insurer_providers_pharmacy on public.insurer_providers (pharmacy_id) where pharmacy_id is not null;
alter table public.insurer_providers enable row level security;
drop policy if exists "pp_insurer_providers_read" on public.insurer_providers;
create policy "pp_insurer_providers_read" on public.insurer_providers for select to anon, authenticated
  using (public.is_admin() or (is_published and exists (select 1 from public.insurers i where i.id = insurer_id and i.is_published)));
revoke insert, update, delete on public.insurer_providers from anon, authenticated;
grant select on public.insurer_providers to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Outils
-- ---------------------------------------------------------------------------
create or replace function public.insurer_category(p text)
returns text language sql immutable set search_path = public as $$
  select case
    when t ~ 'pharma' then 'pharmacie'
    when t ~ 'labo|biolog|analyse' then 'laboratoire'
    when t ~ 'imagerie|radio|scanner|echograph' then 'imagerie'
    when t ~ 'dentaire|dentist|stomato' then 'dentaire'
    when t ~ 'opti|ophtalm' then 'optique'
    when t ~ 'reeduc|kine|readapt' then 'reeducation'
    when t ~ 'hopital|csref|csrf|chu' then 'hopital'
    when t ~ 'clinique|polyclinique|cabinet|centre medical|medical' then 'clinique'
    else 'autre' end
  from (select public.normalize_text(p) as t) x
$$;

-- « Pharmacie Dina » ↔ « PHARMACIE DINA » ; « Pharmacie la Croix Rouge » ↔ « Croix Rouge »
create or replace function public.pharmacy_name_key(p text)
returns text language sql immutable set search_path = public as $$
  select btrim(regexp_replace(regexp_replace(public.normalize_text(p), '^(pharmacie|officine)\s+(de la |du |des |de l''|la |le |l'')?', ''), '[^a-z0-9]+', ' ', 'g'))
$$;

-- Lien automatique avec une pharmacie inscrite : même nom, même région (si connue), un seul candidat
create or replace function public.insurer_link_pharmacies(p_insurer uuid default null)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update public.insurer_providers ip set pharmacy_id = null
   where not link_manual and (p_insurer is null or insurer_id = p_insurer);
  with cand as (
    select ip.id as prov, (array_agg(p.id))[1] as ph, count(*) as c
      from public.insurer_providers ip
      join public.pharmacies p on public.pharmacy_name_key(p.name) = public.pharmacy_name_key(ip.name)
       and p.status = 'verified' and (ip.region_id is null or p.region_id = ip.region_id)
     where ip.category = 'pharmacie' and not ip.link_manual and (p_insurer is null or ip.insurer_id = p_insurer)
       and char_length(public.pharmacy_name_key(ip.name)) >= 3
     group by ip.id)
  update public.insurer_providers ip set pharmacy_id = cand.ph from cand where cand.prov = ip.id and cand.c = 1;
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- Administration
-- ---------------------------------------------------------------------------
create or replace function public.admin_save_insurer(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid := nullif(p ->> 'id', '')::uuid; v_slug text; v_phone text;
begin
  perform public.require_admin();
  if char_length(btrim(coalesce(p ->> 'name', ''))) < 2 then raise exception 'PP422: nom de l''assureur obligatoire'; end if;
  v_slug := coalesce(nullif(btrim(p ->> 'slug'), ''), btrim(regexp_replace(public.normalize_text(p ->> 'name'), '[^a-z0-9]+', '-', 'g'), '-'));
  v_phone := case when btrim(coalesce(p ->> 'phone', '')) = '' then null else public.normalize_ml_phone(p ->> 'phone') end;
  if btrim(coalesce(p ->> 'phone', '')) <> '' and v_phone is null then raise exception 'PP422: téléphone invalide'; end if;
  if v_id is null then
    insert into public.insurers (name, slug, kind, phone, website, network_date, network_source, notes, is_published)
    values (btrim(p ->> 'name'), v_slug, coalesce(nullif(p ->> 'kind', ''), 'assurance'), v_phone, nullif(btrim(coalesce(p ->> 'website', '')), ''),
            nullif(p ->> 'network_date', '')::date, nullif(btrim(coalesce(p ->> 'network_source', '')), ''), nullif(btrim(coalesce(p ->> 'notes', '')), ''),
            coalesce((p ->> 'is_published')::boolean, true))
    returning id into v_id;
  else
    update public.insurers set name = btrim(p ->> 'name'), slug = v_slug, kind = coalesce(nullif(p ->> 'kind', ''), kind), phone = v_phone,
      website = nullif(btrim(coalesce(p ->> 'website', '')), ''), network_date = nullif(p ->> 'network_date', '')::date,
      network_source = nullif(btrim(coalesce(p ->> 'network_source', '')), ''), notes = nullif(btrim(coalesce(p ->> 'notes', '')), ''),
      is_published = coalesce((p ->> 'is_published')::boolean, is_published), updated_at = now()
    where id = v_id;
    if not found then raise exception 'PP404: assureur introuvable'; end if;
  end if;
  perform public.log_audit('insurer.save', 'insurer', v_id::text, p - 'notes');
  return v_id;
exception
  when unique_violation then raise exception 'PP409: un assureur porte déjà ce nom court (adresse de la page)';
  when check_violation or invalid_datetime_format or invalid_text_representation then raise exception 'PP422: valeurs invalides (site en http, date valide)';
end $$;

create or replace function public.admin_delete_insurer(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  delete from public.insurers where id = p_id;
  perform public.log_audit('insurer.delete', 'insurer', p_id::text);
end $$;

-- Import de la liste des partenaires. p_rows : [{line, categorie|type, nom|structure, zone|commune|region, region_nom, adresse, telephone, telephone2, telephone3}]
create or replace function public.insurer_import_rows(p_insurer uuid, p_rows jsonb, p_replace boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare rec record; ok int := 0; dup int := 0; errors jsonb := '[]'::jsonb; removed int := 0;
        v_name text; v_area text; v_region uuid; v_commune uuid; v_phones text[]; v_cat text; ph text; t text;
begin
  if not exists (select 1 from public.insurers where id = p_insurer) then raise exception 'PP404: assureur introuvable'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 5000 then raise exception 'PP422: 5 000 lignes maximum par lot'; end if;
  if p_replace then delete from public.insurer_providers where insurer_id = p_insurer and not link_manual; get diagnostics removed = row_count; end if;
  for rec in select coalesce((e ->> 'line')::int, o::int + 1) as line, e from jsonb_array_elements(p_rows) with ordinality as t(e, o) loop
    begin
      v_name := btrim(regexp_replace(coalesce(nullif(rec.e ->> 'nom', ''), rec.e ->> 'structure', ''), '\s+', ' ', 'g'));
      if char_length(v_name) < 2 then raise exception 'PP422: nom de la structure manquant'; end if;
      v_area := nullif(btrim(regexp_replace(coalesce(nullif(rec.e ->> 'zone', ''), nullif(rec.e ->> 'commune', ''), rec.e ->> 'region', ''), '\s+', ' ', 'g')), '');
      v_cat := public.insurer_category(coalesce(nullif(rec.e ->> 'categorie', ''), rec.e ->> 'type', '') || ' ' || v_name);
      -- Zone : « COMMUNE V » → District de Bamako / Commune V ; sinon région indiquée
      v_region := null; v_commune := null;
      if public.normalize_text(coalesce(v_area, '')) ~ '^commune [ivx]+$' then
        v_region := public.resolve_region('Bamako');
        select id, name into v_commune, v_area from public.communes where region_id = v_region and public.normalize_text(name) = public.normalize_text(v_area);
      else
        v_region := public.resolve_region(coalesce(nullif(rec.e ->> 'region_nom', ''), v_area));
      end if;
      v_phones := '{}';
      foreach t in array array[rec.e ->> 'telephone', rec.e ->> 'telephone2', rec.e ->> 'telephone3'] loop
        ph := case when coalesce(t, '') ~ '[[:alpha:]]' then null else public.normalize_ml_phone(t) end;   -- « Dr X 76… » : contact nominatif non repris
        if ph is not null and not ph = any(v_phones) then v_phones := v_phones || ph; end if;
      end loop;
      insert into public.insurer_providers (insurer_id, category, name, area, region_id, commune_id, address, phones)
      values (p_insurer, v_cat, v_name, case when v_commune is null then initcap(lower(v_area)) else v_area end, v_region, v_commune,
              nullif(btrim(regexp_replace(coalesce(rec.e ->> 'adresse', ''), '\s+', ' ', 'g')), ''), v_phones);
      ok := ok + 1;
    exception
      when unique_violation then dup := dup + 1;
      when others then errors := errors || jsonb_build_object('row', rec.line, 'error', regexp_replace(sqlerrm, '^PP[0-9]+: ', ''));
    end;
  end loop;
  perform public.insurer_link_pharmacies(p_insurer);
  perform public.log_audit('insurer.import', 'insurer', p_insurer::text, jsonb_build_object('imported', ok, 'duplicates', dup, 'failed', jsonb_array_length(errors), 'replaced', removed));
  return jsonb_build_object('imported', ok, 'duplicates', dup, 'failed', jsonb_array_length(errors), 'errors', errors, 'replaced', removed);
end $$;

create or replace function public.admin_import_insurer_network(p_insurer uuid, p_rows jsonb, p_replace boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  return public.insurer_import_rows(p_insurer, p_rows, p_replace);
end $$;

-- Lien manuel : p_pharmacy null + p_none → aucun lien ; p_pharmacy null sans p_none → retour à l'automatique
create or replace function public.admin_link_provider(p_provider uuid, p_pharmacy uuid, p_none boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare v_ins uuid;
begin
  perform public.require_admin();
  select insurer_id into v_ins from public.insurer_providers where id = p_provider;
  if v_ins is null then raise exception 'PP404: partenaire introuvable'; end if;
  if p_pharmacy is null and not coalesce(p_none, false) then
    update public.insurer_providers set link_manual = false, pharmacy_id = null where id = p_provider;
    perform public.insurer_link_pharmacies(v_ins);
  else
    update public.insurer_providers set link_manual = true, pharmacy_id = p_pharmacy where id = p_provider;
  end if;
end $$;

create or replace function public.admin_set_provider_published(p_provider uuid, p_published boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  update public.insurer_providers set is_published = coalesce(p_published, true) where id = p_provider;
end $$;

-- ---------------------------------------------------------------------------
-- Lecture publique
-- ---------------------------------------------------------------------------
create or replace function public.insurers_overview()
returns table (id uuid, name text, slug text, kind text, network_date date, total bigint, pharmacies bigint, regions bigint)
language sql stable security definer set search_path = public as $$
  select i.id, i.name, i.slug, i.kind, i.network_date, count(p.id), count(p.id) filter (where p.category = 'pharmacie'), count(distinct p.region_id)
    from public.insurers i left join public.insurer_providers p on p.insurer_id = i.id and p.is_published
   where i.is_published group by i.id order by i.name
$$;

create or replace function public.search_insurer_network(p_insurer uuid, p_query text default null, p_category text default null, p_region uuid default null,
                                                         p_limit int default 25, p_offset int default 0)
returns table (id uuid, category text, name text, area text, region_name text, address text, phones text[], pharmacy_id uuid, total_count bigint)
language sql stable security definer set search_path = public, extensions as $$
  with q as (select nullif(public.normalize_text(left(coalesce(p_query, ''), 80)), '') as t)
  select p.id, p.category, p.name, p.area, r.name, p.address, p.phones,
         case when ph.status = 'verified' then p.pharmacy_id end, count(*) over ()
    from public.insurer_providers p
    join public.insurers i on i.id = p.insurer_id and i.is_published
    left join public.regions r on r.id = p.region_id
    left join public.pharmacies ph on ph.id = p.pharmacy_id
    cross join q
   where p.insurer_id = p_insurer and p.is_published
     and (p_category is null or p.category = p_category)
     and (p_region is null or p.region_id = p_region)
     and (q.t is null or not exists (select 1 from regexp_split_to_table(q.t, '\s+') w where w <> '' and p.search_text not like '%' || w || '%'))
   order by (p.region_id = public.resolve_region('Bamako')) desc nulls last, p.area, p.category, p.name
   limit least(greatest(coalesce(p_limit, 25), 1), 100) offset greatest(coalesce(p_offset, 0), 0)
$$;
alter function public.search_insurer_network(uuid, text, text, uuid, int, int) set statement_timeout = '5s';

create or replace function public.pharmacy_insurers(p_pharmacy uuid)
returns table (name text, slug text) language sql stable security definer set search_path = public as $$
  select distinct i.name, i.slug from public.insurer_providers p join public.insurers i on i.id = p.insurer_id
   where p.pharmacy_id = p_pharmacy and p.is_published and i.is_published order by i.name
$$;

revoke execute on function public.insurer_link_pharmacies(uuid), public.insurer_import_rows(uuid, jsonb, boolean), public.admin_save_insurer(jsonb), public.admin_delete_insurer(uuid),
  public.admin_import_insurer_network(uuid, jsonb, boolean), public.admin_link_provider(uuid, uuid, boolean), public.admin_set_provider_published(uuid, boolean) from public, anon;
grant execute on function public.admin_save_insurer(jsonb), public.admin_delete_insurer(uuid), public.admin_import_insurer_network(uuid, jsonb, boolean),
  public.admin_link_provider(uuid, uuid, boolean), public.admin_set_provider_published(uuid, boolean) to authenticated;
revoke execute on function public.insurer_link_pharmacies(uuid), public.insurer_import_rows(uuid, jsonb, boolean) from authenticated;
grant execute on function public.insurers_overview(), public.search_insurer_network(uuid, text, text, uuid, int, int), public.pharmacy_insurers(uuid) to anon, authenticated;

-- Une pharmacie vérifiée (ou renommée) : nouveau rapprochement automatique
create or replace function public.pharmacy_insurer_relink()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'verified' and (tg_op = 'INSERT' or old.status is distinct from new.status or old.name is distinct from new.name or old.region_id is distinct from new.region_id) then
    perform public.insurer_link_pharmacies(null);
  end if;
  return new;
end $$;
drop trigger if exists pharmacies_insurer_relink on public.pharmacies;
create trigger pharmacies_insurer_relink after insert or update of status, name, region_id on public.pharmacies
  for each row execute function public.pharmacy_insurer_relink();
revoke execute on function public.pharmacy_insurer_relink() from public, anon, authenticated;
