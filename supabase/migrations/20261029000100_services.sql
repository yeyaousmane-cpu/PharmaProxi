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
