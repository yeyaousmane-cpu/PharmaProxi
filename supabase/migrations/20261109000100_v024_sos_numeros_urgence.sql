-- =============================================================================
-- SantéProxi 0.24.0 — SOS Santé : annuaire des numéros d'urgence administrable
-- Migration additive : crée une table, ne modifie ni ne supprime aucune donnée.
-- Retour arrière : drop table if exists public.emergency_contacts;
-- =============================================================================

create table if not exists public.emergency_contacts (
  id uuid primary key default gen_random_uuid(),
  country text not null default 'ML' check (country ~ '^[A-Z]{2}$'),
  region text check (char_length(coalesce(region, '')) <= 80),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  mission text check (char_length(coalesce(mission, '')) <= 300),
  phone text not null check (phone ~ '^[0-9+ ]{3,20}$'),
  phone_alt text check (phone_alt is null or phone_alt ~ '^[0-9+ ]{3,20}$'),
  tier text not null default 'principal' check (tier in ('principal', 'complementaire')),
  icon text not null default 'autre' check (icon in ('sante', 'protection_civile', 'police', 'gendarmerie', 'crise', 'garde', 'ambulance', 'autre')),
  status text not null default 'a_verifier' check (status in ('a_verifier', 'verifie', 'a_actualiser')),
  source_url text check (source_url is null or source_url ~ '^https://'),
  source_note text check (char_length(coalesce(source_note, '')) <= 200),
  verified_at date,
  active boolean not null default true,
  sort int not null default 100,
  updated_at timestamptz not null default now(),
  unique (country, phone)
);
create index if not exists emergency_contacts_country_idx on public.emergency_contacts (country, active, tier, sort);

alter table public.emergency_contacts enable row level security;
drop policy if exists "pp_emergency_contacts_read" on public.emergency_contacts;
create policy "pp_emergency_contacts_read" on public.emergency_contacts for select to anon, authenticated using (active or public.is_admin());
drop policy if exists "pp_emergency_contacts_admin" on public.emergency_contacts;
create policy "pp_emergency_contacts_admin" on public.emergency_contacts for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.emergency_contacts from anon;
grant select on public.emergency_contacts to anon;
grant select, insert, update, delete on public.emergency_contacts to authenticated;

create or replace function public.touch_emergency_contacts()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists touch_emergency_contacts on public.emergency_contacts;
create trigger touch_emergency_contacts before update on public.emergency_contacts
  for each row execute function public.touch_emergency_contacts();

-- Numéros communiqués par le porteur du projet, avec les sources officielles indiquées.
-- Statut « à vérifier » : la vérification auprès des autorités reste à faire (l'administrateur la confirme dans /admin/urgences).
-- Les anciens numéros 15, 17 et 18 ne sont volontairement pas ajoutés.
insert into public.emergency_contacts (country, name, mission, phone, phone_alt, tier, icon, status, source_url, sort) values
  ('ML', 'Numéro vert Santé', 'Information et orientation sanitaire du ministère de la Santé.', '36061', null, 'principal', 'sante', 'a_verifier', 'https://sante.gov.ml/index.php?Itemid=111&id=187&option=com_content&view=article', 10),
  ('ML', 'Protection civile', 'Secours aux personnes, accidents, incendies, évacuations.', '122', null, 'principal', 'protection_civile', 'a_verifier', 'https://dgpc.gouv.ml/', 20),
  ('ML', 'Police nationale', 'Sécurité des personnes, agressions, troubles à l''ordre public.', '101', null, 'principal', 'police', 'a_verifier', 'https://police.gouv.ml/services', 30),
  ('ML', 'Gendarmerie nationale', 'Sécurité des personnes et des biens, secours.', '111', null, 'principal', 'gendarmerie', 'a_verifier', null, 40),
  ('ML', 'Gestion des crises', 'Signalement des situations de crise et de catastrophe.', '144', null, 'principal', 'crise', 'a_verifier', null, 50),
  ('ML', 'Garde nationale', 'Appui sécuritaire et intervention.', '145', null, 'principal', 'garde', 'a_verifier', null, 60),
  ('ML', 'Protection civile', 'Lignes complémentaires de la Protection civile.', '80001201', '20228081', 'complementaire', 'protection_civile', 'a_verifier', 'https://dgpc.gouv.ml/', 110),
  ('ML', 'Police secours', 'Lignes complémentaires de Police secours.', '80001115', '20239511', 'complementaire', 'police', 'a_verifier', 'https://police.gouv.ml/services', 120),
  ('ML', 'Police nationale', 'Ligne complémentaire de la Police nationale.', '80001125', null, 'complementaire', 'police', 'a_verifier', 'https://police.gouv.ml/services', 130),
  ('ML', 'Gendarmerie', 'Ligne complémentaire de la Gendarmerie.', '80001114', null, 'complementaire', 'gendarmerie', 'a_verifier', null, 140)
on conflict (country, phone) do nothing;
