-- SantéProxi — complément 0.33 pour le projet de démonstration (après le complément 0.32).
-- =============================================================================
-- SantéProxi 0.33 — SantéProxi Orientation, phase 1 : annuaire national des centres spécialisés
-- Réutilise facility_listings (établissements), care_focus (16 besoins) et facility_focus (lien établissement ↔ besoin).
-- Ajouts : fiabilité de la fiche (vérifié / à confirmer / information incomplète), détail de localisation,
-- statut de chaque spécialité (confirmée par une source / à confirmer), recherche avec distance,
-- premières structures transmises par l'éditeur, chacune avec son niveau réel de fiabilité.
-- Règles : rien n'est « vérifié » sans une action nommée d'un administrateur ; aucune coordonnée GPS, adresse,
-- horaire ou téléphone n'est inventé ; un service d'urgences n'est jamais présenté comme 24 h/24 sans confirmation.
-- Migration additive. Retour arrière : supprimer les colonnes ajoutées et les lignes dont source commence par « [0.33] ».
-- =============================================================================

alter table public.facility_listings drop constraint if exists facility_listings_kind_check;
alter table public.facility_listings add constraint facility_listings_kind_check
  check (kind in ('clinique', 'cabinet', 'cabinet_dentaire', 'centre_sante', 'csref', 'hopital', 'imagerie', 'laboratoire', 'urgences', 'ambulance',
                  'chu', 'centre_specialise', 'cscom'));
alter table public.facility_listings add column if not exists commune_id uuid references public.communes(id) on delete set null;
alter table public.facility_listings add column if not exists quarter text check (char_length(coalesce(quarter, '')) <= 160);
alter table public.facility_listings add column if not exists health_district text check (char_length(coalesce(health_district, '')) <= 120);
alter table public.facility_listings add column if not exists ownership text check (ownership is null or ownership in ('public', 'prive', 'confessionnel', 'communautaire', 'militaire'));
alter table public.facility_listings add column if not exists email text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$');
alter table public.facility_listings add column if not exists website text check (website is null or website ~ '^https?://');
alter table public.facility_listings add column if not exists hours text check (char_length(coalesce(hours, '')) <= 300);
alter table public.facility_listings add column if not exists access_conditions text check (char_length(coalesce(access_conditions, '')) <= 500);
alter table public.facility_listings add column if not exists reliability text not null default 'a_confirmer' check (reliability in ('verifie', 'a_confirmer', 'incomplet'));
alter table public.facility_listings add column if not exists verified_at date;
alter table public.facility_listings add column if not exists verified_by uuid references public.profiles(id) on delete set null;
alter table public.facility_listings add column if not exists source_url text check (source_url is null or source_url ~ '^https?://');
alter table public.facility_listings add column if not exists to_verify text check (char_length(coalesce(to_verify, '')) <= 500);
alter table public.facility_listings add column if not exists is_reference boolean not null default false;
alter table public.facility_listings add column if not exists reference_source text check (char_length(coalesce(reference_source, '')) <= 200);
do $$ begin
  alter table public.facility_listings add constraint facility_listings_verified_chk check (reliability <> 'verifie' or (verified_at is not null and verified_by is not null));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.facility_listings add constraint facility_listings_reference_chk check (not is_reference or char_length(btrim(coalesce(reference_source, ''))) >= 5);
exception when duplicate_object then null; end $$;

alter table public.facility_focus add column if not exists status text not null default 'a_confirmer' check (status in ('confirme', 'a_confirmer'));
alter table public.facility_focus add column if not exists detail text check (char_length(coalesce(detail, '')) <= 200);
alter table public.facility_focus add column if not exists source_url text check (source_url is null or source_url ~ '^https?://');

-- ---------------------------------------------------------------------------
-- Recherche d'orientation : besoin, mots, région, commune, type, fiabilité, distance (si position fournie)
-- La position de l'utilisateur n'est jamais enregistrée : elle sert seulement au calcul de ce tri.
-- ---------------------------------------------------------------------------
create or replace function public.orientation_search(p_focus text default null, p_q text default null, p_region uuid default null, p_commune uuid default null,
  p_kind text default null, p_reliability text default null, p_lat double precision default null, p_lng double precision default null, p_limit int default 60)
returns table (id uuid, name text, kind text, ownership text, region text, commune text, quarter text, city text, address text, phone text,
  latitude double precision, longitude double precision, reliability text, verified_at date, is_reference boolean,
  focus jsonb, matched_status text, distance_km double precision)
language sql stable security definer set search_path = public as $$
  with base as (
    select f.*, r.name region_name, co.name commune_name,
      (select ff.status from public.facility_focus ff where ff.facility_id = f.id and ff.focus_code = p_focus) m_status,
      (select coalesce(jsonb_agg(jsonb_build_object('code', ff.focus_code, 'label', cf.label, 'status', ff.status, 'detail', ff.detail) order by cf.sort), '[]'::jsonb)
         from public.facility_focus ff join public.care_focus cf on cf.code = ff.focus_code where ff.facility_id = f.id) focus_list,
      case when p_lat is not null and p_lng is not null and f.latitude is not null then
        6371 * 2 * asin(sqrt(power(sin(radians(f.latitude - p_lat) / 2), 2) + cos(radians(p_lat)) * cos(radians(f.latitude)) * power(sin(radians(f.longitude - p_lng) / 2), 2))) end dist
    from public.facility_listings f
    left join public.regions r on r.id = f.region_id left join public.communes co on co.id = f.commune_id
    where f.is_published and f.claimed_clinic_id is null and f.kind not in ('laboratoire', 'ambulance')
      and (p_region is null or f.region_id = p_region) and (p_commune is null or f.commune_id = p_commune)
      and (p_kind is null or f.kind = p_kind) and (p_reliability is null or f.reliability = p_reliability)
      and (p_q is null or char_length(btrim(p_q)) < 2 or f.search_name like '%' || public.normalize_text(p_q) || '%'
           or public.normalize_text(coalesce(f.quarter, '') || ' ' || coalesce(f.city_label, '')) like '%' || public.normalize_text(p_q) || '%'
           or exists (select 1 from public.facility_focus ff where ff.facility_id = f.id and public.normalize_text(coalesce(ff.detail, '')) like '%' || public.normalize_text(p_q) || '%'))
  )
  select id, name, kind, ownership, region_name, commune_name, quarter, city_label, address, phone, latitude, longitude, reliability, verified_at, is_reference,
    focus_list, m_status, round(dist::numeric, 1)::double precision
  from base where p_focus is null or m_status is not null
  order by (m_status = 'confirme') desc nulls last, dist nulls last, (reliability = 'verifie') desc, (reliability = 'incomplet'), name
  limit greatest(1, least(p_limit, 200));
$$;
grant execute on function public.orientation_search(text, text, uuid, uuid, text, text, double precision, double precision, int) to anon, authenticated;

-- Nombre de structures par besoin (pour l'accueil de la page)
create or replace function public.orientation_focus_counts(p_region uuid default null)
returns table (code text, n bigint) language sql stable security definer set search_path = public as $$
  select ff.focus_code, count(distinct ff.facility_id) from public.facility_focus ff
    join public.facility_listings f on f.id = ff.facility_id and f.is_published and f.claimed_clinic_id is null
   where p_region is null or f.region_id = p_region group by 1;
$$;
grant execute on function public.orientation_focus_counts(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Administration
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_facility_reliability(p_id uuid, p_reliability text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_admin();
begin
  if p_reliability not in ('verifie', 'a_confirmer', 'incomplet') then raise exception 'PP422: niveau invalide'; end if;
  if p_reliability = 'verifie' and char_length(btrim(coalesce(p_note, ''))) < 5 then raise exception 'PP422: indiquez comment l''information a été vérifiée'; end if;
  update public.facility_listings set reliability = p_reliability,
    verified_at = case when p_reliability = 'verifie' then current_date else verified_at end,
    verified_by = case when p_reliability = 'verifie' then uid else verified_by end,
    source = case when p_reliability = 'verifie' then left(btrim(p_note), 200) else source end, updated_at = now()
  where id = p_id;
  if not found then raise exception 'PP404: établissement introuvable'; end if;
  perform public.log_audit('facility.reliability', 'facility_listing', p_id::text, jsonb_build_object('reliability', p_reliability, 'note', p_note));
end $$;
revoke execute on function public.admin_set_facility_reliability(uuid, text, text) from public, anon;
grant execute on function public.admin_set_facility_reliability(uuid, text, text) to authenticated;

create or replace function public.admin_save_facility_details(p_id uuid, p jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  update public.facility_listings set
    kind = coalesce(nullif(p ->> 'kind', ''), kind), ownership = nullif(p ->> 'ownership', ''),
    quarter = nullif(btrim(coalesce(p ->> 'quarter', '')), ''), health_district = nullif(btrim(coalesce(p ->> 'health_district', '')), ''),
    address = nullif(btrim(coalesce(p ->> 'address', '')), ''), phone = nullif(p ->> 'phone', ''), phone2 = nullif(p ->> 'phone2', ''),
    email = nullif(btrim(coalesce(p ->> 'email', '')), ''), website = nullif(btrim(coalesce(p ->> 'website', '')), ''),
    hours = nullif(btrim(coalesce(p ->> 'hours', '')), ''), access_conditions = nullif(btrim(coalesce(p ->> 'access_conditions', '')), ''),
    latitude = nullif(p ->> 'latitude', '')::double precision, longitude = nullif(p ->> 'longitude', '')::double precision,
    source_url = nullif(btrim(coalesce(p ->> 'source_url', '')), ''), to_verify = nullif(btrim(coalesce(p ->> 'to_verify', '')), ''),
    is_reference = coalesce((p ->> 'is_reference')::boolean, false), reference_source = nullif(btrim(coalesce(p ->> 'reference_source', '')), ''),
    -- toute modification d'une fiche vérifiée la repasse « à confirmer » : la vérification doit être refaite
    reliability = case when reliability = 'verifie' and coalesce((p ->> 'keep_verified')::boolean, false) = false then 'a_confirmer' else reliability end,
    updated_at = now()
  where id = p_id;
  if not found then raise exception 'PP404: établissement introuvable'; end if;
  perform public.log_audit('facility.details', 'facility_listing', p_id::text);
exception when check_violation then raise exception 'PP422: vérifiez les champs (téléphone au format +223…, e-mail, site commençant par http, coordonnées au Mali, source du statut de référence)';
end $$;
revoke execute on function public.admin_save_facility_details(uuid, jsonb) from public, anon;
grant execute on function public.admin_save_facility_details(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Premières structures (transmises par l'éditeur le 11 novembre 2026, complétées par des sources publiques citées)
-- ---------------------------------------------------------------------------
do $$
declare bko uuid; reg uuid; fid uuid; t text := '[0.33] Information transmise à SantéProxi (nov. 2026), à confirmer';
  ortm text := 'https://www.ortm.ml/commune-v-un-nouveau-centre-de-dialyse-pour-faciliter-la-prise-en-charge-des-patients-dialyses';
  msds text := 'https://www.sante.gov.ml/index.php?option=com_content&view=article&id=525&catid=10&Itemid=105';
  gla text := 'https://glahospital.com/collections/dialyse';
  icrc text := 'https://www.icrc.org/fr/article/mali-le-cesop-un-pas-vers-lautonomisation-en-matiere-de-readaptation-physique';
  r record; f record;
begin
  select id into bko from public.regions where is_district limit 1;
  if bko is null then raise notice 'District de Bamako absent : données non chargées'; return; end if;
  for r in select * from (values
    -- nom, type, propriété, arrondissement (code), quartier, adresse, tél 1, tél 2, e-mail, site, horaires, accès, fiabilité, source, url, à vérifier
    ('Centre de lutte contre le diabète (Association malienne de lutte contre le diabète)', 'centre_specialise', null, null, 'Quartier du Fleuve', null, '+22320223467', null, null, null, null, null, 'a_confirmer', t, null, 'Adresse exacte, horaires, conditions d''accès'),
    ('Centre de recherche et de lutte contre la drépanocytose (CRLD)', 'centre_specialise', 'public', '03', 'Point G', null, '+22320223898', null, null, null, null, null, 'a_confirmer', t, null, 'Adresse exacte, horaires, conditions d''accès'),
    ('CHU du Point G', 'chu', 'public', '03', 'Point G (colline)', null, null, null, null, null, null, null, 'incomplet', t, null, 'Téléphone, services (cardiologie, psychiatrie, néphrologie et dialyse, ORL), accueil des urgences et horaires'),
    ('Hôpital du Mali', 'hopital', 'public', '06', 'Missabougou / Yirimadio', null, '+22320727569', null, null, null, null, null, 'a_confirmer', t, null, 'Services (cardiologie, oncologie, gynécologie-obstétrique, ORL), horaires de l''hémodialyse annoncés 24 h/24, accueil des urgences'),
    ('Golden Life American Hospital', 'clinique', 'prive', '05', 'Badalabougou', 'Rue 50, porte 734, Badalabougou', '+22320221111', '+22391221111', 'contact@glahospital.com', 'https://glahospital.com', null, 'Consultations sur rendez-vous (prise de rendez-vous sur le site de l''établissement)', 'a_confirmer', '[0.33] Site officiel de l''établissement (consulté le 11 nov. 2026)', gla, 'Horaires, tarifs, conventionnement CANAM'),
    ('CHU Gabriel Touré', 'chu', 'public', '03', 'Centre-ville', null, null, null, null, null, null, null, 'incomplet', t, null, 'Téléphone, services (oncologie dont pédiatrique, pédiatrie, ORL, néphrologie), accueil des urgences et horaires'),
    ('Clinique périnatale Mohammed VI', 'hopital', 'public', '04', 'Sébénikoro', null, null, null, null, null, null, null, 'incomplet', t, null, 'Téléphone, nom officiel exact, services (maternité, néonatologie), horaires'),
    ('CHU IOTA – Institut d''ophtalmologie tropicale de l''Afrique', 'chu', 'public', '03', 'Centre commercial', null, '+22320222722', null, null, null, null, null, 'a_confirmer', t, null, 'Adresse exacte, horaires, conditions d''accès'),
    ('CHU CNOS – Centre national d''odontostomatologie', 'chu', 'public', null, null, null, '+22320226517', null, null, null, null, null, 'a_confirmer', t, null, 'Adresse et quartier, horaires'),
    ('Centre national d''appareillage orthopédique du Mali (CNAOM)', 'centre_specialise', 'public', null, 'Djicoroni-Para / Quartier Mali (à vérifier)', null, null, null, null, null, null, null, 'incomplet', '[0.33] CICR (mai 2025) et information transmise à SantéProxi', icrc, 'Adresse exacte, téléphone, horaires'),
    ('Centre de dialyse du CSRéf de la Commune V', 'centre_specialise', 'public', '05', 'Quartier Mali', 'CSRéf de la Commune V (5e Arrondissement)', null, null, null, null, null, 'Prise en charge complète et gratuite des patients hémodialysés chroniques programmés (ministère de la Santé) ; urgences accueillies', 'incomplet', '[0.33] ORTM (31 oct. 2023) et ministère de la Santé', msds, 'Téléphone, horaires, modalités d''inscription'),
    ('Centre de dialyse de la Commune IV', 'centre_specialise', 'public', '04', 'Lafiabougou', null, null, null, null, null, 'Séances de 6 h à 19 h (ministère de la Santé)', 'Prise en charge complète et gratuite des patients hémodialysés chroniques programmés (ministère de la Santé) ; urgences accueillies', 'incomplet', '[0.33] ORTM (31 oct. 2023) et ministère de la Santé', msds, 'Téléphone, adresse exacte, modalités d''inscription'),
    ('Centre de dialyse du Génie militaire', 'centre_specialise', 'militaire', null, 'Génie militaire (34e régiment)', null, null, null, null, null, null, 'Prise en charge complète et gratuite des patients hémodialysés chroniques programmés (ministère de la Santé) ; accès des patients civils à confirmer', 'incomplet', '[0.33] ORTM (31 oct. 2023) et ministère de la Santé', msds, 'Adresse précise, téléphone, conditions d''accès (civils, militaires)')
  ) v(name, kind, own, arr, quarter, address, phone, phone2, email, website, hours, access, rel, src, url, todo) loop
    select id into fid from public.facility_listings where search_name = public.normalize_text(r.name) and region_id = bko;
    if fid is null then
      insert into public.facility_listings (name, kind, ownership, region_id, commune_id, city_label, quarter, address, phone, phone2, email, website, hours, access_conditions,
        reliability, source, source_url, to_verify, is_published)
      values (r.name, r.kind, r.own, bko, (select id from public.communes where region_id = bko and official_code = r.arr), 'Bamako', r.quarter, r.address, r.phone, r.phone2,
        r.email, r.website, r.hours, r.access, r.rel, r.src, r.url, r.todo, true)
      returning id into fid;
    end if;
  end loop;

  -- Fiche déjà présente : CHME Le Luxembourg (complétée sans changer ses coordonnées)
  update public.facility_listings set quarter = coalesce(quarter, 'Hamdallaye'), commune_id = coalesce(commune_id, (select id from public.communes where region_id = bko and official_code = '04')),
    to_verify = coalesce(to_verify, 'Services (maternité, gynécologie-obstétrique, pédiatrie), horaires')
  where search_name = public.normalize_text('Centre hospitalier Mère-Enfant Le Luxembourg') and region_id = bko;

  -- Structures signalées dont l'identité n'est pas encore établie : non publiées, à vérifier par l'équipe
  for r in select * from (values
    ('Clinique médicale dialyse Le Relais', 'ACI 2000'), ('Polyclinique CDIS – Centre de dialyse Ismaïl Soumaré', null)) v(name, quarter) loop
    if not exists (select 1 from public.facility_listings where search_name = public.normalize_text(r.name) and region_id = bko) then
      insert into public.facility_listings (name, kind, region_id, city_label, quarter, reliability, source, to_verify, is_published)
      values (r.name, 'centre_specialise', bko, 'Bamako', r.quarter, 'incomplet', t, 'Existence, adresse, téléphone et service de dialyse à confirmer avant publication', false);
    end if;
  end loop;

  -- Hôpitaux régionaux : fiches sans spécialité tant qu'aucune n'est confirmée
  for r in select * from (values ('Kayes', 'Hôpital Fousseyni Daou', 'Kayes'), ('Koulikoro', 'Hôpital régional de Koulikoro', 'Koulikoro'), ('Ségou', 'Hôpital Nianankoro Fomba', 'Ségou'),
      ('Sikasso', 'Hôpital de Sikasso', 'Sikasso'), ('Mopti', 'Hôpital Sominé Dolo', 'Mopti'), ('Gao', 'Hôpital Hangadoumbo Moulaye Touré', 'Gao'), ('Tombouctou', 'Hôpital de Tombouctou', 'Tombouctou')) v(region, name, city) loop
    select id into reg from public.regions where public.normalize_text(name) = public.normalize_text(r.region) limit 1;
    if reg is not null and not exists (select 1 from public.facility_listings where search_name = public.normalize_text(r.name) and region_id = reg) then
      insert into public.facility_listings (name, kind, ownership, region_id, city_label, reliability, source, to_verify, is_published)
      values (r.name, 'hopital', 'public', reg, r.city, 'incomplet', t, 'Téléphone, adresse, services réellement proposés, accueil des urgences', true);
    end if;
  end loop;

  -- Besoins pris en charge : « confirme » seulement avec une source publique citée, sinon « a_confirmer »
  for f in select * from (values
    ('Centre de lutte contre le diabète (Association malienne de lutte contre le diabète)', 'diabete', 'a_confirmer', 'Diabétologie et accompagnement des personnes diabétiques', null),
    ('Centre de recherche et de lutte contre la drépanocytose (CRLD)', 'drepanocytose', 'a_confirmer', 'Dépistage, diagnostic, suivi et prise en charge', null),
    ('CHU du Point G', 'hypertension_coeur', 'a_confirmer', 'Cardiologie (à confirmer)', null),
    ('CHU du Point G', 'sante_mentale', 'a_confirmer', 'Psychiatrie (à confirmer)', null),
    ('CHU du Point G', 'rein_dialyse', 'a_confirmer', 'Néphrologie et dialyse (à confirmer)', null),
    ('CHU du Point G', 'orl', 'a_confirmer', 'ORL (à confirmer)', null),
    ('CHU du Point G', 'urgences_24h', 'a_confirmer', 'Service d''urgences — ouverture 24 h/24 non confirmée', null),
    ('Hôpital du Mali', 'hypertension_coeur', 'a_confirmer', 'Cardiologie (à confirmer)', null),
    ('Hôpital du Mali', 'cancer', 'a_confirmer', 'Oncologie (à confirmer)', null),
    ('Hôpital du Mali', 'maternite', 'a_confirmer', 'Gynécologie-obstétrique (à confirmer)', null),
    ('Hôpital du Mali', 'orl', 'a_confirmer', 'ORL (à confirmer)', null),
    ('Hôpital du Mali', 'rein_dialyse', 'a_confirmer', 'Hémodialyse — ouverture 24 h/24 annoncée, à confirmer', null),
    ('Hôpital du Mali', 'urgences_24h', 'a_confirmer', 'Service d''urgences — ouverture 24 h/24 non confirmée', null),
    ('Golden Life American Hospital', 'rein_dialyse', 'confirme', 'Hémodialyse ; disponibilité 24 h/24 en cas de besoin urgent selon l''établissement', gla),
    ('Golden Life American Hospital', 'hypertension_coeur', 'confirme', 'Cardiologie (selon le site de l''établissement)', 'https://glahospital.com/collections/cardiology'),
    ('Golden Life American Hospital', 'orl', 'confirme', 'Oto-rhino-laryngologie (selon le site de l''établissement)', gla),
    ('Golden Life American Hospital', 'maternite', 'confirme', 'Gynécologie-obstétrique (selon le site de l''établissement)', 'https://glahospital.com/collections/obstetric-gynecology'),
    ('Golden Life American Hospital', 'pediatrie', 'confirme', 'Pédiatrie (selon le site de l''établissement)', gla),
    ('Golden Life American Hospital', 'yeux', 'confirme', 'Ophtalmologie (selon le site de l''établissement)', gla),
    ('Golden Life American Hospital', 'dents', 'confirme', 'Dentisterie / odontologie (selon le site de l''établissement)', 'https://glahospital.com/collections/dentistry'),
    ('CHU Gabriel Touré', 'cancer', 'a_confirmer', 'Oncologie, dont pédiatrique (à confirmer)', null),
    ('CHU Gabriel Touré', 'pediatrie', 'a_confirmer', 'Pédiatrie et urgences pédiatriques (à confirmer)', null),
    ('CHU Gabriel Touré', 'orl', 'a_confirmer', 'ORL (à confirmer)', null),
    ('CHU Gabriel Touré', 'rein_dialyse', 'a_confirmer', 'Néphrologie / dialyse (à confirmer)', null),
    ('CHU Gabriel Touré', 'urgences_24h', 'a_confirmer', 'Service d''urgences — ouverture 24 h/24 non confirmée', null),
    ('Centre hospitalier Mère-Enfant Le Luxembourg', 'maternite', 'a_confirmer', 'Maternité, gynécologie-obstétrique (à confirmer)', null),
    ('Centre hospitalier Mère-Enfant Le Luxembourg', 'pediatrie', 'a_confirmer', 'Pédiatrie, santé infantile (à confirmer)', null),
    ('Clinique périnatale Mohammed VI', 'maternite', 'a_confirmer', 'Maternité, périnatalité, suivi de grossesse (à confirmer)', null),
    ('Clinique périnatale Mohammed VI', 'pediatrie', 'a_confirmer', 'Suivi néonatal et périnatal (à confirmer)', null),
    ('CHU IOTA – Institut d''ophtalmologie tropicale de l''Afrique', 'yeux', 'a_confirmer', 'Ophtalmologie', null),
    ('CHU CNOS – Centre national d''odontostomatologie', 'dents', 'a_confirmer', 'Soins dentaires et odontostomatologie', null),
    ('Centre national d''appareillage orthopédique du Mali (CNAOM)', 'handicap_reeducation', 'confirme', 'Appareillage orthopédique (orthèses, prothèses), avec des antennes régionales', icrc),
    ('Centre de dialyse du CSRéf de la Commune V', 'rein_dialyse', 'confirme', 'Hémodialyse (centre autonome au sein du CSRéf)', ortm),
    ('Centre de dialyse de la Commune IV', 'rein_dialyse', 'confirme', 'Hémodialyse', msds),
    ('Centre de dialyse du Génie militaire', 'rein_dialyse', 'confirme', 'Hémodialyse', msds)
  ) v(name, focus, status, detail, url) loop
    select id into fid from public.facility_listings where search_name = public.normalize_text(f.name) and region_id = bko;
    if fid is not null and not exists (select 1 from public.facility_focus where facility_id = fid and focus_code = f.focus) then
      insert into public.facility_focus (focus_code, facility_id, source, status, detail, source_url, verified_at)
      values (f.focus, fid, case when f.url is null then 'Information transmise à SantéProxi (nov. 2026), à confirmer' else 'Source publique citée (consultée le 11 nov. 2026)' end,
              f.status, f.detail, f.url, case when f.status = 'confirme' then date '2026-11-11' end);
    end if;
  end loop;
end $$;
