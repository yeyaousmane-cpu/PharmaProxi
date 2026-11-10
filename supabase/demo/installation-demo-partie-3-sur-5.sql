-- SantéProxi — installation du projet de DÉMONSTRATION, partie 3/5.
-- À exécuter dans l'ordre, dans l'éditeur SQL du projet « santeproxi-demo » UNIQUEMENT (jamais en production).

-- >>> 20261029000100_services.sql
-- ============================================================================
-- PharmaProxi — Migration : services pratiques
--   1. Pharmacies de garde (dates, horaires ; confirmées par l'administration
--      ou déclarées par la pharmacie)
--   2. Laboratoires et examens : catalogue d'examens, offres des établissements
--      (tarif et délai communiqués, date de vérification, source)
--   3. Alertes de disponibilité d'un médicament + signaux de demande pour les
--      pharmacies + observatoire des ruptures (agrégé, anonymisé)
--   4. Répertoire d'urgence : services d'urgence et ambulances
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Types d'établissements complémentaires
-- ---------------------------------------------------------------------------
alter table public.facility_listings drop constraint if exists facility_listings_kind_check;
alter table public.facility_listings add constraint facility_listings_kind_check
  check (kind in ('clinique', 'cabinet', 'cabinet_dentaire', 'centre_sante', 'csref', 'hopital', 'imagerie', 'laboratoire', 'urgences', 'ambulance'));
alter table public.facility_listings add column emergency_24h boolean not null default false;

-- Import des établissements : colonnes facultatives « publie » (oui/non) et « urgences_24h »
create or replace function public.admin_import_facility_listings(p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := public.require_admin();
  rec record; ok int := 0; dup int := 0; errors jsonb := '[]'::jsonb;
  v_region uuid; v_kind text; v_p1 text; v_p2 text; v_lat double precision; v_lng double precision; v_pub boolean; v_urg boolean;
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
      if v_kind not in ('clinique', 'cabinet', 'cabinet_dentaire', 'centre_sante', 'csref', 'hopital', 'imagerie', 'laboratoire', 'urgences', 'ambulance') then
        raise exception 'PP422: type inconnu « % »', v_kind;
      end if;
      v_p1 := public.normalize_ml_phone(rec.e ->> 'telephone');
      v_p2 := public.normalize_ml_phone(rec.e ->> 'telephone2');
      if nullif(btrim(rec.e ->> 'telephone'), '') is not null and v_p1 is null then raise exception 'PP422: téléphone invalide « % »', rec.e ->> 'telephone'; end if;
      v_lat := nullif(replace(btrim(rec.e ->> 'latitude'), ',', '.'), '')::double precision;
      v_lng := nullif(replace(btrim(rec.e ->> 'longitude'), ',', '.'), '')::double precision;
      v_pub := lower(btrim(coalesce(rec.e ->> 'publie', ''))) not in ('non', 'no', 'false', '0', 'n');
      v_urg := lower(btrim(coalesce(rec.e ->> 'urgences_24h', ''))) in ('oui', 'yes', 'true', '1', 'o');
      if exists (select 1 from public.facility_listings f where f.search_name = public.normalize_text(rec.e ->> 'nom')
                 and f.region_id is not distinct from v_region) then
        dup := dup + 1; continue;
      end if;
      insert into public.facility_listings (name, kind, category_label, region_id, city_label, address, phone, phone2, latitude, longitude, source,
                                            is_published, emergency_24h, created_by)
      values (btrim(rec.e ->> 'nom'), v_kind, nullif(btrim(rec.e ->> 'categorie'), ''), v_region, nullif(btrim(rec.e ->> 'ville'), ''),
              nullif(btrim(rec.e ->> 'adresse'), ''), v_p1, v_p2, v_lat, v_lng, coalesce(nullif(btrim(rec.e ->> 'source'), ''), 'Import CSV'),
              v_pub, v_urg, uid);
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

create or replace function public.admin_set_facility_emergency(p_id uuid, p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  update public.facility_listings set emergency_24h = p_on, updated_at = now() where id = p_id;
  if not found then raise exception 'PP404: fiche introuvable'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Pharmacies de garde
-- ---------------------------------------------------------------------------
create table public.pharmacy_duty (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid references public.pharmacies(id) on delete cascade,
  listing_id uuid references public.pharmacy_listings(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'confirmed' check (status in ('confirmed', 'declared')),
  source text not null default 'Saisie administrateur' check (char_length(source) between 1 and 200),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (num_nonnulls(pharmacy_id, listing_id) = 1),
  check (ends_at > starts_at and ends_at - starts_at <= interval '8 days')
);
create index pharmacy_duty_time on public.pharmacy_duty (starts_at, ends_at);
alter table public.pharmacy_duty enable row level security;
create policy "pp_duty_public_read" on public.pharmacy_duty for select to anon, authenticated using (true);
revoke insert, update, delete on public.pharmacy_duty from anon, authenticated;
grant select on public.pharmacy_duty to anon, authenticated;

create or replace function public.admin_add_duty(p_pharmacy uuid, p_listing uuid, p_start timestamptz, p_end timestamptz, p_source text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_admin(); did uuid;
begin
  if p_pharmacy is not null and not exists (select 1 from public.pharmacies where id = p_pharmacy and status = 'verified') then
    raise exception 'PP422: pharmacie vérifiée introuvable';
  end if;
  insert into public.pharmacy_duty (pharmacy_id, listing_id, starts_at, ends_at, status, source, created_by)
  values (p_pharmacy, p_listing, p_start, p_end, 'confirmed', coalesce(nullif(btrim(coalesce(p_source, '')), ''), 'Saisie administrateur'), uid)
  returning id into did;
  perform public.log_audit('duty.add', 'pharmacy_duty', did::text);
  return did;
exception when check_violation then
  raise exception 'PP422: choisissez une pharmacie, et une fin après le début (8 jours maximum)';
end $$;

-- Import du tableau de garde : [{line, pharmacie, region, commune, debut, fin, source}]
-- debut/fin : « 2026-11-02 », « 2026-11-02 20:00 » ou « 02/11/2026 20:00 ». Une date seule vaut 08:00 → lendemain 08:00.
create or replace function public.admin_import_duty(p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := public.require_admin();
  rec record; ok int := 0; errors jsonb := '[]'::jsonb; v_region uuid; v_commune uuid; v_ph uuid; v_li uuid; v_s timestamptz; v_e timestamptz; n int;
begin
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 3000 then raise exception 'PP422: 3 000 lignes maximum'; end if;
  for rec in select coalesce((e ->> 'line')::int, o::int + 1) as line, e from jsonb_array_elements(p_rows) with ordinality as t(e, o) loop
    begin
      v_region := public.resolve_region(rec.e ->> 'region');
      if v_region is null then raise exception 'PP422: région inconnue « % »', coalesce(rec.e ->> 'region', ''); end if;
      v_commune := public.resolve_commune(v_region, rec.e ->> 'commune');
      v_s := public.parse_duty_time(rec.e ->> 'debut', false);
      v_e := public.parse_duty_time(coalesce(nullif(btrim(rec.e ->> 'fin'), ''), rec.e ->> 'debut'), true);
      if v_s is null or v_e is null then raise exception 'PP422: dates invalides'; end if;
      select count(*), min(p.id::text)::uuid into n, v_ph from public.pharmacies p
      where p.status = 'verified' and p.region_id = v_region and public.normalize_text(p.name) = public.normalize_text(rec.e ->> 'pharmacie')
        and (v_commune is null or p.commune_id = v_commune);
      v_li := null;
      if n = 0 then
        v_ph := null;
        select count(*), min(l.id::text)::uuid into n, v_li from public.pharmacy_listings l
        where l.region_id = v_region and l.search_name = public.normalize_text(rec.e ->> 'pharmacie')
          and (v_commune is null or l.commune_id is null or l.commune_id = v_commune);
      end if;
      if n = 0 then raise exception 'PP404: pharmacie « % » introuvable dans l''annuaire (ajoutez-la d''abord)', rec.e ->> 'pharmacie'; end if;
      if n > 1 then raise exception 'PP409: plusieurs pharmacies « % » : précisez la commune', rec.e ->> 'pharmacie'; end if;
      insert into public.pharmacy_duty (pharmacy_id, listing_id, starts_at, ends_at, status, source, created_by)
      values (v_ph, v_li, v_s, v_e, 'confirmed', coalesce(nullif(btrim(rec.e ->> 'source'), ''), 'Tableau de garde importé'), uid);
      ok := ok + 1;
    exception
      when check_violation then errors := errors || jsonb_build_object('row', rec.line, 'error', 'la fin doit être après le début (8 jours maximum)');
      when others then errors := errors || jsonb_build_object('row', rec.line, 'error', regexp_replace(sqlerrm, '^PP[0-9]+: ', ''));
    end;
  end loop;
  perform public.log_audit('duty.import', 'pharmacy_duty', null, jsonb_build_object('imported', ok, 'failed', jsonb_array_length(errors)));
  return jsonb_build_object('imported', ok, 'failed', jsonb_array_length(errors), 'errors', errors);
end $$;

create or replace function public.parse_duty_time(p text, p_is_end boolean)
returns timestamptz language plpgsql immutable as $$
declare t text := btrim(coalesce(p, '')); d date; tm time;
begin
  if t = '' then return null; end if;
  t := regexp_replace(t, '\s+', ' ', 'g');
  if t ~ '^\d{2}/\d{2}/\d{4}' then t := substr(t, 7, 4) || '-' || substr(t, 4, 2) || '-' || substr(t, 1, 2) || substr(t, 11); end if;
  d := substr(t, 1, 10)::date;
  if char_length(t) > 10 then
    tm := replace(btrim(substr(t, 11)), 'h', ':')::time;
    return (d::timestamp + tm) at time zone 'UTC';
  end if;
  -- Date seule : garde de 08:00 à 08:00 le lendemain
  return ((case when p_is_end then d + 1 else d end)::timestamp + time '08:00') at time zone 'UTC';
exception when others then
  return null;
end $$;

-- La pharmacie déclare elle-même sa garde (affichée « déclarée par la pharmacie »)
create or replace function public.pharmacy_declare_duty(p_pharmacy uuid, p_start timestamptz, p_end timestamptz)
returns uuid language plpgsql security definer set search_path = public as $$
declare did uuid;
begin
  if not exists (select 1 from public.pharmacy_members m join public.pharmacies p on p.id = m.pharmacy_id
                 where m.pharmacy_id = p_pharmacy and m.user_id = auth.uid() and p.status = 'verified') then
    raise exception 'PP403: réservé à l''équipe d''une pharmacie vérifiée' using errcode = '42501';
  end if;
  if p_end < now() then raise exception 'PP422: cette garde est déjà passée'; end if;
  insert into public.pharmacy_duty (pharmacy_id, starts_at, ends_at, status, source, created_by)
  values (p_pharmacy, p_start, p_end, 'declared', 'Déclarée par la pharmacie', auth.uid()) returning id into did;
  return did;
exception when check_violation then
  raise exception 'PP422: la fin doit être après le début (8 jours maximum)';
end $$;

create or replace function public.delete_duty(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare d public.pharmacy_duty;
begin
  select * into d from public.pharmacy_duty where id = p_id;
  if d.id is null then raise exception 'PP404: garde introuvable'; end if;
  if not (public.is_admin() or (d.status = 'declared' and exists (
      select 1 from public.pharmacy_members m where m.pharmacy_id = d.pharmacy_id and m.user_id = auth.uid()))) then
    raise exception 'PP403: action non autorisée' using errcode = '42501';
  end if;
  delete from public.pharmacy_duty where id = p_id;
end $$;

create or replace function public.duty_pharmacies(p_from timestamptz default now(), p_to timestamptz default null,
                                                  p_region uuid default null, p_commune uuid default null,
                                                  p_lat double precision default null, p_lng double precision default null)
returns table (duty_id uuid, kind text, id uuid, name text, address text, area text, phone text, whatsapp text,
               latitude double precision, longitude double precision, starts_at timestamptz, ends_at timestamptz,
               status text, source text, distance_km double precision, region_id uuid, commune_id uuid)
language sql stable security definer set search_path = public as $$
  select d.id, 'verified', p.id, p.name, p.address, concat_ws(', ', lo.name, c.name, r.name), p.phone, p.whatsapp,
         p.latitude, p.longitude, d.starts_at, d.ends_at, d.status, d.source, public.distance_km(p_lat, p_lng, p.latitude, p.longitude), p.region_id, p.commune_id
  from public.pharmacy_duty d
  join public.pharmacies p on p.id = d.pharmacy_id and p.status = 'verified'
  join public.regions r on r.id = p.region_id
  left join public.communes c on c.id = p.commune_id
  left join public.localities lo on lo.id = p.locality_id
  where d.ends_at > p_from and d.starts_at < coalesce(p_to, p_from + interval '1 second')
    and (p_region is null or p.region_id = p_region) and (p_commune is null or p.commune_id = p_commune)
  union all
  select d.id, 'listing', l.id, l.name, l.address, concat_ws(', ', l.area_label, c.name, r.name), l.phone, null,
         l.latitude, l.longitude, d.starts_at, d.ends_at, d.status, d.source, public.distance_km(p_lat, p_lng, l.latitude, l.longitude), l.region_id, l.commune_id
  from public.pharmacy_duty d
  join public.pharmacy_listings l on l.id = d.listing_id and l.is_published
  join public.regions r on r.id = l.region_id
  left join public.communes c on c.id = l.commune_id
  where d.ends_at > p_from and d.starts_at < coalesce(p_to, p_from + interval '1 second')
    and (p_region is null or l.region_id = p_region) and (p_commune is null or l.commune_id = p_commune)
  order by 15 nulls last, 11, 4
  limit 300
$$;

-- ---------------------------------------------------------------------------
-- 2. Laboratoires et examens
-- ---------------------------------------------------------------------------
create table public.medical_exams (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9_]{2,40}$'),
  name text not null unique check (char_length(name) between 2 and 120),
  category text not null check (category in ('biologie', 'imagerie', 'autre')),
  synonyms text check (char_length(coalesce(synonyms, '')) <= 300),
  description text check (char_length(coalesce(description, '')) <= 400),
  sort_order int not null default 100,
  is_active boolean not null default true,
  search_text text generated always as (public.normalize_text(name || ' ' || coalesce(synonyms, ''))) stored
);
alter table public.medical_exams enable row level security;
create policy "pp_exams_public_read" on public.medical_exams for select to anon, authenticated using (is_active or public.is_admin());
revoke insert, update, delete on public.medical_exams from anon, authenticated;
grant select on public.medical_exams to anon, authenticated;

-- Liste de départ d'examens courants (descriptions neutres, sans conseil médical)
insert into public.medical_exams (code, name, category, synonyms, description, sort_order) values
  ('nfs', 'Numération formule sanguine (NFS)', 'biologie', 'hémogramme globules sang', 'Compte des globules rouges, blancs et des plaquettes.', 10),
  ('glycemie', 'Glycémie à jeun', 'biologie', 'sucre diabète glucose', 'Mesure du sucre dans le sang.', 11),
  ('hba1c', 'Hémoglobine glyquée (HbA1c)', 'biologie', 'diabète suivi', 'Reflète l''équilibre du sucre sur plusieurs semaines.', 12),
  ('creatinine', 'Créatininémie', 'biologie', 'rein fonction rénale créatinine', 'Évalue le fonctionnement des reins.', 13),
  ('uree', 'Urée sanguine', 'biologie', 'rein azote', null, 14),
  ('ionogramme', 'Ionogramme sanguin', 'biologie', 'sodium potassium électrolytes', null, 15),
  ('bilan_lipidique', 'Bilan lipidique', 'biologie', 'cholestérol triglycérides', null, 16),
  ('transaminases', 'Transaminases (ASAT, ALAT)', 'biologie', 'foie hépatique sgot sgpt', 'Évalue le foie.', 17),
  ('crp', 'Protéine C réactive (CRP)', 'biologie', 'inflammation', null, 18),
  ('vs', 'Vitesse de sédimentation (VS)', 'biologie', 'inflammation', null, 19),
  ('groupe_sanguin', 'Groupe sanguin et rhésus', 'biologie', 'groupage abo', null, 20),
  ('bhcg', 'Test de grossesse sanguin (β-HCG)', 'biologie', 'grossesse hcg', null, 21),
  ('vih', 'Sérologie VIH', 'biologie', 'sida dépistage', 'Dépistage, avec conseil et confidentialité.', 22),
  ('aghbs', 'Antigène HBs (hépatite B)', 'biologie', 'hépatite b dépistage', null, 23),
  ('hepatite_c', 'Sérologie hépatite C', 'biologie', 'vhc', null, 24),
  ('paludisme', 'Recherche de paludisme (goutte épaisse / TDR)', 'biologie', 'palu goutte épaisse frottis tdr plasmodium', null, 25),
  ('widal', 'Sérodiagnostic de Widal', 'biologie', 'typhoïde fièvre typhoïde', null, 26),
  ('ecbu', 'Examen cytobactériologique des urines (ECBU)', 'biologie', 'urines infection urinaire', null, 27),
  ('selles', 'Examen parasitologique des selles (KAOP)', 'biologie', 'selles parasites kaop', null, 28),
  ('tsh', 'TSH (thyroïde)', 'biologie', 'thyroïde', null, 29),
  ('psa', 'PSA', 'biologie', 'prostate', null, 30),
  ('electrophorese_hb', 'Électrophorèse de l''hémoglobine', 'biologie', 'drépanocytose hémoglobine', null, 31),
  ('radio_thorax', 'Radiographie du thorax', 'imagerie', 'radio poumons thorax', null, 50),
  ('radio_os', 'Radiographie osseuse', 'imagerie', 'radio fracture os', null, 51),
  ('echo_abdo', 'Échographie abdominale', 'imagerie', 'écho ventre abdomen', null, 52),
  ('echo_obst', 'Échographie obstétricale', 'imagerie', 'écho grossesse', null, 53),
  ('echo_pelv', 'Échographie pelvienne', 'imagerie', 'écho pelvis', null, 54),
  ('scanner', 'Scanner (tomodensitométrie)', 'imagerie', 'tdm ct scan', null, 55),
  ('irm', 'IRM', 'imagerie', 'résonance magnétique', null, 56),
  ('mammographie', 'Mammographie', 'imagerie', 'sein', null, 57),
  ('ecg', 'Électrocardiogramme (ECG)', 'autre', 'cœur ecg', null, 70)
on conflict (code) do nothing;

create table public.facility_exams (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facility_listings(id) on delete cascade,
  exam_id uuid not null references public.medical_exams(id) on delete cascade,
  price_xof integer check (price_xof is null or price_xof between 0 and 10000000),
  price_note text check (char_length(coalesce(price_note, '')) <= 80),
  delay text check (char_length(coalesce(delay, '')) <= 60),
  source text not null default 'Communiqué par l''établissement' check (char_length(source) between 1 and 200),
  verified_at date,
  updated_at timestamptz not null default now(),
  unique (facility_id, exam_id)
);
create index facility_exams_exam on public.facility_exams (exam_id);
alter table public.facility_exams enable row level security;
create policy "pp_facility_exams_public_read" on public.facility_exams for select to anon, authenticated using (
  exists (select 1 from public.facility_listings f where f.id = facility_id and f.is_published) or public.is_admin());
revoke insert, update, delete on public.facility_exams from anon, authenticated;
grant select on public.facility_exams to anon, authenticated;

-- Import des examens proposés : [{line, etablissement, region, examen, prix, delai, source, verifie_le}]
create or replace function public.admin_import_facility_exams(p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := public.require_admin();
  rec record; ok int := 0; errors jsonb := '[]'::jsonb; v_fac uuid; v_exam uuid; n int; v_price int; v_region uuid;
begin
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 5000 then raise exception 'PP422: 5 000 lignes maximum'; end if;
  for rec in select coalesce((e ->> 'line')::int, o::int + 1) as line, e from jsonb_array_elements(p_rows) with ordinality as t(e, o) loop
    begin
      v_region := case when nullif(btrim(rec.e ->> 'region'), '') is null then null else public.resolve_region(rec.e ->> 'region') end;
      select count(*), min(f.id::text)::uuid into n, v_fac from public.facility_listings f
      where f.search_name = public.normalize_text(rec.e ->> 'etablissement') and (v_region is null or f.region_id = v_region);
      if n = 0 then raise exception 'PP404: établissement « % » introuvable (importez-le d''abord)', rec.e ->> 'etablissement'; end if;
      if n > 1 then raise exception 'PP409: plusieurs établissements « % » : précisez la région', rec.e ->> 'etablissement'; end if;
      select e.id into v_exam from public.medical_exams e
      where e.code = lower(btrim(rec.e ->> 'examen')) or public.normalize_text(e.name) = public.normalize_text(rec.e ->> 'examen')
      limit 1;
      if v_exam is null then raise exception 'PP404: examen « % » inconnu (code ou nom exact de la liste)', rec.e ->> 'examen'; end if;
      v_price := nullif(regexp_replace(coalesce(rec.e ->> 'prix', ''), '[^0-9]', '', 'g'), '')::int;
      insert into public.facility_exams (facility_id, exam_id, price_xof, price_note, delay, source, verified_at)
      values (v_fac, v_exam, v_price, nullif(btrim(rec.e ->> 'note_prix'), ''), nullif(btrim(rec.e ->> 'delai'), ''),
              coalesce(nullif(btrim(rec.e ->> 'source'), ''), 'Communiqué par l''établissement'),
              coalesce(nullif(btrim(rec.e ->> 'verifie_le'), '')::date, current_date))
      on conflict (facility_id, exam_id) do update set price_xof = excluded.price_xof, price_note = excluded.price_note, delay = excluded.delay,
        source = excluded.source, verified_at = excluded.verified_at, updated_at = now();
      ok := ok + 1;
    exception
      when check_violation then errors := errors || jsonb_build_object('row', rec.line, 'error', 'valeur hors limites');
      when others then errors := errors || jsonb_build_object('row', rec.line, 'error', regexp_replace(sqlerrm, '^PP[0-9]+: ', ''));
    end;
  end loop;
  perform public.log_audit('exams.import', 'facility_exam', null, jsonb_build_object('imported', ok, 'failed', jsonb_array_length(errors)));
  return jsonb_build_object('imported', ok, 'failed', jsonb_array_length(errors), 'errors', errors);
end $$;

create or replace function public.search_labs(p_exam uuid default null, p_query text default null, p_region uuid default null,
                                              p_sort text default 'name', p_limit int default 30, p_offset int default 0)
returns table (facility_id uuid, name text, kind text, region_name text, city_label text, address text, phone text, phone2 text,
               latitude double precision, longitude double precision, price_xof int, price_note text, delay text, source text,
               verified_at date, exams_count bigint, total_count bigint)
language sql stable security definer set search_path = public, extensions as $$
  with q as (select nullif(public.normalize_text(p_query), '') as t)
  select f.id, f.name, f.kind, r.name, f.city_label, f.address, f.phone, f.phone2, f.latitude, f.longitude,
         fe.price_xof, fe.price_note, fe.delay, coalesce(fe.source, f.source), fe.verified_at,
         (select count(*) from public.facility_exams x where x.facility_id = f.id), count(*) over ()
  from public.facility_listings f cross join q
  left join public.regions r on r.id = f.region_id
  left join public.facility_exams fe on fe.facility_id = f.id and fe.exam_id = p_exam
  where f.is_published and f.claimed_clinic_id is null and f.kind in ('laboratoire', 'imagerie', 'hopital', 'csref', 'clinique')
    and (p_exam is null or fe.id is not null)
    and (p_exam is not null or f.kind in ('laboratoire', 'imagerie'))
    and (p_region is null or f.region_id = p_region)
    and (q.t is null or f.search_name like '%' || q.t || '%' or extensions.similarity(f.search_name, q.t) > 0.3)
  order by case when p_sort = 'price' then fe.price_xof end asc nulls last, f.search_name
  limit least(greatest(coalesce(p_limit, 30), 1), 100) offset greatest(coalesce(p_offset, 0), 0)
$$;

-- ---------------------------------------------------------------------------
-- 3. Alertes de disponibilité, signaux de demande, observatoire des ruptures
-- ---------------------------------------------------------------------------
create table public.medicine_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  catalog_id uuid not null references public.medicine_catalog(id) on delete cascade,
  region_id uuid references public.regions(id) on delete set null,
  commune_id uuid references public.communes(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  notified_at timestamptz,
  unique (user_id, catalog_id)
);
create index medicine_alerts_catalog on public.medicine_alerts (catalog_id) where notified_at is null;
alter table public.medicine_alerts enable row level security;
create policy "pp_alerts_own" on public.medicine_alerts for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.medicine_alerts from anon, authenticated;
grant select on public.medicine_alerts to authenticated;

create or replace function public.create_medicine_alert(p_catalog uuid, p_region uuid default null, p_commune uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); aid uuid; v_cat uuid;
begin
  if uid is null then raise exception 'PP401: connectez-vous pour créer une alerte' using errcode = '42501'; end if;
  select coalesce(merged_into, id) into v_cat from public.medicine_catalog where id = p_catalog and review_status <> 'rejected';
  if v_cat is null then raise exception 'PP404: produit introuvable'; end if;
  if (select count(*) from public.medicine_alerts where user_id = uid and notified_at is null and expires_at > now()) >= 10 then
    raise exception 'PP429: 10 alertes actives maximum';
  end if;
  insert into public.medicine_alerts (user_id, catalog_id, region_id, commune_id)
  values (uid, v_cat, p_region, p_commune)
  on conflict (user_id, catalog_id) do update set region_id = excluded.region_id, commune_id = excluded.commune_id,
    created_at = now(), expires_at = now() + interval '30 days', notified_at = null
  returning id into aid;
  return aid;
end $$;

create or replace function public.delete_medicine_alert(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.medicine_alerts where id = p_id and user_id = auth.uid();
  if not found then raise exception 'PP404: alerte introuvable'; end if;
end $$;

-- Un stock redevient disponible dans une pharmacie vérifiée : prévenir les personnes en attente (une fois)
create or replace function public.inventory_alert_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare p public.pharmacies; m public.medicine_catalog; a record;
begin
  if not new.is_available or new.quantity - new.reserved_quantity <= 0 then return new; end if;
  if tg_op = 'UPDATE' and old.is_available and old.quantity - old.reserved_quantity > 0 then return new; end if;
  select * into p from public.pharmacies where id = new.pharmacy_id and status = 'verified';
  if p.id is null then return new; end if;
  select * into m from public.medicine_catalog where id = new.catalog_id;
  for a in
    update public.medicine_alerts al set notified_at = now()
    where al.catalog_id = new.catalog_id and al.notified_at is null and al.expires_at > now()
      and (al.region_id is null or al.region_id = p.region_id) and (al.commune_id is null or al.commune_id = p.commune_id)
    returning al.user_id
  loop
    perform public.notify_user(a.user_id, 'medicine_alert', 'Médicament disponible',
      format('%s est déclaré disponible chez %s. Appelez ou demandez une confirmation avant de vous déplacer.',
             concat_ws(' ', m.brand_name, m.dosage), p.name), null, format('/pharmacies/%s', p.id));
  end loop;
  return new;
end $$;
create trigger pharmacy_inventory_alerts after insert or update of is_available, quantity, reserved_quantity on public.pharmacy_inventory
  for each row execute function public.inventory_alert_notify();

-- Pour une pharmacie : produits recherchés par des patients de sa zone qu'elle ne déclare pas disponibles (agrégé)
create or replace function public.pharmacy_demand_signals(p_pharmacy uuid)
returns table (catalog_id uuid, label text, waiting bigint)
language plpgsql stable security definer set search_path = public as $$
declare p public.pharmacies;
begin
  if not exists (select 1 from public.pharmacy_members where pharmacy_id = p_pharmacy and user_id = auth.uid()) then
    raise exception 'PP403: réservé à l''équipe de la pharmacie' using errcode = '42501';
  end if;
  select * into p from public.pharmacies where id = p_pharmacy;
  return query
  select a.catalog_id, concat_ws(' ', m.brand_name, m.dosage, m.form), count(*)
  from public.medicine_alerts a
  join public.medicine_catalog m on m.id = a.catalog_id
  where a.notified_at is null and a.expires_at > now()
    and (a.region_id is null or a.region_id = p.region_id)
    and (a.commune_id is null or a.commune_id = p.commune_id)
    and not exists (select 1 from public.pharmacy_inventory i where i.pharmacy_id = p_pharmacy and i.catalog_id = a.catalog_id
                    and i.is_available and i.quantity - i.reserved_quantity > 0)
  group by a.catalog_id, m.brand_name, m.dosage, m.form
  order by 3 desc, 2
  limit 20;
end $$;

-- Observatoire (administration) : demandes non satisfaites, sans aucune donnée personnelle.
-- Les recherches sans résultat ne sont affichées qu'à partir de 3 occurrences.
create or replace function public.admin_shortage_observatory(p_days int default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare since timestamptz := now() - make_interval(days => least(greatest(coalesce(p_days, 30), 1), 365));
begin
  perform public.require_admin();
  return jsonb_build_object(
    'alerts', (select coalesce(jsonb_agg(x order by x.n desc), '[]'::jsonb) from (
       select concat_ws(' ', m.brand_name, m.dosage, m.form) as produit, coalesce(r.name, 'Tout le Mali') as region, count(*) as n,
              count(*) filter (where a.notified_at is not null) as satisfaites
       from public.medicine_alerts a join public.medicine_catalog m on m.id = a.catalog_id left join public.regions r on r.id = a.region_id
       where a.created_at > since group by 1, 2 order by 3 desc limit 30) x),
    'searches', (select coalesce(jsonb_agg(y order by y.n desc), '[]'::jsonb) from (
       select s.query_normalized as recherche, coalesce(r.name, 'Tout le Mali') as region, count(*) as n
       from public.search_logs s left join public.regions r on r.id = s.region_id
       where s.created_at > since and s.result_count = 0 and coalesce(s.kind, 'medicine') = 'medicine' and char_length(s.query_normalized) >= 3
       group by 1, 2 having count(*) >= 3 order by 3 desc limit 30) y));
end $$;

-- ---------------------------------------------------------------------------
-- 4. Répertoire d'urgence
-- ---------------------------------------------------------------------------
create or replace function public.emergency_directory(p_region uuid default null)
returns table (kind text, id uuid, name text, category text, area text, address text, phone text, phone2 text, verified boolean)
language sql stable security definer set search_path = public as $$
  select 'clinic', c.id, c.name, c.kind, concat_ws(', ', co.name, r.name), c.address, c.phone, c.whatsapp, true
  from public.clinics c join public.regions r on r.id = c.region_id left join public.communes co on co.id = c.commune_id
  where public.clinic_is_public(c.id) and c.emergency_24h and (p_region is null or c.region_id = p_region)
  union all
  select 'listing', f.id, f.name, f.kind, coalesce(f.city_label, r.name), f.address, f.phone, f.phone2, false
  from public.facility_listings f left join public.regions r on r.id = f.region_id
  where f.is_published and f.claimed_clinic_id is null and (f.kind in ('urgences', 'ambulance') or f.emergency_24h)
    and (p_region is null or f.region_id = p_region or f.region_id is null)
  order by 1, 3
  limit 200
$$;

-- ---------------------------------------------------------------------------
-- Maintenance : purge des alertes expirées et des gardes anciennes
-- ---------------------------------------------------------------------------
create or replace function public.purge_services()
returns int language plpgsql security definer set search_path = public as $$
declare n int; m int;
begin
  delete from public.medicine_alerts where expires_at < now() - interval '30 days';
  get diagnostics n = row_count;
  delete from public.pharmacy_duty where ends_at < now() - interval '90 days';
  get diagnostics m = row_count;
  return n + m;
end $$;

create or replace function public.run_maintenance()
returns jsonb language plpgsql security definer set search_path = public as $$
declare expired int; rl int; logs int; notifs int; outbox int; issues int; reminders int; appts int; appt_rem int; svc int;
begin
  expired := public.expire_overdue_orders();
  appts := public.expire_appointments();
  appt_rem := public.send_appointment_reminders();
  svc := public.purge_services();
  delete from public.rate_limit_events where at < now() - interval '1 day';
  get diagnostics rl = row_count;
  delete from public.search_logs where created_at < now() - interval '400 days';
  get diagnostics logs = row_count;
  delete from public.notifications where read_at is not null and read_at < now() - interval '180 days';
  get diagnostics notifs = row_count;
  delete from public.notification_outbox where status in ('sent', 'skipped') and created_at < now() - interval '90 days';
  get diagnostics outbox = row_count;
  reminders := public.directory_reminders();
  select count(*) into issues from public.integrity_issues() where severity = 'critique';
  insert into public.maintenance_runs (expired, purged, critical_issues)
  values (expired, jsonb_build_object('rate_limits', rl, 'search_logs', logs, 'notifications', notifs, 'outbox', outbox,
                                      'directory_reminders', reminders, 'appointments_expired', appts, 'appointment_reminders', appt_rem,
                                      'services', svc), issues);
  delete from public.maintenance_runs where ran_at < now() - interval '30 days';
  return jsonb_build_object('expired', expired, 'appointments_expired', appts, 'appointment_reminders', appt_rem,
    'purged', jsonb_build_object('rate_limits', rl, 'search_logs', logs, 'notifications', notifs, 'outbox', outbox,
                                 'directory_reminders', reminders, 'services', svc),
    'critical_issues', issues);
end $$;
revoke execute on function public.run_maintenance() from public, anon, authenticated;
grant execute on function public.run_maintenance() to service_role;

-- ---------------------------------------------------------------------------
-- Droits
-- ---------------------------------------------------------------------------
revoke execute on function public.inventory_alert_notify(), public.purge_services() from public, anon, authenticated;
revoke execute on function public.admin_add_duty(uuid, uuid, timestamptz, timestamptz, text), public.admin_import_duty(jsonb),
  public.pharmacy_declare_duty(uuid, timestamptz, timestamptz), public.delete_duty(uuid),
  public.admin_import_facility_exams(jsonb), public.admin_set_facility_emergency(uuid, boolean),
  public.create_medicine_alert(uuid, uuid, uuid), public.delete_medicine_alert(uuid),
  public.pharmacy_demand_signals(uuid), public.admin_shortage_observatory(int) from public, anon;
grant execute on function public.admin_add_duty(uuid, uuid, timestamptz, timestamptz, text), public.admin_import_duty(jsonb),
  public.pharmacy_declare_duty(uuid, timestamptz, timestamptz), public.delete_duty(uuid),
  public.admin_import_facility_exams(jsonb), public.admin_set_facility_emergency(uuid, boolean),
  public.create_medicine_alert(uuid, uuid, uuid), public.delete_medicine_alert(uuid),
  public.pharmacy_demand_signals(uuid), public.admin_shortage_observatory(int) to authenticated;
grant execute on function public.duty_pharmacies(timestamptz, timestamptz, uuid, uuid, double precision, double precision),
  public.search_labs(uuid, text, uuid, text, int, int), public.emergency_directory(uuid), public.parse_duty_time(text, boolean) to anon, authenticated;

-- >>> 20261029000200_booking_hub.sql
-- ============================================================================
-- PharmaProxi — Migration : rubrique « Prendre rendez-vous »
-- Liste publique des médecins vérifiés qui acceptent les rendez-vous en ligne
-- (réservation immédiate ou demande à confirmer), lieu par lieu.
-- ============================================================================
create or replace function public.bookable_doctors(
  p_specialty uuid default null, p_region uuid default null, p_commune uuid default null, p_query text default null,
  p_mode text default null, p_lat double precision default null, p_lng double precision default null,
  p_limit int default 12, p_offset int default 0)
returns table (doctor_id uuid, title text, display_name text, specialties jsonb, site_id uuid, clinic_id uuid, clinic_name text,
               clinic_kind text, area text, booking_mode text, fee_info text, accepts_new_patients boolean, payment_methods text[],
               distance_km double precision, total_count bigint)
language sql stable security definer set search_path = public as $$
  with q as (select nullif(public.normalize_text(left(coalesce(p_query, ''), 80)), '') as t),
  rows as (
    select d.id as doctor_id, d.title, d.display_name,
           (select coalesce(jsonb_agg(jsonb_build_object('id', ms.id, 'name', ms.name) order by ms.sort_order), '[]')
              from public.doctor_specialties ds join public.medical_specialties ms on ms.id = ds.specialty_id where ds.doctor_id = d.id) as specialties,
           s.id as site_id, c.id as clinic_id, c.name as clinic_name, c.kind as clinic_kind,
           concat_ws(', ', cm.name, r.name) as area, s.booking_mode, d.fee_info, d.accepts_new_patients, d.payment_methods,
           public.distance_km(p_lat, p_lng, c.latitude, c.longitude) as distance_km
    from public.doctor_practice_sites s
    join public.doctors d on d.id = s.doctor_id
    join public.clinics c on c.id = s.clinic_id and c.status = 'verified'
    join public.regions r on r.id = c.region_id
    left join public.communes cm on cm.id = c.commune_id
    cross join q
    where s.accepts_appointments and s.doctor_accepted and s.clinic_accepted and public.doctor_is_public(d.id)
      and (p_mode is null or s.booking_mode = p_mode)
      and (p_region is null or c.region_id = p_region)
      and (p_commune is null or c.commune_id = p_commune)
      and (p_specialty is null or exists (select 1 from public.doctor_specialties ds where ds.doctor_id = d.id and ds.specialty_id = p_specialty))
      and (q.t is null or public.normalize_text(d.display_name) like '%' || q.t || '%' or public.normalize_text(c.name) like '%' || q.t || '%')
  )
  select rows.*, count(*) over ()
  from rows
  order by distance_km nulls last, case when booking_mode = 'instant' then 0 else 1 end, public.normalize_text(display_name)
  limit least(greatest(coalesce(p_limit, 12), 1), 30) offset greatest(coalesce(p_offset, 0), 0)
$$;
alter function public.bookable_doctors(uuid, uuid, uuid, text, text, double precision, double precision, int, int) set statement_timeout = '8s';
grant execute on function public.bookable_doctors(uuid, uuid, uuid, text, text, double precision, double precision, int, int) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Déplacer un rendez-vous (patient) : nouveau créneau libre, même lieu et même motif
-- ---------------------------------------------------------------------------
create or replace function public.move_appointment(p_id uuid, p_new_start timestamptz)
returns void language plpgsql security definer set search_path = public as $$
declare a public.appointments; s public.doctor_practice_sites; t public.appointment_types; d public.doctors; old_when text; new_when text;
begin
  select * into a from public.appointments where id = p_id and patient_id = auth.uid() for update;
  if a.id is null then raise exception 'PP404: rendez-vous introuvable'; end if;
  if a.status <> 'confirmed' or a.type_id is null or a.site_id is null then
    raise exception 'PP409: ce rendez-vous ne peut pas être déplacé en ligne : annulez-le ou appelez le cabinet';
  end if;
  select * into s from public.doctor_practice_sites where id = a.site_id;
  if s.id is null or not public.site_is_bookable(s) then raise exception 'PP409: la réservation en ligne est fermée pour ce lieu : appelez le cabinet'; end if;
  if a.scheduled_at - now() < make_interval(hours => s.cancel_notice_hours) then
    raise exception 'PP409: modification en ligne impossible moins de % h avant : appelez le cabinet', s.cancel_notice_hours;
  end if;
  if p_new_start = a.scheduled_at then raise exception 'PP422: choisissez un autre créneau'; end if;
  select * into t from public.appointment_types where id = a.type_id and is_active;
  if t.id is null then raise exception 'PP409: ce motif n''est plus proposé en ligne : annulez puis reprenez rendez-vous'; end if;
  perform pg_advisory_xact_lock(hashtextextended(a.doctor_id::text, 0));
  if not exists (select 1 from public.available_slots(a.site_id, a.type_id, (p_new_start at time zone 'UTC')::date, 1) x where x.slot_start = p_new_start) then
    raise exception 'PP409: ce créneau n''est plus disponible : choisissez-en un autre';
  end if;
  old_when := to_char(a.scheduled_at at time zone 'UTC', 'DD/MM/YYYY HH24"h"MI');
  new_when := to_char(p_new_start at time zone 'UTC', 'DD/MM/YYYY HH24"h"MI');
  update public.appointments set scheduled_at = p_new_start, ends_at = p_new_start + make_interval(mins => t.duration_min),
         requested_date = (p_new_start at time zone 'UTC')::date,
         requested_period = case when extract(hour from p_new_start at time zone 'UTC') < 13 then 'matin' else 'apres_midi' end,
         reminded_at = null
   where id = p_id;
  select * into d from public.doctors where id = a.doctor_id;
  perform public.notify_user(d.user_id, 'appointment', 'Rendez-vous déplacé par le patient', format('%s : %s → %s.', a.patient_name, old_when, new_when), null, '/medecin/rendez-vous?vue=a_venir');
  perform public.notify_clinic(a.clinic_id, 'appointment', 'Rendez-vous déplacé par le patient',
    format('%s %s — %s : %s → %s.', d.title, d.display_name, a.patient_name, old_when, new_when), format('/clinique/%s/rendez-vous?vue=a_venir', a.clinic_id));
  perform public.notify_user(a.patient_id, 'appointment', 'Rendez-vous déplacé', format('%s %s, nouveau rendez-vous le %s.', d.title, d.display_name, new_when), null, '/compte/rendez-vous');
  perform public.log_audit('appointment.move', 'appointment', p_id::text);
end $$;

-- ---------------------------------------------------------------------------
-- Visibilité : nombre de consultations de la fiche d'un médecin (agrégé par jour, sans identité)
-- ---------------------------------------------------------------------------
create table public.doctor_profile_views (
  doctor_id uuid not null references public.doctors(id) on delete cascade,
  day date not null,
  views int not null default 0,
  primary key (doctor_id, day)
);
alter table public.doctor_profile_views enable row level security;
revoke all on public.doctor_profile_views from anon, authenticated;

create or replace function public.record_doctor_view(p_doctor uuid)
returns void language sql volatile security definer set search_path = public as $$
  insert into public.doctor_profile_views (doctor_id, day, views)
  select p_doctor, (now() at time zone 'UTC')::date, 1 where public.doctor_is_public(p_doctor)
  on conflict (doctor_id, day) do update set views = public.doctor_profile_views.views + 1
$$;

-- ---------------------------------------------------------------------------
-- Statistiques d'activité (médecin : ses rendez-vous ; établissement : ceux de ses lieux)
-- ---------------------------------------------------------------------------
create or replace function public.practice_stats(p_clinic uuid default null, p_days int default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := public.my_doctor_id(); days int := least(greatest(coalesce(p_days, 30), 7), 365);
  since timestamptz := now() - make_interval(days => days);
  past jsonb; upcoming int; free int := 0; views bigint; peers jsonb := null; r record; n int;
begin
  if p_clinic is null and me is null then raise exception 'PP403: espace médecin requis' using errcode = '42501'; end if;
  if p_clinic is not null and not public.is_clinic_member(p_clinic) then raise exception 'PP403: réservé à l''équipe de l''établissement' using errcode = '42501'; end if;

  select jsonb_build_object(
      'total', count(*),
      'honores', count(*) filter (where status = 'completed'),
      'absents', count(*) filter (where status = 'no_show'),
      'annules_patient', count(*) filter (where status = 'cancelled' and cancelled_by = 'patient'),
      'annules_cabinet', count(*) filter (where status = 'cancelled' and cancelled_by = 'practice'),
      'refuses', count(*) filter (where status = 'declined'),
      'expires', count(*) filter (where status = 'expired'),
      'en_ligne', count(*) filter (where source = 'online' and status not in ('declined', 'expired')),
      'par_telephone', count(*) filter (where source = 'practice'),
      'nouveaux_patients', count(distinct patient_id) filter (where source = 'online'))
    into past
  from public.appointments a
  where (case when p_clinic is null then a.doctor_id = me else a.clinic_id = p_clinic end)
    and coalesce(a.scheduled_at, a.requested_date::timestamptz) between since and now();

  select count(*) into upcoming from public.appointments a
  where (case when p_clinic is null then a.doctor_id = me else a.clinic_id = p_clinic end)
    and a.status = 'confirmed' and a.scheduled_at between now() and now() + interval '7 days';

  -- Créneaux encore libres sur 7 jours (motif principal de chaque lieu ouvert en réservation immédiate)
  for r in
    select s.id as site_id,
           (select t.id from public.appointment_types t where t.doctor_id = s.doctor_id and t.is_active and (t.site_id is null or t.site_id = s.id)
             order by t.sort_order, t.duration_min limit 1) as type_id
    from public.doctor_practice_sites s
    where (case when p_clinic is null then s.doctor_id = me else s.clinic_id = p_clinic end) and public.site_is_bookable(s)
  loop
    if r.type_id is not null then
      select count(*) into n from public.available_slots(r.site_id, r.type_id, null, 7);
      free := free + n;
    end if;
  end loop;

  select coalesce(sum(v.views), 0) into views from public.doctor_profile_views v
  where v.day >= (since at time zone 'UTC')::date
    and (case when p_clinic is null then v.doctor_id = me
              else v.doctor_id in (select s.doctor_id from public.doctor_practice_sites s where s.clinic_id = p_clinic and s.doctor_accepted and s.clinic_accepted) end);

  -- Repère anonyme : médiane des médecins de même spécialité (au moins 5 médecins ayant 10 rendez-vous ou plus)
  if p_clinic is null then
    with peer as (
      select a.doctor_id,
             count(*) filter (where a.status = 'no_show')::numeric / nullif(count(*) filter (where a.status in ('completed', 'no_show')), 0) as absent_rate,
             count(*) filter (where a.status = 'cancelled')::numeric / count(*) as cancel_rate
      from public.appointments a
      where a.doctor_id <> me and coalesce(a.scheduled_at, a.requested_date::timestamptz) between since and now()
        and exists (select 1 from public.doctor_specialties x join public.doctor_specialties y on y.specialty_id = x.specialty_id
                    where x.doctor_id = me and y.doctor_id = a.doctor_id)
      group by a.doctor_id having count(*) >= 10)
    select case when count(*) >= 5 then jsonb_build_object(
             'medecins', count(*),
             'taux_absence', round(percentile_cont(0.5) within group (order by coalesce(absent_rate, 0))::numeric, 3),
             'taux_annulation', round(percentile_cont(0.5) within group (order by cancel_rate)::numeric, 3)) end
      into peers from peer;
  end if;

  return jsonb_build_object('jours', days, 'passe', past, 'a_venir_7j', upcoming, 'libres_7j', free,
                            'vues_fiche', views, 'repere_specialite', peers);
end $$;

revoke execute on function public.move_appointment(uuid, timestamptz), public.practice_stats(uuid, int) from public, anon;
grant execute on function public.move_appointment(uuid, timestamptz), public.practice_stats(uuid, int) to authenticated;
grant execute on function public.record_doctor_view(uuid) to anon, authenticated;


-- Laboratoires : statut d'autorisation (catégorie) affiché dans les résultats
drop function public.search_labs(uuid, text, uuid, text, int, int);
create or replace function public.search_labs(p_exam uuid default null, p_query text default null, p_region uuid default null,
                                              p_sort text default 'name', p_limit int default 30, p_offset int default 0)
returns table (facility_id uuid, name text, kind text, category_label text, region_name text, city_label text, address text, phone text, phone2 text,
               latitude double precision, longitude double precision, price_xof int, price_note text, delay text, source text,
               verified_at date, exams_count bigint, total_count bigint)
language sql stable security definer set search_path = public, extensions as $$
  with q as (select nullif(public.normalize_text(p_query), '') as t)
  select f.id, f.name, f.kind, f.category_label, r.name, f.city_label, f.address, f.phone, f.phone2, f.latitude, f.longitude,
         fe.price_xof, fe.price_note, fe.delay, coalesce(fe.source, f.source), fe.verified_at,
         (select count(*) from public.facility_exams x where x.facility_id = f.id), count(*) over ()
  from public.facility_listings f cross join q
  left join public.regions r on r.id = f.region_id
  left join public.facility_exams fe on fe.facility_id = f.id and fe.exam_id = p_exam
  where f.is_published and f.claimed_clinic_id is null and f.kind in ('laboratoire', 'imagerie', 'hopital', 'csref', 'clinique')
    and (p_exam is null or fe.id is not null)
    and (p_exam is not null or f.kind in ('laboratoire', 'imagerie'))
    and (p_region is null or f.region_id = p_region)
    and (q.t is null or f.search_name like '%' || q.t || '%' or extensions.similarity(f.search_name, q.t) > 0.3)
  order by case when p_sort = 'price' then fe.price_xof end asc nulls last, f.search_name
  limit least(greatest(coalesce(p_limit, 30), 1), 100) offset greatest(coalesce(p_offset, 0), 0)
$$;
grant execute on function public.search_labs(uuid, text, uuid, text, int, int) to anon, authenticated;

-- >>> 20261029000300_contact.sql
-- ============================================================================
-- PharmaProxi — Migration : formulaire de contact
-- Messages envoyés depuis la page Contact (avec ou sans compte), boîte de
-- réception de l'administration, notification des administrateurs.
-- ============================================================================
create table public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  topic text not null check (topic in ('question', 'erreur', 'donnees', 'pharmacie', 'medecin', 'partenariat', 'autre')),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  email text check (email is null or (char_length(email) <= 200 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  phone text check (phone is null or public.valid_phone(phone)),
  message text not null check (char_length(btrim(message)) between 10 and 3000),
  page_url text check (char_length(coalesce(page_url, '')) <= 300),
  user_id uuid references public.profiles(id) on delete set null,
  status text not null default 'new' check (status in ('new', 'in_progress', 'closed')),
  admin_note text check (char_length(coalesce(admin_note, '')) <= 1000),
  handled_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (email is not null or phone is not null)
);
create index contact_messages_status on public.contact_messages (status, created_at desc);
create trigger contact_messages_touch before update on public.contact_messages for each row execute function public.touch_updated_at();
alter table public.contact_messages enable row level security;
create policy "pp_contact_admin_read" on public.contact_messages for select to authenticated using (public.is_admin());
revoke insert, update, delete on public.contact_messages from anon, authenticated;
grant select on public.contact_messages to authenticated;

create or replace function public.send_contact_message(p_topic text, p_name text, p_email text, p_phone text, p_message text, p_page text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare mid uuid; v_phone text := public.normalize_ml_phone(p_phone); v_email text := nullif(lower(btrim(coalesce(p_email, ''))), ''); a record;
begin
  if nullif(btrim(coalesce(p_phone, '')), '') is not null and v_phone is null then raise exception 'PP422: numéro de téléphone invalide'; end if;
  if v_email is null and v_phone is null then raise exception 'PP422: indiquez un e-mail ou un téléphone pour que nous puissions vous répondre'; end if;
  if char_length(btrim(coalesce(p_message, ''))) < 10 then raise exception 'PP422: votre message est trop court'; end if;
  -- Anti-abus : 5 messages par heure pour un même e-mail ou téléphone
  if (select count(*) from public.contact_messages where created_at > now() - interval '1 hour'
      and ((v_email is not null and email = v_email) or (v_phone is not null and phone = v_phone))) >= 5 then
    raise exception 'PP429: trop de messages envoyés, réessayez plus tard';
  end if;
  insert into public.contact_messages (topic, name, email, phone, message, page_url, user_id)
  values (coalesce(p_topic, 'autre'), btrim(p_name), v_email, v_phone, btrim(p_message), nullif(btrim(coalesce(p_page, '')), ''), auth.uid())
  returning id into mid;
  for a in select user_id from public.user_roles where role = 'admin' loop
    perform public.notify_user(a.user_id, 'contact', 'Nouveau message de contact',
      format('%s : %s', btrim(p_name), left(btrim(p_message), 120)), null, '/admin/messages');
  end loop;
  return mid;
exception
  when check_violation then raise exception 'PP422: vérifiez les informations saisies (nom, e-mail, message de 10 à 3 000 caractères)';
end $$;

create or replace function public.admin_update_contact_message(p_id uuid, p_status text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_admin();
begin
  update public.contact_messages set status = p_status, admin_note = nullif(btrim(coalesce(p_note, '')), ''), handled_by = uid where id = p_id;
  if not found then raise exception 'PP404: message introuvable'; end if;
exception when check_violation then raise exception 'PP422: statut invalide';
end $$;

-- Purge : messages traités de plus de 2 ans
create or replace function public.purge_contact_messages()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from public.contact_messages where status = 'closed' and updated_at < now() - interval '2 years';
  get diagnostics n = row_count;
  return n;
end $$;

-- Texte de la page Contact, si l'administration ne l'a pas encore modifié
update public.content_pages
set body = 'Une question, une information erronée (pharmacie fermée, numéro faux, garde inexacte), une demande concernant vos données personnelles ou une proposition de partenariat ? Écrivez-nous avec le formulaire ci-dessous : nous vous répondons par e-mail ou par téléphone.

## Urgence médicale

PharmaProxi ne traite pas les urgences. En cas d''urgence, rendez-vous au service d''urgence le plus proche ou consultez la page Urgences.

## Professionnels de santé

Pharmaciens, médecins, cliniques et laboratoires : vous pouvez inscrire votre établissement directement sur la plateforme, ou nous écrire pour être accompagnés.

## Vos données

Vous pouvez consulter, corriger ou supprimer vos informations depuis « Mon compte ». Pour toute autre demande relative à vos données, choisissez le sujet « Mes données personnelles ».'
where slug = 'contact' and body like '%à compléter par l''administration%';

revoke execute on function public.admin_update_contact_message(uuid, text, text), public.purge_contact_messages() from public, anon;
grant execute on function public.admin_update_contact_message(uuid, text, text) to authenticated;
grant execute on function public.send_contact_message(text, text, text, text, text, text) to anon, authenticated;

-- >>> 20261029000400_announcements.sql
-- ============================================================================
-- PharmaProxi — Migration : annonces aux inscrits et message de bienvenue
--   * L'administration envoie une annonce : notification dans le compte de chaque
--     destinataire ; l'e-mail est envoyé par le serveur du site (SMTP).
--   * Chaque nouvel inscrit reçoit automatiquement une notification de bienvenue.
-- Les comptes de démonstration (@pharmaproxi.invalid) ne reçoivent rien.
-- ============================================================================
create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 3 and 120),
  body text not null check (char_length(btrim(body)) between 10 and 3000),
  link text check (link is null or link ~ '^/[A-Za-z0-9/_?=&#%.-]*$'),
  audience text not null check (audience in ('tous', 'clients', 'pharmaciens', 'medecins', 'etablissements', 'livreurs')),
  kind text not null default 'announcement' check (kind in ('announcement', 'welcome')),
  in_app_count int not null default 0,
  email_requested boolean not null default false,
  email_sent int not null default 0,
  email_failed int not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.announcements enable row level security;
drop policy if exists "pp_announcements_admin" on public.announcements;
create policy "pp_announcements_admin" on public.announcements for select to authenticated using (public.is_admin());
revoke insert, update, delete on public.announcements from anon, authenticated;
grant select on public.announcements to authenticated;

-- Personnes ayant déjà reçu l'e-mail de bienvenue (pour ne jamais l'envoyer deux fois)
create table if not exists public.welcome_emails (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  sent_at timestamptz not null default now()
);
alter table public.welcome_emails enable row level security;
revoke all on public.welcome_emails from anon, authenticated;

-- Destinataires d'une audience (comptes réels uniquement)
create or replace function public.announcement_recipients(p_audience text)
returns table (user_id uuid, email text, full_name text)
language sql stable security definer set search_path = public as $$
  select p.id, u.email::text, p.full_name
  from public.profiles p
  join auth.users u on u.id = p.id
  where u.email not like '%@pharmaproxi.invalid'
    and case p_audience
      when 'tous' then true
      when 'clients' then exists (select 1 from public.user_roles r where r.user_id = p.id and r.role = 'customer')
      when 'pharmaciens' then exists (select 1 from public.pharmacy_members m where m.user_id = p.id)
      when 'medecins' then exists (select 1 from public.doctors d where d.user_id = p.id)
      when 'etablissements' then exists (select 1 from public.clinic_members c where c.user_id = p.id)
      when 'livreurs' then exists (select 1 from public.couriers c where c.user_id = p.id)
      else false end
$$;
revoke execute on function public.announcement_recipients(text) from public, anon, authenticated;

-- Envoi d'une annonce : notifications immédiates ; renvoie la liste des e-mails
-- pour l'envoi par le serveur (réservé à l'administration).
-- p_kind = 'welcome' : notification seulement à ceux qui ne l'ont pas encore,
-- e-mail seulement à ceux qui ne l'ont pas encore reçu par e-mail.
create or replace function public.admin_send_announcement(p_title text, p_body text, p_link text, p_audience text, p_email boolean, p_kind text default 'announcement')
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_admin(); aid uuid; n int; recipients jsonb; welcome boolean := coalesce(p_kind, 'announcement') = 'welcome';
begin
  insert into public.announcements (title, body, link, audience, kind, email_requested, created_by)
  values (btrim(p_title), btrim(p_body), nullif(btrim(coalesce(p_link, '')), ''), p_audience, coalesce(p_kind, 'announcement'), coalesce(p_email, false), uid)
  returning id into aid;
  insert into public.notifications (user_id, kind, title, body, link)
  select r.user_id, case when welcome then 'welcome' else 'announcement' end, btrim(p_title), btrim(p_body),
         coalesce(nullif(btrim(coalesce(p_link, '')), ''), '/compte/notifications')
  from public.announcement_recipients(p_audience) r
  where not welcome or not exists (select 1 from public.notifications x where x.user_id = r.user_id and x.kind = 'welcome');
  get diagnostics n = row_count;
  select coalesce(jsonb_agg(jsonb_build_object('id', r.user_id, 'email', r.email, 'name', r.full_name)), '[]'::jsonb) into recipients
  from public.announcement_recipients(p_audience) r
  where coalesce(p_email, false) and r.email is not null
    and (not welcome or not exists (select 1 from public.welcome_emails w where w.user_id = r.user_id));
  update public.announcements set in_app_count = n where id = aid;
  perform public.log_audit('announcement.send', 'announcement', aid::text, jsonb_build_object('audience', p_audience, 'notifications', n, 'email', p_email));
  return jsonb_build_object('id', aid, 'count', n, 'recipients', recipients);
exception
  when check_violation then raise exception 'PP422: titre (3 à 120 caractères), message (10 à 3 000) et lien interne (commençant par /) à vérifier';
end $$;

create or replace function public.admin_announcement_email_result(p_id uuid, p_sent int, p_failed int, p_welcomed uuid[] default '{}')
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  update public.announcements set email_sent = greatest(p_sent, 0), email_failed = greatest(p_failed, 0) where id = p_id;
  insert into public.welcome_emails (user_id) select unnest(coalesce(p_welcomed, '{}')) on conflict do nothing;
end $$;

-- E-mail de bienvenue envoyé à l'inscription (appelé par le serveur avec la clé de service)
create or replace function public.mark_welcome_emailed(p_user uuid)
returns void language sql security definer set search_path = public as $$
  insert into public.welcome_emails (user_id) values (p_user) on conflict do nothing
$$;

-- Bienvenue automatique (notification) pour chaque nouvel inscrit
create or replace function public.send_welcome(p_user uuid)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, kind, title, body, link)
  select p_user, 'welcome', 'Bienvenue sur PharmaProxi !',
         'Merci de votre inscription. Trouvez la pharmacie qui a votre médicament, les pharmacies de garde, un médecin, un laboratoire, et prenez rendez-vous en ligne. '
         || 'La plateforme est en phase de test : vos remarques nous aident à l''améliorer, écrivez-nous depuis la page Contact. Bonne expérience ! — L''équipe PharmaProxi',
         '/'
  where not exists (select 1 from public.notifications n where n.user_id = p_user and n.kind = 'welcome')
    and not exists (select 1 from auth.users u where u.id = p_user and u.email like '%@pharmaproxi.invalid')
$$;
create or replace function public.welcome_new_profile()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.send_welcome(new.id);
  return new;
end $$;
drop trigger if exists profiles_welcome on public.profiles;
create trigger profiles_welcome after insert on public.profiles for each row execute function public.welcome_new_profile();

revoke execute on function public.send_welcome(uuid), public.welcome_new_profile() from public, anon, authenticated;
revoke execute on function public.admin_send_announcement(text, text, text, text, boolean, text), public.admin_announcement_email_result(uuid, int, int, uuid[]) from public, anon;
grant execute on function public.admin_send_announcement(text, text, text, text, boolean, text), public.admin_announcement_email_result(uuid, int, int, uuid[]) to authenticated;
revoke execute on function public.mark_welcome_emailed(uuid) from public, anon, authenticated;
grant execute on function public.mark_welcome_emailed(uuid) to service_role;

-- >>> 20261029000500_health_library.sql
-- ============================================================================
-- PharmaProxi — Migration : module « Santé essentielle »
-- Bibliothèque de fiches d'information santé avec circuit de validation médicale.
--   * Catégories (arborescence à un niveau), fiches structurées, sources, historique
--   * Rôles : administrateur (existant), rédacteur, validateur médical (table health_staff)
--   * Seules les fiches publiées (validées puis publiées) sont visibles du public
--   * Aucune donnée médicale personnelle n'est stockée par ce module
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Rôles éditoriaux
-- ---------------------------------------------------------------------------
create table if not exists public.health_staff (
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('editor', 'validator')),
  display_name text not null check (char_length(btrim(display_name)) between 3 and 120),  -- ex. « Dr A. Traoré, hématologue »
  credentials text check (char_length(coalesce(credentials, '')) <= 200),                  -- ex. n° d'inscription à l'Ordre
  granted_by uuid references public.profiles(id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);
alter table public.health_staff enable row level security;
drop policy if exists "pp_health_staff_read" on public.health_staff;
create policy "pp_health_staff_read" on public.health_staff for select to authenticated using (user_id = auth.uid() or public.is_admin());
revoke insert, update, delete on public.health_staff from anon, authenticated;
grant select on public.health_staff to authenticated;

create or replace function public.health_role(p_role text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (select 1 from public.health_staff s where s.user_id = auth.uid() and s.role = p_role)
$$;
create or replace function public.is_health_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (select 1 from public.health_staff s where s.user_id = auth.uid())
$$;

-- ---------------------------------------------------------------------------
-- Catégories
-- ---------------------------------------------------------------------------
create table if not exists public.health_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,60}$'),
  name text not null check (char_length(name) between 2 and 120),
  description text check (char_length(coalesce(description, '')) <= 400),
  icon text not null default 'heart-pulse' check (icon ~ '^[a-z0-9-]{2,40}$'),
  sort_order int not null default 100,
  is_active boolean not null default true,
  is_priority boolean not null default false
);
alter table public.health_categories enable row level security;
drop policy if exists "pp_health_categories_read" on public.health_categories;
create policy "pp_health_categories_read" on public.health_categories for select to anon, authenticated using (is_active or public.is_health_staff());
revoke insert, update, delete on public.health_categories from anon, authenticated;
grant select on public.health_categories to anon, authenticated;

insert into public.health_categories (slug, name, description, icon, sort_order, is_priority) values
  ('mariage', 'Avant le mariage', 'Examens à connaître, groupes sanguins, drépanocytose, infections, fertilité : comprendre pour décider ensemble.', 'heart-handshake', 1, true),
  ('sante-reproductive', 'Santé reproductive et sexuelle', 'Contraception, cycle menstruel, fertilité, infections sexuellement transmissibles, préparation à une grossesse.', 'venus-and-mars', 10, false),
  ('grossesse-enfant', 'Grossesse et santé de l''enfant', 'Suivi prénatal, signes d''alerte, accouchement, allaitement, vaccination et santé du nouveau-né.', 'baby', 20, false),
  ('maladies-hereditaires', 'Maladies héréditaires', 'Drépanocytose, thalassémie, autres maladies génétiques, transmission et conseil génétique.', 'dna', 30, false),
  ('maladies-infectieuses', 'Maladies infectieuses', 'Paludisme, tuberculose, VIH, hépatites, infections sexuellement transmissibles, vaccination.', 'bug', 40, false),
  ('maladies-chroniques', 'Maladies chroniques', 'Diabète, hypertension, maladies cardiovasculaires et rénales, anémie, santé respiratoire.', 'activity', 50, false),
  ('medicaments', 'Médicaments et bon usage', 'Automédication, antibiotiques, allergies, interactions, grossesse, conservation, médicaments contrefaits.', 'pill', 60, false),
  ('urgences', 'Urgences et premiers secours', 'Reconnaître un AVC, un infarctus, une convulsion, une hémorragie, une brûlure ou une intoxication.', 'siren', 70, false),
  ('vie-saine', 'Nutrition, hygiène et santé mentale', 'Alimentation, hydratation, eau potable, sommeil, stress, prévention des addictions.', 'apple', 80, false),
  ('depistage-prevention', 'Dépistage et prévention', 'Dépistages selon l''âge et les risques, prévention cardiovasculaire, santé bucco-dentaire, vaccins.', 'shield-check', 90, false)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Fiches
-- ---------------------------------------------------------------------------
create table if not exists public.health_articles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,90}$'),
  category_id uuid not null references public.health_categories(id) on delete restrict,
  kind text not null default 'fiche' check (kind in ('fiche', 'faq', 'idee_recue', 'prevention', 'actualite')),
  lang text not null default 'fr' check (lang in ('fr', 'bm')),           -- bambara prévu
  translation_of uuid references public.health_articles(id) on delete set null,
  title text not null check (char_length(btrim(title)) between 3 and 160),
  summary text not null default '' check (char_length(summary) <= 600),
  keywords text check (char_length(coalesce(keywords, '')) <= 400),          -- synonymes et fautes courantes, pour la recherche
  audiences text[] not null default '{}' check (audiences <@ array['tous', 'enfant', 'adolescent', 'adulte', 'senior', 'femme_enceinte', 'couple']::text[]),
  recommendation text check (recommendation in ('recommande', 'selon_risque', 'sur_indication')),
  -- Corps structuré (modèle standard) : clés autorisées ci-dessous, texte simple
  body jsonb not null default '{}'::jsonb,
  myths jsonb not null default '[]'::jsonb,      -- [{ "idee": "...", "verite": "..." }]
  faq jsonb not null default '[]'::jsonb,        -- [{ "q": "...", "r": "..." }]
  exam_codes text[] not null default '{}',       -- liens vers medical_exams.code (« où faire l'examen »)
  specialty_codes text[] not null default '{}',  -- liens vers medical_specialties.code (« quel professionnel »)
  is_featured boolean not null default false,
  status text not null default 'draft' check (status in ('draft', 'in_review', 'changes_requested', 'rejected', 'validated', 'published', 'unpublished')),
  author_id uuid references public.profiles(id) on delete set null,
  author_name text,
  validator_id uuid references public.profiles(id) on delete set null,
  validator_name text,                           -- tel qu'enregistré dans health_staff au moment de la validation
  validator_credentials text,
  validated_at timestamptz,
  published_at timestamptz,
  reviewed_at timestamptz,                       -- dernière révision validée
  review_note text check (char_length(coalesce(review_note, '')) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search_text text generated always as (public.normalize_text(title || ' ' || summary || ' ' || coalesce(keywords, ''))) stored,
  check (jsonb_typeof(body) = 'object' and jsonb_typeof(myths) = 'array' and jsonb_typeof(faq) = 'array')
);
create index if not exists health_articles_status on public.health_articles (status, category_id);
create index if not exists health_articles_search on public.health_articles using gin (search_text extensions.gin_trgm_ops);
drop trigger if exists health_articles_touch on public.health_articles;
create trigger health_articles_touch before update on public.health_articles for each row execute function public.touch_updated_at();
alter table public.health_articles enable row level security;
drop policy if exists "pp_health_articles_read" on public.health_articles;
create policy "pp_health_articles_read" on public.health_articles for select to anon, authenticated
  using (status = 'published' or public.is_health_staff());
revoke insert, update, delete on public.health_articles from anon, authenticated;
grant select on public.health_articles to anon, authenticated;

create table if not exists public.health_sources (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.health_articles(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 3 and 300),
  organization text not null check (char_length(btrim(organization)) between 2 and 200),
  url text check (url is null or url ~ '^https?://'),
  published_on text check (char_length(coalesce(published_on, '')) <= 40),   -- « 2024 », « mars 2023 »… ou vide si inconnue
  accessed_on date not null,
  sort_order int not null default 0
);
create index if not exists health_sources_article on public.health_sources (article_id);
alter table public.health_sources enable row level security;
drop policy if exists "pp_health_sources_read" on public.health_sources;
create policy "pp_health_sources_read" on public.health_sources for select to anon, authenticated using (
  exists (select 1 from public.health_articles a where a.id = article_id and (a.status = 'published' or public.is_health_staff())));
revoke insert, update, delete on public.health_sources from anon, authenticated;
grant select on public.health_sources to anon, authenticated;

create table if not exists public.health_article_history (
  id bigint generated always as identity primary key,
  article_id uuid not null references public.health_articles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_name text,
  action text not null,
  from_status text,
  to_status text,
  note text,
  snapshot jsonb,
  at timestamptz not null default now()
);
create index if not exists health_history_article on public.health_article_history (article_id, at desc);
alter table public.health_article_history enable row level security;
drop policy if exists "pp_health_history_read" on public.health_article_history;
create policy "pp_health_history_read" on public.health_article_history for select to authenticated using (public.is_health_staff());
revoke insert, update, delete on public.health_article_history from anon, authenticated;
grant select on public.health_article_history to authenticated;

-- Signalements d'information obsolète ou erronée (public, sans compte)
create table if not exists public.health_reports (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.health_articles(id) on delete cascade,
  reason text not null check (char_length(btrim(reason)) between 10 and 1000),
  reporter_id uuid references public.profiles(id) on delete set null,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now()
);
alter table public.health_reports enable row level security;
drop policy if exists "pp_health_reports_read" on public.health_reports;
create policy "pp_health_reports_read" on public.health_reports for select to authenticated using (public.is_health_staff());
revoke insert, update, delete on public.health_reports from anon, authenticated;
grant select on public.health_reports to authenticated;

-- ---------------------------------------------------------------------------
-- Outils internes
-- ---------------------------------------------------------------------------
create or replace function public.health_actor_name()
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select s.display_name from public.health_staff s where s.user_id = auth.uid() order by s.role desc limit 1),
                  (select p.full_name from public.profiles p where p.id = auth.uid()), 'Administration')
$$;

create or replace function public.health_log(p_article uuid, p_action text, p_from text, p_to text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.health_article_history (article_id, actor_id, actor_name, action, from_status, to_status, note, snapshot)
  select p_article, auth.uid(), public.health_actor_name(), p_action, p_from, p_to, p_note,
         jsonb_build_object('title', a.title, 'summary', a.summary, 'body', a.body, 'myths', a.myths, 'faq', a.faq,
                            'sources', (select coalesce(jsonb_agg(to_jsonb(s) - 'article_id' order by s.sort_order), '[]'::jsonb) from public.health_sources s where s.article_id = a.id))
  from public.health_articles a where a.id = p_article;
end $$;

-- Clés autorisées du corps d'une fiche (modèle standard)
create or replace function public.health_clean_body(p jsonb)
returns jsonb language sql immutable as $$
  select coalesce(jsonb_object_agg(k, to_jsonb(left(btrim(v), 6000))), '{}'::jsonb)
  from jsonb_each_text(coalesce(p, '{}'::jsonb)) as t(k, v)
  where k in ('definition', 'importance', 'situations', 'prevention', 'examens', 'deroulement', 'preparation',
              'resultats', 'quand_consulter', 'urgence', 'ou_au_mali')
    and nullif(btrim(v), '') is not null
$$;

-- ---------------------------------------------------------------------------
-- Enregistrement d'une fiche (rédacteur, validateur ou administrateur)
-- p : { id?, slug, category_slug, kind, title, summary, keywords, audiences[], recommendation,
--       body{}, myths[], faq[], exam_codes[], specialty_codes[], is_featured,
--       sources: [{ title, organization, url, published_on, accessed_on }] }
-- Modifier une fiche publiée ou validée la repasse en brouillon (elle disparaît du public
-- jusqu'à sa nouvelle validation) : un contenu modifié n'est jamais affiché comme validé.
-- ---------------------------------------------------------------------------
create or replace function public.health_save_article(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  aid uuid := nullif(p ->> 'id', '')::uuid; a public.health_articles; cat uuid; new_status text; s jsonb; i int := 0;
begin
  if not (public.health_role('editor') or public.health_role('validator')) then
    raise exception 'PP403: réservé aux rédacteurs et validateurs de la bibliothèque santé' using errcode = '42501';
  end if;
  select id into cat from public.health_categories where slug = p ->> 'category_slug';
  if cat is null then raise exception 'PP422: catégorie inconnue'; end if;
  if aid is not null then
    select * into a from public.health_articles where id = aid for update;
    if a.id is null then raise exception 'PP404: fiche introuvable'; end if;
    if a.status = 'in_review' then raise exception 'PP409: fiche en cours de validation : attendez la décision du validateur'; end if;
    new_status := case when a.status in ('published', 'validated', 'unpublished', 'rejected', 'changes_requested') then 'draft' else a.status end;
    update public.health_articles set
      slug = coalesce(nullif(btrim(p ->> 'slug'), ''), slug), category_id = cat,
      kind = coalesce(nullif(p ->> 'kind', ''), kind), title = btrim(p ->> 'title'), summary = btrim(coalesce(p ->> 'summary', '')),
      keywords = nullif(btrim(coalesce(p ->> 'keywords', '')), ''),
      audiences = coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p -> 'audiences', '[]')) x), '{}'),
      recommendation = nullif(p ->> 'recommendation', ''),
      body = public.health_clean_body(p -> 'body'), myths = coalesce(p -> 'myths', '[]'), faq = coalesce(p -> 'faq', '[]'),
      exam_codes = coalesce((select array_agg(lower(btrim(x))) from jsonb_array_elements_text(coalesce(p -> 'exam_codes', '[]')) x where btrim(x) <> ''), '{}'),
      specialty_codes = coalesce((select array_agg(lower(btrim(x))) from jsonb_array_elements_text(coalesce(p -> 'specialty_codes', '[]')) x where btrim(x) <> ''), '{}'),
      is_featured = coalesce((p ->> 'is_featured')::boolean, false),
      status = new_status,
      validated_at = case when new_status = 'draft' then null else validated_at end,
      validator_id = case when new_status = 'draft' then null else validator_id end,
      validator_name = case when new_status = 'draft' then null else validator_name end,
      validator_credentials = case when new_status = 'draft' then null else validator_credentials end
    where id = aid;
    perform public.health_log(aid, 'modification', a.status, new_status,
      case when a.status = 'published' then 'Fiche publiée modifiée : retirée du public jusqu''à sa nouvelle validation' end);
  else
    insert into public.health_articles (slug, category_id, kind, title, summary, keywords, audiences, recommendation, body, myths, faq,
                                        exam_codes, specialty_codes, is_featured, author_id, author_name)
    values (btrim(p ->> 'slug'), cat, coalesce(nullif(p ->> 'kind', ''), 'fiche'), btrim(p ->> 'title'), btrim(coalesce(p ->> 'summary', '')),
            nullif(btrim(coalesce(p ->> 'keywords', '')), ''),
            coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p -> 'audiences', '[]')) x), '{}'),
            nullif(p ->> 'recommendation', ''), public.health_clean_body(p -> 'body'), coalesce(p -> 'myths', '[]'), coalesce(p -> 'faq', '[]'),
            coalesce((select array_agg(lower(btrim(x))) from jsonb_array_elements_text(coalesce(p -> 'exam_codes', '[]')) x where btrim(x) <> ''), '{}'),
            coalesce((select array_agg(lower(btrim(x))) from jsonb_array_elements_text(coalesce(p -> 'specialty_codes', '[]')) x where btrim(x) <> ''), '{}'),
            coalesce((p ->> 'is_featured')::boolean, false), auth.uid(), public.health_actor_name())
    returning id into aid;
    perform public.health_log(aid, 'création', null, 'draft');
  end if;
  if p ? 'sources' then
    delete from public.health_sources where article_id = aid;
    for s in select * from jsonb_array_elements(coalesce(p -> 'sources', '[]')) loop
      insert into public.health_sources (article_id, title, organization, url, published_on, accessed_on, sort_order)
      values (aid, btrim(s ->> 'title'), btrim(s ->> 'organization'), nullif(btrim(coalesce(s ->> 'url', '')), ''),
              nullif(btrim(coalesce(s ->> 'published_on', '')), ''), coalesce(nullif(s ->> 'accessed_on', '')::date, current_date), i);
      i := i + 1;
    end loop;
  end if;
  return aid;
exception
  when unique_violation then raise exception 'PP409: une fiche utilise déjà cet identifiant d''adresse (slug)';
  when check_violation then raise exception 'PP422: vérifiez les champs : titre (3 à 160 caractères), résumé (600 max), identifiant (minuscules, chiffres, tirets), sources (titre, organisme, lien en http)';
  when invalid_datetime_format then raise exception 'PP422: date de consultation d''une source invalide (AAAA-MM-JJ)';
end $$;

-- Soumission à la validation : résumé, au moins une source et corps non vide exigés
create or replace function public.health_submit(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare a public.health_articles;
begin
  if not (public.health_role('editor') or public.health_role('validator')) then raise exception 'PP403: action non autorisée' using errcode = '42501'; end if;
  select * into a from public.health_articles where id = p_id for update;
  if a.id is null then raise exception 'PP404: fiche introuvable'; end if;
  if a.status not in ('draft', 'changes_requested') then raise exception 'PP409: seule une fiche en brouillon peut être soumise'; end if;
  if char_length(btrim(a.summary)) < 20 then raise exception 'PP422: ajoutez un résumé en langage simple (20 caractères minimum)'; end if;
  if not exists (select 1 from public.health_sources where article_id = p_id) then raise exception 'PP422: ajoutez au moins une source médicale'; end if;
  if a.body = '{}'::jsonb and jsonb_array_length(a.faq) = 0 and jsonb_array_length(a.myths) = 0 then raise exception 'PP422: la fiche est vide'; end if;
  update public.health_articles set status = 'in_review' where id = p_id;
  perform public.health_log(p_id, 'soumission', a.status, 'in_review');
end $$;

-- Décision du validateur médical : approuver, demander une correction, rejeter.
-- Un validateur ne peut pas valider une fiche dont il est l'auteur.
create or replace function public.health_review(p_id uuid, p_decision text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare a public.health_articles; st public.health_staff; new_status text;
begin
  select * into st from public.health_staff where user_id = auth.uid() and role = 'validator';
  if st.user_id is null then raise exception 'PP403: réservé aux validateurs médicaux enregistrés' using errcode = '42501'; end if;
  select * into a from public.health_articles where id = p_id for update;
  if a.id is null then raise exception 'PP404: fiche introuvable'; end if;
  if a.status <> 'in_review' then raise exception 'PP409: cette fiche n''est pas en attente de validation'; end if;
  if a.author_id = auth.uid() then raise exception 'PP409: vous ne pouvez pas valider une fiche que vous avez rédigée'; end if;
  new_status := case p_decision when 'approve' then 'validated' when 'changes' then 'changes_requested' when 'reject' then 'rejected' end;
  if new_status is null then raise exception 'PP422: décision invalide'; end if;
  if p_decision <> 'approve' and char_length(btrim(coalesce(p_note, ''))) < 5 then raise exception 'PP422: expliquez au rédacteur ce qui doit changer'; end if;
  update public.health_articles set status = new_status, review_note = nullif(btrim(coalesce(p_note, '')), ''),
    validator_id = case when p_decision = 'approve' then auth.uid() end,
    validator_name = case when p_decision = 'approve' then st.display_name end,
    validator_credentials = case when p_decision = 'approve' then st.credentials end,
    validated_at = case when p_decision = 'approve' then now() end,
    reviewed_at = case when p_decision = 'approve' then now() else reviewed_at end
  where id = p_id;
  perform public.health_log(p_id, case p_decision when 'approve' then 'validation médicale' when 'changes' then 'correction demandée' else 'rejet' end, 'in_review', new_status, p_note);
  if a.author_id is not null and a.author_id <> auth.uid() then
    perform public.notify_user(a.author_id, 'health', case p_decision when 'approve' then 'Fiche validée' when 'changes' then 'Correction demandée' else 'Fiche rejetée' end,
      format('« %s »%s', a.title, coalesce(' : ' || btrim(p_note), '')), null, format('/redaction-sante/%s', a.id));
  end if;
end $$;

-- Publication / dépublication (administrateur ou validateur) : seulement une fiche validée
create or replace function public.health_publish(p_id uuid, p_publish boolean)
returns void language plpgsql security definer set search_path = public as $$
declare a public.health_articles;
begin
  if not public.health_role('validator') then raise exception 'PP403: réservé aux validateurs et à l''administration' using errcode = '42501'; end if;
  select * into a from public.health_articles where id = p_id for update;
  if a.id is null then raise exception 'PP404: fiche introuvable'; end if;
  if p_publish then
    if a.status not in ('validated', 'unpublished') or a.validated_at is null then
      raise exception 'PP409: seule une fiche validée par un validateur médical peut être publiée';
    end if;
    update public.health_articles set status = 'published', published_at = coalesce(published_at, now()) where id = p_id;
    perform public.health_log(p_id, 'publication', a.status, 'published');
  else
    if a.status <> 'published' then raise exception 'PP409: cette fiche n''est pas publiée'; end if;
    update public.health_articles set status = 'unpublished' where id = p_id;
    perform public.health_log(p_id, 'dépublication', 'published', 'unpublished');
  end if;
end $$;

-- Suppression d'un brouillon jamais publié (administrateur)
create or replace function public.health_delete_article(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  delete from public.health_articles where id = p_id and published_at is null;
  if not found then raise exception 'PP409: une fiche déjà publiée ne se supprime pas : dépubliez-la'; end if;
end $$;

-- Gestion des rédacteurs et validateurs (administrateur)
create or replace function public.health_set_staff(p_email text, p_role text, p_display_name text, p_credentials text, p_grant boolean)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_admin(); target uuid;
begin
  select id into target from auth.users where lower(email) = lower(btrim(p_email));
  if target is null then raise exception 'PP404: aucun compte avec cette adresse (la personne doit d''abord s''inscrire)'; end if;
  if p_role not in ('editor', 'validator') then raise exception 'PP422: rôle invalide'; end if;
  if p_grant then
    insert into public.health_staff (user_id, role, display_name, credentials, granted_by)
    values (target, p_role, btrim(p_display_name), nullif(btrim(coalesce(p_credentials, '')), ''), uid)
    on conflict (user_id, role) do update set display_name = excluded.display_name, credentials = excluded.credentials;
  else
    delete from public.health_staff where user_id = target and role = p_role;
  end if;
  perform public.log_audit(case when p_grant then 'health.staff.grant' else 'health.staff.revoke' end, 'profile', target::text, jsonb_build_object('role', p_role));
exception when check_violation then raise exception 'PP422: indiquez le nom affiché (3 à 120 caractères)';
end $$;

-- Signalement public d'une information obsolète
create or replace function public.health_report(p_article uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.health_articles where id = p_article and status = 'published') then raise exception 'PP404: fiche introuvable'; end if;
  if (select count(*) from public.health_reports where article_id = p_article and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'PP429: trop de signalements, réessayez plus tard';
  end if;
  insert into public.health_reports (article_id, reason, reporter_id) values (p_article, btrim(p_reason), auth.uid());
exception when check_violation then raise exception 'PP422: décrivez le problème en 10 caractères au moins';
end $$;

create or replace function public.health_close_report(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_health_staff() then raise exception 'PP403: action non autorisée' using errcode = '42501'; end if;
  update public.health_reports set status = 'closed' where id = p_id;
end $$;

-- ---------------------------------------------------------------------------
-- Lecture publique
-- ---------------------------------------------------------------------------
-- Recherche dans les fiches publiées (synonymes via « keywords », fautes via trigrammes)
create or replace function public.health_search(p_query text default null, p_category text default null, p_audience text default null,
                                                p_kind text default null, p_limit int default 20, p_offset int default 0)
returns table (id uuid, slug text, title text, summary text, kind text, category_slug text, category_name text,
               recommendation text, reviewed_at timestamptz, validator_name text, score real, total_count bigint)
language sql stable security definer set search_path = public, extensions as $$
  with q as (select nullif(public.normalize_text(left(coalesce(p_query, ''), 80)), '') as t)
  select a.id, a.slug, a.title, a.summary, a.kind, c.slug, c.name, a.recommendation, coalesce(a.reviewed_at, a.validated_at), a.validator_name,
         case when q.t is null then 0 else greatest(extensions.word_similarity(q.t, a.search_text), case when a.search_text like '%' || q.t || '%' then 1 else 0 end)::real end as score,
         count(*) over ()
  from public.health_articles a join public.health_categories c on c.id = a.category_id cross join q
  where a.status = 'published' and a.lang = 'fr'
    and (p_category is null or c.slug = p_category)
    and (p_audience is null or p_audience = any(a.audiences) or 'tous' = any(a.audiences))
    and (p_kind is null or a.kind = p_kind)
    and (q.t is null or a.search_text like '%' || q.t || '%' or extensions.word_similarity(q.t, a.search_text) > 0.45)
  order by score desc, a.is_featured desc, coalesce(a.reviewed_at, a.published_at) desc nulls last, a.title
  limit least(greatest(coalesce(p_limit, 20), 1), 50) offset greatest(coalesce(p_offset, 0), 0)
$$;

-- Sujets en préparation d'une catégorie (titres uniquement, sans contenu) : transparence pour le public
create or replace function public.health_upcoming(p_category text)
returns table (title text, status text)
language sql stable security definer set search_path = public as $$
  select a.title, case when a.status in ('in_review', 'validated') then 'en validation' else 'en rédaction' end
  from public.health_articles a join public.health_categories c on c.id = a.category_id
  where c.slug = p_category and a.status in ('draft', 'in_review', 'changes_requested', 'validated') and a.lang = 'fr'
  order by a.title
  limit 40
$$;

-- Nombre de fiches publiées par catégorie
create or replace function public.health_category_counts()
returns table (category_id uuid, published bigint, upcoming bigint)
language sql stable security definer set search_path = public as $$
  select c.id, count(a.id) filter (where a.status = 'published'), count(a.id) filter (where a.status in ('draft', 'in_review', 'changes_requested', 'validated'))
  from public.health_categories c left join public.health_articles a on a.category_id = c.id and a.lang = 'fr'
  group by c.id
$$;

-- ---------------------------------------------------------------------------
-- Droits
-- ---------------------------------------------------------------------------
revoke execute on function public.health_log(uuid, text, text, text, text), public.health_actor_name() from public, anon, authenticated;
revoke execute on function public.health_save_article(jsonb), public.health_submit(uuid), public.health_review(uuid, text, text),
  public.health_publish(uuid, boolean), public.health_delete_article(uuid), public.health_set_staff(text, text, text, text, boolean),
  public.health_close_report(uuid) from public, anon;
grant execute on function public.health_save_article(jsonb), public.health_submit(uuid), public.health_review(uuid, text, text),
  public.health_publish(uuid, boolean), public.health_delete_article(uuid), public.health_set_staff(text, text, text, text, boolean),
  public.health_close_report(uuid) to authenticated;
grant execute on function public.health_report(uuid, text), public.health_search(text, text, text, text, int, int),
  public.health_upcoming(text), public.health_category_counts(), public.health_role(text), public.is_health_staff(),
  public.health_clean_body(jsonb) to anon, authenticated;

-- Examen ajouté au catalogue (utilisé par les fiches « Avant le mariage »)
insert into public.medical_exams (code, name, category, synonyms, description, sort_order) values
  ('syphilis', 'Sérologie de la syphilis (TPHA / VDRL / test rapide)', 'biologie', 'syphilis tpha vdrl rpr treponeme', 'Recherche d''une infection par la bactérie de la syphilis.', 32)
on conflict (code) do nothing;

-- >>> 20261029000600_audio_guides.sql
-- ============================================================================
-- PharmaProxi — Migration : guides audio en langues nationales
-- Des messages courts, enregistrés par des locuteurs natifs à partir d'un texte
-- français simple, écoutables sur les pages clés. Aucune voix de synthèse : chaque
-- enregistrement est déposé, vérifié puis publié par l'équipe.
-- ============================================================================

create table if not exists public.audio_languages (
  code text primary key check (code ~ '^[a-z]{2,12}$'),
  name text not null,
  native_name text,
  sort_order int not null default 100,
  is_active boolean not null default true
);
alter table public.audio_languages enable row level security;
drop policy if exists "pp_audio_lang_read" on public.audio_languages;
create policy "pp_audio_lang_read" on public.audio_languages for select to anon, authenticated using (true);
revoke insert, update, delete on public.audio_languages from anon, authenticated;
grant select on public.audio_languages to anon, authenticated;

-- Français + langues nationales du Mali
insert into public.audio_languages (code, name, native_name, sort_order) values
  ('francais', 'Français', null, 0),
  ('bambara', 'Bambara', 'Bamanankan', 1),
  ('peul', 'Peul', 'Fulfulde', 2),
  ('soninke', 'Soninké', 'Sooninkanxanne', 3),
  ('songhai', 'Songhaï', null, 4),
  ('tamasheq', 'Tamasheq', null, 5),
  ('dogon', 'Dogon', null, 6),
  ('malinke', 'Malinké', 'Maninkakan', 7),
  ('senoufo', 'Sénoufo', null, 8),
  ('minianka', 'Minianka', null, 9),
  ('bobo', 'Bobo', null, 10),
  ('bozo', 'Bozo', null, 11),
  ('kassonke', 'Khassonké', null, 12),
  ('hassaniya', 'Hassanya', null, 13)
on conflict (code) do nothing;

-- Pages et messages à enregistrer (texte français simple à faire traduire oralement)
create table if not exists public.audio_targets (
  key text primary key check (key ~ '^[a-z0-9:-]{2,100}$'),
  label text not null check (char_length(label) between 2 and 160),
  page_path text not null check (page_path ~ '^/'),
  script_fr text not null check (char_length(script_fr) between 20 and 3000),
  sort_order int not null default 100,
  created_at timestamptz not null default now()
);
alter table public.audio_targets enable row level security;
drop policy if exists "pp_audio_targets_read" on public.audio_targets;
create policy "pp_audio_targets_read" on public.audio_targets for select to anon, authenticated using (true);
revoke insert, update, delete on public.audio_targets from anon, authenticated;
grant select on public.audio_targets to anon, authenticated;

insert into public.audio_targets (key, label, page_path, sort_order, script_fr) values
  ('accueil', 'Accueil — présentation de PharmaProxi', '/', 1,
   'Bienvenue sur PharmaProxi. Ce site vous aide à trouver la pharmacie qui a votre médicament, près de chez vous. Écrivez le nom du médicament, choisissez votre quartier, puis regardez les pharmacies qui le déclarent. Avant de vous déplacer, appelez la pharmacie ou demandez une confirmation. PharmaProxi vous aide aussi à trouver un médecin, un laboratoire et les pharmacies de garde. Le site ne remplace pas l''avis d''un médecin ou d''un pharmacien.'),
  ('recherche', 'Rechercher un médicament', '/recherche', 2,
   'Pour chercher un médicament, écrivez son nom. Les résultats montrent les pharmacies qui disent l''avoir, avec le prix et la date de la dernière mise à jour. Une information ancienne peut ne plus être vraie : appelez toujours la pharmacie avant de partir. Les médicaments sur ordonnance ne sont donnés qu''avec l''ordonnance du médecin.'),
  ('garde', 'Pharmacies de garde', '/garde', 3,
   'Cette page montre les pharmacies de garde, ouvertes la nuit, le week-end et les jours fériés. Choisissez votre région et votre commune. Appelez la pharmacie avant de vous déplacer, car le tableau de garde peut changer.'),
  ('urgences', 'Urgences', '/urgences', 4,
   'En cas d''urgence grave — la personne ne répond plus, respire mal, a une forte douleur dans la poitrine, saigne beaucoup, ou a eu un accident — allez tout de suite au service d''urgence le plus proche ou appelez les secours. N''attendez pas un rendez-vous. Cette page donne les numéros d''urgence et les services ouverts jour et nuit.'),
  ('rendez-vous', 'Prendre rendez-vous avec un médecin', '/rendez-vous', 5,
   'Pour prendre rendez-vous, choisissez la spécialité et votre quartier. Choisissez un médecin, le motif de la visite, puis un horaire libre. Confirmez. Vous recevez un rappel la veille. Si vous ne pouvez pas venir, annulez pour laisser la place à quelqu''un d''autre. En cas d''urgence, ne prenez pas rendez-vous : allez aux urgences.'),
  ('inscription', 'Créer un compte', '/inscription', 6,
   'Pour créer un compte, écrivez votre nom, votre numéro de téléphone, votre adresse e-mail et un mot de passe. Gardez votre mot de passe pour vous. Avec un compte, vous pouvez demander une réservation en pharmacie, prendre rendez-vous et recevoir des alertes quand un médicament revient.'),
  ('sante', 'Santé essentielle', '/sante', 7,
   'La rubrique Santé essentielle donne des informations simples sur la santé : prévention, examens, maladies fréquentes. Chaque fiche est vérifiée par un professionnel de santé, et ses sources sont indiquées. Ces informations ne remplacent pas une consultation : pour votre santé, parlez à un médecin, une sage-femme ou un pharmacien.'),
  ('sante-mariage', 'Avant le mariage', '/sante/mariage', 8,
   'Avant le mariage, certains examens aident à préparer une famille en bonne santé : le groupe sanguin et le rhésus, le test de l''hémoglobine pour la drépanocytose, et le dépistage de certaines infections. Une différence de groupe sanguin n''empêche jamais de se marier. Si les deux futurs époux sont porteurs du gène de la drépanocytose, par exemple AS et AS, chaque grossesse a une chance sur quatre de donner un enfant malade. Ce n''est pas une interdiction : parlez-en à un médecin, qui vous accompagnera.')
on conflict (key) do nothing;

create table if not exists public.audio_clips (
  id uuid primary key default gen_random_uuid(),
  target_key text not null references public.audio_targets(key) on delete cascade,
  lang text not null references public.audio_languages(code) on delete restrict,
  storage_path text not null unique check (storage_path ~ '^[a-z0-9:/_.-]{5,200}$'),
  mime text not null check (mime in ('audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/ogg', 'audio/webm', 'audio/wav', 'audio/x-wav')),
  size_bytes int not null check (size_bytes between 1 and 10485760),
  duration_s int check (duration_s is null or duration_s between 1 and 900),
  speaker text check (char_length(coalesce(speaker, '')) <= 120),      -- voix (affichée si renseignée)
  translator text check (char_length(coalesce(translator, '')) <= 120), -- traduction orale
  reviewer text check (char_length(coalesce(reviewer, '')) <= 120),     -- relecture par un second locuteur
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  unique (target_key, lang)
);
alter table public.audio_clips enable row level security;
drop policy if exists "pp_audio_clips_read" on public.audio_clips;
create policy "pp_audio_clips_read" on public.audio_clips for select to anon, authenticated
  using (status = 'published' or public.is_admin() or public.is_health_staff());
revoke insert, update, delete on public.audio_clips from anon, authenticated;
grant select on public.audio_clips to anon, authenticated;

create or replace function public.can_manage_audio()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or public.is_health_staff()
$$;

-- Stockage : fichiers lisibles publiquement (bucket public), dépôt réservé à l'équipe
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('audio-guides', 'audio-guides', true, 10485760,
        array['audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/ogg', 'audio/webm', 'audio/wav', 'audio/x-wav'])
on conflict (id) do nothing;
drop policy if exists "pp_audio_insert" on storage.objects;
create policy "pp_audio_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'audio-guides' and public.can_manage_audio());
drop policy if exists "pp_audio_delete" on storage.objects;
create policy "pp_audio_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'audio-guides' and public.can_manage_audio());

-- Enregistre (ou remplace) l'enregistrement d'une page dans une langue ; renvoie l'ancien fichier à supprimer
create or replace function public.audio_register_clip(p_target text, p_lang text, p_path text, p_mime text, p_size int,
                                                      p_duration int, p_speaker text, p_translator text, p_reviewer text)
returns text language plpgsql security definer set search_path = public as $$
declare old_path text;
begin
  if not public.can_manage_audio() then raise exception 'PP403: réservé à l''équipe PharmaProxi' using errcode = '42501'; end if;
  if not exists (select 1 from public.audio_targets where key = p_target) then raise exception 'PP404: page inconnue'; end if;
  if not exists (select 1 from public.audio_languages where code = p_lang and is_active) then raise exception 'PP404: langue inconnue'; end if;
  select storage_path into old_path from public.audio_clips where target_key = p_target and lang = p_lang;
  delete from public.audio_clips where target_key = p_target and lang = p_lang;
  insert into public.audio_clips (target_key, lang, storage_path, mime, size_bytes, duration_s, speaker, translator, reviewer, created_by)
  values (p_target, p_lang, p_path, p_mime, p_size, p_duration, nullif(btrim(coalesce(p_speaker, '')), ''),
          nullif(btrim(coalesce(p_translator, '')), ''), nullif(btrim(coalesce(p_reviewer, '')), ''), auth.uid());
  perform public.log_audit('audio.upload', 'audio_clip', p_target || '/' || p_lang);
  return old_path;
exception when check_violation then raise exception 'PP422: fichier audio refusé (format MP3, M4A, AAC, OGG, WEBM ou WAV ; 10 Mo maximum)';
end $$;

-- Publication : exige l'indication d'une relecture par un second locuteur
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
  update public.audio_clips set status = case when p_publish then 'published' else 'draft' end,
    published_at = case when p_publish then coalesce(published_at, now()) else published_at end where id = p_id;
  perform public.log_audit(case when p_publish then 'audio.publish' else 'audio.unpublish' end, 'audio_clip', p_id::text);
end $$;

create or replace function public.audio_delete_clip(p_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare path text;
begin
  if not public.can_manage_audio() then raise exception 'PP403: réservé à l''équipe PharmaProxi' using errcode = '42501'; end if;
  delete from public.audio_clips where id = p_id returning storage_path into path;
  if path is null then raise exception 'PP404: enregistrement introuvable'; end if;
  perform public.log_audit('audio.delete', 'audio_clip', p_id::text);
  return path;
end $$;

-- Ajouter une page à enregistrer (ex. une fiche santé publiée : clé « fiche:<slug> »)
create or replace function public.audio_save_target(p_key text, p_label text, p_path text, p_script text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_manage_audio() then raise exception 'PP403: réservé à l''équipe PharmaProxi' using errcode = '42501'; end if;
  insert into public.audio_targets (key, label, page_path, script_fr, sort_order)
  values (lower(btrim(p_key)), btrim(p_label), btrim(p_path), btrim(p_script), 200)
  on conflict (key) do update set label = excluded.label, page_path = excluded.page_path, script_fr = excluded.script_fr;
exception when check_violation then raise exception 'PP422: vérifiez la clé, le titre, l''adresse (commençant par /) et le texte (20 à 3 000 caractères)';
end $$;

revoke execute on function public.audio_register_clip(text, text, text, text, int, int, text, text, text), public.audio_set_published(uuid, boolean),
  public.audio_delete_clip(uuid), public.audio_save_target(text, text, text, text) from public, anon;
grant execute on function public.audio_register_clip(text, text, text, text, int, int, text, text, text), public.audio_set_published(uuid, boolean),
  public.audio_delete_clip(uuid), public.audio_save_target(text, text, text, text), public.can_manage_audio() to authenticated;

-- >>> 20261030000100_assistant.sql
-- ============================================================================
-- PharmaProxi — Migration : assistant santé (IA)
-- Compteur journalier anonyme uniquement : aucune question, aucune réponse,
-- aucune adresse IP n'est enregistrée.
-- ============================================================================
create table if not exists public.assistant_usage (
  day date primary key default ((now() at time zone 'utc')::date),
  requests int not null default 0,
  emergencies int not null default 0,
  refused int not null default 0
);
alter table public.assistant_usage enable row level security;
drop policy if exists "pp_assistant_usage_admin" on public.assistant_usage;
create policy "pp_assistant_usage_admin" on public.assistant_usage for select to authenticated using (public.is_admin());
revoke insert, update, delete on public.assistant_usage from anon, authenticated;
grant select on public.assistant_usage to authenticated;

-- Compte une question. p_kind : 'ai' (appel à l'IA), 'emergency' (réponse d'urgence fixe).
-- Renvoie false si le plafond journalier d'appels à l'IA est atteint (la question n'est alors pas envoyée).
create or replace function public.assistant_count(p_kind text, p_daily_limit int)
returns boolean language plpgsql security definer set search_path = public as $$
declare d date := (now() at time zone 'utc')::date; n int;
begin
  insert into public.assistant_usage (day) values (d) on conflict (day) do nothing;
  if p_kind = 'emergency' then
    update public.assistant_usage set emergencies = emergencies + 1 where day = d;
    return true;
  end if;
  select requests into n from public.assistant_usage where day = d for update;
  if n >= greatest(coalesce(p_daily_limit, 2000), 0) then
    update public.assistant_usage set refused = refused + 1 where day = d;
    return false;
  end if;
  update public.assistant_usage set requests = requests + 1 where day = d;
  return true;
end $$;
revoke execute on function public.assistant_count(text, int) from public, anon, authenticated;
grant execute on function public.assistant_count(text, int) to service_role;

create or replace function public.purge_assistant_usage()
returns int language sql security definer set search_path = public as $$
  with d as (delete from public.assistant_usage where day < (now() at time zone 'utc')::date - 400 returning 1) select count(*)::int from d
$$;
revoke execute on function public.purge_assistant_usage() from public, anon, authenticated;

-- >>> 20261030000200_femme.sql
-- ============================================================================
-- PharmaProxi — Migration : PharmaProxi Femme (espace privé de santé féminine)
--   * Données visibles UNIQUEMENT par l'utilisatrice (aucune politique pour
--     l'administration, aucune fonction d'administration ne les lit).
--   * Activation par déclaration (espace réservé aux femmes) et consentement.
--   * Code secret facultatif : tant que l'espace est verrouillé, la base refuse
--     toute lecture et toute écriture (contrôle fait par la base, pas seulement l'écran).
--   * Adolescentes (13-17 ans) : pas de suivi des rapports, pas de projet de
--     conception, pas de partage partenaire.
--   * Rappels : notifications dans le compte uniquement, au texte neutre.
--   * Export et suppression complète à tout moment ; journal des accès sensibles.
-- Peut être relancé sans erreur.
-- ============================================================================

create table if not exists public.femme_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  declared_woman boolean not null check (declared_woman),
  consent_at timestamptz not null default now(),
  age_band text not null check (age_band in ('13-17', '18-24', '25-34', '35-44', '45-54', '55+')),
  journey text not null default 'cycle' check (journey in ('cycle', 'conception', 'grossesse', 'postpartum', 'menopause')),
  cycle_length int not null default 28 check (cycle_length between 15 and 60),
  period_length int not null default 5 check (period_length between 1 and 15),
  regularity text not null default 'ne_sait_pas' check (regularity in ('regulier', 'irregulier', 'ne_sait_pas')),
  pregnancy_lmp date,            -- premier jour des dernières règles avant la grossesse
  pregnancy_due date,            -- date prévue d'accouchement communiquée par la sage-femme ou le médecin (prioritaire)
  delivery_date date,            -- date de l'accouchement (post-partum)
  discreet boolean not null default false,
  remind_period boolean not null default false,
  remind_days_before int not null default 2 check (remind_days_before between 0 and 7),
  remind_log boolean not null default false,
  last_period_reminder date,
  last_log_reminder date,
  pin_hash text,
  pin_failures int not null default 0,
  pin_blocked_until timestamptz,
  unlocked_until timestamptz,
  partner_token text unique,
  partner_topics text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint femme_teen_limits check (age_band <> '13-17' or (journey <> 'conception' and partner_token is null)),
  constraint femme_partner_topics check (partner_topics <@ array['cycle', 'fertilite', 'grossesse', 'postpartum', 'menopause', 'general']::text[])
);

create table if not exists public.femme_periods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.femme_profiles(user_id) on delete cascade,
  start_date date not null,
  end_date date,
  created_at timestamptz not null default now(),
  unique (user_id, start_date),
  check (end_date is null or (end_date >= start_date and end_date <= start_date + 15))
);
create index if not exists femme_periods_user_idx on public.femme_periods(user_id, start_date desc);

create table if not exists public.femme_days (
  user_id uuid not null references public.femme_profiles(user_id) on delete cascade,
  day date not null,
  flow text check (flow in ('aucun', 'traces', 'leger', 'moyen', 'abondant')),
  symptoms text[] not null default '{}' check (symptoms <@ array['crampes', 'douleur_ventre', 'mal_tete', 'fatigue', 'acne', 'ballonnements',
    'seins_sensibles', 'nausees', 'mal_dos', 'pertes', 'saignement_inhabituel', 'bouffees_chaleur', 'insomnie', 'vertiges', 'envies', 'autre']::text[]),
  mood text check (mood in ('bien', 'calme', 'fatiguee', 'irritable', 'triste', 'anxieuse', 'energique')),
  pain smallint check (pain between 0 and 10),
  sleep smallint check (sleep between 1 and 5),
  mucus text check (mucus in ('aucune', 'collante', 'cremeuse', 'aqueuse', 'blanc_oeuf')),
  temperature numeric(4, 2) check (temperature between 34 and 43),
  intercourse text check (intercourse in ('protege', 'non_protege')),
  test_result text check (test_result in ('ovulation_positif', 'ovulation_negatif', 'grossesse_positif', 'grossesse_negatif')),
  note text check (char_length(note) <= 4000),   -- chiffrée par le serveur du site quand la clé est configurée
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

create table if not exists public.femme_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.femme_profiles(user_id) on delete cascade,
  kind text not null check (kind in ('consultation_prenatale', 'examen', 'traitement', 'rendez_vous', 'autre')),
  label text not null check (char_length(btrim(label)) between 2 and 80),
  due_at timestamptz not null,
  repeat text not null default 'aucune' check (repeat in ('aucune', 'quotidienne', 'hebdomadaire', 'mensuelle')),
  done boolean not null default false,
  notified_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists femme_reminders_due_idx on public.femme_reminders(due_at) where not done;

create table if not exists public.femme_access_log (
  id bigserial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  action text not null,
  at timestamptz not null default now()
);
create index if not exists femme_access_log_user_idx on public.femme_access_log(user_id, at desc);

-- ---------------------------------------------------------------------------
-- Verrou
-- ---------------------------------------------------------------------------
create or replace function public.femme_unlocked(p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.femme_profiles f where f.user_id = p_user and p_user is not null
                 and (f.pin_hash is null or f.unlocked_until > now()))
$$;

-- Contrôle commun aux fonctions : compte connecté, espace activé et déverrouillé ;
-- prolonge le déverrouillage de 30 minutes à chaque action.
create or replace function public.femme_require()
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'PP401: connectez-vous pour accéder à votre espace'; end if;
  if not exists (select 1 from public.femme_profiles where user_id = uid) then raise exception 'PP404: espace non activé'; end if;
  if not public.femme_unlocked(uid) then raise exception 'PP423: espace verrouillé, saisissez votre code'; end if;
  update public.femme_profiles set unlocked_until = now() + interval '30 minutes' where user_id = uid and pin_hash is not null;
  return uid;
end $$;

create or replace function public.femme_log(p_user uuid, p_action text)
returns void language sql security definer set search_path = public as $$
  insert into public.femme_access_log (user_id, action) values (p_user, p_action);
  delete from public.femme_access_log where user_id = p_user and at < now() - interval '365 days';
$$;

-- ---------------------------------------------------------------------------
-- Lecture : uniquement ses propres données, et seulement si l'espace est déverrouillé
-- ---------------------------------------------------------------------------
alter table public.femme_profiles enable row level security;
alter table public.femme_periods enable row level security;
alter table public.femme_days enable row level security;
alter table public.femme_reminders enable row level security;
alter table public.femme_access_log enable row level security;

drop policy if exists "pp_femme_profile_own" on public.femme_profiles;
create policy "pp_femme_profile_own" on public.femme_profiles for select to authenticated using (user_id = auth.uid() and public.femme_unlocked());
drop policy if exists "pp_femme_periods_own" on public.femme_periods;
create policy "pp_femme_periods_own" on public.femme_periods for select to authenticated using (user_id = auth.uid() and public.femme_unlocked());
drop policy if exists "pp_femme_days_own" on public.femme_days;
create policy "pp_femme_days_own" on public.femme_days for select to authenticated using (user_id = auth.uid() and public.femme_unlocked());
drop policy if exists "pp_femme_reminders_own" on public.femme_reminders;
create policy "pp_femme_reminders_own" on public.femme_reminders for select to authenticated using (user_id = auth.uid() and public.femme_unlocked());
drop policy if exists "pp_femme_log_own" on public.femme_access_log;
create policy "pp_femme_log_own" on public.femme_access_log for select to authenticated using (user_id = auth.uid() and public.femme_unlocked());

revoke all on public.femme_profiles, public.femme_periods, public.femme_days, public.femme_reminders, public.femme_access_log from anon;
revoke insert, update, delete on public.femme_profiles, public.femme_periods, public.femme_days, public.femme_reminders, public.femme_access_log from authenticated;
grant select on public.femme_periods, public.femme_days, public.femme_reminders, public.femme_access_log to authenticated;
-- Le code secret (empreinte) et le jeton partenaire ne sont jamais lisibles directement
revoke select on public.femme_profiles from authenticated;
grant select (user_id, consent_at, age_band, journey, cycle_length, period_length, regularity, pregnancy_lmp, pregnancy_due, delivery_date,
              discreet, remind_period, remind_days_before, remind_log, partner_topics, created_at, updated_at) on public.femme_profiles to authenticated;

-- ---------------------------------------------------------------------------
-- État (lisible même verrouillé : n'indique que l'état du verrou)
-- ---------------------------------------------------------------------------
create or replace function public.femme_status()
returns jsonb language sql stable security definer set search_path = public as $$
  select case when auth.uid() is null then jsonb_build_object('signed_in', false)
    else coalesce((select jsonb_build_object('signed_in', true, 'enabled', true, 'has_pin', f.pin_hash is not null,
                     'locked', not public.femme_unlocked(f.user_id), 'discreet', f.discreet,
                     'blocked_until', case when f.pin_blocked_until > now() then f.pin_blocked_until end,
                     'partner', f.partner_token is not null and public.femme_unlocked(f.user_id))
                   from public.femme_profiles f where f.user_id = auth.uid()),
                  jsonb_build_object('signed_in', true, 'enabled', false)) end
$$;

-- Jeton partenaire (seulement si déverrouillé)
create or replace function public.femme_partner_token()
returns text language sql stable security definer set search_path = public as $$
  select f.partner_token from public.femme_profiles f where f.user_id = auth.uid() and public.femme_unlocked(f.user_id)
$$;

-- ---------------------------------------------------------------------------
-- Activation et profil
-- ---------------------------------------------------------------------------
create or replace function public.femme_activate(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'PP401: connectez-vous pour activer votre espace'; end if;
  if coalesce((p ->> 'declared_woman')::boolean, false) is not true then raise exception 'PP422: cet espace est réservé aux femmes'; end if;
  if coalesce((p ->> 'consent')::boolean, false) is not true then raise exception 'PP422: votre accord est nécessaire pour enregistrer ces informations'; end if;
  if exists (select 1 from public.femme_profiles where user_id = uid) then raise exception 'PP409: votre espace est déjà activé'; end if;
  insert into public.femme_profiles (user_id, declared_woman, age_band, journey, cycle_length, period_length, regularity, pregnancy_lmp, pregnancy_due, delivery_date)
  values (uid, true, p ->> 'age_band', coalesce(p ->> 'journey', 'cycle'),
          coalesce((p ->> 'cycle_length')::int, 28), coalesce((p ->> 'period_length')::int, 5), coalesce(p ->> 'regularity', 'ne_sait_pas'),
          nullif(p ->> 'pregnancy_lmp', '')::date, nullif(p ->> 'pregnancy_due', '')::date, nullif(p ->> 'delivery_date', '')::date);
  if nullif(p ->> 'last_period', '') is not null then
    insert into public.femme_periods (user_id, start_date) values (uid, (p ->> 'last_period')::date);
  end if;
  perform public.femme_log(uid, 'activation');
exception
  when check_violation then raise exception 'PP422: informations à vérifier (tranche d''âge, durées, situation — certaines options ne sont pas proposées avant 18 ans)';
  when invalid_datetime_format or datetime_field_overflow or invalid_text_representation then raise exception 'PP422: date ou nombre invalide';
end $$;

create or replace function public.femme_update_profile(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public.femme_require();
begin
  update public.femme_profiles set
    age_band = coalesce(p ->> 'age_band', age_band),
    journey = coalesce(p ->> 'journey', journey),
    cycle_length = coalesce((p ->> 'cycle_length')::int, cycle_length),
    period_length = coalesce((p ->> 'period_length')::int, period_length),
    regularity = coalesce(p ->> 'regularity', regularity),
    pregnancy_lmp = case when p ? 'pregnancy_lmp' then nullif(p ->> 'pregnancy_lmp', '')::date else pregnancy_lmp end,
    pregnancy_due = case when p ? 'pregnancy_due' then nullif(p ->> 'pregnancy_due', '')::date else pregnancy_due end,
    delivery_date = case when p ? 'delivery_date' then nullif(p ->> 'delivery_date', '')::date else delivery_date end,
    discreet = coalesce((p ->> 'discreet')::boolean, discreet),
    remind_period = coalesce((p ->> 'remind_period')::boolean, remind_period),
    remind_days_before = coalesce((p ->> 'remind_days_before')::int, remind_days_before),
    remind_log = coalesce((p ->> 'remind_log')::boolean, remind_log),
    updated_at = now()
  where user_id = uid;
  -- Passage en tranche adolescente : le partage et le suivi des rapports sont retirés
  update public.femme_profiles set partner_token = null, partner_topics = '{}' where user_id = uid and age_band = '13-17';
  update public.femme_days set intercourse = null where user_id = uid and intercourse is not null
    and exists (select 1 from public.femme_profiles where user_id = uid and age_band = '13-17');
exception
  when check_violation then raise exception 'PP422: informations à vérifier (certaines options ne sont pas proposées avant 18 ans)';
  when invalid_datetime_format or datetime_field_overflow or invalid_text_representation then raise exception 'PP422: date ou nombre invalide';
end $$;

-- ---------------------------------------------------------------------------
-- Code secret (4 à 6 chiffres, empreinte bcrypt) et verrouillage
-- ---------------------------------------------------------------------------
create or replace function public.femme_set_pin(p_pin text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare uid uuid := public.femme_require();
begin
  if p_pin is null or p_pin = '' then
    update public.femme_profiles set pin_hash = null, unlocked_until = null, pin_failures = 0 where user_id = uid;
    perform public.femme_log(uid, 'code_retire');
    return;
  end if;
  if p_pin !~ '^[0-9]{4,6}$' then raise exception 'PP422: le code doit contenir 4 à 6 chiffres'; end if;
  update public.femme_profiles set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf', 8)), pin_failures = 0,
         unlocked_until = now() + interval '30 minutes' where user_id = uid;
  perform public.femme_log(uid, 'code_defini');
end $$;

create or replace function public.femme_unlock(p_pin text)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare uid uuid := auth.uid(); f public.femme_profiles;
begin
  select * into f from public.femme_profiles where user_id = uid for update;
  if not found then raise exception 'PP404: espace non activé'; end if;
  if f.pin_hash is null then return true; end if;
  if f.pin_blocked_until > now() then raise exception 'PP429: trop d''essais, réessayez dans quelques minutes'; end if;
  if extensions.crypt(coalesce(p_pin, ''), f.pin_hash) = f.pin_hash then
    update public.femme_profiles set pin_failures = 0, pin_blocked_until = null, unlocked_until = now() + interval '30 minutes' where user_id = uid;
    perform public.femme_log(uid, 'deverrouillage');
    return true;
  end if;
  update public.femme_profiles set
    pin_failures = case when pin_failures + 1 >= 5 then 0 else pin_failures + 1 end,
    pin_blocked_until = case when pin_failures + 1 >= 5 then now() + interval '15 minutes' end
  where user_id = uid;
  perform public.femme_log(uid, 'code_errone');
  return false;
end $$;

create or replace function public.femme_lock()
returns void language sql security definer set search_path = public as $$
  update public.femme_profiles set unlocked_until = null where user_id = auth.uid()
$$;

-- ---------------------------------------------------------------------------
-- Règles
-- ---------------------------------------------------------------------------
create or replace function public.femme_save_period(p_id uuid, p_start date, p_end date)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := public.femme_require(); rid uuid; plen int;
begin
  select period_length - 1 into plen from public.femme_profiles where user_id = uid;
  if p_start is null or p_start > current_date + 1 then raise exception 'PP422: date de début invalide (pas dans le futur)'; end if;
  if p_end is not null and p_end > current_date + 1 then raise exception 'PP422: la date de fin ne peut pas être dans le futur'; end if;
  if p_start < current_date - interval '5 years' then raise exception 'PP422: date trop ancienne'; end if;
  if exists (select 1 from public.femme_periods x where x.user_id = uid and x.id is distinct from p_id
             and daterange(x.start_date, coalesce(x.end_date, x.start_date + plen), '[]') && daterange(p_start, coalesce(p_end, p_start), '[]')) then
    raise exception 'PP409: ces dates chevauchent des règles déjà enregistrées';
  end if;
  if p_id is null then
    insert into public.femme_periods (user_id, start_date, end_date) values (uid, p_start, p_end) returning id into rid;
  else
    update public.femme_periods set start_date = p_start, end_date = p_end where id = p_id and user_id = uid returning id into rid;
    if rid is null then raise exception 'PP404: enregistrement introuvable'; end if;
  end if;
  return rid;
exception
  when check_violation then raise exception 'PP422: la fin doit suivre le début (15 jours au plus)';
  when unique_violation then raise exception 'PP409: des règles commencent déjà ce jour-là';
end $$;

create or replace function public.femme_delete_period(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public.femme_require();
begin
  delete from public.femme_periods where id = p_id and user_id = uid;
end $$;

-- ---------------------------------------------------------------------------
-- Journal du jour
-- ---------------------------------------------------------------------------
create or replace function public.femme_save_day(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public.femme_require(); d date := (p ->> 'day')::date; teen boolean;
begin
  if d is null or d > current_date + 1 or d < current_date - interval '5 years' then raise exception 'PP422: date invalide'; end if;
  select age_band = '13-17' into teen from public.femme_profiles where user_id = uid;
  insert into public.femme_days (user_id, day, flow, symptoms, mood, pain, sleep, mucus, temperature, intercourse, test_result, note, updated_at)
  values (uid, d, nullif(p ->> 'flow', ''),
          coalesce((select array_agg(distinct x) from jsonb_array_elements_text(coalesce(p -> 'symptoms', '[]')) x), '{}'),
          nullif(p ->> 'mood', ''), nullif(p ->> 'pain', '')::smallint, nullif(p ->> 'sleep', '')::smallint, nullif(p ->> 'mucus', ''),
          nullif(replace(p ->> 'temperature', ',', '.'), '')::numeric,
          case when teen then null else nullif(p ->> 'intercourse', '') end,
          case when teen and p ->> 'test_result' like 'ovulation%' then null else nullif(p ->> 'test_result', '') end,
          nullif(p ->> 'note', ''), now())
  on conflict (user_id, day) do update set flow = excluded.flow, symptoms = excluded.symptoms, mood = excluded.mood, pain = excluded.pain,
    sleep = excluded.sleep, mucus = excluded.mucus, temperature = excluded.temperature, intercourse = excluded.intercourse,
    test_result = excluded.test_result, note = excluded.note, updated_at = now();
  -- Une journée entièrement vide est supprimée
  delete from public.femme_days where user_id = uid and day = d and flow is null and symptoms = '{}' and mood is null and pain is null
    and sleep is null and mucus is null and temperature is null and intercourse is null and test_result is null and note is null;
exception
  when check_violation then raise exception 'PP422: valeur invalide (douleur 0 à 10, température 34 à 43 °C, note trop longue)';
  when invalid_datetime_format or datetime_field_overflow or invalid_text_representation then raise exception 'PP422: date ou nombre invalide';
end $$;

-- ---------------------------------------------------------------------------
-- Rappels
-- ---------------------------------------------------------------------------
create or replace function public.femme_save_reminder(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := public.femme_require(); rid uuid; n int;
begin
  select count(*) into n from public.femme_reminders where user_id = uid and not done;
  if (p ->> 'id') is null and n >= 50 then raise exception 'PP429: 50 rappels actifs au maximum'; end if;
  if (p ->> 'id') is null then
    insert into public.femme_reminders (user_id, kind, label, due_at, repeat)
    values (uid, p ->> 'kind', btrim(p ->> 'label'), (p ->> 'due_at')::timestamptz, coalesce(p ->> 'repeat', 'aucune')) returning id into rid;
  else
    update public.femme_reminders set kind = p ->> 'kind', label = btrim(p ->> 'label'), due_at = (p ->> 'due_at')::timestamptz,
           repeat = coalesce(p ->> 'repeat', 'aucune'), notified_at = null, done = false
    where id = (p ->> 'id')::uuid and user_id = uid returning id into rid;
    if rid is null then raise exception 'PP404: rappel introuvable'; end if;
  end if;
  return rid;
exception
  when check_violation or not_null_violation then raise exception 'PP422: type, intitulé (2 à 80 caractères) et date du rappel à vérifier';
  when invalid_datetime_format or datetime_field_overflow or invalid_text_representation then raise exception 'PP422: date invalide';
end $$;

create or replace function public.femme_reminder_action(p_id uuid, p_action text)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public.femme_require();
begin
  if p_action = 'delete' then delete from public.femme_reminders where id = p_id and user_id = uid;
  elsif p_action = 'done' then update public.femme_reminders set done = true where id = p_id and user_id = uid;
  elsif p_action = 'undo' then update public.femme_reminders set done = false where id = p_id and user_id = uid;
  else raise exception 'PP422: action inconnue'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- Espace partenaire : désactivé par défaut, réservé aux majeures, révocable.
-- Le lien ne montre que des contenus pédagogiques choisis, jamais de données personnelles.
-- ---------------------------------------------------------------------------
create or replace function public.femme_set_partner(p_enable boolean, p_topics text[])
returns text language plpgsql security definer set search_path = public, extensions as $$
declare uid uuid := public.femme_require(); tok text;
begin
  if not coalesce(p_enable, false) then
    update public.femme_profiles set partner_token = null, partner_topics = '{}' where user_id = uid;
    perform public.femme_log(uid, 'partage_desactive');
    return null;
  end if;
  if exists (select 1 from public.femme_profiles where user_id = uid and age_band = '13-17') then
    raise exception 'PP403: le partage n''est pas proposé avant 18 ans';
  end if;
  if coalesce(array_length(p_topics, 1), 0) = 0 then raise exception 'PP422: choisissez au moins un thème à partager'; end if;
  update public.femme_profiles set partner_topics = (select array_agg(distinct t) from unnest(p_topics) t),
         partner_token = coalesce(partner_token, encode(extensions.gen_random_bytes(18), 'hex'))
  where user_id = uid returning partner_token into tok;
  perform public.femme_log(uid, 'partage_active');
  return tok;
exception
  when check_violation then raise exception 'PP422: thème inconnu';
end $$;

create or replace function public.femme_partner_view(p_token text)
returns text[] language sql stable security definer set search_path = public as $$
  select f.partner_topics from public.femme_profiles f
  where p_token ~ '^[0-9a-f]{36}$' and f.partner_token = p_token and f.age_band <> '13-17'
$$;

-- ---------------------------------------------------------------------------
-- Export et suppression
-- ---------------------------------------------------------------------------
create or replace function public.femme_export()
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := public.femme_require(); r jsonb;
begin
  select jsonb_build_object(
    'exporte_le', now(),
    'profil', (select to_jsonb(f) - 'pin_hash' - 'partner_token' - 'pin_failures' - 'pin_blocked_until' - 'unlocked_until' from public.femme_profiles f where f.user_id = uid),
    'regles', coalesce((select jsonb_agg(jsonb_build_object('debut', start_date, 'fin', end_date) order by start_date) from public.femme_periods where user_id = uid), '[]'),
    'journal', coalesce((select jsonb_agg(to_jsonb(d) - 'user_id' order by day) from public.femme_days d where user_id = uid), '[]'),
    'rappels', coalesce((select jsonb_agg(to_jsonb(x) - 'user_id' order by due_at) from public.femme_reminders x where user_id = uid), '[]'),
    'journal_des_acces', coalesce((select jsonb_agg(jsonb_build_object('action', action, 'le', at) order by at) from public.femme_access_log where user_id = uid), '[]')
  ) into r;
  perform public.femme_log(uid, 'export');
  return r;
end $$;

create or replace function public.femme_delete_all()
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'PP401: connectez-vous'; end if;
  perform public.femme_require();
  delete from public.femme_profiles where user_id = uid;   -- règles, journal et rappels supprimés en cascade
  delete from public.femme_access_log where user_id = uid;
  delete from public.notifications where user_id = uid and kind = 'femme';
end $$;

-- ---------------------------------------------------------------------------
-- Rappels envoyés par la maintenance : notification dans le compte, texte neutre
-- ---------------------------------------------------------------------------
create or replace function public.femme_next_period(p_user uuid)
returns date language sql stable security definer set search_path = public as $$
  with s as (select start_date, lag(start_date) over (order by start_date) as prev
             from public.femme_periods where user_id = p_user order by start_date desc limit 7),
       gaps as (select start_date - prev as g from s where prev is not null and start_date - prev between 15 and 60)
  select (select max(start_date) from public.femme_periods where user_id = p_user)
         + coalesce((select round(avg(g))::int from gaps), (select cycle_length from public.femme_profiles where user_id = p_user))
$$;

create or replace function public.femme_send_reminders()
returns int language plpgsql security definer set search_path = public as $$
declare n int := 0; k int; today date := (now() at time zone 'utc')::date;
begin
  -- Rappels programmés par l'utilisatrice
  with due as (
    update public.femme_reminders r set notified_at = now(),
      due_at = case r.repeat when 'quotidienne' then r.due_at + interval '1 day' when 'hebdomadaire' then r.due_at + interval '7 days'
                             when 'mensuelle' then r.due_at + interval '1 month' else r.due_at end,
      done = (r.repeat = 'aucune')
    where not r.done and r.due_at <= now() and (r.notified_at is null or r.repeat <> 'aucune')
    returning r.user_id)
  insert into public.notifications (user_id, kind, title, body, link)
  select user_id, 'femme', 'Vous avez un rappel', 'Ouvrez votre espace personnel pour le consulter.', '/femme/rappels' from due;
  get diagnostics k = row_count; n := n + k;

  -- Prochaines règles estimées (suivi du cycle uniquement)
  with p as (
    update public.femme_profiles f set last_period_reminder = today
    where f.remind_period and f.journey in ('cycle', 'conception') and f.last_period_reminder is distinct from today
      and public.femme_next_period(f.user_id) - f.remind_days_before = today
    returning f.user_id)
  insert into public.notifications (user_id, kind, title, body, link)
  select user_id, 'femme', 'Petit rappel', 'Une information vous attend dans votre espace personnel.', '/femme' from p;
  get diagnostics k = row_count; n := n + k;

  -- Rappel de saisie (une fois par semaine au plus, si rien n'a été noté depuis 7 jours)
  with l as (
    update public.femme_profiles f set last_log_reminder = today
    where f.remind_log and (f.last_log_reminder is null or f.last_log_reminder <= today - 7)
      and not exists (select 1 from public.femme_days d where d.user_id = f.user_id and d.day > today - 7)
      and f.created_at < now() - interval '3 days'
    returning f.user_id)
  insert into public.notifications (user_id, kind, title, body, link)
  select user_id, 'femme', 'Petit rappel', 'Pensez à mettre à jour votre espace personnel.', '/femme' from l;
  get diagnostics k = row_count; n := n + k;
  return n;
end $$;

create or replace function public.run_maintenance()
returns jsonb language plpgsql security definer set search_path = public as $$
declare expired int; rl int; logs int; notifs int; outbox int; issues int; reminders int; appts int; appt_rem int; svc int; femme int; ai int;
begin
  expired := public.expire_overdue_orders();
  appts := public.expire_appointments();
  appt_rem := public.send_appointment_reminders();
  svc := public.purge_services();
  femme := public.femme_send_reminders();
  ai := public.purge_assistant_usage();
  delete from public.rate_limit_events where at < now() - interval '1 day';
  get diagnostics rl = row_count;
  delete from public.search_logs where created_at < now() - interval '400 days';
  get diagnostics logs = row_count;
  delete from public.notifications where read_at is not null and read_at < now() - interval '180 days';
  get diagnostics notifs = row_count;
  delete from public.notification_outbox where status in ('sent', 'skipped') and created_at < now() - interval '90 days';
  get diagnostics outbox = row_count;
  reminders := public.directory_reminders();
  select count(*) into issues from public.integrity_issues() where severity = 'critique';
  insert into public.maintenance_runs (expired, purged, critical_issues)
  values (expired, jsonb_build_object('rate_limits', rl, 'search_logs', logs, 'notifications', notifs, 'outbox', outbox,
                                      'directory_reminders', reminders, 'appointments_expired', appts, 'appointment_reminders', appt_rem,
                                      'services', svc, 'femme_reminders', femme, 'assistant_usage', ai), issues);
  delete from public.maintenance_runs where ran_at < now() - interval '30 days';
  return jsonb_build_object('expired', expired, 'appointments_expired', appts, 'appointment_reminders', appt_rem, 'femme_reminders', femme,
    'purged', jsonb_build_object('rate_limits', rl, 'search_logs', logs, 'notifications', notifs, 'outbox', outbox,
                                 'directory_reminders', reminders, 'services', svc, 'assistant_usage', ai),
    'critical_issues', issues);
end $$;
revoke execute on function public.run_maintenance() from public, anon, authenticated;
grant execute on function public.run_maintenance() to service_role;

-- Catégorie de la bibliothèque santé dédiée (gynécologie, ménopause…)
insert into public.health_categories (slug, name, description, icon, sort_order, is_priority) values
  ('sante-femme', 'Santé de la femme', 'Cycle menstruel, gynécologie, contraception, fertilité, grossesse, post-partum et ménopause.', 'flower', 15, false)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Droits
-- ---------------------------------------------------------------------------
revoke execute on function public.femme_unlocked(uuid), public.femme_require(), public.femme_log(uuid, text), public.femme_next_period(uuid),
  public.femme_send_reminders(), public.femme_status(), public.femme_partner_token(), public.femme_activate(jsonb), public.femme_update_profile(jsonb),
  public.femme_set_pin(text), public.femme_unlock(text), public.femme_lock(), public.femme_save_period(uuid, date, date), public.femme_delete_period(uuid),
  public.femme_save_day(jsonb), public.femme_save_reminder(jsonb), public.femme_reminder_action(uuid, text), public.femme_set_partner(boolean, text[]),
  public.femme_partner_view(text), public.femme_export(), public.femme_delete_all() from public, anon;
grant execute on function public.femme_unlocked(uuid) to authenticated;   -- utilisée par les politiques de lecture
grant execute on function public.femme_status(), public.femme_partner_token(), public.femme_activate(jsonb), public.femme_update_profile(jsonb),
  public.femme_set_pin(text), public.femme_unlock(text), public.femme_lock(), public.femme_save_period(uuid, date, date), public.femme_delete_period(uuid),
  public.femme_save_day(jsonb), public.femme_save_reminder(jsonb), public.femme_reminder_action(uuid, text), public.femme_set_partner(boolean, text[]),
  public.femme_export(), public.femme_delete_all() to authenticated;
grant execute on function public.femme_status(), public.femme_partner_view(text) to anon;
revoke execute on function public.femme_require(), public.femme_log(uuid, text), public.femme_next_period(uuid), public.femme_send_reminders() from authenticated;

-- >>> 20261030000300_nurses.sql
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

-- >>> 20261031000100_amo.sql
-- ============================================================================
-- PharmaProxi — Migration : Assurance maladie obligatoire (AMO)
--   * Liste officielle des médicaments pris en charge (CANAM), importée par
--     l'administration à partir du fichier officiel : aucune donnée n'est saisie ici.
--   * Lien entre le catalogue PharmaProxi et la liste AMO (rapprochement automatique
--     par nom + dosage, corrigeable par l'administration).
--   * Pharmacies conventionnées : déclaration par la pharmacie, vérification par l'équipe.
--   * Estimation du reste à payer : prix − taux × min(prix, tarif officiel).
-- Peut être relancé sans erreur.
-- ============================================================================

create table if not exists public.amo_config (
  id boolean primary key default true check (id),
  rate_medicines numeric(5, 2) not null default 70 check (rate_medicines between 0 and 100),  -- part AMO en officine (%)
  list_label text,          -- ex. « Liste AMO des médicaments — révision CANAM 2022 »
  list_reference text,      -- ex. arrêté ou note de la CANAM
  list_date date,
  source_url text check (source_url is null or source_url ~ '^https?://'),
  updated_at timestamptz not null default now()
);
insert into public.amo_config (id) values (true) on conflict do nothing;
alter table public.amo_config enable row level security;
drop policy if exists "pp_amo_config_read" on public.amo_config;
create policy "pp_amo_config_read" on public.amo_config for select to anon, authenticated using (true);
revoke insert, update, delete on public.amo_config from anon, authenticated;
grant select on public.amo_config to anon, authenticated;

-- Clé de rapprochement : minuscules sans accents, « 500 mg » → « 500mg », « 0,5 % » → « 0.5% »
create or replace function public.amo_key(t text)
returns text language sql immutable parallel safe set search_path = public, extensions as $$
  select btrim(regexp_replace(regexp_replace(regexp_replace(
           public.normalize_text(t),
           '(\d),(\d)', '\1.\2', 'g'),                         -- virgule décimale
           '(\d) +((mg|g|ml|l|ui|mui|µg|mcg|ug|meq|mmol|cl)\M|%)', '\1\2', 'g'),
           '\s+', ' ', 'g'))
$$;

create table if not exists public.amo_medicines (
  id uuid primary key default gen_random_uuid(),
  code text check (char_length(coalesce(code, '')) <= 40),
  name text not null check (char_length(btrim(name)) between 1 and 400),   -- désignation officielle (nom, dosage, forme, conditionnement)
  dci text check (char_length(coalesce(dci, '')) <= 200),
  dosage text check (char_length(coalesce(dosage, '')) <= 80),
  form text check (char_length(coalesce(form, '')) <= 80),
  presentation text check (char_length(coalesce(presentation, '')) <= 120),
  category text check (category is null or category in ('specialite', 'generique_marque', 'generique_dci', 'dispositif')),
  tariff_xof int check (tariff_xof is null or tariff_xof between 0 and 10000000),   -- tarif de responsabilité / prix de référence
  rate numeric(5, 2) check (rate is null or rate between 0 and 100),                 -- taux particulier, sinon taux général
  list_version text not null check (char_length(list_version) between 1 and 80),
  match_key text generated always as (public.amo_key(name || coalesce(' ' || dosage, ''))) stored,
  search_text text generated always as (public.amo_key(coalesce(name, '') || ' ' || coalesce(dci, '') || ' ' || coalesce(code, ''))) stored,
  created_at timestamptz not null default now()
);
create index if not exists amo_medicines_trgm on public.amo_medicines using gin (search_text extensions.gin_trgm_ops);
create index if not exists amo_medicines_key on public.amo_medicines (match_key text_pattern_ops);
create unique index if not exists amo_medicines_unique on public.amo_medicines (list_version, coalesce(code, ''), match_key, public.normalize_text(coalesce(form, '')), public.normalize_text(coalesce(presentation, '')));
alter table public.amo_medicines enable row level security;
drop policy if exists "pp_amo_meds_read" on public.amo_medicines;
create policy "pp_amo_meds_read" on public.amo_medicines for select to anon, authenticated using (true);
revoke insert, update, delete on public.amo_medicines from anon, authenticated;
grant select on public.amo_medicines to anon, authenticated;

-- Lien catalogue → liste AMO
create table if not exists public.amo_catalog_links (
  catalog_id uuid primary key references public.medicine_catalog(id) on delete cascade,
  amo_id uuid references public.amo_medicines(id) on delete cascade,   -- null + manual = « non pris en charge » confirmé
  manual boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.amo_catalog_links enable row level security;
drop policy if exists "pp_amo_links_read" on public.amo_catalog_links;
create policy "pp_amo_links_read" on public.amo_catalog_links for select to anon, authenticated using (true);
revoke insert, update, delete on public.amo_catalog_links from anon, authenticated;
grant select on public.amo_catalog_links to anon, authenticated;

-- Pharmacies conventionnées
create table if not exists public.pharmacy_amo (
  pharmacy_id uuid primary key references public.pharmacies(id) on delete cascade,
  status text not null check (status in ('declared', 'verified', 'rejected')),
  declared_at timestamptz not null default now(),
  verified_at timestamptz,
  verified_by uuid references auth.users(id) on delete set null,
  note text check (char_length(coalesce(note, '')) <= 300)
);
alter table public.pharmacy_amo enable row level security;
drop policy if exists "pp_pharmacy_amo_read" on public.pharmacy_amo;
create policy "pp_pharmacy_amo_read" on public.pharmacy_amo for select to anon, authenticated using (status <> 'rejected' or public.is_admin() or public.is_pharmacy_member(pharmacy_id));
revoke insert, update, delete on public.pharmacy_amo from anon, authenticated;
grant select on public.pharmacy_amo to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Calcul
-- ---------------------------------------------------------------------------
create or replace function public.amo_patient_share(p_price int, p_tariff int, p_rate numeric)
returns int language sql immutable as $$
  select case when p_price is null or p_rate is null then null
    else greatest(0, p_price - round(p_rate / 100.0 * least(p_price, coalesce(p_tariff, p_price))))::int end
$$;

-- Rapprochement d'un produit du catalogue avec la liste AMO.
--   * la désignation officielle doit commencer par le nom commercial du produit ;
--   * chaque dosage du produit (« 500 mg/5 ml » → 500mg, 5ml) doit figurer dans la désignation ;
--   * la forme départage les candidats (comprimé, sirop, injectable…) ;
--   * s'il reste plusieurs candidats à des tarifs différents, aucun lien automatique
--     (l'administration choisit à la main) : on n'affiche jamais un tarif douteux.
create or replace function public.amo_form_pattern(p_form text)
returns text language sql immutable parallel safe set search_path = public as $$
  select case
    when f ~ 'effervescent' then '\m(effv?|eff|effervescents?)\M'
    when f ~ 'comprime|cpr|comp\M' then '\m(comp|cpr|cp|comprimes?|dragees?)\M'
    when f ~ 'gelule|capsule' then '\m(gelu|gel|gelules?|caps|capsules?)\M'
    when f ~ 'sirop' then '\msirop\M'
    when f ~ 'suspension|poudre' then '\m(susp|suspension|pdre|poudre)\M'
    when f ~ 'inject|ampoule|perfusion' then '\m(inj|injectable|amp|perf|flacon|iv|im)\M'
    when f ~ 'suppositoire' then '\msuppo'
    when f ~ 'sachet' then '\msach'
    when f ~ 'pommade' then '\mpom'
    when f ~ 'creme' then '\mcre?me?\M'
    when f ~ 'gel\M' then '\mgel\M'
    when f ~ 'collyre' then '\mcoll?yre'
    when f ~ 'goutte' then '\m(gtte?s?|gouttes?)\M'
    when f ~ 'ovule' then '\movule'
    when f ~ 'solution' then '\m(sol|solution|buv)\M'
    else null end
  from (select public.normalize_text(p_form) as f) x
$$;

drop function if exists public.amo_best_match(text, text, text, text);
create or replace function public.amo_best_match(p_brand text, p_dosage text, p_form text, p_pack text default null)
returns uuid language plpgsql stable security definer set search_path = public as $$
declare b text := public.amo_key(p_brand); toks text[]; fp text := public.amo_form_pattern(p_form);
        pk text := substring(public.normalize_text(coalesce(p_pack, '')) from '(\d+)'); r uuid;
        forms constant text := '\m(comp|cpr|cp|gelu|gel|caps|sirop|susp|pdre|inj|injectable|amp|perf|iv|suppo|sach|sachets?|pom|pommade|creme|crem|collyre|gtte|gouttes?|ovule|sol|buv)\M';
begin
  if char_length(coalesce(b, '')) < 3 then return null; end if;
  b := replace(replace(replace(b, '\', '\\'), '%', '\%'), '_', '\_');
  select coalesce(array_agg(regexp_replace(t, '([.%])', '\\\1', 'g')), '{}') into toks
    from regexp_split_to_table(regexp_replace(public.amo_key(coalesce(p_dosage, '')), ' ', '', 'g'), '[/+;]') t
   where t ~ '^[0-9.]+[a-zµ%]*$' and t ~ '[0-9]';
  with c as (
    select a.id, a.tariff_xof, a.match_key from public.amo_medicines a
     where (a.match_key = replace(replace(replace(b, '\%', '%'), '\_', '_'), '\\', '\') or a.match_key like b || ' %')
       and not exists (select 1 from unnest(toks) t where a.match_key !~ ('(^|[^0-9.])' || t || '($|[^0-9a-z.])'))),
  f0 as (  -- la forme : on garde les désignations de cette forme ; à défaut, celles qui n'indiquent aucune autre forme
    select * from c where fp is null or match_key ~ fp
       or (not exists (select 1 from c where match_key ~ fp) and match_key !~ forms)),
  f1 as (  -- un comprimé simple n'est pas un comprimé effervescent (ni l'inverse)
    select * from f0 where coalesce(fp, '') ~ 'eff' or match_key !~ '\m(effv?|effervescents?)\M'
       or not exists (select 1 from f0 where match_key !~ '\m(effv?|effervescents?)\M')),
  f as (   -- le conditionnement (« boîte de 24 » ↔ « BTE/24 ») départage les boîtes
    select * from f1 where pk is null or match_key ~ ('[/x] ?' || pk || '\M')
       or not exists (select 1 from f1 where match_key ~ ('[/x] ?' || pk || '\M')))
  select case when count(distinct coalesce(tariff_xof, -1)) = 1 then (array_agg(id order by match_key))[1] end into r from f;
  return r;
end $$;

create or replace function public.amo_rematch()
returns int language plpgsql security definer set search_path = public as $$
declare n int := 0; c record; m uuid;
begin
  delete from public.amo_catalog_links where not manual;
  for c in select id, brand_name, dosage, form, packaging from public.medicine_catalog mc
            where merged_into is null and not exists (select 1 from public.amo_catalog_links l where l.catalog_id = mc.id) loop
    m := public.amo_best_match(c.brand_name, c.dosage, c.form, c.packaging);
    if m is not null then
      insert into public.amo_catalog_links (catalog_id, amo_id, manual) values (c.id, m, false);
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- Import de la liste officielle (par lots). p_rows : [{line, code, nom, dci, dosage, forme, presentation, categorie, tarif, taux}]
-- ---------------------------------------------------------------------------
create or replace function public.admin_import_amo(p_version text, p_rows jsonb, p_replace boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_admin(); rec record; ok int := 0; dup int := 0; errors jsonb := '[]'::jsonb; removed int := 0;
        v_tarif int; v_taux numeric; v_cat text; c text;
begin
  if char_length(btrim(coalesce(p_version, ''))) < 1 then raise exception 'PP422: indiquez la version de la liste (ex. CANAM 2022)'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 6000 then raise exception 'PP422: 6 000 lignes maximum par lot'; end if;
  if p_replace then
    delete from public.amo_medicines; get diagnostics removed = row_count;
  end if;
  for rec in select coalesce((e ->> 'line')::int, o::int + 1) as line, e from jsonb_array_elements(p_rows) with ordinality as t(e, o) loop
    begin
      rec.e := rec.e || jsonb_build_object('nom', coalesce(nullif(btrim(rec.e ->> 'nom'), ''), nullif(btrim(rec.e ->> 'designation'), ''), ''),
                                           'tarif', coalesce(nullif(btrim(rec.e ->> 'tarif'), ''), nullif(btrim(rec.e ->> 'prix_plafond'), ''), ''));
      if char_length(btrim(coalesce(rec.e ->> 'nom', ''))) < 1 then raise exception 'PP422: nom du médicament manquant'; end if;
      c := regexp_replace(coalesce(rec.e ->> 'tarif', ''), '[^0-9,.]', '', 'g');
      if c = '' and btrim(coalesce(rec.e ->> 'tarif', '')) <> '' then raise exception 'PP422: tarif invalide'; end if;
      v_tarif := case when c = '' then null else round(replace(c, ',', '.')::numeric)::int end;
      c := regexp_replace(coalesce(rec.e ->> 'taux', ''), '[^0-9,.]', '', 'g');
      v_taux := case when c = '' then null else replace(c, ',', '.')::numeric end;
      if v_taux is not null and v_taux <= 1 then v_taux := v_taux * 100; end if;  -- 0,7 → 70 %
      c := public.normalize_text(coalesce(rec.e ->> 'categorie', ''));
      v_cat := case when c = '' then null when c ~ 'dispositif|consommable' then 'dispositif' when c ~ 'dci' then 'generique_dci'
                    when c ~ 'generique' then 'generique_marque' when c ~ 'specialite|princeps' then 'specialite' else null end;
      insert into public.amo_medicines (code, name, dci, dosage, form, presentation, category, tariff_xof, rate, list_version)
      values (nullif(btrim(rec.e ->> 'code'), ''), btrim(rec.e ->> 'nom'), nullif(btrim(rec.e ->> 'dci'), ''), nullif(btrim(rec.e ->> 'dosage'), ''),
              nullif(btrim(rec.e ->> 'forme'), ''), nullif(btrim(rec.e ->> 'presentation'), ''), v_cat, v_tarif, v_taux, btrim(p_version));
      ok := ok + 1;
    exception
      when unique_violation then dup := dup + 1;
      when invalid_text_representation or numeric_value_out_of_range then errors := errors || jsonb_build_object('row', rec.line, 'error', 'tarif ou taux invalide');
      when others then errors := errors || jsonb_build_object('row', rec.line, 'error', regexp_replace(sqlerrm, '^PP[0-9]+: ', ''));
    end;
  end loop;
  perform public.log_audit('amo.import', 'amo_medicines', p_version, jsonb_build_object('imported', ok, 'duplicates', dup, 'failed', jsonb_array_length(errors), 'replaced', removed));
  return jsonb_build_object('imported', ok, 'duplicates', dup, 'failed', jsonb_array_length(errors), 'errors', errors, 'replaced', removed);
end $$;

create or replace function public.admin_amo_finish_import()
returns jsonb language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform public.require_admin();
  n := public.amo_rematch();
  return jsonb_build_object('matched', n, 'total', (select count(*) from public.amo_medicines));
end $$;

create or replace function public.admin_amo_config(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  update public.amo_config set
    rate_medicines = coalesce((p ->> 'rate_medicines')::numeric, rate_medicines),
    list_label = nullif(btrim(coalesce(p ->> 'list_label', '')), ''),
    list_reference = nullif(btrim(coalesce(p ->> 'list_reference', '')), ''),
    list_date = nullif(p ->> 'list_date', '')::date,
    source_url = nullif(btrim(coalesce(p ->> 'source_url', '')), ''),
    updated_at = now();
  perform public.log_audit('amo.config', 'amo_config', null, p);
exception
  when check_violation or invalid_datetime_format or invalid_text_representation then raise exception 'PP422: valeurs invalides (taux 0 à 100, lien en http)';
end $$;

-- Lien manuel : p_amo = null + p_none = true → « non pris en charge » ; p_amo = null + p_none = false → retour au rapprochement automatique
create or replace function public.admin_amo_link(p_catalog uuid, p_amo uuid, p_none boolean default false)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  if p_amo is null and not coalesce(p_none, false) then
    delete from public.amo_catalog_links where catalog_id = p_catalog;
    perform public.amo_rematch();
  else
    insert into public.amo_catalog_links (catalog_id, amo_id, manual) values (p_catalog, p_amo, true)
    on conflict (catalog_id) do update set amo_id = excluded.amo_id, manual = true, updated_at = now();
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Pharmacies conventionnées
-- ---------------------------------------------------------------------------
create or replace function public.pharmacy_declare_amo(p_pharmacy uuid, p_conventioned boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_pharmacy_owner(p_pharmacy) then raise exception 'PP403: seul le propriétaire de la pharmacie peut faire cette déclaration'; end if;
  if exists (select 1 from public.pharmacy_amo where pharmacy_id = p_pharmacy and status = 'rejected') and coalesce(p_conventioned, false) then
    raise exception 'PP409: déclaration refusée par l''équipe PharmaProxi ; contactez-la avec le justificatif de convention';
  end if;
  if coalesce(p_conventioned, false) then
    insert into public.pharmacy_amo (pharmacy_id, status) values (p_pharmacy, 'declared')
    on conflict (pharmacy_id) do update set status = case when pharmacy_amo.status = 'verified' then 'verified' else 'declared' end, declared_at = now();
  else
    delete from public.pharmacy_amo where pharmacy_id = p_pharmacy;
  end if;
  perform public.log_audit('amo.declare', 'pharmacy', p_pharmacy::text, jsonb_build_object('conventioned', p_conventioned));
end $$;

create or replace function public.admin_set_pharmacy_amo(p_pharmacy uuid, p_status text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_admin();
begin
  if p_status = 'none' then delete from public.pharmacy_amo where pharmacy_id = p_pharmacy; return; end if;
  if p_status not in ('declared', 'verified', 'rejected') then raise exception 'PP422: statut inconnu'; end if;
  insert into public.pharmacy_amo (pharmacy_id, status, verified_at, verified_by, note)
  values (p_pharmacy, p_status, case when p_status = 'verified' then now() end, case when p_status = 'verified' then uid end, nullif(btrim(coalesce(p_note, '')), ''))
  on conflict (pharmacy_id) do update set status = excluded.status, verified_at = excluded.verified_at, verified_by = excluded.verified_by, note = excluded.note;
  perform public.log_audit('amo.verify', 'pharmacy', p_pharmacy::text, jsonb_build_object('status', p_status));
end $$;

-- ---------------------------------------------------------------------------
-- Lecture publique
-- ---------------------------------------------------------------------------
create or replace function public.amo_search(p_query text default null, p_limit int default 20, p_offset int default 0)
returns table (id uuid, code text, name text, dci text, dosage text, form text, presentation text, category text, tariff_xof int, rate numeric,
               patient_share int, list_version text, total_count bigint)
language sql stable security definer set search_path = public, extensions as $$
  with q as (select nullif(public.amo_key(left(coalesce(p_query, ''), 80)), '') as t),
       cfg as (select rate_medicines from public.amo_config)
  select a.id, a.code, a.name, a.dci, a.dosage, a.form, a.presentation, a.category, a.tariff_xof, coalesce(a.rate, cfg.rate_medicines),
         public.amo_patient_share(a.tariff_xof, a.tariff_xof, coalesce(a.rate, cfg.rate_medicines)), a.list_version, count(*) over ()
  from public.amo_medicines a cross join q cross join cfg
  where q.t is not null and not exists (select 1 from regexp_split_to_table(q.t, '\s+') w where w <> '' and a.search_text not like '%' || w || '%')
  order by (a.search_text like q.t || '%') desc, a.name, a.dosage
  limit least(greatest(coalesce(p_limit, 20), 1), 50) offset greatest(coalesce(p_offset, 0), 0)
$$;
alter function public.amo_search(text, int, int) set statement_timeout = '5s';

-- Informations AMO pour des résultats de recherche (produits + pharmacies)
create or replace function public.amo_for_results(p_catalog uuid[], p_pharmacies uuid[])
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'rate', (select rate_medicines from public.amo_config),
    'products', coalesce((select jsonb_object_agg(l.catalog_id, jsonb_build_object('amo', l.amo_id is not null, 'code', a.code, 'name', a.name, 'tariff', a.tariff_xof,
                                                                       'rate', coalesce(a.rate, (select rate_medicines from public.amo_config))))
                          from public.amo_catalog_links l left join public.amo_medicines a on a.id = l.amo_id
                          where l.catalog_id = any(coalesce(p_catalog, '{}'))), '{}'::jsonb),
    'pharmacies', coalesce((select jsonb_object_agg(pharmacy_id, status) from public.pharmacy_amo
                            where pharmacy_id = any(coalesce(p_pharmacies, '{}')) and status in ('declared', 'verified')), '{}'::jsonb))
$$;

create or replace function public.amo_summary()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('total', (select count(*) from public.amo_medicines), 'rate', c.rate_medicines, 'label', c.list_label,
    'reference', c.list_reference, 'date', c.list_date, 'source', c.source_url,
    'pharmacies', (select count(*) from public.pharmacy_amo where status in ('declared', 'verified')),
    'verified', (select count(*) from public.pharmacy_amo where status = 'verified'))
  from public.amo_config c
$$;

create or replace function public.admin_amo_stats()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_admin();
  return jsonb_build_object('total', (select count(*) from public.amo_medicines),
    'versions', (select coalesce(jsonb_agg(distinct list_version), '[]') from public.amo_medicines),
    'linked', (select count(*) from public.amo_catalog_links where amo_id is not null),
    'catalog', (select count(*) from public.medicine_catalog),
    'declared', (select count(*) from public.pharmacy_amo where status = 'declared'),
    'verified', (select count(*) from public.pharmacy_amo where status = 'verified'));
end $$;

revoke execute on function public.amo_rematch(), public.amo_best_match(text, text, text, text), public.admin_import_amo(text, jsonb, boolean), public.admin_amo_finish_import(), public.admin_amo_config(jsonb),
  public.admin_amo_link(uuid, uuid, boolean), public.pharmacy_declare_amo(uuid, boolean), public.admin_set_pharmacy_amo(uuid, text, text), public.admin_amo_stats() from public, anon;
grant execute on function public.admin_import_amo(text, jsonb, boolean), public.admin_amo_finish_import(), public.admin_amo_config(jsonb),
  public.admin_amo_link(uuid, uuid, boolean), public.pharmacy_declare_amo(uuid, boolean), public.admin_set_pharmacy_amo(uuid, text, text), public.admin_amo_stats() to authenticated;
revoke execute on function public.amo_rematch(), public.amo_best_match(text, text, text, text) from authenticated;
grant execute on function public.amo_patient_share(int, int, numeric), public.amo_search(text, int, int), public.amo_for_results(uuid[], uuid[]), public.amo_summary() to anon, authenticated;

-- Nouveau produit au catalogue (ou nom/dosage modifié) : rapprochement automatique immédiat
create or replace function public.amo_link_catalog()
returns trigger language plpgsql security definer set search_path = public as $$
declare m uuid;
begin
  if exists (select 1 from public.amo_catalog_links where catalog_id = new.id and manual) then return new; end if;
  delete from public.amo_catalog_links where catalog_id = new.id;
  m := public.amo_best_match(new.brand_name, new.dosage, new.form, new.packaging);
  if m is not null then insert into public.amo_catalog_links (catalog_id, amo_id, manual) values (new.id, m, false); end if;
  return new;
end $$;
drop trigger if exists medicine_catalog_amo on public.medicine_catalog;
create trigger medicine_catalog_amo after insert or update of brand_name, dosage, form, packaging, merged_into on public.medicine_catalog
  for each row execute function public.amo_link_catalog();
revoke execute on function public.amo_link_catalog() from public, anon, authenticated;

-- >>> 20261101000100_insurance.sql
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

