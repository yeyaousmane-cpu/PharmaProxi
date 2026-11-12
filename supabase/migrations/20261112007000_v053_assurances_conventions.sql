-- v053 — Référentiel des assurances et conventions de tiers payant
--
-- Réutilise les tables existantes (pas de table concurrente) :
--   insurers           → référentiel des assurances, mutuelles et régimes publics
--   insurer_providers  → conventions : une ligne = un établissement dans le réseau
--                        d'un organisme (relation plusieurs-à-plusieurs), reliée si
--                        possible à l'annuaire (pharmacies, pharmacy_listings,
--                        facility_listings)
--
-- Règles :
--   • Aucune convention n'est inventée. Les seules conventions enregistrées
--     proviennent de documents identifiés (liste SABU NYUMAN du 31/10/2026,
--     4 pharmacies RAMED citées par le porteur du projet).
--   • « Tiers payant confirmé » et « Remboursement sur justificatifs » ne peuvent
--     être posés que par un administrateur, avec une source et une date de
--     vérification (admin_update_conventions). Aucune ligne n'a ce statut ici.
--   • Une convention dont la date de fin est passée n'est plus affichée comme
--     confirmée (statut public « expirée », masquée du public).
--   • Le rapprochement avec l'annuaire ne se fait que sur correspondance exacte
--     et unique (nom normalisé + région) ; jamais de fusion d'établissements.
-- Retour arrière : les colonnes ajoutées peuvent être ignorées sans effet sur
-- l'existant ; aucune donnée n'est supprimée.

-- 1. Référentiel des organismes ----------------------------------------------
-- org_type précise le type d'organisme sans toucher à la contrainte existante sur kind.
alter table public.insurers
  add column if not exists org_type text not null default 'assurance_privee',
  add column if not exists description text,
  add column if not exists email text,
  add column if not exists address text,
  add column if not exists logo_url text,
  add column if not exists status text not null default 'a_verifier',
  add column if not exists health_offer text not null default 'a_confirmer',
  add column if not exists verified_at date,
  add column if not exists documents_required text,
  add column if not exists tiers_payant_terms text,
  add column if not exists reimbursement_terms text;

do $c$ begin
  if not exists (select 1 from pg_constraint where conname = 'insurers_status_check') then
    alter table public.insurers add constraint insurers_status_check check (status in ('actif', 'a_verifier', 'inactif'));
    alter table public.insurers add constraint insurers_org_type_check check (org_type in ('assurance_privee', 'regime_public', 'mutuelle', 'autre'));
    alter table public.insurers add constraint insurers_health_offer_check check (health_offer in ('confirmee', 'a_confirmer', 'aucune'));
    alter table public.insurers add constraint insurers_texts_check check (
      char_length(coalesce(description, '')) <= 800 and char_length(coalesce(address, '')) <= 250
      and char_length(coalesce(documents_required, '')) <= 400 and char_length(coalesce(tiers_payant_terms, '')) <= 600
      and char_length(coalesce(reimbursement_terms, '')) <= 600 and char_length(coalesce(email, '')) <= 120);
    alter table public.insurers add constraint insurers_urls_check check (
      (logo_url is null or logo_url ~ '^https://') and (email is null or email ~ '^[^@\s]+@[^@\s]+\.[a-z]{2,}$'));
  end if;
end $c$;

comment on column public.insurers.health_offer is 'confirmee : offre santé connue (réseau publié par l''organisme) ; a_confirmer : présence au Mali connue, offre santé non vérifiée.';

-- SABU NYUMAN : réseau publié par l'assureur, site indiqué par le porteur du projet.
update public.insurers
   set status = 'actif', health_offer = 'confirmee', website = coalesce(website, 'https://sbnassurances.com/'),
       documents_required = coalesce(documents_required, 'Carte d''assuré SABU NYUMAN en cours de validité ; ordonnance pour les médicaments.')
 where slug = 'sabu-nyuman';

-- Référentiel de recherche : noms transmis par le porteur du projet le 12/11/2026.
-- Aucune coordonnée n'est inventée ; seuls les sites cités dans la demande sont repris.
insert into public.insurers (name, slug, kind, org_type, website, status, health_offer, is_published, network_source, notes)
values
  ('AMO / CANAM', 'amo-canam', 'autre', 'regime_public', 'https://www.canam.ml/', 'actif', 'confirmee', true,
   null, 'Assurance maladie obligatoire. Liste des structures conventionnées à intégrer depuis la CANAM.'),
  ('ANAM / RAMED', 'anam-ramed', 'autre', 'regime_public', 'https://anam-mali.org/', 'actif', 'confirmee', true,
   null, 'Régime d''assistance médicale pour les personnes reconnues indigentes. Prise en charge dans les structures conventionnées, sur présentation de la carte RAMED.'),
  ('INPS', 'inps', 'autre', 'regime_public', null, 'a_verifier', 'a_confirmer', true, null, 'Coordonnées et réseau de soins à confirmer.'),
  ('UTM — Union technique de la Mutualité malienne', 'utm', 'mutuelle', 'mutuelle', 'https://mutualitemalienne.org/', 'a_verifier', 'a_confirmer', true, null, 'Réseau des mutuelles à confirmer.'),
  ('SanlamAllianz Mali', 'sanlamallianz-mali', 'assurance', 'assurance_privee', 'https://ml.sanlamallianz.com/', 'a_verifier', 'a_confirmer', true, null, null),
  ('ACTIVA Assurances Mali', 'activa-mali', 'assurance', 'assurance_privee', null, 'a_verifier', 'a_confirmer', true, null, null),
  ('SUNU Assurances Mali', 'sunu-mali', 'assurance', 'assurance_privee', null, 'a_verifier', 'a_confirmer', true, null, null),
  ('AFG Assurances Mali', 'afg-mali', 'assurance', 'assurance_privee', null, 'a_verifier', 'a_confirmer', true, null, null),
  ('Les Assurances Bleues (CNAR)', 'cnar', 'assurance', 'assurance_privee', null, 'a_verifier', 'a_confirmer', true, null, null),
  ('NSIA Assurances Mali', 'nsia-mali', 'assurance', 'assurance_privee', null, 'a_verifier', 'a_confirmer', true, null, null),
  ('Assurances Lafia', 'lafia', 'assurance', 'assurance_privee', null, 'a_verifier', 'a_confirmer', true, null, null),
  ('Atlantique Assurances', 'atlantique-assurances', 'assurance', 'assurance_privee', null, 'a_verifier', 'a_confirmer', true, null, null),
  ('Assurance SOCAR', 'socar', 'assurance', 'assurance_privee', null, 'a_verifier', 'a_confirmer', true, null, null),
  ('Assurances Seyba', 'seyba', 'assurance', 'assurance_privee', null, 'a_verifier', 'a_confirmer', true, null, null),
  ('Balimaya Assur', 'balimaya-assur', 'assurance', 'assurance_privee', null, 'a_verifier', 'a_confirmer', true, null, null),
  ('Nallias SA', 'nallias', 'assurance', 'assurance_privee', null, 'a_verifier', 'a_confirmer', true, null, null)
on conflict (slug) do nothing;

-- 2. Conventions ---------------------------------------------------------------
alter table public.insurer_providers
  add column if not exists listing_id uuid references public.pharmacy_listings(id) on delete set null,
  add column if not exists facility_id uuid references public.facility_listings(id) on delete set null,
  add column if not exists convention_status text not null default 'a_verifier',
  add column if not exists tiers_payant boolean,
  add column if not exists services_covered text,
  add column if not exists conditions text,
  add column if not exists documents_required text,
  add column if not exists starts_on date,
  add column if not exists ends_on date,
  add column if not exists source_label text,
  add column if not exists source_url text,
  add column if not exists source_date date,
  add column if not exists verified_at date,
  add column if not exists validated_by uuid,
  add column if not exists validated_at timestamptz,
  add column if not exists admin_note text,
  add column if not exists match_method text;

do $c$ begin
  if not exists (select 1 from pg_constraint where conname = 'insurer_providers_convention_status_check') then
    alter table public.insurer_providers add constraint insurer_providers_convention_status_check check (convention_status in
      ('tiers_payant_confirme', 'remboursement', 'a_verifier', 'en_attente', 'non_confirmee', 'expiree', 'suspendue'));
    alter table public.insurer_providers add constraint insurer_providers_confirmed_needs_source check (
      convention_status not in ('tiers_payant_confirme', 'remboursement')
      or (char_length(coalesce(source_label, '')) >= 3 and verified_at is not null));
    alter table public.insurer_providers add constraint insurer_providers_tp_coherent check (
      convention_status <> 'tiers_payant_confirme' or tiers_payant is true);
    alter table public.insurer_providers add constraint insurer_providers_dates_check check (ends_on is null or starts_on is null or ends_on >= starts_on);
    alter table public.insurer_providers add constraint insurer_providers_texts_check check (
      char_length(coalesce(services_covered, '')) <= 400 and char_length(coalesce(conditions, '')) <= 600
      and char_length(coalesce(documents_required, '')) <= 400 and char_length(coalesce(source_label, '')) <= 300
      and char_length(coalesce(admin_note, '')) <= 600 and (source_url is null or source_url ~ '^https?://'));
    alter table public.insurer_providers add constraint insurer_providers_match_method_check check (match_method is null or match_method in ('exact_unique', 'manuel'));
  end if;
end $c$;

create index if not exists insurer_providers_listing_idx on public.insurer_providers (listing_id) where listing_id is not null;
create index if not exists insurer_providers_facility_idx on public.insurer_providers (facility_id) where facility_id is not null;
create index if not exists insurer_providers_pharmacy_idx on public.insurer_providers (pharmacy_id) where pharmacy_id is not null;
create index if not exists insurer_providers_status_idx on public.insurer_providers (insurer_id, convention_status);

comment on column public.insurer_providers.convention_status is
  'tiers_payant_confirme et remboursement : posés par un administrateur avec source et date. a_verifier, en_attente, non_confirmee : affichés « Convention à vérifier ». expiree, suspendue : masqués du public.';
comment on column public.insurer_providers.tiers_payant is 'Tiers payant annoncé par la source (null : inconnu). N''est affiché comme confirmé qu''avec le statut tiers_payant_confirme.';

-- Statut public : une convention échue n'est jamais présentée comme confirmée.
create or replace function public.convention_public_status(p_status text, p_ends_on date, p_today date default current_date)
returns text language sql stable as $f$
  select case
    when p_status in ('expiree', 'suspendue') then p_status
    when p_ends_on is not null and p_ends_on < p_today then 'expiree'
    when p_status in ('tiers_payant_confirme', 'remboursement') then p_status
    else 'a_verifier'
  end
$f$;

-- Historique : chaque changement de statut ou de rattachement est journalisé.
create or replace function public.insurer_providers_history()
returns trigger language plpgsql security definer set search_path to 'public' as $f$
begin
  if new.convention_status is distinct from old.convention_status or new.is_published is distinct from old.is_published
     or new.ends_on is distinct from old.ends_on or new.pharmacy_id is distinct from old.pharmacy_id
     or new.listing_id is distinct from old.listing_id or new.facility_id is distinct from old.facility_id then
    insert into public.audit_logs (actor_id, action, entity_type, entity_id, details)
    values (auth.uid(), 'convention.update', 'insurer_provider', new.id::text, jsonb_build_object(
      'insurer_id', new.insurer_id, 'name', new.name,
      'status', jsonb_build_array(old.convention_status, new.convention_status),
      'published', jsonb_build_array(old.is_published, new.is_published),
      'ends_on', jsonb_build_array(old.ends_on, new.ends_on),
      'source', new.source_label, 'verified_at', new.verified_at));
  end if;
  return new;
end $f$;

create or replace trigger insurer_providers_history after update on public.insurer_providers
  for each row execute function public.insurer_providers_history();

-- 3. Données existantes : liste SABU NYUMAN ----------------------------------
-- Liste communiquée par l'assureur (fichier RESEAU_TP_SBN.xlsx, 31/10/2026) : le
-- tiers payant y est annoncé, mais la convention de chaque établissement doit
-- être validée avant d'afficher « Tiers payant confirmé ».
update public.insurer_providers ip
   set convention_status = 'en_attente', tiers_payant = true,
       source_label = left(coalesce(i.network_source, 'Liste communiquée par l''assureur') || ' (fichier RESEAU_TP_SBN.xlsx)', 300),
       source_date = i.network_date
  from public.insurers i
 where i.id = ip.insurer_id and i.slug = 'sabu-nyuman' and ip.source_label is null;

-- 4. Pharmacies RAMED citées dans la demande ----------------------------------
insert into public.insurer_providers (insurer_id, category, name, area, region_id, address, phones, is_published,
                                      convention_status, tiers_payant, source_label, source_date, admin_note)
select i.id, 'pharmacie', v.name, v.area, r.id, v.address, '{}'::text[], true, 'a_verifier', null,
       'Documentation ANAM (pharmacies privées conventionnées RAMED) citée par le porteur du projet ; liste officielle non consultée',
       date '2026-11-12', 'Vérifier auprès de l''ANAM que la convention est toujours active avant toute validation.'
from public.insurers i
cross join (values
  ('Pharmacie Dourfane', 'Bamako', 'Boulevard de l''Indépendance', 'District de Bamako'),
  ('Pharmacie privée de l''Hôpital du Mali', 'Bamako', null, 'District de Bamako'),
  ('Pharmacie Cheick Zayed', 'Bamako', null, 'District de Bamako'),
  ('Pharmacie Massaba Keita', 'Sévaré', null, 'Mopti')
) as v(name, area, address, region)
join public.regions r on r.name = v.region
where i.slug = 'anam-ramed'
  and not exists (select 1 from public.insurer_providers x where x.insurer_id = i.id and public.normalize_text(x.name) = public.normalize_text(v.name));

-- 5. Rapprochement avec l'annuaire : correspondance exacte et unique ---------
create or replace function public.insurer_link_directory(p_insurer uuid default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $f$
declare n_list int := 0; n_fac int := 0;
begin
  if auth.uid() is not null and not public.is_admin() then raise exception 'PP403: accès refusé'; end if;
  -- Pharmacies de l'annuaire national (non réclamées)
  with cand as (
    select ip.id prov, (array_agg(l.id))[1] target, count(*) c
      from public.insurer_providers ip
      join public.pharmacy_listings l on public.pharmacy_name_key(l.name) = public.pharmacy_name_key(ip.name)
       and l.region_id = ip.region_id and l.is_published and not l.is_demo
       and (ip.commune_id is null or l.commune_id is null or l.commune_id = ip.commune_id)
     where ip.category = 'pharmacie' and not ip.link_manual and ip.listing_id is null and ip.pharmacy_id is null
       and (p_insurer is null or ip.insurer_id = p_insurer) and char_length(public.pharmacy_name_key(ip.name)) >= 4
     group by ip.id)
  update public.insurer_providers ip set listing_id = cand.target, match_method = 'exact_unique'
    from cand where cand.prov = ip.id and cand.c = 1;
  get diagnostics n_list = row_count;

  -- Établissements de santé (cliniques, hôpitaux, laboratoires, imagerie, dentaire)
  with cand as (
    select ip.id prov, (array_agg(f.id))[1] target, count(*) c
      from public.insurer_providers ip
      join public.facility_listings f on public.geo_key(f.name) = public.geo_key(ip.name)
       and f.region_id = ip.region_id and f.is_published
       and case ip.category
             when 'clinique' then f.kind::text in ('clinique', 'cabinet')
             when 'hopital' then f.kind::text in ('hopital', 'chu', 'csref')
             when 'laboratoire' then f.kind::text = 'laboratoire'
             when 'imagerie' then f.kind::text = 'imagerie'
             when 'dentaire' then f.kind::text = 'cabinet_dentaire'
             else false end
     where ip.category <> 'pharmacie' and not ip.link_manual and ip.facility_id is null
       and (p_insurer is null or ip.insurer_id = p_insurer) and char_length(public.geo_key(ip.name)) >= 5
     group by ip.id)
  update public.insurer_providers ip set facility_id = cand.target, match_method = 'exact_unique'
    from cand where cand.prov = ip.id and cand.c = 1;
  get diagnostics n_fac = row_count;
  return jsonb_build_object('pharmacies', n_list, 'etablissements', n_fac);
end $f$;
revoke all on function public.insurer_link_directory(uuid) from public, anon, authenticated;

select public.insurer_link_directory(null);

-- 6. Lecture publique ----------------------------------------------------------
create or replace function public.insurance_overview()
returns table (id uuid, name text, slug text, kind text, org_type text, status text, health_offer text, website text,
               network_date date, total bigint, confirmed bigint, to_verify bigint, pharmacies bigint, regions bigint)
language sql stable security definer set search_path to 'public' as $f$
  select i.id, i.name, i.slug, i.kind, i.org_type, i.status, i.health_offer, i.website, i.network_date,
         count(p.id) filter (where s.st not in ('expiree', 'suspendue')),
         count(p.id) filter (where s.st in ('tiers_payant_confirme', 'remboursement')),
         count(p.id) filter (where s.st = 'a_verifier'),
         count(p.id) filter (where p.category = 'pharmacie' and s.st not in ('expiree', 'suspendue')),
         count(distinct p.region_id) filter (where s.st not in ('expiree', 'suspendue'))
  from public.insurers i
  left join public.insurer_providers p on p.insurer_id = i.id and p.is_published
  left join lateral (select public.convention_public_status(p.convention_status, p.ends_on) st) s on true
  where i.is_published
  group by i.id
  order by (i.health_offer = 'confirmee') desc, count(p.id) desc, i.name
$f$;
grant execute on function public.insurance_overview() to anon, authenticated;

create or replace function public.insurer_network(
  p_insurer uuid, p_query text default null, p_category text default null, p_region uuid default null,
  p_commune uuid default null, p_confirmed_only boolean default false, p_limit integer default 30, p_offset integer default 0)
returns table (id uuid, category text, name text, area text, region_name text, commune_name text, address text, phones text[],
               pharmacy_id uuid, listing_id uuid, facility_id uuid, public_status text, tiers_payant boolean,
               services_covered text, conditions text, documents_required text, verified_at date, source_label text, source_date date,
               total_count bigint)
language sql stable security definer set search_path to 'public', 'extensions' as $f$
  with q as (select nullif(public.normalize_text(coalesce(p_query, '')), '') t)
  select p.id, p.category, p.name, p.area, r.name, c.name, p.address, p.phones, p.pharmacy_id, p.listing_id, p.facility_id,
         s.st, p.tiers_payant, p.services_covered, p.conditions, p.documents_required, p.verified_at, p.source_label, p.source_date,
         count(*) over ()
  from public.insurer_providers p
  join public.insurers i on i.id = p.insurer_id and i.is_published
  left join public.regions r on r.id = p.region_id
  left join public.communes c on c.id = p.commune_id
  cross join lateral (select public.convention_public_status(p.convention_status, p.ends_on) st) s
  cross join q
  where p.insurer_id = p_insurer and p.is_published and s.st not in ('expiree', 'suspendue')
    and (p_category is null or p.category = p_category)
    and (p_region is null or p.region_id = p_region)
    and (p_commune is null or p.commune_id = p_commune)
    and (not coalesce(p_confirmed_only, false) or s.st = 'tiers_payant_confirme')
    and (q.t is null or public.normalize_text(concat_ws(' ', p.name, p.area, p.address)) like '%' || q.t || '%')
  order by (s.st = 'tiers_payant_confirme') desc, (s.st = 'remboursement') desc, r.name nulls last, p.name
  limit least(greatest(coalesce(p_limit, 30), 1), 100) offset greatest(coalesce(p_offset, 0), 0)
$f$;
grant execute on function public.insurer_network(uuid, text, text, uuid, uuid, boolean, integer, integer) to anon, authenticated;

-- Assurances d'un établissement (rubrique « Assurances acceptées » des fiches).
-- p_kind : pharmacy (pharmacie inscrite), listing (annuaire des pharmacies), facility (annuaire des établissements).
create or replace function public.establishment_insurance(p_kind text, p_id uuid)
returns table (insurer_name text, insurer_slug text, insurer_kind text, public_status text, tiers_payant boolean,
               services_covered text, conditions text, documents_required text, verified_at date, source_label text, source_date date)
language sql stable security definer set search_path to 'public' as $f$
  select * from (
  select i.name, i.slug, i.org_type as kind, s.st, p.tiers_payant, p.services_covered, p.conditions,
         coalesce(p.documents_required, i.documents_required), p.verified_at, p.source_label, p.source_date
  from public.insurer_providers p
  join public.insurers i on i.id = p.insurer_id and i.is_published
  cross join lateral (select public.convention_public_status(p.convention_status, p.ends_on) st) s
  where p.is_published and s.st not in ('expiree', 'suspendue')
    and case p_kind when 'pharmacy' then p.pharmacy_id = p_id when 'listing' then p.listing_id = p_id
                    when 'facility' then p.facility_id = p_id else false end
  union all
  -- Convention AMO déclarée par une pharmacie inscrite (vérifiée ou non par l'administration).
  select i.name, i.slug, i.org_type,
         case when a.status = 'verified' and a.verified_at is not null then 'tiers_payant_confirme' else 'a_verifier' end,
         true, null, null, i.documents_required, a.verified_at::date,
         case when a.status = 'verified' then 'Convention AMO vérifiée par l''administration SantéProxi' else 'Déclaration de la pharmacie, non vérifiée' end,
         coalesce(a.verified_at, a.declared_at)::date
  from public.pharmacy_amo a
  join public.insurers i on i.slug = 'amo-canam' and i.is_published
  where p_kind = 'pharmacy' and a.pharmacy_id = p_id and a.status in ('declared', 'verified')
  ) x(insurer_name, insurer_slug, insurer_kind, public_status, tiers_payant, services_covered, conditions, documents_required, verified_at, source_label, source_date)
  order by (x.public_status = 'tiers_payant_confirme') desc, x.insurer_name
$f$;
grant execute on function public.establishment_insurance(text, uuid) to anon, authenticated;

-- Badges pour les listes (une ligne par établissement et par organisme).
create or replace function public.insurance_badges(p_kind text, p_ids uuid[])
returns table (entity_id uuid, insurer_name text, insurer_slug text, public_status text)
language sql stable security definer set search_path to 'public' as $f$
  select distinct on (k.e, i.slug) k.e, i.name, i.slug, s.st
  from public.insurer_providers p
  join public.insurers i on i.id = p.insurer_id and i.is_published
  cross join lateral (select case p_kind when 'pharmacy' then p.pharmacy_id when 'listing' then p.listing_id
                                         when 'facility' then p.facility_id end as e) k
  cross join lateral (select public.convention_public_status(p.convention_status, p.ends_on) st) s
  where p.is_published and k.e = any(p_ids[1:500]) and s.st not in ('expiree', 'suspendue')
  order by k.e, i.slug, (s.st = 'tiers_payant_confirme') desc
$f$;
grant execute on function public.insurance_badges(text, uuid[]) to anon, authenticated;

-- 7. Administration ------------------------------------------------------------
-- Mise à jour d'une ou plusieurs conventions. Le statut confirmé exige une
-- source et une date de vérification (contrôlé aussi par contrainte).
create or replace function public.admin_update_conventions(p_ids uuid[], p jsonb)
returns integer language plpgsql security definer set search_path to 'public' as $f$
declare uid uuid := public.require_admin(); n int;
  st text := nullif(p ->> 'convention_status', '');
begin
  if coalesce(array_length(p_ids, 1), 0) = 0 then return 0; end if;
  if array_length(p_ids, 1) > 500 then raise exception 'PP422: 500 conventions maximum par opération'; end if;
  if st is not null and st not in ('tiers_payant_confirme', 'remboursement', 'a_verifier', 'en_attente', 'non_confirmee', 'expiree', 'suspendue') then
    raise exception 'PP422: statut inconnu';
  end if;
  update public.insurer_providers ip set
    convention_status = coalesce(st, ip.convention_status),
    tiers_payant = case when p ? 'tiers_payant' then (p ->> 'tiers_payant')::boolean
                        when st = 'tiers_payant_confirme' then true else ip.tiers_payant end,
    services_covered = case when p ? 'services_covered' then nullif(btrim(p ->> 'services_covered'), '') else ip.services_covered end,
    conditions = case when p ? 'conditions' then nullif(btrim(p ->> 'conditions'), '') else ip.conditions end,
    documents_required = case when p ? 'documents_required' then nullif(btrim(p ->> 'documents_required'), '') else ip.documents_required end,
    starts_on = case when p ? 'starts_on' then nullif(p ->> 'starts_on', '')::date else ip.starts_on end,
    ends_on = case when p ? 'ends_on' then nullif(p ->> 'ends_on', '')::date else ip.ends_on end,
    source_label = case when p ? 'source_label' then nullif(btrim(p ->> 'source_label'), '') else ip.source_label end,
    source_url = case when p ? 'source_url' then nullif(btrim(p ->> 'source_url'), '') else ip.source_url end,
    verified_at = case when p ? 'verified_at' then nullif(p ->> 'verified_at', '')::date else ip.verified_at end,
    admin_note = case when p ? 'admin_note' then nullif(btrim(p ->> 'admin_note'), '') else ip.admin_note end,
    is_published = case when p ? 'is_published' then (p ->> 'is_published')::boolean else ip.is_published end,
    validated_by = case when st in ('tiers_payant_confirme', 'remboursement') then uid else ip.validated_by end,
    validated_at = case when st in ('tiers_payant_confirme', 'remboursement') then now() else ip.validated_at end
  where ip.id = any(p_ids);
  get diagnostics n = row_count;
  return n;
exception when check_violation then
  raise exception 'PP422: pour « tiers payant confirmé » ou « remboursement », indiquez la source et la date de vérification (et le tiers payant pour le premier)';
end $f$;
revoke all on function public.admin_update_conventions(uuid[], jsonb) from public, anon;
grant execute on function public.admin_update_conventions(uuid[], jsonb) to authenticated;

-- Rattachement manuel d'une convention à une fiche de l'annuaire.
create or replace function public.admin_link_convention(p_id uuid, p_kind text, p_target uuid)
returns void language plpgsql security definer set search_path to 'public' as $f$
begin
  perform public.require_admin();
  if p_kind not in ('pharmacy', 'listing', 'facility', 'none') then raise exception 'PP422: type de fiche inconnu'; end if;
  update public.insurer_providers set
    pharmacy_id = case when p_kind = 'pharmacy' then p_target else null end,
    listing_id = case when p_kind = 'listing' then p_target else null end,
    facility_id = case when p_kind = 'facility' then p_target else null end,
    link_manual = true, match_method = case when p_kind = 'none' then null else 'manuel' end
  where id = p_id;
  if not found then raise exception 'PP404: convention introuvable'; end if;
end $f$;
revoke all on function public.admin_link_convention(uuid, text, uuid) from public, anon;
grant execute on function public.admin_link_convention(uuid, text, uuid) to authenticated;

-- Enregistrement d'un organisme : complète admin_save_insurer avec les nouveaux champs.
create or replace function public.admin_save_insurer_details(p_id uuid, p jsonb)
returns void language plpgsql security definer set search_path to 'public' as $f$
begin
  perform public.require_admin();
  update public.insurers set
    description = nullif(btrim(p ->> 'description'), ''), email = nullif(btrim(p ->> 'email'), ''),
    address = nullif(btrim(p ->> 'address'), ''), logo_url = nullif(btrim(p ->> 'logo_url'), ''),
    status = coalesce(nullif(p ->> 'status', ''), status), org_type = coalesce(nullif(p ->> 'org_type', ''), org_type), health_offer = coalesce(nullif(p ->> 'health_offer', ''), health_offer),
    verified_at = nullif(p ->> 'verified_at', '')::date,
    documents_required = nullif(btrim(p ->> 'documents_required'), ''),
    tiers_payant_terms = nullif(btrim(p ->> 'tiers_payant_terms'), ''),
    reimbursement_terms = nullif(btrim(p ->> 'reimbursement_terms'), ''),
    updated_at = now()
  where id = p_id;
  if not found then raise exception 'PP404: organisme introuvable'; end if;
  perform public.log_audit('insurer.update', 'insurer', p_id::text, p);
end $f$;
revoke all on function public.admin_save_insurer_details(uuid, jsonb) from public, anon;
grant execute on function public.admin_save_insurer_details(uuid, jsonb) to authenticated;
