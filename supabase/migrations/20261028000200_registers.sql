-- ============================================================================
-- PharmaProxi — Migration : registres publics
--   1. Tableau de l'Ordre des médecins (registre officiel publié par l'Ordre) :
--      nom, prénom, spécialité, structure, conseil régional. Aucune coordonnée
--      personnelle. Distinct des fiches médecins vérifiées (contacts, plannings).
--   2. Établissements de santé non encore vérifiés (fiches d'annuaire simples).
--   3. Spécialités complémentaires présentes au Tableau.
-- ============================================================================

insert into public.medical_specialties (code, name, family, description, sort_order) values
  ('sante_publique', 'Santé publique', 'Santé publique et prévention', 'Le médecin de santé publique s''occupe de la prévention, de l''épidémiologie et de l''organisation des soins pour la population.', 100),
  ('medecine_travail', 'Médecine du travail', 'Santé publique et prévention', 'Le médecin du travail suit la santé des salariés en lien avec leur poste.', 101),
  ('medecine_urgence', 'Médecine d''urgence', 'Diagnostic et soins critiques', 'L''urgentiste prend en charge les situations médicales urgentes.', 83),
  ('medecine_legale', 'Médecine légale', 'Diagnostic et soins critiques', 'Le médecin légiste réalise les expertises médicales demandées par la justice.', 84),
  ('anatomopathologie', 'Anatomie et cytologie pathologiques', 'Diagnostic et soins critiques', 'L''anatomopathologiste analyse les tissus et les cellules prélevés (biopsies).', 85),
  ('chirurgie_cardio_thoracique', 'Chirurgie thoracique et cardiovasculaire', 'Chirurgie', 'Le chirurgien thoracique et cardiovasculaire opère le cœur, les vaisseaux et le thorax.', 56),
  ('chirurgie_plastique', 'Chirurgie plastique et reconstructrice', 'Chirurgie', 'Le chirurgien plasticien répare et reconstruit (brûlures, malformations, cicatrices).', 57),
  ('medecine_physique', 'Médecine physique et réadaptation', 'Médecine de l''adulte', 'Le médecin rééducateur aide à retrouver ses capacités après un accident ou une maladie.', 33),
  ('geriatrie', 'Gériatrie', 'Médecine de l''adulte', 'Le gériatre s''occupe de la santé des personnes âgées.', 34),
  ('medecine_sport', 'Médecine du sport', 'Médecine de l''adulte', 'Le médecin du sport suit les sportifs et la pratique de l''activité physique.', 35)
on conflict (code) do nothing;

-- Correspondance libellé du Tableau → code de spécialité (NULL si non clinique / inconnu)
create or replace function public.register_specialty_code(p_label text)
returns text language plpgsql immutable as $$
declare t text := public.normalize_text(coalesce(p_label, ''));
begin
  if t = '' then return null; end if;
  return case
    when t ~ 'hemato.?biolog|parasitolog|microbiolog|genetique|biologie' then 'biologie'
    when t ~ 'anatomie|cytologie' then 'anatomopathologie'
    when t ~ '^generaliste|medecine generale|mc/mf|medecine de famille|communautaire' then 'medecine_generale'
    when t ~ 'medecine interne' then 'medecine_interne'
    when t ~ 'chirurgie thorac' then 'chirurgie_cardio_thoracique'
    when t ~ 'cardiolog' then 'cardiologie'
    when t ~ 'pneumolog' then 'pneumologie'
    when t ~ 'gastro|coloprocto' then case when t ~ 'chirurg' then 'chirurgie_generale' else 'gastro_enterologie' end
    when t ~ 'nephrolog' then 'nephrologie'
    when t ~ 'endocrin|diabet|^nutrition' then 'endocrinologie'
    when t ~ 'rhumatolog' then 'rhumatologie'
    when t ~ 'infectieu|infectiolog' then 'infectiologie'
    when t ~ 'hematolog' then 'hematologie'
    when t ~ 'oncolog|radiotherap' then 'oncologie'
    when t ~ 'neurochirurg' then 'neurochirurgie'
    when t ~ 'neurolog' then 'neurologie'
    when t ~ 'dermatolog' then 'dermatologie'
    when t ~ 'gynecolog|obstetri' then 'gynecologie'
    when t ~ 'chirurgie pediatr' then 'chirurgie_pediatrique'
    when t ~ 'pediatr' then 'pediatrie'
    when t ~ 'neonatolog' then 'neonatologie'
    when t ~ 'plastique|esthetique' then 'chirurgie_plastique'
    when t ~ 'maxillo|stomatologie et cmf|cmf' then 'chirurgie_maxillo_faciale'
    when t ~ 'stomatolog' then 'stomatologie'
    when t ~ 'orthoped|traumatolog|^c\.o' then 'traumatologie'
    when t ~ 'urolog' then 'urologie'
    when t ~ 'chirurgie generale|chirurgie visceral' then 'chirurgie_generale'
    when t ~ 'ophtalmolog' then 'ophtalmologie'
    when t ~ '^orl|oto-rhino' then 'orl'
    when t ~ 'pedopsychiatr' then 'pedopsychiatrie'
    when t ~ 'psychiatr' then 'psychiatrie'
    when t ~ 'radiolog|imagerie|nucleaire' then 'radiologie'
    when t ~ 'anesthes|reanimation' then 'anesthesie'
    when t ~ 'urgence' then 'medecine_urgence'
    when t ~ 'legale' then 'medecine_legale'
    when t ~ 'physique et readaptation' then 'medecine_physique'
    when t ~ 'geriatr' then 'geriatrie'
    when t ~ 'sport' then 'medecine_sport'
    when t ~ 'travail' then 'medecine_travail'
    when t ~ 'sante publique|epidemiolog|promotion de la sante|medecine preventive' then 'sante_publique'
    when t ~ 'dentaire|odonto' then 'chirurgie_dentaire'
    else null
  end;
end $$;

-- Conseil régional de l'Ordre (« CROM GAO », « NIORO SAHEL ») → région
create or replace function public.resolve_crom_region(p text)
returns uuid language sql stable set search_path = public as $$
  select public.resolve_region(case public.normalize_text(regexp_replace(coalesce(p, ''), '^\s*crom\s+', '', 'i'))
    when 'nioro sahel' then 'Nioro' when 'nioro du sahel' then 'Nioro'
    when 'taoudenni' then 'Taoudénit' when 'taoudeni' then 'Taoudénit'
    else regexp_replace(coalesce(p, ''), '^\s*crom\s+', '', 'i') end)
$$;

-- ---------------------------------------------------------------------------
-- 1. Tableau de l'Ordre des médecins
-- ---------------------------------------------------------------------------
create table public.doctor_register (
  id uuid primary key default gen_random_uuid(),
  register_year smallint not null check (register_year between 2000 and 2100),
  order_no int,
  registration_number text check (char_length(coalesce(registration_number, '')) <= 40),
  last_name text not null check (char_length(last_name) between 1 and 120),
  first_name text not null default '' check (char_length(first_name) <= 120),
  specialty_label text check (char_length(coalesce(specialty_label, '')) <= 160),
  specialty_id uuid references public.medical_specialties(id) on delete set null,
  structure text check (char_length(coalesce(structure, '')) <= 200),
  crom text check (char_length(coalesce(crom, '')) <= 60),
  region_id uuid references public.regions(id) on delete set null,
  is_published boolean not null default true,
  search_text text generated always as (public.normalize_text(
    coalesce(last_name, '') || ' ' || coalesce(first_name, '') || ' ' || coalesce(structure, '') || ' ' || coalesce(specialty_label, ''))) stored,
  created_at timestamptz not null default now()
);
create unique index doctor_register_unique on public.doctor_register
  (register_year, coalesce(registration_number, ''), public.normalize_text(last_name), public.normalize_text(first_name));
create index doctor_register_search_trgm on public.doctor_register using gin (search_text extensions.gin_trgm_ops);
create index doctor_register_filters on public.doctor_register (register_year, specialty_id, region_id) where is_published;
create index doctor_register_regno on public.doctor_register (registration_number);

alter table public.doctor_register enable row level security;
create policy "pp_register_public_read" on public.doctor_register for select to anon, authenticated using (is_published);
create policy "pp_register_admin_read" on public.doctor_register for select to authenticated using (public.is_admin());
revoke insert, update, delete on public.doctor_register from anon, authenticated;
grant select on public.doctor_register to anon, authenticated;

-- Médecins ayant demandé à ne pas figurer sur PharmaProxi : le choix survit aux imports suivants
create table public.register_optouts (
  registration_number text not null default '',
  last_name_norm text not null,
  first_name_norm text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (registration_number, last_name_norm, first_name_norm)
);
alter table public.register_optouts enable row level security;
create policy "pp_optouts_admin_read" on public.register_optouts for select to authenticated using (public.is_admin());
revoke insert, update, delete on public.register_optouts from anon, authenticated;

-- Import (par lots). p_rows : [{ordre, inscription, nom, prenom, specialite, structure, crom}]
-- p_replace = true : remplace l'édition de l'année (premier lot d'un nouvel import).
create or replace function public.admin_import_doctor_register(p_year int, p_rows jsonb, p_replace boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := public.require_admin();
  rec record; ok int := 0; dup int := 0; errors jsonb := '[]'::jsonb; v_code text; v_region uuid; removed int := 0;
begin
  if p_year is null or p_year < 2000 or p_year > 2100 then raise exception 'PP422: année invalide'; end if;
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'PP422: format invalide'; end if;
  if jsonb_array_length(p_rows) > 6000 then raise exception 'PP422: 6 000 lignes maximum par lot'; end if;
  if p_replace then
    delete from public.doctor_register where register_year = p_year;
    get diagnostics removed = row_count;
  end if;
  for rec in select coalesce((e ->> 'line')::int, o::int + 1) as line, e from jsonb_array_elements(p_rows) with ordinality as t(e, o) loop
    begin
      if char_length(btrim(coalesce(rec.e ->> 'nom', ''))) < 1 then raise exception 'PP422: nom manquant'; end if;
      v_code := public.register_specialty_code(rec.e ->> 'specialite');
      v_region := public.resolve_crom_region(rec.e ->> 'crom');
      insert into public.doctor_register (register_year, order_no, registration_number, last_name, first_name, specialty_label, specialty_id, structure, crom, region_id, is_published)
      values (p_year, nullif(regexp_replace(coalesce(rec.e ->> 'ordre', ''), '\D', '', 'g'), '')::int,
              nullif(btrim(rec.e ->> 'inscription'), ''), btrim(rec.e ->> 'nom'), coalesce(btrim(rec.e ->> 'prenom'), ''),
              nullif(btrim(rec.e ->> 'specialite'), ''), (select id from public.medical_specialties where code = v_code),
              nullif(btrim(rec.e ->> 'structure'), ''), nullif(btrim(regexp_replace(coalesce(rec.e ->> 'crom', ''), '^\s*crom\s+', '', 'i')), ''), v_region,
              not exists (select 1 from public.register_optouts o
                          where o.registration_number = coalesce(nullif(btrim(rec.e ->> 'inscription'), ''), '')
                            and o.last_name_norm = public.normalize_text(rec.e ->> 'nom')
                            and o.first_name_norm = public.normalize_text(coalesce(rec.e ->> 'prenom', ''))));
      ok := ok + 1;
    exception
      when unique_violation then dup := dup + 1;
      when others then errors := errors || jsonb_build_object('row', rec.line, 'error', regexp_replace(sqlerrm, '^PP[0-9]+: ', ''));
    end;
  end loop;
  perform public.log_audit('register.import', 'doctor_register', p_year::text,
    jsonb_build_object('imported', ok, 'duplicates', dup, 'failed', jsonb_array_length(errors), 'replaced', removed));
  return jsonb_build_object('imported', ok, 'duplicates', dup, 'failed', jsonb_array_length(errors), 'errors', errors, 'replaced', removed);
end $$;

create or replace function public.admin_set_register_published(p_id uuid, p_published boolean)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_admin(); r public.doctor_register;
begin
  update public.doctor_register set is_published = p_published where id = p_id returning * into r;
  if r.id is null then raise exception 'PP404: entrée introuvable'; end if;
  if p_published then
    delete from public.register_optouts
    where registration_number = coalesce(r.registration_number, '') and last_name_norm = public.normalize_text(r.last_name)
      and first_name_norm = public.normalize_text(r.first_name);
  else
    insert into public.register_optouts (registration_number, last_name_norm, first_name_norm, created_by)
    values (coalesce(r.registration_number, ''), public.normalize_text(r.last_name), public.normalize_text(r.first_name), uid)
    on conflict do nothing;
  end if;
  perform public.log_audit(case when p_published then 'register.publish' else 'register.unpublish' end, 'doctor_register', p_id::text);
end $$;

-- Recherche publique. Les médecins qui ont une fiche vérifiée et publiée (même n° d'inscription)
-- n'apparaissent pas en double : leur fiche complète est affichée à la place.
create or replace function public.search_doctor_register(
  p_query text default null, p_specialty uuid default null, p_region uuid default null,
  p_limit int default 20, p_offset int default 0)
returns table (id uuid, register_year smallint, registration_number text, last_name text, first_name text,
               specialty_label text, specialty_name text, structure text, crom text, region_name text, total_count bigint)
language sql stable security definer set search_path = public, extensions as $$
  with q as (select nullif(public.normalize_text(p_query), '') as t),
  latest as (select max(register_year) as y from public.doctor_register where is_published)
  select r.id, r.register_year, r.registration_number, r.last_name, r.first_name, r.specialty_label, s.name, r.structure, r.crom, rg.name,
         count(*) over ()
  from public.doctor_register r
  cross join q cross join latest
  left join public.medical_specialties s on s.id = r.specialty_id
  left join public.regions rg on rg.id = r.region_id
  where r.is_published and r.register_year = latest.y
    and (p_specialty is null or r.specialty_id = p_specialty)
    and (p_region is null or r.region_id = p_region)
    and (q.t is null or not exists (
          select 1 from regexp_split_to_table(q.t, '\s+') w where w <> '' and r.search_text not like '%' || w || '%'))
    and not exists (
          select 1 from public.doctor_private dp
          where r.registration_number is not null and dp.order_number = r.registration_number and public.doctor_is_public(dp.doctor_id))
  order by public.normalize_text(r.last_name), public.normalize_text(r.first_name), r.id
  limit least(greatest(coalesce(p_limit, 20), 1), 50) offset greatest(coalesce(p_offset, 0), 0)
$$;
alter function public.search_doctor_register(text, uuid, uuid, int, int) set statement_timeout = '5s';

create or replace function public.register_summary()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('year', max(register_year), 'total', count(*))
  from public.doctor_register where is_published and register_year = (select max(register_year) from public.doctor_register where is_published)
$$;

-- ---------------------------------------------------------------------------
-- 2. Établissements de santé non encore vérifiés
-- ---------------------------------------------------------------------------
create table public.facility_listings (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 160),
  kind text not null default 'centre_sante'
    check (kind in ('clinique', 'cabinet', 'cabinet_dentaire', 'centre_sante', 'csref', 'hopital', 'imagerie', 'laboratoire')),
  category_label text check (char_length(coalesce(category_label, '')) <= 100),
  region_id uuid references public.regions(id) on delete set null,
  city_label text check (char_length(coalesce(city_label, '')) <= 100),
  address text check (char_length(coalesce(address, '')) <= 300),
  phone text check (phone is null or public.valid_phone(phone)),
  phone2 text check (phone2 is null or public.valid_phone(phone2)),
  latitude double precision check (latitude is null or latitude between 9.5 and 25.5),
  longitude double precision check (longitude is null or longitude between -12.8 and 4.8),
  source text not null default 'Saisie administrateur' check (char_length(source) between 1 and 200),
  is_published boolean not null default true,
  claimed_clinic_id uuid references public.clinics(id) on delete set null,
  search_name text generated always as (public.normalize_text(name)) stored,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((latitude is null) = (longitude is null))
);
create unique index facility_listings_dedup on public.facility_listings
  (search_name, coalesce(region_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index facility_listings_trgm on public.facility_listings using gin (search_name extensions.gin_trgm_ops);

alter table public.facility_listings enable row level security;
create policy "pp_facilities_public_read" on public.facility_listings for select to anon, authenticated
  using (is_published and claimed_clinic_id is null);
create policy "pp_facilities_admin_read" on public.facility_listings for select to authenticated using (public.is_admin());
revoke insert, update, delete on public.facility_listings from anon, authenticated;
grant select on public.facility_listings to anon, authenticated;

-- p_rows : [{line, nom, type, categorie, region, ville, adresse, telephone, telephone2, latitude, longitude, source}]
create or replace function public.admin_import_facility_listings(p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := public.require_admin();
  rec record; ok int := 0; dup int := 0; errors jsonb := '[]'::jsonb;
  v_region uuid; v_kind text; v_p1 text; v_p2 text; v_lat double precision; v_lng double precision;
begin
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'PP422: format invalide'; end if;
  if jsonb_array_length(p_rows) > 5000 then raise exception 'PP422: 5 000 lignes maximum par import'; end if;
  for rec in select coalesce((e ->> 'line')::int, o::int + 1) as line, e from jsonb_array_elements(p_rows) with ordinality as t(e, o) loop
    begin
      if char_length(btrim(coalesce(rec.e ->> 'nom', ''))) < 2 then raise exception 'PP422: nom manquant'; end if;
      v_region := case when nullif(btrim(rec.e ->> 'region'), '') is null then null else public.resolve_region(rec.e ->> 'region') end;
      if nullif(btrim(rec.e ->> 'region'), '') is not null and v_region is null then
        raise exception 'PP422: région inconnue « % »', rec.e ->> 'region';
      end if;
      v_kind := coalesce(nullif(btrim(rec.e ->> 'type'), ''), 'centre_sante');
      if v_kind not in ('clinique', 'cabinet', 'cabinet_dentaire', 'centre_sante', 'csref', 'hopital', 'imagerie', 'laboratoire') then
        raise exception 'PP422: type inconnu « % »', v_kind;
      end if;
      v_p1 := public.normalize_ml_phone(rec.e ->> 'telephone');
      v_p2 := public.normalize_ml_phone(rec.e ->> 'telephone2');
      if nullif(btrim(rec.e ->> 'telephone'), '') is not null and v_p1 is null then raise exception 'PP422: téléphone invalide « % »', rec.e ->> 'telephone'; end if;
      v_lat := nullif(replace(btrim(rec.e ->> 'latitude'), ',', '.'), '')::double precision;
      v_lng := nullif(replace(btrim(rec.e ->> 'longitude'), ',', '.'), '')::double precision;
      if exists (select 1 from public.facility_listings f where f.search_name = public.normalize_text(rec.e ->> 'nom')
                 and f.region_id is not distinct from v_region) then
        dup := dup + 1; continue;
      end if;
      insert into public.facility_listings (name, kind, category_label, region_id, city_label, address, phone, phone2, latitude, longitude, source, created_by)
      values (btrim(rec.e ->> 'nom'), v_kind, nullif(btrim(rec.e ->> 'categorie'), ''), v_region, nullif(btrim(rec.e ->> 'ville'), ''),
              nullif(btrim(rec.e ->> 'adresse'), ''), v_p1, v_p2, v_lat, v_lng, coalesce(nullif(btrim(rec.e ->> 'source'), ''), 'Import CSV'), uid);
      ok := ok + 1;
    exception
      when invalid_text_representation then errors := errors || jsonb_build_object('row', rec.line, 'error', 'coordonnées invalides');
      when check_violation then errors := errors || jsonb_build_object('row', rec.line, 'error', 'valeur hors limites');
      when unique_violation then dup := dup + 1;
      when others then errors := errors || jsonb_build_object('row', rec.line, 'error', regexp_replace(sqlerrm, '^PP[0-9]+: ', ''));
    end;
  end loop;
  perform public.log_audit('facility.import', 'facility_listing', null,
    jsonb_build_object('imported', ok, 'duplicates', dup, 'failed', jsonb_array_length(errors)));
  return jsonb_build_object('imported', ok, 'duplicates', dup, 'failed', jsonb_array_length(errors), 'errors', errors);
end $$;

create or replace function public.admin_set_facility_published(p_id uuid, p_published boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  update public.facility_listings set is_published = p_published, updated_at = now() where id = p_id;
  if not found then raise exception 'PP404: fiche introuvable'; end if;
  perform public.log_audit(case when p_published then 'facility.publish' else 'facility.unpublish' end, 'facility_listing', p_id::text);
end $$;

create or replace function public.admin_delete_facility(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare n text;
begin
  perform public.require_admin();
  delete from public.facility_listings where id = p_id returning name into n;
  if n is null then raise exception 'PP404: fiche introuvable'; end if;
  perform public.log_audit('facility.delete', 'facility_listing', p_id::text, jsonb_build_object('name', n));
end $$;

create or replace function public.search_facility_listings(p_query text default null, p_region uuid default null,
                                                           p_limit int default 20, p_offset int default 0)
returns table (id uuid, name text, kind text, category_label text, region_name text, city_label text, address text,
               phone text, phone2 text, latitude double precision, longitude double precision, total_count bigint)
language sql stable security definer set search_path = public, extensions as $$
  with q as (select nullif(public.normalize_text(p_query), '') as t)
  select f.id, f.name, f.kind, f.category_label, r.name, f.city_label, f.address, f.phone, f.phone2, f.latitude, f.longitude, count(*) over ()
  from public.facility_listings f cross join q
  left join public.regions r on r.id = f.region_id
  where f.is_published and f.claimed_clinic_id is null
    and (p_region is null or f.region_id = p_region)
    and (q.t is null or f.search_name like '%' || q.t || '%' or extensions.similarity(f.search_name, q.t) > 0.3)
  order by f.search_name, f.id
  limit least(greatest(coalesce(p_limit, 20), 1), 50) offset greatest(coalesce(p_offset, 0), 0)
$$;

-- Statistiques d'administration
create or replace function public.admin_register_stats()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_admin();
  return jsonb_build_object(
    'register_total', (select count(*) from public.doctor_register),
    'register_year', (select max(register_year) from public.doctor_register),
    'register_hidden', (select count(*) from public.doctor_register where not is_published),
    'register_with_specialty', (select count(*) from public.doctor_register where specialty_id is not null),
    'facilities_total', (select count(*) from public.facility_listings),
    'facilities_published', (select count(*) from public.facility_listings where is_published and claimed_clinic_id is null));
end $$;

revoke execute on function public.admin_import_doctor_register(int, jsonb, boolean), public.admin_set_register_published(uuid, boolean),
  public.admin_import_facility_listings(jsonb), public.admin_set_facility_published(uuid, boolean), public.admin_delete_facility(uuid),
  public.admin_register_stats() from public, anon;
grant execute on function public.admin_import_doctor_register(int, jsonb, boolean), public.admin_set_register_published(uuid, boolean),
  public.admin_import_facility_listings(jsonb), public.admin_set_facility_published(uuid, boolean), public.admin_delete_facility(uuid),
  public.admin_register_stats() to authenticated;
grant execute on function public.search_doctor_register(text, uuid, uuid, int, int), public.register_summary(),
  public.search_facility_listings(text, uuid, int, int) to anon, authenticated;
