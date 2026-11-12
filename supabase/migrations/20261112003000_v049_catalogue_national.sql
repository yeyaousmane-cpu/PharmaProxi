-- v049 — Catalogue national des médicaments : structure
--
-- On étend le catalogue existant (une ligne de medicine_catalog = une
-- présentation : DCI + dosage + forme) au lieu de créer une table concurrente.
--   * therapeutic_families : familles thérapeutiques (LNME Mali 2024) ;
--   * colonnes réglementaires et de priorité sur medicine_catalog ;
--   * medicine_brands : marques commerciales reliées à une présentation, avec
--     leur statut de vérification (une marque signalée n'est pas une marque
--     dont l'AMM au Mali est vérifiée) ;
--   * le texte de recherche inclut désormais les marques : « Doliprane » trouve
--     le paracétamol 500 mg dans toutes les recherches existantes.
-- Aucune donnée existante n'est supprimée. RLS sur chaque nouvelle table.

-- 1. Familles thérapeutiques ------------------------------------------------
create table if not exists public.therapeutic_families (
  slug        text primary key check (slug ~ '^[a-z_]{2,40}$'),
  label       text not null check (char_length(label) between 2 and 120),
  parent_slug text references public.therapeutic_families(slug),
  sort_order  int not null default 100,
  description text check (char_length(coalesce(description, '')) <= 300)
);
alter table public.therapeutic_families enable row level security;
do $p$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='therapeutic_families' and policyname='lecture publique') then
    create policy "lecture publique" on public.therapeutic_families for select using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='therapeutic_families' and policyname='admin ecrit') then
    create policy "admin ecrit" on public.therapeutic_families for all using (public.is_admin()) with check (public.is_admin());
  end if;
end $p$;

insert into public.therapeutic_families (slug, label, parent_slug, sort_order) values
  ('anesthesiques', 'Anesthésiques', null, 10),
  ('analgesiques', 'Analgésiques, antipyrétiques et anti-inflammatoires', null, 20),
  ('antiallergiques', 'Antiallergiques', null, 30),
  ('antidotes', 'Antidotes et traitement des intoxications', null, 40),
  ('antiepileptiques', 'Antiépileptiques et anticonvulsivants', null, 50),
  ('anti_infectieux', 'Anti-infectieux', null, 60),
  ('antimigraineux', 'Antimigraineux', null, 70),
  ('antineoplasiques', 'Antinéoplasiques et immunosuppresseurs', null, 80),
  ('antiparkinsoniens', 'Antiparkinsoniens', null, 90),
  ('hematologie', 'Médicaments d''hématologie et dérivés du sang', null, 100),
  ('cardiovasculaires', 'Médicaments cardiovasculaires', null, 110),
  ('dermatologiques', 'Médicaments dermatologiques', null, 120),
  ('diagnostic', 'Produits à usage diagnostique', null, 130),
  ('antiseptiques', 'Antiseptiques et désinfectants', null, 140),
  ('diuretiques', 'Diurétiques', null, 150),
  ('digestifs', 'Médicaments digestifs', null, 160),
  ('hormones_contraceptifs', 'Contraceptifs et médicaments hormonaux', null, 170),
  ('antidiabetiques', 'Antidiabétiques et insulines', null, 180),
  ('vaccins', 'Vaccins et préparations immunologiques', null, 190),
  ('myorelaxants', 'Myorelaxants', null, 200),
  ('ophtalmiques', 'Médicaments ophtalmiques', null, 210),
  ('ocytociques', 'Ocytociques et anti-ocytociques', null, 220),
  ('dialyse', 'Solutions de dialyse rénale', null, 230),
  ('psychiatrie', 'Neuroleptiques, antidépresseurs et anxiolytiques', null, 240),
  ('respiratoires', 'Médicaments respiratoires', null, 250),
  ('rehydratation', 'Solutions de réhydratation et électrolytes', null, 260),
  ('vitamines', 'Vitamines et sels minéraux', null, 270),
  ('traditionnels', 'Médicaments traditionnels améliorés', null, 280),
  ('neonatologie', 'Médicaments de néonatologie', null, 290),
  ('orl', 'Médicaments ORL', null, 300),
  ('nutrition', 'Produits nutritionnels thérapeutiques', null, 310),
  ('premiers_soins', 'Premiers soins et petit matériel', null, 320)
on conflict (slug) do update set label = excluded.label, sort_order = excluded.sort_order;

insert into public.therapeutic_families (slug, label, parent_slug, sort_order) values
  ('antibiotiques', 'Antibiotiques', 'anti_infectieux', 61),
  ('antituberculeux', 'Antituberculeux', 'anti_infectieux', 62),
  ('antipaludiques', 'Antipaludiques', 'anti_infectieux', 63),
  ('antifongiques', 'Antifongiques', 'anti_infectieux', 64),
  ('antiviraux', 'Antiviraux et antirétroviraux', 'anti_infectieux', 65),
  ('antiparasitaires', 'Antiparasitaires', 'anti_infectieux', 66)
on conflict (slug) do update set label = excluded.label, parent_slug = excluded.parent_slug, sort_order = excluded.sort_order;

-- 2. Colonnes du catalogue ---------------------------------------------------
alter table public.medicine_catalog
  add column if not exists therapeutic_family text references public.therapeutic_families(slug),
  add column if not exists therapeutic_families text[] not null default '{}',
  add column if not exists therapeutic_subfamily text,
  add column if not exists regulatory_class text not null default 'prescription',
  add column if not exists priority_tier text,
  add column if not exists cold_chain boolean not null default false,
  add column if not exists lnme_2024 boolean not null default false,
  add column if not exists lnme_reference text,
  add column if not exists amm_status text not null default 'a_verifier',
  add column if not exists amm_reference text,
  add column if not exists target_public text,
  add column if not exists catalog_source text,
  add column if not exists catalog_note text,
  add column if not exists brand_aliases text not null default '';

do $c$ begin
  if not exists (select 1 from pg_constraint where conrelid='public.medicine_catalog'::regclass and conname='medicine_catalog_regulatory_class_check') then
    alter table public.medicine_catalog add constraint medicine_catalog_regulatory_class_check
      check (regulatory_class in ('libre','prescription','controle','hospitalier','programme','dispositif'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.medicine_catalog'::regclass and conname='medicine_catalog_priority_tier_check') then
    alter table public.medicine_catalog add constraint medicine_catalog_priority_tier_check
      check (priority_tier is null or priority_tier in ('premiere_necessite','complementaire'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.medicine_catalog'::regclass and conname='medicine_catalog_amm_status_check') then
    alter table public.medicine_catalog add constraint medicine_catalog_amm_status_check
      check (amm_status in ('a_verifier','verifiee','absente'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.medicine_catalog'::regclass and conname='medicine_catalog_v049_lengths') then
    alter table public.medicine_catalog add constraint medicine_catalog_v049_lengths check (
      char_length(coalesce(therapeutic_subfamily,'')) <= 120 and char_length(coalesce(lnme_reference,'')) <= 300
      and char_length(coalesce(amm_reference,'')) <= 80 and char_length(coalesce(target_public,'')) <= 80
      and char_length(coalesce(catalog_source,'')) <= 200 and char_length(coalesce(catalog_note,'')) <= 300
      and char_length(brand_aliases) <= 2000);
  end if;
end $c$;

comment on column public.medicine_catalog.regulatory_class is
  'Classement de dispensation SantéProxi (prudent, à valider par un pharmacien) : libre (sans ordonnance, conseil pharmaceutique), prescription, controle (stupéfiants et psychotropes), hospitalier, programme (programmes nationaux : ARV, antituberculeux, vaccins…), dispositif.';
comment on column public.medicine_catalog.priority_tier is
  'premiere_necessite : sélection SantéProxi des médicaments courants prioritaires en officine. Ce n''est pas une obligation réglementaire.';
comment on column public.medicine_catalog.amm_status is
  'Statut de l''autorisation de mise sur le marché au Mali pour cette présentation : a_verifier par défaut.';

-- Les fiches existantes gardent leur règle de prescription actuelle.
update public.medicine_catalog
   set regulatory_class = case when requires_prescription then 'prescription' else 'libre' end
 where regulatory_class = 'prescription' and not requires_prescription;

-- La prescription découle du classement : une seule source de vérité.
create or replace function public.catalog_sync_regulation()
returns trigger language plpgsql set search_path to 'public' as $f$
begin
  if tg_op = 'INSERT' or new.regulatory_class is distinct from old.regulatory_class then
    new.requires_prescription := new.regulatory_class not in ('libre', 'dispositif');
  end if;
  return new;
end $f$;

drop trigger if exists medicine_catalog_regulation on public.medicine_catalog;
create trigger medicine_catalog_regulation before insert or update of regulatory_class
  on public.medicine_catalog for each row execute function public.catalog_sync_regulation();

-- 3. Texte de recherche : marques incluses -----------------------------------
drop index if exists public.medicine_catalog_search_trgm;
alter table public.medicine_catalog drop column if exists search_text;
alter table public.medicine_catalog add column search_text text generated always as (
  public.normalize_text(coalesce(brand_name, '') || ' ' || coalesce(generic_name, '') || ' '
    || coalesce(active_ingredient, '') || ' ' || coalesce(brand_aliases, ''))
) stored;
create index medicine_catalog_search_trgm on public.medicine_catalog using gin (search_text extensions.gin_trgm_ops);
create index if not exists medicine_catalog_family_idx on public.medicine_catalog (therapeutic_family);

-- 4. Marques commerciales ------------------------------------------------------
create table if not exists public.medicine_brands (
  id            uuid primary key default gen_random_uuid(),
  catalog_id    uuid not null references public.medicine_catalog(id) on delete cascade,
  brand_name    text not null check (char_length(btrim(brand_name)) between 2 and 120),
  holder        text check (char_length(coalesce(holder, '')) <= 160),
  manufacturer  text check (char_length(coalesce(manufacturer, '')) <= 160),
  amm_reference text check (char_length(coalesce(amm_reference, '')) <= 80),
  status        text not null default 'signalee'
                check (status in ('signalee', 'nomenclature_2024', 'verifiee')),
  source        text not null check (char_length(source) between 3 and 300),
  created_at    timestamptz not null default now()
);
create unique index if not exists medicine_brands_unique
  on public.medicine_brands (catalog_id, public.normalize_text(brand_name));
alter table public.medicine_brands enable row level security;
do $p$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='medicine_brands' and policyname='lecture publique') then
    create policy "lecture publique" on public.medicine_brands for select using (
      exists (select 1 from public.medicine_catalog c where c.id = catalog_id and c.review_status <> 'rejected'));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='medicine_brands' and policyname='admin ecrit') then
    create policy "admin ecrit" on public.medicine_brands for all using (public.is_admin()) with check (public.is_admin());
  end if;
end $p$;

comment on table public.medicine_brands is
  'Marques commerciales d''une présentation. status = signalee : marque citée comme exemple, AMM au Mali non vérifiée ; nomenclature_2024 : figure dans la nomenclature nationale 2024 de la DPM ; verifiee : vérifiée par un administrateur.';

create or replace function public.medicine_brands_refresh()
returns trigger language plpgsql security definer set search_path to 'public' as $f$
declare cid uuid := coalesce(new.catalog_id, old.catalog_id);
begin
  update public.medicine_catalog c
     set brand_aliases = left(coalesce((select string_agg(distinct b.brand_name, ' ')
                                           from public.medicine_brands b where b.catalog_id = cid), ''), 2000)
   where c.id = cid;
  if tg_op = 'UPDATE' and old.catalog_id is distinct from new.catalog_id then
    update public.medicine_catalog c
       set brand_aliases = left(coalesce((select string_agg(distinct b.brand_name, ' ')
                                             from public.medicine_brands b where b.catalog_id = old.catalog_id), ''), 2000)
     where c.id = old.catalog_id;
  end if;
  return null;
end $f$;

drop trigger if exists medicine_brands_aliases on public.medicine_brands;
create trigger medicine_brands_aliases after insert or update or delete on public.medicine_brands
  for each row execute function public.medicine_brands_refresh();

-- 5. Table d'import (traçabilité et retour arrière) ---------------------------
create table if not exists public.import_catalogue_2026 (
  id            bigint generated by default as identity primary key,
  dci           text not null,
  forme         text,
  dosage        text,
  family        text,
  families      text[] not null default '{}',
  subfamily     text,
  lnme_ref      text,
  regulation    text not null,
  tier          text,
  cold_chain    boolean not null default false,
  source        text not null,
  note          text,
  catalog_id    uuid,
  action        text,
  imported_at   timestamptz not null default now()
);
alter table public.import_catalogue_2026 enable row level security;
do $p$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='import_catalogue_2026' and policyname='admin') then
    create policy "admin" on public.import_catalogue_2026 for all using (public.is_admin()) with check (public.is_admin());
  end if;
end $p$;
