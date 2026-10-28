-- ============================================================================
-- PharmaProxi — Migration 0001 : fondations
-- Extensions, types énumérés, paramètres de plateforme, géographie, profils,
-- rôles et journal d'audit.
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.app_role as enum ('customer', 'pharmacist', 'courier', 'admin');

create type public.pharmacy_status as enum ('pending', 'verified', 'rejected', 'suspended');

create type public.order_status as enum (
  'pending_confirmation',  -- En attente de confirmation
  'confirmed',             -- Confirmée par la pharmacie (stock réservé)
  'preparing',             -- En préparation
  'ready_for_pickup',      -- Prête au retrait
  'awaiting_courier',      -- En attente d'affectation d'un livreur
  'courier_assigned',      -- Livreur affecté
  'in_delivery',           -- En cours de livraison
  'delivered',             -- Livrée
  'completed',             -- Retirée en pharmacie
  'cancelled',             -- Annulée
  'rejected',              -- Refusée par la pharmacie
  'expired',               -- Expirée (pas de réponse / pas de retrait)
  'delivery_failed'        -- Échec de livraison
);

create type public.fulfillment_mode as enum ('pickup', 'delivery');
create type public.payment_method as enum ('pay_at_pharmacy', 'cash_on_delivery');
create type public.payment_status as enum ('unpaid', 'paid', 'refund_pending', 'refunded');
create type public.reservation_status as enum ('active', 'consumed', 'released', 'expired');
create type public.courier_status as enum ('pending', 'verified', 'suspended', 'rejected');
create type public.delivery_status as enum ('pending', 'awaiting_courier', 'assigned', 'picked_up', 'delivered', 'failed', 'cancelled');
create type public.movement_kind as enum ('adjustment', 'import', 'reservation', 'release', 'sale', 'return', 'expiry', 'correction');
create type public.report_status as enum ('open', 'in_review', 'resolved', 'dismissed');

-- ---------------------------------------------------------------------------
-- Normalisation de texte (recherche insensible à la casse, aux accents et aux espaces)
-- ---------------------------------------------------------------------------
create or replace function public.normalize_text(t text)
returns text
language sql
immutable
parallel safe
set search_path = public, extensions
as $$
  select regexp_replace(lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(t, ''))), '\s+', ' ', 'g')
$$;

-- ---------------------------------------------------------------------------
-- Paramètres de plateforme (clé / valeur typée JSON)
-- ---------------------------------------------------------------------------
create table public.platform_settings (
  key text primary key,
  value jsonb not null,
  description text,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

insert into public.platform_settings (key, value, description) values
  ('delivery_enabled', 'false', 'Livraison de produits activée. DÉSACTIVÉE par défaut tant que la vérification réglementaire n''est pas faite.'),
  ('orders_enabled', 'true', 'Demandes de réservation / commandes activées.'),
  ('default_delivery_fee_xof', '1000', 'Frais de livraison par défaut (FCFA).'),
  ('confirmation_ttl_minutes', '60', 'Délai accordé à la pharmacie pour répondre à une demande.'),
  ('reservation_ttl_minutes', '240', 'Durée de validité d''une réservation confirmée pour un retrait.'),
  ('stock_fresh_hours', '24', 'En dessous de ce délai, un stock déclaré est considéré comme récent.'),
  ('stock_stale_hours', '72', 'Au-delà de ce délai, l''information de stock est considérée comme ancienne.'),
  ('max_items_per_order', '10', 'Nombre maximum de lignes par commande.'),
  ('max_quantity_per_item', '20', 'Quantité maximum par ligne.');

create or replace function public.setting_int(p_key text, p_default int)
returns int language sql stable security definer set search_path = public as $$
  select coalesce((select (value #>> '{}')::int from public.platform_settings where key = p_key), p_default)
$$;

create or replace function public.setting_bool(p_key text, p_default boolean)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select (value #>> '{}')::boolean from public.platform_settings where key = p_key), p_default)
$$;

-- ---------------------------------------------------------------------------
-- Géographie (extensible à d'autres pays via country_code)
-- ---------------------------------------------------------------------------
create table public.regions (
  id uuid primary key default gen_random_uuid(),
  country_code char(2) not null default 'ML',
  name text not null,
  code text,
  is_district boolean not null default false,
  source text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  unique (country_code, name)
);

create table public.circles (
  id uuid primary key default gen_random_uuid(),
  region_id uuid not null references public.regions(id) on delete restrict,
  name text not null,
  source text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  unique (region_id, name)
);

create table public.communes (
  id uuid primary key default gen_random_uuid(),
  region_id uuid not null references public.regions(id) on delete restrict,
  circle_id uuid references public.circles(id) on delete restrict,
  name text not null,
  source text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  unique nulls not distinct (region_id, circle_id, name)
);
create index communes_region_idx on public.communes(region_id);

create table public.localities (
  id uuid primary key default gen_random_uuid(),
  commune_id uuid not null references public.communes(id) on delete restrict,
  name text not null,
  kind text not null default 'quartier' check (kind in ('quartier', 'village', 'fraction', 'localite')),
  source text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  unique (commune_id, name)
);
create index localities_commune_idx on public.localities(commune_id);

-- ---------------------------------------------------------------------------
-- Profils et rôles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text check (char_length(full_name) <= 120),
  phone text check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$'),
  preferred_region_id uuid references public.regions(id) on delete set null,
  preferred_commune_id uuid references public.communes(id) on delete set null,
  notify_in_app boolean not null default true,
  is_demo boolean not null default false,
  deletion_requested_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.app_role not null,
  granted_by uuid references public.profiles(id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);

-- Rôles : fonctions d'aide (SECURITY DEFINER pour éviter la récursion RLS)
create or replace function public.has_role(p_role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = auth.uid() and role = p_role)
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role('admin')
$$;

-- Création automatique du profil à l'inscription (rôle client par défaut)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (
    new.id,
    nullif(left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120), ''),
    case when (new.raw_user_meta_data ->> 'phone') ~ '^\+[1-9][0-9]{7,14}$'
         then new.raw_user_meta_data ->> 'phone' end
  )
  on conflict (id) do nothing;
  insert into public.user_roles (user_id, role) values (new.id, 'customer') on conflict do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Journal d'audit (écriture uniquement via fonctions SECURITY DEFINER)
-- ---------------------------------------------------------------------------
create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_created_idx on public.audit_logs(created_at desc);
create index audit_logs_entity_idx on public.audit_logs(entity_type, entity_id);

create or replace function public.log_audit(p_action text, p_entity_type text, p_entity_id text, p_details jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, details)
  values (auth.uid(), p_action, p_entity_type, p_entity_id, coalesce(p_details, '{}'::jsonb));
$$;
revoke execute on function public.log_audit(text, text, text, jsonb) from public, anon, authenticated;

-- Contenus éditoriaux (pages d'information gérées par l'administration)
create table public.content_pages (
  slug text primary key check (slug ~ '^[a-z0-9-]{2,60}$'),
  title text not null,
  body text not null default '',
  published boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);
