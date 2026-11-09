-- ============================================================================
-- SantéProxi — installation complète de la base (toutes les migrations)
-- À coller en une fois dans Supabase › SQL Editor › New query, puis « Run ».
-- À exécuter UNE SEULE FOIS sur un projet vide.
-- Généré à partir de supabase/migrations/ (ne pas modifier à la main).
-- ============================================================================


-- >>> 20261010000100_foundation.sql
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

-- >>> 20261010000200_pharmacies_catalog_inventory.sql
-- ============================================================================
-- PharmaProxi — Migration 0002 : pharmacies, catalogue et stocks
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Pharmacies (données publiques) + données privées séparées
-- ---------------------------------------------------------------------------
create table public.pharmacies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  status public.pharmacy_status not null default 'pending',
  address text not null check (char_length(address) between 3 and 300),
  region_id uuid not null references public.regions(id) on delete restrict,
  circle_id uuid references public.circles(id) on delete restrict,
  commune_id uuid references public.communes(id) on delete restrict,
  locality_id uuid references public.localities(id) on delete restrict,
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  phone text not null check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  whatsapp text check (whatsapp is null or whatsapp ~ '^\+[1-9][0-9]{7,14}$'),
  email text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  -- Horaires : {"mon":[["08:00","20:00"]], "tue": [...], ...} heure du Mali (UTC+0)
  opening_hours jsonb not null default '{}'::jsonb,
  hours_verified boolean not null default false,
  offers_pickup boolean not null default true,
  offers_delivery boolean not null default false,
  verified_at timestamptz,
  is_demo boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((latitude is null) = (longitude is null))
);
create index pharmacies_status_idx on public.pharmacies(status);
create index pharmacies_geo_idx on public.pharmacies(region_id, commune_id, locality_id);
create index pharmacies_name_trgm on public.pharmacies using gin (public.normalize_text(name) extensions.gin_trgm_ops);
create trigger pharmacies_touch before update on public.pharmacies
  for each row execute function public.touch_updated_at();

create table public.pharmacy_private (
  pharmacy_id uuid primary key references public.pharmacies(id) on delete cascade,
  legal_name text,
  license_number text,          -- n° d'autorisation d'ouverture / d'exercice
  pharmacist_in_charge text not null,   -- pharmacien responsable
  manager_phone text check (manager_phone is null or manager_phone ~ '^\+[1-9][0-9]{7,14}$'),
  order_registration text,      -- n° d'inscription à l'Ordre (à vérifier)
  tax_id text,                  -- NIF
  rccm text,
  notes text,
  updated_at timestamptz not null default now()
);

create table public.pharmacy_members (
  pharmacy_id uuid not null references public.pharmacies(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  member_role text not null default 'owner' check (member_role in ('owner', 'staff')),
  created_at timestamptz not null default now(),
  primary key (pharmacy_id, user_id)
);
create index pharmacy_members_user_idx on public.pharmacy_members(user_id);

create table public.pharmacy_documents (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references public.pharmacies(id) on delete cascade,
  doc_type text not null check (doc_type in ('autorisation_ouverture', 'diplome_pharmacien', 'inscription_ordre', 'rccm', 'nif', 'piece_identite', 'autre')),
  storage_path text not null unique,
  file_name text,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.pharmacy_verifications (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references public.pharmacies(id) on delete cascade,
  decision public.pharmacy_status not null,
  reason text,
  checklist jsonb not null default '{}'::jsonb,
  reviewer_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index pharmacy_verifications_pharmacy_idx on public.pharmacy_verifications(pharmacy_id, created_at desc);

-- Fonctions d'appartenance
create or replace function public.is_pharmacy_member(p_pharmacy uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.pharmacy_members where pharmacy_id = p_pharmacy and user_id = auth.uid())
$$;

-- Membre d'une pharmacie non suspendue (peut écrire ; une pharmacie refusée
-- peut corriger ses informations avant une nouvelle soumission)
create or replace function public.can_manage_pharmacy(p_pharmacy uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.pharmacy_members m
    join public.pharmacies p on p.id = m.pharmacy_id
    where m.pharmacy_id = p_pharmacy and m.user_id = auth.uid()
      and p.status in ('pending', 'verified', 'rejected')
  ) and public.has_role('pharmacist')
$$;

-- ---------------------------------------------------------------------------
-- Catalogue partagé
-- ---------------------------------------------------------------------------
create table public.product_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  is_authorized boolean not null default true,      -- catégorie autorisée sur la plateforme
  delivery_allowed boolean not null default false,  -- livraison permise (après vérification réglementaire)
  requires_prescription boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.medicine_catalog (
  id uuid primary key default gen_random_uuid(),
  brand_name text not null check (char_length(brand_name) between 2 and 150),
  generic_name text,
  active_ingredient text,
  dosage text,
  form text,
  packaging text,
  manufacturer text,
  category_id uuid references public.product_categories(id) on delete set null,
  requires_prescription boolean not null default false,
  review_status text not null default 'pending' check (review_status in ('approved', 'pending', 'rejected')),
  merged_into uuid references public.medicine_catalog(id) on delete set null,
  search_text text generated always as (
    public.normalize_text(coalesce(brand_name, '') || ' ' || coalesce(generic_name, '') || ' ' || coalesce(active_ingredient, ''))
  ) stored,
  is_demo boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index medicine_catalog_search_trgm on public.medicine_catalog using gin (search_text extensions.gin_trgm_ops);
create index medicine_catalog_brand_idx on public.medicine_catalog (public.normalize_text(brand_name));
create unique index medicine_catalog_unique_variant on public.medicine_catalog (
  public.normalize_text(brand_name), public.normalize_text(coalesce(dosage, '')), public.normalize_text(coalesce(form, '')), public.normalize_text(coalesce(packaging, ''))
) where merged_into is null and review_status <> 'rejected';
create trigger medicine_catalog_touch before update on public.medicine_catalog
  for each row execute function public.touch_updated_at();

create table public.medicine_identifiers (
  id uuid primary key default gen_random_uuid(),
  catalog_id uuid not null references public.medicine_catalog(id) on delete cascade,
  id_type text not null check (id_type in ('gtin', 'amm', 'code_interne', 'atc')),
  value text not null,
  created_at timestamptz not null default now(),
  unique (id_type, value)
);

-- ---------------------------------------------------------------------------
-- Stocks
-- ---------------------------------------------------------------------------
create table public.pharmacy_inventory (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references public.pharmacies(id) on delete cascade,
  catalog_id uuid not null references public.medicine_catalog(id) on delete restrict,
  price_xof integer check (price_xof is null or price_xof between 0 and 10000000),
  quantity integer not null default 0 check (quantity >= 0),
  reserved_quantity integer not null default 0 check (reserved_quantity >= 0),
  is_available boolean not null default true,     -- déclaration du pharmacien
  low_stock_threshold integer not null default 5 check (low_stock_threshold >= 0),
  stock_updated_at timestamptz not null default now(), -- dernière actualisation déclarée
  updated_by uuid references public.profiles(id) on delete set null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  unique (pharmacy_id, catalog_id),
  constraint reserved_not_above_quantity check (reserved_quantity <= quantity)
);
create index pharmacy_inventory_catalog_idx on public.pharmacy_inventory(catalog_id);
create index pharmacy_inventory_pharmacy_idx on public.pharmacy_inventory(pharmacy_id);

create table public.inventory_batches (
  id uuid primary key default gen_random_uuid(),
  inventory_id uuid not null references public.pharmacy_inventory(id) on delete cascade,
  lot_number text not null,
  expiry_date date not null,
  quantity integer not null check (quantity >= 0),
  created_at timestamptz not null default now(),
  unique (inventory_id, lot_number)
);
create index inventory_batches_expiry_idx on public.inventory_batches(expiry_date);

create table public.inventory_movements (
  id bigint generated always as identity primary key,
  inventory_id uuid not null references public.pharmacy_inventory(id) on delete cascade,
  pharmacy_id uuid not null references public.pharmacies(id) on delete cascade,
  kind public.movement_kind not null,
  quantity_delta integer not null default 0,
  reserved_delta integer not null default 0,
  quantity_after integer not null,
  reserved_after integer not null,
  price_after integer,
  order_id uuid,
  note text,
  actor_id uuid,
  created_at timestamptz not null default now()
);
create index inventory_movements_pharmacy_idx on public.inventory_movements(pharmacy_id, created_at desc);
create index inventory_movements_inventory_idx on public.inventory_movements(inventory_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Fraîcheur de l'information de stock
-- ---------------------------------------------------------------------------
-- Résultat : 'available' (stock déclaré disponible, récent)
--            'to_confirm' (déclaré disponible mais pas tout récent)
--            'unavailable' (déclaré indisponible ou quantité libre nulle)
--            'stale' (information ancienne : jamais présentée comme certaine)
create or replace function public.stock_freshness(
  p_quantity int, p_reserved int, p_available boolean, p_updated timestamptz, p_now timestamptz default now()
) returns text language sql stable set search_path = public as $$
  select case
    when p_updated < p_now - make_interval(hours => public.setting_int('stock_stale_hours', 72)) then 'stale'
    when not p_available or (p_quantity - p_reserved) <= 0 then 'unavailable'
    when p_updated >= p_now - make_interval(hours => public.setting_int('stock_fresh_hours', 24)) then 'available'
    else 'to_confirm'
  end
$$;

-- Ouvert maintenant ? Uniquement si les horaires sont vérifiés. Heure du Mali (UTC+0).
create or replace function public.is_open_now(p_hours jsonb, p_verified boolean, p_now timestamptz default now())
returns boolean language plpgsql stable as $$
declare
  local_ts timestamp := p_now at time zone 'Africa/Bamako';
  dow text := (array['sun','mon','tue','wed','thu','fri','sat'])[extract(dow from local_ts)::int + 1];
  t time := local_ts::time;
  slot jsonb;
begin
  if not coalesce(p_verified, false) or p_hours is null or p_hours -> dow is null then
    return null; -- inconnu
  end if;
  for slot in select * from jsonb_array_elements(p_hours -> dow) loop
    if (slot ->> 0)::time <= (slot ->> 1)::time then
      if t >= (slot ->> 0)::time and t < (slot ->> 1)::time then return true; end if;
    else -- créneau traversant minuit (garde de nuit)
      if t >= (slot ->> 0)::time or t < (slot ->> 1)::time then return true; end if;
    end if;
  end loop;
  return false;
exception when others then
  return null;
end $$;

create or replace function public.distance_km(lat1 double precision, lon1 double precision, lat2 double precision, lon2 double precision)
returns double precision language sql immutable as $$
  select case when lat1 is null or lat2 is null or lon1 is null or lon2 is null then null else
    2 * 6371 * asin(sqrt(
      power(sin(radians(lat2 - lat1) / 2), 2) +
      cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lon2 - lon1) / 2), 2)
    )) end
$$;

-- >>> 20261010000300_orders_delivery_notifications.sql
-- ============================================================================
-- PharmaProxi — Migration 0003 : commandes, réservations, livraisons,
-- notifications, signalements, statistiques de recherche
-- ============================================================================

create table public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  label text not null default 'Domicile' check (char_length(label) <= 40),
  region_id uuid not null references public.regions(id) on delete restrict,
  commune_id uuid references public.communes(id) on delete restrict,
  locality_id uuid references public.localities(id) on delete restrict,
  address_line text not null check (char_length(address_line) between 3 and 300),
  landmark text check (char_length(landmark) <= 200),   -- point de repère
  contact_phone text not null check (contact_phone ~ '^\+[1-9][0-9]{7,14}$'),
  latitude double precision,
  longitude double precision,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create index customer_addresses_user_idx on public.customer_addresses(user_id);

create table public.couriers (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  status public.courier_status not null default 'pending',
  phone text not null check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  vehicle text check (vehicle in ('moto', 'velo', 'voiture', 'a_pied', 'autre')),
  zone_region_id uuid references public.regions(id) on delete set null,
  zone_commune_id uuid references public.communes(id) on delete set null,
  id_document_ref text,     -- référence de la pièce vérifiée (pas d'image publique)
  is_available boolean not null default true,
  verified_at timestamptz,
  verified_by uuid references public.profiles(id) on delete set null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('PP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
  customer_id uuid not null references public.profiles(id) on delete restrict,
  pharmacy_id uuid not null references public.pharmacies(id) on delete restrict,
  status public.order_status not null default 'pending_confirmation',
  fulfillment public.fulfillment_mode not null default 'pickup',
  payment_method public.payment_method not null default 'pay_at_pharmacy',
  payment_status public.payment_status not null default 'unpaid',
  paid_confirmed_at timestamptz,
  paid_confirmed_by uuid references public.profiles(id) on delete set null,
  subtotal_xof integer not null default 0 check (subtotal_xof >= 0),
  delivery_fee_xof integer not null default 0 check (delivery_fee_xof >= 0),
  total_xof integer generated always as (subtotal_xof + delivery_fee_xof) stored,
  has_prescription_items boolean not null default false,
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 80),
  confirmation_expires_at timestamptz,
  reservation_expires_at timestamptz,
  rejection_reason text,
  cancellation_reason text,
  cancelled_by uuid references public.profiles(id) on delete set null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (customer_id, idempotency_key),
  check (fulfillment = 'delivery' or payment_method = 'pay_at_pharmacy'),
  check (payment_status <> 'paid' or paid_confirmed_at is not null)
);
create index orders_customer_idx on public.orders(customer_id, created_at desc);
create index orders_pharmacy_idx on public.orders(pharmacy_id, status, created_at desc);
create index orders_status_idx on public.orders(status);
create trigger orders_touch before update on public.orders
  for each row execute function public.touch_updated_at();

-- Note client : séparée pour que l'administration n'y accède pas par défaut
create table public.order_private_notes (
  order_id uuid primary key references public.orders(id) on delete cascade,
  customer_note text check (char_length(customer_note) <= 500),
  created_at timestamptz not null default now()
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  inventory_id uuid not null references public.pharmacy_inventory(id) on delete restrict,
  catalog_id uuid not null references public.medicine_catalog(id) on delete restrict,
  product_label text not null,           -- instantané du libellé
  quantity integer not null check (quantity > 0),
  unit_price_xof integer not null check (unit_price_xof >= 0),
  requires_prescription boolean not null default false,
  unique (order_id, inventory_id)
);
create index order_items_order_idx on public.order_items(order_id);

create table public.stock_reservations (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null unique references public.order_items(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  inventory_id uuid not null references public.pharmacy_inventory(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  status public.reservation_status not null default 'active',
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);
create index stock_reservations_active_idx on public.stock_reservations(inventory_id) where status = 'active';

create table public.order_status_history (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  from_status public.order_status,
  to_status public.order_status not null,
  actor_id uuid,
  note text,
  created_at timestamptz not null default now()
);
create index order_status_history_order_idx on public.order_status_history(order_id, created_at);

create table public.deliveries (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  status public.delivery_status not null default 'pending',
  fee_xof integer not null default 0 check (fee_xof >= 0),
  dropoff_address text not null,
  dropoff_landmark text,
  dropoff_contact_phone text not null,
  dropoff_latitude double precision,
  dropoff_longitude double precision,
  instructions text check (char_length(instructions) <= 300),
  picked_up_at timestamptz,
  delivered_at timestamptz,
  failure_reason text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger deliveries_touch before update on public.deliveries
  for each row execute function public.touch_updated_at();

create table public.delivery_assignments (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.deliveries(id) on delete cascade,
  courier_id uuid not null references public.couriers(user_id) on delete restrict,
  assigned_by uuid references public.profiles(id) on delete set null,
  is_active boolean not null default true,
  assigned_at timestamptz not null default now(),
  ended_at timestamptz,
  end_reason text
);
create unique index delivery_assignments_one_active on public.delivery_assignments(delivery_id) where is_active;
create index delivery_assignments_courier_idx on public.delivery_assignments(courier_id) where is_active;

create table public.delivery_incidents (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.deliveries(id) on delete cascade,
  reported_by uuid references public.profiles(id) on delete set null,
  kind text not null check (kind in ('client_absent', 'adresse_introuvable', 'colis_endommage', 'refus_client', 'securite', 'autre')),
  description text check (char_length(description) <= 500),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Notifications internes (+ file d'attente pour canaux externes futurs)
-- ---------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  order_id uuid references public.orders(id) on delete cascade,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications(user_id, created_at desc);

-- Messages à envoyer via SMS / WhatsApp / e-mail une fois un prestataire configuré.
-- Aucun envoi n'est simulé : les lignes restent 'pending' tant qu'aucun worker n'existe.
create table public.notification_outbox (
  id bigint generated always as identity primary key,
  notification_id uuid not null references public.notifications(id) on delete cascade,
  channel text not null check (channel in ('sms', 'whatsapp', 'email')),
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped')),
  attempts int not null default 0,
  last_error text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Signalements
-- ---------------------------------------------------------------------------
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.profiles(id) on delete set null,
  pharmacy_id uuid references public.pharmacies(id) on delete cascade,
  inventory_id uuid references public.pharmacy_inventory(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  reason text not null check (reason in ('stock_incorrect', 'prix_incorrect', 'pharmacie_fermee', 'informations_erronees', 'comportement', 'produit_suspect', 'autre')),
  description text check (char_length(description) <= 1000),
  status public.report_status not null default 'open',
  resolution_note text,
  handled_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger reports_touch before update on public.reports
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Journal de recherche anonyme (aucun identifiant utilisateur)
-- ---------------------------------------------------------------------------
create table public.search_logs (
  id bigint generated always as identity primary key,
  query_normalized text not null,
  region_id uuid references public.regions(id) on delete set null,
  commune_id uuid references public.communes(id) on delete set null,
  result_count integer not null,
  created_at timestamptz not null default now()
);
create index search_logs_created_idx on public.search_logs(created_at desc);

-- >>> 20261010000400_business_functions.sql
-- ============================================================================
-- PharmaProxi — Migration 0004 : logique métier côté base de données
-- Toutes les opérations sensibles passent par des fonctions SECURITY DEFINER
-- qui vérifient explicitement l'identité (auth.uid()) et les droits, et
-- s'exécutent dans une transaction unique.
-- Codes d'erreur : les messages commencent par un code stable « PPxxx: »
-- interprété par l'interface.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Utilitaires
-- ---------------------------------------------------------------------------
create or replace function public.require_auth()
returns uuid language plpgsql stable as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'PP401: authentification requise' using errcode = '28000'; end if;
  return uid;
end $$;

create or replace function public.require_admin()
returns uuid language plpgsql stable security definer set search_path = public as $$
declare uid uuid := public.require_auth();
begin
  if not public.is_admin() then raise exception 'PP403: action réservée à l''administration' using errcode = '42501'; end if;
  return uid;
end $$;

create or replace function public.valid_phone(p text)
returns boolean language sql immutable as $$ select p ~ '^\+[1-9][0-9]{7,14}$' $$;

create or replace function public.notify_user(p_user uuid, p_kind text, p_title text, p_body text, p_order uuid default null, p_link text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user is null then return; end if;
  insert into public.notifications (user_id, kind, title, body, order_id, link)
  values (p_user, p_kind, p_title, p_body, p_order, p_link);
end $$;

create or replace function public.notify_pharmacy(p_pharmacy uuid, p_kind text, p_title text, p_body text, p_order uuid default null, p_link text default null)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, kind, title, body, order_id, link)
  select m.user_id, p_kind, p_title, p_body, p_order, p_link
  from public.pharmacy_members m where m.pharmacy_id = p_pharmacy;
$$;

create or replace function public.order_status_label(s public.order_status)
returns text language sql immutable as $$
  select case s
    when 'pending_confirmation' then 'En attente de confirmation'
    when 'confirmed' then 'Confirmée par la pharmacie'
    when 'preparing' then 'En préparation'
    when 'ready_for_pickup' then 'Prête au retrait'
    when 'awaiting_courier' then 'En attente d''affectation d''un livreur'
    when 'courier_assigned' then 'Livreur affecté'
    when 'in_delivery' then 'En cours de livraison'
    when 'delivered' then 'Livrée'
    when 'completed' then 'Retirée en pharmacie'
    when 'cancelled' then 'Annulée'
    when 'rejected' then 'Refusée par la pharmacie'
    when 'expired' then 'Expirée'
    when 'delivery_failed' then 'Échec de livraison'
  end
$$;

create or replace function public.is_terminal_status(s public.order_status)
returns boolean language sql immutable as $$
  select s in ('delivered', 'completed', 'cancelled', 'rejected', 'expired', 'delivery_failed')
$$;

-- ---------------------------------------------------------------------------
-- Garde-fou : un pharmacien ne peut pas modifier le statut de vérification
-- ---------------------------------------------------------------------------
-- SECURITY INVOKER volontaire : current_user doit refléter le rôle de l'appelant
create or replace function public.pharmacies_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  -- Les fonctions SECURITY DEFINER (propriétaire) et service_role ne sont pas concernées
  if current_user not in ('authenticated', 'anon') or auth.uid() is null then return new; end if;
  if new.is_demo is distinct from old.is_demo then
    raise exception 'PP403: champ non modifiable';
  end if;
  if not public.is_admin() and (
       new.status is distinct from old.status
    or new.verified_at is distinct from old.verified_at
    or new.hours_verified is distinct from old.hours_verified) then
    raise exception 'PP403: champ réservé à l''administration';
  end if;
  -- Toute modification des horaires par la pharmacie annule leur vérification
  if new.opening_hours is distinct from old.opening_hours and not public.is_admin() then
    new.hours_verified := false;
  end if;
  return new;
end $$;
create trigger pharmacies_guard before update on public.pharmacies
  for each row execute function public.pharmacies_guard();

-- Validation de la structure des horaires
create or replace function public.valid_opening_hours(h jsonb)
returns boolean language plpgsql immutable as $$
declare k text; slot jsonb;
begin
  if h is null or jsonb_typeof(h) <> 'object' then return false; end if;
  for k in select jsonb_object_keys(h) loop
    if k not in ('mon','tue','wed','thu','fri','sat','sun') then return false; end if;
    if jsonb_typeof(h -> k) <> 'array' then return false; end if;
    for slot in select * from jsonb_array_elements(h -> k) loop
      if jsonb_typeof(slot) <> 'array' or jsonb_array_length(slot) <> 2 then return false; end if;
      if (slot ->> 0) !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or (slot ->> 1) !~ '^([01][0-9]|2[0-4]):[0-5][0-9]$' then return false; end if;
    end loop;
  end loop;
  return true;
end $$;
alter table public.pharmacies add constraint pharmacies_hours_valid check (public.valid_opening_hours(opening_hours));

-- ---------------------------------------------------------------------------
-- Inscription d'une pharmacie (statut « pending », jamais vérifiée d'office)
-- ---------------------------------------------------------------------------
create or replace function public.register_pharmacy(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid uuid := public.require_auth();
  pid uuid;
  v_region uuid := (p ->> 'region_id')::uuid;
  v_circle uuid := nullif(p ->> 'circle_id', '')::uuid;
  v_commune uuid := nullif(p ->> 'commune_id', '')::uuid;
  v_locality uuid := nullif(p ->> 'locality_id', '')::uuid;
  pending_count int;
begin
  select count(*) into pending_count
  from public.pharmacy_members m join public.pharmacies ph on ph.id = m.pharmacy_id
  where m.user_id = uid and ph.status = 'pending';
  if pending_count >= 3 then raise exception 'PP429: trop de demandes d''inscription en attente'; end if;

  if v_region is null or not exists (select 1 from public.regions where id = v_region) then
    raise exception 'PP422: région invalide';
  end if;
  if v_commune is not null and not exists (select 1 from public.communes where id = v_commune and region_id = v_region) then
    raise exception 'PP422: la commune ne correspond pas à la région';
  end if;
  if v_circle is not null and not exists (select 1 from public.circles where id = v_circle and region_id = v_region) then
    raise exception 'PP422: le cercle ne correspond pas à la région';
  end if;
  if v_locality is not null and (v_commune is null or not exists (select 1 from public.localities where id = v_locality and commune_id = v_commune)) then
    raise exception 'PP422: le quartier ne correspond pas à la commune';
  end if;
  if coalesce(trim(p ->> 'pharmacist_in_charge'), '') = '' then
    raise exception 'PP422: le nom du pharmacien responsable est obligatoire';
  end if;

  insert into public.pharmacies (name, address, region_id, circle_id, commune_id, locality_id, latitude, longitude,
                                 phone, whatsapp, email, opening_hours, offers_pickup, offers_delivery, created_by)
  values (trim(p ->> 'name'), trim(p ->> 'address'), v_region, v_circle, v_commune, v_locality,
          nullif(p ->> 'latitude', '')::double precision, nullif(p ->> 'longitude', '')::double precision,
          p ->> 'phone', nullif(p ->> 'whatsapp', ''), nullif(p ->> 'email', ''),
          coalesce(p -> 'opening_hours', '{}'::jsonb), coalesce((p ->> 'offers_pickup')::boolean, true),
          coalesce((p ->> 'offers_delivery')::boolean, false), uid)
  returning id into pid;

  insert into public.pharmacy_private (pharmacy_id, legal_name, license_number, pharmacist_in_charge, manager_phone, order_registration, tax_id, rccm)
  values (pid, nullif(p ->> 'legal_name', ''), nullif(p ->> 'license_number', ''), trim(p ->> 'pharmacist_in_charge'),
          nullif(p ->> 'manager_phone', ''), nullif(p ->> 'order_registration', ''), nullif(p ->> 'tax_id', ''), nullif(p ->> 'rccm', ''));

  insert into public.pharmacy_members (pharmacy_id, user_id, member_role) values (pid, uid, 'owner');
  insert into public.user_roles (user_id, role) values (uid, 'pharmacist') on conflict do nothing;
  insert into public.pharmacy_verifications (pharmacy_id, decision, reason, reviewer_id)
  values (pid, 'pending', 'Demande d''inscription déposée', uid);

  perform public.log_audit('pharmacy.register', 'pharmacy', pid::text, jsonb_build_object('name', p ->> 'name'));
  return pid;
end $$;

-- Nouvelle soumission après un refus (corrections effectuées)
create or replace function public.resubmit_pharmacy(p_pharmacy uuid)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_auth();
begin
  if not public.is_pharmacy_member(p_pharmacy) then raise exception 'PP403: accès refusé'; end if;
  perform set_config('pharmaproxi.internal', 'on', true);
  update public.pharmacies set status = 'pending' where id = p_pharmacy and status = 'rejected';
  if not found then raise exception 'PP409: seule une demande refusée peut être soumise à nouveau'; end if;
  perform set_config('pharmaproxi.internal', 'off', true);
  insert into public.pharmacy_verifications (pharmacy_id, decision, reason, reviewer_id)
  values (p_pharmacy, 'pending', 'Nouvelle soumission après corrections', uid);
  perform public.log_audit('pharmacy.resubmit', 'pharmacy', p_pharmacy::text);
end $$;

-- ---------------------------------------------------------------------------
-- Vérification administrative des pharmacies
-- Transitions autorisées :
--   pending   -> verified | rejected
--   verified  -> suspended
--   suspended -> verified (réactivation) | rejected
-- ---------------------------------------------------------------------------
create or replace function public.admin_review_pharmacy(p_pharmacy uuid, p_decision public.pharmacy_status, p_reason text default null, p_checklist jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  uid uuid := public.require_admin();
  cur public.pharmacy_status;
  pname text;
begin
  select status, name into cur, pname from public.pharmacies where id = p_pharmacy for update;
  if cur is null then raise exception 'PP404: pharmacie introuvable'; end if;
  if not (
    (cur = 'pending' and p_decision in ('verified', 'rejected')) or
    (cur = 'verified' and p_decision = 'suspended') or
    (cur = 'suspended' and p_decision in ('verified', 'rejected'))
  ) then
    raise exception 'PP409: transition % -> % non autorisée', cur, p_decision;
  end if;
  if p_decision in ('rejected', 'suspended') and coalesce(trim(p_reason), '') = '' then
    raise exception 'PP422: un motif est obligatoire pour un refus ou une suspension';
  end if;
  if p_decision = 'verified' and cur = 'pending' and not exists (select 1 from public.pharmacy_documents where pharmacy_id = p_pharmacy) then
    raise exception 'PP422: aucun justificatif déposé, validation impossible';
  end if;

  perform set_config('pharmaproxi.internal', 'on', true);
  update public.pharmacies
     set status = p_decision,
         verified_at = case when p_decision = 'verified' then now() else verified_at end
   where id = p_pharmacy;
  perform set_config('pharmaproxi.internal', 'off', true);

  insert into public.pharmacy_verifications (pharmacy_id, decision, reason, checklist, reviewer_id)
  values (p_pharmacy, p_decision, p_reason, coalesce(p_checklist, '{}'::jsonb), uid);

  perform public.log_audit('pharmacy.review', 'pharmacy', p_pharmacy::text,
    jsonb_build_object('from', cur, 'to', p_decision, 'reason', p_reason));

  perform public.notify_pharmacy(p_pharmacy, 'pharmacy_review',
    case p_decision when 'verified' then 'Pharmacie vérifiée'
                    when 'rejected' then 'Demande d''inscription refusée'
                    when 'suspended' then 'Pharmacie suspendue' else 'Statut mis à jour' end,
    coalesce(p_reason, pname), null, '/pharmacien');
end $$;

create or replace function public.admin_set_hours_verified(p_pharmacy uuid, p_verified boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  update public.pharmacies set hours_verified = p_verified where id = p_pharmacy;
  perform public.log_audit('pharmacy.hours_verified', 'pharmacy', p_pharmacy::text, jsonb_build_object('verified', p_verified));
end $$;

-- ---------------------------------------------------------------------------
-- Catalogue : création avec dédoublonnage
-- ---------------------------------------------------------------------------
create or replace function public.upsert_catalog_item(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid uuid := public.require_auth();
  admin boolean := public.is_admin();
  cid uuid;
  v_brand text := trim(p ->> 'brand_name');
  v_category uuid := nullif(p ->> 'category_id', '')::uuid;
  cat_rx boolean := false;
begin
  if not (admin or public.has_role('pharmacist')) then raise exception 'PP403: accès refusé'; end if;
  if v_brand is null or char_length(v_brand) < 2 then raise exception 'PP422: nom commercial obligatoire'; end if;
  if v_category is not null then
    select requires_prescription into cat_rx from public.product_categories where id = v_category and is_authorized;
    if not found then raise exception 'PP422: catégorie de produit non autorisée'; end if;
  end if;

  select id into cid from public.medicine_catalog
   where merged_into is null and review_status <> 'rejected'
     and public.normalize_text(brand_name) = public.normalize_text(v_brand)
     and public.normalize_text(coalesce(dosage, '')) = public.normalize_text(coalesce(p ->> 'dosage', ''))
     and public.normalize_text(coalesce(form, '')) = public.normalize_text(coalesce(p ->> 'form', ''))
     and public.normalize_text(coalesce(packaging, '')) = public.normalize_text(coalesce(p ->> 'packaging', ''));
  if cid is not null then return cid; end if;

  insert into public.medicine_catalog (brand_name, generic_name, active_ingredient, dosage, form, packaging, manufacturer,
                                       category_id, requires_prescription, review_status, created_by)
  values (v_brand, nullif(trim(p ->> 'generic_name'), ''), nullif(trim(p ->> 'active_ingredient'), ''),
          nullif(trim(p ->> 'dosage'), ''), nullif(trim(p ->> 'form'), ''), nullif(trim(p ->> 'packaging'), ''),
          nullif(trim(p ->> 'manufacturer'), ''), v_category,
          coalesce((p ->> 'requires_prescription')::boolean, false) or coalesce(cat_rx, false),
          case when admin then 'approved' else 'pending' end, uid)
  returning id into cid;
  return cid;
end $$;

-- ---------------------------------------------------------------------------
-- Stocks
-- ---------------------------------------------------------------------------
create or replace function public.set_inventory(
  p_pharmacy uuid, p_catalog uuid, p_quantity int, p_price int, p_available boolean default true,
  p_threshold int default null, p_note text default null, p_kind public.movement_kind default 'adjustment')
returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid uuid := public.require_auth();
  inv public.pharmacy_inventory%rowtype;
  old_free int;
  new_free int;
  cat record;
begin
  if not public.can_manage_pharmacy(p_pharmacy) then raise exception 'PP403: vous ne gérez pas cette pharmacie'; end if;
  if p_quantity is null or p_quantity < 0 or p_quantity > 1000000 then raise exception 'PP422: quantité invalide'; end if;
  if p_price is not null and (p_price < 0 or p_price > 10000000) then raise exception 'PP422: prix invalide'; end if;

  select c.id, c.merged_into, c.review_status, coalesce(pc.is_authorized, true) as authorized
    into cat
    from public.medicine_catalog c left join public.product_categories pc on pc.id = c.category_id
   where c.id = p_catalog;
  if cat.id is null then raise exception 'PP404: produit introuvable dans le catalogue'; end if;
  if cat.merged_into is not null then raise exception 'PP409: produit fusionné, utilisez la fiche de référence'; end if;
  if cat.review_status = 'rejected' or not cat.authorized then raise exception 'PP422: produit non autorisé sur la plateforme'; end if;

  select * into inv from public.pharmacy_inventory where pharmacy_id = p_pharmacy and catalog_id = p_catalog for update;
  if inv.id is null then
    insert into public.pharmacy_inventory (pharmacy_id, catalog_id, price_xof, quantity, is_available, low_stock_threshold, stock_updated_at, updated_by)
    values (p_pharmacy, p_catalog, p_price, p_quantity, coalesce(p_available, true), coalesce(p_threshold, 5), now(), uid)
    returning * into inv;
    insert into public.inventory_movements (inventory_id, pharmacy_id, kind, quantity_delta, quantity_after, reserved_after, price_after, note, actor_id)
    values (inv.id, p_pharmacy, p_kind, p_quantity, p_quantity, 0, p_price, p_note, uid);
    old_free := 1000000000;
  else
    if p_quantity < inv.reserved_quantity then
      raise exception 'PP409: la quantité (%) ne peut pas être inférieure à la quantité réservée (%)', p_quantity, inv.reserved_quantity;
    end if;
    old_free := inv.quantity - inv.reserved_quantity;
    update public.pharmacy_inventory
       set quantity = p_quantity, price_xof = p_price, is_available = coalesce(p_available, is_available),
           low_stock_threshold = coalesce(p_threshold, low_stock_threshold), stock_updated_at = now(), updated_by = uid
     where id = inv.id
     returning * into inv;
    insert into public.inventory_movements (inventory_id, pharmacy_id, kind, quantity_delta, quantity_after, reserved_after, price_after, note, actor_id)
    values (inv.id, p_pharmacy, p_kind, p_quantity - (old_free + inv.reserved_quantity), inv.quantity, inv.reserved_quantity, inv.price_xof, p_note, uid);
  end if;

  new_free := inv.quantity - inv.reserved_quantity;
  if inv.is_available and new_free <= inv.low_stock_threshold and old_free > inv.low_stock_threshold then
    perform public.notify_pharmacy(p_pharmacy, 'low_stock', 'Stock faible',
      (select brand_name from public.medicine_catalog where id = p_catalog) || ' : ' || new_free || ' unité(s) disponible(s)', null, '/pharmacien/stocks');
  end if;
  return inv.id;
end $$;

-- Confirmation rapide « stock toujours exact » (mise à jour depuis un téléphone)
create or replace function public.confirm_inventory_fresh(p_inventory_ids uuid[])
returns int language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_auth(); n int := 0; r record;
begin
  if coalesce(array_length(p_inventory_ids, 1), 0) > 500 then raise exception 'PP422: trop de lignes'; end if;
  for r in select * from public.pharmacy_inventory where id = any(p_inventory_ids) for update loop
    if not public.can_manage_pharmacy(r.pharmacy_id) then raise exception 'PP403: accès refusé'; end if;
    update public.pharmacy_inventory set stock_updated_at = now(), updated_by = uid where id = r.id;
    insert into public.inventory_movements (inventory_id, pharmacy_id, kind, quantity_after, reserved_after, price_after, note, actor_id)
    values (r.id, r.pharmacy_id, 'correction', r.quantity, r.reserved_quantity, r.price_xof, 'Stock confirmé à l''identique', uid);
    n := n + 1;
  end loop;
  return n;
end $$;

-- Import CSV (lignes déjà analysées côté serveur). Chaque ligne est isolée :
-- une ligne invalide n'annule pas les autres, le rapport détaille les erreurs.
create or replace function public.import_inventory(p_pharmacy uuid, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r jsonb; i int := 0; ok int := 0; errors jsonb := '[]'::jsonb; cid uuid;
begin
  perform public.require_auth();
  if not public.can_manage_pharmacy(p_pharmacy) then raise exception 'PP403: vous ne gérez pas cette pharmacie'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 2000 then
    raise exception 'PP422: 2000 lignes maximum par import';
  end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    i := i + 1;
    begin
      cid := public.upsert_catalog_item(r);
      perform public.set_inventory(p_pharmacy, cid, (r ->> 'quantity')::int, nullif(r ->> 'price_xof', '')::int,
                                   coalesce((r ->> 'is_available')::boolean, true), null, 'Import CSV', 'import');
      ok := ok + 1;
    exception when others then
      errors := errors || jsonb_build_object('row', i, 'error', regexp_replace(sqlerrm, '^PP[0-9]+: ', ''));
    end;
  end loop;
  return jsonb_build_object('imported', ok, 'failed', jsonb_array_length(errors), 'errors', errors);
end $$;

-- ---------------------------------------------------------------------------
-- Recherche publique
-- ---------------------------------------------------------------------------
-- Tous les mots de la requête (≥ 2 caractères) figurent dans le texte, dans n'importe quel ordre
create or replace function public.all_words_match(p_text text, p_query text)
returns boolean language sql immutable parallel safe as $$
  select coalesce(bool_and(p_text like '%' || w || '%'), false)
  from unnest(string_to_array(p_query, ' ')) as w
  where char_length(w) >= 2
$$;

create or replace function public.search_inventory(
  p_query text,
  p_region uuid default null,
  p_commune uuid default null,
  p_locality uuid default null,
  p_lat double precision default null,
  p_lng double precision default null,
  p_max_km double precision default null,
  p_open_only boolean default false,
  p_max_price int default null,
  p_include_unavailable boolean default true,
  p_sort text default 'relevance',
  p_limit int default 20,
  p_offset int default 0,
  p_catalog uuid default null
) returns table (
  inventory_id uuid, pharmacy_id uuid, pharmacy_name text, address text,
  region_name text, commune_name text, locality_name text, phone text, whatsapp text,
  latitude double precision, longitude double precision, is_open boolean, hours_verified boolean,
  offers_pickup boolean, offers_delivery boolean,
  catalog_id uuid, brand_name text, generic_name text, active_ingredient text, dosage text, form text, packaging text,
  requires_prescription boolean, price_xof int, freshness text, stock_updated_at timestamptz,
  distance_km double precision, relevance real, total_count bigint
) language plpgsql volatile security definer set search_path = public, extensions as $$
#variable_conflict use_column
declare
  q text := public.normalize_text(p_query);
  lim int := least(greatest(coalesce(p_limit, 20), 1), 50);
  off int := least(greatest(coalesce(p_offset, 0), 0), 1000);
  n bigint;
begin
  if p_catalog is null and char_length(q) < 2 then return; end if;
  if char_length(q) > 100 then q := left(q, 100); end if;

  return query
  with matches as (
    select c.*, case when p_catalog is not null then 1
                     else greatest(similarity(c.search_text, q),
                                   case when c.search_text like '%' || q || '%' then 0.9 when public.all_words_match(c.search_text, q) then 0.7 else 0 end) end::real as rel
    from public.medicine_catalog c
    left join public.product_categories pc on pc.id = c.category_id
    where c.merged_into is null and c.review_status <> 'rejected' and coalesce(pc.is_authorized, true)
      and (case when p_catalog is not null then c.id = p_catalog
                else (c.search_text like '%' || q || '%' or c.search_text % q or public.all_words_match(c.search_text, q)) end)
  ), rows as (
    select i.id as inventory_id, ph.id as pharmacy_id, ph.name as pharmacy_name, ph.address,
           rg.name as region_name, cm.name as commune_name, lc.name as locality_name, ph.phone, ph.whatsapp,
           ph.latitude, ph.longitude, public.is_open_now(ph.opening_hours, ph.hours_verified) as is_open, ph.hours_verified,
           ph.offers_pickup, ph.offers_delivery,
           m.id as catalog_id, m.brand_name, m.generic_name, m.active_ingredient, m.dosage, m.form, m.packaging,
           m.requires_prescription, i.price_xof,
           public.stock_freshness(i.quantity, i.reserved_quantity, i.is_available, i.stock_updated_at) as freshness,
           i.stock_updated_at,
           public.distance_km(p_lat, p_lng, ph.latitude, ph.longitude) as distance_km,
           m.rel as relevance
    from matches m
    join public.pharmacy_inventory i on i.catalog_id = m.id
    join public.pharmacies ph on ph.id = i.pharmacy_id and ph.status = 'verified'
    join public.regions rg on rg.id = ph.region_id
    left join public.communes cm on cm.id = ph.commune_id
    left join public.localities lc on lc.id = ph.locality_id
    where (p_region is null or ph.region_id = p_region)
      and (p_commune is null or ph.commune_id = p_commune)
      and (p_locality is null or ph.locality_id = p_locality)
      and (p_max_price is null or (i.price_xof is not null and i.price_xof <= p_max_price))
  ), filtered as (
    select * from rows r
    where (not coalesce(p_open_only, false) or r.is_open is true)
      and (coalesce(p_include_unavailable, true) or r.freshness in ('available', 'to_confirm'))
      and (p_max_km is null or (r.distance_km is not null and r.distance_km <= p_max_km))
  )
  select f.*, count(*) over () as total_count
  from filtered f
  order by
    case when p_sort = 'distance' then coalesce(f.distance_km, 1e9) end asc,
    case when p_sort = 'price' then coalesce(f.price_xof, 2147483647) end asc,
    case f.freshness when 'available' then 0 when 'to_confirm' then 1 when 'stale' then 2 else 3 end asc,
    case when p_sort = 'freshness' then f.stock_updated_at end desc,
    f.relevance desc, f.stock_updated_at desc, f.inventory_id
  limit lim offset off;

  if off = 0 and p_catalog is null then
    get diagnostics n = row_count;
    insert into public.search_logs (query_normalized, region_id, commune_id, result_count)
    values (q, p_region, p_commune, n);
  end if;
end $$;

-- Suggestions (catalogue seul : ne dit rien de la disponibilité)
create or replace function public.suggest_medicines(p_query text, p_limit int default 8)
returns table (catalog_id uuid, label text, active_ingredient text)
language sql stable security definer set search_path = public, extensions as $$
  select c.id, c.brand_name || coalesce(' ' || c.dosage, '') || coalesce(' — ' || c.form, ''), c.active_ingredient
  from public.medicine_catalog c
  where char_length(public.normalize_text(p_query)) >= 2
    and c.merged_into is null and c.review_status <> 'rejected'
    and (c.search_text like '%' || public.normalize_text(p_query) || '%' or c.search_text % public.normalize_text(p_query)
         or public.all_words_match(c.search_text, public.normalize_text(p_query)))
  order by (c.search_text like public.normalize_text(p_query) || '%') desc, similarity(c.search_text, public.normalize_text(p_query)) desc
  limit least(greatest(coalesce(p_limit, 8), 1), 20)
$$;

-- Stock public d'une pharmacie (sans quantités exactes)
create or replace function public.pharmacy_public_inventory(p_pharmacy uuid, p_query text default null, p_limit int default 50, p_offset int default 0)
returns table (inventory_id uuid, catalog_id uuid, brand_name text, generic_name text, active_ingredient text, dosage text, form text,
               packaging text, requires_prescription boolean, delivery_allowed boolean, price_xof int, freshness text,
               stock_updated_at timestamptz, total_count bigint)
language sql stable security definer set search_path = public, extensions as $$
  select i.id, c.id, c.brand_name, c.generic_name, c.active_ingredient, c.dosage, c.form, c.packaging,
         c.requires_prescription or coalesce(pc.requires_prescription, false),
         coalesce(pc.delivery_allowed, false) and not (c.requires_prescription or coalesce(pc.requires_prescription, false)),
         i.price_xof, public.stock_freshness(i.quantity, i.reserved_quantity, i.is_available, i.stock_updated_at), i.stock_updated_at,
         count(*) over ()
  from public.pharmacy_inventory i
  join public.pharmacies ph on ph.id = i.pharmacy_id and ph.status = 'verified'
  join public.medicine_catalog c on c.id = i.catalog_id and c.merged_into is null
  left join public.product_categories pc on pc.id = c.category_id
  where i.pharmacy_id = p_pharmacy and coalesce(pc.is_authorized, true)
    and (p_query is null or char_length(trim(p_query)) = 0 or c.search_text like '%' || public.normalize_text(p_query) || '%')
  order by c.brand_name
  limit least(greatest(coalesce(p_limit, 50), 1), 100) offset greatest(coalesce(p_offset, 0), 0)
$$;

-- ---------------------------------------------------------------------------
-- Commandes
-- ---------------------------------------------------------------------------
create or replace function public.create_order(
  p_pharmacy uuid, p_items jsonb, p_fulfillment public.fulfillment_mode, p_idempotency_key text,
  p_address_id uuid default null, p_note text default null, p_delivery_instructions text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid uuid := public.require_auth();
  existing uuid;
  ph public.pharmacies%rowtype;
  addr public.customer_addresses%rowtype;
  oid uuid;
  it jsonb;
  inv record;
  v_qty int;
  subtotal int := 0;
  fee int := 0;
  has_rx boolean := false;
  restricted boolean := false;
  max_items int := public.setting_int('max_items_per_order', 10);
  max_qty int := public.setting_int('max_quantity_per_item', 20);
begin
  if p_idempotency_key is null or char_length(p_idempotency_key) < 8 then raise exception 'PP422: clé d''idempotence manquante'; end if;
  select id into existing from public.orders where customer_id = uid and idempotency_key = p_idempotency_key;
  if existing is not null then return existing; end if;

  if not public.setting_bool('orders_enabled', true) then raise exception 'PP503: les demandes de réservation sont momentanément désactivées'; end if;
  if exists (select 1 from public.profiles where id = uid and deleted_at is not null) then raise exception 'PP403: compte supprimé'; end if;

  select * into ph from public.pharmacies where id = p_pharmacy;
  if ph.id is null or ph.status <> 'verified' then raise exception 'PP422: pharmacie indisponible'; end if;
  if exists (select 1 from public.pharmacy_members where pharmacy_id = p_pharmacy and user_id = uid) then
    raise exception 'PP422: vous ne pouvez pas commander auprès de votre propre pharmacie';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'PP422: aucun produit sélectionné'; end if;
  if jsonb_array_length(p_items) > max_items then raise exception 'PP422: % produits maximum par commande', max_items; end if;

  if p_fulfillment = 'pickup' and not ph.offers_pickup then raise exception 'PP422: cette pharmacie ne propose pas le retrait'; end if;
  if p_fulfillment = 'delivery' then
    if not public.setting_bool('delivery_enabled', false) then
      raise exception 'PP422: la livraison n''est pas encore activée sur la plateforme';
    end if;
    if not ph.offers_delivery then raise exception 'PP422: cette pharmacie ne propose pas la livraison'; end if;
    select * into addr from public.customer_addresses where id = p_address_id and user_id = uid;
    if addr.id is null then raise exception 'PP422: adresse de livraison invalide'; end if;
    fee := public.setting_int('default_delivery_fee_xof', 1000);
  end if;

  insert into public.orders (customer_id, pharmacy_id, fulfillment, payment_method, delivery_fee_xof, idempotency_key, confirmation_expires_at)
  values (uid, p_pharmacy, p_fulfillment,
          case when p_fulfillment = 'delivery' then 'cash_on_delivery' else 'pay_at_pharmacy' end::public.payment_method,
          fee, p_idempotency_key, now() + make_interval(mins => public.setting_int('confirmation_ttl_minutes', 60)))
  returning id into oid;

  for it in select * from jsonb_array_elements(p_items) loop
    v_qty := (it ->> 'quantity')::int;
    if v_qty is null or v_qty < 1 or v_qty > max_qty then raise exception 'PP422: quantité invalide (1 à %)', max_qty; end if;
    select i.id, i.catalog_id, i.price_xof, i.is_available, i.quantity, i.reserved_quantity,
           c.brand_name || coalesce(' ' || c.dosage, '') || coalesce(' (' || c.form || ')', '') as label,
           c.requires_prescription or coalesce(pc.requires_prescription, false) as rx,
           coalesce(pc.delivery_allowed, false) as delivery_ok
      into inv
      from public.pharmacy_inventory i
      join public.medicine_catalog c on c.id = i.catalog_id
      left join public.product_categories pc on pc.id = c.category_id
     where i.id = (it ->> 'inventory_id')::uuid and i.pharmacy_id = p_pharmacy;
    if inv.id is null then raise exception 'PP422: produit introuvable dans cette pharmacie'; end if;
    if not inv.is_available or inv.quantity - inv.reserved_quantity <= 0 then
      raise exception 'PP409: % est déclaré indisponible', inv.label;
    end if;
    if inv.price_xof is null then raise exception 'PP422: prix non renseigné pour %, contactez la pharmacie', inv.label; end if;
    has_rx := has_rx or inv.rx;
    restricted := restricted or inv.rx or not inv.delivery_ok;
    insert into public.order_items (order_id, inventory_id, catalog_id, product_label, quantity, unit_price_xof, requires_prescription)
    values (oid, inv.id, inv.catalog_id, inv.label, v_qty, inv.price_xof, inv.rx);
    subtotal := subtotal + v_qty * inv.price_xof;
  end loop;

  if p_fulfillment = 'delivery' and restricted then
    raise exception 'PP422: au moins un produit ne peut pas être livré (ordonnance ou catégorie non autorisée à la livraison). Choisissez le retrait en pharmacie.';
  end if;

  update public.orders set subtotal_xof = subtotal, has_prescription_items = has_rx where id = oid;

  if nullif(trim(p_note), '') is not null then
    insert into public.order_private_notes (order_id, customer_note) values (oid, left(trim(p_note), 500));
  end if;

  if p_fulfillment = 'delivery' then
    insert into public.deliveries (order_id, fee_xof, dropoff_address, dropoff_landmark, dropoff_contact_phone, dropoff_latitude, dropoff_longitude, instructions)
    values (oid, fee, addr.address_line, addr.landmark, addr.contact_phone, addr.latitude, addr.longitude, left(nullif(trim(p_delivery_instructions), ''), 300));
  end if;

  insert into public.order_status_history (order_id, from_status, to_status, actor_id) values (oid, null, 'pending_confirmation', uid);
  perform public.notify_pharmacy(p_pharmacy, 'order_new', 'Nouvelle demande',
    'Une demande de ' || case when p_fulfillment = 'delivery' then 'livraison' else 'retrait' end || ' attend votre confirmation.', oid, '/pharmacien/commandes/' || oid);
  return oid;
exception when unique_violation then
  select id into existing from public.orders where customer_id = uid and idempotency_key = p_idempotency_key;
  if existing is not null then return existing; end if;
  raise;
end $$;

-- Libération / consommation des réservations (interne)
create or replace function public._close_reservations(p_order uuid, p_mode text, p_actor uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  -- verrouillage dans un ordre déterministe pour éviter les interblocages
  for r in
    select sr.*, i.quantity as inv_qty, i.reserved_quantity as inv_res
    from public.stock_reservations sr join public.pharmacy_inventory i on i.id = sr.inventory_id
    where sr.order_id = p_order and sr.status = 'active'
    order by sr.inventory_id
    for update of sr, i
  loop
    if p_mode = 'consume' then
      update public.pharmacy_inventory
         set quantity = quantity - r.quantity, reserved_quantity = reserved_quantity - r.quantity
       where id = r.inventory_id;
      update public.stock_reservations set status = 'consumed', closed_at = now() where id = r.id;
      insert into public.inventory_movements (inventory_id, pharmacy_id, kind, quantity_delta, reserved_delta, quantity_after, reserved_after, order_id, actor_id)
      select r.inventory_id, i.pharmacy_id, 'sale', -r.quantity, -r.quantity, i.quantity, i.reserved_quantity, p_order, p_actor
      from public.pharmacy_inventory i where i.id = r.inventory_id;
    else
      update public.pharmacy_inventory set reserved_quantity = reserved_quantity - r.quantity where id = r.inventory_id;
      update public.stock_reservations
         set status = case when p_mode = 'expire' then 'expired' else 'released' end::public.reservation_status, closed_at = now()
       where id = r.id;
      insert into public.inventory_movements (inventory_id, pharmacy_id, kind, reserved_delta, quantity_after, reserved_after, order_id, actor_id, note)
      select r.inventory_id, i.pharmacy_id, case when p_mode = 'return' then 'return' else 'release' end::public.movement_kind,
             -r.quantity, i.quantity, i.reserved_quantity, p_order, p_actor, p_mode
      from public.pharmacy_inventory i where i.id = r.inventory_id;
    end if;
  end loop;
end $$;
revoke execute on function public._close_reservations(uuid, text, uuid) from public, anon, authenticated;

-- Changement de statut (interne, sans contrôle de droits — appelé par les fonctions publiques)
create or replace function public._set_order_status(p_order uuid, p_to public.order_status, p_actor uuid, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare o public.orders%rowtype;
begin
  select * into o from public.orders where id = p_order;
  update public.orders set status = p_to,
         cancellation_reason = case when p_to = 'cancelled' then coalesce(p_note, cancellation_reason) else cancellation_reason end,
         cancelled_by = case when p_to = 'cancelled' then p_actor else cancelled_by end,
         rejection_reason = case when p_to = 'rejected' then p_note else rejection_reason end,
         payment_status = case when p_to in ('cancelled', 'expired', 'delivery_failed', 'rejected') and payment_status = 'paid' then 'refund_pending' else payment_status end
   where id = p_order;
  insert into public.order_status_history (order_id, from_status, to_status, actor_id, note) values (p_order, o.status, p_to, p_actor, p_note);

  -- Effets sur les stocks
  if p_to in ('completed', 'delivered') then
    perform public._close_reservations(p_order, 'consume', p_actor);
  elsif p_to = 'delivery_failed' then
    perform public._close_reservations(p_order, 'return', p_actor);
  elsif p_to = 'expired' then
    perform public._close_reservations(p_order, 'expire', p_actor);
  elsif p_to in ('cancelled', 'rejected') then
    perform public._close_reservations(p_order, 'release', p_actor);
  end if;

  -- Synchronisation de la livraison
  if o.fulfillment = 'delivery' then
    update public.deliveries set
      status = case p_to
        when 'awaiting_courier' then 'awaiting_courier'
        when 'courier_assigned' then 'assigned'
        when 'in_delivery' then 'picked_up'
        when 'delivered' then 'delivered'
        when 'delivery_failed' then 'failed'
        when 'cancelled' then 'cancelled' when 'rejected' then 'cancelled' when 'expired' then 'cancelled'
        else status end::public.delivery_status,
      picked_up_at = case when p_to = 'in_delivery' then now() else picked_up_at end,
      delivered_at = case when p_to = 'delivered' then now() else delivered_at end,
      failure_reason = case when p_to = 'delivery_failed' then p_note else failure_reason end
    where order_id = p_order;
    if public.is_terminal_status(p_to) then
      update public.delivery_assignments set is_active = false, ended_at = now(), end_reason = p_to::text
       where delivery_id = (select id from public.deliveries where order_id = p_order) and is_active;
    end if;
  end if;

  -- Notifications
  perform public.notify_user(o.customer_id, 'order_status', 'Commande ' || o.reference || ' : ' || public.order_status_label(p_to),
    coalesce(p_note, null), p_order, '/compte/commandes/' || p_order);
  if p_actor = o.customer_id and p_to = 'cancelled' then
    perform public.notify_pharmacy(o.pharmacy_id, 'order_cancelled', 'Demande annulée par le client', o.reference, p_order, '/pharmacien/commandes/' || p_order);
  end if;
end $$;
revoke execute on function public._set_order_status(uuid, public.order_status, uuid, text) from public, anon, authenticated;

-- Réponse de la pharmacie : acceptation (réservation transactionnelle) ou refus
create or replace function public.pharmacy_respond_order(p_order uuid, p_accept boolean, p_reason text default null)
returns public.order_status language plpgsql security definer set search_path = public as $$
declare
  uid uuid := public.require_auth();
  o public.orders%rowtype;
  it record;
  ttl int := public.setting_int('reservation_ttl_minutes', 240);
begin
  select * into o from public.orders where id = p_order for update;
  if o.id is null then raise exception 'PP404: commande introuvable'; end if;
  if not public.can_manage_pharmacy(o.pharmacy_id) then raise exception 'PP403: accès refusé'; end if;

  -- Idempotence : une réponse déjà enregistrée est renvoyée telle quelle
  if p_accept and o.status <> 'pending_confirmation' and o.status not in ('rejected', 'expired', 'cancelled') then return o.status; end if;
  if not p_accept and o.status = 'rejected' then return o.status; end if;
  if o.status <> 'pending_confirmation' then raise exception 'PP409: la commande n''est plus en attente (%)', public.order_status_label(o.status); end if;
  if o.confirmation_expires_at is not null and o.confirmation_expires_at < now() then
    perform public._set_order_status(p_order, 'expired', uid, 'Délai de confirmation dépassé');
    return 'expired';
  end if;

  if not p_accept then
    if coalesce(trim(p_reason), '') = '' then raise exception 'PP422: indiquez un motif de refus'; end if;
    perform public._set_order_status(p_order, 'rejected', uid, p_reason);
    return 'rejected';
  end if;

  -- Verrouillage des lignes de stock dans un ordre stable puis contrôle
  for it in
    select oi.id as item_id, oi.quantity, oi.product_label, i.id as inv_id, i.quantity as inv_qty, i.reserved_quantity as inv_res, i.is_available
    from public.order_items oi join public.pharmacy_inventory i on i.id = oi.inventory_id
    where oi.order_id = p_order
    order by i.id
    for update of i
  loop
    if not it.is_available or it.inv_qty - it.inv_res < it.quantity then
      raise exception 'PP409: stock insuffisant pour % (disponible : %, demandé : %)', it.product_label, greatest(it.inv_qty - it.inv_res, 0), it.quantity;
    end if;
    update public.pharmacy_inventory set reserved_quantity = reserved_quantity + it.quantity where id = it.inv_id;
    insert into public.stock_reservations (order_item_id, order_id, inventory_id, quantity, expires_at)
    values (it.item_id, p_order, it.inv_id, it.quantity, case when o.fulfillment = 'pickup' then now() + make_interval(mins => ttl) end);
    insert into public.inventory_movements (inventory_id, pharmacy_id, kind, reserved_delta, quantity_after, reserved_after, order_id, actor_id)
    values (it.inv_id, o.pharmacy_id, 'reservation', it.quantity, it.inv_qty, it.inv_res + it.quantity, p_order, uid);
  end loop;

  update public.orders set reservation_expires_at = case when o.fulfillment = 'pickup' then now() + make_interval(mins => ttl) end
   where id = p_order;
  perform public._set_order_status(p_order, 'confirmed', uid, p_reason);
  return 'confirmed';
end $$;

-- Transitions de statut avec matrice de droits
create or replace function public.advance_order(p_order uuid, p_to public.order_status, p_note text default null)
returns public.order_status language plpgsql security definer set search_path = public as $$
declare
  uid uuid := public.require_auth();
  o public.orders%rowtype;
  is_member boolean;
  is_customer boolean;
  is_courier boolean;
  admin boolean := public.is_admin();
  allowed boolean := false;
begin
  select * into o from public.orders where id = p_order for update;
  if o.id is null then raise exception 'PP404: commande introuvable'; end if;
  if o.status = p_to then return o.status; end if; -- idempotent
  if public.is_terminal_status(o.status) then raise exception 'PP409: commande clôturée (%)', public.order_status_label(o.status); end if;

  is_member := public.can_manage_pharmacy(o.pharmacy_id);
  is_customer := o.customer_id = uid;
  is_courier := exists (
    select 1 from public.delivery_assignments a join public.deliveries d on d.id = a.delivery_id
    join public.couriers c on c.user_id = a.courier_id
    where d.order_id = p_order and a.courier_id = uid and a.is_active and c.status = 'verified');

  if p_to in ('confirmed', 'rejected') then
    raise exception 'PP422: utilisez la réponse de la pharmacie pour confirmer ou refuser';
  end if;

  allowed := case
    -- Pharmacie
    when is_member and o.status = 'confirmed' and p_to = 'preparing' then true
    when is_member and o.status = 'preparing' and p_to = 'ready_for_pickup' and o.fulfillment = 'pickup' then true
    when is_member and o.status = 'preparing' and p_to = 'awaiting_courier' and o.fulfillment = 'delivery' then true
    when is_member and o.status = 'ready_for_pickup' and p_to = 'completed' then true
    when is_member and p_to = 'cancelled' and o.status in ('confirmed', 'preparing', 'ready_for_pickup', 'awaiting_courier') then true
    -- Client
    when is_customer and p_to = 'cancelled' and o.status in ('pending_confirmation', 'confirmed', 'preparing', 'ready_for_pickup', 'awaiting_courier') then true
    -- Livreur affecté et vérifié
    when is_courier and o.status = 'courier_assigned' and p_to = 'in_delivery' then true
    when is_courier and o.status = 'in_delivery' and p_to in ('delivered', 'delivery_failed') then true
    -- Administration (supervision des incidents)
    when admin and p_to = 'cancelled' then true
    when admin and o.status = 'in_delivery' and p_to = 'delivery_failed' then true
    else false
  end;

  if not allowed then
    raise exception 'PP403: transition « % » vers « % » non autorisée', public.order_status_label(o.status), public.order_status_label(p_to);
  end if;
  if p_to in ('cancelled', 'delivery_failed') and not is_customer and coalesce(trim(p_note), '') = '' then
    raise exception 'PP422: un motif est obligatoire';
  end if;
  if p_to = 'awaiting_courier' and not public.setting_bool('delivery_enabled', false) then
    raise exception 'PP422: la livraison est désactivée ; contactez le client pour un retrait';
  end if;

  perform public._set_order_status(p_order, p_to, uid, p_note);
  if admin and not (is_member or is_customer or is_courier) then
    perform public.log_audit('order.status', 'order', p_order::text, jsonb_build_object('from', o.status, 'to', p_to, 'note', p_note));
  end if;
  return p_to;
end $$;

-- Confirmation d'un paiement réellement reçu (jamais automatique)
create or replace function public.confirm_payment(p_order uuid)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_auth(); o public.orders%rowtype; ok boolean := false;
begin
  select * into o from public.orders where id = p_order for update;
  if o.id is null then raise exception 'PP404: commande introuvable'; end if;
  if o.payment_status = 'paid' then return; end if;
  if o.payment_method = 'pay_at_pharmacy' then
    ok := public.can_manage_pharmacy(o.pharmacy_id) and o.status in ('ready_for_pickup', 'completed');
  else
    ok := o.status in ('in_delivery', 'delivered') and exists (
      select 1 from public.delivery_assignments a join public.deliveries d on d.id = a.delivery_id
      where d.order_id = p_order and a.courier_id = uid and (a.is_active or o.status = 'delivered'));
  end if;
  if not ok then raise exception 'PP403: vous ne pouvez pas confirmer ce paiement à ce stade'; end if;
  update public.orders set payment_status = 'paid', paid_confirmed_at = now(), paid_confirmed_by = uid where id = p_order;
  insert into public.order_status_history (order_id, from_status, to_status, actor_id, note) values (p_order, o.status, o.status, uid, 'Paiement reçu confirmé');
end $$;

create or replace function public.admin_mark_refunded(p_order uuid, p_note text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  if coalesce(trim(p_note), '') = '' then raise exception 'PP422: précisez la référence du remboursement'; end if;
  update public.orders set payment_status = 'refunded' where id = p_order and payment_status = 'refund_pending';
  if not found then raise exception 'PP409: aucun remboursement en attente'; end if;
  perform public.log_audit('order.refunded', 'order', p_order::text, jsonb_build_object('note', p_note));
end $$;

-- Expiration des demandes non traitées et des réservations non retirées
create or replace function public.expire_overdue_orders()
returns int language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in
    select id, status from public.orders
    where (status = 'pending_confirmation' and confirmation_expires_at < now())
       or (status in ('confirmed', 'preparing', 'ready_for_pickup') and fulfillment = 'pickup' and reservation_expires_at < now())
    order by id
    for update skip locked
  loop
    perform public._set_order_status(r.id, 'expired', null,
      case when r.status = 'pending_confirmation' then 'Pas de réponse de la pharmacie dans le délai' else 'Réservation non retirée dans le délai' end);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.expire_overdue_orders() from public, anon, authenticated;

create or replace function public.admin_expire_overdue_orders()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform public.require_admin();
  n := public.expire_overdue_orders();
  perform public.log_audit('orders.expire_run', 'order', null, jsonb_build_object('expired', n));
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- Livreurs et livraisons
-- ---------------------------------------------------------------------------
create or replace function public.courier_apply(p_phone text, p_vehicle text, p_region uuid default null, p_commune uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_auth();
begin
  if not public.valid_phone(p_phone) then raise exception 'PP422: numéro de téléphone invalide (format +223XXXXXXXX)'; end if;
  insert into public.couriers (user_id, phone, vehicle, zone_region_id, zone_commune_id)
  values (uid, p_phone, p_vehicle, p_region, p_commune)
  on conflict (user_id) do update set phone = excluded.phone, vehicle = excluded.vehicle,
    zone_region_id = excluded.zone_region_id, zone_commune_id = excluded.zone_commune_id
  where public.couriers.status in ('pending', 'rejected');
  update public.couriers set status = 'pending' where user_id = uid and status = 'rejected';
end $$;

create or replace function public.admin_review_courier(p_user uuid, p_status public.courier_status, p_reason text default null, p_document_ref text default null)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_admin();
begin
  if p_status in ('rejected', 'suspended') and coalesce(trim(p_reason), '') = '' then raise exception 'PP422: motif obligatoire'; end if;
  if p_status = 'verified' and coalesce(trim(p_document_ref), '') = '' and not exists (select 1 from public.couriers where user_id = p_user and id_document_ref is not null) then
    raise exception 'PP422: indiquez la référence de la pièce d''identité vérifiée';
  end if;
  update public.couriers set status = p_status,
    verified_at = case when p_status = 'verified' then now() else verified_at end,
    verified_by = case when p_status = 'verified' then uid else verified_by end,
    id_document_ref = coalesce(nullif(trim(p_document_ref), ''), id_document_ref)
  where user_id = p_user;
  if not found then raise exception 'PP404: candidature introuvable'; end if;
  if p_status = 'verified' then
    insert into public.user_roles (user_id, role, granted_by) values (p_user, 'courier', uid) on conflict do nothing;
  else
    delete from public.user_roles where user_id = p_user and role = 'courier';
  end if;
  perform public.log_audit('courier.review', 'courier', p_user::text, jsonb_build_object('status', p_status, 'reason', p_reason));
  perform public.notify_user(p_user, 'courier_review', 'Statut livreur : ' || p_status::text, p_reason, null, '/livraison');
end $$;

create or replace function public.assign_courier(p_order uuid, p_courier uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  uid uuid := public.require_admin();
  o public.orders%rowtype;
  d public.deliveries%rowtype;
  c public.couriers%rowtype;
begin
  if not public.setting_bool('delivery_enabled', false) then raise exception 'PP422: la livraison est désactivée'; end if;
  select * into o from public.orders where id = p_order for update;
  if o.id is null or o.fulfillment <> 'delivery' then raise exception 'PP404: livraison introuvable'; end if;
  if o.status not in ('awaiting_courier', 'courier_assigned') then raise exception 'PP409: la commande n''attend pas de livreur'; end if;
  select * into c from public.couriers where user_id = p_courier;
  if c.user_id is null or c.status <> 'verified' or not exists (select 1 from public.user_roles where user_id = p_courier and role = 'courier') then
    raise exception 'PP422: livreur non habilité';
  end if;
  if not c.is_available then raise exception 'PP422: livreur indisponible'; end if;
  if exists (
    select 1 from public.order_items oi join public.medicine_catalog mc on mc.id = oi.catalog_id
    left join public.product_categories pc on pc.id = mc.category_id
    where oi.order_id = p_order and (oi.requires_prescription or not coalesce(pc.delivery_allowed, false))
  ) then
    raise exception 'PP422: cette commande contient un produit dont la livraison n''est pas autorisée';
  end if;
  select * into d from public.deliveries where order_id = p_order;
  update public.delivery_assignments set is_active = false, ended_at = now(), end_reason = 'réaffectation' where delivery_id = d.id and is_active;
  insert into public.delivery_assignments (delivery_id, courier_id, assigned_by) values (d.id, p_courier, uid);
  if o.status = 'awaiting_courier' then
    perform public._set_order_status(p_order, 'courier_assigned', uid, null);
  end if;
  perform public.notify_user(p_courier, 'delivery_assigned', 'Nouvelle livraison ' || o.reference,
    'Collecte à la pharmacie puis remise au client.', p_order, '/livraison/' || d.id);
  perform public.log_audit('delivery.assign', 'order', p_order::text, jsonb_build_object('courier', p_courier));
end $$;

create or replace function public.report_delivery_incident(p_delivery uuid, p_kind text, p_description text)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_auth();
begin
  if not (public.is_admin() or exists (select 1 from public.delivery_assignments where delivery_id = p_delivery and courier_id = uid and is_active)) then
    raise exception 'PP403: accès refusé';
  end if;
  insert into public.delivery_incidents (delivery_id, reported_by, kind, description) values (p_delivery, uid, p_kind, left(p_description, 500));
end $$;

-- ---------------------------------------------------------------------------
-- Administration
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_role(p_user uuid, p_role public.app_role, p_grant boolean)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_admin();
begin
  if p_user = uid and p_role = 'admin' and not p_grant then raise exception 'PP409: vous ne pouvez pas retirer votre propre rôle administrateur'; end if;
  if p_role = 'courier' then raise exception 'PP422: le rôle livreur est attribué via la validation des livreurs'; end if;
  if p_grant then
    insert into public.user_roles (user_id, role, granted_by) values (p_user, p_role, uid) on conflict do nothing;
  else
    delete from public.user_roles where user_id = p_user and role = p_role;
  end if;
  perform public.log_audit(case when p_grant then 'role.grant' else 'role.revoke' end, 'user', p_user::text, jsonb_build_object('role', p_role));
end $$;

create or replace function public.admin_update_setting(p_key text, p_value jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_admin(); old jsonb;
begin
  select value into old from public.platform_settings where key = p_key for update;
  if not found then raise exception 'PP404: paramètre inconnu'; end if;
  if jsonb_typeof(old) <> jsonb_typeof(p_value) then raise exception 'PP422: type de valeur invalide'; end if;
  if jsonb_typeof(p_value) = 'number' and (p_value #>> '{}')::numeric < 0 then raise exception 'PP422: valeur négative'; end if;
  update public.platform_settings set value = p_value, updated_at = now(), updated_by = uid where key = p_key;
  perform public.log_audit('setting.update', 'setting', p_key, jsonb_build_object('from', old, 'to', p_value));
end $$;

create or replace function public.admin_review_catalog_item(p_catalog uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  if p_status not in ('approved', 'rejected', 'pending') then raise exception 'PP422: statut invalide'; end if;
  update public.medicine_catalog set review_status = p_status where id = p_catalog;
  perform public.log_audit('catalog.review', 'catalog', p_catalog::text, jsonb_build_object('status', p_status));
end $$;

create or replace function public.catalog_duplicate_candidates(p_threshold real default 0.55, p_limit int default 50)
returns table (a_id uuid, a_label text, b_id uuid, b_label text, score real)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  perform public.require_admin();
  return query
  select a.id, a.brand_name || coalesce(' ' || a.dosage, '') || coalesce(' ' || a.form, ''),
         b.id, b.brand_name || coalesce(' ' || b.dosage, '') || coalesce(' ' || b.form, ''),
         similarity(a.search_text, b.search_text)
  from public.medicine_catalog a
  join public.medicine_catalog b on a.id < b.id and a.search_text % b.search_text
  where a.merged_into is null and b.merged_into is null and a.review_status <> 'rejected' and b.review_status <> 'rejected'
    and similarity(a.search_text, b.search_text) >= p_threshold
    and public.normalize_text(coalesce(a.dosage, '')) = public.normalize_text(coalesce(b.dosage, ''))
  order by 5 desc
  limit least(greatest(p_limit, 1), 200);
end $$;

-- Fusion de doublons : déplace les stocks vers la fiche conservée
create or replace function public.admin_merge_catalog(p_keep uuid, p_remove uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r record; kept record;
begin
  perform public.require_admin();
  if p_keep = p_remove then raise exception 'PP422: fiches identiques'; end if;
  if not exists (select 1 from public.medicine_catalog where id = p_keep and merged_into is null) then raise exception 'PP404: fiche de référence invalide'; end if;
  for r in select * from public.pharmacy_inventory where catalog_id = p_remove order by id for update loop
    if r.reserved_quantity > 0 then raise exception 'PP409: des réservations actives existent sur la fiche à fusionner'; end if;
    select * into kept from public.pharmacy_inventory where pharmacy_id = r.pharmacy_id and catalog_id = p_keep for update;
    if kept.id is null then
      update public.pharmacy_inventory set catalog_id = p_keep where id = r.id;
    else
      update public.pharmacy_inventory
         set quantity = kept.quantity + r.quantity,
             price_xof = coalesce(kept.price_xof, r.price_xof),
             stock_updated_at = greatest(kept.stock_updated_at, r.stock_updated_at)
       where id = kept.id;
      insert into public.inventory_movements (inventory_id, pharmacy_id, kind, quantity_delta, quantity_after, reserved_after, note, actor_id)
      values (kept.id, r.pharmacy_id, 'correction', r.quantity, kept.quantity + r.quantity, kept.reserved_quantity, 'Fusion de fiches catalogue', auth.uid());
      if exists (select 1 from public.order_items where inventory_id = r.id) then
        update public.pharmacy_inventory set quantity = 0, is_available = false where id = r.id;
      else
        delete from public.pharmacy_inventory where id = r.id;
      end if;
    end if;
  end loop;
  update public.medicine_identifiers set catalog_id = p_keep where catalog_id = p_remove
    and not exists (select 1 from public.medicine_identifiers x where x.catalog_id = p_keep and x.id_type = medicine_identifiers.id_type);
  update public.medicine_catalog set merged_into = p_keep where id = p_remove;
  perform public.log_audit('catalog.merge', 'catalog', p_remove::text, jsonb_build_object('into', p_keep));
end $$;

-- Statistiques calculées sur les données réelles
create or replace function public.admin_stats(p_from timestamptz default now() - interval '30 days', p_to timestamptz default now(), p_region uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare res jsonb;
begin
  perform public.require_admin();
  select jsonb_build_object(
    'pharmacies_registered', (select count(*) from public.pharmacies where (p_region is null or region_id = p_region) and not is_demo),
    'pharmacies_verified', (select count(*) from public.pharmacies where status = 'verified' and (p_region is null or region_id = p_region) and not is_demo),
    'pharmacies_pending', (select count(*) from public.pharmacies where status = 'pending' and (p_region is null or region_id = p_region)),
    'pharmacies_active', (select count(distinct i.pharmacy_id) from public.pharmacy_inventory i join public.pharmacies p on p.id = i.pharmacy_id
                          where p.status = 'verified' and i.stock_updated_at >= now() - interval '7 days' and (p_region is null or p.region_id = p_region) and not p.is_demo),
    'catalog_items', (select count(*) from public.medicine_catalog where merged_into is null and review_status <> 'rejected'),
    'catalog_pending', (select count(*) from public.medicine_catalog where merged_into is null and review_status = 'pending'),
    'inventory_lines', (select count(*) from public.pharmacy_inventory i join public.pharmacies p on p.id = i.pharmacy_id where (p_region is null or p.region_id = p_region)),
    'inventory_fresh', (select count(*) from public.pharmacy_inventory i join public.pharmacies p on p.id = i.pharmacy_id
                        where i.stock_updated_at >= now() - make_interval(hours => public.setting_int('stock_fresh_hours', 24)) and (p_region is null or p.region_id = p_region)),
    'searches', (select count(*) from public.search_logs where created_at between p_from and p_to and (p_region is null or region_id = p_region)),
    'searches_no_result', (select count(*) from public.search_logs where result_count = 0 and created_at between p_from and p_to and (p_region is null or region_id = p_region)),
    'top_no_result_queries', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select query_normalized as query, count(*) as n from public.search_logs
        where result_count = 0 and created_at between p_from and p_to and (p_region is null or region_id = p_region)
        group by 1 order by 2 desc limit 10) x),
    'orders_by_status', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) from (
        select o.status, count(*) as n from public.orders o join public.pharmacies p on p.id = o.pharmacy_id
        where o.created_at between p_from and p_to and (p_region is null or p.region_id = p_region) group by 1) x),
    'orders_total', (select count(*) from public.orders o join public.pharmacies p on p.id = o.pharmacy_id
        where o.created_at between p_from and p_to and (p_region is null or p.region_id = p_region)),
    'pharmacies_by_region', (select coalesce(jsonb_agg(x order by x.verified desc), '[]'::jsonb) from (
        select r.name as region, count(p.id) filter (where p.status = 'verified') as verified, count(p.id) as registered
        from public.regions r left join public.pharmacies p on p.region_id = r.id and not p.is_demo
        group by r.name) x),
    'open_reports', (select count(*) from public.reports where status in ('open', 'in_review')),
    'couriers_verified', (select count(*) from public.couriers where status = 'verified'),
    'couriers_pending', (select count(*) from public.couriers where status = 'pending')
  ) into res;
  return res;
end $$;

-- Accès exceptionnel et journalisé à la note privée d'une commande
create or replace function public.admin_read_order_note(p_order uuid, p_justification text)
returns text language plpgsql security definer set search_path = public as $$
declare n text;
begin
  perform public.require_admin();
  if coalesce(char_length(trim(p_justification)), 0) < 15 then raise exception 'PP422: justification détaillée obligatoire (15 caractères minimum)'; end if;
  select customer_note into n from public.order_private_notes where order_id = p_order;
  perform public.log_audit('sensitive.order_note_read', 'order', p_order::text, jsonb_build_object('justification', p_justification));
  return n;
end $$;

-- Pharmacien : fiches utilisateurs des membres (nom du client pour une commande)
create or replace function public.order_customer_contact(p_order uuid)
returns table (full_name text, phone text) language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from public.orders o where o.id = p_order and (public.is_pharmacy_member(o.pharmacy_id) or exists (
      select 1 from public.delivery_assignments a join public.deliveries d on d.id = a.delivery_id where d.order_id = o.id and a.courier_id = auth.uid() and a.is_active))) then
    raise exception 'PP403: accès refusé';
  end if;
  return query select p.full_name, p.phone from public.orders o join public.profiles p on p.id = o.customer_id where o.id = p_order;
end $$;

-- ---------------------------------------------------------------------------
-- Compte : suppression (anonymisation ; l'historique des commandes est conservé)
-- ---------------------------------------------------------------------------
create or replace function public.request_account_deletion()
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_auth();
begin
  if exists (select 1 from public.orders where customer_id = uid and not public.is_terminal_status(status)) then
    raise exception 'PP409: des commandes sont en cours ; annulez-les ou attendez leur clôture';
  end if;
  if exists (select 1 from public.pharmacy_members where user_id = uid) then
    raise exception 'PP409: compte professionnel : contactez l''administration pour clôturer la pharmacie';
  end if;
  delete from public.customer_addresses where user_id = uid;
  delete from public.notifications where user_id = uid;
  delete from public.user_roles where user_id = uid;
  update public.couriers set status = 'suspended', is_available = false where user_id = uid;
  update public.profiles set full_name = null, phone = null, preferred_region_id = null, preferred_commune_id = null,
         deletion_requested_at = now(), deleted_at = now() where id = uid;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id) values (uid, 'account.delete', 'user', uid::text);
end $$;

-- Premier administrateur : à exécuter depuis l'éditeur SQL Supabase (rôle postgres)
create or replace function public.bootstrap_admin(p_email text)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  select id into uid from auth.users where lower(email) = lower(p_email);
  if uid is null then raise exception 'Utilisateur introuvable : créez d''abord le compte via l''inscription'; end if;
  insert into public.user_roles (user_id, role) values (uid, 'admin') on conflict do nothing;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id) values (null, 'role.bootstrap_admin', 'user', uid::text);
end $$;
revoke execute on function public.bootstrap_admin(text) from public, anon, authenticated;

-- Les fonctions internes ne sont pas exposées
revoke execute on function public.notify_user(uuid, text, text, text, uuid, text) from public, anon, authenticated;
revoke execute on function public.notify_pharmacy(uuid, text, text, text, uuid, text) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- >>> 20261010000500_rls_policies.sql
-- ============================================================================
-- PharmaProxi — Migration 0005 : Row Level Security
-- Principe : tout est fermé par défaut. Les lectures publiques sont limitées
-- aux données non sensibles des pharmacies vérifiées. Les écritures sensibles
-- (commandes, statuts, réservations, vérifications) passent exclusivement par
-- les fonctions de la migration 0004 : aucune politique INSERT/UPDATE directe
-- n'est accordée sur ces tables.
-- ============================================================================

do $$
declare t text;
begin
  foreach t in array array[
    'platform_settings','regions','circles','communes','localities','profiles','user_roles','audit_logs','content_pages',
    'pharmacies','pharmacy_private','pharmacy_members','pharmacy_documents','pharmacy_verifications',
    'product_categories','medicine_catalog','medicine_identifiers','pharmacy_inventory','inventory_batches','inventory_movements',
    'customer_addresses','couriers','orders','order_private_notes','order_items','stock_reservations','order_status_history',
    'deliveries','delivery_assignments','delivery_incidents','notifications','notification_outbox','reports','search_logs'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Helpers supplémentaires
create or replace function public.is_assigned_courier_for_order(p_order uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.delivery_assignments a join public.deliveries d on d.id = a.delivery_id
    where d.order_id = p_order and a.courier_id = auth.uid()
      and (a.is_active or a.ended_at > now() - interval '24 hours'))
$$;

create or replace function public.can_see_order(p_order uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.orders o where o.id = p_order and (
      o.customer_id = auth.uid() or public.is_pharmacy_member(o.pharmacy_id) or public.is_admin()
      or public.is_assigned_courier_for_order(o.id)))
$$;

-- ---------------------------------------------------------------------------
-- Référentiels publics
-- ---------------------------------------------------------------------------
create policy "lecture publique" on public.platform_settings for select using (true);

create policy "lecture publique" on public.regions for select using (true);
create policy "admin écrit" on public.regions for all using (public.is_admin()) with check (public.is_admin());
create policy "lecture publique" on public.circles for select using (true);
create policy "admin écrit" on public.circles for all using (public.is_admin()) with check (public.is_admin());
create policy "lecture publique" on public.communes for select using (true);
create policy "admin écrit" on public.communes for all using (public.is_admin()) with check (public.is_admin());
create policy "lecture publique" on public.localities for select using (true);
create policy "admin écrit" on public.localities for all using (public.is_admin()) with check (public.is_admin());

create policy "lecture publique" on public.content_pages for select using (published or public.is_admin());
create policy "admin écrit" on public.content_pages for all using (public.is_admin()) with check (public.is_admin());

create policy "lecture publique" on public.product_categories for select using (true);
create policy "admin écrit" on public.product_categories for all using (public.is_admin()) with check (public.is_admin());

create policy "lecture catalogue" on public.medicine_catalog for select
  using (review_status <> 'rejected' or public.is_admin() or created_by = auth.uid());
create policy "admin met à jour" on public.medicine_catalog for update using (public.is_admin()) with check (public.is_admin());

create policy "lecture publique" on public.medicine_identifiers for select using (true);
create policy "admin écrit" on public.medicine_identifiers for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Profils et rôles
-- ---------------------------------------------------------------------------
create policy "soi-même ou admin" on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy "mise à jour de soi" on public.profiles for update
  using (id = auth.uid() and deleted_at is null)
  with check (id = auth.uid() and deleted_at is null); -- is_demo et deleted_at protégés par profiles_guard

-- Empêche un utilisateur de modifier les champs de suppression ou de démo
create or replace function public.profiles_guard()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') and not public.is_admin() then
    new.deleted_at := old.deleted_at;
    new.deletion_requested_at := old.deletion_requested_at;
    new.is_demo := old.is_demo;
  end if;
  return new;
end $$;
create trigger profiles_guard before update on public.profiles for each row execute function public.profiles_guard();

create policy "soi-même ou admin" on public.user_roles for select using (user_id = auth.uid() or public.is_admin());

create policy "admin lit" on public.audit_logs for select using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Pharmacies
-- ---------------------------------------------------------------------------
create policy "lecture publique des pharmacies vérifiées" on public.pharmacies for select
  using (status = 'verified' or public.is_pharmacy_member(id) or public.is_admin());
create policy "membres mettent à jour" on public.pharmacies for update
  using (public.can_manage_pharmacy(id) or public.is_admin())
  with check (public.can_manage_pharmacy(id) or public.is_admin());

create policy "membres et admin" on public.pharmacy_private for select using (public.is_pharmacy_member(pharmacy_id) or public.is_admin());
create policy "membres mettent à jour" on public.pharmacy_private for update
  using (public.can_manage_pharmacy(pharmacy_id)) with check (public.can_manage_pharmacy(pharmacy_id));

create policy "membres et admin" on public.pharmacy_members for select using (user_id = auth.uid() or public.is_pharmacy_member(pharmacy_id) or public.is_admin());

create policy "membres et admin" on public.pharmacy_documents for select using (public.is_pharmacy_member(pharmacy_id) or public.is_admin());
create policy "membres déposent" on public.pharmacy_documents for insert
  with check (public.can_manage_pharmacy(pharmacy_id) and uploaded_by = auth.uid()
              and storage_path like pharmacy_id::text || '/%');
create policy "membres retirent si en attente" on public.pharmacy_documents for delete
  using (public.is_pharmacy_member(pharmacy_id) and exists (select 1 from public.pharmacies p where p.id = pharmacy_id and p.status in ('pending', 'rejected')));

create policy "membres et admin" on public.pharmacy_verifications for select using (public.is_pharmacy_member(pharmacy_id) or public.is_admin());

-- ---------------------------------------------------------------------------
-- Stocks : réservés aux membres de la pharmacie et à l'administration.
-- Le public passe par search_inventory / pharmacy_public_inventory (sans quantités).
-- ---------------------------------------------------------------------------
create policy "membres et admin" on public.pharmacy_inventory for select using (public.is_pharmacy_member(pharmacy_id) or public.is_admin());
-- Mise à jour directe limitée au seuil d'alerte ; quantités et prix via set_inventory()
create policy "membres mettent à jour" on public.pharmacy_inventory for update
  using (public.can_manage_pharmacy(pharmacy_id)) with check (public.can_manage_pharmacy(pharmacy_id));

create or replace function public.inventory_guard()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and current_user in ('authenticated', 'anon') then
    if new.quantity is distinct from old.quantity or new.reserved_quantity is distinct from old.reserved_quantity
       or new.price_xof is distinct from old.price_xof or new.pharmacy_id is distinct from old.pharmacy_id
       or new.catalog_id is distinct from old.catalog_id or new.stock_updated_at is distinct from old.stock_updated_at
       or new.is_demo is distinct from old.is_demo then
      raise exception 'PP403: utilisez la mise à jour de stock dédiée';
    end if;
  end if;
  return new;
end $$;
create trigger inventory_guard before update on public.pharmacy_inventory for each row execute function public.inventory_guard();

create policy "membres et admin" on public.inventory_batches for select
  using (exists (select 1 from public.pharmacy_inventory i where i.id = inventory_id and (public.is_pharmacy_member(i.pharmacy_id) or public.is_admin())));
create policy "membres gèrent" on public.inventory_batches for all
  using (exists (select 1 from public.pharmacy_inventory i where i.id = inventory_id and public.can_manage_pharmacy(i.pharmacy_id)))
  with check (exists (select 1 from public.pharmacy_inventory i where i.id = inventory_id and public.can_manage_pharmacy(i.pharmacy_id)));

create policy "membres et admin" on public.inventory_movements for select using (public.is_pharmacy_member(pharmacy_id) or public.is_admin());

-- ---------------------------------------------------------------------------
-- Clients
-- ---------------------------------------------------------------------------
create policy "propriétaire" on public.customer_addresses for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Commandes (lecture seule ; écriture via fonctions)
-- ---------------------------------------------------------------------------
create policy "parties prenantes" on public.orders for select
  using (customer_id = auth.uid() or public.is_pharmacy_member(pharmacy_id) or public.is_admin() or public.is_assigned_courier_for_order(id));

-- Note privée : client et pharmacie uniquement (l'admin passe par admin_read_order_note, journalisé)
create policy "client et pharmacie" on public.order_private_notes for select
  using (exists (select 1 from public.orders o where o.id = order_id and (o.customer_id = auth.uid() or public.is_pharmacy_member(o.pharmacy_id))));

create policy "parties prenantes" on public.order_items for select using (public.can_see_order(order_id));
create policy "parties prenantes" on public.order_status_history for select using (public.can_see_order(order_id));
create policy "pharmacie et admin" on public.stock_reservations for select
  using (exists (select 1 from public.orders o where o.id = order_id and (public.is_pharmacy_member(o.pharmacy_id) or public.is_admin())));

-- ---------------------------------------------------------------------------
-- Livraison
-- ---------------------------------------------------------------------------
create policy "soi-même ou admin" on public.couriers for select using (user_id = auth.uid() or public.is_admin());
create policy "disponibilité" on public.couriers for update
  using (user_id = auth.uid() and status = 'verified') with check (user_id = auth.uid() and status = 'verified');

create or replace function public.couriers_guard()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.status is distinct from old.status or new.verified_at is distinct from old.verified_at
       or new.verified_by is distinct from old.verified_by or new.id_document_ref is distinct from old.id_document_ref
       or new.is_demo is distinct from old.is_demo then
      if current_user in ('authenticated', 'anon') then raise exception 'PP403: champ réservé à l''administration'; end if;
    end if;
  end if;
  return new;
end $$;
create trigger couriers_guard before update on public.couriers for each row execute function public.couriers_guard();

create policy "parties prenantes" on public.deliveries for select using (public.can_see_order(order_id));
create policy "livreur et admin" on public.delivery_assignments for select
  using (courier_id = auth.uid() or public.is_admin()
         or exists (select 1 from public.deliveries d join public.orders o on o.id = d.order_id
                    where d.id = delivery_id and (o.customer_id = auth.uid() or public.is_pharmacy_member(o.pharmacy_id))));
create policy "livreur et admin" on public.delivery_incidents for select
  using (reported_by = auth.uid() or public.is_admin()
         or exists (select 1 from public.deliveries d join public.orders o on o.id = d.order_id
                    where d.id = delivery_id and public.is_pharmacy_member(o.pharmacy_id)));

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
create policy "destinataire" on public.notifications for select using (user_id = auth.uid());
create policy "destinataire marque comme lu" on public.notifications for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "destinataire supprime" on public.notifications for delete using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Signalements
-- ---------------------------------------------------------------------------
create policy "auteur, pharmacie concernée, admin" on public.reports for select
  using (reporter_id = auth.uid() or public.is_admin() or (pharmacy_id is not null and public.is_pharmacy_member(pharmacy_id)));
create policy "utilisateur connecté signale" on public.reports for insert
  with check (auth.uid() is not null and reporter_id = auth.uid() and status = 'open' and handled_by is null and resolution_note is null);
create policy "admin traite" on public.reports for update using (public.is_admin()) with check (public.is_admin());

-- search_logs, notification_outbox : aucun accès direct (fonctions uniquement)
create policy "admin lit" on public.search_logs for select using (public.is_admin());
create policy "admin lit" on public.notification_outbox for select using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Privilèges : l'anonyme ne peut que lire. Les tables écrites par fonctions
-- n'accordent aucune écriture directe.
-- ---------------------------------------------------------------------------
revoke insert, update, delete, truncate on all tables in schema public from anon;
revoke truncate on all tables in schema public from authenticated;
revoke insert, update, delete on public.orders, public.order_items, public.stock_reservations, public.order_status_history,
  public.deliveries, public.delivery_assignments, public.delivery_incidents, public.inventory_movements, public.audit_logs,
  public.search_logs, public.notification_outbox, public.pharmacy_verifications, public.user_roles, public.order_private_notes,
  public.platform_settings, public.pharmacy_members
from authenticated;
revoke insert, delete on public.pharmacies, public.pharmacy_private, public.pharmacy_inventory, public.couriers, public.profiles from authenticated;
revoke insert, delete on public.medicine_catalog from authenticated;
revoke all on public.pharmacy_private, public.customer_addresses, public.notifications, public.audit_logs from anon;

-- >>> 20261010000600_storage_reference_data.sql
-- ============================================================================
-- PharmaProxi — Migration 0006 : stockage privé des justificatifs et
-- données de référence (géographie officielle de premier niveau, catégories,
-- pages d'information).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Bucket privé « pharmacy-documents » : chemin = <pharmacy_id>/<fichier>
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pharmacy-documents', 'pharmacy-documents', false, 5242880, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "pp_docs_member_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'pharmacy-documents'
              and public.can_manage_pharmacy(((storage.foldername(name))[1])::uuid));
create policy "pp_docs_member_or_admin_select" on storage.objects for select to authenticated
  using (bucket_id = 'pharmacy-documents'
         and (public.is_pharmacy_member(((storage.foldername(name))[1])::uuid) or public.is_admin()));
create policy "pp_docs_member_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'pharmacy-documents'
         and public.is_pharmacy_member(((storage.foldername(name))[1])::uuid)
         and exists (select 1 from public.pharmacies p where p.id = ((storage.foldername(name))[1])::uuid and p.status in ('pending', 'rejected')));

-- ---------------------------------------------------------------------------
-- Régions du Mali — Loi n°2023-006 du 13 mars 2023 (19 régions + District de Bamako).
-- À confronter à la nomenclature officielle à jour avant le lancement.
-- Les cercles, communes et quartiers sont importés par l'administration
-- (aucune donnée inventée), à l'exception des six communes du District de
-- Bamako, établies de longue date.
-- ---------------------------------------------------------------------------
insert into public.regions (country_code, name, code, is_district, source) values
  ('ML', 'District de Bamako', 'BKO', true,  'Loi n°2023-006 du 13 mars 2023'),
  ('ML', 'Kayes',       null, false, 'Loi n°2023-006 du 13 mars 2023'),
  ('ML', 'Koulikoro',   null, false, 'Loi n°2023-006 du 13 mars 2023'),
  ('ML', 'Sikasso',     null, false, 'Loi n°2023-006 du 13 mars 2023'),
  ('ML', 'Ségou',       null, false, 'Loi n°2023-006 du 13 mars 2023'),
  ('ML', 'Mopti',       null, false, 'Loi n°2023-006 du 13 mars 2023'),
  ('ML', 'Tombouctou',  null, false, 'Loi n°2023-006 du 13 mars 2023'),
  ('ML', 'Gao',         null, false, 'Loi n°2023-006 du 13 mars 2023'),
  ('ML', 'Kidal',       null, false, 'Loi n°2023-006 du 13 mars 2023'),
  ('ML', 'Taoudénit',   null, false, 'Loi n°2023-006 du 13 mars 2023'),
  ('ML', 'Ménaka',      null, false, 'Loi n°2023-006 du 13 mars 2023'),
  ('ML', 'Bougouni',    null, false, 'Loi n°2023-006 du 13 mars 2023'),
  ('ML', 'Dioïla',      null, false, 'Loi n°2023-006 du 13 mars 2023'),
  ('ML', 'Nioro',       null, false, 'Loi n°2023-006 du 13 mars 2023'),
  ('ML', 'Koutiala',    null, false, 'Loi n°2023-006 du 13 mars 2023'),
  ('ML', 'Kita',        null, false, 'Loi n°2023-006 du 13 mars 2023'),
  ('ML', 'Nara',        null, false, 'Loi n°2023-006 du 13 mars 2023'),
  ('ML', 'Bandiagara',  null, false, 'Loi n°2023-006 du 13 mars 2023'),
  ('ML', 'San',         null, false, 'Loi n°2023-006 du 13 mars 2023'),
  ('ML', 'Douentza',    null, false, 'Loi n°2023-006 du 13 mars 2023')
on conflict (country_code, name) do nothing;

insert into public.communes (region_id, circle_id, name, source)
select r.id, null, c.name, 'Communes du District de Bamako'
from public.regions r
cross join (values ('Commune I'), ('Commune II'), ('Commune III'), ('Commune IV'), ('Commune V'), ('Commune VI')) as c(name)
where r.name = 'District de Bamako'
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Catégories de produits — livraison désactivée par défaut pour toutes.
-- L'administration active la livraison catégorie par catégorie après
-- vérification réglementaire.
-- ---------------------------------------------------------------------------
insert into public.product_categories (name, description, is_authorized, delivery_allowed, requires_prescription) values
  ('Médicaments sans ordonnance', 'Spécialités disponibles sans prescription (liste à valider selon la réglementation malienne).', true, false, false),
  ('Médicaments sur ordonnance', 'Retrait en pharmacie uniquement, sur présentation de l''ordonnance. Jamais livrés automatiquement.', true, false, true),
  ('Parapharmacie et hygiène', 'Produits d''hygiène, soins, puériculture.', true, false, false),
  ('Dispositifs médicaux', 'Thermomètres, pansements, tensiomètres…', true, false, false),
  ('Produits stupéfiants et psychotropes', 'Non référencés sur la plateforme.', false, false, true)
on conflict (name) do nothing;

-- ---------------------------------------------------------------------------
-- Pages d'information (éditables par l'administration)
-- ---------------------------------------------------------------------------
insert into public.content_pages (slug, title, body) values
('securite', 'Bon usage et sécurité',
'PharmaProxi aide à localiser des pharmacies et à connaître les disponibilités qu''elles déclarent. La plateforme ne pose aucun diagnostic et ne recommande aucun médicament.

- Demandez toujours conseil à un pharmacien ou à un médecin avant de prendre un médicament.
- Les médicaments soumis à ordonnance ne sont délivrés qu''en pharmacie, sur présentation de l''ordonnance.
- Méfiez-vous des médicaments vendus hors des pharmacies (marchés, vendeurs ambulants) : ils peuvent être falsifiés ou mal conservés.
- Une disponibilité affichée est une déclaration de la pharmacie à une date donnée. Vérifiez la date d''actualisation et demandez confirmation avant de vous déplacer.
- En cas d''urgence, contactez immédiatement les services d''urgence ou rendez-vous au centre de santé le plus proche.'),
('confidentialite', 'Politique de confidentialité',
'Version provisoire — à faire valider par un juriste au regard de la loi malienne sur la protection des données à caractère personnel et des exigences de l''autorité de protection des données (APDP).

Données collectées : nom, téléphone, adresse e-mail, adresses de livraison, historique des commandes. Aucune donnée médicale n''est demandée ; ne saisissez pas d''informations de santé dans les notes.
Finalités : mise en relation avec les pharmacies, suivi des commandes, sécurité de la plateforme.
Destinataires : la pharmacie choisie et, en cas de livraison, le livreur affecté reçoivent uniquement les informations nécessaires.
Les recherches sont enregistrées de manière anonyme à des fins statistiques.
Conservation : les commandes sont conservées pour la durée légale applicable ; la suppression du compte anonymise le profil.
Droits : accès, rectification, suppression depuis votre espace « Mon compte » ou en écrivant au contact de la plateforme.'),
('conditions', 'Conditions d''utilisation',
'Version provisoire — à faire valider juridiquement avant le lancement.

PharmaProxi est un service de mise en relation. Les pharmacies restent seules responsables des informations qu''elles publient (stocks, prix, horaires) et de la dispensation des médicaments.
Une demande de réservation n''engage la pharmacie qu''après sa confirmation. Le paiement s''effectue directement à la pharmacie ou au livreur ; la plateforme n''encaisse aucun paiement dans cette version.
Tout usage frauduleux, toute tentative d''obtenir un médicament sans ordonnance lorsque celle-ci est requise, ou toute fausse déclaration entraîne la suspension du compte.'),
('contact', 'Contact',
'Pour toute question, signalement ou demande relative à vos données : renseignez ici l''adresse e-mail et le numéro de téléphone officiels de PharmaProxi (à compléter par l''administration).')
on conflict (slug) do nothing;

-- >>> 20261010000700_demo_data_functions.sql
-- ============================================================================
-- PharmaProxi — Migration 0007 : installation / suppression des données de
-- démonstration. Toutes les lignes créées portent is_demo = true et les
-- pharmacies sont nommées « Pharmacie DÉMO … ». Aucune ne correspond à une
-- pharmacie réelle ; les prix et quantités sont fictifs.
-- Fonctions exécutables uniquement par service_role (script npm run demo:*).
-- ============================================================================

create or replace function public.demo_install(p_users jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  u_admin uuid := (p_users ->> 'admin')::uuid;
  u_ph1 uuid := (p_users ->> 'pharmacist1')::uuid;
  u_ph2 uuid := (p_users ->> 'pharmacist2')::uuid;
  u_cust uuid := (p_users ->> 'customer')::uuid;
  u_cour uuid := (p_users ->> 'courier')::uuid;
  r_bko uuid; c3 uuid; c4 uuid; c6 uuid; r_seg uuid; c_seg uuid;
  l1 uuid; l2 uuid; l3 uuid; l4 uuid;
  ph1 uuid; ph2 uuid; ph3 uuid;
  cat_otc uuid; cat_rx uuid; cat_para uuid;
  m record; inv1 uuid; o1 uuid; addr uuid;
  hours jsonb := '{"mon":[["08:00","22:00"]],"tue":[["08:00","22:00"]],"wed":[["08:00","22:00"]],"thu":[["08:00","22:00"]],"fri":[["08:00","22:00"]],"sat":[["08:00","22:00"]],"sun":[["09:00","13:00"]]}';
begin
  if exists (select 1 from public.pharmacies where is_demo) then
    raise exception 'Les données de démonstration sont déjà installées';
  end if;

  update public.profiles set is_demo = true where id in (u_admin, u_ph1, u_ph2, u_cust, u_cour);
  update public.profiles set full_name = 'Admin Démo' where id = u_admin;
  update public.profiles set full_name = 'Pharmacien Démo 1', phone = '+22370000001' where id = u_ph1;
  update public.profiles set full_name = 'Pharmacien Démo 2', phone = '+22370000002' where id = u_ph2;
  update public.profiles set full_name = 'Client Démo', phone = '+22370000003' where id = u_cust;
  update public.profiles set full_name = 'Livreur Démo', phone = '+22370000004' where id = u_cour;
  insert into public.user_roles (user_id, role) values (u_admin, 'admin'), (u_ph1, 'pharmacist'), (u_ph2, 'pharmacist'), (u_cour, 'courier')
  on conflict do nothing;

  -- Géographie de test (quartiers fictifs ; région de démonstration distincte)
  select id into r_bko from public.regions where name = 'District de Bamako';
  select id into c3 from public.communes where region_id = r_bko and name = 'Commune III';
  select id into c4 from public.communes where region_id = r_bko and name = 'Commune IV';
  select id into c6 from public.communes where region_id = r_bko and name = 'Commune VI';
  insert into public.localities (commune_id, name, is_demo) values (c3, 'Quartier Démo A', true) returning id into l1;
  insert into public.localities (commune_id, name, is_demo) values (c4, 'Quartier Démo B', true) returning id into l2;
  insert into public.localities (commune_id, name, is_demo) values (c6, 'Quartier Démo C', true) returning id into l3;
  select id into r_seg from public.regions where name = 'Ségou';
  insert into public.communes (region_id, name, is_demo, source) values (r_seg, 'Commune Démo de Ségou', true, 'DÉMO') returning id into c_seg;
  insert into public.localities (commune_id, name, is_demo) values (c_seg, 'Quartier Démo D', true) returning id into l4;

  -- Pharmacies fictives (coordonnées approximatives, uniquement pour la démonstration)
  insert into public.pharmacies (name, status, address, region_id, commune_id, locality_id, latitude, longitude, phone, opening_hours, hours_verified, offers_pickup, offers_delivery, verified_at, is_demo, created_by)
  values ('Pharmacie DÉMO du Fleuve', 'verified', 'Adresse de démonstration n°1', r_bko, c3, l1, 12.6450, -8.0000, '+22370000101', hours, true, true, true, now(), true, u_ph1)
  returning id into ph1;
  insert into public.pharmacies (name, status, address, region_id, commune_id, locality_id, latitude, longitude, phone, opening_hours, hours_verified, offers_pickup, offers_delivery, verified_at, is_demo, created_by)
  values ('Pharmacie DÉMO des Collines', 'verified', 'Adresse de démonstration n°2', r_bko, c4, l2, 12.6300, -8.0300, '+22370000102', hours, false, true, false, now(), true, u_ph2)
  returning id into ph2;
  insert into public.pharmacies (name, status, address, region_id, commune_id, locality_id, latitude, longitude, phone, opening_hours, hours_verified, offers_pickup, offers_delivery, is_demo, created_by)
  values ('Pharmacie DÉMO en attente', 'pending', 'Adresse de démonstration n°3', r_seg, c_seg, l4, null, null, '+22370000103', '{}'::jsonb, false, true, false, true, u_ph2)
  returning id into ph3;

  insert into public.pharmacy_private (pharmacy_id, pharmacist_in_charge, license_number) values
    (ph1, 'Pharmacien Démo 1', 'DEMO-0001'), (ph2, 'Pharmacien Démo 2', 'DEMO-0002'), (ph3, 'Pharmacien Démo 2', 'DEMO-0003');
  insert into public.pharmacy_members (pharmacy_id, user_id, member_role) values (ph1, u_ph1, 'owner'), (ph2, u_ph2, 'owner'), (ph3, u_ph2, 'owner');
  insert into public.pharmacy_verifications (pharmacy_id, decision, reason, reviewer_id) values
    (ph1, 'verified', 'Données de démonstration', u_admin), (ph2, 'verified', 'Données de démonstration', u_admin),
    (ph3, 'pending', 'Données de démonstration', u_ph2);

  select id into cat_otc from public.product_categories where name = 'Médicaments sans ordonnance';
  select id into cat_rx from public.product_categories where name = 'Médicaments sur ordonnance';
  select id into cat_para from public.product_categories where name = 'Parapharmacie et hygiène';
  update public.product_categories set delivery_allowed = true where id in (cat_otc, cat_para) and delivery_allowed = false;
  insert into public.platform_settings (key, value, description)
  values ('demo_enabled_delivery', 'true', 'Livraison activée par le script de démonstration ; remise à false à la désinstallation.')
  on conflict (key) do nothing;
  update public.platform_settings set value = 'true' where key = 'delivery_enabled';

  -- Produits de démonstration (dénominations génériques ; prix et stocks fictifs)
  for m in select * from (values
      ('DÉMO Paracétamol', 'Paracétamol', 'Paracétamol', '500 mg', 'Comprimé', 'Boîte de 16', cat_otc, false, 600, 40, 30),
      ('DÉMO Ibuprofène', 'Ibuprofène', 'Ibuprofène', '400 mg', 'Comprimé', 'Boîte de 20', cat_otc, false, 1200, 8, 0),
      ('DÉMO Amoxicilline', 'Amoxicilline', 'Amoxicilline', '500 mg', 'Gélule', 'Boîte de 12', cat_rx, true, 2500, 15, 10),
      ('DÉMO Solution de réhydratation orale', 'SRO', 'Sels de réhydratation', '20,5 g', 'Poudre', 'Sachet', cat_otc, false, 150, 100, 3),
      ('DÉMO Gel hydroalcoolique', null, null, '100 ml', 'Gel', 'Flacon', cat_para, false, 1000, 0, 25),
      ('DÉMO Artéméther-Luméfantrine', 'Artéméther + Luméfantrine', 'Artéméther, Luméfantrine', '20/120 mg', 'Comprimé', 'Boîte de 24', cat_rx, true, 3000, 5, 0)
    ) as t(brand, generic, active, dosage, form, pack, cat, rx, price, q1, q2)
  loop
    insert into public.medicine_catalog (brand_name, generic_name, active_ingredient, dosage, form, packaging, category_id, requires_prescription, review_status, is_demo)
    values (m.brand, m.generic, m.active, m.dosage, m.form, m.pack, m.cat, m.rx, 'approved', true)
    returning id into inv1;
    insert into public.pharmacy_inventory (pharmacy_id, catalog_id, price_xof, quantity, is_available, stock_updated_at, is_demo)
    values (ph1, inv1, m.price, m.q1, m.q1 > 0, now() - interval '2 hours', true);
    -- Deuxième pharmacie : stock plus ancien pour illustrer les niveaux de fraîcheur
    insert into public.pharmacy_inventory (pharmacy_id, catalog_id, price_xof, quantity, is_available, stock_updated_at, is_demo)
    values (ph2, inv1, m.price + 100, m.q2, m.q2 > 0,
            now() - case when m.q2 = 0 then interval '5 days' when m.q2 > 20 then interval '36 hours' else interval '1 hour' end, true);
  end loop;

  -- Livreur vérifié de démonstration
  insert into public.couriers (user_id, status, phone, vehicle, zone_region_id, id_document_ref, verified_at, verified_by, is_demo)
  values (u_cour, 'verified', '+22370000004', 'moto', r_bko, 'DEMO-PIECE', now(), u_admin, true)
  on conflict (user_id) do update set status = 'verified', is_demo = true;

  -- Adresse et commande de test
  insert into public.customer_addresses (user_id, label, region_id, commune_id, locality_id, address_line, landmark, contact_phone, is_default)
  values (u_cust, 'Démo', r_bko, c3, l1, 'Adresse client de démonstration', 'Repère de démonstration', '+22370000003', true)
  returning id into addr;

  select i.id into inv1 from public.pharmacy_inventory i join public.medicine_catalog c on c.id = i.catalog_id
   where i.pharmacy_id = ph1 and c.brand_name = 'DÉMO Paracétamol';
  insert into public.orders (customer_id, pharmacy_id, fulfillment, payment_method, subtotal_xof, idempotency_key, confirmation_expires_at, is_demo)
  values (u_cust, ph1, 'pickup', 'pay_at_pharmacy', 1200, 'demo-order-0001', now() + interval '1 day', true)
  returning id into o1;
  insert into public.order_items (order_id, inventory_id, catalog_id, product_label, quantity, unit_price_xof)
  select o1, inv1, catalog_id, 'DÉMO Paracétamol 500 mg (Comprimé)', 2, 600 from public.pharmacy_inventory where id = inv1;
  insert into public.order_status_history (order_id, to_status, actor_id, note) values (o1, 'pending_confirmation', u_cust, 'Commande de démonstration');
  insert into public.notifications (user_id, kind, title, body, order_id, link)
  select user_id, 'order_new', 'Nouvelle demande (démo)', 'Commande de démonstration à confirmer.', o1, '/pharmacien/commandes/' || o1
  from public.pharmacy_members where pharmacy_id = ph1;

  return jsonb_build_object('pharmacies', jsonb_build_array(ph1, ph2, ph3), 'order', o1);
end $$;

create or replace function public.demo_uninstall()
returns jsonb language plpgsql security definer set search_path = public as $$
declare demo_users uuid[]; n_orders int; n_pharm int;
begin
  select coalesce(array_agg(id), '{}') into demo_users from public.profiles where is_demo;

  delete from public.notifications where user_id = any(demo_users)
    or order_id in (select id from public.orders where is_demo or pharmacy_id in (select id from public.pharmacies where is_demo) or customer_id = any(demo_users));
  with d as (
    delete from public.orders
    where is_demo or pharmacy_id in (select id from public.pharmacies where is_demo) or customer_id = any(demo_users)
    returning 1)
  select count(*) into n_orders from d;
  delete from public.reports where pharmacy_id in (select id from public.pharmacies where is_demo) or reporter_id = any(demo_users);
  delete from public.inventory_movements where pharmacy_id in (select id from public.pharmacies where is_demo);
  delete from public.pharmacy_inventory where is_demo or pharmacy_id in (select id from public.pharmacies where is_demo);
  with d as (delete from public.pharmacies where is_demo returning 1) select count(*) into n_pharm from d;
  delete from public.medicine_catalog where is_demo and not exists (select 1 from public.pharmacy_inventory i where i.catalog_id = medicine_catalog.id)
    and not exists (select 1 from public.order_items oi where oi.catalog_id = medicine_catalog.id);
  delete from public.customer_addresses where user_id = any(demo_users);
  delete from public.couriers where is_demo or user_id = any(demo_users);
  delete from public.localities where is_demo;
  delete from public.communes where is_demo;
  delete from public.user_roles where user_id = any(demo_users);

  if exists (select 1 from public.platform_settings where key = 'demo_enabled_delivery') then
    update public.platform_settings set value = 'false' where key = 'delivery_enabled';
    update public.product_categories set delivery_allowed = false;
    delete from public.platform_settings where key = 'demo_enabled_delivery';
  end if;

  return jsonb_build_object('orders_deleted', n_orders, 'pharmacies_deleted', n_pharm, 'demo_users', to_jsonb(demo_users));
end $$;

revoke execute on function public.demo_install(jsonb) from public, anon, authenticated;
revoke execute on function public.demo_uninstall() from public, anon, authenticated;
grant execute on function public.demo_install(jsonb) to service_role;
grant execute on function public.demo_uninstall() to service_role;
grant execute on function public.expire_overdue_orders() to service_role;

-- >>> 20261010000800_public_listing_functions.sql
-- ============================================================================
-- PharmaProxi — Migration 0008 : listes publiques (accueil, carte)
-- ============================================================================

-- Pharmacies vérifiées, avec la date de leur dernière actualisation de stock.
-- Uniquement des données réelles : une liste vide est renvoyée s'il n'y en a pas.
create or replace function public.recent_pharmacies(p_limit int default 6, p_region uuid default null)
returns table (id uuid, name text, address text, region_name text, commune_name text, phone text,
               verified_at timestamptz, last_stock_update timestamptz, products_count bigint, is_demo boolean)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, p.address, r.name, c.name, p.phone, p.verified_at,
         max(i.stock_updated_at), count(i.id), p.is_demo
  from public.pharmacies p
  join public.regions r on r.id = p.region_id
  left join public.communes c on c.id = p.commune_id
  left join public.pharmacy_inventory i on i.pharmacy_id = p.id
  where p.status = 'verified' and (p_region is null or p.region_id = p_region)
  group by p.id, r.name, c.name
  order by max(i.stock_updated_at) desc nulls last, p.verified_at desc nulls last
  limit least(greatest(coalesce(p_limit, 6), 1), 24)
$$;

-- Points de la carte : pharmacies vérifiées dont la localisation est connue.
create or replace function public.map_pharmacies(p_region uuid default null, p_commune uuid default null,
                                                 p_lat double precision default null, p_lng double precision default null)
returns table (id uuid, name text, address text, phone text, latitude double precision, longitude double precision,
               is_open boolean, offers_delivery boolean, commune_name text, distance_km double precision, is_demo boolean)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, p.address, p.phone, p.latitude, p.longitude, public.is_open_now(p.opening_hours, p.hours_verified),
         p.offers_delivery, c.name, public.distance_km(p_lat, p_lng, p.latitude, p.longitude), p.is_demo
  from public.pharmacies p
  left join public.communes c on c.id = p.commune_id
  where p.status = 'verified' and p.latitude is not null
    and (p_region is null or p.region_id = p_region)
    and (p_commune is null or p.commune_id = p_commune)
  order by public.distance_km(p_lat, p_lng, p.latitude, p.longitude) nulls last, p.name
  limit 500
$$;

-- >>> 20261010000900_admin_helpers.sql
-- ============================================================================
-- PharmaProxi — Migration 0009 : outils d'administration
-- ============================================================================

-- Recherche d'utilisateurs (e-mail issu de auth.users, non dupliqué dans profiles)
create or replace function public.admin_find_users(p_query text default null, p_limit int default 50)
returns table (id uuid, email text, full_name text, phone text, roles public.app_role[], created_at timestamptz, deleted_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_admin();
  return query
  select p.id, u.email::text, p.full_name, p.phone,
         coalesce(array_agg(r.role order by r.role) filter (where r.role is not null), '{}'),
         p.created_at, p.deleted_at
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.user_roles r on r.user_id = p.id
  where p_query is null or char_length(trim(p_query)) = 0
     or u.email ilike '%' || trim(p_query) || '%'
     or p.full_name ilike '%' || trim(p_query) || '%'
     or p.phone like '%' || regexp_replace(p_query, '\s', '', 'g') || '%'
  group by p.id, u.email
  order by p.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
end $$;

-- Livreurs avec identité (pour la vérification et l'affectation)
create or replace function public.admin_couriers(p_status public.courier_status default null)
returns table (user_id uuid, full_name text, email text, phone text, status public.courier_status, vehicle text,
               zone text, id_document_ref text, is_available boolean, active_deliveries bigint, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_admin();
  return query
  select c.user_id, p.full_name, u.email::text, c.phone, c.status, c.vehicle,
         concat_ws(', ', cm.name, r.name), c.id_document_ref, c.is_available,
         (select count(*) from public.delivery_assignments a where a.courier_id = c.user_id and a.is_active),
         c.created_at
  from public.couriers c
  join public.profiles p on p.id = c.user_id
  join auth.users u on u.id = c.user_id
  left join public.regions r on r.id = c.zone_region_id
  left join public.communes cm on cm.id = c.zone_commune_id
  where p_status is null or c.status = p_status
  order by c.status, c.created_at desc;
end $$;

-- Modification d'une page d'information (journalisée)
create or replace function public.admin_update_content(p_slug text, p_title text, p_body text, p_published boolean)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_admin();
begin
  insert into public.content_pages (slug, title, body, published, updated_at, updated_by)
  values (p_slug, p_title, p_body, p_published, now(), uid)
  on conflict (slug) do update set title = excluded.title, body = excluded.body, published = excluded.published, updated_at = now(), updated_by = uid;
  perform public.log_audit('content.update', 'content', p_slug);
end $$;

-- Traitement d'un signalement (journalisé)
create or replace function public.admin_handle_report(p_report uuid, p_status public.report_status, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_admin();
begin
  update public.reports set status = p_status, resolution_note = nullif(trim(p_note), ''), handled_by = uid where id = p_report;
  if not found then raise exception 'PP404: signalement introuvable'; end if;
  perform public.log_audit('report.handle', 'report', p_report::text, jsonb_build_object('status', p_status));
end $$;

-- Mise à jour d'une catégorie de produits (journalisée)
create or replace function public.admin_update_category(p_category uuid, p_authorized boolean, p_delivery boolean, p_prescription boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  if p_delivery and p_prescription then raise exception 'PP422: une catégorie sur ordonnance ne peut pas être livrée'; end if;
  update public.product_categories set is_authorized = p_authorized, delivery_allowed = p_delivery and p_authorized, requires_prescription = p_prescription
  where id = p_category;
  perform public.log_audit('category.update', 'category', p_category::text,
    jsonb_build_object('authorized', p_authorized, 'delivery', p_delivery, 'prescription', p_prescription));
end $$;

-- Ajout d'un élément géographique (journalisé)
create or replace function public.admin_add_geo(p_kind text, p_parent uuid, p_name text, p_source text default null, p_circle uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare nid uuid; reg uuid;
begin
  perform public.require_admin();
  if coalesce(trim(p_name), '') = '' then raise exception 'PP422: nom requis'; end if;
  if p_kind = 'circle' then
    insert into public.circles (region_id, name, source) values (p_parent, trim(p_name), p_source) returning id into nid;
  elsif p_kind = 'commune' then
    if p_circle is not null and not exists (select 1 from public.circles where id = p_circle and region_id = p_parent) then
      raise exception 'PP422: le cercle n''appartient pas à la région';
    end if;
    insert into public.communes (region_id, circle_id, name, source) values (p_parent, p_circle, trim(p_name), p_source) returning id into nid;
  elsif p_kind = 'locality' then
    insert into public.localities (commune_id, name, source) values (p_parent, trim(p_name), p_source) returning id into nid;
  else
    raise exception 'PP422: type inconnu';
  end if;
  perform public.log_audit('geo.add', p_kind, nid::text, jsonb_build_object('name', p_name, 'source', p_source));
  return nid;
exception when unique_violation then
  raise exception 'PP409: cet élément existe déjà';
end $$;

-- >>> 20261011000100_robustness.sql
-- ============================================================================
-- PharmaProxi — Migration 0010 : robustesse
--  1. Limites anti-abus imposées en base (indépendantes de l'application)
--  2. Limitation de débit partagée entre instances (clé de service uniquement)
--  3. Concurrence optimiste sur les modifications de stock
--  4. Contrôle et réparation d'intégrité
--  5. Maintenance planifiée (expirations, purges)
--  6. Équipe d'une pharmacie (ajout / retrait de membres)
--  7. Garde-fous : longueurs de texte, délais d'exécution
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Limites anti-abus en base
-- ---------------------------------------------------------------------------
create or replace function public.enforce_order_rate()
returns trigger language plpgsql security definer set search_path = public as $$
declare n int;
begin
  select count(*) into n from public.orders
   where customer_id = new.customer_id and created_at > now() - interval '10 minutes';
  if n >= 10 then
    raise exception 'PP429: trop de demandes en peu de temps, patientez quelques minutes';
  end if;
  select count(*) into n from public.orders
   where customer_id = new.customer_id and status = 'pending_confirmation';
  if n >= 15 then
    raise exception 'PP429: trop de demandes en attente ; attendez les réponses des pharmacies ou annulez-en';
  end if;
  return new;
end $$;
create trigger orders_rate before insert on public.orders
  for each row when (new.is_demo = false) execute function public.enforce_order_rate();

create or replace function public.enforce_report_rate()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.reporter_id is not null and (
    select count(*) from public.reports where reporter_id = new.reporter_id and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'PP429: trop de signalements, réessayez plus tard';
  end if;
  return new;
end $$;
create trigger reports_rate before insert on public.reports
  for each row execute function public.enforce_report_rate();

create or replace function public.enforce_catalog_rate()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.created_by is not null and not public.is_admin() and (
    select count(*) from public.medicine_catalog where created_by = new.created_by and created_at > now() - interval '1 day') >= 3000 then
    raise exception 'PP429: nombre maximal de nouvelles fiches catalogue atteint pour aujourd''hui';
  end if;
  return new;
end $$;
create trigger catalog_rate before insert on public.medicine_catalog
  for each row execute function public.enforce_catalog_rate();

create or replace function public.enforce_address_limit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.customer_addresses where user_id = new.user_id) >= 10 then
    raise exception 'PP429: 10 adresses maximum';
  end if;
  return new;
end $$;
create trigger addresses_limit before insert on public.customer_addresses
  for each row execute function public.enforce_address_limit();

-- ---------------------------------------------------------------------------
-- 2. Limitation de débit partagée (connexion, recherche…) — appelée par le
--    serveur avec la clé de service ; jamais exposée aux visiteurs.
-- ---------------------------------------------------------------------------
create unlogged table public.rate_limit_events (
  key text not null check (char_length(key) <= 200),
  at timestamptz not null default now()
);
create index rate_limit_events_key_idx on public.rate_limit_events (key, at desc);
alter table public.rate_limit_events enable row level security; -- aucune politique : inaccessible hors service_role
revoke all on public.rate_limit_events from anon, authenticated;

-- Retourne true si l'opération est autorisée ; p_record = enregistre la tentative.
create or replace function public.rate_limit_hit(p_key text, p_limit int, p_window_seconds int, p_record boolean default true)
returns boolean language plpgsql security definer set search_path = public as $$
declare n int;
begin
  select count(*) into n from public.rate_limit_events
   where key = p_key and at > now() - make_interval(secs => p_window_seconds);
  if n >= p_limit then return false; end if;
  if p_record then insert into public.rate_limit_events (key) values (p_key); end if;
  return true;
end $$;
revoke execute on function public.rate_limit_hit(text, int, int, boolean) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, int, int, boolean) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Concurrence optimiste sur les lignes de stock
-- ---------------------------------------------------------------------------
alter table public.pharmacy_inventory add column row_version integer not null default 0;

create or replace function public.inventory_bump_version()
returns trigger language plpgsql as $$
begin
  if new.quantity is distinct from old.quantity or new.price_xof is distinct from old.price_xof
     or new.is_available is distinct from old.is_available then
    new.row_version := old.row_version + 1;
  end if;
  return new;
end $$;
create trigger inventory_version before update on public.pharmacy_inventory
  for each row execute function public.inventory_bump_version();

-- Le garde-fou empêche aussi de toucher à row_version directement
create or replace function public.inventory_guard()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and current_user in ('authenticated', 'anon') then
    if new.quantity is distinct from old.quantity or new.reserved_quantity is distinct from old.reserved_quantity
       or new.price_xof is distinct from old.price_xof or new.pharmacy_id is distinct from old.pharmacy_id
       or new.catalog_id is distinct from old.catalog_id or new.stock_updated_at is distinct from old.stock_updated_at
       or new.is_demo is distinct from old.is_demo or new.row_version is distinct from old.row_version then
      raise exception 'PP403: utilisez la mise à jour de stock dédiée';
    end if;
  end if;
  return new;
end $$;

-- Mise à jour d'une ligne depuis le formulaire : refuse si la ligne a changé
-- depuis l'affichage (autre membre de l'équipe, vente, import…).
create or replace function public.update_inventory_line(
  p_inventory uuid, p_expected_version int, p_quantity int, p_price int, p_available boolean, p_threshold int default null)
returns int language plpgsql security definer set search_path = public as $$
declare r public.pharmacy_inventory%rowtype;
begin
  perform public.require_auth();
  select * into r from public.pharmacy_inventory where id = p_inventory for update;
  if r.id is null or not public.can_manage_pharmacy(r.pharmacy_id) then raise exception 'PP403: accès refusé'; end if;
  if p_expected_version is not null and r.row_version <> p_expected_version then
    raise exception 'PP409: cette ligne a été modifiée entre-temps (quantité actuelle : %, réservé : %). Vérifiez puis enregistrez à nouveau.',
      r.quantity, r.reserved_quantity;
  end if;
  perform public.set_inventory(r.pharmacy_id, r.catalog_id, p_quantity, p_price, p_available, p_threshold, null, 'adjustment');
  return (select row_version from public.pharmacy_inventory where id = p_inventory);
end $$;

-- ---------------------------------------------------------------------------
-- 4. Intégrité
-- ---------------------------------------------------------------------------
create or replace function public.integrity_issues()
returns table (check_name text, severity text, entity_id text, details text)
language sql stable security definer set search_path = public as $$
  -- Réservé déclaré différent de la somme des réservations actives
  select 'reserved_mismatch', 'critique', i.id::text,
         format('réservé %s, réservations actives %s', i.reserved_quantity, coalesce(sum(sr.quantity), 0))
  from public.pharmacy_inventory i
  left join public.stock_reservations sr on sr.inventory_id = i.id and sr.status = 'active'
  group by i.id having i.reserved_quantity <> coalesce(sum(sr.quantity), 0)
  union all
  -- Réservation encore active sur une commande clôturée
  select 'active_reservation_on_closed_order', 'critique', o.id::text, format('commande %s (%s)', o.reference, o.status)
  from public.orders o join public.stock_reservations sr on sr.order_id = o.id and sr.status = 'active'
  where public.is_terminal_status(o.status)
  union all
  -- Commande confirmée sans réservation active
  select 'confirmed_order_without_reservation', 'critique', o.id::text, format('commande %s (%s)', o.reference, o.status)
  from public.orders o
  where o.status in ('confirmed', 'preparing', 'ready_for_pickup', 'awaiting_courier', 'courier_assigned', 'in_delivery')
    and not exists (select 1 from public.stock_reservations sr where sr.order_id = o.id and sr.status = 'active')
  union all
  -- Total incohérent avec les lignes
  select 'order_total_mismatch', 'critique', o.id::text, format('sous-total %s, lignes %s', o.subtotal_xof, coalesce(sum(oi.quantity * oi.unit_price_xof), 0))
  from public.orders o left join public.order_items oi on oi.order_id = o.id
  group by o.id having o.subtotal_xof <> coalesce(sum(oi.quantity * oi.unit_price_xof), 0)
  union all
  -- Livraison affectée à un livreur qui n'est plus habilité
  select 'assignment_to_unverified_courier', 'critique', a.id::text, 'livreur non vérifié ou suspendu'
  from public.delivery_assignments a join public.couriers c on c.user_id = a.courier_id
  where a.is_active and c.status <> 'verified'
  union all
  -- Demandes dont le délai est dépassé (la tâche d'expiration ne tourne pas ?)
  select 'overdue_not_expired', 'avertissement', o.id::text, format('commande %s en retard depuis %s min', o.reference,
         round(extract(epoch from now() - coalesce(o.confirmation_expires_at, o.reservation_expires_at)) / 60))
  from public.orders o
  where (o.status = 'pending_confirmation' and o.confirmation_expires_at < now() - interval '30 minutes')
     or (o.status in ('confirmed', 'preparing', 'ready_for_pickup') and o.fulfillment = 'pickup' and o.reservation_expires_at < now() - interval '30 minutes')
  union all
  -- Pharmacie vérifiée sans aucun justificatif (hors démonstration)
  select 'verified_without_documents', 'avertissement', p.id::text, p.name
  from public.pharmacies p
  where p.status = 'verified' and not p.is_demo and not exists (select 1 from public.pharmacy_documents d where d.pharmacy_id = p.id)
$$;
revoke execute on function public.integrity_issues() from public, anon, authenticated;

create or replace function public.admin_integrity_report()
returns table (check_name text, severity text, entity_id text, details text)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_admin();
  return query select * from public.integrity_issues();
end $$;

-- Réparation sûre et idempotente : recalcule les quantités réservées à partir
-- des réservations actives et libère les réservations des commandes clôturées.
create or replace function public.admin_repair_reservations()
returns jsonb language plpgsql security definer set search_path = public as $$
declare released int; fixed int;
begin
  perform public.require_admin();
  with r as (
    update public.stock_reservations sr set status = 'released', closed_at = now()
    from public.orders o
    where sr.order_id = o.id and sr.status = 'active' and public.is_terminal_status(o.status)
    returning 1)
  select count(*) into released from r;
  with f as (
    update public.pharmacy_inventory i
       set reserved_quantity = least(i.quantity, coalesce((select sum(quantity) from public.stock_reservations sr where sr.inventory_id = i.id and sr.status = 'active'), 0))
     where i.reserved_quantity <> coalesce((select sum(quantity) from public.stock_reservations sr where sr.inventory_id = i.id and sr.status = 'active'), 0)
    returning 1)
  select count(*) into fixed from f;
  perform public.log_audit('integrity.repair_reservations', 'inventory', null, jsonb_build_object('released', released, 'fixed', fixed));
  return jsonb_build_object('released', released, 'fixed', fixed);
end $$;

-- ---------------------------------------------------------------------------
-- 5. Maintenance planifiée (pg_cron ou /api/cron)
-- ---------------------------------------------------------------------------
create or replace function public.run_maintenance()
returns jsonb language plpgsql security definer set search_path = public as $$
declare expired int; rl int; logs int; notifs int; outbox int; issues int;
begin
  expired := public.expire_overdue_orders();
  delete from public.rate_limit_events where at < now() - interval '1 day';
  get diagnostics rl = row_count;
  delete from public.search_logs where created_at < now() - interval '400 days';
  get diagnostics logs = row_count;
  delete from public.notifications where read_at is not null and read_at < now() - interval '180 days';
  get diagnostics notifs = row_count;
  delete from public.notification_outbox where status in ('sent', 'skipped') and created_at < now() - interval '90 days';
  get diagnostics outbox = row_count;
  select count(*) into issues from public.integrity_issues() where severity = 'critique';
  insert into public.maintenance_runs (expired, purged, critical_issues)
  values (expired, jsonb_build_object('rate_limits', rl, 'search_logs', logs, 'notifications', notifs, 'outbox', outbox), issues);
  delete from public.maintenance_runs where ran_at < now() - interval '30 days';
  return jsonb_build_object('expired', expired, 'purged', jsonb_build_object('rate_limits', rl, 'search_logs', logs, 'notifications', notifs, 'outbox', outbox), 'critical_issues', issues);
end $$;

create table public.maintenance_runs (
  id bigint generated always as identity primary key,
  ran_at timestamptz not null default now(),
  expired int not null default 0,
  purged jsonb not null default '{}'::jsonb,
  critical_issues int not null default 0
);
alter table public.maintenance_runs enable row level security;
create policy "admin lit" on public.maintenance_runs for select using (public.is_admin());
revoke insert, update, delete on public.maintenance_runs from anon, authenticated;

revoke execute on function public.run_maintenance() from public, anon, authenticated;
grant execute on function public.run_maintenance() to service_role;

create or replace function public.admin_run_maintenance()
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  perform public.require_admin();
  r := public.run_maintenance();
  perform public.log_audit('maintenance.run', 'system', null, r);
  return r;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Équipe d'une pharmacie
-- ---------------------------------------------------------------------------
create or replace function public.is_pharmacy_owner(p_pharmacy uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.pharmacy_members where pharmacy_id = p_pharmacy and user_id = auth.uid() and member_role = 'owner')
$$;

create or replace function public.pharmacy_team(p_pharmacy uuid)
returns table (user_id uuid, full_name text, email text, member_role text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_pharmacy_member(p_pharmacy) or public.is_admin()) then raise exception 'PP403: accès refusé'; end if;
  return query
  select m.user_id, p.full_name, u.email::text, m.member_role, m.created_at
  from public.pharmacy_members m join public.profiles p on p.id = m.user_id join auth.users u on u.id = m.user_id
  where m.pharmacy_id = p_pharmacy order by m.member_role desc, m.created_at;
end $$;

-- Ajoute un collaborateur (compte déjà créé sur PharmaProxi) — propriétaire uniquement
create or replace function public.pharmacy_add_member(p_pharmacy uuid, p_email text)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_auth(); target uuid;
begin
  if not public.is_pharmacy_owner(p_pharmacy) or not public.can_manage_pharmacy(p_pharmacy) then
    raise exception 'PP403: seul le propriétaire peut gérer l''équipe';
  end if;
  select u.id into target from auth.users u join public.profiles p on p.id = u.id
   where lower(u.email) = lower(trim(p_email)) and p.deleted_at is null;
  if target is null then
    raise exception 'PP404: aucun compte PharmaProxi avec cette adresse ; la personne doit d''abord créer son compte';
  end if;
  if (select count(*) from public.pharmacy_members where pharmacy_id = p_pharmacy) >= 20 then
    raise exception 'PP422: 20 membres maximum';
  end if;
  insert into public.pharmacy_members (pharmacy_id, user_id, member_role) values (p_pharmacy, target, 'staff')
  on conflict do nothing;
  insert into public.user_roles (user_id, role, granted_by) values (target, 'pharmacist', uid) on conflict do nothing;
  perform public.log_audit('pharmacy.member_add', 'pharmacy', p_pharmacy::text, jsonb_build_object('user', target));
  perform public.notify_user(target, 'pharmacy_member', 'Vous avez rejoint une équipe',
    (select name from public.pharmacies where id = p_pharmacy), null, '/pharmacien');
  return target;
end $$;

create or replace function public.pharmacy_remove_member(p_pharmacy uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_auth();
begin
  if not public.is_pharmacy_owner(p_pharmacy) and not public.is_admin() then
    raise exception 'PP403: seul le propriétaire peut gérer l''équipe';
  end if;
  if exists (select 1 from public.pharmacy_members where pharmacy_id = p_pharmacy and user_id = p_user and member_role = 'owner') then
    raise exception 'PP409: le propriétaire ne peut pas être retiré de l''équipe';
  end if;
  delete from public.pharmacy_members where pharmacy_id = p_pharmacy and user_id = p_user;
  if not found then raise exception 'PP404: membre introuvable'; end if;
  -- Retire le rôle pharmacien s'il n'appartient plus à aucune pharmacie
  if not exists (select 1 from public.pharmacy_members where user_id = p_user) then
    delete from public.user_roles where user_id = p_user and role = 'pharmacist';
  end if;
  perform public.log_audit('pharmacy.member_remove', 'pharmacy', p_pharmacy::text, jsonb_build_object('user', p_user));
end $$;

-- Les justificatifs et l'équipe restent réservés au propriétaire
drop policy "membres déposent" on public.pharmacy_documents;
create policy "propriétaire dépose" on public.pharmacy_documents for insert
  with check (public.can_manage_pharmacy(pharmacy_id) and public.is_pharmacy_owner(pharmacy_id)
              and uploaded_by = auth.uid() and storage_path like pharmacy_id::text || '/%');

-- ---------------------------------------------------------------------------
-- 7. Garde-fous
-- ---------------------------------------------------------------------------
alter table public.medicine_catalog
  add constraint catalog_text_lengths check (
    char_length(coalesce(generic_name, '')) <= 150 and char_length(coalesce(active_ingredient, '')) <= 200
    and char_length(coalesce(dosage, '')) <= 60 and char_length(coalesce(form, '')) <= 60
    and char_length(coalesce(packaging, '')) <= 80 and char_length(coalesce(manufacturer, '')) <= 120);
alter table public.pharmacy_private
  add constraint private_text_lengths check (
    char_length(coalesce(legal_name, '')) <= 200 and char_length(coalesce(license_number, '')) <= 100
    and char_length(pharmacist_in_charge) between 2 and 120 and char_length(coalesce(order_registration, '')) <= 100
    and char_length(coalesce(tax_id, '')) <= 50 and char_length(coalesce(rccm, '')) <= 80 and char_length(coalesce(notes, '')) <= 2000);
alter table public.content_pages add constraint content_lengths check (char_length(title) <= 200 and char_length(body) <= 20000);
alter table public.delivery_incidents alter column description type text;
alter table public.reports add constraint resolution_length check (char_length(coalesce(resolution_note, '')) <= 1000);

-- Délais maximum d'exécution des requêtes (déjà configurés sur Supabase hébergé ;
-- appliqués ici pour les autres environnements). Ignoré si le rôle n'est pas modifiable.
do $$ begin
  execute 'alter role anon set statement_timeout = ''5s''';
  execute 'alter role authenticated set statement_timeout = ''10s''';
exception when insufficient_privilege then null;
end $$;

-- ---------------------------------------------------------------------------
-- 8. Catalogue et imports sûrs en concurrence
--    • création de fiche : si une autre transaction crée la même fiche au même
--      moment, on relit celle-ci au lieu d'échouer ;
--    • import : lignes traitées dans un ordre stable (par fiche) pour que deux
--      imports simultanés ne s'interbloquent pas.
-- ---------------------------------------------------------------------------
create or replace function public.upsert_catalog_item(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid uuid := public.require_auth();
  admin boolean := public.is_admin();
  cid uuid;
  v_brand text := trim(p ->> 'brand_name');
  v_category uuid := nullif(p ->> 'category_id', '')::uuid;
  cat_rx boolean := false;
begin
  if not (admin or public.has_role('pharmacist')) then raise exception 'PP403: accès refusé'; end if;
  if v_brand is null or char_length(v_brand) < 2 then raise exception 'PP422: nom commercial obligatoire'; end if;
  if v_category is not null then
    select requires_prescription into cat_rx from public.product_categories where id = v_category and is_authorized;
    if not found then raise exception 'PP422: catégorie de produit non autorisée'; end if;
  end if;

  for attempt in 1..3 loop
    select id into cid from public.medicine_catalog
     where merged_into is null and review_status <> 'rejected'
       and public.normalize_text(brand_name) = public.normalize_text(v_brand)
       and public.normalize_text(coalesce(dosage, '')) = public.normalize_text(coalesce(p ->> 'dosage', ''))
       and public.normalize_text(coalesce(form, '')) = public.normalize_text(coalesce(p ->> 'form', ''))
       and public.normalize_text(coalesce(packaging, '')) = public.normalize_text(coalesce(p ->> 'packaging', ''));
    if cid is not null then return cid; end if;
    begin
      insert into public.medicine_catalog (brand_name, generic_name, active_ingredient, dosage, form, packaging, manufacturer,
                                           category_id, requires_prescription, review_status, created_by)
      values (v_brand, nullif(trim(p ->> 'generic_name'), ''), nullif(trim(p ->> 'active_ingredient'), ''),
              nullif(trim(p ->> 'dosage'), ''), nullif(trim(p ->> 'form'), ''), nullif(trim(p ->> 'packaging'), ''),
              nullif(trim(p ->> 'manufacturer'), ''), v_category,
              coalesce((p ->> 'requires_prescription')::boolean, false) or coalesce(cat_rx, false),
              case when admin then 'approved' else 'pending' end, uid)
      returning id into cid;
      return cid;
    exception when unique_violation then
      null; -- créée en parallèle par une autre transaction : relecture au tour suivant
    end;
  end loop;
  raise exception 'PP409: fiche catalogue en cours de création, réessayez';
end $$;

create or replace function public.import_inventory(p_pharmacy uuid, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  rec record; ok int := 0; errors jsonb := '[]'::jsonb; cid uuid;
begin
  perform public.require_auth();
  if not public.can_manage_pharmacy(p_pharmacy) then raise exception 'PP403: vous ne gérez pas cette pharmacie'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 2000 then
    raise exception 'PP422: 2000 lignes maximum par import';
  end if;
  for rec in
    select value as r, ordinality as line
    from jsonb_array_elements(p_rows) with ordinality
    order by public.normalize_text(value ->> 'brand_name'), public.normalize_text(coalesce(value ->> 'dosage', '')),
             public.normalize_text(coalesce(value ->> 'form', '')), public.normalize_text(coalesce(value ->> 'packaging', '')), ordinality
  loop
    begin
      cid := public.upsert_catalog_item(rec.r);
      perform public.set_inventory(p_pharmacy, cid, (rec.r ->> 'quantity')::int, nullif(rec.r ->> 'price_xof', '')::int,
                                   coalesce((rec.r ->> 'is_available')::boolean, true), null, 'Import CSV', 'import');
      ok := ok + 1;
    exception when others then
      errors := errors || jsonb_build_object('row', rec.line, 'error', regexp_replace(sqlerrm, '^PP[0-9]+: ', ''));
    end;
  end loop;
  select coalesce(jsonb_agg(e order by (e ->> 'row')::int), '[]'::jsonb) into errors from jsonb_array_elements(errors) e;
  return jsonb_build_object('imported', ok, 'failed', jsonb_array_length(errors), 'errors', errors);
end $$;

-- >>> 20261027000100_medical_directory.sql
-- ============================================================================
-- PharmaProxi — Migration 0011 : annuaire des médecins spécialistes et des
-- cliniques (module M7 du cahier des charges v2.0).
--
-- Principes :
--   * information, pas publicité : aucun classement, aucune notation ;
--   * professionnels vérifiés sur pièces avant toute publication ;
--   * consentement explicite et daté du médecin avant publication ;
--   * coordonnées professionnelles uniquement ; aucune donnée inventée ;
--   * information datée : une fiche non confirmée depuis 180 jours n'est plus
--     publiée (seuils réglables) ;
--   * toutes les écritures sensibles passent par des fonctions contrôlées.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Paramètres
-- ---------------------------------------------------------------------------
insert into public.platform_settings (key, value, description) values
  ('directory_fresh_days', '90', 'Annuaire : au-delà de ce délai sans confirmation, la fiche est signalée « à confirmer ».'),
  ('directory_stale_days', '180', 'Annuaire : au-delà de ce délai sans confirmation, la fiche n''est plus publiée.'),
  ('emergency_numbers', '""', 'Numéros d''urgence affichés dans l''annuaire (texte libre, à renseigner avec les autorités). Vide : message générique.')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Spécialités (référentiel administré)
-- ---------------------------------------------------------------------------
create table public.medical_specialties (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9_]{2,40}$'),
  name text not null unique check (char_length(name) between 2 and 80),
  family text not null check (char_length(family) between 2 and 80),
  description text check (char_length(description) <= 400),
  sort_order int not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Liste initiale proposée dans le cahier des charges, à valider avec l'Ordre
-- des médecins. Descriptions neutres, sans conseil médical.
insert into public.medical_specialties (code, name, family, description, sort_order) values
  ('medecine_generale', 'Médecine générale', 'Premier recours', 'Le médecin généraliste assure le suivi courant et oriente, si besoin, vers le bon spécialiste.', 10),
  ('medecine_interne', 'Médecine interne', 'Médecine de l''adulte', 'Le médecin interniste prend en charge les maladies de l''adulte touchant plusieurs organes.', 20),
  ('cardiologie', 'Cardiologie', 'Médecine de l''adulte', 'Le cardiologue s''occupe du cœur et des vaisseaux sanguins.', 21),
  ('pneumologie', 'Pneumologie', 'Médecine de l''adulte', 'Le pneumologue s''occupe des poumons et de la respiration.', 22),
  ('gastro_enterologie', 'Gastro-entérologie', 'Médecine de l''adulte', 'Le gastro-entérologue s''occupe de l''appareil digestif.', 23),
  ('nephrologie', 'Néphrologie', 'Médecine de l''adulte', 'Le néphrologue s''occupe des reins.', 24),
  ('endocrinologie', 'Endocrinologie-diabétologie', 'Médecine de l''adulte', 'L''endocrinologue s''occupe des hormones, du diabète et de la thyroïde.', 25),
  ('rhumatologie', 'Rhumatologie', 'Médecine de l''adulte', 'Le rhumatologue s''occupe des os, des articulations et des muscles.', 26),
  ('infectiologie', 'Infectiologie', 'Médecine de l''adulte', 'L''infectiologue s''occupe des maladies infectieuses.', 27),
  ('hematologie', 'Hématologie', 'Médecine de l''adulte', 'L''hématologue s''occupe des maladies du sang.', 28),
  ('oncologie', 'Oncologie', 'Médecine de l''adulte', 'L''oncologue s''occupe des cancers.', 29),
  ('neurologie', 'Neurologie', 'Médecine de l''adulte', 'Le neurologue s''occupe du cerveau et des nerfs.', 30),
  ('dermatologie', 'Dermatologie', 'Médecine de l''adulte', 'Le dermatologue s''occupe de la peau, des cheveux et des ongles.', 31),
  ('gynecologie', 'Gynécologie-obstétrique', 'Femme et enfant', 'Le gynécologue-obstétricien suit la santé de la femme, la grossesse et l''accouchement.', 40),
  ('pediatrie', 'Pédiatrie', 'Femme et enfant', 'Le pédiatre suit la santé des enfants, de la naissance à l''adolescence.', 41),
  ('neonatologie', 'Néonatologie', 'Femme et enfant', 'Le néonatologue s''occupe des nouveau-nés.', 42),
  ('chirurgie_generale', 'Chirurgie générale', 'Chirurgie', 'Le chirurgien général opère notamment l''abdomen.', 50),
  ('traumatologie', 'Traumatologie-orthopédie', 'Chirurgie', 'Le chirurgien orthopédiste s''occupe des os et des articulations (fractures, prothèses).', 51),
  ('urologie', 'Urologie', 'Chirurgie', 'L''urologue s''occupe des voies urinaires et de l''appareil génital masculin.', 52),
  ('neurochirurgie', 'Neurochirurgie', 'Chirurgie', 'Le neurochirurgien opère le cerveau, la moelle épinière et les nerfs.', 53),
  ('chirurgie_pediatrique', 'Chirurgie pédiatrique', 'Chirurgie', 'Le chirurgien pédiatrique opère les enfants.', 54),
  ('chirurgie_maxillo_faciale', 'Chirurgie maxillo-faciale', 'Chirurgie', 'Le chirurgien maxillo-facial opère le visage et les mâchoires.', 55),
  ('ophtalmologie', 'Ophtalmologie', 'Organes des sens', 'L''ophtalmologue s''occupe des yeux et de la vue.', 60),
  ('orl', 'ORL', 'Organes des sens', 'L''ORL (oto-rhino-laryngologiste) s''occupe des oreilles, du nez et de la gorge.', 61),
  ('psychiatrie', 'Psychiatrie', 'Santé mentale', 'Le psychiatre s''occupe de la santé mentale.', 70),
  ('pedopsychiatrie', 'Pédopsychiatrie', 'Santé mentale', 'Le pédopsychiatre s''occupe de la santé mentale des enfants et des adolescents.', 71),
  ('radiologie', 'Radiologie et imagerie', 'Diagnostic et soins critiques', 'Le radiologue réalise et interprète les examens d''imagerie (radio, échographie, scanner).', 80),
  ('anesthesie', 'Anesthésie-réanimation', 'Diagnostic et soins critiques', 'L''anesthésiste-réanimateur endort les patients pour les opérations et prend en charge la réanimation.', 81),
  ('biologie', 'Biologie médicale', 'Diagnostic et soins critiques', 'Le biologiste réalise et interprète les analyses de laboratoire.', 82),
  ('chirurgie_dentaire', 'Chirurgie dentaire', 'Bouche et dents', 'Le chirurgien-dentiste soigne les dents et les gencives.', 90),
  ('stomatologie', 'Stomatologie', 'Bouche et dents', 'Le stomatologue s''occupe des maladies de la bouche.', 91)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- Cliniques
-- ---------------------------------------------------------------------------
create table public.clinics (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  kind text not null default 'clinique' check (kind in ('clinique', 'cabinet', 'centre_medical', 'hopital')),
  status public.pharmacy_status not null default 'pending',
  address text not null check (char_length(address) between 3 and 300),
  region_id uuid not null references public.regions(id) on delete restrict,
  commune_id uuid references public.communes(id) on delete restrict,
  locality_id uuid references public.localities(id) on delete restrict,
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  phone text not null check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  whatsapp text check (whatsapp is null or whatsapp ~ '^\+[1-9][0-9]{7,14}$'),
  email text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  opening_hours jsonb not null default '{}'::jsonb,
  emergency_24h boolean not null default false,
  services text[] not null default '{}' check (services <@ array['laboratoire', 'imagerie', 'maternite', 'hospitalisation', 'bloc_operatoire', 'pharmacie_interne']::text[]),
  confirmed_at timestamptz not null default now(),
  reminded_at timestamptz,
  verified_at timestamptz,
  is_demo boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((latitude is null) = (longitude is null))
);
create index clinics_status_idx on public.clinics(status);
create index clinics_geo_idx on public.clinics(region_id, commune_id, locality_id);
create index clinics_name_trgm on public.clinics using gin (public.normalize_text(name) extensions.gin_trgm_ops);
create trigger clinics_touch before update on public.clinics for each row execute function public.touch_updated_at();

create table public.clinic_private (
  clinic_id uuid primary key references public.clinics(id) on delete cascade,
  legal_name text check (char_length(legal_name) <= 200),
  license_number text check (char_length(license_number) <= 100),
  rccm text check (char_length(rccm) <= 80),
  tax_id text check (char_length(tax_id) <= 50),
  manager_name text not null check (char_length(manager_name) between 2 and 120),
  manager_phone text check (manager_phone is null or manager_phone ~ '^\+[1-9][0-9]{7,14}$'),
  updated_at timestamptz not null default now()
);

create table public.clinic_members (
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  member_role text not null default 'owner' check (member_role in ('owner', 'staff')),
  created_at timestamptz not null default now(),
  primary key (clinic_id, user_id)
);
create index clinic_members_user_idx on public.clinic_members(user_id);

create table public.clinic_documents (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  doc_type text not null check (doc_type in ('autorisation_ouverture', 'rccm', 'nif', 'piece_identite', 'autre')),
  storage_path text not null unique,
  file_name text check (char_length(file_name) <= 200),
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Médecins
-- ---------------------------------------------------------------------------
create table public.doctors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  title text not null default 'Dr' check (title in ('Dr', 'Pr')),
  display_name text not null check (char_length(display_name) between 2 and 120),
  gender text check (gender in ('F', 'M')),
  languages text[] not null default array['fr']::text[]
    check (languages <@ array['fr', 'bm', 'snk', 'ff', 'son', 'tmh', 'dgo', 'en', 'ar']::text[] and cardinality(languages) between 1 and 9),
  status public.pharmacy_status not null default 'pending',
  is_published boolean not null default true,
  publication_consent_at timestamptz not null,
  confirmed_at timestamptz not null default now(),
  reminded_at timestamptz,
  verified_at timestamptz,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index doctors_status_idx on public.doctors(status, is_published);
create index doctors_name_trgm on public.doctors using gin (public.normalize_text(display_name) extensions.gin_trgm_ops);
create trigger doctors_touch before update on public.doctors for each row execute function public.touch_updated_at();

create table public.doctor_private (
  doctor_id uuid primary key references public.doctors(id) on delete cascade,
  order_number text not null check (char_length(order_number) between 2 and 60),
  personal_phone text check (personal_phone is null or personal_phone ~ '^\+[1-9][0-9]{7,14}$'),
  updated_at timestamptz not null default now()
);

create table public.doctor_specialties (
  doctor_id uuid not null references public.doctors(id) on delete cascade,
  specialty_id uuid not null references public.medical_specialties(id) on delete restrict,
  primary key (doctor_id, specialty_id)
);
create index doctor_specialties_spec_idx on public.doctor_specialties(specialty_id);

create table public.doctor_documents (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.doctors(id) on delete cascade,
  doc_type text not null check (doc_type in ('inscription_ordre', 'diplome_specialite', 'piece_identite', 'autre')),
  storage_path text not null unique,
  file_name text check (char_length(file_name) <= 200),
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Lieu d'exercice : un médecin dans une clinique, avec ses jours et horaires.
-- Publié seulement quand les DEUX parties ont accepté.
create table public.doctor_practice_sites (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.doctors(id) on delete cascade,
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  schedule jsonb not null default '{}'::jsonb,
  appointment_phone text check (appointment_phone is null or appointment_phone ~ '^\+[1-9][0-9]{7,14}$'),
  doctor_accepted boolean not null default false,
  clinic_accepted boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (doctor_id, clinic_id)
);
create index doctor_practice_sites_clinic_idx on public.doctor_practice_sites(clinic_id);
create trigger doctor_practice_sites_touch before update on public.doctor_practice_sites for each row execute function public.touch_updated_at();

create table public.doctor_absences (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.doctors(id) on delete cascade,
  starts_on date not null,
  ends_on date not null,
  note text check (char_length(note) <= 120),
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on and ends_on - starts_on <= 366)
);
create index doctor_absences_doctor_idx on public.doctor_absences(doctor_id, ends_on);

create table public.directory_verifications (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid references public.doctors(id) on delete cascade,
  clinic_id uuid references public.clinics(id) on delete cascade,
  decision public.pharmacy_status not null,
  reason text check (char_length(reason) <= 1000),
  checklist jsonb not null default '{}'::jsonb,
  reviewer_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check ((doctor_id is null) <> (clinic_id is null))
);
create index directory_verifications_doctor_idx on public.directory_verifications(doctor_id, created_at desc);
create index directory_verifications_clinic_idx on public.directory_verifications(clinic_id, created_at desc);

-- Signalements et journal de recherche étendus à l'annuaire
alter table public.reports add column doctor_id uuid references public.doctors(id) on delete cascade;
alter table public.reports add column clinic_id uuid references public.clinics(id) on delete cascade;
alter table public.reports drop constraint reports_reason_check;
alter table public.reports add constraint reports_reason_check check (reason in (
  'stock_incorrect', 'prix_incorrect', 'pharmacie_fermee', 'informations_erronees', 'comportement', 'produit_suspect', 'autre',
  'numero_errone', 'ne_consulte_plus'));
alter table public.search_logs add column kind text not null default 'medicine' check (kind in ('medicine', 'doctor', 'clinic'));

-- ---------------------------------------------------------------------------
-- Fonctions d'aide
-- ---------------------------------------------------------------------------
create or replace function public.my_doctor_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.doctors where user_id = auth.uid()
$$;

create or replace function public.is_clinic_member(p_clinic uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.clinic_members where clinic_id = p_clinic and user_id = auth.uid())
$$;

create or replace function public.is_clinic_owner(p_clinic uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.clinic_members where clinic_id = p_clinic and user_id = auth.uid() and member_role = 'owner')
$$;

-- Membre d'une clinique non suspendue
create or replace function public.can_manage_clinic(p_clinic uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.clinic_members m join public.clinics c on c.id = m.clinic_id
    where m.clinic_id = p_clinic and m.user_id = auth.uid() and c.status in ('pending', 'verified', 'rejected'))
$$;

-- « fresh » | « to_confirm » | « stale »
create or replace function public.directory_freshness(p_confirmed timestamptz, p_now timestamptz default now())
returns text language sql stable security definer set search_path = public as $$
  select case
    when p_confirmed >= p_now - make_interval(days => public.setting_int('directory_fresh_days', 90)) then 'fresh'
    when p_confirmed >= p_now - make_interval(days => public.setting_int('directory_stale_days', 180)) then 'to_confirm'
    else 'stale' end
$$;

create or replace function public.doctor_is_public(p_doctor uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.doctors d where d.id = p_doctor and d.status = 'verified' and d.is_published
                 and public.directory_freshness(d.confirmed_at) <> 'stale')
$$;

create or replace function public.clinic_is_public(p_clinic uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.clinics c where c.id = p_clinic and c.status = 'verified'
                 and public.directory_freshness(c.confirmed_at) <> 'stale')
$$;

-- La clinique voit les médecins liés à elle (même non encore vérifiés), le médecin voit ses cliniques
create or replace function public.doctor_linked_to_my_clinic(p_doctor uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.doctor_practice_sites s join public.clinic_members m on m.clinic_id = s.clinic_id
                 where s.doctor_id = p_doctor and m.user_id = auth.uid())
$$;

create or replace function public.clinic_linked_to_me(p_clinic uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.doctor_practice_sites s join public.doctors d on d.id = s.doctor_id
                 where s.clinic_id = p_clinic and d.user_id = auth.uid())
$$;

-- Jour courant (heure du Mali, UTC+0) au format des horaires
create or replace function public.day_key(p_ts timestamptz default now())
returns text language sql stable as $$
  select (array['mon','tue','wed','thu','fri','sat','sun'])[extract(isodow from p_ts at time zone 'UTC')::int]
$$;

-- Validation d'un planning {"mon":[["08:00","12:00"],["15:00","18:00"]], ...}
create or replace function public.valid_schedule(p jsonb)
returns boolean language plpgsql immutable as $$
declare k text; slot jsonb; n int := 0;
begin
  if p is null or jsonb_typeof(p) <> 'object' then return false; end if;
  for k in select jsonb_object_keys(p) loop
    if k not in ('mon','tue','wed','thu','fri','sat','sun') then return false; end if;
    if jsonb_typeof(p -> k) <> 'array' or jsonb_array_length(p -> k) > 3 then return false; end if;
    for slot in select * from jsonb_array_elements(p -> k) loop
      if jsonb_typeof(slot) <> 'array' or jsonb_array_length(slot) <> 2
         or not (slot ->> 0) ~ '^([01]\d|2[0-3]):[0-5]\d$' or not (slot ->> 1) ~ '^([01]\d|2[0-3]):[0-5]\d$|^24:00$'
         or (slot ->> 0) >= (slot ->> 1) then
        return false;
      end if;
      n := n + 1;
    end loop;
  end loop;
  return true;
end $$;

create or replace function public.notify_clinic(p_clinic uuid, p_kind text, p_title text, p_body text, p_link text default null)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, kind, title, body, link)
  select m.user_id, p_kind, p_title, p_body, p_link from public.clinic_members m where m.clinic_id = p_clinic;
$$;
revoke execute on function public.notify_clinic(uuid, text, text, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Médecin : référencement et gestion de sa fiche
-- ---------------------------------------------------------------------------
create or replace function public._set_doctor_specialties(p_doctor uuid, p_specialties jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if p_specialties is null or jsonb_typeof(p_specialties) <> 'array' then raise exception 'PP422: choisissez au moins une spécialité'; end if;
  n := jsonb_array_length(p_specialties);
  if n < 1 then raise exception 'PP422: choisissez au moins une spécialité'; end if;
  if n > 4 then raise exception 'PP422: 4 spécialités maximum'; end if;
  if exists (select 1 from jsonb_array_elements_text(p_specialties) s
             where not exists (select 1 from public.medical_specialties m where m.id::text = s and m.is_active)) then
    raise exception 'PP422: spécialité inconnue';
  end if;
  delete from public.doctor_specialties where doctor_id = p_doctor
    and specialty_id::text not in (select jsonb_array_elements_text(p_specialties));
  insert into public.doctor_specialties (doctor_id, specialty_id)
  select p_doctor, s::uuid from jsonb_array_elements_text(p_specialties) s
  on conflict do nothing;
end $$;
revoke execute on function public._set_doctor_specialties(uuid, jsonb) from public, anon, authenticated;

create or replace function public.register_doctor(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_auth(); did uuid; langs text[];
begin
  if exists (select 1 from public.doctors where user_id = uid) then
    raise exception 'PP409: une fiche médecin existe déjà pour ce compte';
  end if;
  if coalesce((p ->> 'consent')::boolean, false) is not true then
    raise exception 'PP422: votre accord pour la publication de vos coordonnées professionnelles est obligatoire';
  end if;
  if coalesce(trim(p ->> 'order_number'), '') = '' then
    raise exception 'PP422: le numéro d''inscription à l''Ordre des médecins est obligatoire';
  end if;
  langs := coalesce(array(select jsonb_array_elements_text(p -> 'languages')), array['fr']);
  if cardinality(langs) = 0 then langs := array['fr']; end if;

  insert into public.doctors (user_id, title, display_name, gender, languages, publication_consent_at)
  values (uid, coalesce(nullif(p ->> 'title', ''), 'Dr'), trim(p ->> 'display_name'), nullif(p ->> 'gender', ''), langs, now())
  returning id into did;
  insert into public.doctor_private (doctor_id, order_number, personal_phone)
  values (did, trim(p ->> 'order_number'), nullif(p ->> 'personal_phone', ''));
  perform public._set_doctor_specialties(did, p -> 'specialties');
  insert into public.directory_verifications (doctor_id, decision, reason, reviewer_id) values (did, 'pending', 'Demande de référencement', uid);
  perform public.log_audit('doctor.register', 'doctor', did::text, jsonb_build_object('consent_at', now()));
  return did;
end $$;

create or replace function public.update_doctor(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_auth(); d public.doctors; langs text[]; before_specs jsonb;
begin
  select * into d from public.doctors where user_id = uid for update;
  if d.id is null then raise exception 'PP404: aucune fiche médecin pour ce compte'; end if;
  if d.status = 'suspended' then raise exception 'PP403: fiche suspendue : modification impossible'; end if;
  langs := coalesce(array(select jsonb_array_elements_text(p -> 'languages')), d.languages);
  if cardinality(langs) = 0 then langs := array['fr']; end if;
  select coalesce(jsonb_agg(specialty_id order by specialty_id), '[]') into before_specs from public.doctor_specialties where doctor_id = d.id;
  update public.doctors set title = coalesce(nullif(p ->> 'title', ''), title), display_name = trim(p ->> 'display_name'),
         gender = nullif(p ->> 'gender', ''), languages = langs where id = d.id;
  update public.doctor_private set order_number = coalesce(nullif(trim(p ->> 'order_number'), ''), order_number),
         personal_phone = nullif(p ->> 'personal_phone', ''), updated_at = now() where doctor_id = d.id;
  if p ? 'specialties' then perform public._set_doctor_specialties(d.id, p -> 'specialties'); end if;
  perform public.log_audit('doctor.update', 'doctor', d.id::text,
    jsonb_build_object('specialties_before', before_specs,
      'specialties_after', (select coalesce(jsonb_agg(specialty_id order by specialty_id), '[]') from public.doctor_specialties where doctor_id = d.id)));
end $$;

-- Confirmation périodique « mes informations sont toujours exactes »
create or replace function public.confirm_doctor_info()
returns timestamptz language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_auth(); did uuid;
begin
  update public.doctors set confirmed_at = now(), reminded_at = null where user_id = uid and status <> 'suspended' returning id into did;
  if did is null then raise exception 'PP404: aucune fiche médecin active pour ce compte'; end if;
  perform public.log_audit('doctor.confirm', 'doctor', did::text);
  return now();
end $$;

-- Retrait de l'annuaire (ou republication) à l'initiative du médecin, effet immédiat
create or replace function public.set_doctor_published(p_published boolean)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_auth(); did uuid;
begin
  update public.doctors set is_published = coalesce(p_published, false),
         publication_consent_at = case when p_published then now() else publication_consent_at end
   where user_id = uid returning id into did;
  if did is null then raise exception 'PP404: aucune fiche médecin pour ce compte'; end if;
  perform public.log_audit(case when p_published then 'doctor.publish' else 'doctor.unpublish' end, 'doctor', did::text);
end $$;

create or replace function public.resubmit_doctor()
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_auth(); did uuid;
begin
  update public.doctors set status = 'pending' where user_id = uid and status = 'rejected' returning id into did;
  if did is null then raise exception 'PP409: seule une demande refusée peut être soumise à nouveau'; end if;
  insert into public.directory_verifications (doctor_id, decision, reason, reviewer_id) values (did, 'pending', 'Nouvelle soumission après corrections', uid);
  perform public.log_audit('doctor.resubmit', 'doctor', did::text);
end $$;

create or replace function public.add_doctor_absence(p_starts date, p_ends date, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_auth(); did uuid := public.my_doctor_id(); aid uuid;
begin
  if did is null then raise exception 'PP404: aucune fiche médecin pour ce compte'; end if;
  if p_starts is null or p_ends is null or p_ends < p_starts then raise exception 'PP422: dates d''absence invalides'; end if;
  if p_ends < current_date then raise exception 'PP422: la période d''absence est déjà passée'; end if;
  if p_ends - p_starts > 366 then raise exception 'PP422: une absence ne peut pas dépasser un an'; end if;
  if (select count(*) from public.doctor_absences where doctor_id = did and ends_on >= current_date) >= 10 then
    raise exception 'PP429: 10 absences à venir maximum';
  end if;
  insert into public.doctor_absences (doctor_id, starts_on, ends_on, note) values (did, p_starts, p_ends, nullif(left(trim(p_note), 120), ''))
  returning id into aid;
  return aid;
end $$;

create or replace function public.remove_doctor_absence(p_absence uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_auth();
  delete from public.doctor_absences where id = p_absence and doctor_id = public.my_doctor_id();
  if not found then raise exception 'PP404: absence introuvable'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- Clinique : inscription et gestion
-- ---------------------------------------------------------------------------
create or replace function public._check_location(v_region uuid, v_commune uuid, v_locality uuid)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if v_region is null or not exists (select 1 from public.regions where id = v_region) then raise exception 'PP422: région invalide'; end if;
  if v_commune is not null and not exists (select 1 from public.communes where id = v_commune and region_id = v_region) then
    raise exception 'PP422: la commune ne correspond pas à la région';
  end if;
  if v_locality is not null and (v_commune is null or not exists (select 1 from public.localities where id = v_locality and commune_id = v_commune)) then
    raise exception 'PP422: le quartier ne correspond pas à la commune';
  end if;
end $$;

create or replace function public._clinic_services(p jsonb)
returns text[] language sql immutable as $$
  select coalesce(array(select distinct s from jsonb_array_elements_text(coalesce(p, '[]'::jsonb)) s
    where s in ('laboratoire', 'imagerie', 'maternite', 'hospitalisation', 'bloc_operatoire', 'pharmacie_interne')), '{}')
$$;

create or replace function public.register_clinic(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_auth(); cid uuid;
  v_region uuid := (p ->> 'region_id')::uuid;
  v_commune uuid := nullif(p ->> 'commune_id', '')::uuid;
  v_locality uuid := nullif(p ->> 'locality_id', '')::uuid;
begin
  if (select count(*) from public.clinic_members m join public.clinics c on c.id = m.clinic_id
      where m.user_id = uid and c.status = 'pending') >= 3 then
    raise exception 'PP429: trop de demandes d''inscription en attente';
  end if;
  perform public._check_location(v_region, v_commune, v_locality);
  if coalesce(trim(p ->> 'manager_name'), '') = '' then raise exception 'PP422: le nom du responsable est obligatoire'; end if;
  if not public.valid_schedule(coalesce(p -> 'opening_hours', '{}'::jsonb)) then raise exception 'PP422: horaires invalides'; end if;

  insert into public.clinics (name, kind, address, region_id, commune_id, locality_id, latitude, longitude, phone, whatsapp, email,
                              opening_hours, emergency_24h, services, created_by)
  values (trim(p ->> 'name'), coalesce(nullif(p ->> 'kind', ''), 'clinique'), trim(p ->> 'address'), v_region, v_commune, v_locality,
          nullif(p ->> 'latitude', '')::double precision, nullif(p ->> 'longitude', '')::double precision,
          p ->> 'phone', nullif(p ->> 'whatsapp', ''), nullif(p ->> 'email', ''),
          coalesce(p -> 'opening_hours', '{}'::jsonb), coalesce((p ->> 'emergency_24h')::boolean, false), public._clinic_services(p -> 'services'), uid)
  returning id into cid;
  insert into public.clinic_private (clinic_id, legal_name, license_number, rccm, tax_id, manager_name, manager_phone)
  values (cid, nullif(p ->> 'legal_name', ''), nullif(p ->> 'license_number', ''), nullif(p ->> 'rccm', ''), nullif(p ->> 'tax_id', ''),
          trim(p ->> 'manager_name'), nullif(p ->> 'manager_phone', ''));
  insert into public.clinic_members (clinic_id, user_id, member_role) values (cid, uid, 'owner');
  insert into public.directory_verifications (clinic_id, decision, reason, reviewer_id) values (cid, 'pending', 'Demande d''inscription', uid);
  perform public.log_audit('clinic.register', 'clinic', cid::text);
  return cid;
end $$;

create or replace function public.update_clinic(p_clinic uuid, p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_region uuid := (p ->> 'region_id')::uuid;
  v_commune uuid := nullif(p ->> 'commune_id', '')::uuid;
  v_locality uuid := nullif(p ->> 'locality_id', '')::uuid;
begin
  perform public.require_auth();
  if not public.can_manage_clinic(p_clinic) then raise exception 'PP403: modification impossible (clinique suspendue ou accès refusé)'; end if;
  perform public._check_location(v_region, v_commune, v_locality);
  if not public.valid_schedule(coalesce(p -> 'opening_hours', '{}'::jsonb)) then raise exception 'PP422: horaires invalides'; end if;
  update public.clinics set name = trim(p ->> 'name'), kind = coalesce(nullif(p ->> 'kind', ''), kind), address = trim(p ->> 'address'),
         region_id = v_region, commune_id = v_commune, locality_id = v_locality,
         latitude = nullif(p ->> 'latitude', '')::double precision, longitude = nullif(p ->> 'longitude', '')::double precision,
         phone = p ->> 'phone', whatsapp = nullif(p ->> 'whatsapp', ''), email = nullif(p ->> 'email', ''),
         opening_hours = coalesce(p -> 'opening_hours', '{}'::jsonb), emergency_24h = coalesce((p ->> 'emergency_24h')::boolean, false),
         services = public._clinic_services(p -> 'services')
   where id = p_clinic;
  update public.clinic_private set legal_name = nullif(p ->> 'legal_name', ''), license_number = nullif(p ->> 'license_number', ''),
         rccm = nullif(p ->> 'rccm', ''), tax_id = nullif(p ->> 'tax_id', ''),
         manager_name = coalesce(nullif(trim(p ->> 'manager_name'), ''), manager_name), manager_phone = nullif(p ->> 'manager_phone', ''),
         updated_at = now()
   where clinic_id = p_clinic;
  perform public.log_audit('clinic.update', 'clinic', p_clinic::text);
end $$;

create or replace function public.confirm_clinic_info(p_clinic uuid)
returns timestamptz language plpgsql security definer set search_path = public as $$
begin
  perform public.require_auth();
  if not public.can_manage_clinic(p_clinic) then raise exception 'PP403: accès refusé'; end if;
  update public.clinics set confirmed_at = now(), reminded_at = null where id = p_clinic;
  perform public.log_audit('clinic.confirm', 'clinic', p_clinic::text);
  return now();
end $$;

create or replace function public.resubmit_clinic(p_clinic uuid)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_auth();
begin
  if not public.is_clinic_owner(p_clinic) then raise exception 'PP403: accès refusé'; end if;
  update public.clinics set status = 'pending' where id = p_clinic and status = 'rejected';
  if not found then raise exception 'PP409: seule une demande refusée peut être soumise à nouveau'; end if;
  insert into public.directory_verifications (clinic_id, decision, reason, reviewer_id) values (p_clinic, 'pending', 'Nouvelle soumission après corrections', uid);
  perform public.log_audit('clinic.resubmit', 'clinic', p_clinic::text);
end $$;

create or replace function public.clinic_team(p_clinic uuid)
returns table (user_id uuid, full_name text, email text, member_role text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_clinic_member(p_clinic) or public.is_admin()) then raise exception 'PP403: accès refusé'; end if;
  return query
  select m.user_id, p.full_name, u.email::text, m.member_role, m.created_at
  from public.clinic_members m join public.profiles p on p.id = m.user_id join auth.users u on u.id = m.user_id
  where m.clinic_id = p_clinic order by m.member_role desc, m.created_at;
end $$;

create or replace function public.clinic_add_member(p_clinic uuid, p_email text)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_auth(); target uuid;
begin
  if not public.is_clinic_owner(p_clinic) or not public.can_manage_clinic(p_clinic) then
    raise exception 'PP403: seul le responsable de la clinique peut gérer l''équipe';
  end if;
  select u.id into target from auth.users u join public.profiles p on p.id = u.id
   where lower(u.email) = lower(trim(p_email)) and p.deleted_at is null;
  if target is null then raise exception 'PP404: aucun compte PharmaProxi avec cette adresse ; la personne doit d''abord créer son compte'; end if;
  if (select count(*) from public.clinic_members where clinic_id = p_clinic) >= 20 then raise exception 'PP422: 20 membres maximum'; end if;
  insert into public.clinic_members (clinic_id, user_id, member_role) values (p_clinic, target, 'staff') on conflict do nothing;
  perform public.log_audit('clinic.member_add', 'clinic', p_clinic::text, jsonb_build_object('user', target));
  perform public.notify_user(target, 'clinic_member', 'Vous avez rejoint l''équipe d''une clinique',
    (select name from public.clinics where id = p_clinic), null, '/clinique/' || p_clinic);
  return target;
end $$;

create or replace function public.clinic_remove_member(p_clinic uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_auth();
  if not public.is_clinic_owner(p_clinic) and not public.is_admin() then raise exception 'PP403: seul le responsable de la clinique peut gérer l''équipe'; end if;
  if exists (select 1 from public.clinic_members where clinic_id = p_clinic and user_id = p_user and member_role = 'owner') then
    raise exception 'PP409: le responsable ne peut pas être retiré de l''équipe';
  end if;
  delete from public.clinic_members where clinic_id = p_clinic and user_id = p_user;
  if not found then raise exception 'PP404: membre introuvable'; end if;
  perform public.log_audit('clinic.member_remove', 'clinic', p_clinic::text, jsonb_build_object('user', p_user));
end $$;

-- ---------------------------------------------------------------------------
-- Lieux d'exercice : proposés par une partie, acceptés par l'autre
-- ---------------------------------------------------------------------------
create or replace function public.doctor_propose_site(p_clinic uuid, p_schedule jsonb, p_phone text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_auth(); d public.doctors; sid uuid; cstatus public.pharmacy_status; cname text;
begin
  select * into d from public.doctors where user_id = uid;
  if d.id is null then raise exception 'PP404: créez d''abord votre fiche médecin'; end if;
  if d.status = 'suspended' then raise exception 'PP403: fiche suspendue'; end if;
  select status, name into cstatus, cname from public.clinics where id = p_clinic;
  if cstatus is null then raise exception 'PP404: clinique introuvable'; end if;
  if cstatus not in ('verified', 'pending') and not public.is_clinic_member(p_clinic) then raise exception 'PP409: cette clinique ne peut pas recevoir de demande'; end if;
  if not public.valid_schedule(coalesce(p_schedule, '{}'::jsonb)) or coalesce(p_schedule, '{}'::jsonb) = '{}'::jsonb then
    raise exception 'PP422: indiquez au moins un jour et des horaires valides';
  end if;
  if p_phone is not null and p_phone <> '' and not public.valid_phone(p_phone) then raise exception 'PP422: numéro de rendez-vous invalide'; end if;
  if (select count(*) from public.doctor_practice_sites where doctor_id = d.id) >= 8 then raise exception 'PP422: 8 lieux d''exercice maximum'; end if;
  insert into public.doctor_practice_sites (doctor_id, clinic_id, schedule, appointment_phone, doctor_accepted,
                                            clinic_accepted, created_by)
  values (d.id, p_clinic, p_schedule, nullif(p_phone, ''), true, public.is_clinic_member(p_clinic), uid)
  on conflict (doctor_id, clinic_id) do update set schedule = excluded.schedule, appointment_phone = excluded.appointment_phone, doctor_accepted = true
  returning id into sid;
  if not public.is_clinic_member(p_clinic) then
    perform public.notify_clinic(p_clinic, 'directory_site', 'Un médecin demande à être rattaché',
      d.title || ' ' || d.display_name || ' indique consulter dans votre établissement.', '/clinique/' || p_clinic || '#medecins');
  end if;
  perform public.log_audit('site.propose', 'doctor', d.id::text, jsonb_build_object('clinic', p_clinic));
  return sid;
end $$;

create or replace function public.clinic_invite_doctor(p_clinic uuid, p_doctor uuid, p_schedule jsonb, p_phone text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_auth(); sid uuid; duser uuid; cname text;
begin
  if not public.can_manage_clinic(p_clinic) then raise exception 'PP403: accès refusé'; end if;
  select user_id into duser from public.doctors where id = p_doctor and status = 'verified';
  if duser is null then raise exception 'PP404: seul un médecin déjà vérifié peut être invité'; end if;
  if not public.valid_schedule(coalesce(p_schedule, '{}'::jsonb)) or coalesce(p_schedule, '{}'::jsonb) = '{}'::jsonb then
    raise exception 'PP422: indiquez au moins un jour et des horaires valides';
  end if;
  if p_phone is not null and p_phone <> '' and not public.valid_phone(p_phone) then raise exception 'PP422: numéro de rendez-vous invalide'; end if;
  if (select count(*) from public.doctor_practice_sites where clinic_id = p_clinic) >= 200 then raise exception 'PP422: nombre maximal de médecins atteint'; end if;
  select name into cname from public.clinics where id = p_clinic;
  insert into public.doctor_practice_sites (doctor_id, clinic_id, schedule, appointment_phone, doctor_accepted, clinic_accepted, created_by)
  values (p_doctor, p_clinic, p_schedule, nullif(p_phone, ''), duser = uid, true, uid)
  on conflict (doctor_id, clinic_id) do update set schedule = excluded.schedule, appointment_phone = excluded.appointment_phone, clinic_accepted = true
  returning id into sid;
  if duser <> uid then
    perform public.notify_user(duser, 'directory_site', 'Invitation d''une clinique', cname || ' vous propose un planning de consultation : acceptez-le pour le publier.', null, '/medecin#lieux');
  end if;
  perform public.log_audit('site.invite', 'clinic', p_clinic::text, jsonb_build_object('doctor', p_doctor));
  return sid;
end $$;

-- Acceptation par la partie qui n'a pas encore accepté
create or replace function public.accept_practice_site(p_site uuid)
returns void language plpgsql security definer set search_path = public as $$
declare s public.doctor_practice_sites; is_doc boolean; is_cli boolean;
begin
  perform public.require_auth();
  select * into s from public.doctor_practice_sites where id = p_site for update;
  if s.id is null then raise exception 'PP404: lieu d''exercice introuvable'; end if;
  is_doc := s.doctor_id = public.my_doctor_id();
  is_cli := public.can_manage_clinic(s.clinic_id);
  if not is_doc and not is_cli then raise exception 'PP403: accès refusé'; end if;
  update public.doctor_practice_sites
     set doctor_accepted = doctor_accepted or is_doc, clinic_accepted = clinic_accepted or is_cli
   where id = p_site;
  perform public.log_audit('site.accept', 'practice_site', p_site::text, jsonb_build_object('by', case when is_doc then 'doctor' else 'clinic' end));
end $$;

create or replace function public.update_practice_site(p_site uuid, p_schedule jsonb, p_phone text default null)
returns void language plpgsql security definer set search_path = public as $$
declare s public.doctor_practice_sites;
begin
  perform public.require_auth();
  select * into s from public.doctor_practice_sites where id = p_site for update;
  if s.id is null then raise exception 'PP404: lieu d''exercice introuvable'; end if;
  if s.doctor_id is distinct from public.my_doctor_id() and not public.can_manage_clinic(s.clinic_id) then raise exception 'PP403: accès refusé'; end if;
  if not public.valid_schedule(coalesce(p_schedule, '{}'::jsonb)) or coalesce(p_schedule, '{}'::jsonb) = '{}'::jsonb then
    raise exception 'PP422: indiquez au moins un jour et des horaires valides';
  end if;
  if p_phone is not null and p_phone <> '' and not public.valid_phone(p_phone) then raise exception 'PP422: numéro de rendez-vous invalide'; end if;
  update public.doctor_practice_sites set schedule = p_schedule, appointment_phone = nullif(p_phone, '') where id = p_site;
  perform public.log_audit('site.update', 'practice_site', p_site::text);
end $$;

create or replace function public.remove_practice_site(p_site uuid)
returns void language plpgsql security definer set search_path = public as $$
declare s public.doctor_practice_sites;
begin
  perform public.require_auth();
  select * into s from public.doctor_practice_sites where id = p_site;
  if s.id is null then raise exception 'PP404: lieu d''exercice introuvable'; end if;
  if s.doctor_id is distinct from public.my_doctor_id() and not public.is_clinic_member(s.clinic_id) and not public.is_admin() then
    raise exception 'PP403: accès refusé';
  end if;
  delete from public.doctor_practice_sites where id = p_site;
  perform public.log_audit('site.remove', 'practice_site', p_site::text, jsonb_build_object('doctor', s.doctor_id, 'clinic', s.clinic_id));
end $$;

-- ---------------------------------------------------------------------------
-- Administration : vérification sur pièces (listes de contrôle en 5 points)
-- ---------------------------------------------------------------------------
create or replace function public._review_transition_ok(cur public.pharmacy_status, nxt public.pharmacy_status)
returns boolean language sql immutable as $$
  select (cur = 'pending' and nxt in ('verified', 'rejected')) or (cur = 'verified' and nxt = 'suspended')
      or (cur = 'suspended' and nxt in ('verified', 'rejected'))
$$;

create or replace function public.admin_review_doctor(p_doctor uuid, p_decision public.pharmacy_status, p_reason text default null, p_checklist jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_admin(); d public.doctors; k text;
begin
  select * into d from public.doctors where id = p_doctor for update;
  if d.id is null then raise exception 'PP404: médecin introuvable'; end if;
  if not public._review_transition_ok(d.status, p_decision) then raise exception 'PP409: transition % -> % non autorisée', d.status, p_decision; end if;
  if p_decision in ('rejected', 'suspended') and coalesce(trim(p_reason), '') = '' then raise exception 'PP422: un motif est obligatoire pour un refus ou une suspension'; end if;
  if p_decision = 'verified' and d.status = 'pending' then
    if not exists (select 1 from public.doctor_documents where doctor_id = p_doctor) then raise exception 'PP422: aucun justificatif déposé, validation impossible'; end if;
    foreach k in array array['ordre', 'diplome', 'identite', 'lieu', 'telephone'] loop
      if coalesce((p_checklist ->> k)::boolean, false) is not true then raise exception 'PP422: cochez les 5 points de contrôle avant de valider'; end if;
    end loop;
  end if;
  update public.doctors set status = p_decision, verified_at = case when p_decision = 'verified' then now() else verified_at end,
         confirmed_at = case when p_decision = 'verified' then now() else confirmed_at end
   where id = p_doctor;
  insert into public.directory_verifications (doctor_id, decision, reason, checklist, reviewer_id)
  values (p_doctor, p_decision, p_reason, coalesce(p_checklist, '{}'::jsonb), uid);
  perform public.log_audit('doctor.review', 'doctor', p_doctor::text, jsonb_build_object('from', d.status, 'to', p_decision, 'reason', p_reason));
  perform public.notify_user(d.user_id, 'directory_review',
    case p_decision when 'verified' then 'Votre fiche médecin est publiée' when 'rejected' then 'Référencement refusé'
                    when 'suspended' then 'Fiche médecin suspendue' else 'Statut mis à jour' end,
    coalesce(p_reason, d.title || ' ' || d.display_name), null, '/medecin');
end $$;

create or replace function public.admin_review_clinic(p_clinic uuid, p_decision public.pharmacy_status, p_reason text default null, p_checklist jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_admin(); c public.clinics; k text;
begin
  select * into c from public.clinics where id = p_clinic for update;
  if c.id is null then raise exception 'PP404: clinique introuvable'; end if;
  if not public._review_transition_ok(c.status, p_decision) then raise exception 'PP409: transition % -> % non autorisée', c.status, p_decision; end if;
  if p_decision in ('rejected', 'suspended') and coalesce(trim(p_reason), '') = '' then raise exception 'PP422: un motif est obligatoire pour un refus ou une suspension'; end if;
  if p_decision = 'verified' and c.status = 'pending' then
    if not exists (select 1 from public.clinic_documents where clinic_id = p_clinic) then raise exception 'PP422: aucun justificatif déposé, validation impossible'; end if;
    foreach k in array array['autorisation', 'existence_legale', 'responsable', 'adresse', 'telephone'] loop
      if coalesce((p_checklist ->> k)::boolean, false) is not true then raise exception 'PP422: cochez les 5 points de contrôle avant de valider'; end if;
    end loop;
  end if;
  update public.clinics set status = p_decision, verified_at = case when p_decision = 'verified' then now() else verified_at end,
         confirmed_at = case when p_decision = 'verified' then now() else confirmed_at end
   where id = p_clinic;
  insert into public.directory_verifications (clinic_id, decision, reason, checklist, reviewer_id)
  values (p_clinic, p_decision, p_reason, coalesce(p_checklist, '{}'::jsonb), uid);
  perform public.log_audit('clinic.review', 'clinic', p_clinic::text, jsonb_build_object('from', c.status, 'to', p_decision, 'reason', p_reason));
  perform public.notify_clinic(p_clinic, 'directory_review',
    case p_decision when 'verified' then 'Votre établissement est publié' when 'rejected' then 'Inscription refusée'
                    when 'suspended' then 'Établissement suspendu' else 'Statut mis à jour' end,
    coalesce(p_reason, c.name), '/clinique/' || p_clinic);
end $$;

create or replace function public.admin_save_specialty(p_id uuid, p_code text, p_name text, p_family text, p_description text, p_sort int, p_active boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare sid uuid;
begin
  perform public.require_admin();
  if p_id is null then
    insert into public.medical_specialties (code, name, family, description, sort_order, is_active)
    values (lower(trim(p_code)), trim(p_name), trim(p_family), nullif(trim(p_description), ''), coalesce(p_sort, 100), coalesce(p_active, true))
    returning id into sid;
  else
    update public.medical_specialties set name = trim(p_name), family = trim(p_family), description = nullif(trim(p_description), ''),
           sort_order = coalesce(p_sort, sort_order), is_active = coalesce(p_active, is_active)
     where id = p_id returning id into sid;
    if sid is null then raise exception 'PP404: spécialité introuvable'; end if;
  end if;
  perform public.log_audit('specialty.save', 'specialty', sid::text, jsonb_build_object('name', p_name, 'active', p_active));
  return sid;
end $$;

-- ---------------------------------------------------------------------------
-- Recherche publique
-- ---------------------------------------------------------------------------
create or replace function public.search_doctors(
  p_query text default null, p_specialty uuid default null, p_region uuid default null, p_commune uuid default null,
  p_clinic uuid default null, p_day text default null, p_today boolean default false, p_language text default null,
  p_gender text default null, p_lat double precision default null, p_lng double precision default null,
  p_sort text default 'name', p_limit int default 20, p_offset int default 0)
returns table (doctor_id uuid, title text, display_name text, gender text, languages text[], specialties jsonb, sites jsonb,
               distance_km double precision, confirmed_at timestamptz, freshness text, absent_until date, total_count bigint)
language plpgsql security definer set search_path = public, extensions as $$
declare q text := nullif(public.normalize_text(left(coalesce(p_query, ''), 80)), ''); today text := public.day_key(); lim int := least(greatest(coalesce(p_limit, 20), 1), 50); n int;
begin
  if p_day is not null and p_day not in ('mon','tue','wed','thu','fri','sat','sun') then p_day := null; end if;
  return query
  with base as (
    select d.*,
           (select coalesce(jsonb_agg(jsonb_build_object('id', ms.id, 'name', ms.name) order by ms.sort_order), '[]')
              from public.doctor_specialties ds join public.medical_specialties ms on ms.id = ds.specialty_id where ds.doctor_id = d.id) as specs,
           (select a.ends_on from public.doctor_absences a where a.doctor_id = d.id and current_date between a.starts_on and a.ends_on
             order by a.ends_on desc limit 1) as absent
    from public.doctors d
    where d.status = 'verified' and d.is_published and public.directory_freshness(d.confirmed_at) <> 'stale'
  ), sites as (
    select s.doctor_id, s.clinic_id, s.schedule, s.appointment_phone, c.name as clinic_name, c.region_id, c.commune_id, c.phone as clinic_phone,
           cm.name as commune_name, r.name as region_name, public.distance_km(p_lat, p_lng, c.latitude, c.longitude) as dist
    from public.doctor_practice_sites s join public.clinics c on c.id = s.clinic_id
    join public.regions r on r.id = c.region_id left join public.communes cm on cm.id = c.commune_id
    where s.doctor_accepted and s.clinic_accepted and c.status = 'verified' and public.directory_freshness(c.confirmed_at) <> 'stale'
  ), matched as (
    select b.*,
      (select coalesce(jsonb_agg(jsonb_build_object('clinic_id', st.clinic_id, 'clinic_name', st.clinic_name, 'commune', st.commune_name,
              'region', st.region_name, 'days', (select coalesce(jsonb_agg(k), '[]') from jsonb_object_keys(st.schedule) k),
              'phone', coalesce(st.appointment_phone, st.clinic_phone), 'distance_km', st.dist) order by st.dist nulls last, st.clinic_name), '[]')
         from sites st where st.doctor_id = b.id) as site_list,
      (select min(st.dist) from sites st where st.doctor_id = b.id) as min_dist
    from base b
    where (p_specialty is null or exists (select 1 from public.doctor_specialties ds where ds.doctor_id = b.id and ds.specialty_id = p_specialty))
      and (p_language is null or p_language = any(b.languages))
      and (p_gender is null or b.gender = p_gender)
      and (q is null
           or public.normalize_text(b.display_name) like '%' || q || '%'
           or extensions.word_similarity(q, public.normalize_text(b.display_name)) > 0.45
           or exists (select 1 from public.doctor_specialties ds join public.medical_specialties ms on ms.id = ds.specialty_id
                      where ds.doctor_id = b.id and (public.normalize_text(ms.name) like '%' || q || '%'
                        or extensions.word_similarity(q, public.normalize_text(ms.name)) > 0.45))
           or exists (select 1 from sites st where st.doctor_id = b.id and public.normalize_text(st.clinic_name) like '%' || q || '%'))
      and (p_region is null or exists (select 1 from sites st where st.doctor_id = b.id and st.region_id = p_region))
      and (p_commune is null or exists (select 1 from sites st where st.doctor_id = b.id and st.commune_id = p_commune))
      and (p_clinic is null or exists (select 1 from sites st where st.doctor_id = b.id and st.clinic_id = p_clinic))
      and (p_day is null or exists (select 1 from sites st where st.doctor_id = b.id and st.schedule ? p_day))
      and (not coalesce(p_today, false) or (b.absent is null and exists (select 1 from sites st where st.doctor_id = b.id and st.schedule ? today)))
  )
  select m.id, m.title, m.display_name, m.gender, m.languages, m.specs, m.site_list, m.min_dist, m.confirmed_at,
         public.directory_freshness(m.confirmed_at), m.absent, count(*) over ()
  from matched m
  order by case when p_sort = 'distance' then coalesce(m.min_dist, 1e9) end asc, public.normalize_text(m.display_name) asc, m.id
  limit lim offset greatest(coalesce(p_offset, 0), 0);
  get diagnostics n = row_count;
  -- Journal anonyme (aucun identifiant) : mesure des besoins non couverts
  if coalesce(p_offset, 0) = 0 and (q is not null or p_specialty is not null) then
    insert into public.search_logs (query_normalized, region_id, commune_id, result_count, kind)
    values (coalesce(q, (select public.normalize_text(name) from public.medical_specialties where id = p_specialty)), p_region, p_commune, n, 'doctor');
  end if;
end $$;

create or replace function public.search_clinics(
  p_query text default null, p_region uuid default null, p_commune uuid default null, p_specialty uuid default null,
  p_emergency boolean default false, p_lat double precision default null, p_lng double precision default null,
  p_sort text default 'name', p_limit int default 20, p_offset int default 0)
returns table (clinic_id uuid, name text, kind text, address text, commune_name text, region_name text, phone text,
               latitude double precision, longitude double precision, emergency_24h boolean, services text[], specialties jsonb,
               doctors_count bigint, is_open boolean, distance_km double precision, confirmed_at timestamptz, freshness text, total_count bigint)
language plpgsql security definer set search_path = public, extensions as $$
declare q text := nullif(public.normalize_text(left(coalesce(p_query, ''), 80)), ''); lim int := least(greatest(coalesce(p_limit, 20), 1), 50); n int;
begin
  return query
  with pub_sites as (
    select s.clinic_id, s.doctor_id from public.doctor_practice_sites s join public.doctors d on d.id = s.doctor_id
    where s.doctor_accepted and s.clinic_accepted and d.status = 'verified' and d.is_published and public.directory_freshness(d.confirmed_at) <> 'stale'
  )
  select c.id, c.name, c.kind, c.address, cm.name, r.name, c.phone, c.latitude, c.longitude, c.emergency_24h, c.services,
         (select coalesce(jsonb_agg(distinct jsonb_build_object('id', ms.id, 'name', ms.name)), '[]')
            from pub_sites ps join public.doctor_specialties ds on ds.doctor_id = ps.doctor_id join public.medical_specialties ms on ms.id = ds.specialty_id
           where ps.clinic_id = c.id),
         (select count(*) from pub_sites ps where ps.clinic_id = c.id),
         public.is_open_now(c.opening_hours, true),
         public.distance_km(p_lat, p_lng, c.latitude, c.longitude), c.confirmed_at, public.directory_freshness(c.confirmed_at), count(*) over ()
  from public.clinics c join public.regions r on r.id = c.region_id left join public.communes cm on cm.id = c.commune_id
  where c.status = 'verified' and public.directory_freshness(c.confirmed_at) <> 'stale'
    and (p_region is null or c.region_id = p_region) and (p_commune is null or c.commune_id = p_commune)
    and (not coalesce(p_emergency, false) or c.emergency_24h)
    and (q is null or public.normalize_text(c.name) like '%' || q || '%' or extensions.word_similarity(q, public.normalize_text(c.name)) > 0.45)
    and (p_specialty is null or exists (select 1 from pub_sites ps join public.doctor_specialties ds on ds.doctor_id = ps.doctor_id
                                        where ps.clinic_id = c.id and ds.specialty_id = p_specialty))
  order by case when p_sort = 'distance' then coalesce(public.distance_km(p_lat, p_lng, c.latitude, c.longitude), 1e9) end asc,
           public.normalize_text(c.name), c.id
  limit lim offset greatest(coalesce(p_offset, 0), 0);
  get diagnostics n = row_count;
  if coalesce(p_offset, 0) = 0 and q is not null then
    insert into public.search_logs (query_normalized, region_id, commune_id, result_count, kind) values (q, p_region, p_commune, n, 'clinic');
  end if;
end $$;

-- Pharmacies vérifiées les plus proches d'un point (fiche clinique)
create or replace function public.nearby_pharmacies(p_lat double precision, p_lng double precision, p_limit int default 4)
returns table (id uuid, name text, address text, phone text, is_open boolean, distance_km double precision,
               latitude double precision, longitude double precision)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, p.address, p.phone, public.is_open_now(p.opening_hours, p.hours_verified),
         public.distance_km(p_lat, p_lng, p.latitude, p.longitude), p.latitude, p.longitude
  from public.pharmacies p
  where p_lat is not null and p_lng is not null and p.status = 'verified' and p.latitude is not null
    and public.distance_km(p_lat, p_lng, p.latitude, p.longitude) <= 10
  order by public.is_open_now(p.opening_hours, p.hours_verified) desc nulls last, public.distance_km(p_lat, p_lng, p.latitude, p.longitude)
  limit least(greatest(coalesce(p_limit, 4), 1), 10)
$$;

-- Médecins vérifiés que la clinique peut inviter (recherche par nom)
create or replace function public.find_doctors_to_invite(p_clinic uuid, p_query text)
returns table (doctor_id uuid, title text, display_name text, specialties text)
language plpgsql stable security definer set search_path = public, extensions as $$
declare q text := nullif(public.normalize_text(left(coalesce(p_query, ''), 80)), '');
begin
  if not public.can_manage_clinic(p_clinic) then raise exception 'PP403: accès refusé'; end if;
  if q is null or char_length(q) < 2 then return; end if;
  return query
  select d.id, d.title, d.display_name,
         (select string_agg(ms.name, ', ' order by ms.sort_order) from public.doctor_specialties ds join public.medical_specialties ms on ms.id = ds.specialty_id where ds.doctor_id = d.id)
  from public.doctors d
  where d.status = 'verified' and (public.normalize_text(d.display_name) like '%' || q || '%' or extensions.word_similarity(q, public.normalize_text(d.display_name)) > 0.45)
    and not exists (select 1 from public.doctor_practice_sites s where s.doctor_id = d.id and s.clinic_id = p_clinic)
  order by public.normalize_text(d.display_name) limit 20;
end $$;

-- ---------------------------------------------------------------------------
-- Rappels de confirmation (appelés par la maintenance planifiée)
-- ---------------------------------------------------------------------------
create or replace function public.directory_reminders()
returns int language plpgsql security definer set search_path = public as $$
declare n int := 0; r record;
begin
  for r in select id, user_id from public.doctors
            where status = 'verified' and public.directory_freshness(confirmed_at) <> 'fresh'
              and (reminded_at is null or reminded_at < now() - interval '30 days')
            limit 500 loop
    perform public.notify_user(r.user_id, 'directory_confirm', 'Vos informations sont-elles toujours exactes ?',
      'Confirmez vos lieux et jours de consultation pour que votre fiche reste publiée.', null, '/medecin');
    update public.doctors set reminded_at = now() where id = r.id;
    n := n + 1;
  end loop;
  for r in select id from public.clinics
            where status = 'verified' and public.directory_freshness(confirmed_at) <> 'fresh'
              and (reminded_at is null or reminded_at < now() - interval '30 days')
            limit 500 loop
    perform public.notify_clinic(r.id, 'directory_confirm', 'Les informations de votre établissement sont-elles à jour ?',
      'Confirmez-les pour que votre fiche reste publiée dans l''annuaire.', '/clinique/' || r.id);
    update public.clinics set reminded_at = now() where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.directory_reminders() from public, anon, authenticated;

create or replace function public.run_maintenance()
returns jsonb language plpgsql security definer set search_path = public as $$
declare expired int; rl int; logs int; notifs int; outbox int; issues int; reminders int;
begin
  expired := public.expire_overdue_orders();
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
  values (expired, jsonb_build_object('rate_limits', rl, 'search_logs', logs, 'notifications', notifs, 'outbox', outbox, 'directory_reminders', reminders), issues);
  delete from public.maintenance_runs where ran_at < now() - interval '30 days';
  return jsonb_build_object('expired', expired, 'purged', jsonb_build_object('rate_limits', rl, 'search_logs', logs, 'notifications', notifs,
    'outbox', outbox, 'directory_reminders', reminders), 'critical_issues', issues);
end $$;
revoke execute on function public.run_maintenance() from public, anon, authenticated;
grant execute on function public.run_maintenance() to service_role;

-- ---------------------------------------------------------------------------
-- Transfert de titularité d'une pharmacie (administration)
-- ---------------------------------------------------------------------------
create or replace function public.admin_transfer_pharmacy_owner(p_pharmacy uuid, p_email text, p_reason text)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_admin(); target uuid; old_owner uuid;
begin
  if coalesce(trim(p_reason), '') = '' then raise exception 'PP422: un motif est obligatoire (justificatifs du nouveau titulaire vérifiés)'; end if;
  if not exists (select 1 from public.pharmacies where id = p_pharmacy) then raise exception 'PP404: pharmacie introuvable'; end if;
  select u.id into target from auth.users u join public.profiles p on p.id = u.id where lower(u.email) = lower(trim(p_email)) and p.deleted_at is null;
  if target is null then raise exception 'PP404: aucun compte PharmaProxi avec cette adresse'; end if;
  select user_id into old_owner from public.pharmacy_members where pharmacy_id = p_pharmacy and member_role = 'owner' limit 1;
  if old_owner = target then raise exception 'PP409: cette personne est déjà titulaire'; end if;
  update public.pharmacy_members set member_role = 'staff' where pharmacy_id = p_pharmacy and member_role = 'owner';
  insert into public.pharmacy_members (pharmacy_id, user_id, member_role) values (p_pharmacy, target, 'owner')
  on conflict (pharmacy_id, user_id) do update set member_role = 'owner';
  insert into public.user_roles (user_id, role, granted_by) values (target, 'pharmacist', uid) on conflict do nothing;
  perform public.log_audit('pharmacy.owner_transfer', 'pharmacy', p_pharmacy::text,
    jsonb_build_object('from', old_owner, 'to', target, 'reason', p_reason));
  perform public.notify_user(target, 'pharmacy_member', 'Vous êtes désormais titulaire d''une pharmacie',
    (select name from public.pharmacies where id = p_pharmacy), null, '/pharmacien');
  return target;
end $$;

-- ---------------------------------------------------------------------------
-- Stockage privé des justificatifs : chemin = doctor/<id>/<fichier> ou clinic/<id>/<fichier>
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('directory-documents', 'directory-documents', false, 5242880, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create or replace function public.can_upload_directory_doc(p_name text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare parts text[] := storage.foldername(p_name); oid uuid;
begin
  if parts is null or array_length(parts, 1) < 2 then return false; end if;
  begin oid := parts[2]::uuid; exception when others then return false; end;
  if parts[1] = 'doctor' then
    return exists (select 1 from public.doctors where id = oid and user_id = auth.uid() and status <> 'suspended');
  elsif parts[1] = 'clinic' then
    return public.can_manage_clinic(oid) and public.is_clinic_owner(oid);
  end if;
  return false;
end $$;

create or replace function public.can_read_directory_doc(p_name text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare parts text[] := storage.foldername(p_name); oid uuid;
begin
  if public.is_admin() then return true; end if;
  if parts is null or array_length(parts, 1) < 2 then return false; end if;
  begin oid := parts[2]::uuid; exception when others then return false; end;
  if parts[1] = 'doctor' then return exists (select 1 from public.doctors where id = oid and user_id = auth.uid()); end if;
  if parts[1] = 'clinic' then return public.is_clinic_member(oid); end if;
  return false;
end $$;

create policy "pp_dir_docs_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'directory-documents' and public.can_upload_directory_doc(name));
create policy "pp_dir_docs_select" on storage.objects for select to authenticated
  using (bucket_id = 'directory-documents' and public.can_read_directory_doc(name));
create policy "pp_dir_docs_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'directory-documents' and public.can_upload_directory_doc(name));

-- ---------------------------------------------------------------------------
-- Sécurité au niveau des lignes
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['medical_specialties', 'clinics', 'clinic_private', 'clinic_members', 'clinic_documents', 'doctors',
    'doctor_private', 'doctor_specialties', 'doctor_documents', 'doctor_practice_sites', 'doctor_absences', 'directory_verifications'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

create policy "lecture publique" on public.medical_specialties for select using (is_active or public.is_admin());

create policy "fiches publiées, membres, médecins liés, admin" on public.clinics for select
  using (public.clinic_is_public(id) or public.is_clinic_member(id) or public.clinic_linked_to_me(id) or public.is_admin());
create policy "membres et admin" on public.clinic_private for select using (public.is_clinic_member(clinic_id) or public.is_admin());
create policy "membres et admin" on public.clinic_members for select using (user_id = auth.uid() or public.is_clinic_member(clinic_id) or public.is_admin());
create policy "membres et admin" on public.clinic_documents for select using (public.is_clinic_member(clinic_id) or public.is_admin());
create policy "responsable dépose" on public.clinic_documents for insert
  with check (public.can_manage_clinic(clinic_id) and public.is_clinic_owner(clinic_id) and uploaded_by = auth.uid()
              and storage_path like 'clinic/' || clinic_id::text || '/%');
create policy "responsable retire si en attente" on public.clinic_documents for delete
  using (public.is_clinic_owner(clinic_id) and exists (select 1 from public.clinics c where c.id = clinic_id and c.status in ('pending', 'rejected')));

create policy "fiches publiées, soi-même, cliniques liées, admin" on public.doctors for select
  using (public.doctor_is_public(id) or user_id = auth.uid() or public.doctor_linked_to_my_clinic(id) or public.is_admin());
create policy "soi-même et admin" on public.doctor_private for select
  using (exists (select 1 from public.doctors d where d.id = doctor_id and d.user_id = auth.uid()) or public.is_admin());
create policy "selon la fiche" on public.doctor_specialties for select
  using (exists (select 1 from public.doctors d where d.id = doctor_id));
create policy "soi-même et admin" on public.doctor_documents for select
  using (exists (select 1 from public.doctors d where d.id = doctor_id and d.user_id = auth.uid()) or public.is_admin());
create policy "médecin dépose" on public.doctor_documents for insert
  with check (exists (select 1 from public.doctors d where d.id = doctor_id and d.user_id = auth.uid() and d.status <> 'suspended')
              and uploaded_by = auth.uid() and storage_path like 'doctor/' || doctor_id::text || '/%');
create policy "médecin retire si en attente" on public.doctor_documents for delete
  using (exists (select 1 from public.doctors d where d.id = doctor_id and d.user_id = auth.uid() and d.status in ('pending', 'rejected')));

create policy "publics, parties concernées, admin" on public.doctor_practice_sites for select
  using ((doctor_accepted and clinic_accepted and public.doctor_is_public(doctor_id) and public.clinic_is_public(clinic_id))
         or doctor_id = public.my_doctor_id() or public.is_clinic_member(clinic_id) or public.is_admin());
create policy "selon la fiche" on public.doctor_absences for select
  using (exists (select 1 from public.doctors d where d.id = doctor_id));
create policy "concernés et admin" on public.directory_verifications for select
  using (public.is_admin() or (doctor_id is not null and doctor_id = public.my_doctor_id())
         or (clinic_id is not null and public.is_clinic_member(clinic_id)));

-- Signalements : le médecin et la clinique concernés voient ceux qui les visent
drop policy "auteur, pharmacie concernée, admin" on public.reports;
create policy "auteur, professionnel concerné, admin" on public.reports for select
  using (reporter_id = auth.uid() or public.is_admin()
         or (pharmacy_id is not null and public.is_pharmacy_member(pharmacy_id))
         or (doctor_id is not null and doctor_id = public.my_doctor_id())
         or (clinic_id is not null and public.is_clinic_member(clinic_id)));

-- Privilèges : écritures exclusivement par fonctions (sauf dépôt de justificatifs)
revoke insert, update, delete, truncate on public.medical_specialties, public.clinics, public.clinic_private, public.clinic_members,
  public.clinic_documents, public.doctors, public.doctor_private, public.doctor_specialties, public.doctor_documents,
  public.doctor_practice_sites, public.doctor_absences, public.directory_verifications from anon;
revoke insert, update, delete on public.medical_specialties, public.clinics, public.clinic_private, public.clinic_members,
  public.doctors, public.doctor_private, public.doctor_specialties, public.doctor_practice_sites, public.doctor_absences,
  public.directory_verifications from authenticated;
revoke update on public.clinic_documents, public.doctor_documents from authenticated;
revoke all on public.clinic_private, public.doctor_private, public.clinic_documents, public.doctor_documents from anon;

-- Délais maximums identiques aux autres fonctions publiques
alter function public.search_doctors(text, uuid, uuid, uuid, uuid, text, boolean, text, text, double precision, double precision, text, int, int) set statement_timeout = '5s';
alter function public.search_clinics(text, uuid, uuid, uuid, boolean, double precision, double precision, text, int, int) set statement_timeout = '5s';

-- ---------------------------------------------------------------------------
-- Contrôle d'intégrité : un lieu publié doit relier un médecin et une clinique vérifiés
-- ---------------------------------------------------------------------------
create or replace function public.directory_integrity_issues()
returns table (check_name text, severity text, entity_id text, details text)
language sql stable security definer set search_path = public as $$
  select 'site_without_verified_parties', 'avertissement', s.id::text,
         format('lieu accepté des deux côtés mais médecin %s / clinique %s', d.status, c.status)
  from public.doctor_practice_sites s join public.doctors d on d.id = s.doctor_id join public.clinics c on c.id = s.clinic_id
  where s.doctor_accepted and s.clinic_accepted and (d.status = 'suspended' or c.status = 'suspended')
  union all
  select 'doctor_without_specialty', 'critique', d.id::text, 'fiche médecin sans spécialité'
  from public.doctors d where not exists (select 1 from public.doctor_specialties ds where ds.doctor_id = d.id)
  union all
  select 'doctor_without_consent', 'critique', d.id::text, 'fiche publiée sans consentement'
  from public.doctors d where d.is_published and d.publication_consent_at is null
$$;
revoke execute on function public.directory_integrity_issues() from public, anon, authenticated;

create or replace function public.admin_integrity_report()
returns table (check_name text, severity text, entity_id text, details text)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_admin();
  return query select * from public.integrity_issues() union all select * from public.directory_integrity_issues();
end $$;

-- ---------------------------------------------------------------------------
-- Indicateurs : les statistiques de recherche de médicaments excluent l'annuaire,
-- qui a ses propres indicateurs.
-- ---------------------------------------------------------------------------
create or replace function public.admin_stats(p_from timestamptz default now() - interval '30 days', p_to timestamptz default now(), p_region uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare res jsonb;
begin
  perform public.require_admin();
  select jsonb_build_object(
    'pharmacies_registered', (select count(*) from public.pharmacies where (p_region is null or region_id = p_region) and not is_demo),
    'pharmacies_verified', (select count(*) from public.pharmacies where status = 'verified' and (p_region is null or region_id = p_region) and not is_demo),
    'pharmacies_pending', (select count(*) from public.pharmacies where status = 'pending' and (p_region is null or region_id = p_region)),
    'pharmacies_active', (select count(distinct i.pharmacy_id) from public.pharmacy_inventory i join public.pharmacies p on p.id = i.pharmacy_id
                          where p.status = 'verified' and i.stock_updated_at >= now() - interval '7 days' and (p_region is null or p.region_id = p_region) and not p.is_demo),
    'catalog_items', (select count(*) from public.medicine_catalog where merged_into is null and review_status <> 'rejected'),
    'catalog_pending', (select count(*) from public.medicine_catalog where merged_into is null and review_status = 'pending'),
    'inventory_lines', (select count(*) from public.pharmacy_inventory i join public.pharmacies p on p.id = i.pharmacy_id where (p_region is null or p.region_id = p_region)),
    'inventory_fresh', (select count(*) from public.pharmacy_inventory i join public.pharmacies p on p.id = i.pharmacy_id
                        where i.stock_updated_at >= now() - make_interval(hours => public.setting_int('stock_fresh_hours', 24)) and (p_region is null or p.region_id = p_region)),
    'searches', (select count(*) from public.search_logs where kind = 'medicine' and created_at between p_from and p_to and (p_region is null or region_id = p_region)),
    'searches_no_result', (select count(*) from public.search_logs where kind = 'medicine' and result_count = 0 and created_at between p_from and p_to and (p_region is null or region_id = p_region)),
    'top_no_result_queries', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select query_normalized as query, count(*) as n from public.search_logs
        where kind = 'medicine' and result_count = 0 and created_at between p_from and p_to and (p_region is null or region_id = p_region)
        group by 1 order by 2 desc limit 10) x),
    'orders_by_status', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) from (
        select o.status, count(*) as n from public.orders o join public.pharmacies p on p.id = o.pharmacy_id
        where o.created_at between p_from and p_to and (p_region is null or p.region_id = p_region) group by 1) x),
    'orders_total', (select count(*) from public.orders o join public.pharmacies p on p.id = o.pharmacy_id
        where o.created_at between p_from and p_to and (p_region is null or p.region_id = p_region)),
    'pharmacies_by_region', (select coalesce(jsonb_agg(x order by x.verified desc), '[]'::jsonb) from (
        select r.name as region, count(p.id) filter (where p.status = 'verified') as verified, count(p.id) as registered
        from public.regions r left join public.pharmacies p on p.region_id = r.id and not p.is_demo
        group by r.name) x),
    'open_reports', (select count(*) from public.reports where status in ('open', 'in_review')),
    'couriers_verified', (select count(*) from public.couriers where status = 'verified'),
    'couriers_pending', (select count(*) from public.couriers where status = 'pending')
  ) into res;
  return res;
end $$;

create or replace function public.admin_directory_stats(p_from timestamptz default now() - interval '30 days', p_to timestamptz default now())
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_admin();
  return jsonb_build_object(
    'doctors_verified', (select count(*) from public.doctors where status = 'verified' and not is_demo),
    'doctors_published', (select count(*) from public.doctors where status = 'verified' and is_published and public.directory_freshness(confirmed_at) <> 'stale' and not is_demo),
    'doctors_pending', (select count(*) from public.doctors where status = 'pending'),
    'doctors_to_confirm', (select count(*) from public.doctors where status = 'verified' and public.directory_freshness(confirmed_at) <> 'fresh'),
    'clinics_verified', (select count(*) from public.clinics where status = 'verified' and not is_demo),
    'clinics_pending', (select count(*) from public.clinics where status = 'pending'),
    'sites_published', (select count(*) from public.doctor_practice_sites where doctor_accepted and clinic_accepted),
    'searches', (select count(*) from public.search_logs where kind in ('doctor', 'clinic') and created_at between p_from and p_to),
    'searches_no_result', (select count(*) from public.search_logs where kind in ('doctor', 'clinic') and result_count = 0 and created_at between p_from and p_to),
    'top_no_result_queries', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select query_normalized as query, count(*) as n from public.search_logs
        where kind in ('doctor', 'clinic') and result_count = 0 and created_at between p_from and p_to
        group by 1 order by 2 desc limit 10) x),
    'open_reports', (select count(*) from public.reports where (doctor_id is not null or clinic_id is not null) and status in ('open', 'in_review'))
  );
end $$;

-- ---------------------------------------------------------------------------
-- Stocks d'une pharmacie paginés côté base (grandes officines, grossistes)
-- ---------------------------------------------------------------------------
create or replace function public.pharmacy_stock_page(p_pharmacy uuid, p_view text default 'tous', p_query text default null,
                                                      p_limit int default 100, p_offset int default 0)
returns table (id uuid, catalog_id uuid, quantity int, reserved_quantity int, price_xof int, is_available boolean, low_stock_threshold int,
               stock_updated_at timestamptz, row_version int, brand_name text, dosage text, form text, packaging text, review_status text,
               freshness text, total_count bigint)
language plpgsql stable security definer set search_path = public as $$
declare q text := nullif(public.normalize_text(left(coalesce(p_query, ''), 80)), '');
begin
  if not (public.is_pharmacy_member(p_pharmacy) or public.is_admin()) then raise exception 'PP403: accès refusé'; end if;
  return query
  select i.id, i.catalog_id, i.quantity, i.reserved_quantity, i.price_xof, i.is_available, i.low_stock_threshold, i.stock_updated_at, i.row_version,
         c.brand_name, c.dosage, c.form, c.packaging, c.review_status,
         public.stock_freshness(i.quantity, i.reserved_quantity, i.is_available, i.stock_updated_at), count(*) over ()
  from public.pharmacy_inventory i join public.medicine_catalog c on c.id = i.catalog_id
  where i.pharmacy_id = p_pharmacy
    and (q is null or c.search_text like '%' || q || '%')
    and case coalesce(p_view, 'tous')
          when 'disponibles' then i.is_available and i.quantity - i.reserved_quantity > 0
          when 'indisponibles' then not i.is_available or i.quantity - i.reserved_quantity <= 0
          when 'faibles' then i.is_available and i.quantity - i.reserved_quantity <= i.low_stock_threshold
          when 'anciens' then public.stock_freshness(i.quantity, i.reserved_quantity, i.is_available, i.stock_updated_at) in ('stale', 'to_confirm')
          else true end
  order by public.normalize_text(concat_ws(' ', c.brand_name, c.dosage, c.form, c.packaging)), i.id
  limit least(greatest(coalesce(p_limit, 100), 1), 500) offset greatest(coalesce(p_offset, 0), 0);
end $$;

-- ---------------------------------------------------------------------------
-- Données de démonstration de l'annuaire (service_role uniquement).
-- Noms explicitement fictifs (« DÉMO »), aucun médecin ni établissement réel.
-- ---------------------------------------------------------------------------
create or replace function public.demo_directory_install(p_users jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  u_d1 uuid := (p_users ->> 'doctor1')::uuid;
  u_d2 uuid := (p_users ->> 'doctor2')::uuid;
  u_cl uuid := (p_users ->> 'clinic')::uuid;
  r_bko uuid; c3 uuid; c4 uuid; cl1 uuid; cl2 uuid; d1 uuid; d2 uuid;
  hours jsonb := '{"mon":[["08:00","18:00"]],"tue":[["08:00","18:00"]],"wed":[["08:00","18:00"]],"thu":[["08:00","18:00"]],"fri":[["08:00","18:00"]],"sat":[["08:00","13:00"]]}';
begin
  if exists (select 1 from public.clinics where is_demo) then raise exception 'Les données de démonstration de l''annuaire sont déjà installées'; end if;
  update public.profiles set is_demo = true where id in (u_d1, u_d2, u_cl);
  update public.profiles set full_name = 'Médecin Démo 1' where id = u_d1;
  update public.profiles set full_name = 'Médecin Démo 2' where id = u_d2;
  update public.profiles set full_name = 'Gestionnaire Clinique Démo' where id = u_cl;
  select id into r_bko from public.regions where name = 'District de Bamako';
  select id into c3 from public.communes where region_id = r_bko and name = 'Commune III';
  select id into c4 from public.communes where region_id = r_bko and name = 'Commune IV';

  insert into public.clinics (name, kind, status, address, region_id, commune_id, latitude, longitude, phone, opening_hours, emergency_24h, services, verified_at, is_demo, created_by)
  values ('Clinique DÉMO du Djoliba', 'clinique', 'verified', 'Adresse de démonstration n°10', r_bko, c3, 12.6470, -7.9950, '+22320000101', hours, true,
          array['laboratoire', 'imagerie', 'maternite', 'hospitalisation'], now(), true, u_cl) returning id into cl1;
  insert into public.clinics (name, kind, status, address, region_id, commune_id, latitude, longitude, phone, opening_hours, emergency_24h, services, verified_at, is_demo, created_by)
  values ('Cabinet médical DÉMO des Manguiers', 'cabinet', 'verified', 'Adresse de démonstration n°11', r_bko, c4, 12.6280, -8.0250, '+22320000102', hours, false,
          array['laboratoire'], now(), true, u_cl) returning id into cl2;
  insert into public.clinic_private (clinic_id, manager_name) values (cl1, 'Gestionnaire Démo'), (cl2, 'Gestionnaire Démo');
  insert into public.clinic_members (clinic_id, user_id, member_role) values (cl1, u_cl, 'owner'), (cl2, u_cl, 'owner');

  insert into public.doctors (user_id, title, display_name, gender, languages, status, publication_consent_at, verified_at, is_demo)
  values (u_d1, 'Dr', 'Démo Aminata (cardiologie)', 'F', array['fr', 'bm'], 'verified', now(), now(), true) returning id into d1;
  insert into public.doctors (user_id, title, display_name, gender, languages, status, publication_consent_at, verified_at, is_demo)
  values (u_d2, 'Dr', 'Démo Ibrahima (pédiatrie)', 'M', array['fr', 'bm', 'snk'], 'verified', now(), now(), true) returning id into d2;
  insert into public.doctor_private (doctor_id, order_number) values (d1, 'DEMO-0001'), (d2, 'DEMO-0002');
  insert into public.doctor_specialties (doctor_id, specialty_id)
  select d1, id from public.medical_specialties where code = 'cardiologie'
  union all select d2, id from public.medical_specialties where code in ('pediatrie', 'medecine_generale');

  insert into public.doctor_practice_sites (doctor_id, clinic_id, schedule, appointment_phone, doctor_accepted, clinic_accepted) values
    (d1, cl1, '{"mon":[["08:00","12:00"]],"wed":[["15:00","18:00"]]}', '+22320000111', true, true),
    (d1, cl2, '{"sat":[["09:00","12:00"]]}', null, true, true),
    (d2, cl1, '{"tue":[["08:00","13:00"]],"thu":[["08:00","13:00"]],"fri":[["15:00","18:00"]]}', null, true, true);
  return jsonb_build_object('clinics', jsonb_build_array(cl1, cl2), 'doctors', jsonb_build_array(d1, d2));
end $$;

create or replace function public.demo_directory_uninstall()
returns jsonb language plpgsql security definer set search_path = public as $$
declare n_doc int; n_cli int;
begin
  delete from public.reports where doctor_id in (select id from public.doctors where is_demo) or clinic_id in (select id from public.clinics where is_demo);
  with d as (delete from public.doctors where is_demo returning 1) select count(*) into n_doc from d;
  with d as (delete from public.clinics where is_demo returning 1) select count(*) into n_cli from d;
  return jsonb_build_object('doctors_deleted', n_doc, 'clinics_deleted', n_cli);
end $$;

revoke execute on function public.demo_directory_install(jsonb) from public, anon, authenticated;
revoke execute on function public.demo_directory_uninstall() from public, anon, authenticated;
grant execute on function public.demo_directory_install(jsonb) to service_role;
grant execute on function public.demo_directory_uninstall() to service_role;

-- >>> 20261028000100_pharmacy_listings.sql
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

-- >>> 20261028000200_registers.sql
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

-- >>> 20261028000300_appointments.sql
-- ============================================================================
-- PharmaProxi — Migration : demandes de rendez-vous avec les médecins
-- Principe : le patient DEMANDE un rendez-vous (jour + moment de la journée) sur un
-- lieu de consultation publié ; le médecin ou le secrétariat de l'établissement
-- CONFIRME avec une heure précise, PROPOSE un autre moment ou REFUSE. Rien n'est
-- garanti avant la confirmation. Aucun conseil médical, aucune téléconsultation.
-- Le motif (facultatif) n'est visible que du patient, du médecin et du secrétariat.
-- Heure du Mali = UTC.
-- ============================================================================

alter table public.doctor_practice_sites add column accepts_appointments boolean not null default false;

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  site_id uuid references public.doctor_practice_sites(id) on delete set null,
  doctor_id uuid not null references public.doctors(id) on delete cascade,
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid not null references public.profiles(id) on delete cascade,
  patient_name text not null check (char_length(btrim(patient_name)) between 2 and 120),
  patient_phone text not null check (public.valid_phone(patient_phone)),
  requested_date date not null,
  requested_period text not null default 'indifferent' check (requested_period in ('matin', 'apres_midi', 'indifferent')),
  reason text check (char_length(coalesce(reason, '')) <= 300),
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'proposed', 'declined', 'cancelled', 'expired', 'completed', 'no_show')),
  scheduled_at timestamptz,          -- heure fixée (confirmée ou proposée)
  response_note text check (char_length(coalesce(response_note, '')) <= 300),
  cancelled_by text check (cancelled_by in ('patient', 'practice')),
  decided_by uuid references public.profiles(id) on delete set null,
  idempotency_key text check (char_length(coalesce(idempotency_key, '')) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status not in ('confirmed', 'proposed') or scheduled_at is not null)
);
create unique index appointments_idem on public.appointments (patient_id, idempotency_key) where idempotency_key is not null;
create index appointments_patient on public.appointments (patient_id, created_at desc);
create index appointments_doctor on public.appointments (doctor_id, status, requested_date);
create index appointments_clinic on public.appointments (clinic_id, status, requested_date);
create trigger appointments_touch before update on public.appointments for each row execute function public.touch_updated_at();

alter table public.appointments enable row level security;
create policy "pp_appointments_read" on public.appointments for select to authenticated using (
  patient_id = auth.uid() or doctor_id = public.my_doctor_id() or public.is_clinic_member(clinic_id));
revoke insert, update, delete on public.appointments from anon, authenticated;
grant select on public.appointments to authenticated;

create or replace function public.appointment_period_label(p text)
returns text language sql immutable as $$
  select case p when 'matin' then 'le matin' when 'apres_midi' then 'l''après-midi' else 'à tout moment' end
$$;

-- Le médecin (ou un membre de l'établissement) peut-il gérer ce rendez-vous ?
create or replace function public.can_manage_appointment(a public.appointments)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(a.doctor_id = public.my_doctor_id(), false) or coalesce(public.is_clinic_member(a.clinic_id), false)
$$;

-- Activer / désactiver les demandes en ligne sur un lieu de consultation
create or replace function public.set_site_appointments(p_site uuid, p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
declare s public.doctor_practice_sites;
begin
  select * into s from public.doctor_practice_sites where id = p_site;
  if s.id is null then raise exception 'PP404: lieu de consultation introuvable'; end if;
  if not (coalesce(s.doctor_id = public.my_doctor_id(), false) or coalesce(public.can_manage_clinic(s.clinic_id), false)) then
    raise exception 'PP403: action réservée au médecin ou à l''établissement' using errcode = '42501';
  end if;
  update public.doctor_practice_sites set accepts_appointments = p_on where id = p_site;
  perform public.log_audit(case when p_on then 'appointments.enable' else 'appointments.disable' end, 'practice_site', p_site::text);
end $$;

-- ---------------------------------------------------------------------------
-- Patient : demande
-- ---------------------------------------------------------------------------
create or replace function public.request_appointment(
  p_site uuid, p_date date, p_period text, p_patient_name text, p_phone text, p_reason text default null, p_key text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  s public.doctor_practice_sites; d public.doctors; c public.clinics;
  slots jsonb; ok_day boolean := false; slot jsonb; aid uuid; dkey text; doc_user uuid;
begin
  if uid is null then raise exception 'PP401: connectez-vous pour demander un rendez-vous' using errcode = '42501'; end if;
  if p_key is not null then
    select id into aid from public.appointments where patient_id = uid and idempotency_key = p_key;
    if aid is not null then return aid; end if;
  end if;
  select * into s from public.doctor_practice_sites where id = p_site;
  if s.id is null or not s.doctor_accepted or not s.clinic_accepted then raise exception 'PP404: lieu de consultation introuvable'; end if;
  select * into d from public.doctors where id = s.doctor_id;
  select * into c from public.clinics where id = s.clinic_id;
  if not public.doctor_is_public(d.id) or c.status <> 'verified' then raise exception 'PP404: ce médecin n''est pas disponible dans l''annuaire'; end if;
  if not s.accepts_appointments then raise exception 'PP409: ce lieu ne prend pas de demandes en ligne : appelez le numéro indiqué'; end if;
  if p_period not in ('matin', 'apres_midi', 'indifferent') then raise exception 'PP422: moment de la journée invalide'; end if;
  if public.normalize_ml_phone(p_phone) is null then raise exception 'PP422: numéro de téléphone invalide'; end if;
  if char_length(btrim(coalesce(p_patient_name, ''))) < 2 then raise exception 'PP422: indiquez le nom du patient'; end if;
  if p_date is null or p_date < (now() at time zone 'UTC')::date then raise exception 'PP422: choisissez une date à venir'; end if;
  if p_date > (now() at time zone 'UTC')::date + 60 then raise exception 'PP422: les demandes sont possibles jusqu''à 60 jours à l''avance'; end if;
  dkey := public.day_key(p_date::timestamp at time zone 'UTC');
  slots := s.schedule -> dkey;
  if slots is not null and jsonb_typeof(slots) = 'array' then
    for slot in select * from jsonb_array_elements(slots) loop
      if p_period = 'indifferent'
         or (p_period = 'matin' and (slot ->> 0) < '13:00')
         or (p_period = 'apres_midi' and (slot ->> 1) > '13:00') then ok_day := true; end if;
    end loop;
  end if;
  if not ok_day then raise exception 'PP422: le médecin ne consulte pas à ce moment dans cet établissement : choisissez un jour de consultation'; end if;
  if exists (select 1 from public.doctor_absences a where a.doctor_id = d.id and p_date between a.starts_on and a.ends_on) then
    raise exception 'PP409: le médecin a annoncé une absence ce jour-là';
  end if;
  if (select count(*) from public.appointments where patient_id = uid and status in ('pending', 'proposed')) >= 3 then
    raise exception 'PP429: vous avez déjà 3 demandes en attente : attendez une réponse ou annulez-en une';
  end if;
  if exists (select 1 from public.appointments where patient_id = uid and doctor_id = d.id and requested_date = p_date
             and status in ('pending', 'proposed', 'confirmed')) then
    raise exception 'PP409: vous avez déjà une demande auprès de ce médecin pour ce jour';
  end if;

  insert into public.appointments (site_id, doctor_id, clinic_id, patient_id, patient_name, patient_phone, requested_date, requested_period, reason, idempotency_key)
  values (s.id, d.id, c.id, uid, btrim(p_patient_name), public.normalize_ml_phone(p_phone), p_date, p_period, nullif(btrim(coalesce(p_reason, '')), ''), p_key)
  returning id into aid;

  select user_id into doc_user from public.doctors where id = d.id;
  perform public.notify_user(doc_user, 'appointment', 'Nouvelle demande de rendez-vous',
    format('%s souhaite vous voir le %s %s à %s.', btrim(p_patient_name), to_char(p_date, 'DD/MM/YYYY'), public.appointment_period_label(p_period), c.name),
    null, '/medecin/rendez-vous');
  perform public.notify_clinic(c.id, 'appointment', 'Nouvelle demande de rendez-vous',
    format('Pour %s %s, le %s %s.', d.title, d.display_name, to_char(p_date, 'DD/MM/YYYY'), public.appointment_period_label(p_period)),
    format('/clinique/%s/rendez-vous', c.id));
  return aid;
exception when check_violation then
  raise exception 'PP422: vérifiez le nom et le numéro de téléphone';
end $$;

-- ---------------------------------------------------------------------------
-- Médecin / secrétariat : réponse
-- p_action : 'confirm' (heure le jour demandé), 'propose' (autre moment), 'decline'
-- ---------------------------------------------------------------------------
create or replace function public.respond_appointment(p_id uuid, p_action text, p_at timestamptz default null, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare a public.appointments; d public.doctors;
begin
  select * into a from public.appointments where id = p_id for update;
  if a.id is null or not public.can_manage_appointment(a) then raise exception 'PP404: rendez-vous introuvable'; end if;
  if a.status not in ('pending', 'proposed') then raise exception 'PP409: cette demande a déjà reçu une réponse'; end if;
  select * into d from public.doctors where id = a.doctor_id;
  if p_action = 'confirm' then
    if p_at is null then raise exception 'PP422: indiquez l''heure du rendez-vous'; end if;
    if (p_at at time zone 'UTC')::date <> a.requested_date then raise exception 'PP422: pour un autre jour, utilisez « Proposer un autre moment »'; end if;
    if p_at < now() then raise exception 'PP422: cette heure est déjà passée'; end if;
    update public.appointments set status = 'confirmed', scheduled_at = p_at, response_note = nullif(btrim(coalesce(p_note, '')), ''), decided_by = auth.uid() where id = p_id;
    perform public.notify_user(a.patient_id, 'appointment', 'Rendez-vous confirmé',
      format('%s %s vous attend le %s à %s.%s', d.title, d.display_name, to_char(p_at at time zone 'UTC', 'DD/MM/YYYY'), to_char(p_at at time zone 'UTC', 'HH24"h"MI'),
             coalesce(' ' || nullif(btrim(coalesce(p_note, '')), ''), '')), null, '/compte/rendez-vous');
  elsif p_action = 'propose' then
    if p_at is null or p_at < now() then raise exception 'PP422: proposez une date et une heure à venir'; end if;
    update public.appointments set status = 'proposed', scheduled_at = p_at, response_note = nullif(btrim(coalesce(p_note, '')), ''), decided_by = auth.uid() where id = p_id;
    perform public.notify_user(a.patient_id, 'appointment', 'Un autre moment vous est proposé',
      format('%s %s propose le %s à %s. Acceptez ou refusez dans « Mes rendez-vous ».', d.title, d.display_name,
             to_char(p_at at time zone 'UTC', 'DD/MM/YYYY'), to_char(p_at at time zone 'UTC', 'HH24"h"MI')), null, '/compte/rendez-vous');
  elsif p_action = 'decline' then
    if char_length(btrim(coalesce(p_note, ''))) < 3 then raise exception 'PP422: indiquez un motif au patient (ex. complet ce jour-là, appelez le secrétariat)'; end if;
    update public.appointments set status = 'declined', response_note = btrim(p_note), decided_by = auth.uid() where id = p_id;
    perform public.notify_user(a.patient_id, 'appointment', 'Demande de rendez-vous non retenue',
      format('%s %s : %s', d.title, d.display_name, btrim(p_note)), null, '/compte/rendez-vous');
  else
    raise exception 'PP422: action inconnue';
  end if;
  perform public.log_audit('appointment.' || p_action, 'appointment', p_id::text);
end $$;

-- Patient : réponse à une proposition
create or replace function public.answer_appointment_proposal(p_id uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = public as $$
declare a public.appointments; doc_user uuid;
begin
  select * into a from public.appointments where id = p_id and patient_id = auth.uid() for update;
  if a.id is null then raise exception 'PP404: rendez-vous introuvable'; end if;
  if a.status <> 'proposed' then raise exception 'PP409: aucune proposition en attente'; end if;
  if p_accept and a.scheduled_at < now() then raise exception 'PP409: le moment proposé est déjà passé'; end if;
  update public.appointments set status = case when p_accept then 'confirmed' else 'cancelled' end,
         cancelled_by = case when p_accept then null else 'patient' end where id = p_id;
  select user_id into doc_user from public.doctors where id = a.doctor_id;
  perform public.notify_user(doc_user, 'appointment',
    case when p_accept then 'Proposition acceptée' else 'Proposition refusée' end,
    format('%s, %s.', a.patient_name, to_char(a.scheduled_at at time zone 'UTC', 'DD/MM/YYYY HH24"h"MI')), null, '/medecin/rendez-vous');
  perform public.notify_clinic(a.clinic_id, 'appointment',
    case when p_accept then 'Proposition acceptée' else 'Proposition refusée' end,
    format('%s, %s.', a.patient_name, to_char(a.scheduled_at at time zone 'UTC', 'DD/MM/YYYY HH24"h"MI')), format('/clinique/%s/rendez-vous', a.clinic_id));
end $$;

-- Annulation : par le patient (demande ou rendez-vous à venir) ou par le médecin / secrétariat (avec motif)
create or replace function public.cancel_appointment(p_id uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare a public.appointments; is_patient boolean; doc_user uuid; d public.doctors;
begin
  select * into a from public.appointments where id = p_id for update;
  if a.id is null then raise exception 'PP404: rendez-vous introuvable'; end if;
  is_patient := a.patient_id = auth.uid();
  if not is_patient and not public.can_manage_appointment(a) then raise exception 'PP404: rendez-vous introuvable'; end if;
  if a.status not in ('pending', 'proposed', 'confirmed') then raise exception 'PP409: ce rendez-vous ne peut plus être annulé'; end if;
  if a.status = 'confirmed' and a.scheduled_at < now() then raise exception 'PP409: l''heure du rendez-vous est passée'; end if;
  if not is_patient and char_length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'PP422: indiquez un motif au patient'; end if;
  update public.appointments set status = 'cancelled', cancelled_by = case when is_patient then 'patient' else 'practice' end,
         response_note = case when is_patient then response_note else btrim(p_reason) end where id = p_id;
  select * into d from public.doctors where id = a.doctor_id;
  if is_patient then
    perform public.notify_user(d.user_id, 'appointment', 'Rendez-vous annulé par le patient',
      format('%s, %s.', a.patient_name, coalesce(to_char(a.scheduled_at at time zone 'UTC', 'DD/MM/YYYY HH24"h"MI'), to_char(a.requested_date, 'DD/MM/YYYY'))), null, '/medecin/rendez-vous');
    perform public.notify_clinic(a.clinic_id, 'appointment', 'Rendez-vous annulé par le patient',
      format('%s, %s.', a.patient_name, coalesce(to_char(a.scheduled_at at time zone 'UTC', 'DD/MM/YYYY HH24"h"MI'), to_char(a.requested_date, 'DD/MM/YYYY'))), format('/clinique/%s/rendez-vous', a.clinic_id));
  else
    perform public.notify_user(a.patient_id, 'appointment', 'Rendez-vous annulé',
      format('%s %s : %s', d.title, d.display_name, btrim(p_reason)), null, '/compte/rendez-vous');
  end if;
  perform public.log_audit('appointment.cancel', 'appointment', p_id::text, jsonb_build_object('by', case when is_patient then 'patient' else 'practice' end));
end $$;

-- Après l'heure : honoré ou patient absent
create or replace function public.close_appointment(p_id uuid, p_outcome text)
returns void language plpgsql security definer set search_path = public as $$
declare a public.appointments;
begin
  select * into a from public.appointments where id = p_id for update;
  if a.id is null or not public.can_manage_appointment(a) then raise exception 'PP404: rendez-vous introuvable'; end if;
  if a.status <> 'confirmed' then raise exception 'PP409: seul un rendez-vous confirmé peut être clôturé'; end if;
  if a.scheduled_at > now() then raise exception 'PP409: le rendez-vous n''a pas encore eu lieu'; end if;
  if p_outcome not in ('completed', 'no_show') then raise exception 'PP422: résultat inconnu'; end if;
  update public.appointments set status = p_outcome where id = p_id;
end $$;

-- ---------------------------------------------------------------------------
-- Listes
-- ---------------------------------------------------------------------------
create or replace function public.my_appointments()
returns table (id uuid, status text, requested_date date, requested_period text, scheduled_at timestamptz, response_note text,
               patient_name text, reason text, cancelled_by text, created_at timestamptz,
               doctor_id uuid, doctor_label text, clinic_id uuid, clinic_name text, clinic_address text, phone text)
language sql stable security definer set search_path = public as $$
  select a.id, a.status, a.requested_date, a.requested_period, a.scheduled_at, a.response_note, a.patient_name, a.reason, a.cancelled_by, a.created_at,
         d.id, d.title || ' ' || d.display_name, c.id, c.name, c.address, coalesce(s.appointment_phone, c.phone)
  from public.appointments a
  join public.doctors d on d.id = a.doctor_id
  join public.clinics c on c.id = a.clinic_id
  left join public.doctor_practice_sites s on s.id = a.site_id
  where a.patient_id = auth.uid()
  order by (a.status in ('pending', 'proposed', 'confirmed')) desc, coalesce(a.scheduled_at, a.requested_date::timestamptz) desc
  limit 100
$$;

-- p_clinic NULL : agenda du médecin connecté ; sinon : agenda de l'établissement (membres seulement)
create or replace function public.practice_appointments(p_clinic uuid default null, p_view text default 'a_traiter')
returns table (id uuid, status text, requested_date date, requested_period text, scheduled_at timestamptz, response_note text,
               patient_name text, patient_phone text, reason text, cancelled_by text, created_at timestamptz,
               doctor_label text, clinic_id uuid, clinic_name text)
language plpgsql stable security definer set search_path = public as $$
declare me uuid := public.my_doctor_id();
begin
  if p_clinic is null and me is null then raise exception 'PP403: espace médecin requis' using errcode = '42501'; end if;
  if p_clinic is not null and not public.is_clinic_member(p_clinic) then raise exception 'PP403: action réservée à l''établissement' using errcode = '42501'; end if;
  return query
  select a.id, a.status, a.requested_date, a.requested_period, a.scheduled_at, a.response_note, a.patient_name, a.patient_phone, a.reason, a.cancelled_by, a.created_at,
         d.title || ' ' || d.display_name, c.id, c.name
  from public.appointments a
  join public.doctors d on d.id = a.doctor_id
  join public.clinics c on c.id = a.clinic_id
  where (case when p_clinic is null then a.doctor_id = me else a.clinic_id = p_clinic end)
    and case p_view
          when 'a_traiter' then a.status in ('pending', 'proposed')
          when 'a_venir' then a.status = 'confirmed' and a.scheduled_at >= date_trunc('day', now())
          when 'a_cloturer' then a.status = 'confirmed' and a.scheduled_at < now()
          else a.status not in ('pending', 'proposed') and not (a.status = 'confirmed' and a.scheduled_at >= date_trunc('day', now()))
        end
  order by case when p_view in ('a_traiter', 'a_venir', 'a_cloturer') then coalesce(a.scheduled_at, a.requested_date::timestamptz) end asc,
           a.updated_at desc
  limit 200;
end $$;

-- ---------------------------------------------------------------------------
-- Expiration automatique (maintenance) : demande sans réponse sous 48 h ou date passée,
-- proposition non acceptée sous 48 h ou moment passé.
-- ---------------------------------------------------------------------------
create or replace function public.expire_appointments()
returns int language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in
    update public.appointments set status = 'expired'
    where (status = 'pending' and (created_at < now() - interval '48 hours' or requested_date < (now() at time zone 'UTC')::date))
       or (status = 'proposed' and (updated_at < now() - interval '48 hours' or scheduled_at < now()))
    returning id, patient_id, requested_date
  loop
    perform public.notify_user(r.patient_id, 'appointment', 'Demande de rendez-vous expirée',
      format('Votre demande pour le %s n''a pas été confirmée à temps. Vous pouvez en faire une nouvelle ou appeler l''établissement.', to_char(r.requested_date, 'DD/MM/YYYY')),
      null, '/compte/rendez-vous');
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.run_maintenance()
returns jsonb language plpgsql security definer set search_path = public as $$
declare expired int; rl int; logs int; notifs int; outbox int; issues int; reminders int; appts int;
begin
  expired := public.expire_overdue_orders();
  appts := public.expire_appointments();
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
                                      'directory_reminders', reminders, 'appointments_expired', appts), issues);
  delete from public.maintenance_runs where ran_at < now() - interval '30 days';
  return jsonb_build_object('expired', expired, 'appointments_expired', appts, 'purged', jsonb_build_object('rate_limits', rl, 'search_logs', logs,
    'notifications', notifs, 'outbox', outbox, 'directory_reminders', reminders), 'critical_issues', issues);
end $$;
revoke execute on function public.run_maintenance() from public, anon, authenticated;
grant execute on function public.run_maintenance() to service_role;

-- Statistiques (sans aucune donnée de patient)
create or replace function public.admin_appointment_stats()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_admin();
  return jsonb_build_object(
    'sites_open', (select count(*) from public.doctor_practice_sites where accepts_appointments),
    'last_30_days', (select count(*) from public.appointments where created_at > now() - interval '30 days'),
    'by_status', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) from (
       select status, count(*) n from public.appointments where created_at > now() - interval '30 days' group by status) x));
end $$;

revoke execute on function public.can_manage_appointment(public.appointments), public.expire_appointments() from public, anon, authenticated;
revoke execute on function public.set_site_appointments(uuid, boolean), public.request_appointment(uuid, date, text, text, text, text, text),
  public.respond_appointment(uuid, text, timestamptz, text), public.answer_appointment_proposal(uuid, boolean),
  public.cancel_appointment(uuid, text), public.close_appointment(uuid, text), public.my_appointments(),
  public.practice_appointments(uuid, text), public.admin_appointment_stats() from public, anon;
grant execute on function public.set_site_appointments(uuid, boolean), public.request_appointment(uuid, date, text, text, text, text, text),
  public.respond_appointment(uuid, text, timestamptz, text), public.answer_appointment_proposal(uuid, boolean),
  public.cancel_appointment(uuid, text), public.close_appointment(uuid, text), public.my_appointments(),
  public.practice_appointments(uuid, text), public.admin_appointment_stats() to authenticated;
grant execute on function public.expire_appointments() to service_role;

-- >>> 20261028000400_booking.sql
-- ============================================================================
-- PharmaProxi — Migration : réservation en ligne par créneaux (type Doctolib)
--   • motifs de consultation (durée, consignes, public, tarif indicatif déclaré)
--   • réservation immédiate d'un créneau libre OU demande à confirmer, au choix du lieu
--   • délais de prévenance (réservation, annulation), informations d'accès
--   • rendez-vous saisis par le cabinet (appel téléphonique), plages bloquées
--   • proches (prendre rendez-vous pour un enfant, un parent)
--   • liste d'attente : alerte quand un créneau se libère
--   • rappel la veille, prochaine disponibilité, informations pratiques du médecin
-- Pas de téléconsultation, pas de paiement, pas de dossier médical.
-- Heure du Mali = UTC.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Informations pratiques du médecin (déclarées par lui, jamais inventées)
-- ---------------------------------------------------------------------------
alter table public.doctors
  add column presentation text check (char_length(coalesce(presentation, '')) <= 1500),
  add column fee_info text check (char_length(coalesce(fee_info, '')) <= 200),
  add column payment_methods text[] not null default '{}'
    check (payment_methods <@ array['especes', 'orange_money', 'moov_money', 'carte', 'assurance', 'cheque']::text[]),
  add column accepts_new_patients boolean not null default true;

create or replace function public.update_doctor_practice_info(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := public.my_doctor_id();
begin
  if me is null then raise exception 'PP403: espace médecin requis' using errcode = '42501'; end if;
  update public.doctors set
    presentation = nullif(btrim(coalesce(p ->> 'presentation', '')), ''),
    fee_info = nullif(btrim(coalesce(p ->> 'fee_info', '')), ''),
    payment_methods = coalesce((select array_agg(distinct x) from jsonb_array_elements_text(coalesce(p -> 'payment_methods', '[]'::jsonb)) x
                                where x in ('especes', 'orange_money', 'moov_money', 'carte', 'assurance', 'cheque')), '{}'),
    accepts_new_patients = coalesce((p ->> 'accepts_new_patients')::boolean, true)
  where id = me;
exception when check_violation then
  raise exception 'PP422: texte trop long (présentation 1 500 caractères, tarifs 200 caractères)';
end $$;

-- ---------------------------------------------------------------------------
-- Réglages de réservation d'un lieu de consultation
-- ---------------------------------------------------------------------------
alter table public.doctor_practice_sites
  add column booking_mode text not null default 'request' check (booking_mode in ('request', 'instant')),
  add column min_notice_hours int not null default 2 check (min_notice_hours between 0 and 168),
  add column cancel_notice_hours int not null default 2 check (cancel_notice_hours between 0 and 168),
  add column access_info text check (char_length(coalesce(access_info, '')) <= 300);

create or replace function public.can_manage_site(p_site uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.doctor_practice_sites s
                 where s.id = p_site and (coalesce(s.doctor_id = public.my_doctor_id(), false) or coalesce(public.can_manage_clinic(s.clinic_id), false)))
$$;

create or replace function public.update_site_booking(p_site uuid, p_mode text, p_min_notice int, p_cancel_notice int, p_access_info text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_manage_site(p_site) then raise exception 'PP403: action réservée au médecin ou à l''établissement' using errcode = '42501'; end if;
  if p_mode not in ('request', 'instant') then raise exception 'PP422: mode de réservation inconnu'; end if;
  if p_mode = 'instant' and not exists (
       select 1 from public.appointment_types t join public.doctor_practice_sites s on s.id = p_site
       where t.doctor_id = s.doctor_id and t.is_active and (t.site_id is null or t.site_id = p_site)) then
    raise exception 'PP422: créez d''abord au moins un motif de consultation (avec sa durée) pour proposer des créneaux';
  end if;
  update public.doctor_practice_sites set booking_mode = p_mode, min_notice_hours = coalesce(p_min_notice, 2),
         cancel_notice_hours = coalesce(p_cancel_notice, 2), access_info = nullif(btrim(coalesce(p_access_info, '')), '')
  where id = p_site;
  perform public.log_audit('booking.settings', 'practice_site', p_site::text, jsonb_build_object('mode', p_mode));
exception when check_violation then
  raise exception 'PP422: délais entre 0 et 168 heures, informations d''accès 300 caractères maximum';
end $$;

-- ---------------------------------------------------------------------------
-- Motifs de consultation
-- ---------------------------------------------------------------------------
create table public.appointment_types (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.doctors(id) on delete cascade,
  site_id uuid references public.doctor_practice_sites(id) on delete cascade,   -- NULL : tous les lieux
  name text not null check (char_length(btrim(name)) between 2 and 80),
  duration_min int not null check (duration_min between 5 and 240),
  audience text not null default 'all' check (audience in ('all', 'new', 'returning')),
  instructions text check (char_length(coalesce(instructions, '')) <= 500),
  fee text check (char_length(coalesce(fee, '')) <= 80),
  sort_order int not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index appointment_types_doctor on public.appointment_types (doctor_id) where is_active;
alter table public.appointment_types enable row level security;
create policy "pp_types_public_read" on public.appointment_types for select to anon, authenticated
  using (is_active and public.doctor_is_public(doctor_id));
create policy "pp_types_practice_read" on public.appointment_types for select to authenticated
  using (doctor_id = public.my_doctor_id() or (site_id is not null and public.can_manage_site(site_id)));
revoke insert, update, delete on public.appointment_types from anon, authenticated;
grant select on public.appointment_types to anon, authenticated;

create or replace function public.save_appointment_type(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  tid uuid := nullif(p ->> 'id', '')::uuid; v_site uuid := nullif(p ->> 'site_id', '')::uuid;
  v_doctor uuid; t public.appointment_types; s public.doctor_practice_sites;
begin
  if tid is not null then
    select * into t from public.appointment_types where id = tid;
    if t.id is null then raise exception 'PP404: motif introuvable'; end if;
    v_doctor := t.doctor_id;
  end if;
  if v_site is not null then
    select * into s from public.doctor_practice_sites where id = v_site;
    if s.id is null or not public.can_manage_site(v_site) then raise exception 'PP403: lieu non autorisé' using errcode = '42501'; end if;
    if v_doctor is not null and v_doctor <> s.doctor_id then raise exception 'PP422: lieu d''un autre médecin'; end if;
    v_doctor := s.doctor_id;
  end if;
  v_doctor := coalesce(v_doctor, public.my_doctor_id());
  if v_doctor is null then raise exception 'PP403: espace médecin requis' using errcode = '42501'; end if;
  -- Un motif « tous lieux » n'est modifiable que par le médecin ; un motif de lieu, aussi par l'établissement
  if not (coalesce(v_doctor = public.my_doctor_id(), false) or (v_site is not null and public.can_manage_site(v_site))
          or (t.site_id is not null and public.can_manage_site(t.site_id))) then
    raise exception 'PP403: action réservée au médecin' using errcode = '42501';
  end if;
  if tid is null then
    insert into public.appointment_types (doctor_id, site_id, name, duration_min, audience, instructions, fee, sort_order)
    values (v_doctor, v_site, btrim(p ->> 'name'), (p ->> 'duration_min')::int, coalesce(nullif(p ->> 'audience', ''), 'all'),
            nullif(btrim(coalesce(p ->> 'instructions', '')), ''), nullif(btrim(coalesce(p ->> 'fee', '')), ''), coalesce((p ->> 'sort_order')::int, 100))
    returning id into tid;
  else
    update public.appointment_types set name = btrim(p ->> 'name'), duration_min = (p ->> 'duration_min')::int,
      audience = coalesce(nullif(p ->> 'audience', ''), 'all'), instructions = nullif(btrim(coalesce(p ->> 'instructions', '')), ''),
      fee = nullif(btrim(coalesce(p ->> 'fee', '')), ''), sort_order = coalesce((p ->> 'sort_order')::int, sort_order),
      is_active = coalesce((p ->> 'is_active')::boolean, is_active), site_id = coalesce(v_site, site_id)
    where id = tid;
  end if;
  return tid;
exception
  when check_violation then raise exception 'PP422: nom (2 à 80 caractères) et durée (5 à 240 minutes) obligatoires';
  when invalid_text_representation then raise exception 'PP422: durée invalide';
end $$;

-- ---------------------------------------------------------------------------
-- Rendez-vous : colonnes de réservation
-- ---------------------------------------------------------------------------
alter table public.appointments
  alter column patient_id drop not null,
  add column type_id uuid references public.appointment_types(id) on delete set null,
  add column ends_at timestamptz,
  add column source text not null default 'online' check (source in ('online', 'practice')),
  add column relative_id uuid,
  add column reminded_at timestamptz,
  add check (source = 'practice' or patient_id is not null);
create index appointments_doctor_time on public.appointments (doctor_id, scheduled_at) where status in ('confirmed', 'proposed');

-- ---------------------------------------------------------------------------
-- Plages bloquées (réunion, garde, congé d'une demi-journée…)
-- ---------------------------------------------------------------------------
create table public.practice_blocks (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.doctors(id) on delete cascade,
  site_id uuid references public.doctor_practice_sites(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  note text check (char_length(coalesce(note, '')) <= 120),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at and ends_at - starts_at <= interval '14 days')
);
create index practice_blocks_doctor on public.practice_blocks (doctor_id, starts_at);
alter table public.practice_blocks enable row level security;
create policy "pp_blocks_practice_read" on public.practice_blocks for select to authenticated
  using (doctor_id = public.my_doctor_id() or (site_id is not null and public.can_manage_site(site_id)));
revoke insert, update, delete on public.practice_blocks from anon, authenticated;
grant select on public.practice_blocks to authenticated;

create or replace function public.add_practice_block(p_site uuid, p_start timestamptz, p_end timestamptz, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare s public.doctor_practice_sites; bid uuid;
begin
  select * into s from public.doctor_practice_sites where id = p_site;
  if s.id is null or not public.can_manage_site(p_site) then raise exception 'PP403: action réservée au médecin ou à l''établissement' using errcode = '42501'; end if;
  insert into public.practice_blocks (doctor_id, site_id, starts_at, ends_at, note, created_by)
  values (s.doctor_id, p_site, p_start, p_end, nullif(btrim(coalesce(p_note, '')), ''), auth.uid()) returning id into bid;
  return bid;
exception when check_violation then
  raise exception 'PP422: la fin doit être après le début (14 jours maximum)';
end $$;

create or replace function public.remove_practice_block(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare b public.practice_blocks;
begin
  select * into b from public.practice_blocks where id = p_id;
  if b.id is null or not (coalesce(b.doctor_id = public.my_doctor_id(), false) or (b.site_id is not null and public.can_manage_site(b.site_id))) then
    raise exception 'PP404: plage introuvable';
  end if;
  delete from public.practice_blocks where id = p_id;
end $$;

-- ---------------------------------------------------------------------------
-- Proches du patient
-- ---------------------------------------------------------------------------
create table public.patient_relatives (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  full_name text not null check (char_length(btrim(full_name)) between 2 and 120),
  relation text not null default 'autre' check (relation in ('enfant', 'parent', 'conjoint', 'frere_soeur', 'autre')),
  phone text check (phone is null or public.valid_phone(phone)),
  created_at timestamptz not null default now()
);
create index patient_relatives_user on public.patient_relatives (user_id);
alter table public.patient_relatives enable row level security;
create policy "pp_relatives_own" on public.patient_relatives for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.patient_relatives from anon, authenticated;
grant select on public.patient_relatives to authenticated;
alter table public.appointments add constraint appointments_relative_fk foreign key (relative_id) references public.patient_relatives(id) on delete set null;

create or replace function public.add_relative(p_name text, p_relation text, p_phone text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); rid uuid; v_phone text := public.normalize_ml_phone(p_phone);
begin
  if uid is null then raise exception 'PP401: connectez-vous' using errcode = '42501'; end if;
  if (select count(*) from public.patient_relatives where user_id = uid) >= 10 then raise exception 'PP429: 10 proches maximum'; end if;
  if nullif(btrim(coalesce(p_phone, '')), '') is not null and v_phone is null then raise exception 'PP422: numéro de téléphone invalide'; end if;
  insert into public.patient_relatives (user_id, full_name, relation, phone)
  values (uid, btrim(p_name), coalesce(nullif(p_relation, ''), 'autre'), v_phone) returning id into rid;
  return rid;
exception when check_violation then
  raise exception 'PP422: nom (2 à 120 caractères) et lien de parenté obligatoires';
end $$;

create or replace function public.remove_relative(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.patient_relatives where id = p_id and user_id = auth.uid();
  if not found then raise exception 'PP404: proche introuvable'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- Créneaux disponibles
-- Créneaux de la durée du motif, découpés dans les plages de consultation du lieu,
-- hors délai de prévenance, absences, plages bloquées et rendez-vous existants
-- du médecin (tous lieux confondus). 60 jours maximum.
-- ---------------------------------------------------------------------------
create or replace function public.site_is_bookable(s public.doctor_practice_sites)
returns boolean language sql stable security definer set search_path = public as $$
  select s.doctor_accepted and s.clinic_accepted and s.accepts_appointments and s.booking_mode = 'instant'
     and public.doctor_is_public(s.doctor_id)
     and exists (select 1 from public.clinics c where c.id = s.clinic_id and c.status = 'verified')
$$;

create or replace function public.available_slots(p_site uuid, p_type uuid, p_from date default null, p_days int default 7)
returns table (slot_start timestamptz, slot_end timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare
  s public.doctor_practice_sites; t public.appointment_types;
  today date := (now() at time zone 'UTC')::date; d date; k text; slot jsonb;
  st timestamptz; en timestamptz; cur timestamptz; dur interval; min_start timestamptz;
begin
  select * into s from public.doctor_practice_sites where id = p_site;
  if s.id is null or not public.site_is_bookable(s) then return; end if;
  select * into t from public.appointment_types where id = p_type and doctor_id = s.doctor_id and is_active and (site_id is null or site_id = p_site);
  if t.id is null then return; end if;
  dur := make_interval(mins => t.duration_min);
  min_start := now() + make_interval(hours => s.min_notice_hours);
  for d in select g::date from generate_series(greatest(coalesce(p_from, today), today),
                                                 least(greatest(coalesce(p_from, today), today) + greatest(least(coalesce(p_days, 7), 31), 1) - 1, today + 60),
                                                 interval '1 day') g loop
    continue when exists (select 1 from public.doctor_absences a where a.doctor_id = s.doctor_id and d between a.starts_on and a.ends_on);
    k := public.day_key(d::timestamp at time zone 'UTC');
    for slot in select * from jsonb_array_elements(coalesce(s.schedule -> k, '[]'::jsonb)) loop
      st := (d::timestamp + (slot ->> 0)::time) at time zone 'UTC';
      en := (d::timestamp + case when slot ->> 1 = '24:00' then interval '24 hours' else (slot ->> 1)::time::interval end) at time zone 'UTC';
      cur := st;
      while cur + dur <= en loop
        if cur >= min_start
           and not exists (select 1 from public.appointments a
                           where a.doctor_id = s.doctor_id and a.status in ('confirmed', 'proposed') and a.scheduled_at is not null
                             and tstzrange(a.scheduled_at, coalesce(a.ends_at, a.scheduled_at + interval '30 minutes')) && tstzrange(cur, cur + dur))
           and not exists (select 1 from public.practice_blocks b
                           where b.doctor_id = s.doctor_id and tstzrange(b.starts_at, b.ends_at) && tstzrange(cur, cur + dur)) then
          slot_start := cur; slot_end := cur + dur;
          return next;
        end if;
        cur := cur + dur;
      end loop;
    end loop;
  end loop;
end $$;
alter function public.available_slots(uuid, uuid, date, int) set statement_timeout = '5s';

-- Prochaine disponibilité de chaque médecin (motif ouvert à tous ou aux nouveaux patients, 30 jours)
create or replace function public.next_availabilities(p_doctors uuid[])
returns table (doctor_id uuid, site_id uuid, type_id uuid, slot_start timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare r record; best timestamptz; v_site uuid; v_type uuid; x timestamptz;
begin
  for r in select distinct unnest(p_doctors[1:30]) as did loop
    best := null;
    for v_site, v_type in
      select s.id, t.id from public.doctor_practice_sites s
      join public.appointment_types t on t.doctor_id = s.doctor_id and t.is_active and (t.site_id is null or t.site_id = s.id) and t.audience <> 'returning'
      where s.doctor_id = r.did and public.site_is_bookable(s)
    loop
      select min(a.slot_start) into x from (select av.slot_start from public.available_slots(v_site, v_type, null, 30) av limit 1) a;
      if x is not null and (best is null or x < best) then best := x; doctor_id := r.did; site_id := v_site; type_id := v_type; slot_start := x; end if;
    end loop;
    if best is not null then return next; end if;
  end loop;
end $$;
alter function public.next_availabilities(uuid[]) set statement_timeout = '8s';

-- ---------------------------------------------------------------------------
-- Réservation immédiate d'un créneau
-- ---------------------------------------------------------------------------
create or replace function public.book_appointment(
  p_site uuid, p_type uuid, p_start timestamptz, p_patient_name text, p_phone text,
  p_reason text default null, p_relative uuid default null, p_key text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid(); s public.doctor_practice_sites; t public.appointment_types; d public.doctors; c public.clinics;
  aid uuid; v_name text := btrim(coalesce(p_patient_name, '')); v_phone text := public.normalize_ml_phone(p_phone); seen boolean; rel public.patient_relatives;
begin
  if uid is null then raise exception 'PP401: connectez-vous pour prendre rendez-vous' using errcode = '42501'; end if;
  if p_key is not null then
    select id into aid from public.appointments where patient_id = uid and idempotency_key = p_key;
    if aid is not null then return aid; end if;
  end if;
  select * into s from public.doctor_practice_sites where id = p_site;
  if s.id is null or not public.site_is_bookable(s) then raise exception 'PP404: la réservation en ligne n''est pas ouverte pour ce lieu'; end if;
  select * into t from public.appointment_types where id = p_type and doctor_id = s.doctor_id and is_active and (site_id is null or site_id = p_site);
  if t.id is null then raise exception 'PP404: motif de consultation introuvable'; end if;
  select * into d from public.doctors where id = s.doctor_id;
  select * into c from public.clinics where id = s.clinic_id;
  if p_relative is not null then
    select * into rel from public.patient_relatives where id = p_relative and user_id = uid;
    if rel.id is null then raise exception 'PP404: proche introuvable'; end if;
    v_name := rel.full_name;
    v_phone := coalesce(v_phone, rel.phone);
  end if;
  if char_length(v_name) < 2 then raise exception 'PP422: indiquez le nom du patient'; end if;
  if v_phone is null then raise exception 'PP422: numéro de téléphone invalide'; end if;

  -- Nouveau patient / patient déjà suivi
  seen := exists (select 1 from public.appointments a where a.patient_id = uid and a.doctor_id = d.id
                  and a.relative_id is not distinct from p_relative and a.status in ('completed', 'confirmed') and a.scheduled_at < now());
  if t.audience = 'new' and seen then raise exception 'PP409: ce motif est réservé aux nouveaux patients : choisissez un motif de suivi'; end if;
  if t.audience = 'returning' and not seen then raise exception 'PP409: ce motif est réservé aux patients déjà suivis par ce médecin'; end if;
  if not d.accepts_new_patients and not seen then raise exception 'PP409: ce médecin n''accepte pas de nouveaux patients en ligne pour le moment'; end if;

  if (select count(*) from public.appointments where patient_id = uid and status in ('pending', 'proposed', 'confirmed') and coalesce(scheduled_at, requested_date::timestamptz) >= now()) >= 5 then
    raise exception 'PP429: vous avez déjà 5 rendez-vous à venir : annulez-en un pour en prendre un autre';
  end if;
  if exists (select 1 from public.appointments where patient_id = uid and doctor_id = d.id and relative_id is not distinct from p_relative
             and status in ('pending', 'proposed', 'confirmed') and coalesce(scheduled_at::date, requested_date) = (p_start at time zone 'UTC')::date) then
    raise exception 'PP409: vous avez déjà un rendez-vous avec ce médecin ce jour-là';
  end if;

  -- Une réservation à la fois par médecin : le créneau est revérifié sous verrou
  perform pg_advisory_xact_lock(hashtextextended(d.id::text, 0));
  if not exists (select 1 from public.available_slots(p_site, p_type, (p_start at time zone 'UTC')::date, 1) a where a.slot_start = p_start) then
    raise exception 'PP409: ce créneau n''est plus disponible : choisissez-en un autre';
  end if;

  insert into public.appointments (site_id, doctor_id, clinic_id, patient_id, patient_name, patient_phone, requested_date, requested_period,
                                   reason, status, scheduled_at, ends_at, type_id, relative_id, idempotency_key, source)
  values (s.id, d.id, c.id, uid, v_name, v_phone, (p_start at time zone 'UTC')::date,
          case when extract(hour from p_start at time zone 'UTC') < 13 then 'matin' else 'apres_midi' end,
          nullif(btrim(coalesce(p_reason, '')), ''), 'confirmed', p_start, p_start + make_interval(mins => t.duration_min), t.id, p_relative, p_key, 'online')
  returning id into aid;

  perform public.notify_user(d.user_id, 'appointment', 'Nouveau rendez-vous',
    format('%s — %s, %s à %s (%s).', v_name, t.name, to_char(p_start at time zone 'UTC', 'DD/MM/YYYY'), to_char(p_start at time zone 'UTC', 'HH24"h"MI'), c.name),
    null, '/medecin/rendez-vous?vue=a_venir');
  perform public.notify_clinic(c.id, 'appointment', 'Nouveau rendez-vous',
    format('%s %s — %s, %s à %s.', d.title, d.display_name, v_name, to_char(p_start at time zone 'UTC', 'DD/MM/YYYY'), to_char(p_start at time zone 'UTC', 'HH24"h"MI')),
    format('/clinique/%s/rendez-vous?vue=a_venir', c.id));
  perform public.notify_user(uid, 'appointment', 'Rendez-vous confirmé',
    format('%s %s, %s à %s, %s.%s', d.title, d.display_name, to_char(p_start at time zone 'UTC', 'DD/MM/YYYY'), to_char(p_start at time zone 'UTC', 'HH24"h"MI'), c.name,
           coalesce(' À savoir : ' || t.instructions, '')), null, '/compte/rendez-vous');
  delete from public.appointment_waitlist w where w.user_id = uid and w.doctor_id = d.id;
  return aid;
end $$;

-- Rendez-vous saisi par le cabinet (patient qui a appelé) : bloque le créneau
create or replace function public.practice_add_appointment(
  p_site uuid, p_start timestamptz, p_duration_min int, p_patient_name text, p_phone text, p_note text default null, p_type uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare s public.doctor_practice_sites; aid uuid; v_phone text := public.normalize_ml_phone(p_phone); dur int := coalesce(p_duration_min, 15);
begin
  select * into s from public.doctor_practice_sites where id = p_site;
  if s.id is null or not public.can_manage_site(p_site) then raise exception 'PP403: action réservée au médecin ou à l''établissement' using errcode = '42501'; end if;
  if v_phone is null then raise exception 'PP422: numéro de téléphone invalide'; end if;
  if char_length(btrim(coalesce(p_patient_name, ''))) < 2 then raise exception 'PP422: indiquez le nom du patient'; end if;
  if dur < 5 or dur > 240 then raise exception 'PP422: durée entre 5 et 240 minutes'; end if;
  perform pg_advisory_xact_lock(hashtextextended(s.doctor_id::text, 0));
  if exists (select 1 from public.appointments a where a.doctor_id = s.doctor_id and a.status in ('confirmed', 'proposed') and a.scheduled_at is not null
             and tstzrange(a.scheduled_at, coalesce(a.ends_at, a.scheduled_at + interval '30 minutes')) && tstzrange(p_start, p_start + make_interval(mins => dur))) then
    raise exception 'PP409: un rendez-vous est déjà prévu sur ce créneau';
  end if;
  insert into public.appointments (site_id, doctor_id, clinic_id, patient_id, patient_name, patient_phone, requested_date, requested_period,
                                   status, scheduled_at, ends_at, type_id, response_note, source, decided_by)
  values (s.id, s.doctor_id, s.clinic_id, null, btrim(p_patient_name), v_phone, (p_start at time zone 'UTC')::date,
          case when extract(hour from p_start at time zone 'UTC') < 13 then 'matin' else 'apres_midi' end,
          'confirmed', p_start, p_start + make_interval(mins => dur), p_type, nullif(btrim(coalesce(p_note, '')), ''), 'practice', auth.uid())
  returning id into aid;
  return aid;
end $$;

-- ---------------------------------------------------------------------------
-- Liste d'attente : prévenir quand un créneau se libère
-- ---------------------------------------------------------------------------
create table public.appointment_waitlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  doctor_id uuid not null references public.doctors(id) on delete cascade,
  site_id uuid not null references public.doctor_practice_sites(id) on delete cascade,
  until_date date not null,
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, site_id)
);
alter table public.appointment_waitlist enable row level security;
create policy "pp_waitlist_own" on public.appointment_waitlist for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.appointment_waitlist from anon, authenticated;
grant select on public.appointment_waitlist to authenticated;

create or replace function public.join_waitlist(p_site uuid, p_until date)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); s public.doctor_practice_sites; wid uuid;
begin
  if uid is null then raise exception 'PP401: connectez-vous' using errcode = '42501'; end if;
  select * into s from public.doctor_practice_sites where id = p_site;
  if s.id is null or not public.site_is_bookable(s) then raise exception 'PP404: la réservation en ligne n''est pas ouverte pour ce lieu'; end if;
  if p_until is null or p_until < (now() at time zone 'UTC')::date or p_until > (now() at time zone 'UTC')::date + 60 then
    raise exception 'PP422: choisissez une date limite dans les 60 prochains jours';
  end if;
  if (select count(*) from public.appointment_waitlist where user_id = uid) >= 5 then raise exception 'PP429: 5 alertes maximum'; end if;
  insert into public.appointment_waitlist (user_id, doctor_id, site_id, until_date) values (uid, s.doctor_id, p_site, p_until)
  on conflict (user_id, site_id) do update set until_date = excluded.until_date, notified_at = null
  returning id into wid;
  return wid;
end $$;

create or replace function public.leave_waitlist(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.appointment_waitlist where id = p_id and user_id = auth.uid();
  if not found then raise exception 'PP404: alerte introuvable'; end if;
end $$;

-- Annulation (remplace la version précédente) : délai d'annulation en ligne + alerte liste d'attente
create or replace function public.cancel_appointment(p_id uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare a public.appointments; is_patient boolean; d public.doctors; s public.doctor_practice_sites; w record; v_when text;
begin
  select * into a from public.appointments where id = p_id for update;
  if a.id is null then raise exception 'PP404: rendez-vous introuvable'; end if;
  is_patient := coalesce(a.patient_id = auth.uid(), false);
  if not is_patient and not public.can_manage_appointment(a) then raise exception 'PP404: rendez-vous introuvable'; end if;
  if a.status not in ('pending', 'proposed', 'confirmed') then raise exception 'PP409: ce rendez-vous ne peut plus être annulé'; end if;
  if a.status = 'confirmed' and a.scheduled_at < now() then raise exception 'PP409: l''heure du rendez-vous est passée'; end if;
  select * into s from public.doctor_practice_sites where id = a.site_id;
  if is_patient and a.status = 'confirmed' and s.id is not null and a.scheduled_at - now() < make_interval(hours => s.cancel_notice_hours) then
    raise exception 'PP409: annulation en ligne impossible moins de % h avant : appelez le cabinet', s.cancel_notice_hours;
  end if;
  if not is_patient and char_length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'PP422: indiquez un motif au patient'; end if;
  update public.appointments set status = 'cancelled', cancelled_by = case when is_patient then 'patient' else 'practice' end,
         response_note = case when is_patient then response_note else btrim(p_reason) end where id = p_id;
  select * into d from public.doctors where id = a.doctor_id;
  v_when := coalesce(to_char(a.scheduled_at at time zone 'UTC', 'DD/MM/YYYY HH24"h"MI'), to_char(a.requested_date, 'DD/MM/YYYY'));
  if is_patient then
    perform public.notify_user(d.user_id, 'appointment', 'Rendez-vous annulé par le patient', format('%s, %s.', a.patient_name, v_when), null, '/medecin/rendez-vous');
    perform public.notify_clinic(a.clinic_id, 'appointment', 'Rendez-vous annulé par le patient', format('%s, %s.', a.patient_name, v_when), format('/clinique/%s/rendez-vous', a.clinic_id));
  elsif a.patient_id is not null then
    perform public.notify_user(a.patient_id, 'appointment', 'Rendez-vous annulé', format('%s %s : %s', d.title, d.display_name, btrim(p_reason)), null, '/compte/rendez-vous');
  end if;
  -- Créneau libéré : prévenir la liste d'attente (10 personnes au plus, une fois par jour)
  if a.status = 'confirmed' and a.scheduled_at > now() and a.site_id is not null then
    for w in select * from public.appointment_waitlist
             where site_id = a.site_id and until_date >= (a.scheduled_at at time zone 'UTC')::date
               and user_id is distinct from a.patient_id and (notified_at is null or notified_at < now() - interval '1 day')
             order by created_at limit 10 loop
      perform public.notify_user(w.user_id, 'appointment', 'Un créneau s''est libéré',
        format('%s %s : le %s à %s. Réservez vite, il est proposé à plusieurs personnes.', d.title, d.display_name,
               to_char(a.scheduled_at at time zone 'UTC', 'DD/MM/YYYY'), to_char(a.scheduled_at at time zone 'UTC', 'HH24"h"MI')),
        null, format('/medecins/%s/rendez-vous?lieu=%s', a.doctor_id, a.site_id));
      update public.appointment_waitlist set notified_at = now() where id = w.id;
    end loop;
  end if;
  perform public.log_audit('appointment.cancel', 'appointment', p_id::text, jsonb_build_object('by', case when is_patient then 'patient' else 'practice' end));
end $$;

-- Rappel la veille (notification ; SMS en file d'attente si un prestataire est branché)
create or replace function public.send_appointment_reminders()
returns int language plpgsql security definer set search_path = public as $$
declare r record; n int := 0; nid uuid;
begin
  for r in
    update public.appointments a set reminded_at = now()
    where a.status = 'confirmed' and a.reminded_at is null and a.patient_id is not null
      and a.scheduled_at between now() + interval '2 hours' and now() + interval '26 hours'
    returning a.id, a.patient_id, a.scheduled_at, a.doctor_id, a.clinic_id
  loop
    insert into public.notifications (user_id, kind, title, body, link)
    select r.patient_id, 'appointment', 'Rappel de rendez-vous',
           format('%s %s, le %s à %s, %s. Empêché ? Annulez pour libérer le créneau.', d.title, d.display_name,
                  to_char(r.scheduled_at at time zone 'UTC', 'DD/MM/YYYY'), to_char(r.scheduled_at at time zone 'UTC', 'HH24"h"MI'), c.name),
           '/compte/rendez-vous'
    from public.doctors d, public.clinics c where d.id = r.doctor_id and c.id = r.clinic_id
    returning id into nid;
    insert into public.notification_outbox (notification_id, channel) values (nid, 'sms');
    n := n + 1;
  end loop;
  delete from public.appointment_waitlist where until_date < (now() at time zone 'UTC')::date;
  return n;
end $$;

create or replace function public.run_maintenance()
returns jsonb language plpgsql security definer set search_path = public as $$
declare expired int; rl int; logs int; notifs int; outbox int; issues int; reminders int; appts int; appt_rem int;
begin
  expired := public.expire_overdue_orders();
  appts := public.expire_appointments();
  appt_rem := public.send_appointment_reminders();
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
                                      'directory_reminders', reminders, 'appointments_expired', appts, 'appointment_reminders', appt_rem), issues);
  delete from public.maintenance_runs where ran_at < now() - interval '30 days';
  return jsonb_build_object('expired', expired, 'appointments_expired', appts, 'appointment_reminders', appt_rem,
    'purged', jsonb_build_object('rate_limits', rl, 'search_logs', logs, 'notifications', notifs, 'outbox', outbox, 'directory_reminders', reminders),
    'critical_issues', issues);
end $$;
revoke execute on function public.run_maintenance() from public, anon, authenticated;
grant execute on function public.run_maintenance() to service_role;

-- ---------------------------------------------------------------------------
-- Listes (versions enrichies)
-- ---------------------------------------------------------------------------
drop function public.my_appointments();
create function public.my_appointments()
returns table (id uuid, status text, requested_date date, requested_period text, scheduled_at timestamptz, ends_at timestamptz, response_note text,
               patient_name text, reason text, cancelled_by text, created_at timestamptz,
               doctor_id uuid, doctor_label text, clinic_id uuid, clinic_name text, clinic_address text, phone text,
               site_id uuid, type_name text, instructions text, access_info text, can_cancel boolean, cancel_notice_hours int)
language sql stable security definer set search_path = public as $$
  select a.id, a.status, a.requested_date, a.requested_period, a.scheduled_at, a.ends_at, a.response_note, a.patient_name, a.reason, a.cancelled_by, a.created_at,
         d.id, d.title || ' ' || d.display_name, c.id, c.name, c.address, coalesce(s.appointment_phone, c.phone),
         a.site_id, t.name, t.instructions, s.access_info,
         a.status in ('pending', 'proposed') or (a.status = 'confirmed' and a.scheduled_at - now() >= make_interval(hours => coalesce(s.cancel_notice_hours, 0))),
         coalesce(s.cancel_notice_hours, 0)
  from public.appointments a
  join public.doctors d on d.id = a.doctor_id
  join public.clinics c on c.id = a.clinic_id
  left join public.doctor_practice_sites s on s.id = a.site_id
  left join public.appointment_types t on t.id = a.type_id
  where a.patient_id = auth.uid()
  order by (a.status in ('pending', 'proposed', 'confirmed')) desc, coalesce(a.scheduled_at, a.requested_date::timestamptz) desc
  limit 100
$$;

drop function public.practice_appointments(uuid, text);
create function public.practice_appointments(p_clinic uuid default null, p_view text default 'a_traiter', p_date date default null)
returns table (id uuid, status text, requested_date date, requested_period text, scheduled_at timestamptz, ends_at timestamptz, response_note text,
               patient_name text, patient_phone text, reason text, cancelled_by text, created_at timestamptz,
               doctor_label text, clinic_id uuid, clinic_name text, type_name text, source text, site_id uuid)
language plpgsql stable security definer set search_path = public as $$
declare me uuid := public.my_doctor_id();
begin
  if p_clinic is null and me is null then raise exception 'PP403: espace médecin requis' using errcode = '42501'; end if;
  if p_clinic is not null and not public.is_clinic_member(p_clinic) then raise exception 'PP403: action réservée à l''établissement' using errcode = '42501'; end if;
  return query
  select a.id, a.status, a.requested_date, a.requested_period, a.scheduled_at, a.ends_at, a.response_note, a.patient_name, a.patient_phone, a.reason, a.cancelled_by, a.created_at,
         d.title || ' ' || d.display_name, c.id, c.name, t.name, a.source, a.site_id
  from public.appointments a
  join public.doctors d on d.id = a.doctor_id
  join public.clinics c on c.id = a.clinic_id
  left join public.appointment_types t on t.id = a.type_id
  where (case when p_clinic is null then a.doctor_id = me else a.clinic_id = p_clinic end)
    and case p_view
          when 'a_traiter' then a.status in ('pending', 'proposed')
          when 'a_venir' then a.status = 'confirmed' and a.scheduled_at >= date_trunc('day', now())
          when 'a_cloturer' then a.status = 'confirmed' and a.scheduled_at < now()
          when 'jour' then a.status in ('confirmed', 'proposed', 'completed', 'no_show')
                           and (a.scheduled_at at time zone 'UTC')::date = coalesce(p_date, (now() at time zone 'UTC')::date)
          else a.status not in ('pending', 'proposed') and not (a.status = 'confirmed' and a.scheduled_at >= date_trunc('day', now()))
        end
  order by case when p_view in ('a_traiter', 'a_venir', 'a_cloturer', 'jour') then coalesce(a.scheduled_at, a.requested_date::timestamptz) end asc,
           a.updated_at desc
  limit 300;
end $$;

-- ---------------------------------------------------------------------------
-- Droits
-- ---------------------------------------------------------------------------
revoke execute on function public.site_is_bookable(public.doctor_practice_sites), public.send_appointment_reminders()
  from public, anon, authenticated;
-- Utilisée par les politiques RLS (se limite aux droits de l'utilisateur connecté)
revoke execute on function public.can_manage_site(uuid) from public, anon;
grant execute on function public.can_manage_site(uuid) to authenticated;
grant execute on function public.send_appointment_reminders() to service_role;
revoke execute on function public.update_doctor_practice_info(jsonb), public.update_site_booking(uuid, text, int, int, text),
  public.save_appointment_type(jsonb), public.add_practice_block(uuid, timestamptz, timestamptz, text), public.remove_practice_block(uuid),
  public.add_relative(text, text, text), public.remove_relative(uuid),
  public.book_appointment(uuid, uuid, timestamptz, text, text, text, uuid, text),
  public.practice_add_appointment(uuid, timestamptz, int, text, text, text, uuid),
  public.join_waitlist(uuid, date), public.leave_waitlist(uuid), public.my_appointments(), public.practice_appointments(uuid, text, date)
  from public, anon;
grant execute on function public.update_doctor_practice_info(jsonb), public.update_site_booking(uuid, text, int, int, text),
  public.save_appointment_type(jsonb), public.add_practice_block(uuid, timestamptz, timestamptz, text), public.remove_practice_block(uuid),
  public.add_relative(text, text, text), public.remove_relative(uuid),
  public.book_appointment(uuid, uuid, timestamptz, text, text, text, uuid, text),
  public.practice_add_appointment(uuid, timestamptz, int, text, text, text, uuid),
  public.join_waitlist(uuid, date), public.leave_waitlist(uuid), public.my_appointments(), public.practice_appointments(uuid, text, date)
  to authenticated;
grant execute on function public.available_slots(uuid, uuid, date, int), public.next_availabilities(uuid[]) to anon, authenticated;

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

-- >>> 20261102000100_health_tools.sql
-- ============================================================================
-- PharmaProxi — Migration : outils de santé personnels et alertes
--   1. Carnet de vaccination des enfants (calendrier officiel du PEV, rappels).
--   2. Traitements : rappels de prise et de renouvellement.
--   3. Tension et glycémie : carnet de mesures (aucune interprétation affichée).
--   4. Don de sang : alertes de besoin publiées par l'administration, abonnement
--      volontaire par groupe sanguin.
--   5. Alertes sanitaires officielles (source obligatoire).
-- Données personnelles de santé : visibles par leur seul propriétaire (RLS),
-- supprimées avec le compte. Peut être relancé sans erreur.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Calendrier vaccinal (ministère de la Santé du Mali) et carnet des enfants
-- ---------------------------------------------------------------------------
create table if not exists public.vaccine_schedule (
  code text primary key,
  label text not null,
  protects text not null,
  visit_key text not null,
  visit_label text not null,
  age_days int not null check (age_days >= 0),
  girls_only boolean not null default false,
  sort int not null
);
alter table public.vaccine_schedule enable row level security;
drop policy if exists "pp_vaccine_schedule_read" on public.vaccine_schedule;
create policy "pp_vaccine_schedule_read" on public.vaccine_schedule for select to anon, authenticated using (true);
revoke insert, update, delete on public.vaccine_schedule from anon, authenticated;
grant select on public.vaccine_schedule to anon, authenticated;

insert into public.vaccine_schedule (code, label, protects, visit_key, visit_label, age_days, girls_only, sort) values
  ('BCG',   'BCG',                          'Tuberculose',                                        'naissance', 'À la naissance', 0,   false, 10),
  ('VPO0',  'Polio oral (VPO 0)',           'Poliomyélite',                                       'naissance', 'À la naissance', 0,   false, 11),
  ('PENTA1','Pentavalent 1',                'Diphtérie, tétanos, coqueluche, hépatite B, Hib',    's6',  '6 semaines',  42,  false, 20),
  ('VPO1',  'Polio oral (VPO 1)',           'Poliomyélite',                                       's6',  '6 semaines',  42,  false, 21),
  ('PCV1',  'Pneumocoque (PCV13) 1',        'Pneumonies, méningites à pneumocoque',               's6',  '6 semaines',  42,  false, 22),
  ('ROTA1', 'Rotavirus 1',                  'Diarrhées graves à rotavirus',                       's6',  '6 semaines',  42,  false, 23),
  ('PENTA2','Pentavalent 2',                'Diphtérie, tétanos, coqueluche, hépatite B, Hib',    's10', '10 semaines', 70,  false, 30),
  ('VPO2',  'Polio oral (VPO 2)',           'Poliomyélite',                                       's10', '10 semaines', 70,  false, 31),
  ('PCV2',  'Pneumocoque (PCV13) 2',        'Pneumonies, méningites à pneumocoque',               's10', '10 semaines', 70,  false, 32),
  ('ROTA2', 'Rotavirus 2',                  'Diarrhées graves à rotavirus',                       's10', '10 semaines', 70,  false, 33),
  ('PENTA3','Pentavalent 3',                'Diphtérie, tétanos, coqueluche, hépatite B, Hib',    's14', '14 semaines', 98,  false, 40),
  ('VPO3',  'Polio oral (VPO 3)',           'Poliomyélite',                                       's14', '14 semaines', 98,  false, 41),
  ('PCV3',  'Pneumocoque (PCV13) 3',        'Pneumonies, méningites à pneumocoque',               's14', '14 semaines', 98,  false, 42),
  ('ROTA3', 'Rotavirus 3',                  'Diarrhées graves à rotavirus',                       's14', '14 semaines', 98,  false, 43),
  ('VPI1',  'Polio injectable (VPI 1)',     'Poliomyélite',                                       's14', '14 semaines', 98,  false, 44),
  ('PALU1', 'Paludisme 1',                  'Paludisme',                                          'm6',  '6 mois',      183, false, 50),
  ('PALU2', 'Paludisme 2',                  'Paludisme',                                          'm7',  '7 mois',      213, false, 60),
  ('PALU3', 'Paludisme 3',                  'Paludisme',                                          'm8',  '8 mois',      244, false, 70),
  ('RR1',   'Rougeole-rubéole (RR 1)',      'Rougeole, rubéole',                                  'm9',  '9 mois',      274, false, 80),
  ('VAA',   'Fièvre jaune (VAA)',           'Fièvre jaune',                                       'm9',  '9 mois',      274, false, 81),
  ('MENA',  'Méningite (MenAfriVac)',       'Méningite A',                                        'm9',  '9 mois',      274, false, 82),
  ('VPI2',  'Polio injectable (VPI 2)',     'Poliomyélite',                                       'm9',  '9 mois',      274, false, 83),
  ('RR2',   'Rougeole-rubéole (RR 2)',      'Rougeole, rubéole',                                  'm15', '15 à 23 mois', 456, false, 90),
  ('ALB',   'Déparasitage (albendazole)',   'Vers intestinaux',                                   'm15', '15 à 23 mois', 456, false, 91),
  ('HPV1',  'HPV 1',                        'Cancer du col de l''utérus',                          'a10', '10 ans (filles)', 3653, true, 100),
  ('HPV2',  'HPV 2',                        'Cancer du col de l''utérus',                          'a10b','10 ans et 6 mois (filles)', 3836, true, 110)
on conflict (code) do update set label = excluded.label, protects = excluded.protects, visit_key = excluded.visit_key,
  visit_label = excluded.visit_label, age_days = excluded.age_days, girls_only = excluded.girls_only, sort = excluded.sort;

create table if not exists public.children (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  first_name text not null check (char_length(btrim(first_name)) between 1 and 60),
  birth_date date not null check (birth_date <= current_date + 1 and birth_date >= date '2008-01-01'),
  sex text check (sex in ('F', 'M')),
  remind boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists children_user on public.children (user_id);
alter table public.children enable row level security;
drop policy if exists "pp_children_owner" on public.children;
create policy "pp_children_owner" on public.children for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.children from anon;
grant select, insert, update, delete on public.children to authenticated;

create table if not exists public.child_vaccinations (
  child_id uuid not null references public.children(id) on delete cascade,
  dose_code text not null references public.vaccine_schedule(code) on delete cascade,
  done_on date not null check (done_on <= current_date + 1),
  place text check (char_length(coalesce(place, '')) <= 100),
  primary key (child_id, dose_code)
);
alter table public.child_vaccinations enable row level security;
drop policy if exists "pp_child_vacc_owner" on public.child_vaccinations;
create policy "pp_child_vacc_owner" on public.child_vaccinations for all to authenticated
  using (exists (select 1 from public.children c where c.id = child_id and c.user_id = auth.uid()))
  with check (exists (select 1 from public.children c where c.id = child_id and c.user_id = auth.uid()));
revoke all on public.child_vaccinations from anon;
grant select, insert, update, delete on public.child_vaccinations to authenticated;

create table if not exists public.child_reminder_log (
  child_id uuid not null references public.children(id) on delete cascade,
  visit_key text not null,
  kind text not null check (kind in ('j-3', 'j0')),
  sent_at timestamptz not null default now(),
  primary key (child_id, visit_key, kind)
);
alter table public.child_reminder_log enable row level security;
revoke all on public.child_reminder_log from anon, authenticated;

create or replace function public.child_limit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.children where user_id = new.user_id) >= 12 then raise exception 'PP429: 12 enfants maximum'; end if;
  return new;
end $$;
drop trigger if exists children_limit on public.children;
create trigger children_limit before insert on public.children for each row execute function public.child_limit();

-- ---------------------------------------------------------------------------
-- 2. Traitements
-- ---------------------------------------------------------------------------
create or replace function public.valid_hhmm_list(p text[])
returns boolean language sql immutable as $$
  select coalesce(bool_and(x ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'), false) from unnest(p) x
$$;
create table if not exists public.treatments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 120),
  dose_note text check (char_length(coalesce(dose_note, '')) <= 120),          -- ex. « 1 comprimé »
  times text[] not null check (cardinality(times) between 1 and 6 and public.valid_hhmm_list(times)),
  start_date date not null default current_date,
  duration_days int check (duration_days is null or duration_days between 1 and 730),   -- null : au long cours
  units_in_stock numeric(7, 1) check (units_in_stock is null or units_in_stock between 0 and 10000),
  units_per_intake numeric(5, 2) not null default 1 check (units_per_intake > 0 and units_per_intake <= 50),
  stock_date date not null default current_date,                             -- date de la saisie du stock
  remind_intake boolean not null default true,
  remind_renewal boolean not null default true,
  active boolean not null default true,
  renewal_notified_on date,
  created_at timestamptz not null default now()
);
create index if not exists treatments_user on public.treatments (user_id);
alter table public.treatments enable row level security;
drop policy if exists "pp_treatments_owner" on public.treatments;
create policy "pp_treatments_owner" on public.treatments for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.treatments from anon;
grant select, insert, update, delete on public.treatments to authenticated;

create table if not exists public.treatment_intakes (
  treatment_id uuid not null references public.treatments(id) on delete cascade,
  day date not null,
  slot text not null,
  taken_at timestamptz,
  notified_at timestamptz,
  primary key (treatment_id, day, slot)
);
alter table public.treatment_intakes enable row level security;
drop policy if exists "pp_intakes_owner" on public.treatment_intakes;
create policy "pp_intakes_owner" on public.treatment_intakes for all to authenticated
  using (exists (select 1 from public.treatments t where t.id = treatment_id and t.user_id = auth.uid()))
  with check (exists (select 1 from public.treatments t where t.id = treatment_id and t.user_id = auth.uid()));
revoke all on public.treatment_intakes from anon;
grant select, insert, update, delete on public.treatment_intakes to authenticated;

create or replace function public.treatment_limit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.treatments where user_id = new.user_id) >= 30 then raise exception 'PP429: 30 traitements maximum'; end if;
  return new;
end $$;
drop trigger if exists treatments_limit on public.treatments;
create trigger treatments_limit before insert on public.treatments for each row execute function public.treatment_limit();

-- Jours de traitement restants selon le stock déclaré (null si stock inconnu)
create or replace function public.treatment_days_left(t public.treatments, p_today date default (now() at time zone 'utc')::date)
returns int language sql stable as $$
  select case when t.units_in_stock is null then null
    else greatest(0, floor(t.units_in_stock / (t.units_per_intake * cardinality(t.times))) - greatest(0, p_today - t.stock_date))::int end
$$;

-- ---------------------------------------------------------------------------
-- 3. Tension et glycémie
-- ---------------------------------------------------------------------------
create table if not exists public.health_measures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('tension', 'glycemie')),
  systolic int check (systolic between 50 and 300),
  diastolic int check (diastolic between 30 and 200),
  pulse int check (pulse between 30 and 250),
  glucose_gl numeric(4, 2) check (glucose_gl between 0.2 and 6),   -- en g/L
  context text check (context in ('a_jeun', 'apres_repas', 'autre')),
  measured_at timestamptz not null default now() check (measured_at <= now() + interval '1 day'),
  note text check (char_length(coalesce(note, '')) <= 200),
  created_at timestamptz not null default now(),
  check ((kind = 'tension' and systolic is not null and diastolic is not null and systolic > diastolic and glucose_gl is null)
      or (kind = 'glycemie' and glucose_gl is not null and systolic is null and diastolic is null))
);
create index if not exists health_measures_user on public.health_measures (user_id, kind, measured_at desc);
alter table public.health_measures enable row level security;
drop policy if exists "pp_measures_owner" on public.health_measures;
create policy "pp_measures_owner" on public.health_measures for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.health_measures from anon;
grant select, insert, update, delete on public.health_measures to authenticated;

create or replace function public.measure_limit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.health_measures where user_id = new.user_id and created_at > now() - interval '1 day') >= 60 then
    raise exception 'PP429: 60 mesures par jour au maximum';
  end if;
  return new;
end $$;
drop trigger if exists measures_limit on public.health_measures;
create trigger measures_limit before insert on public.health_measures for each row execute function public.measure_limit();

-- ---------------------------------------------------------------------------
-- 4 et 5. Préférences d'alerte, besoins en sang, alertes sanitaires
-- ---------------------------------------------------------------------------
create table if not exists public.user_alert_prefs (
  user_id uuid primary key default auth.uid() references public.profiles(id) on delete cascade,
  health_alerts boolean not null default false,
  blood_alerts boolean not null default false,
  blood_group text check (blood_group in ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
  region_id uuid references public.regions(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.user_alert_prefs enable row level security;
drop policy if exists "pp_alert_prefs_owner" on public.user_alert_prefs;
create policy "pp_alert_prefs_owner" on public.user_alert_prefs for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.user_alert_prefs from anon;
grant select, insert, update, delete on public.user_alert_prefs to authenticated;

create table if not exists public.blood_needs (
  id uuid primary key default gen_random_uuid(),
  facility text not null check (char_length(btrim(facility)) between 2 and 150),
  region_id uuid references public.regions(id) on delete set null,
  blood_groups text[] not null default '{}' check (blood_groups <@ array['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']),
  message text check (char_length(coalesce(message, '')) <= 400),
  where_to_give text check (char_length(coalesce(where_to_give, '')) <= 200),
  contact_phone text check (contact_phone is null or public.valid_phone(contact_phone)),
  source text not null check (char_length(btrim(source)) between 3 and 200),     -- qui a signalé le besoin
  expires_at timestamptz not null,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.blood_needs enable row level security;
drop policy if exists "pp_blood_needs_read" on public.blood_needs;
create policy "pp_blood_needs_read" on public.blood_needs for select to anon, authenticated using ((active and expires_at > now()) or public.is_admin());
revoke insert, update, delete on public.blood_needs from anon, authenticated;
grant select on public.blood_needs to anon, authenticated;

create table if not exists public.health_alerts (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('faux_medicament', 'rappel_lot', 'campagne', 'epidemie', 'autre')),
  title text not null check (char_length(btrim(title)) between 5 and 160),
  body text not null check (char_length(btrim(body)) between 10 and 2000),
  source_name text not null check (char_length(btrim(source_name)) between 3 and 160),
  source_url text not null check (source_url ~ '^https?://'),
  region_id uuid references public.regions(id) on delete set null,
  published_at timestamptz not null default now(),
  expires_at timestamptz,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null
);
create index if not exists health_alerts_pub on public.health_alerts (published_at desc);
alter table public.health_alerts enable row level security;
drop policy if exists "pp_health_alerts_read" on public.health_alerts;
create policy "pp_health_alerts_read" on public.health_alerts for select to anon, authenticated
  using ((active and published_at <= now() and (expires_at is null or expires_at > now())) or public.is_admin());
revoke insert, update, delete on public.health_alerts from anon, authenticated;
grant select on public.health_alerts to anon, authenticated;

create or replace function public.admin_save_blood_need(p jsonb, p_notify boolean default true)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_admin(); v_id uuid := nullif(p ->> 'id', '')::uuid; v_phone text; v_groups text[]; n int := 0;
begin
  v_phone := case when btrim(coalesce(p ->> 'contact_phone', '')) = '' then null else public.normalize_ml_phone(p ->> 'contact_phone') end;
  if btrim(coalesce(p ->> 'contact_phone', '')) <> '' and v_phone is null then raise exception 'PP422: téléphone invalide'; end if;
  select coalesce(array_agg(distinct g), '{}') into v_groups from jsonb_array_elements_text(coalesce(p -> 'blood_groups', '[]')) g;
  if v_id is null then
    insert into public.blood_needs (facility, region_id, blood_groups, message, where_to_give, contact_phone, source, expires_at, created_by)
    values (btrim(p ->> 'facility'), nullif(p ->> 'region_id', '')::uuid, v_groups, nullif(btrim(coalesce(p ->> 'message', '')), ''),
            nullif(btrim(coalesce(p ->> 'where_to_give', '')), ''), v_phone, btrim(coalesce(p ->> 'source', '')),
            coalesce(nullif(p ->> 'expires_at', '')::timestamptz, now() + interval '3 days'), uid)
    returning id into v_id;
    if p_notify then
      insert into public.notifications (user_id, kind, title, body, link)
      select a.user_id, 'sang', 'Besoin de sang' || case when cardinality(v_groups) > 0 then ' ' || array_to_string(v_groups, ', ') else '' end,
             btrim(p ->> 'facility') || ' : un don peut sauver une vie. Voir où donner.', '/don-de-sang'
        from public.user_alert_prefs a join public.profiles pr on pr.id = a.user_id and pr.deleted_at is null
       where a.blood_alerts
         and (cardinality(v_groups) = 0 or a.blood_group is null or a.blood_group = any(v_groups))
         and (a.region_id is null or nullif(p ->> 'region_id', '') is null or a.region_id = (p ->> 'region_id')::uuid);
      get diagnostics n = row_count;
    end if;
  elsif not (p ? 'facility') then
    update public.blood_needs set active = coalesce((p ->> 'active')::boolean, active) where id = v_id;
  else
    update public.blood_needs set facility = btrim(p ->> 'facility'), region_id = nullif(p ->> 'region_id', '')::uuid, blood_groups = v_groups,
      message = nullif(btrim(coalesce(p ->> 'message', '')), ''), where_to_give = nullif(btrim(coalesce(p ->> 'where_to_give', '')), ''),
      contact_phone = v_phone, source = btrim(coalesce(p ->> 'source', '')), expires_at = coalesce(nullif(p ->> 'expires_at', '')::timestamptz, expires_at),
      active = coalesce((p ->> 'active')::boolean, active)
    where id = v_id;
  end if;
  perform public.log_audit('blood_need.save', 'blood_need', v_id::text, jsonb_build_object('notified', n));
  return v_id;
exception
  when check_violation or invalid_datetime_format or invalid_text_representation then
    raise exception 'PP422: valeurs invalides (établissement, source du signalement, groupes, date de fin)';
end $$;

create or replace function public.admin_save_health_alert(p jsonb, p_notify boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_admin(); v_id uuid := nullif(p ->> 'id', '')::uuid; n int := 0;
begin
  if v_id is null then
    insert into public.health_alerts (kind, title, body, source_name, source_url, region_id, published_at, expires_at, created_by)
    values (p ->> 'kind', btrim(p ->> 'title'), btrim(p ->> 'body'), btrim(p ->> 'source_name'), btrim(p ->> 'source_url'),
            nullif(p ->> 'region_id', '')::uuid, coalesce(nullif(p ->> 'published_at', '')::timestamptz, now()), nullif(p ->> 'expires_at', '')::timestamptz, uid)
    returning id into v_id;
    if p_notify then
      insert into public.notifications (user_id, kind, title, body, link)
      select a.user_id, 'alerte', 'Alerte sanitaire', btrim(p ->> 'title'), '/alertes'
        from public.user_alert_prefs a join public.profiles pr on pr.id = a.user_id and pr.deleted_at is null
       where a.health_alerts and (a.region_id is null or nullif(p ->> 'region_id', '') is null or a.region_id = (p ->> 'region_id')::uuid);
      get diagnostics n = row_count;
    end if;
  elsif not (p ? 'title') then
    update public.health_alerts set active = coalesce((p ->> 'active')::boolean, active) where id = v_id;
  else
    update public.health_alerts set kind = p ->> 'kind', title = btrim(p ->> 'title'), body = btrim(p ->> 'body'), source_name = btrim(p ->> 'source_name'),
      source_url = btrim(p ->> 'source_url'), region_id = nullif(p ->> 'region_id', '')::uuid, expires_at = nullif(p ->> 'expires_at', '')::timestamptz,
      active = coalesce((p ->> 'active')::boolean, active)
    where id = v_id;
  end if;
  perform public.log_audit('health_alert.save', 'health_alert', v_id::text, jsonb_build_object('notified', n));
  return v_id;
exception
  when check_violation or not_null_violation or invalid_datetime_format or invalid_text_representation then
    raise exception 'PP422: valeurs invalides (titre, texte, nom et lien de la source officielle obligatoires)';
end $$;

revoke execute on function public.admin_save_blood_need(jsonb, boolean), public.admin_save_health_alert(jsonb, boolean) from public, anon;
grant execute on function public.admin_save_blood_need(jsonb, boolean), public.admin_save_health_alert(jsonb, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Rappels (appelés toutes les 10 minutes par run_maintenance). Heure du Mali = UTC.
-- ---------------------------------------------------------------------------
create or replace function public.health_tools_reminders()
returns int language plpgsql security definer set search_path = public as $$
declare n int := 0; k int; today date := (now() at time zone 'utc')::date; hm text := to_char(now() at time zone 'utc', 'HH24:MI');
begin
  -- Vaccins : 3 jours avant et le jour du rendez-vous, s'il reste au moins une dose à faire
  with v as (
    select c.id as child_id, c.user_id, c.first_name, s.visit_key, min(s.visit_label) as visit_label, (c.birth_date + min(s.age_days)) as due,
           case when c.birth_date + min(s.age_days) = today + 3 then 'j-3' else 'j0' end as kind
      from public.children c join public.vaccine_schedule s on (not s.girls_only or c.sex = 'F')
      join public.profiles pr on pr.id = c.user_id and pr.deleted_at is null
     where c.remind and not exists (select 1 from public.child_vaccinations cv where cv.child_id = c.id and cv.dose_code = s.code)
     group by c.id, c.user_id, c.first_name, c.birth_date, s.visit_key
    having c.birth_date + min(s.age_days) in (today, today + 3)),
  ins as (
    insert into public.child_reminder_log (child_id, visit_key, kind)
    select child_id, visit_key, kind from v on conflict do nothing returning child_id, visit_key, kind)
  insert into public.notifications (user_id, kind, title, body, link)
  select v.user_id, 'vaccin', 'Vaccins de ' || v.first_name || case when ins.kind = 'j-3' then ' dans 3 jours' else ' aujourd''hui' end,
         'Rendez-vous des ' || v.visit_label || ' : allez au centre de santé avec le carnet de vaccination.', '/ma-sante/enfants/' || v.child_id
    from ins join v on v.child_id = ins.child_id and v.visit_key = ins.visit_key and v.kind = ins.kind;
  get diagnostics k = row_count; n := n + k;

  -- Prises de traitement : notification à l'heure prévue (fenêtre de 30 minutes)
  with due as (
    select t.id, t.user_id, s.slot
      from public.treatments t cross join unnest(t.times) as s(slot)
      join public.profiles pr on pr.id = t.user_id and pr.deleted_at is null
     where t.active and t.remind_intake and t.start_date <= today
       and (t.duration_days is null or today < t.start_date + t.duration_days)
       and s.slot <= hm and s.slot > to_char((now() at time zone 'utc') - interval '30 minutes', 'HH24:MI')),
  ins as (
    insert into public.treatment_intakes (treatment_id, day, slot, notified_at)
    select id, today, slot, now() from due
    on conflict (treatment_id, day, slot) do nothing returning treatment_id)
  insert into public.notifications (user_id, kind, title, body, link)
  select t.user_id, 'traitement', 'C''est l''heure de votre traitement', 'Ouvrez PharmaProxi pour le noter comme pris.', '/ma-sante/traitements'
    from ins join public.treatments t on t.id = ins.treatment_id;
  get diagnostics k = row_count; n := n + k;

  -- Renouvellement : 5 jours de stock restant (au plus une fois par semaine)
  with r as (
    update public.treatments t set renewal_notified_on = today
     where t.active and t.remind_renewal and public.treatment_days_left(t, today) is not null and public.treatment_days_left(t, today) <= 5
       and (t.duration_days is null or t.start_date + t.duration_days > today + 2)
       and (t.renewal_notified_on is null or t.renewal_notified_on <= today - 7)
       and exists (select 1 from public.profiles pr where pr.id = t.user_id and pr.deleted_at is null)
    returning t.user_id, t.name)
  insert into public.notifications (user_id, kind, title, body, link)
  select user_id, 'traitement', 'Votre traitement se termine bientôt', 'Pensez à renouveler votre ordonnance et à racheter : ' || name || '.',
         '/recherche?q=' || replace(left(name, 60), ' ', '+') from r;
  get diagnostics k = row_count; n := n + k;

  delete from public.treatment_intakes where day < today - 120;
  return n;
end $$;
revoke execute on function public.health_tools_reminders() from public, anon, authenticated;

create or replace function public.run_maintenance()
returns jsonb language plpgsql security definer set search_path = public as $$
declare expired int; rl int; logs int; notifs int; outbox int; issues int; reminders int; appts int; appt_rem int; svc int; femme int; ai int; tools int;
begin
  expired := public.expire_overdue_orders();
  appts := public.expire_appointments();
  appt_rem := public.send_appointment_reminders();
  svc := public.purge_services();
  femme := public.femme_send_reminders();
  ai := public.purge_assistant_usage();
  tools := public.health_tools_reminders();
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
                                      'services', svc, 'femme_reminders', femme, 'assistant_usage', ai, 'health_tools', tools), issues);
  delete from public.maintenance_runs where ran_at < now() - interval '30 days';
  return jsonb_build_object('expired', expired, 'appointments_expired', appts, 'appointment_reminders', appt_rem, 'femme_reminders', femme,
    'health_tools', tools,
    'purged', jsonb_build_object('rate_limits', rl, 'search_logs', logs, 'notifications', notifs, 'outbox', outbox,
                                 'directory_reminders', reminders, 'services', svc, 'assistant_usage', ai),
    'critical_issues', issues);
end $$;
revoke execute on function public.run_maintenance() from public, anon, authenticated;

-- Suppression du compte : les données personnelles de santé partent avec lui (y compris PharmaProxi Femme)
create or replace function public.purge_personal_health_data()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    delete from public.children where user_id = new.id;
    delete from public.treatments where user_id = new.id;
    delete from public.health_measures where user_id = new.id;
    delete from public.user_alert_prefs where user_id = new.id;
    delete from public.femme_days where user_id = new.id;
    delete from public.femme_periods where user_id = new.id;
    delete from public.femme_reminders where user_id = new.id;
    delete from public.femme_access_log where user_id = new.id;
    delete from public.femme_profiles where user_id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists profiles_purge_health on public.profiles;
create trigger profiles_purge_health after update of deleted_at on public.profiles for each row execute function public.purge_personal_health_data();
revoke execute on function public.purge_personal_health_data() from public, anon, authenticated;

-- >>> 20261103000100_pharmacist_questions.sql
-- ============================================================================
-- PharmaProxi — Migration : questions aux pharmaciens + comparaison des équivalents
--   1. Un utilisateur pose une question ; les pharmaciens des pharmacies vérifiées
--      répondent sous leur nom. L'identité du demandeur n'est jamais montrée.
--      Publication (anonyme) seulement si le demandeur l'accepte.
--   2. Équivalents d'un médicament : même principe actif et même dosage, avec la
--      fourchette des prix déclarés par les pharmacies vérifiées.
-- Peut être relancé sans erreur.
-- ============================================================================

create table if not exists public.pharmacist_questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  question text not null check (char_length(btrim(question)) between 15 and 1000),
  about text not null default 'moi' check (about in ('moi', 'enfant', 'femme_enceinte', 'personne_agee', 'autre')),
  allow_public boolean not null default false,
  urgent boolean not null default false,
  status text not null default 'open' check (status in ('open', 'answered', 'closed')),
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  search_text text generated always as (public.normalize_text(question)) stored
);
create index if not exists pq_status on public.pharmacist_questions (status, created_at desc) where not hidden;
alter table public.pharmacist_questions enable row level security;
drop policy if exists "pp_pq_owner" on public.pharmacist_questions;
create policy "pp_pq_owner" on public.pharmacist_questions for select to authenticated using (user_id = auth.uid() or public.is_admin());
revoke all on public.pharmacist_questions from anon, authenticated;
grant select on public.pharmacist_questions to authenticated;

create table if not exists public.pharmacist_answers (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.pharmacist_questions(id) on delete cascade,
  pharmacist_id uuid references public.profiles(id) on delete set null,
  pharmacy_id uuid references public.pharmacies(id) on delete set null,
  author_name text not null check (char_length(btrim(author_name)) between 2 and 120),
  pharmacy_name text not null,
  body text not null check (char_length(btrim(body)) between 10 and 2000),
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists pa_question on public.pharmacist_answers (question_id);
create unique index if not exists pa_one_per_pharmacist on public.pharmacist_answers (question_id, pharmacist_id);
alter table public.pharmacist_answers enable row level security;
drop policy if exists "pp_pa_read" on public.pharmacist_answers;
create policy "pp_pa_read" on public.pharmacist_answers for select to authenticated using (
  public.is_admin() or exists (select 1 from public.pharmacist_questions q where q.id = question_id and q.user_id = auth.uid()));
revoke all on public.pharmacist_answers from anon, authenticated;
grant select on public.pharmacist_answers to authenticated;

-- Pharmacien d'une pharmacie vérifiée (au moins une)
create or replace function public.is_verified_pharmacist()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.pharmacy_members m join public.pharmacies p on p.id = m.pharmacy_id
                  where m.user_id = auth.uid() and p.status = 'verified')
$$;

create or replace function public.ask_pharmacist(p_question text, p_about text default 'moi', p_public boolean default false, p_urgent boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_auth(); v_id uuid;
begin
  if (select count(*) from public.pharmacist_questions where user_id = uid and created_at > now() - interval '1 day') >= 3 then
    raise exception 'PP429: 3 questions par jour au maximum';
  end if;
  insert into public.pharmacist_questions (user_id, question, about, allow_public, urgent)
  values (uid, btrim(p_question), coalesce(nullif(p_about, ''), 'moi'), coalesce(p_public, false), coalesce(p_urgent, false))
  returning id into v_id;
  return v_id;
exception
  when check_violation then raise exception 'PP422: question entre 15 et 1 000 caractères';
end $$;

create or replace function public.close_my_question(p_id uuid, p_delete boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_auth();
begin
  if p_delete then delete from public.pharmacist_questions where id = p_id and user_id = uid;
  else update public.pharmacist_questions set status = 'closed' where id = p_id and user_id = uid; end if;
end $$;

-- File des questions pour les pharmaciens (sans identité du demandeur)
create or replace function public.pharmacist_question_queue(p_filter text default 'open', p_limit int default 20, p_offset int default 0)
returns table (id uuid, question text, about text, urgent boolean, status text, created_at timestamptz, answers bigint, mine boolean, total_count bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_verified_pharmacist() then raise exception 'PP403: réservé aux pharmaciens des pharmacies vérifiées'; end if;
  return query
  select q.id, q.question, q.about, q.urgent, q.status, q.created_at,
         (select count(*) from public.pharmacist_answers a where a.question_id = q.id and not a.hidden),
         exists (select 1 from public.pharmacist_answers a where a.question_id = q.id and a.pharmacist_id = auth.uid()),
         count(*) over ()
    from public.pharmacist_questions q
   where not q.hidden and q.status <> 'closed'
     and case p_filter when 'open' then q.status = 'open'
                       when 'mine' then exists (select 1 from public.pharmacist_answers a where a.question_id = q.id and a.pharmacist_id = auth.uid())
                       else true end
   order by q.urgent desc, q.created_at asc
   limit least(greatest(coalesce(p_limit, 20), 1), 50) offset greatest(coalesce(p_offset, 0), 0);
end $$;

create or replace function public.pharmacist_question_answers(p_question uuid)
returns table (id uuid, author_name text, pharmacy_name text, body text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_verified_pharmacist() or public.is_admin()
          or exists (select 1 from public.pharmacist_questions q where q.id = p_question and (q.user_id = auth.uid() or (q.allow_public and not q.hidden)))) then
    raise exception 'PP403: accès refusé';
  end if;
  return query select a.id, a.author_name, a.pharmacy_name, a.body, a.created_at from public.pharmacist_answers a
    where a.question_id = p_question and not a.hidden order by a.created_at;
end $$;

create or replace function public.answer_question(p_question uuid, p_pharmacy uuid, p_body text)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_auth(); v_name text; v_ph text; v_id uuid; v_owner uuid;
begin
  if not public.is_pharmacy_member(p_pharmacy) or not exists (select 1 from public.pharmacies where id = p_pharmacy and status = 'verified') then
    raise exception 'PP403: réservé aux pharmaciens des pharmacies vérifiées';
  end if;
  select nullif(btrim(full_name), '') into v_name from public.profiles where id = uid;
  if v_name is null then raise exception 'PP422: renseignez votre nom dans Mon compte : il est affiché avec votre réponse'; end if;
  select name into v_ph from public.pharmacies where id = p_pharmacy;
  select user_id into v_owner from public.pharmacist_questions where id = p_question and not hidden and status <> 'closed';
  if v_owner is null then raise exception 'PP404: question introuvable ou close'; end if;
  insert into public.pharmacist_answers (question_id, pharmacist_id, pharmacy_id, author_name, pharmacy_name, body)
  values (p_question, uid, p_pharmacy, v_name, v_ph, btrim(p_body))
  on conflict (question_id, pharmacist_id) do update set body = excluded.body, pharmacy_id = excluded.pharmacy_id, pharmacy_name = excluded.pharmacy_name, created_at = now()
  returning id into v_id;
  update public.pharmacist_questions set status = 'answered', answered_at = coalesce(answered_at, now()) where id = p_question;
  perform public.notify_user(v_owner, 'question', 'Un pharmacien a répondu à votre question', 'Réponse de ' || v_name || ' (' || v_ph || ').', null, '/questions-pharmacien/mes-questions');
  return v_id;
exception
  when check_violation then raise exception 'PP422: réponse entre 10 et 2 000 caractères';
end $$;

create or replace function public.public_pharmacist_questions(p_query text default null, p_limit int default 20, p_offset int default 0)
returns table (id uuid, question text, about text, answered_at timestamptz, answers jsonb, total_count bigint)
language sql stable security definer set search_path = public, extensions as $$
  with q0 as (select nullif(public.normalize_text(left(coalesce(p_query, ''), 80)), '') as t)
  select q.id, q.question, q.about, q.answered_at,
         (select coalesce(jsonb_agg(jsonb_build_object('author', a.author_name, 'pharmacy', a.pharmacy_name, 'body', a.body, 'at', a.created_at) order by a.created_at), '[]')
            from public.pharmacist_answers a where a.question_id = q.id and not a.hidden),
         count(*) over ()
    from public.pharmacist_questions q cross join q0
   where q.allow_public and not q.hidden and q.status in ('answered', 'closed')
     and exists (select 1 from public.pharmacist_answers a where a.question_id = q.id and not a.hidden)
     and (q0.t is null or not exists (select 1 from regexp_split_to_table(q0.t, '\s+') w where w <> '' and q.search_text not like '%' || w || '%'))
   order by q.answered_at desc
   limit least(greatest(coalesce(p_limit, 20), 1), 50) offset greatest(coalesce(p_offset, 0), 0)
$$;

create or replace function public.admin_moderate_question(p_question uuid, p_answer uuid, p_hidden boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  if p_answer is not null then update public.pharmacist_answers set hidden = p_hidden where id = p_answer;
  else update public.pharmacist_questions set hidden = p_hidden where id = p_question; end if;
  perform public.log_audit('question.moderate', 'pharmacist_question', coalesce(p_answer, p_question)::text, jsonb_build_object('hidden', p_hidden));
end $$;

revoke execute on function public.ask_pharmacist(text, text, boolean, boolean), public.close_my_question(uuid, boolean), public.pharmacist_question_queue(text, int, int),
  public.answer_question(uuid, uuid, text), public.admin_moderate_question(uuid, uuid, boolean), public.is_verified_pharmacist() from public, anon;
grant execute on function public.ask_pharmacist(text, text, boolean, boolean), public.close_my_question(uuid, boolean), public.pharmacist_question_queue(text, int, int),
  public.answer_question(uuid, uuid, text), public.admin_moderate_question(uuid, uuid, boolean), public.is_verified_pharmacist() to authenticated;
grant execute on function public.public_pharmacist_questions(text, int, int), public.pharmacist_question_answers(uuid) to anon, authenticated;

-- Purge à la suppression du compte (questions privées)
create or replace function public.purge_personal_health_data()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    delete from public.children where user_id = new.id;
    delete from public.treatments where user_id = new.id;
    delete from public.health_measures where user_id = new.id;
    delete from public.user_alert_prefs where user_id = new.id;
    delete from public.pharmacist_questions where user_id = new.id and not (allow_public and status <> 'open');
    delete from public.femme_days where user_id = new.id;
    delete from public.femme_periods where user_id = new.id;
    delete from public.femme_reminders where user_id = new.id;
    delete from public.femme_access_log where user_id = new.id;
    delete from public.femme_profiles where user_id = new.id;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Équivalents : même principe actif et même dosage
-- ---------------------------------------------------------------------------
create or replace function public.ingredient_key(p text)
returns text language sql immutable set search_path = public as $$
  select btrim(regexp_replace(regexp_replace(public.normalize_text(coalesce(p, '')), '[^a-z0-9+ ]+', ' ', 'g'), '\s+', ' ', 'g'))
$$;

create or replace function public.dose_key(p text)
returns text language sql immutable set search_path = public as $$
  select regexp_replace(regexp_replace(public.normalize_text(coalesce(p, '')), ',', '.', 'g'), '\s+', '', 'g')
$$;

-- Prix déclarés (pharmacies vérifiées, stock non périmé) par produit du catalogue
create or replace function public.equivalent_products(p_catalog uuid)
returns table (catalog_id uuid, brand_name text, dosage text, form text, packaging text, manufacturer text, is_same boolean,
               min_price int, max_price int, pharmacies bigint)
language sql stable security definer set search_path = public as $$
  with ref as (select public.ingredient_key(coalesce(nullif(active_ingredient, ''), generic_name)) as ing, public.dose_key(dosage) as dk,
                      public.normalize_text(coalesce(form, '')) as fm
                 from public.medicine_catalog where id = p_catalog),
  cands as (
    select c.* from public.medicine_catalog c, ref
     where c.merged_into is null and c.review_status <> 'rejected' and ref.ing <> ''
       and public.ingredient_key(coalesce(nullif(c.active_ingredient, ''), c.generic_name)) = ref.ing
       and public.dose_key(c.dosage) = ref.dk
       and (ref.fm = '' or public.normalize_text(coalesce(c.form, '')) = '' or public.normalize_text(c.form) = ref.fm))
  select c.id, c.brand_name, c.dosage, c.form, c.packaging, c.manufacturer, c.id = p_catalog,
         min(i.price_xof), max(i.price_xof), count(distinct i.pharmacy_id) filter (where i.price_xof is not null)
    from cands c
    left join public.pharmacy_inventory i on i.catalog_id = c.id and i.price_xof is not null and i.quantity > 0 and i.is_available and i.stock_updated_at > now() - interval '30 days'
     and exists (select 1 from public.pharmacies p where p.id = i.pharmacy_id and p.status = 'verified')
   group by c.id, c.brand_name, c.dosage, c.form, c.packaging, c.manufacturer
   order by min(i.price_xof) nulls last, c.brand_name
   limit 30
$$;

-- Recherche par nom → groupes « principe actif + dosage » avec la fourchette de prix
create or replace function public.compare_prices(p_query text, p_limit int default 20)
returns table (ingredient text, dosage text, form text, products bigint, min_price int, max_price int, pharmacies bigint, sample_catalog uuid, brands text[])
language sql stable security definer set search_path = public, extensions as $$
  with q as (select nullif(public.normalize_text(left(coalesce(p_query, ''), 80)), '') as t),
  hits as (
    select public.ingredient_key(coalesce(nullif(c.active_ingredient, ''), c.generic_name)) as ing, public.dose_key(c.dosage) as dk
      from public.medicine_catalog c, q
     where q.t is not null and c.merged_into is null and c.review_status <> 'rejected'
       and c.search_text like '%' || q.t || '%'
       and public.ingredient_key(coalesce(nullif(c.active_ingredient, ''), c.generic_name)) <> ''
     group by 1, 2 limit 20),
  grp as (
    select h.ing, h.dk, c.id, c.brand_name, coalesce(nullif(c.active_ingredient, ''), c.generic_name) as ing_label, c.dosage, c.form
      from hits h join public.medicine_catalog c on c.merged_into is null and c.review_status <> 'rejected'
       and public.ingredient_key(coalesce(nullif(c.active_ingredient, ''), c.generic_name)) = h.ing and public.dose_key(c.dosage) = h.dk)
  select min(g.ing_label), min(g.dosage), min(g.form), count(distinct g.id), min(i.price_xof), max(i.price_xof),
         count(distinct i.pharmacy_id), (array_agg(g.id order by i.price_xof nulls last))[1], array_agg(distinct g.brand_name)
    from grp g
    left join public.pharmacy_inventory i on i.catalog_id = g.id and i.price_xof is not null and i.quantity > 0 and i.is_available and i.stock_updated_at > now() - interval '30 days'
     and exists (select 1 from public.pharmacies p where p.id = i.pharmacy_id and p.status = 'verified')
   group by g.ing, g.dk
   order by count(distinct i.pharmacy_id) desc, min(g.ing_label)
   limit least(greatest(coalesce(p_limit, 20), 1), 40)
$$;
alter function public.compare_prices(text, int) set statement_timeout = '5s';
grant execute on function public.equivalent_products(uuid), public.compare_prices(text, int) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Santé essentielle : sections « Que faire » et « À ne pas faire » (fiches de premiers secours)
-- ---------------------------------------------------------------------------
create or replace function public.health_clean_body(p jsonb)
returns jsonb language sql immutable as $$
  select coalesce(jsonb_object_agg(k, to_jsonb(left(btrim(v), 6000))), '{}'::jsonb)
  from jsonb_each_text(coalesce(p, '{}'::jsonb)) as t(k, v)
  where k in ('definition', 'gestes', 'a_eviter', 'importance', 'situations', 'prevention', 'examens', 'deroulement', 'preparation',
              'resultats', 'quand_consulter', 'urgence', 'ou_au_mali')
    and nullif(btrim(v), '') is not null
$$;

-- >>> 20261104000100_health_record.sql
-- =============================================================================
-- PharmaProxi 0.19 — Mon dossier santé
-- Dossier tenu par le patient lui-même, pour lui et pour ses proches.
-- Personne d'autre n'y a accès : ni médecin, ni pharmacie, ni assureur, ni administrateur.
-- Protégé par un code à 4–6 chiffres (empreinte bcrypt) ; tout est effacé avec le compte.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Code d'accès
-- ---------------------------------------------------------------------------
create table if not exists public.record_settings (
  user_id uuid primary key default auth.uid() references public.profiles(id) on delete cascade,
  pin_hash text,
  pin_failures int not null default 0,
  pin_blocked_until timestamptz,
  unlocked_until timestamptz,
  created_at timestamptz not null default now()
);
alter table public.record_settings enable row level security;
revoke all on public.record_settings from anon, authenticated;

create or replace function public.record_unlocked(p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select p_user is not null and not exists (
    select 1 from public.record_settings s where s.user_id = p_user and s.pin_hash is not null and coalesce(s.unlocked_until, '-infinity') <= now())
$$;

create or replace function public.record_status()
returns jsonb language sql stable security definer set search_path = public as $$
  select case when auth.uid() is null then jsonb_build_object('signed_in', false)
    else jsonb_build_object('signed_in', true,
      'has_pin', exists (select 1 from public.record_settings s where s.user_id = auth.uid() and s.pin_hash is not null),
      'locked', not public.record_unlocked(auth.uid()),
      'blocked_until', (select s.pin_blocked_until from public.record_settings s where s.user_id = auth.uid() and s.pin_blocked_until > now()))
  end
$$;

create or replace function public.record_set_pin(p_pin text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'PP401: connectez-vous'; end if;
  if not public.record_unlocked(uid) then raise exception 'PP423: dossier verrouillé, saisissez votre code'; end if;
  insert into public.record_settings (user_id) values (uid) on conflict (user_id) do nothing;
  if p_pin is null or p_pin = '' then
    update public.record_settings set pin_hash = null, unlocked_until = null, pin_failures = 0, pin_blocked_until = null where user_id = uid;
    return;
  end if;
  if p_pin !~ '^[0-9]{4,6}$' then raise exception 'PP422: le code doit contenir 4 à 6 chiffres'; end if;
  update public.record_settings set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf', 8)), pin_failures = 0,
         pin_blocked_until = null, unlocked_until = now() + interval '30 minutes' where user_id = uid;
end $$;

create or replace function public.record_unlock(p_pin text)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare uid uuid := auth.uid(); s public.record_settings;
begin
  if uid is null then raise exception 'PP401: connectez-vous'; end if;
  select * into s from public.record_settings where user_id = uid for update;
  if not found or s.pin_hash is null then return true; end if;
  if s.pin_blocked_until > now() then raise exception 'PP429: trop d''essais, réessayez dans quelques minutes'; end if;
  if extensions.crypt(coalesce(p_pin, ''), s.pin_hash) = s.pin_hash then
    update public.record_settings set pin_failures = 0, pin_blocked_until = null, unlocked_until = now() + interval '30 minutes' where user_id = uid;
    return true;
  end if;
  update public.record_settings set
    pin_failures = case when pin_failures + 1 >= 5 then 0 else pin_failures + 1 end,
    pin_blocked_until = case when pin_failures + 1 >= 5 then now() + interval '15 minutes' end
  where user_id = uid;
  return false;
end $$;

create or replace function public.record_lock()
returns void language sql security definer set search_path = public as $$
  update public.record_settings set unlocked_until = null where user_id = auth.uid()
$$;

-- Chaque action prolonge l'ouverture de 30 minutes
create or replace function public.record_touch()
returns void language sql security definer set search_path = public as $$
  update public.record_settings set unlocked_until = now() + interval '30 minutes'
   where user_id = auth.uid() and pin_hash is not null and unlocked_until > now()
$$;

-- ---------------------------------------------------------------------------
-- 2. Personnes : moi et mes proches (enfants, parents âgés…)
-- ---------------------------------------------------------------------------
create table if not exists public.record_persons (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  is_self boolean not null default false,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 60),
  relation text check (relation in ('moi', 'enfant', 'pere', 'mere', 'conjoint', 'grand-parent', 'frere-soeur', 'autre')),
  birth_year int check (birth_year between 1900 and 2100),
  sex text check (sex in ('F', 'M')),
  created_at timestamptz not null default now()
);
create unique index if not exists record_persons_self on public.record_persons (owner_id) where is_self;
create index if not exists record_persons_owner on public.record_persons (owner_id);

create or replace function public.record_owns(p_person uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.record_persons p where p.id = p_person and p.owner_id = auth.uid())
$$;

create or replace function public.record_person_limit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.record_persons where owner_id = new.owner_id) >= 11 then raise exception 'PP429: 10 proches maximum'; end if;
  return new;
end $$;
drop trigger if exists record_persons_limit on public.record_persons;
create trigger record_persons_limit before insert on public.record_persons for each row execute function public.record_person_limit();

-- Dossier « moi » créé à la première ouverture
create or replace function public.record_ensure_self()
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); pid uuid;
begin
  if uid is null then raise exception 'PP401: connectez-vous'; end if;
  if not public.record_unlocked(uid) then raise exception 'PP423: dossier verrouillé, saisissez votre code'; end if;
  select id into pid from public.record_persons where owner_id = uid and is_self;
  if pid is null then
    insert into public.record_persons (owner_id, is_self, display_name, relation)
    values (uid, true, coalesce(nullif(btrim((select full_name from public.profiles where id = uid)), ''), 'Moi'), 'moi')
    on conflict do nothing returning id into pid;
    if pid is null then select id into pid from public.record_persons where owner_id = uid and is_self; end if;
  end if;
  return pid;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Informations essentielles, couverture, don de sang, contact d'urgence
-- ---------------------------------------------------------------------------
create table if not exists public.record_essentials (
  person_id uuid primary key references public.record_persons(id) on delete cascade,
  blood_group text check (blood_group in ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'inconnu')),
  height_cm int check (height_cm between 30 and 250),
  weight_kg numeric(5, 1) check (weight_kg between 1 and 400),
  pregnant boolean not null default false,
  breastfeeding boolean not null default false,
  emergency_name text check (char_length(coalesce(emergency_name, '')) <= 80),
  emergency_relation text check (char_length(coalesce(emergency_relation, '')) <= 40),
  emergency_phone text check (emergency_phone is null or emergency_phone ~ '^\+?[0-9 ]{8,20}$'),
  coverage text check (coverage in ('amo', 'inps', 'assurance', 'mutuelle', 'ramed', 'aucune')),
  insurer text check (char_length(coalesce(insurer, '')) <= 80),
  insured_number text check (char_length(coalesce(insured_number, '')) <= 40),
  last_donation date check (last_donation <= current_date + 1),
  donation_notified_for date,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 4. Éléments du dossier (une seule table, un « type » par rubrique)
-- ---------------------------------------------------------------------------
create table if not exists public.record_items (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.record_persons(id) on delete cascade,
  kind text not null check (kind in (
    'allergie', 'maladie', 'operation', 'hospitalisation', 'transfusion', 'famille', 'ancien_traitement',
    'analyse', 'consultation', 'preparation', 'rendez_vous', 'ordonnance', 'symptome', 'vaccin', 'soignant')),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  category text check (char_length(coalesce(category, '')) <= 60),
  severity text check (severity in ('legere', 'moderee', 'grave')),
  detail text check (char_length(coalesce(detail, '')) <= 4000),
  notes text check (char_length(coalesce(notes, '')) <= 4000),
  result text check (char_length(coalesce(result, '')) <= 4000),
  year int check (year between 1900 and 2100),
  event_date date check (event_date between date '1900-01-01' and current_date + 3660),
  event_time text check (event_time is null or event_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  next_date date check (next_date between date '1900-01-01' and current_date + 3660 * 3),
  place text check (char_length(coalesce(place, '')) <= 120),
  who text check (char_length(coalesce(who, '')) <= 120),
  phone text check (phone is null or phone ~ '^\+?[0-9 ]{8,20}$'),
  treatment_id uuid references public.treatments(id) on delete set null,
  reminded_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists record_items_person on public.record_items (person_id, kind);
create index if not exists record_items_due on public.record_items (kind, event_date) where kind in ('rendez_vous', 'vaccin');

create or replace function public.record_item_limit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.record_items where person_id = new.person_id) >= 600 then raise exception 'PP429: dossier plein (600 éléments)'; end if;
  return new;
end $$;
drop trigger if exists record_items_limit on public.record_items;
create trigger record_items_limit before insert on public.record_items for each row execute function public.record_item_limit();

create or replace function public.record_touch_row()
returns trigger language plpgsql as $$ begin new.updated_at := now(); return new; end $$;
drop trigger if exists record_items_touch on public.record_items;
create trigger record_items_touch before update on public.record_items for each row execute function public.record_touch_row();
drop trigger if exists record_essentials_touch on public.record_essentials;
create trigger record_essentials_touch before update on public.record_essentials for each row execute function public.record_touch_row();

-- ---------------------------------------------------------------------------
-- 5. Droits : uniquement le titulaire du compte, et seulement dossier ouvert
-- ---------------------------------------------------------------------------
alter table public.record_persons enable row level security;
alter table public.record_essentials enable row level security;
alter table public.record_items enable row level security;
drop policy if exists "pp_record_persons_own" on public.record_persons;
create policy "pp_record_persons_own" on public.record_persons for all to authenticated
  using (owner_id = auth.uid() and public.record_unlocked()) with check (owner_id = auth.uid() and public.record_unlocked());
drop policy if exists "pp_record_essentials_own" on public.record_essentials;
create policy "pp_record_essentials_own" on public.record_essentials for all to authenticated
  using (public.record_owns(person_id) and public.record_unlocked()) with check (public.record_owns(person_id) and public.record_unlocked());
drop policy if exists "pp_record_items_own" on public.record_items;
create policy "pp_record_items_own" on public.record_items for all to authenticated
  using (public.record_owns(person_id) and public.record_unlocked()) with check (public.record_owns(person_id) and public.record_unlocked());
revoke all on public.record_persons, public.record_essentials, public.record_items from anon;
grant select, insert, update, delete on public.record_persons, public.record_essentials, public.record_items to authenticated;
-- La date du dernier rappel de don est gérée par le serveur uniquement
revoke update on public.record_essentials from authenticated;
grant update (person_id, blood_group, height_cm, weight_kg, pregnant, breastfeeding, emergency_name, emergency_relation, emergency_phone,
              coverage, insurer, insured_number, last_donation, updated_at) on public.record_essentials to authenticated;
-- Un traitement lié doit appartenir au même compte
create or replace function public.record_item_check_treatment()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.treatment_id is not null and not exists (
      select 1 from public.treatments t join public.record_persons p on p.owner_id = t.user_id where t.id = new.treatment_id and p.id = new.person_id) then
    raise exception 'PP403: traitement inconnu';
  end if;
  return new;
end $$;
drop trigger if exists record_items_treatment on public.record_items;
create trigger record_items_treatment before insert or update of treatment_id on public.record_items for each row execute function public.record_item_check_treatment();

revoke execute on function public.record_status(), public.record_set_pin(text), public.record_unlock(text), public.record_lock(), public.record_touch(),
  public.record_ensure_self(), public.record_owns(uuid), public.record_unlocked(uuid) from public, anon;
grant execute on function public.record_status(), public.record_set_pin(text), public.record_unlock(text), public.record_lock(), public.record_touch(),
  public.record_ensure_self(), public.record_owns(uuid), public.record_unlocked(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Rappels (messages discrets : aucune information médicale dans la notification)
-- ---------------------------------------------------------------------------
create or replace function public.record_reminders()
returns int language plpgsql security definer set search_path = public as $$
declare n int := 0; k int; today date := (now() at time zone 'utc')::date;
begin
  -- Rendez-vous médical : la veille
  with r as (
    update public.record_items i set reminded_on = today
      from public.record_persons p join public.profiles pr on pr.id = p.owner_id and pr.deleted_at is null
     where p.id = i.person_id and i.kind = 'rendez_vous' and i.event_date = today + 1 and i.reminded_on is null
    returning p.owner_id, p.id as person_id, p.is_self, p.display_name, i.event_time)
  insert into public.notifications (user_id, kind, title, body, link)
  select owner_id, 'dossier', case when is_self then 'Rendez-vous médical demain' else 'Rendez-vous médical demain (' || display_name || ')' end,
         'Demain' || coalesce(' à ' || replace(event_time, ':', ' h '), '') || '. Pensez à préparer vos questions dans votre dossier.',
         '/ma-sante/dossier/consultations?p=' || person_id from r;
  get diagnostics k = row_count; n := n + k;

  -- Rappel de vaccin d'adulte : 7 jours avant la date indiquée par le patient
  with r as (
    update public.record_items i set reminded_on = today
      from public.record_persons p join public.profiles pr on pr.id = p.owner_id and pr.deleted_at is null
     where p.id = i.person_id and i.kind = 'vaccin' and i.next_date = today + 7 and (i.reminded_on is null or i.reminded_on < today - 30)
    returning p.owner_id, p.id as person_id, p.is_self, p.display_name)
  insert into public.notifications (user_id, kind, title, body, link)
  select owner_id, 'dossier', case when is_self then 'Rappel de vaccin dans 7 jours' else 'Rappel de vaccin dans 7 jours (' || display_name || ')' end,
         'Un rappel de vaccin est prévu dans une semaine. Vérifiez dans votre dossier.', '/ma-sante/dossier/antecedents?p=' || person_id from r;
  get diagnostics k = row_count; n := n + k;

  -- Don de sang : délai écoulé (3 mois pour un homme, 4 mois pour une femme ou si non précisé)
  with r as (
    update public.record_essentials e set donation_notified_for = e.last_donation
      from public.record_persons p join public.profiles pr on pr.id = p.owner_id and pr.deleted_at is null
     where p.id = e.person_id and p.is_self and e.last_donation is not null
       and e.donation_notified_for is distinct from e.last_donation
       and (e.last_donation + case when p.sex = 'M' then interval '3 months' else interval '4 months' end)::date <= today
       and (e.last_donation + case when p.sex = 'M' then interval '3 months' else interval '4 months' end)::date > today - 7
    returning p.owner_id)
  insert into public.notifications (user_id, kind, title, body, link)
  select owner_id, 'dossier', 'Vous pouvez de nouveau donner votre sang', 'Le délai depuis votre dernier don est écoulé. Merci pour votre générosité.', '/don-de-sang' from r;
  get diagnostics k = row_count; n := n + k;
  return n;
end $$;
revoke execute on function public.record_reminders() from public, anon, authenticated;

create or replace function public.run_maintenance()
returns jsonb language plpgsql security definer set search_path = public as $$
declare expired int; rl int; logs int; notifs int; outbox int; issues int; reminders int; appts int; appt_rem int; svc int; femme int; ai int; tools int; rec int;
begin
  expired := public.expire_overdue_orders();
  appts := public.expire_appointments();
  appt_rem := public.send_appointment_reminders();
  svc := public.purge_services();
  femme := public.femme_send_reminders();
  ai := public.purge_assistant_usage();
  tools := public.health_tools_reminders();
  rec := public.record_reminders();
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
                                      'services', svc, 'femme_reminders', femme, 'assistant_usage', ai, 'health_tools', tools, 'health_record', rec), issues);
  delete from public.maintenance_runs where ran_at < now() - interval '30 days';
  return jsonb_build_object('expired', expired, 'appointments_expired', appts, 'appointment_reminders', appt_rem, 'femme_reminders', femme,
    'health_tools', tools, 'health_record', rec,
    'purged', jsonb_build_object('rate_limits', rl, 'search_logs', logs, 'notifications', notifs, 'outbox', outbox,
                                 'directory_reminders', reminders, 'services', svc, 'assistant_usage', ai),
    'critical_issues', issues);
end $$;
revoke execute on function public.run_maintenance() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. Suppression du compte : le dossier part avec lui
-- ---------------------------------------------------------------------------
create or replace function public.purge_personal_health_data()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    delete from public.record_persons where owner_id = new.id;
    delete from public.record_settings where user_id = new.id;
    delete from public.children where user_id = new.id;
    delete from public.treatments where user_id = new.id;
    delete from public.health_measures where user_id = new.id;
    delete from public.user_alert_prefs where user_id = new.id;
    delete from public.pharmacist_questions where user_id = new.id and not (allow_public and status <> 'open');
    delete from public.femme_days where user_id = new.id;
    delete from public.femme_periods where user_id = new.id;
    delete from public.femme_reminders where user_id = new.id;
    delete from public.femme_access_log where user_id = new.id;
    delete from public.femme_profiles where user_id = new.id;
  end if;
  return new;
end $$;


-- >>> 20261105000100_authorities.sql
-- =============================================================================
-- PharmaProxi 0.20 — Espace Autorités, statistiques anonymes, signalements de
-- médicaments, courbe de croissance, campagnes de don de sang, avis des utilisateurs.
--
-- Règles des statistiques :
--   1. Uniquement des chiffres agrégés ; une case de moins de 10 n'est pas affichée.
--   2. Le dossier santé, le suivi Femme, les traitements, les mesures et la croissance
--      des enfants ne nourrissent JAMAIS les statistiques.
--   3. Accès réservé aux comptes désignés par l'administrateur, chaque consultation est
--      journalisée.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Membres des autorités et journal d'accès
-- ---------------------------------------------------------------------------
create table if not exists public.authority_members (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  scope text not null check (scope in ('ministere', 'dpm', 'cnts', 'ordre_pharmaciens', 'ordre_medecins', 'canam', 'autre')),
  organisation text not null check (char_length(btrim(organisation)) between 2 and 120),
  title text check (char_length(coalesce(title, '')) <= 120),
  active boolean not null default true,
  granted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.authority_members enable row level security;
drop policy if exists "pp_authority_self" on public.authority_members;
create policy "pp_authority_self" on public.authority_members for select to authenticated using (user_id = auth.uid() or public.is_admin());
revoke all on public.authority_members from anon;
revoke insert, update, delete on public.authority_members from authenticated;
grant select on public.authority_members to authenticated;

create table if not exists public.authority_access_log (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles(id) on delete set null,
  scope text,
  action text not null,
  params jsonb not null default '{}'::jsonb,
  at timestamptz not null default now()
);
create index if not exists authority_access_log_at on public.authority_access_log (at desc);
alter table public.authority_access_log enable row level security;
drop policy if exists "pp_authority_log_admin" on public.authority_access_log;
create policy "pp_authority_log_admin" on public.authority_access_log for select to authenticated using (public.is_admin());
revoke all on public.authority_access_log from anon;
revoke insert, update, delete on public.authority_access_log from authenticated;
grant select on public.authority_access_log to authenticated;

create or replace function public.authority_scope(p_user uuid default auth.uid())
returns text language sql stable security definer set search_path = public as $$
  select scope from public.authority_members where user_id = p_user and active
$$;

create or replace function public.is_authority()
returns boolean language sql stable security definer set search_path = public as $$
  select public.authority_scope(auth.uid()) is not null
$$;

-- Contrôle d'accès + journal. p_scopes null = toutes les autorités. L'administrateur passe toujours.
create or replace function public.authority_require(p_action text, p_params jsonb default '{}'::jsonb, p_scopes text[] default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_auth(); sc text := public.authority_scope(uid);
begin
  if not public.is_admin() and (sc is null or (p_scopes is not null and not sc = any(p_scopes))) then
    raise exception 'PP403: réservé aux autorités de santé désignées' using errcode = '42501';
  end if;
  insert into public.authority_access_log (user_id, scope, action, params) values (uid, coalesce(sc, 'admin'), p_action, coalesce(p_params, '{}'::jsonb));
  return uid;
end $$;

create or replace function public.admin_set_authority(p_email text, p_scope text, p_organisation text, p_title text default null, p_active boolean default true)
returns uuid language plpgsql security definer set search_path = public, auth as $$
declare uid uuid; me uuid := public.require_admin();
begin
  select u.id into uid from auth.users u join public.profiles p on p.id = u.id and p.deleted_at is null where lower(u.email) = lower(btrim(p_email));
  if uid is null then raise exception 'PP404: aucun compte avec cette adresse e-mail (la personne doit d''abord créer son compte)'; end if;
  insert into public.authority_members (user_id, scope, organisation, title, active, granted_by)
  values (uid, p_scope, btrim(p_organisation), nullif(btrim(coalesce(p_title, '')), ''), coalesce(p_active, true), me)
  on conflict (user_id) do update set scope = excluded.scope, organisation = excluded.organisation, title = excluded.title,
    active = excluded.active, granted_by = me, updated_at = now();
  perform public.log_audit(case when coalesce(p_active, true) then 'authority_grant' else 'authority_revoke' end, 'authority_member', uid::text,
    jsonb_build_object('scope', p_scope, 'organisation', p_organisation));
  return uid;
exception when check_violation then raise exception 'PP422: type d''autorité ou organisation invalide';
end $$;

-- ---------------------------------------------------------------------------
-- 2. Lectures de fiches (compteur anonyme par jour, sans aucune donnée de personne)
-- ---------------------------------------------------------------------------
create table if not exists public.article_daily_views (
  article_id uuid not null references public.health_articles(id) on delete cascade,
  day date not null,
  views int not null default 0,
  primary key (article_id, day)
);
alter table public.article_daily_views enable row level security;
revoke all on public.article_daily_views from anon, authenticated;

create or replace function public.log_article_view(p_slug text)
returns void language sql security definer set search_path = public as $$
  insert into public.article_daily_views (article_id, day, views)
  select id, (now() at time zone 'utc')::date, 1 from public.health_articles where slug = p_slug and status = 'published'
  on conflict (article_id, day) do update set views = public.article_daily_views.views + 1
$$;
revoke execute on function public.log_article_view(text) from public;
grant execute on function public.log_article_view(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Statistiques anonymes (seuil : 10)
-- ---------------------------------------------------------------------------
create or replace function public.stat_k() returns int language sql immutable as $$ select 10 $$;
create or replace function public.stat_mask(n bigint) returns bigint language sql immutable as $$ select case when n >= public.stat_k() then n end $$;

create or replace function public.authority_params(p_region uuid, p_from date, p_to date)
returns jsonb language sql immutable as $$
  select jsonb_build_object('region', p_region, 'from', p_from, 'to', p_to)
$$;

-- Vue d'ensemble
create or replace function public.authority_overview(p_region uuid default null, p_from date default null, p_to date default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare f timestamptz := coalesce(p_from, current_date - 30)::timestamptz; t timestamptz := (coalesce(p_to, current_date) + 1)::timestamptz;
  s_all bigint; s_none bigint; r jsonb;
begin
  perform public.authority_require('stats:overview', public.authority_params(p_region, p_from, p_to));
  select count(*), count(*) filter (where result_count = 0) into s_all, s_none
    from public.search_logs where kind = 'medicine' and created_at >= f and created_at < t and (p_region is null or region_id = p_region);
  r := jsonb_build_object(
    'searches', public.stat_mask(s_all),
    'searches_unfound', public.stat_mask(s_none),
    'unfound_rate', case when s_all >= public.stat_k() then round(100.0 * s_none / s_all) end,
    'pharmacies_verified', (select count(*) from public.pharmacies where status = 'verified' and not is_demo and (p_region is null or region_id = p_region)),
    'pharmacies_fresh_stock', (select count(distinct i.pharmacy_id) from public.pharmacy_inventory i join public.pharmacies p on p.id = i.pharmacy_id
        where p.status = 'verified' and not p.is_demo and i.stock_updated_at > now() - interval '30 days' and (p_region is null or p.region_id = p_region)),
    'on_duty_now', (select count(distinct d.pharmacy_id) from public.pharmacy_duty d join public.pharmacies p on p.id = d.pharmacy_id
        where now() between d.starts_at and d.ends_at and p.status = 'verified' and (p_region is null or p.region_id = p_region)),
    'blood_donors', public.stat_mask((select count(*) from public.user_alert_prefs a join public.profiles pr on pr.id = a.user_id and pr.deleted_at is null
        where a.blood_alerts and (p_region is null or a.region_id = p_region))),
    'questions', public.stat_mask((select count(*) from public.pharmacist_questions where created_at >= f and created_at < t)),
    'reports', public.stat_mask((select count(*) from public.drug_reports where created_at >= f and created_at < t and (p_region is null or region_id = p_region))),
    'k', public.stat_k());
  return r;
end $$;

-- Médicaments cherchés (sans résultat si p_unfound)
create or replace function public.authority_searches(p_region uuid default null, p_from date default null, p_to date default null, p_unfound boolean default true, p_limit int default 20)
returns table (query text, searches bigint, unfound bigint, regions bigint) language plpgsql security definer set search_path = public as $$
declare f timestamptz := coalesce(p_from, current_date - 30)::timestamptz; t timestamptz := (coalesce(p_to, current_date) + 1)::timestamptz;
begin
  perform public.authority_require(case when p_unfound then 'stats:unfound' else 'stats:searches' end, public.authority_params(p_region, p_from, p_to));
  return query
    select s.query_normalized, count(*), count(*) filter (where s.result_count = 0), count(distinct s.region_id)
      from public.search_logs s
     where s.kind = 'medicine' and s.created_at >= f and s.created_at < t and (p_region is null or s.region_id = p_region)
     group by s.query_normalized
    having (case when p_unfound then count(*) filter (where s.result_count = 0) else count(*) end) >= public.stat_k()
     order by (case when p_unfound then count(*) filter (where s.result_count = 0) else count(*) end) desc, s.query_normalized
     limit least(greatest(coalesce(p_limit, 20), 1), 100);
end $$;

-- Évolution par semaine d'un mot (ex. « paludisme »)
create or replace function public.authority_trend(p_term text, p_region uuid default null, p_weeks int default 12)
returns table (week date, searches bigint, unfound bigint) language plpgsql security definer set search_path = public as $$
declare term text := public.normalize_text(coalesce(p_term, '')); w int := least(greatest(coalesce(p_weeks, 12), 4), 52);
begin
  if char_length(term) < 3 then raise exception 'PP422: au moins 3 lettres'; end if;
  perform public.authority_require('stats:trend', jsonb_build_object('term', term, 'region', p_region, 'weeks', w));
  return query
    with weeks as (select generate_series(date_trunc('week', now() - make_interval(weeks => w - 1))::date, date_trunc('week', now())::date, interval '1 week')::date as wk)
    select weeks.wk, public.stat_mask(count(s.id)), public.stat_mask(count(s.id) filter (where s.result_count = 0))
      from weeks left join public.search_logs s on date_trunc('week', s.created_at)::date = weeks.wk and s.kind = 'medicine'
        and s.query_normalized like '%' || term || '%' and (p_region is null or s.region_id = p_region)
     group by weeks.wk order by weeks.wk;
end $$;

-- Par région : recherches, échecs, pharmacies, garde
create or replace function public.authority_regions(p_from date default null, p_to date default null)
returns table (region_id uuid, region text, searches bigint, unfound_rate int, pharmacies bigint, fresh_stock bigint, on_duty_now bigint)
language plpgsql security definer set search_path = public as $$
declare f timestamptz := coalesce(p_from, current_date - 30)::timestamptz; t timestamptz := (coalesce(p_to, current_date) + 1)::timestamptz;
begin
  perform public.authority_require('stats:regions', public.authority_params(null, p_from, p_to));
  return query
    select r.id, r.name,
      public.stat_mask(sl.n),
      case when sl.n >= public.stat_k() then round(100.0 * sl.none / sl.n)::int end,
      coalesce(ph.n, 0), coalesce(ph.fresh, 0), coalesce(ph.duty, 0)
    from public.regions r
    left join lateral (select count(*) n, count(*) filter (where s.result_count = 0) none from public.search_logs s
                        where s.region_id = r.id and s.kind = 'medicine' and s.created_at >= f and s.created_at < t) sl on true
    left join lateral (select count(*) n,
                              count(*) filter (where exists (select 1 from public.pharmacy_inventory i where i.pharmacy_id = p.id and i.stock_updated_at > now() - interval '30 days')) fresh,
                              count(*) filter (where exists (select 1 from public.pharmacy_duty d where d.pharmacy_id = p.id and now() between d.starts_at and d.ends_at)) duty
                         from public.pharmacies p where p.region_id = r.id and p.status = 'verified' and not p.is_demo) ph on true
    order by coalesce(sl.n, 0) desc, coalesce(ph.n, 0) desc, r.name;
end $$;

-- Communes sans pharmacie de garde dans les prochaines 24 heures (données publiques, pas de seuil)
create or replace function public.authority_duty_gaps(p_region uuid default null)
returns table (region text, commune text, pharmacies bigint, on_duty_24h bigint) language plpgsql security definer set search_path = public as $$
begin
  perform public.authority_require('stats:duty', jsonb_build_object('region', p_region));
  return query
    select r.name, c.name, count(p.id),
      count(p.id) filter (where exists (select 1 from public.pharmacy_duty d where d.pharmacy_id = p.id and d.starts_at < now() + interval '24 hours' and d.ends_at > now()))
      from public.communes c join public.regions r on r.id = c.region_id
      join public.pharmacies p on p.commune_id = c.id and p.status = 'verified' and not p.is_demo
     where (p_region is null or c.region_id = p_region) and not c.is_demo
     group by r.name, c.name
     order by 4, 3 desc, 1, 2;
end $$;

-- AMO : prix déclarés par les pharmacies vérifiées (30 derniers jours) comparés au tarif de référence
create or replace function public.authority_amo_prices(p_region uuid default null, p_limit int default 30)
returns table (product text, tariff int, prices bigint, min_price int, avg_price int, max_price int, gap_pct int)
language plpgsql security definer set search_path = public as $$
begin
  perform public.authority_require('stats:amo', jsonb_build_object('region', p_region));
  return query
    select a.name, a.tariff_xof, count(*), min(i.price_xof), round(avg(i.price_xof))::int, max(i.price_xof),
           round(100.0 * (avg(i.price_xof) - a.tariff_xof) / nullif(a.tariff_xof, 0))::int
      from public.amo_catalog_links l join public.amo_medicines a on a.id = l.amo_id and a.tariff_xof > 0
      join public.pharmacy_inventory i on i.catalog_id = l.catalog_id and i.price_xof > 0 and i.stock_updated_at > now() - interval '30 days'
      join public.pharmacies p on p.id = i.pharmacy_id and p.status = 'verified' and not p.is_demo and (p_region is null or p.region_id = p_region)
     group by a.id, a.name, a.tariff_xof
    having count(*) >= 3
     order by abs(avg(i.price_xof) - a.tariff_xof) / nullif(a.tariff_xof, 0) desc nulls last
     limit least(greatest(coalesce(p_limit, 30), 1), 100);
end $$;

-- Sujets qui préoccupent : questions aux pharmaciens par public, fiches les plus lues
create or replace function public.authority_topics(p_from date default null, p_to date default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare f date := coalesce(p_from, current_date - 30); t date := coalesce(p_to, current_date);
begin
  perform public.authority_require('stats:topics', public.authority_params(null, p_from, p_to));
  return jsonb_build_object(
    'questions', coalesce((select jsonb_agg(jsonb_build_object('about', about, 'n', n) order by n desc) from (
        select about, count(*) n from public.pharmacist_questions where created_at::date between f and t group by about having count(*) >= public.stat_k()) x), '[]'::jsonb),
    'urgent_questions', public.stat_mask((select count(*) from public.pharmacist_questions where urgent and created_at::date between f and t)),
    'articles', coalesce((select jsonb_agg(jsonb_build_object('title', title, 'slug', slug, 'n', n) order by n desc) from (
        select a.title, a.slug, sum(v.views) n from public.article_daily_views v join public.health_articles a on a.id = v.article_id
         where v.day between f and t group by a.id, a.title, a.slug having sum(v.views) >= public.stat_k() order by 3 desc limit 15) y), '[]'::jsonb));
end $$;

-- Don de sang : donneurs volontaires par groupe et par région, campagnes
create or replace function public.authority_blood(p_region uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public.authority_require('stats:blood', jsonb_build_object('region', p_region), array['ministere', 'cnts']);
  return jsonb_build_object(
    'by_group', coalesce((select jsonb_agg(jsonb_build_object('group', g, 'n', public.stat_mask(n)) order by g) from (
        select coalesce(a.blood_group, 'inconnu') g, count(*) n from public.user_alert_prefs a join public.profiles pr on pr.id = a.user_id and pr.deleted_at is null
         where a.blood_alerts and (p_region is null or a.region_id = p_region) group by 1) x), '[]'::jsonb),
    'by_region', coalesce((select jsonb_agg(jsonb_build_object('region', coalesce(r.name, 'Non précisée'), 'n', public.stat_mask(n)) order by n desc) from (
        select a.region_id, count(*) n from public.user_alert_prefs a join public.profiles pr on pr.id = a.user_id and pr.deleted_at is null
         where a.blood_alerts group by 1) y left join public.regions r on r.id = y.region_id), '[]'::jsonb),
    'needs_30d', (select count(*) from public.blood_needs where created_at > now() - interval '30 days'),
    'campaigns', coalesce((select jsonb_agg(jsonb_build_object('title', c.title, 'date', c.starts_on, 'place', c.place, 'going', public.stat_mask(
          (select count(*) from public.blood_campaign_attendance x where x.campaign_id = c.id))) order by c.starts_on desc)
        from (select * from public.blood_campaigns where published and starts_on > current_date - 90 and (p_region is null or region_id = p_region) order by starts_on desc limit 20) c), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------------------
-- 4. Signalements : médicament suspect ou effet indésirable
-- ---------------------------------------------------------------------------
create table if not exists public.drug_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.profiles(id) on delete set null,
  kind text not null check (kind in ('suspect', 'effet')),
  reporter_type text not null check (reporter_type in ('patient', 'proche', 'pharmacien', 'medecin', 'autre')),
  product_name text not null check (char_length(btrim(product_name)) between 2 and 160),
  batch_number text check (char_length(coalesce(batch_number, '')) <= 60),
  expiry text check (char_length(coalesce(expiry, '')) <= 20),
  manufacturer text check (char_length(coalesce(manufacturer, '')) <= 120),
  where_bought text check (where_bought in ('pharmacie', 'depot', 'centre_sante', 'rue', 'marche', 'internet', 'autre')),
  place_detail text check (char_length(coalesce(place_detail, '')) <= 160),
  region_id uuid references public.regions(id) on delete set null,
  price_xof int check (price_xof is null or price_xof between 0 and 10000000),
  problems text[] not null default '{}' check (problems <@ array['emballage', 'etiquette', 'aspect', 'prix', 'non_autorise', 'inefficace', 'perime', 'autre']::text[]),
  description text check (char_length(coalesce(description, '')) <= 2000),
  reaction text check (char_length(coalesce(reaction, '')) <= 2000),
  severity text check (severity in ('legere', 'moderee', 'grave')),
  outcome text check (outcome in ('gueri', 'en_cours', 'sequelles', 'inconnu')),
  patient_age text check (patient_age in ('0-4', '5-14', '15-24', '25-49', '50-64', '65+')),
  patient_sex text check (patient_sex in ('F', 'M')),
  pregnant boolean,
  other_meds text check (char_length(coalesce(other_meds, '')) <= 500),
  contact_ok boolean not null default false,
  contact_phone text check (contact_phone is null or contact_phone ~ '^\+?[0-9 ]{8,20}$'),
  status text not null default 'nouveau' check (status in ('nouveau', 'en_cours', 'transmis', 'clos')),
  authority_note text check (char_length(coalesce(authority_note, '')) <= 2000),
  handled_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind = 'suspect' or reaction is not null)
);
create index if not exists drug_reports_status on public.drug_reports (status, created_at desc);
alter table public.drug_reports enable row level security;
drop policy if exists "pp_drug_reports_own" on public.drug_reports;
create policy "pp_drug_reports_own" on public.drug_reports for select to authenticated using (reporter_id = auth.uid());
revoke all on public.drug_reports from anon;
revoke insert, update, delete on public.drug_reports from authenticated;
grant select on public.drug_reports to authenticated;

create or replace function public.submit_drug_report(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_auth(); v_id uuid; k text := p ->> 'kind';
begin
  if coalesce((p ->> 'consent')::boolean, false) is not true then raise exception 'PP422: votre accord pour transmettre le signalement est nécessaire'; end if;
  if (select count(*) from public.drug_reports where reporter_id = uid and created_at > now() - interval '1 day') >= 5 then
    raise exception 'PP429: 5 signalements par jour au maximum';
  end if;
  if k = 'effet' and nullif(btrim(p ->> 'reaction'), '') is null then raise exception 'PP422: décrivez la réaction observée'; end if;
  insert into public.drug_reports (reporter_id, kind, reporter_type, product_name, batch_number, expiry, manufacturer, where_bought, place_detail, region_id,
    price_xof, problems, description, reaction, severity, outcome, patient_age, patient_sex, pregnant, other_meds, contact_ok, contact_phone)
  values (uid, k, coalesce(nullif(p ->> 'reporter_type', ''), 'patient'), btrim(p ->> 'product_name'), nullif(btrim(p ->> 'batch_number'), ''),
    nullif(btrim(p ->> 'expiry'), ''), nullif(btrim(p ->> 'manufacturer'), ''), nullif(p ->> 'where_bought', ''), nullif(btrim(p ->> 'place_detail'), ''),
    nullif(p ->> 'region_id', '')::uuid, nullif(p ->> 'price_xof', '')::int,
    coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p -> 'problems', '[]'::jsonb)) x), '{}'),
    nullif(btrim(p ->> 'description'), ''), nullif(btrim(p ->> 'reaction'), ''), nullif(p ->> 'severity', ''), nullif(p ->> 'outcome', ''),
    nullif(p ->> 'patient_age', ''), nullif(p ->> 'patient_sex', ''), (p ->> 'pregnant')::boolean, nullif(btrim(p ->> 'other_meds'), ''),
    coalesce((p ->> 'contact_ok')::boolean, false), case when coalesce((p ->> 'contact_ok')::boolean, false) then nullif(btrim(p ->> 'contact_phone'), '') end)
  returning id into v_id;
  return v_id;
exception
  when check_violation then raise exception 'PP422: certaines informations sont invalides ou trop longues';
  when invalid_text_representation then raise exception 'PP422: certaines informations sont invalides';
end $$;

-- File des autorités : l'identité de la personne n'est jamais donnée ; son téléphone seulement si elle l'a accepté
create or replace function public.authority_reports(p_status text default null, p_kind text default null, p_region uuid default null, p_limit int default 30, p_offset int default 0)
returns table (id uuid, kind text, reporter_type text, product_name text, batch_number text, expiry text, manufacturer text, where_bought text, place_detail text,
  region text, price_xof int, problems text[], description text, reaction text, severity text, outcome text, patient_age text, patient_sex text, pregnant boolean,
  other_meds text, contact_phone text, status text, authority_note text, created_at timestamptz, total_count bigint)
language plpgsql security definer set search_path = public as $$
begin
  perform public.authority_require('reports:list', jsonb_build_object('status', p_status, 'kind', p_kind, 'region', p_region), array['ministere', 'dpm', 'ordre_pharmaciens']);
  return query
    select d.id, d.kind, d.reporter_type, d.product_name, d.batch_number, d.expiry, d.manufacturer, d.where_bought, d.place_detail, r.name, d.price_xof, d.problems,
           d.description, d.reaction, d.severity, d.outcome, d.patient_age, d.patient_sex, d.pregnant, d.other_meds, case when d.contact_ok then d.contact_phone end,
           d.status, d.authority_note, d.created_at, count(*) over ()
      from public.drug_reports d left join public.regions r on r.id = d.region_id
     where (p_status is null or d.status = p_status) and (p_kind is null or d.kind = p_kind) and (p_region is null or d.region_id = p_region)
     order by coalesce(d.severity = 'grave' and d.status = 'nouveau', false) desc, d.created_at desc
     limit least(greatest(coalesce(p_limit, 30), 1), 100) offset greatest(coalesce(p_offset, 0), 0);
end $$;

create or replace function public.authority_update_report(p_id uuid, p_status text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid; d public.drug_reports;
begin
  uid := public.authority_require('reports:update', jsonb_build_object('id', p_id, 'status', p_status), array['ministere', 'dpm', 'ordre_pharmaciens']);
  if p_status not in ('nouveau', 'en_cours', 'transmis', 'clos') then raise exception 'PP422: statut invalide'; end if;
  update public.drug_reports set status = p_status, authority_note = nullif(btrim(coalesce(p_note, '')), ''), handled_by = uid, updated_at = now()
   where id = p_id returning * into d;
  if not found then raise exception 'PP404: signalement introuvable'; end if;
  if p_status in ('transmis', 'clos') then
    perform public.notify_user(d.reporter_id, 'signalement', 'Votre signalement a été pris en charge',
      'Merci : les autorités de santé ont examiné votre signalement.', null, '/signaler/mes-signalements');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Courbe de croissance des enfants (privée, comme le carnet de vaccination)
-- ---------------------------------------------------------------------------
create table if not exists public.child_growth (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  measured_on date not null check (measured_on <= current_date + 1),
  weight_kg numeric(4, 1) check (weight_kg between 0.5 and 40),
  height_cm numeric(4, 1) check (height_cm between 35 and 130),
  place text check (char_length(coalesce(place, '')) <= 100),
  created_at timestamptz not null default now(),
  check (weight_kg is not null or height_cm is not null),
  unique (child_id, measured_on)
);
alter table public.child_growth enable row level security;
drop policy if exists "pp_child_growth_owner" on public.child_growth;
create policy "pp_child_growth_owner" on public.child_growth for all to authenticated
  using (exists (select 1 from public.children c where c.id = child_id and c.user_id = auth.uid()))
  with check (exists (select 1 from public.children c where c.id = child_id and c.user_id = auth.uid()));
revoke all on public.child_growth from anon;
grant select, insert, update, delete on public.child_growth to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Campagnes de don de sang (collectes mobiles du CNTS) et « j'y serai »
-- ---------------------------------------------------------------------------
create table if not exists public.blood_campaigns (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 3 and 140),
  organizer text not null default 'CNTS' check (char_length(btrim(organizer)) between 2 and 120),
  region_id uuid references public.regions(id) on delete set null,
  place text not null check (char_length(btrim(place)) between 3 and 200),
  starts_on date not null,
  start_time text check (start_time is null or start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  end_time text check (end_time is null or end_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  details text check (char_length(coalesce(details, '')) <= 1000),
  source_url text not null check (source_url ~ '^https?://'),
  published boolean not null default true,
  notified_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.blood_campaigns enable row level security;
drop policy if exists "pp_blood_campaigns_read" on public.blood_campaigns;
create policy "pp_blood_campaigns_read" on public.blood_campaigns for select to anon, authenticated using (published or public.is_admin());
revoke insert, update, delete on public.blood_campaigns from anon, authenticated;
grant select on public.blood_campaigns to anon, authenticated;

create table if not exists public.blood_campaign_attendance (
  campaign_id uuid not null references public.blood_campaigns(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (campaign_id, user_id)
);
alter table public.blood_campaign_attendance enable row level security;
drop policy if exists "pp_campaign_attendance_own" on public.blood_campaign_attendance;
create policy "pp_campaign_attendance_own" on public.blood_campaign_attendance for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.blood_campaign_attendance from anon;
grant select, insert, delete on public.blood_campaign_attendance to authenticated;

-- Nombre de participants annoncés : affiché seulement à partir de 10
create or replace function public.campaign_going(p_campaign uuid)
returns bigint language sql stable security definer set search_path = public as $$
  select public.stat_mask((select count(*) from public.blood_campaign_attendance where campaign_id = p_campaign))
$$;
grant execute on function public.campaign_going(uuid) to anon, authenticated;

create or replace function public.save_blood_campaign(p jsonb, p_notify boolean default true)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid; v_id uuid := nullif(p ->> 'id', '')::uuid; c public.blood_campaigns;
begin
  uid := public.authority_require('campaign:save', jsonb_build_object('id', v_id), array['ministere', 'cnts']);
  if v_id is null then
    insert into public.blood_campaigns (title, organizer, region_id, place, starts_on, start_time, end_time, details, source_url, published, created_by)
    values (btrim(p ->> 'title'), coalesce(nullif(btrim(p ->> 'organizer'), ''), 'CNTS'), nullif(p ->> 'region_id', '')::uuid, btrim(p ->> 'place'),
      (p ->> 'starts_on')::date, nullif(p ->> 'start_time', ''), nullif(p ->> 'end_time', ''), nullif(btrim(p ->> 'details'), ''),
      btrim(p ->> 'source_url'), coalesce((p ->> 'published')::boolean, true), uid)
    returning * into c;
  else
    update public.blood_campaigns set title = btrim(p ->> 'title'), organizer = coalesce(nullif(btrim(p ->> 'organizer'), ''), 'CNTS'),
      region_id = nullif(p ->> 'region_id', '')::uuid, place = btrim(p ->> 'place'), starts_on = (p ->> 'starts_on')::date,
      start_time = nullif(p ->> 'start_time', ''), end_time = nullif(p ->> 'end_time', ''), details = nullif(btrim(p ->> 'details'), ''),
      source_url = btrim(p ->> 'source_url'), published = coalesce((p ->> 'published')::boolean, true)
     where id = v_id returning * into c;
    if not found then raise exception 'PP404: campagne introuvable'; end if;
  end if;
  if p_notify and c.published and c.notified_at is null and c.starts_on >= current_date then
    insert into public.notifications (user_id, kind, title, body, link)
    select a.user_id, 'don', 'Collecte de sang près de chez vous',
           c.title || ' — ' || to_char(c.starts_on, 'DD/MM/YYYY') || ', ' || c.place || '.', '/don-de-sang#campagnes'
      from public.user_alert_prefs a join public.profiles pr on pr.id = a.user_id and pr.deleted_at is null
     where a.blood_alerts and (c.region_id is null or a.region_id is null or a.region_id = c.region_id);
    update public.blood_campaigns set notified_at = now() where id = c.id;
  end if;
  perform public.log_audit('blood_campaign_save', 'blood_campaign', c.id::text, jsonb_build_object('title', c.title));
  return c.id;
exception
  when check_violation then raise exception 'PP422: titre, lieu, date et lien vers la source officielle sont obligatoires';
  when not_null_violation then raise exception 'PP422: titre, lieu, date et lien vers la source officielle sont obligatoires';
  when invalid_datetime_format then raise exception 'PP422: date invalide';
end $$;

-- ---------------------------------------------------------------------------
-- 7. Avis des utilisateurs
-- ---------------------------------------------------------------------------
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  page_path text check (page_path ~ '^/' and char_length(page_path) <= 200),
  mood text check (mood in ('content', 'moyen', 'pas_content')),
  category text not null default 'autre' check (category in ('bug', 'idee', 'contenu', 'difficile', 'autre')),
  message text check (char_length(coalesce(message, '')) <= 1000),
  status text not null default 'nouveau' check (status in ('nouveau', 'lu', 'traite')),
  created_at timestamptz not null default now(),
  check (mood is not null or message is not null)
);
create index if not exists feedback_created on public.feedback (created_at desc);
alter table public.feedback enable row level security;
drop policy if exists "pp_feedback_admin" on public.feedback;
create policy "pp_feedback_admin" on public.feedback for select to authenticated using (public.is_admin());
revoke all on public.feedback from anon;
revoke insert, update, delete on public.feedback from authenticated;
grant select on public.feedback to authenticated;

create or replace function public.submit_feedback(p_page text, p_mood text, p_category text, p_message text)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.feedback (user_id, page_path, mood, category, message)
  values (auth.uid(), nullif(left(p_page, 200), ''), nullif(p_mood, ''), coalesce(nullif(p_category, ''), 'autre'), nullif(btrim(coalesce(p_message, '')), ''));
exception when check_violation then raise exception 'PP422: avis invalide (1 000 caractères au maximum)';
end $$;
grant execute on function public.submit_feedback(text, text, text, text) to anon, authenticated;

create or replace function public.admin_feedback_status(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  update public.feedback set status = p_status where id = p_id;
exception when check_violation then raise exception 'PP422: statut invalide';
end $$;

-- ---------------------------------------------------------------------------
-- 8. Guides audio : nouvelles pages à enregistrer en langues nationales
-- ---------------------------------------------------------------------------
insert into public.audio_targets (key, label, page_path, sort_order, script_fr) values
  ('premiers-secours', 'Premiers secours', '/premiers-secours', 20,
   'En cas d''urgence grave, appelez d''abord les secours ou partez tout de suite vers le centre de santé le plus proche. Cette page explique les gestes simples à faire en attendant : arrêter un saignement en appuyant fort sur la plaie, refroidir une brûlure avec de l''eau propre, mettre sur le côté une personne qui ne répond plus mais qui respire. Chaque fiche est vérifiée par un professionnel de santé. Ouvrez cette page une fois avec une connexion : elle reste ensuite lisible sans réseau.'),
  ('don-de-sang', 'Don de sang', '/don-de-sang', 21,
   'Donner son sang sauve des vies, surtout celles des femmes qui accouchent et des enfants malades du paludisme. Vous pouvez donner si vous avez entre dix-huit et soixante ans, si vous pesez au moins cinquante-cinq kilos et si vous êtes en bonne santé. Un homme peut donner tous les trois mois, une femme tous les quatre mois. Le don est gratuit : le sang ne se vend pas. Rendez-vous au Centre national de transfusion sanguine, ou à une collecte près de chez vous.'),
  ('droits', 'Vos droits', '/droits', 22,
   'Cette rubrique explique vos droits en matière de santé et de protection sociale au Mali : le congé de maternité, les allocations familiales, la déclaration de naissance, l''assurance maladie obligatoire, les soins gratuits, l''accident du travail et la retraite. Chaque fiche cite les textes officiels. Pour votre situation personnelle, renseignez-vous auprès de l''INPS, de la CANAM ou de votre employeur.'),
  ('vaccination-enfants', 'Carnet de vaccination des enfants', '/ma-sante/enfants', 23,
   'Ajoutez votre enfant avec sa date de naissance. PharmaProxi affiche les vaccins du calendrier national et vous prévient trois jours avant chaque rendez-vous. Notez chaque vaccin fait au centre de santé. Vous pouvez aussi noter son poids et sa taille à chaque pesée, pour suivre sa courbe de croissance. Gardez toujours le carnet papier : c''est lui qui fait foi.'),
  ('dossier-sante', 'Mon dossier santé', '/ma-sante/dossier', 24,
   'Mon dossier santé garde votre histoire de santé dans votre téléphone : votre groupe sanguin, vos allergies, vos maladies, vos opérations, vos vaccins, vos analyses et vos ordonnances. Chez le médecin, touchez Montrer à mon médecin : tout s''affiche sur une page. Votre dossier est visible par vous seul et peut être protégé par un code secret.'),
  ('signaler', 'Signaler un médicament suspect', '/signaler', 25,
   'Vous avez un doute sur un médicament : une boîte abîmée, un prix anormal, un produit vendu dans la rue, ou une mauvaise réaction après l''avoir pris ? Signalez-le ici. Votre signalement est transmis aux autorités de santé, qui vérifient. Il n''est jamais publié. Si la réaction est grave, allez d''abord au centre de santé.')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 9. Droits d'exécution, effacement avec le compte
-- ---------------------------------------------------------------------------
revoke execute on function public.authority_require(text, jsonb, text[]), public.stat_k(), public.stat_mask(bigint) from public, anon;
revoke execute on function public.authority_overview(uuid, date, date), public.authority_searches(uuid, date, date, boolean, int), public.authority_trend(text, uuid, int),
  public.authority_regions(date, date), public.authority_duty_gaps(uuid), public.authority_amo_prices(uuid, int), public.authority_topics(date, date),
  public.authority_blood(uuid), public.authority_reports(text, text, uuid, int, int), public.authority_update_report(uuid, text, text),
  public.save_blood_campaign(jsonb, boolean), public.admin_set_authority(text, text, text, text, boolean), public.submit_drug_report(jsonb),
  public.admin_feedback_status(uuid, text), public.is_authority(), public.authority_scope(uuid) from public, anon;
grant execute on function public.authority_overview(uuid, date, date), public.authority_searches(uuid, date, date, boolean, int), public.authority_trend(text, uuid, int),
  public.authority_regions(date, date), public.authority_duty_gaps(uuid), public.authority_amo_prices(uuid, int), public.authority_topics(date, date),
  public.authority_blood(uuid), public.authority_reports(text, text, uuid, int, int), public.authority_update_report(uuid, text, text),
  public.save_blood_campaign(jsonb, boolean), public.admin_set_authority(text, text, text, text, boolean), public.submit_drug_report(jsonb),
  public.admin_feedback_status(uuid, text), public.is_authority(), public.authority_scope(uuid) to authenticated;

create or replace function public.purge_personal_health_data()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    delete from public.record_persons where owner_id = new.id;
    delete from public.record_settings where user_id = new.id;
    delete from public.children where user_id = new.id;
    delete from public.treatments where user_id = new.id;
    delete from public.health_measures where user_id = new.id;
    delete from public.user_alert_prefs where user_id = new.id;
    delete from public.blood_campaign_attendance where user_id = new.id;
    delete from public.authority_members where user_id = new.id;
    update public.drug_reports set reporter_id = null, contact_phone = null, contact_ok = false where reporter_id = new.id;
    delete from public.pharmacist_questions where user_id = new.id and not (allow_public and status <> 'open');
    delete from public.femme_days where user_id = new.id;
    delete from public.femme_periods where user_id = new.id;
    delete from public.femme_reminders where user_id = new.id;
    delete from public.femme_access_log where user_id = new.id;
    delete from public.femme_profiles where user_id = new.id;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- 10. Politique de confidentialité : mise à jour du texte provisoire (seulement s'il n'a pas été réécrit)
-- ---------------------------------------------------------------------------
update public.content_pages set body =
'Version provisoire — à faire valider par un juriste au regard de la loi n° 2013-015 du 21 mai 2013 sur la protection des données à caractère personnel et des exigences de l''Autorité de protection des données à caractère personnel (APDP).

Données de compte : nom, téléphone, adresse e-mail, adresses de livraison, historique des commandes et des rendez-vous.
Espaces de santé personnels (Mon dossier santé, Ma santé, PharmaProxi Femme) : les informations que vous y notez (allergies, maladies, traitements, vaccins, mesures, croissance des enfants, cycle…) sont visibles par vous seul. Ni les pharmacies, ni les médecins, ni les assureurs, ni l''équipe de PharmaProxi n''y ont accès. Elles ne sont utilisées ni pour de la publicité, ni par l''assistant automatique, ni dans les statistiques, et sont effacées avec votre compte.
Finalités : mise en relation avec les pharmacies et les professionnels, suivi des commandes et des rendez-vous, rappels que vous avez demandés, sécurité de la plateforme.
Destinataires : la pharmacie ou le professionnel choisi et, en cas de livraison, le livreur affecté reçoivent uniquement les informations nécessaires.
Statistiques anonymes : les recherches de médicaments sont enregistrées sans votre identité. Des statistiques anonymes et agrégées (par exemple les médicaments les plus cherchés sans résultat) aident les autorités de santé à repérer les ruptures ; un chiffre inférieur à 10 n''est jamais affiché.
Signalements de médicaments : un signalement de médicament suspect ou d''effet indésirable est transmis, avec votre accord, aux autorités de santé (ministère de la Santé, Direction de la pharmacie et du médicament, Ordre des pharmaciens). Il n''est jamais publié ; votre nom n''est pas communiqué, votre téléphone seulement si vous l''acceptez.
Conservation : les commandes sont conservées pour la durée légale applicable ; la suppression du compte efface vos espaces de santé et anonymise le profil.
Droits : accès, rectification, suppression depuis votre espace « Mon compte » ou en écrivant au contact de la plateforme.'
where slug = 'confidentialite' and body like 'Version provisoire%' and body not like '%Mon dossier santé%';


-- >>> 20261106000100_labs_home_sampling.sql
-- =============================================================================
-- PharmaProxi 0.21 — Profil à l'inscription, espace laboratoire (analyses et prix
-- déclarés), prélèvement à domicile, identifiants uniques, statistiques de l'offre
-- de soins pour les autorités.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Profil choisi à l'inscription
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists account_type text not null default 'patient';
do $$ begin
  alter table public.profiles add constraint profiles_account_type_check
    check (account_type in ('patient', 'pharmacien', 'medecin', 'clinique', 'laboratoire', 'autre'));
exception when duplicate_object then null; end $$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, phone, account_type)
  values (
    new.id,
    nullif(left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120), ''),
    case when (new.raw_user_meta_data ->> 'phone') ~ '^\+[1-9][0-9]{7,14}$' then new.raw_user_meta_data ->> 'phone' end,
    case when new.raw_user_meta_data ->> 'account_type' in ('patient', 'pharmacien', 'medecin', 'clinique', 'laboratoire', 'autre')
         then new.raw_user_meta_data ->> 'account_type' else 'patient' end
  )
  on conflict (id) do nothing;
  insert into public.user_roles (user_id, role) values (new.id, 'customer') on conflict do nothing;
  return new;
end $$;

create or replace function public.set_account_type(p_type text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_type not in ('patient', 'pharmacien', 'medecin', 'clinique', 'laboratoire', 'autre') then raise exception 'PP422: profil invalide'; end if;
  update public.profiles set account_type = p_type where id = public.require_auth();
end $$;
revoke execute on function public.set_account_type(text) from public, anon;
grant execute on function public.set_account_type(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Identifiants uniques PharmaProxi (lisibles, stables, jamais réutilisés)
-- ---------------------------------------------------------------------------
create sequence if not exists public.public_code_seq;
create or replace function public.next_public_code(p_prefix text)
returns text language sql volatile as $$
  select p_prefix || '-' || lpad(nextval('public.public_code_seq')::text, 6, '0')
$$;
alter table public.pharmacies add column if not exists public_code text unique;
alter table public.doctors add column if not exists public_code text unique;
alter table public.clinics add column if not exists public_code text unique;
alter table public.facility_listings add column if not exists public_code text unique;
update public.pharmacies set public_code = public.next_public_code('PP-PH') where public_code is null;
update public.doctors set public_code = public.next_public_code('PP-MD') where public_code is null;
update public.clinics set public_code = public.next_public_code('PP-ET') where public_code is null;
update public.facility_listings set public_code = public.next_public_code(case when kind = 'laboratoire' then 'PP-LB' else 'PP-ET' end) where public_code is null;
alter table public.pharmacies alter column public_code set default public.next_public_code('PP-PH');
alter table public.doctors alter column public_code set default public.next_public_code('PP-MD');
alter table public.clinics alter column public_code set default public.next_public_code('PP-ET');
alter table public.facility_listings alter column public_code drop default;
create or replace function public.facility_public_code() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.public_code is null then
    new.public_code := public.next_public_code(case when new.kind = 'laboratoire' then 'PP-LB' else 'PP-ET' end);
  end if;
  return new;
end $$;
drop trigger if exists facility_public_code on public.facility_listings;
create trigger facility_public_code before insert on public.facility_listings
  for each row execute function public.facility_public_code();

-- ---------------------------------------------------------------------------
-- 3. Catalogue d'analyses complété (noms usuels, sans conseil médical)
-- ---------------------------------------------------------------------------
insert into public.medical_exams (code, name, category, synonyms, sort_order) values
  ('glycemie_pp', 'Glycémie postprandiale', 'biologie', 'sucre après repas diabète', 40),
  ('hgpo', 'Hyperglycémie provoquée par voie orale (HGPO)', 'biologie', 'test au glucose diabète grossesse', 41),
  ('acide_urique', 'Acide urique (uricémie)', 'biologie', 'goutte', 42),
  ('bilirubine', 'Bilirubine totale et conjuguée', 'biologie', 'foie jaunisse ictère', 43),
  ('gamma_gt', 'Gamma GT', 'biologie', 'foie ggt', 44),
  ('phosphatases', 'Phosphatases alcalines', 'biologie', 'foie os pal', 45),
  ('proteines_totales', 'Protéines totales et albumine', 'biologie', 'albuminémie', 46),
  ('calcemie', 'Calcémie', 'biologie', 'calcium', 47),
  ('magnesemie', 'Magnésémie', 'biologie', 'magnésium', 48),
  ('fer_ferritine', 'Fer sérique et ferritine', 'biologie', 'anémie carence fer', 49),
  ('reticulocytes', 'Réticulocytes', 'biologie', 'anémie', 60),
  ('tp_inr', 'Taux de prothrombine (TP / INR)', 'biologie', 'coagulation anticoagulant inr', 61),
  ('tca', 'Temps de céphaline activée (TCA)', 'biologie', 'coagulation', 62),
  ('t3_t4', 'T3 et T4 libres (thyroïde)', 'biologie', 'thyroïde ft3 ft4', 63),
  ('vitamine_d', 'Vitamine D', 'biologie', '25-oh vitamine d', 64),
  ('microalbuminurie', 'Microalbuminurie', 'biologie', 'rein urines diabète', 65),
  ('proteinurie', 'Protéinurie des 24 heures', 'biologie', 'urines rein grossesse', 66),
  ('bandelette_urinaire', 'Bandelette urinaire', 'biologie', 'urines', 67),
  ('hemoculture', 'Hémoculture', 'biologie', 'sang infection septicémie', 68),
  ('coproculture', 'Coproculture', 'biologie', 'selles diarrhée', 69),
  ('prelevement_vaginal', 'Prélèvement vaginal', 'biologie', 'pv infection gynécologique', 71),
  ('spermogramme', 'Spermogramme', 'biologie', 'fertilité homme', 72),
  ('test_emmel', 'Test d''Emmel', 'biologie', 'drépanocytose falciformation', 73),
  ('toxoplasmose', 'Sérologie toxoplasmose', 'biologie', 'grossesse toxo', 74),
  ('rubeole', 'Sérologie rubéole', 'biologie', 'grossesse', 75),
  ('syphilis', 'Sérologie syphilis (TPHA / VDRL)', 'biologie', 'tpha vdrl ist', 76),
  ('chlamydia', 'Recherche de chlamydia', 'biologie', 'ist', 77),
  ('aslo', 'ASLO', 'biologie', 'angine streptocoque', 78),
  ('facteur_rhumatoide', 'Facteur rhumatoïde', 'biologie', 'polyarthrite', 79),
  ('cd4', 'Numération des CD4', 'biologie', 'vih suivi lymphocytes', 80),
  ('charge_virale_vih', 'Charge virale VIH', 'biologie', 'vih suivi', 81),
  ('charge_virale_vhb', 'Charge virale hépatite B (ADN VHB)', 'biologie', 'hépatite b suivi', 82),
  ('covid_pcr', 'Test COVID-19 (PCR)', 'biologie', 'coronavirus covid', 83),
  ('bk_crachat', 'Recherche de BK dans les crachats', 'biologie', 'tuberculose', 84),
  ('frottis', 'Frottis cervico-utérin', 'biologie', 'col utérus dépistage', 85),
  ('echo_thyroide', 'Échographie de la thyroïde', 'imagerie', 'thyroïde cou', 58),
  ('echo_doppler', 'Échographie Doppler', 'imagerie', 'vaisseaux veines artères', 59),
  ('echo_cardiaque', 'Échographie cardiaque', 'imagerie', 'cœur échocardiographie', 86),
  ('radio_sinus', 'Radiographie des sinus', 'imagerie', 'sinus', 87),
  ('holter', 'Holter tensionnel ou ECG', 'autre', 'tension cœur 24 heures', 88),
  ('eeg', 'Électroencéphalogramme (EEG)', 'autre', 'cerveau épilepsie', 89)
on conflict (code) do nothing;

-- Analyses proposées par un laboratoire et absentes du catalogue (validées par l'équipe)
create table if not exists public.exam_suggestions (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid references public.facility_listings(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 120),
  category text not null default 'biologie' check (category in ('biologie', 'imagerie', 'autre')),
  suggested_by uuid references public.profiles(id) on delete set null,
  status text not null default 'nouvelle' check (status in ('nouvelle', 'ajoutee', 'refusee')),
  created_at timestamptz not null default now()
);
alter table public.exam_suggestions enable row level security;
drop policy if exists "pp_exam_suggestions_admin" on public.exam_suggestions;
create policy "pp_exam_suggestions_admin" on public.exam_suggestions for select to authenticated using (public.is_admin() or suggested_by = auth.uid());
revoke all on public.exam_suggestions from anon;
revoke insert, update, delete on public.exam_suggestions from authenticated;
grant select on public.exam_suggestions to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Membres des laboratoires (désignés par l'équipe après vérification)
-- ---------------------------------------------------------------------------
create table if not exists public.facility_members (
  facility_id uuid not null references public.facility_listings(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'gestionnaire' check (role in ('responsable', 'gestionnaire')),
  granted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (facility_id, user_id)
);
alter table public.facility_members enable row level security;
drop policy if exists "pp_facility_members_self" on public.facility_members;
create policy "pp_facility_members_self" on public.facility_members for select to authenticated using (user_id = auth.uid() or public.is_admin());
revoke all on public.facility_members from anon;
revoke insert, update, delete on public.facility_members from authenticated;
grant select on public.facility_members to authenticated;

create or replace function public.is_facility_member(p_facility uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.facility_members m where m.facility_id = p_facility and m.user_id = auth.uid())
$$;

-- Demande d'accès d'un laboratoire (vérifiée par l'équipe avant d'ouvrir l'espace)
create table if not exists public.lab_access_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  facility_id uuid references public.facility_listings(id) on delete set null,
  lab_name text not null check (char_length(btrim(lab_name)) between 2 and 160),
  region_id uuid references public.regions(id) on delete set null,
  address text check (char_length(coalesce(address, '')) <= 300),
  phone text not null check (public.valid_phone(phone)),
  authorization_ref text not null check (char_length(btrim(authorization_ref)) between 2 and 120),
  role_in_lab text check (char_length(coalesce(role_in_lab, '')) <= 120),
  message text check (char_length(coalesce(message, '')) <= 1000),
  status text not null default 'nouvelle' check (status in ('nouvelle', 'acceptee', 'refusee')),
  admin_note text check (char_length(coalesce(admin_note, '')) <= 500),
  created_at timestamptz not null default now()
);
alter table public.lab_access_requests enable row level security;
drop policy if exists "pp_lab_requests_own" on public.lab_access_requests;
create policy "pp_lab_requests_own" on public.lab_access_requests for select to authenticated using (user_id = auth.uid() or public.is_admin());
drop policy if exists "pp_lab_requests_insert" on public.lab_access_requests;
create policy "pp_lab_requests_insert" on public.lab_access_requests for insert to authenticated with check (user_id = auth.uid() and status = 'nouvelle' and admin_note is null);
revoke all on public.lab_access_requests from anon;
grant select, insert on public.lab_access_requests to authenticated;

create or replace function public.admin_grant_lab(p_email text, p_facility uuid, p_request uuid default null, p_role text default 'responsable')
returns void language plpgsql security definer set search_path = public, auth as $$
declare me uuid := public.require_admin(); uid uuid;
begin
  if nullif(btrim(coalesce(p_email, '')), '') is null and p_request is not null then
    -- Demande d'accès : le compte est celui qui a fait la demande
    select r.user_id into uid from public.lab_access_requests r join public.profiles p on p.id = r.user_id and p.deleted_at is null where r.id = p_request;
  else
    select u.id into uid from auth.users u join public.profiles p on p.id = u.id and p.deleted_at is null where lower(u.email) = lower(btrim(p_email));
  end if;
  if uid is null then raise exception 'PP404: aucun compte avec cette adresse e-mail'; end if;
  if not exists (select 1 from public.facility_listings where id = p_facility and kind = 'laboratoire') then raise exception 'PP404: laboratoire introuvable dans l''annuaire'; end if;
  insert into public.facility_members (facility_id, user_id, role, granted_by) values (p_facility, uid, coalesce(p_role, 'responsable'), me)
  on conflict (facility_id, user_id) do update set role = excluded.role, granted_by = me;
  if p_request is not null then update public.lab_access_requests set status = 'acceptee', facility_id = p_facility where id = p_request; end if;
  perform public.notify_user(uid, 'laboratoire', 'Votre espace laboratoire est ouvert', 'Vous pouvez maintenant gérer les analyses, les prix et les prélèvements à domicile.', null, '/laboratoire');
  perform public.log_audit('lab_grant', 'facility_listing', p_facility::text, jsonb_build_object('user', uid));
end $$;

create or replace function public.admin_revoke_lab(p_facility uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  delete from public.facility_members where facility_id = p_facility and user_id = p_user;
  perform public.log_audit('lab_revoke', 'facility_listing', p_facility::text, jsonb_build_object('user', p_user));
end $$;

-- Analyses et prix déclarés par le laboratoire lui-même
create or replace function public.lab_save_exam(p_facility uuid, p_exam uuid, p_price int, p_note text, p_delay text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_facility_member(p_facility) then raise exception 'PP403: réservé aux membres de ce laboratoire' using errcode = '42501'; end if;
  if p_price is not null and (p_price < 0 or p_price > 10000000) then raise exception 'PP422: prix invalide'; end if;
  insert into public.facility_exams (facility_id, exam_id, price_xof, price_note, delay, source, verified_at)
  values (p_facility, p_exam, p_price, nullif(btrim(coalesce(p_note, '')), ''), nullif(btrim(coalesce(p_delay, '')), ''), 'Déclaré par le laboratoire', current_date)
  on conflict (facility_id, exam_id) do update set price_xof = excluded.price_xof, price_note = excluded.price_note, delay = excluded.delay,
    source = excluded.source, verified_at = excluded.verified_at, updated_at = now();
exception when check_violation then raise exception 'PP422: note ou délai trop long';
end $$;

create or replace function public.lab_remove_exam(p_facility uuid, p_exam uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_facility_member(p_facility) then raise exception 'PP403: réservé aux membres de ce laboratoire' using errcode = '42501'; end if;
  delete from public.facility_exams where facility_id = p_facility and exam_id = p_exam;
end $$;

create or replace function public.lab_suggest_exam(p_facility uuid, p_name text, p_category text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_facility_member(p_facility) then raise exception 'PP403: réservé aux membres de ce laboratoire' using errcode = '42501'; end if;
  insert into public.exam_suggestions (facility_id, name, category, suggested_by) values (p_facility, btrim(p_name), coalesce(nullif(p_category, ''), 'biologie'), auth.uid());
exception when check_violation then raise exception 'PP422: nom d''analyse invalide';
end $$;

-- ---------------------------------------------------------------------------
-- 5. Prélèvement à domicile
-- ---------------------------------------------------------------------------
create table if not exists public.lab_home_service (
  facility_id uuid primary key references public.facility_listings(id) on delete cascade,
  enabled boolean not null default false,
  fee_xof int check (fee_xof is null or fee_xof between 0 and 1000000),
  partner_name text check (char_length(coalesce(partner_name, '')) <= 120),
  partner_provider_id uuid references public.home_care_providers(id) on delete set null,
  areas text check (char_length(coalesce(areas, '')) <= 300),
  hours text check (char_length(coalesce(hours, '')) <= 200),
  conditions text check (char_length(coalesce(conditions, '')) <= 500),
  updated_at timestamptz not null default now()
);
alter table public.lab_home_service enable row level security;
drop policy if exists "pp_lab_home_read" on public.lab_home_service;
create policy "pp_lab_home_read" on public.lab_home_service for select to anon, authenticated
  using (exists (select 1 from public.facility_listings f where f.id = facility_id and f.is_published) or public.is_admin());
revoke insert, update, delete on public.lab_home_service from anon, authenticated;
grant select on public.lab_home_service to anon, authenticated;

create or replace function public.lab_save_home_service(p_facility uuid, p jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_facility_member(p_facility) then raise exception 'PP403: réservé aux membres de ce laboratoire' using errcode = '42501'; end if;
  insert into public.lab_home_service (facility_id, enabled, fee_xof, partner_name, partner_provider_id, areas, hours, conditions, updated_at)
  values (p_facility, coalesce((p ->> 'enabled')::boolean, false), nullif(p ->> 'fee_xof', '')::int, nullif(btrim(p ->> 'partner_name'), ''),
    nullif(p ->> 'partner_provider_id', '')::uuid, nullif(btrim(p ->> 'areas'), ''), nullif(btrim(p ->> 'hours'), ''), nullif(btrim(p ->> 'conditions'), ''), now())
  on conflict (facility_id) do update set enabled = excluded.enabled, fee_xof = excluded.fee_xof, partner_name = excluded.partner_name,
    partner_provider_id = excluded.partner_provider_id, areas = excluded.areas, hours = excluded.hours, conditions = excluded.conditions, updated_at = now();
exception
  when check_violation then raise exception 'PP422: certaines informations sont trop longues ou invalides';
  when invalid_text_representation then raise exception 'PP422: frais invalides';
end $$;

create table if not exists public.home_sampling_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  facility_id uuid not null references public.facility_listings(id) on delete cascade,
  exam_ids uuid[] not null default '{}',
  other_exams text check (char_length(coalesce(other_exams, '')) <= 300),
  patient_name text not null check (char_length(btrim(patient_name)) between 2 and 120),
  patient_age int check (patient_age between 0 and 120),
  for_relative boolean not null default false,
  address text not null check (char_length(btrim(address)) between 5 and 300),
  region_id uuid references public.regions(id) on delete set null,
  phone text not null check (public.valid_phone(phone)),
  preferred_date date not null check (preferred_date >= current_date - 1),
  slot text not null default 'matin' check (slot in ('matin', 'midi', 'apres_midi')),
  has_prescription boolean not null default false,
  fasting_known boolean not null default false,
  notes text check (char_length(coalesce(notes, '')) <= 500),
  status text not null default 'nouvelle' check (status in ('nouvelle', 'acceptee', 'planifiee', 'prelevee', 'terminee', 'refusee', 'annulee')),
  scheduled_at timestamptz,
  lab_note text check (char_length(coalesce(lab_note, '')) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (cardinality(exam_ids) between 0 and 30 and (cardinality(exam_ids) > 0 or other_exams is not null))
);
create index if not exists home_sampling_facility on public.home_sampling_requests (facility_id, status, preferred_date);
alter table public.home_sampling_requests enable row level security;
drop policy if exists "pp_home_sampling_own" on public.home_sampling_requests;
create policy "pp_home_sampling_own" on public.home_sampling_requests for select to authenticated using (user_id = auth.uid() or public.is_facility_member(facility_id));
revoke all on public.home_sampling_requests from anon;
revoke insert, update, delete on public.home_sampling_requests from authenticated;
grant select on public.home_sampling_requests to authenticated;

create or replace function public.request_home_sampling(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_auth(); fac uuid := (p ->> 'facility_id')::uuid; v_id uuid; ex uuid[];
begin
  if not exists (select 1 from public.lab_home_service s join public.facility_listings f on f.id = s.facility_id and f.is_published where s.facility_id = fac and s.enabled) then
    raise exception 'PP409: ce laboratoire ne propose pas de prélèvement à domicile';
  end if;
  if (select count(*) from public.home_sampling_requests where user_id = uid and created_at > now() - interval '1 day') >= 3 then
    raise exception 'PP429: 3 demandes par jour au maximum';
  end if;
  ex := coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(coalesce(p -> 'exam_ids', '[]'::jsonb)) x), '{}');
  if exists (select 1 from unnest(ex) e where not exists (select 1 from public.medical_exams m where m.id = e)) then raise exception 'PP422: analyse inconnue'; end if;
  insert into public.home_sampling_requests (user_id, facility_id, exam_ids, other_exams, patient_name, patient_age, for_relative, address, region_id, phone,
    preferred_date, slot, has_prescription, fasting_known, notes)
  values (uid, fac, ex, nullif(btrim(p ->> 'other_exams'), ''), btrim(p ->> 'patient_name'), nullif(p ->> 'patient_age', '')::int,
    coalesce((p ->> 'for_relative')::boolean, false), btrim(p ->> 'address'), nullif(p ->> 'region_id', '')::uuid, btrim(p ->> 'phone'),
    (p ->> 'preferred_date')::date, coalesce(nullif(p ->> 'slot', ''), 'matin'), coalesce((p ->> 'has_prescription')::boolean, false),
    coalesce((p ->> 'fasting_known')::boolean, false), nullif(btrim(p ->> 'notes'), ''))
  returning id into v_id;
  insert into public.notifications (user_id, kind, title, body, link)
  select m.user_id, 'laboratoire', 'Nouvelle demande de prélèvement à domicile', 'Une demande attend votre réponse.', '/laboratoire/prelevements'
    from public.facility_members m where m.facility_id = fac;
  return v_id;
exception
  when check_violation then raise exception 'PP422: vérifiez le nom, l''adresse, le téléphone, la date et les analyses';
  when invalid_text_representation or invalid_datetime_format then raise exception 'PP422: informations invalides';
end $$;

create or replace function public.lab_update_sampling(p_id uuid, p_status text, p_scheduled timestamptz default null, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare r public.home_sampling_requests; lbl text;
begin
  select * into r from public.home_sampling_requests where id = p_id for update;
  if not found or not public.is_facility_member(r.facility_id) then raise exception 'PP403: demande introuvable' using errcode = '42501'; end if;
  if p_status not in ('acceptee', 'planifiee', 'prelevee', 'terminee', 'refusee') then raise exception 'PP422: statut invalide'; end if;
  if r.status in ('annulee', 'terminee', 'refusee') then raise exception 'PP409: cette demande est close'; end if;
  update public.home_sampling_requests set status = p_status, scheduled_at = coalesce(p_scheduled, scheduled_at),
    lab_note = coalesce(nullif(btrim(coalesce(p_note, '')), ''), lab_note), updated_at = now() where id = p_id;
  lbl := case p_status when 'acceptee' then 'Votre demande de prélèvement est acceptée'
    when 'planifiee' then 'Votre prélèvement à domicile est planifié' when 'prelevee' then 'Prélèvement effectué'
    when 'terminee' then 'Votre demande de prélèvement est terminée' else 'Votre demande de prélèvement n''a pas pu être acceptée' end;
  perform public.notify_user(r.user_id, 'laboratoire', lbl,
    case when p_status = 'planifiee' and coalesce(p_scheduled, r.scheduled_at) is not null
      then 'Rendez-vous le ' || to_char(coalesce(p_scheduled, r.scheduled_at) at time zone 'utc', 'DD/MM/YYYY à HH24"h"MI') || '.' else 'Ouvrez PharmaProxi pour voir le détail.' end,
    null, '/compte/prelevements');
end $$;

create or replace function public.cancel_home_sampling(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.home_sampling_requests set status = 'annulee', updated_at = now()
   where id = p_id and user_id = public.require_auth() and status in ('nouvelle', 'acceptee', 'planifiee');
  if not found then raise exception 'PP409: cette demande ne peut plus être annulée'; end if;
end $$;

revoke execute on function public.lab_save_exam(uuid, uuid, int, text, text), public.lab_remove_exam(uuid, uuid), public.lab_suggest_exam(uuid, text, text),
  public.lab_save_home_service(uuid, jsonb), public.request_home_sampling(jsonb), public.lab_update_sampling(uuid, text, timestamptz, text),
  public.cancel_home_sampling(uuid), public.admin_grant_lab(text, uuid, uuid, text), public.admin_revoke_lab(uuid, uuid), public.is_facility_member(uuid) from public, anon;
grant execute on function public.lab_save_exam(uuid, uuid, int, text, text), public.lab_remove_exam(uuid, uuid), public.lab_suggest_exam(uuid, text, text),
  public.lab_save_home_service(uuid, jsonb), public.request_home_sampling(jsonb), public.lab_update_sampling(uuid, text, timestamptz, text),
  public.cancel_home_sampling(uuid), public.admin_grant_lab(text, uuid, uuid, text), public.admin_revoke_lab(uuid, uuid), public.is_facility_member(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Statistiques de l'offre de soins (données publiques de l'annuaire, sans seuil)
-- ---------------------------------------------------------------------------
create or replace function public.authority_supply(p_region uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare yr int := (select max(register_year) from public.doctor_register where is_published);
begin
  perform public.authority_require('stats:supply', jsonb_build_object('region', p_region));
  return jsonb_build_object(
    'register_year', yr,
    'by_region', coalesce((select jsonb_agg(x order by x ->> 'region') from (
      select jsonb_build_object('region', r.name, 'region_id', r.id,
        'pharmacies', (select count(*) from public.pharmacies p where p.region_id = r.id and p.status = 'verified' and not p.is_demo),
        'pharmacies_listed', (select count(*) from public.pharmacy_listings l where l.region_id = r.id and l.is_published and l.claimed_pharmacy_id is null),
        'doctors_register', (select count(*) from public.doctor_register d where d.region_id = r.id and d.is_published and d.register_year = yr),
        'labs', (select count(*) from public.facility_listings f where f.region_id = r.id and f.is_published and f.kind = 'laboratoire'),
        'health_facilities', (select count(*) from public.facility_listings f where f.region_id = r.id and f.is_published and f.kind <> 'laboratoire'),
        'home_care', (select count(*) from public.home_care_providers h where h.region_id = r.id and h.is_published),
        'home_sampling', (select count(*) from public.lab_home_service s join public.facility_listings f on f.id = s.facility_id where f.region_id = r.id and s.enabled and f.is_published)) x
      from public.regions r where p_region is null or r.id = p_region) y), '[]'::jsonb),
    'specialties', coalesce((select jsonb_agg(jsonb_build_object('specialty', s, 'n', n) order by n desc) from (
      select coalesce(ms.name, nullif(btrim(d.specialty_label), ''), 'Non précisée') s, count(*) n
        from public.doctor_register d left join public.medical_specialties ms on ms.id = d.specialty_id
       where d.is_published and d.register_year = yr and (p_region is null or d.region_id = p_region)
       group by 1 order by 2 desc limit 25) z), '[]'::jsonb),
    'facility_kinds', coalesce((select jsonb_agg(jsonb_build_object('kind', kind, 'n', n) order by n desc) from (
      select kind, count(*) n from public.facility_listings where is_published and (p_region is null or region_id = p_region) group by kind) k), '[]'::jsonb),
    'exams_with_price', (select count(*) from public.facility_exams fe join public.facility_listings f on f.id = fe.facility_id
                          where f.is_published and fe.price_xof is not null and (p_region is null or f.region_id = p_region)));
end $$;
revoke execute on function public.authority_supply(uuid) from public, anon;
grant execute on function public.authority_supply(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Effacement avec le compte
-- ---------------------------------------------------------------------------
create or replace function public.purge_personal_health_data()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    delete from public.record_persons where owner_id = new.id;
    delete from public.record_settings where user_id = new.id;
    delete from public.children where user_id = new.id;
    delete from public.treatments where user_id = new.id;
    delete from public.health_measures where user_id = new.id;
    delete from public.user_alert_prefs where user_id = new.id;
    delete from public.blood_campaign_attendance where user_id = new.id;
    delete from public.authority_members where user_id = new.id;
    delete from public.facility_members where user_id = new.id;
    delete from public.home_sampling_requests where user_id = new.id;
    update public.drug_reports set reporter_id = null, contact_phone = null, contact_ok = false where reporter_id = new.id;
    delete from public.pharmacist_questions where user_id = new.id and not (allow_public and status <> 'open');
    delete from public.femme_days where user_id = new.id;
    delete from public.femme_periods where user_id = new.id;
    delete from public.femme_reminders where user_id = new.id;
    delete from public.femme_access_log where user_id = new.id;
    delete from public.femme_profiles where user_id = new.id;
  end if;
  return new;
end $$;


-- >>> 20261107000100_santeproxi_pro_admin.sql
-- =============================================================================
-- SantéProxi 0.22 — inscription réservée aux patients ; les professionnels de
-- santé sont ajoutés par l'administrateur ; identifiants SP-… ; nom SantéProxi.
--
-- Règle : toute personne qui crée un compte est un patient. Un compte ne peut
-- créer une pharmacie, une fiche médecin ou une clinique que si l'administrateur
-- l'y a autorisé (après vérification de son autorisation d'exercer). Les
-- laboratoires sont rattachés directement par l'administrateur.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Inscription : toujours « patient »
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, phone, account_type)
  values (
    new.id,
    nullif(left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120), ''),
    case when (new.raw_user_meta_data ->> 'phone') ~ '^\+[1-9][0-9]{7,14}$' then new.raw_user_meta_data ->> 'phone' end,
    'patient'
  )
  on conflict (id) do nothing;
  insert into public.user_roles (user_id, role) values (new.id, 'customer') on conflict do nothing;
  return new;
end $$;

-- Le type de compte n'est plus choisi par l'utilisateur
revoke execute on function public.set_account_type(text) from authenticated;
create or replace function public.set_account_type(p_type text)
returns void language plpgsql security definer set search_path = public as $$
begin
  raise exception 'PP403: le type de compte est attribué par l''administrateur';
end $$;

-- ---------------------------------------------------------------------------
-- 2. Autorisations d'inscription professionnelle (données par l'administrateur)
-- ---------------------------------------------------------------------------
create table if not exists public.pro_authorizations (
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('pharmacie', 'medecin', 'clinique')),
  note text check (char_length(coalesce(note, '')) <= 300),
  granted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, kind)
);
alter table public.pro_authorizations enable row level security;
drop policy if exists "pp_pro_auth_read" on public.pro_authorizations;
create policy "pp_pro_auth_read" on public.pro_authorizations for select to authenticated using (user_id = auth.uid() or public.is_admin());
revoke all on public.pro_authorizations from anon, authenticated;
grant select on public.pro_authorizations to authenticated;

create or replace function public.has_pro_authorization(p_kind text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (select 1 from public.pro_authorizations where user_id = auth.uid() and kind = p_kind);
$$;
grant execute on function public.has_pro_authorization(text) to authenticated;

-- Compte d'un utilisateur à partir de son e-mail (réservé à l'administrateur)
create or replace function public.admin_user_by_email(p_email text)
returns uuid language plpgsql stable security definer set search_path = public, auth as $$
declare uid uuid;
begin
  perform public.require_admin();
  select u.id into uid from auth.users u join public.profiles p on p.id = u.id and p.deleted_at is null
   where lower(u.email) = lower(btrim(p_email));
  if uid is null then raise exception 'PP404: aucun compte avec cette adresse e-mail. La personne doit d''abord créer un compte patient.'; end if;
  return uid;
end $$;
revoke execute on function public.admin_user_by_email(text) from public, anon, authenticated;

create or replace function public.admin_authorize_pro(p_email text, p_kind text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := public.require_admin(); uid uuid;
begin
  if p_kind not in ('pharmacie', 'medecin', 'clinique') then raise exception 'PP422: type de professionnel invalide'; end if;
  uid := public.admin_user_by_email(p_email);
  insert into public.pro_authorizations (user_id, kind, note, granted_by) values (uid, p_kind, nullif(btrim(coalesce(p_note, '')), ''), me)
  on conflict (user_id, kind) do update set note = excluded.note, granted_by = me, created_at = now();
  update public.profiles set account_type = case p_kind when 'pharmacie' then 'pharmacien' else p_kind end where id = uid;
  perform public.notify_user(uid, 'compte', 'Inscription professionnelle autorisée',
    case p_kind when 'pharmacie' then 'Vous pouvez maintenant inscrire votre pharmacie.'
                when 'medecin' then 'Vous pouvez maintenant créer votre fiche de médecin.'
                else 'Vous pouvez maintenant inscrire votre établissement.' end, null,
    case p_kind when 'pharmacie' then '/pharmacien/inscription' when 'medecin' then '/medecin/inscription' else '/clinique/inscription' end);
  perform public.log_audit('pro_authorize', 'profile', uid::text, jsonb_build_object('kind', p_kind));
end $$;
revoke execute on function public.admin_authorize_pro(text, text, text) from public, anon;
grant execute on function public.admin_authorize_pro(text, text, text) to authenticated;

create or replace function public.admin_revoke_pro_authorization(p_user uuid, p_kind text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  delete from public.pro_authorizations where user_id = p_user and kind = p_kind;
  perform public.log_audit('pro_revoke', 'profile', p_user::text, jsonb_build_object('kind', p_kind));
end $$;
revoke execute on function public.admin_revoke_pro_authorization(uuid, text) from public, anon;
grant execute on function public.admin_revoke_pro_authorization(uuid, text) to authenticated;

-- Garde-fou en base : pas de pharmacie, de fiche médecin ni de clinique créée
-- par un compte sans autorisation (les créations par l'administrateur, la
-- maintenance et les données de démonstration ne sont pas concernées).
create or replace function public.guard_pro_creation()
returns trigger language plpgsql security definer set search_path = public as $$
declare k text := tg_argv[0];
begin
  if auth.uid() is null or public.is_admin() then return new; end if;
  if coalesce((to_jsonb(new) ->> 'is_demo')::boolean, false) then return new; end if;
  if not exists (select 1 from public.pro_authorizations where user_id = auth.uid() and kind = k) then
    raise exception 'PP403: inscription professionnelle réservée : l''administrateur doit d''abord vérifier et autoriser votre compte';
  end if;
  return new;
end $$;
drop trigger if exists guard_pro_creation on public.pharmacies;
create trigger guard_pro_creation before insert on public.pharmacies for each row execute function public.guard_pro_creation('pharmacie');
drop trigger if exists guard_pro_creation on public.doctors;
create trigger guard_pro_creation before insert on public.doctors for each row execute function public.guard_pro_creation('medecin');
drop trigger if exists guard_pro_creation on public.clinics;
create trigger guard_pro_creation before insert on public.clinics for each row execute function public.guard_pro_creation('clinique');

-- Message clair dès le début : l'autorisation est vérifiée avant le reste du formulaire.
do $$
declare f text; k text;
begin
  foreach f in array array['register_pharmacy', 'register_doctor', 'register_clinic'] loop
    if to_regprocedure('public.' || f || '_checked(jsonb)') is null then
      execute format('alter function public.%I(jsonb) rename to %I', f, f || '_checked');
    end if;
    execute format('revoke execute on function public.%I(jsonb) from public, anon, authenticated', f || '_checked');
    k := case f when 'register_pharmacy' then 'pharmacie' when 'register_doctor' then 'medecin' else 'clinique' end;
    execute format($f$
      create or replace function public.%I(p jsonb) returns uuid
      language plpgsql security definer set search_path = public as $b$
      begin
        perform public.require_auth();
        if not public.has_pro_authorization(%L) then
          raise exception 'PP403: inscription professionnelle réservée : l''administrateur doit d''abord vérifier et autoriser votre compte';
        end if;
        return public.%I(p);
      end $b$;$f$, f, k, f || '_checked');
    execute format('revoke execute on function public.%I(jsonb) from public, anon', f);
    execute format('grant execute on function public.%I(jsonb) to authenticated', f);
  end loop;
end $$;

-- Les demandes d'accès des laboratoires passent désormais par le formulaire de contact
drop policy if exists "pp_lab_requests_insert" on public.lab_access_requests;
revoke insert on public.lab_access_requests from authenticated;

-- ---------------------------------------------------------------------------
-- 3. Demandes de contact des professionnels (aucun compte n'est créé)
-- ---------------------------------------------------------------------------
create table if not exists public.pro_contact_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  kind text not null check (kind in ('pharmacie', 'medecin', 'clinique', 'laboratoire', 'autre')),
  full_name text not null check (char_length(btrim(full_name)) between 2 and 120),
  structure text not null check (char_length(btrim(structure)) between 2 and 160),
  region_id uuid references public.regions(id) on delete set null,
  phone text not null check (public.valid_phone(phone)),
  email text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  authorization_ref text check (char_length(coalesce(authorization_ref, '')) <= 160),
  message text check (char_length(coalesce(message, '')) <= 1000),
  status text not null default 'nouvelle' check (status in ('nouvelle', 'en_cours', 'traitee', 'refusee')),
  admin_note text check (char_length(coalesce(admin_note, '')) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists pro_contact_requests_status on public.pro_contact_requests (status, created_at desc);
alter table public.pro_contact_requests enable row level security;
drop policy if exists "pp_pro_contact_admin" on public.pro_contact_requests;
create policy "pp_pro_contact_admin" on public.pro_contact_requests for select to authenticated using (public.is_admin() or user_id = auth.uid());
revoke all on public.pro_contact_requests from anon, authenticated;
grant select on public.pro_contact_requests to authenticated;

create or replace function public.submit_pro_contact(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare id uuid; uid uuid := auth.uid();
begin
  if uid is not null and (select count(*) from public.pro_contact_requests where user_id = uid and created_at > now() - interval '1 day') >= 3 then
    raise exception 'PP429: trop de demandes aujourd''hui';
  end if;
  if (select count(*) from public.pro_contact_requests where created_at > now() - interval '1 hour') >= 60 then
    raise exception 'PP429: trop de demandes, réessayez plus tard';
  end if;
  insert into public.pro_contact_requests (user_id, kind, full_name, structure, region_id, phone, email, authorization_ref, message)
  values (uid, coalesce(nullif(p ->> 'kind', ''), 'autre'), btrim(p ->> 'full_name'), btrim(p ->> 'structure'),
          nullif(p ->> 'region_id', '')::uuid, p ->> 'phone', nullif(lower(btrim(coalesce(p ->> 'email', ''))), ''),
          nullif(btrim(coalesce(p ->> 'authorization_ref', '')), ''), nullif(btrim(coalesce(p ->> 'message', '')), ''))
  returning pro_contact_requests.id into id;
  return id;
end $$;
revoke execute on function public.submit_pro_contact(jsonb) from public;
grant execute on function public.submit_pro_contact(jsonb) to anon, authenticated;

create or replace function public.admin_pro_contact_status(p_id uuid, p_status text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  if p_status not in ('nouvelle', 'en_cours', 'traitee', 'refusee') then raise exception 'PP422: statut invalide'; end if;
  update public.pro_contact_requests set status = p_status, admin_note = coalesce(nullif(btrim(coalesce(p_note, '')), ''), admin_note), updated_at = now() where id = p_id;
end $$;
revoke execute on function public.admin_pro_contact_status(uuid, text, text) from public, anon;
grant execute on function public.admin_pro_contact_status(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Comptes existants : un profil n'est professionnel que s'il l'est vraiment
-- ---------------------------------------------------------------------------
update public.profiles p set account_type = 'patient'
 where account_type <> 'patient'
   and not exists (select 1 from public.user_roles r where r.user_id = p.id and r.role in ('pharmacist', 'admin'))
   and not exists (select 1 from public.doctors d where d.user_id = p.id)
   and not exists (select 1 from public.clinic_members c where c.user_id = p.id)
   and not exists (select 1 from public.facility_members f where f.user_id = p.id)
   and not exists (select 1 from public.pro_authorizations a where a.user_id = p.id);

-- Les professionnels déjà en place gardent leur accès : on leur donne l'autorisation correspondante
insert into public.pro_authorizations (user_id, kind, note)
select distinct r.user_id, 'pharmacie', 'Pharmacien déjà inscrit avant la 0.22' from public.user_roles r where r.role = 'pharmacist'
on conflict do nothing;
insert into public.pro_authorizations (user_id, kind, note)
select distinct d.user_id, 'medecin', 'Médecin déjà inscrit avant la 0.22' from public.doctors d where d.user_id is not null and not d.is_demo
on conflict do nothing;
insert into public.pro_authorizations (user_id, kind, note)
select distinct c.user_id, 'clinique', 'Établissement déjà inscrit avant la 0.22' from public.clinic_members c
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 5. Identifiants SantéProxi : SP-PH, SP-MD, SP-LB, SP-ET
-- ---------------------------------------------------------------------------
update public.pharmacies set public_code = 'SP-' || substr(public_code, 4) where public_code like 'PP-%';
update public.doctors set public_code = 'SP-' || substr(public_code, 4) where public_code like 'PP-%';
update public.clinics set public_code = 'SP-' || substr(public_code, 4) where public_code like 'PP-%';
update public.facility_listings set public_code = 'SP-' || substr(public_code, 4) where public_code like 'PP-%';
alter table public.pharmacies alter column public_code set default public.next_public_code('SP-PH');
alter table public.doctors alter column public_code set default public.next_public_code('SP-MD');
alter table public.clinics alter column public_code set default public.next_public_code('SP-ET');
create or replace function public.facility_public_code() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.public_code is null then
    new.public_code := public.next_public_code(case when new.kind = 'laboratoire' then 'SP-LB' else 'SP-ET' end);
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Effacement avec le compte
-- ---------------------------------------------------------------------------
create or replace function public.purge_pro_on_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    delete from public.pro_authorizations where user_id = new.id;
    update public.pro_contact_requests set user_id = null where user_id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists purge_pro_on_delete on public.profiles;
create trigger purge_pro_on_delete after update of deleted_at on public.profiles
  for each row execute function public.purge_pro_on_delete();

-- ---------------------------------------------------------------------------
-- 7. Nouveau nom : SantéProxi (contenus publiés et messages automatiques)
--    Les journaux et historiques ne sont pas modifiés.
-- ---------------------------------------------------------------------------
update public.content_pages set body = replace(replace(body, 'PharmaProxi', 'SantéProxi'), 'Votre pharmacie, plus proche de vous', 'Toute la santé, près de chez vous') where body like '%PharmaProxi%' or body like '%Votre pharmacie, plus proche de vous%';
update public.health_articles set body = replace(body::text, 'PharmaProxi', 'SantéProxi')::jsonb where body::text like '%PharmaProxi%';
update public.health_articles set faq = replace(faq::text, 'PharmaProxi', 'SantéProxi')::jsonb where faq::text like '%PharmaProxi%';
update public.health_articles set author_name = replace(author_name, 'PharmaProxi', 'SantéProxi') where author_name like '%PharmaProxi%';
update public.audio_targets set label = replace(label, 'PharmaProxi', 'SantéProxi') where label like '%PharmaProxi%';
update public.audio_targets set script_fr = replace(script_fr, 'PharmaProxi', 'SantéProxi') where script_fr like '%PharmaProxi%';
update public.home_care_providers set source = replace(source, 'PharmaProxi', 'SantéProxi') where source like '%PharmaProxi%';

-- Messages produits par les fonctions (notifications, erreurs, textes)
do $$
declare r record; def text;
begin
  for r in select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.prokind = 'f' and p.prosrc like '%PharmaProxi%' loop
    def := pg_get_functiondef(r.oid);
    execute replace(def, 'PharmaProxi', 'SantéProxi');
  end loop;
end $$;


-- >>> 20261108000100_v023_espace_data_partenaires.sql
-- =============================================================================
-- SantéProxi 0.23 — centres spécialisés, statistiques des établissements,
-- lexique des analyses, SantéProxi Data (évolution, carte, communiqués officiels,
-- validation des données), rendez-vous et résultats chiffrés des laboratoires,
-- documents personnels chiffrés, scanner de médicaments, santé mentale (lignes
-- d'écoute), langues nationales (traductions validées).
--
-- Rien n'est inventé : les spécialités des centres, les codes-barres, les lignes
-- d'écoute, les traductions et les textes du lexique sont saisis ou validés par
-- l'équipe. Les fichiers de santé (résultats, documents) sont chiffrés par le
-- serveur avant d'être stockés et ne sont lus par aucune intelligence artificielle.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Centres spécialisés (diabète, drépanocytose, maternité…)
-- ---------------------------------------------------------------------------
create table if not exists public.care_focus (
  code text primary key check (code ~ '^[a-z0-9_]{2,40}$'),
  label text not null,
  hint text,
  sort int not null default 100
);
alter table public.care_focus enable row level security;
drop policy if exists "pp_care_focus_read" on public.care_focus;
create policy "pp_care_focus_read" on public.care_focus for select to anon, authenticated using (true);
revoke insert, update, delete on public.care_focus from anon, authenticated;
grant select on public.care_focus to anon, authenticated;
insert into public.care_focus (code, label, hint, sort) values
  ('diabete', 'Diabète', 'Suivi du diabète, glycémie, pied diabétique', 10),
  ('drepanocytose', 'Drépanocytose', 'Suivi des enfants et adultes drépanocytaires', 20),
  ('hypertension_coeur', 'Cœur et hypertension', 'Cardiologie, tension artérielle', 30),
  ('cancer', 'Cancers', 'Oncologie, dépistage, traitements', 40),
  ('sante_mentale', 'Santé mentale', 'Psychiatrie, psychologie, addictions', 50),
  ('maternite', 'Maternité et accouchement', 'Consultations prénatales, accouchement', 60),
  ('pediatrie', 'Enfants', 'Pédiatrie, néonatologie, nutrition', 70),
  ('vih', 'VIH', 'Dépistage, traitement et suivi', 80),
  ('tuberculose', 'Tuberculose', 'Dépistage et traitement', 90),
  ('rein_dialyse', 'Reins et dialyse', 'Néphrologie, dialyse', 100),
  ('yeux', 'Yeux', 'Ophtalmologie', 110),
  ('dents', 'Dents', 'Soins dentaires', 120),
  ('orl', 'Oreilles, nez, gorge', 'ORL', 130),
  ('handicap_reeducation', 'Rééducation et handicap', 'Kinésithérapie, appareillage', 140),
  ('urgences_24h', 'Urgences 24 h/24', 'Accueil des urgences jour et nuit', 150),
  ('vaccination', 'Vaccination', 'Centres de vaccination', 160)
on conflict (code) do nothing;

create table if not exists public.facility_focus (
  id uuid primary key default gen_random_uuid(),
  focus_code text not null references public.care_focus(code) on delete cascade,
  clinic_id uuid references public.clinics(id) on delete cascade,
  facility_id uuid references public.facility_listings(id) on delete cascade,
  source text not null check (char_length(btrim(source)) between 3 and 200),
  verified_at date,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (num_nonnulls(clinic_id, facility_id) = 1)
);
create unique index if not exists facility_focus_unique on public.facility_focus (focus_code, coalesce(clinic_id, facility_id));
alter table public.facility_focus enable row level security;
drop policy if exists "pp_facility_focus_read" on public.facility_focus;
create policy "pp_facility_focus_read" on public.facility_focus for select to anon, authenticated using (true);
drop policy if exists "pp_facility_focus_admin" on public.facility_focus;
create policy "pp_facility_focus_admin" on public.facility_focus for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.facility_focus from anon;
grant select on public.facility_focus to anon;
grant select, insert, update, delete on public.facility_focus to authenticated;

create or replace function public.specialized_centres(p_focus text, p_region uuid default null, p_limit int default 100)
returns table (kind text, id uuid, name text, category text, city text, address text, phone text, latitude double precision, longitude double precision,
               source text, verified_at date, link text)
language sql stable security definer set search_path = public as $$
  select 'clinique', c.id, c.name, c.kind, coalesce(co.name, r.name), c.address, c.phone, c.latitude, c.longitude, ff.source, ff.verified_at, '/cliniques/' || c.id
    from public.facility_focus ff join public.clinics c on c.id = ff.clinic_id and c.status = 'verified' and not c.is_demo
    left join public.communes co on co.id = c.commune_id left join public.regions r on r.id = c.region_id
   where ff.focus_code = p_focus and (p_region is null or c.region_id = p_region)
  union all
  select case when f.kind = 'laboratoire' then 'laboratoire' else 'etablissement' end, f.id, f.name, f.kind, coalesce(f.city_label, r.name), f.address, f.phone,
         f.latitude, f.longitude, ff.source, ff.verified_at, case when f.kind = 'laboratoire' then '/laboratoires/fiche/' || f.id else null end
    from public.facility_focus ff join public.facility_listings f on f.id = ff.facility_id and f.is_published
    left join public.regions r on r.id = f.region_id
   where ff.focus_code = p_focus and (p_region is null or f.region_id = p_region)
  order by 3 limit greatest(1, least(p_limit, 300));
$$;
grant execute on function public.specialized_centres(text, uuid, int) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Statistiques de consultation des fiches (aucune donnée personnelle)
-- ---------------------------------------------------------------------------
create table if not exists public.listing_daily_stats (
  entity_kind text not null check (entity_kind in ('pharmacie', 'medecin', 'clinique', 'laboratoire', 'etablissement')),
  entity_id uuid not null,
  day date not null default current_date,
  views int not null default 0,
  calls int not null default 0,
  directions int not null default 0,
  requests int not null default 0,
  primary key (entity_kind, entity_id, day)
);
alter table public.listing_daily_stats enable row level security;
revoke all on public.listing_daily_stats from anon, authenticated;

create or replace function public.track_listing_event(p_kind text, p_id uuid, p_event text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_kind not in ('pharmacie', 'medecin', 'clinique', 'laboratoire', 'etablissement') or p_event not in ('view', 'call', 'directions', 'request') then return; end if;
  insert into public.listing_daily_stats (entity_kind, entity_id, day, views, calls, directions, requests)
  values (p_kind, p_id, current_date, (p_event = 'view')::int, (p_event = 'call')::int, (p_event = 'directions')::int, (p_event = 'request')::int)
  on conflict (entity_kind, entity_id, day) do update set
    views = listing_daily_stats.views + excluded.views, calls = listing_daily_stats.calls + excluded.calls,
    directions = listing_daily_stats.directions + excluded.directions, requests = listing_daily_stats.requests + excluded.requests;
end $$;
revoke execute on function public.track_listing_event(text, uuid, text) from public;
grant execute on function public.track_listing_event(text, uuid, text) to anon, authenticated;

create or replace function public.can_see_listing_stats(p_kind text, p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or case p_kind
    when 'pharmacie' then public.is_pharmacy_member(p_id)
    when 'medecin' then exists (select 1 from public.doctors d where d.id = p_id and d.user_id = auth.uid())
    when 'clinique' then public.is_clinic_member(p_id)
    else public.is_facility_member(p_id) end;
$$;

create or replace function public.my_listing_stats(p_kind text, p_id uuid, p_days int default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare d int := greatest(7, least(coalesce(p_days, 30), 365));
begin
  perform public.require_auth();
  if not public.can_see_listing_stats(p_kind, p_id) then raise exception 'PP403: statistiques réservées à l''établissement' using errcode = '42501'; end if;
  return jsonb_build_object(
    'days', d,
    'total', (select jsonb_build_object('views', coalesce(sum(views), 0), 'calls', coalesce(sum(calls), 0), 'directions', coalesce(sum(directions), 0), 'requests', coalesce(sum(requests), 0))
                from public.listing_daily_stats where entity_kind = p_kind and entity_id = p_id and day > current_date - d),
    'previous', (select jsonb_build_object('views', coalesce(sum(views), 0), 'calls', coalesce(sum(calls), 0))
                from public.listing_daily_stats where entity_kind = p_kind and entity_id = p_id and day <= current_date - d and day > current_date - 2 * d),
    'weeks', coalesce((select jsonb_agg(jsonb_build_object('week', w, 'views', v, 'calls', c) order by w) from (
                select date_trunc('week', day)::date w, sum(views) v, sum(calls) c from public.listing_daily_stats
                 where entity_kind = p_kind and entity_id = p_id and day > current_date - d group by 1) x), '[]'::jsonb));
end $$;
revoke execute on function public.my_listing_stats(text, uuid, int) from public, anon;
grant execute on function public.my_listing_stats(text, uuid, int) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Lexique des analyses (textes publiés seulement après validation)
-- ---------------------------------------------------------------------------
alter table public.medical_exams add column if not exists lay_text text check (char_length(coalesce(lay_text, '')) <= 900);
alter table public.medical_exams add column if not exists lay_status text not null default 'brouillon' check (lay_status in ('brouillon', 'valide'));
alter table public.medical_exams add column if not exists lay_validated_by text check (char_length(coalesce(lay_validated_by, '')) <= 160);
alter table public.medical_exams add column if not exists lay_validated_at date;

create or replace function public.admin_save_lexicon(p_exam uuid, p_text text, p_validated_by text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  if char_length(btrim(coalesce(p_text, ''))) < 20 then raise exception 'PP422: texte trop court'; end if;
  update public.medical_exams set lay_text = btrim(p_text),
    lay_status = case when nullif(btrim(coalesce(p_validated_by, '')), '') is null then 'brouillon' else 'valide' end,
    lay_validated_by = nullif(btrim(coalesce(p_validated_by, '')), ''),
    lay_validated_at = case when nullif(btrim(coalesce(p_validated_by, '')), '') is null then null else current_date end
  where id = p_exam;
  perform public.log_audit('lexicon_save', 'medical_exam', p_exam::text, jsonb_build_object('validated', p_validated_by is not null));
end $$;
revoke execute on function public.admin_save_lexicon(uuid, text, text) from public, anon;
grant execute on function public.admin_save_lexicon(uuid, text, text) to authenticated;

-- Brouillons rédigés par l'équipe : à relire et valider par un biologiste avant publication.
update public.medical_exams m set lay_text = x.t
  from (values
  ('nfs', 'Compte les globules rouges, les globules blancs et les plaquettes du sang. Le médecin la demande souvent en cas de fatigue, de fièvre, de pâleur ou pour un bilan général. Prise de sang au bras.'),
  ('glycemie', 'Mesure le sucre (glucose) dans le sang, le matin avant de manger. Sert à rechercher ou suivre un diabète. Il faut être à jeun : demandez au laboratoire combien d''heures avant.'),
  ('glycemie_pp', 'Mesure le sucre dans le sang environ deux heures après un repas. Complète la glycémie à jeun pour le suivi du diabète. Le laboratoire vous indique l''heure exacte du prélèvement.'),
  ('hba1c', 'Reflète la moyenne du sucre dans le sang sur les deux à trois derniers mois. Utilisée pour suivre un diabète. Il n''est en général pas nécessaire d''être à jeun.'),
  ('hgpo', 'Mesure la façon dont le corps gère le sucre : on boit une boisson sucrée puis on fait plusieurs prises de sang. Utilisée notamment pendant la grossesse. L''examen dure environ deux heures.'),
  ('groupe_sanguin', 'Détermine votre groupe sanguin (A, B, AB ou O) et le rhésus (positif ou négatif). Indispensable avant une transfusion, une opération ou pendant la grossesse. Un résultat à garder toute la vie.'),
  ('paludisme', 'Recherche le parasite du paludisme dans le sang, par une goutte de sang au doigt (test rapide) ou au bras (goutte épaisse). À faire dès qu''il y a de la fièvre, surtout chez l''enfant.'),
  ('crp', 'Mesure une protéine qui augmente lors d''une inflammation ou d''une infection. Aide le médecin à suivre une maladie ou l''effet d''un traitement. Prise de sang au bras.'),
  ('vs', 'Mesure la vitesse à laquelle les globules rouges tombent au fond d''un tube. Elle peut augmenter lors d''inflammations. Le médecin l''interprète avec les autres examens.'),
  ('creatinine', 'Mesure une substance éliminée par les reins. Sert à vérifier que les reins fonctionnent bien, par exemple en cas de diabète, d''hypertension ou avant certains médicaments.'),
  ('uree', 'Mesure un déchet éliminé par les reins. Souvent demandée avec la créatinine pour évaluer le fonctionnement des reins.'),
  ('ionogramme', 'Mesure le sodium, le potassium et d''autres sels minéraux du sang. Utile en cas de diarrhée, de vomissements, de déshydratation ou de traitement par certains médicaments.'),
  ('transaminases', 'Mesure deux enzymes (ASAT et ALAT) qui renseignent sur l''état du foie. Demandées en cas de suspicion d''hépatite ou pour surveiller certains traitements.'),
  ('gamma_gt', 'Mesure une enzyme du foie et des voies biliaires. Le médecin l''interprète avec les autres analyses du foie.'),
  ('bilirubine', 'Mesure un pigment jaune issu de la destruction des globules rouges. Aide à comprendre une jaunisse (yeux ou peau jaunes), chez l''adulte comme chez le nouveau-né.'),
  ('bilan_lipidique', 'Mesure le cholestérol et les triglycérides (graisses du sang). Sert à évaluer le risque pour le cœur et les vaisseaux. Il faut souvent être à jeun : demandez au laboratoire.'),
  ('acide_urique', 'Mesure l''acide urique dans le sang. Le médecin le demande notamment en cas de douleurs articulaires évoquant la goutte.'),
  ('aghbs', 'Recherche le virus de l''hépatite B dans le sang. Recommandé pendant la grossesse et lors d''un dépistage. Un résultat positif doit être expliqué par un médecin, qui propose le suivi adapté.'),
  ('charge_virale_vhb', 'Mesure la quantité de virus de l''hépatite B dans le sang. Sert au suivi des personnes porteuses du virus et à décider d''un traitement.'),
  ('hepatite_c', 'Recherche une infection par le virus de l''hépatite C. Le résultat est expliqué par le médecin, qui demande d''autres examens si besoin.'),
  ('vih', 'Recherche une infection par le VIH. Le dépistage est confidentiel. Un résultat positif est toujours confirmé par un second test et expliqué par un professionnel ; des traitements efficaces existent.'),
  ('charge_virale_vih', 'Mesure la quantité de VIH dans le sang des personnes suivies. Elle montre si le traitement est efficace.'),
  ('cd4', 'Compte certaines cellules de défense du corps (lymphocytes CD4). Utilisé dans le suivi des personnes vivant avec le VIH.'),
  ('syphilis', 'Recherche une infection par la syphilis, une infection sexuellement transmissible qui se soigne. Recommandé pendant la grossesse.'),
  ('widal', 'Recherche des anticorps liés à la fièvre typhoïde. Son interprétation est délicate : seul le médecin peut conclure, souvent avec d''autres examens comme l''hémoculture.'),
  ('hemoculture', 'Recherche des microbes dans le sang en le mettant en culture. Demandée en cas de fièvre importante. Le résultat peut prendre plusieurs jours.'),
  ('ecbu', 'Analyse les urines pour rechercher une infection urinaire et le microbe en cause. Il faut recueillir les urines proprement, de préférence le matin : le laboratoire explique comment.'),
  ('bandelette_urinaire', 'Test rapide des urines avec une bandelette qui change de couleur. Il oriente vers une infection, du sucre ou du sang dans les urines.'),
  ('selles', 'Recherche des parasites dans les selles (vers, amibes…). Le laboratoire indique comment recueillir l''échantillon.'),
  ('coproculture', 'Recherche des microbes dans les selles, par exemple en cas de diarrhée qui dure.'),
  ('tsh', 'Mesure une hormone qui commande la glande thyroïde. Premier examen pour vérifier le fonctionnement de la thyroïde.'),
  ('t3_t4', 'Mesure les hormones fabriquées par la thyroïde. Souvent demandées en complément de la TSH.'),
  ('bhcg', 'Recherche dans le sang l''hormone de la grossesse. Permet de confirmer une grossesse débutante.'),
  ('electrophorese_hb', 'Analyse les différents types d''hémoglobine du sang. C''est l''examen qui permet de savoir si l''on est porteur de la drépanocytose (AS) ou malade (SS). Recommandé avant le mariage.'),
  ('test_emmel', 'Test de dépistage simple de la drépanocytose. Un résultat positif doit être confirmé par l''électrophorèse de l''hémoglobine.'),
  ('tp_inr', 'Mesure la capacité du sang à coaguler. Sert à surveiller certains traitements anticoagulants ou avant une opération.'),
  ('fer_ferritine', 'Mesure le fer et les réserves de fer du corps. Utile en cas d''anémie ou de fatigue, notamment pendant la grossesse.'),
  ('psa', 'Mesure une protéine fabriquée par la prostate. Le médecin l''utilise pour surveiller la prostate chez l''homme ; un résultat élevé n''est pas forcément un cancer et doit être discuté avec lui.'),
  ('frottis', 'Prélèvement de cellules du col de l''utérus, fait par un professionnel. Sert à dépister tôt les lésions qui peuvent mener au cancer du col.'),
  ('bk_crachat', 'Recherche le microbe de la tuberculose dans les crachats. Le laboratoire explique comment recueillir les crachats, souvent le matin.'),
  ('microalbuminurie', 'Recherche de petites quantités de protéines dans les urines. Permet de surveiller les reins chez les personnes diabétiques ou hypertendues.'),
  ('calcemie', 'Mesure le calcium dans le sang, important pour les os, les muscles et le cœur.'),
  ('vitamine_d', 'Mesure la vitamine D dans le sang, utile pour les os.'),
  ('spermogramme', 'Analyse le sperme (nombre et mobilité des spermatozoïdes). Demandé dans le bilan d''un couple qui n''arrive pas à avoir d''enfant. Le laboratoire donne les consignes à respecter.')
  ) as x(code, t)
 where m.code = x.code and m.lay_text is null;

-- ---------------------------------------------------------------------------
-- 4. SantéProxi Data : évolution du référentiel, carte, communiqués, validation
-- ---------------------------------------------------------------------------
create or replace function public.authority_registry_trend(p_region uuid default null, p_months int default 12)
returns table (month date, pharmacies_verified bigint, pharmacies_listed bigint, facilities bigint, labs bigint, doctors bigint, exams_with_price bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.authority_require('stats:registry_trend', jsonb_build_object('region', p_region));
  return query
  select m::date,
    (select count(*) from public.pharmacies p where p.status = 'verified' and not p.is_demo and coalesce(p.verified_at, p.created_at) < m + interval '1 month' and (p_region is null or p.region_id = p_region)),
    (select count(*) from public.pharmacy_listings l where l.is_published and l.created_at < m + interval '1 month' and (p_region is null or l.region_id = p_region)),
    (select count(*) from public.facility_listings f where f.is_published and f.kind <> 'laboratoire' and f.created_at < m + interval '1 month' and (p_region is null or f.region_id = p_region)),
    (select count(*) from public.facility_listings f where f.is_published and f.kind = 'laboratoire' and f.created_at < m + interval '1 month' and (p_region is null or f.region_id = p_region)),
    (select count(*) from public.doctors d where d.status = 'verified' and not d.is_demo and coalesce(d.verified_at, d.created_at) < m + interval '1 month'),
    (select count(*) from public.facility_exams fe join public.facility_listings f on f.id = fe.facility_id
      where fe.price_xof is not null and fe.updated_at < m + interval '1 month' and (p_region is null or f.region_id = p_region))
  from generate_series(date_trunc('month', current_date) - make_interval(months => greatest(1, least(p_months, 36)) - 1), date_trunc('month', current_date), interval '1 month') m;
end $$;

create or replace function public.authority_map_points(p_region uuid default null)
returns table (kind text, name text, latitude double precision, longitude double precision)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.authority_require('stats:map', jsonb_build_object('region', p_region));
  return query
  select 'pharmacie'::text, p.name, p.latitude, p.longitude from public.pharmacies p
   where p.status = 'verified' and not p.is_demo and p.latitude is not null and (p_region is null or p.region_id = p_region)
  union all
  select 'officine', l.name, l.latitude, l.longitude from public.pharmacy_listings l
   where l.is_published and l.claimed_pharmacy_id is null and l.latitude is not null and (p_region is null or l.region_id = p_region)
  union all
  select case when f.kind = 'laboratoire' then 'laboratoire' else 'etablissement' end, f.name, f.latitude, f.longitude from public.facility_listings f
   where f.is_published and f.latitude is not null and (p_region is null or f.region_id = p_region)
  union all
  select 'clinique', c.name, c.latitude, c.longitude from public.clinics c
   where c.status = 'verified' and not c.is_demo and c.latitude is not null and (p_region is null or c.region_id = p_region)
  limit 20000;
end $$;

-- Communiqués officiels publiés par les institutions sous convention
alter table public.authority_members add column if not exists can_publish boolean not null default false;

create table if not exists public.official_communiques (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references public.profiles(id) on delete set null,
  organisation text not null check (char_length(btrim(organisation)) between 2 and 120),
  title text not null check (char_length(btrim(title)) between 5 and 160),
  body text not null check (char_length(btrim(body)) between 20 and 4000),
  link text check (link is null or link ~ '^https?://'),
  region_id uuid references public.regions(id) on delete set null,
  status text not null default 'publie' check (status in ('publie', 'retire')),
  published_at timestamptz not null default now()
);
create index if not exists official_communiques_pub on public.official_communiques (status, published_at desc);
alter table public.official_communiques enable row level security;
drop policy if exists "pp_communiques_read" on public.official_communiques;
create policy "pp_communiques_read" on public.official_communiques for select to anon, authenticated using (status = 'publie' or public.is_admin() or author_id = auth.uid());
revoke insert, update, delete on public.official_communiques from anon, authenticated;
grant select on public.official_communiques to anon, authenticated;

create or replace function public.authority_publish(p_title text, p_body text, p_link text default null, p_region uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_auth(); org text; v_id uuid;
begin
  select organisation into org from public.authority_members where user_id = uid and active and can_publish;
  if org is null and not public.is_admin() then raise exception 'PP403: publication réservée aux institutions sous convention' using errcode = '42501'; end if;
  insert into public.official_communiques (author_id, organisation, title, body, link, region_id)
  values (uid, coalesce(org, 'SantéProxi'), btrim(p_title), btrim(p_body), nullif(btrim(coalesce(p_link, '')), ''), p_region)
  returning id into v_id;
  perform public.log_audit('communique_publish', 'official_communique', v_id::text, '{}'::jsonb);
  return v_id;
exception when check_violation then raise exception 'PP422: vérifiez le titre (5 caractères minimum), le texte (20 minimum) et le lien (https://…)';
end $$;

create or replace function public.withdraw_communique(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.official_communiques set status = 'retire' where id = p_id and (author_id = auth.uid() or public.is_admin());
  if not found then raise exception 'PP403: communiqué introuvable'; end if;
end $$;

create or replace function public.admin_set_can_publish(p_user uuid, p_value boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  update public.authority_members set can_publish = coalesce(p_value, false) where user_id = p_user;
  perform public.log_audit('authority_can_publish', 'profile', p_user::text, jsonb_build_object('value', p_value));
end $$;

-- Validation des données du référentiel par les institutions
create table if not exists public.data_validation_reports (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references public.profiles(id) on delete set null,
  organisation text,
  public_code text not null check (public_code ~ '^SP-(PH|MD|LB|ET)-[0-9]{6}$'),
  verdict text not null check (verdict in ('confirme', 'a_corriger', 'ferme', 'inconnu')),
  comment text check (char_length(coalesce(comment, '')) <= 1000),
  status text not null default 'nouveau' check (status in ('nouveau', 'traite')),
  created_at timestamptz not null default now()
);
alter table public.data_validation_reports enable row level security;
drop policy if exists "pp_data_validation_read" on public.data_validation_reports;
create policy "pp_data_validation_read" on public.data_validation_reports for select to authenticated using (public.is_admin() or author_id = auth.uid());
revoke all on public.data_validation_reports from anon, authenticated;
grant select on public.data_validation_reports to authenticated;

create or replace function public.authority_validate_data(p_code text, p_verdict text, p_comment text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := public.authority_require('data:validate', jsonb_build_object('code', p_code)); org text; v_id uuid; c text := upper(btrim(p_code));
begin
  select organisation into org from public.authority_members where user_id = uid;
  if not exists (select 1 from public.pharmacies where public_code = c union all select 1 from public.doctors where public_code = c
                 union all select 1 from public.clinics where public_code = c union all select 1 from public.facility_listings where public_code = c) then
    raise exception 'PP404: aucun établissement avec cet identifiant';
  end if;
  insert into public.data_validation_reports (author_id, organisation, public_code, verdict, comment)
  values (uid, org, c, p_verdict, nullif(btrim(coalesce(p_comment, '')), '')) returning id into v_id;
  return v_id;
exception when check_violation then raise exception 'PP422: identifiant ou avis invalide';
end $$;

create or replace function public.admin_close_data_report(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  update public.data_validation_reports set status = 'traite' where id = p_id;
end $$;

revoke execute on function public.authority_registry_trend(uuid, int), public.authority_map_points(uuid), public.authority_publish(text, text, text, uuid),
  public.withdraw_communique(uuid), public.admin_set_can_publish(uuid, boolean), public.authority_validate_data(text, text, text), public.admin_close_data_report(uuid) from public, anon;
grant execute on function public.authority_registry_trend(uuid, int), public.authority_map_points(uuid), public.authority_publish(text, text, text, uuid),
  public.withdraw_communique(uuid), public.admin_set_can_publish(uuid, boolean), public.authority_validate_data(text, text, text), public.admin_close_data_report(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Laboratoires : rendez-vous au laboratoire et consentement aux résultats
-- ---------------------------------------------------------------------------
alter table public.lab_home_service add column if not exists appointments_enabled boolean not null default false;
alter table public.lab_home_service add column if not exists appointment_hours text check (char_length(coalesce(appointment_hours, '')) <= 200);
alter table public.lab_home_service add column if not exists results_enabled boolean not null default false;
-- un laboratoire peut proposer les rendez-vous sans le domicile : la ligne existe dès que l'un des deux est réglé
alter table public.home_sampling_requests add column if not exists mode text not null default 'domicile';
alter table public.home_sampling_requests drop constraint if exists home_sampling_requests_mode_check;
alter table public.home_sampling_requests add constraint home_sampling_requests_mode_check check (mode in ('domicile', 'laboratoire'));
alter table public.home_sampling_requests add column if not exists results_consent boolean not null default false;
alter table public.home_sampling_requests alter column address drop not null;
alter table public.home_sampling_requests drop constraint if exists home_sampling_address_needed;
alter table public.home_sampling_requests add constraint home_sampling_address_needed check (mode = 'laboratoire' or address is not null);

create or replace function public.lab_save_options(p_facility uuid, p_appointments boolean, p_hours text, p_results boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_facility_member(p_facility) then raise exception 'PP403: réservé aux membres de ce laboratoire' using errcode = '42501'; end if;
  insert into public.lab_home_service (facility_id, enabled, appointments_enabled, appointment_hours, results_enabled)
  values (p_facility, false, coalesce(p_appointments, false), nullif(btrim(coalesce(p_hours, '')), ''), coalesce(p_results, false))
  on conflict (facility_id) do update set appointments_enabled = excluded.appointments_enabled,
    appointment_hours = excluded.appointment_hours, results_enabled = excluded.results_enabled, updated_at = now();
end $$;
revoke execute on function public.lab_save_options(uuid, boolean, text, boolean) from public, anon;
grant execute on function public.lab_save_options(uuid, boolean, text, boolean) to authenticated;

create or replace function public.request_home_sampling(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_auth(); fac uuid := (p ->> 'facility_id')::uuid; v_id uuid; ex uuid[];
        md text := coalesce(nullif(p ->> 'mode', ''), 'domicile');
begin
  if md = 'laboratoire' then
    if not exists (select 1 from public.lab_home_service s join public.facility_listings f on f.id = s.facility_id and f.is_published where s.facility_id = fac and s.appointments_enabled) then
      raise exception 'PP409: ce laboratoire ne prend pas encore de rendez-vous sur SantéProxi';
    end if;
  elsif not exists (select 1 from public.lab_home_service s join public.facility_listings f on f.id = s.facility_id and f.is_published where s.facility_id = fac and s.enabled) then
    raise exception 'PP409: ce laboratoire ne propose pas de prélèvement à domicile';
  end if;
  if (select count(*) from public.home_sampling_requests where user_id = uid and created_at > now() - interval '1 day') >= 3 then
    raise exception 'PP429: 3 demandes par jour au maximum';
  end if;
  ex := coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(coalesce(p -> 'exam_ids', '[]'::jsonb)) x), '{}');
  if exists (select 1 from unnest(ex) e where not exists (select 1 from public.medical_exams m where m.id = e)) then raise exception 'PP422: analyse inconnue'; end if;
  insert into public.home_sampling_requests (user_id, facility_id, mode, exam_ids, other_exams, patient_name, patient_age, for_relative, address, region_id, phone,
    preferred_date, slot, has_prescription, fasting_known, notes, results_consent)
  values (uid, fac, md, ex, nullif(btrim(p ->> 'other_exams'), ''), btrim(p ->> 'patient_name'), nullif(p ->> 'patient_age', '')::int,
    coalesce((p ->> 'for_relative')::boolean, false), case when md = 'laboratoire' then null else btrim(p ->> 'address') end,
    nullif(p ->> 'region_id', '')::uuid, btrim(p ->> 'phone'),
    (p ->> 'preferred_date')::date, coalesce(nullif(p ->> 'slot', ''), 'matin'), coalesce((p ->> 'has_prescription')::boolean, false),
    coalesce((p ->> 'fasting_known')::boolean, false), nullif(btrim(p ->> 'notes'), ''), coalesce((p ->> 'results_consent')::boolean, false))
  returning id into v_id;
  insert into public.notifications (user_id, kind, title, body, link)
  select m.user_id, 'laboratoire',
         case when md = 'laboratoire' then 'Nouvelle demande de rendez-vous au laboratoire' else 'Nouvelle demande de prélèvement à domicile' end,
         'Une demande attend votre réponse.', '/laboratoire/prelevements'
    from public.facility_members m where m.facility_id = fac;
  perform public.track_listing_event('laboratoire', fac, 'request');
  return v_id;
exception
  when check_violation then raise exception 'PP422: vérifiez le nom, l''adresse, le téléphone, la date et les analyses';
  when invalid_text_representation or invalid_datetime_format then raise exception 'PP422: informations invalides';
end $$;

create or replace function public.lab_update_sampling(p_id uuid, p_status text, p_scheduled timestamptz default null, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare r public.home_sampling_requests; lbl text; what text;
begin
  select * into r from public.home_sampling_requests where id = p_id for update;
  if not found or not public.is_facility_member(r.facility_id) then raise exception 'PP403: demande introuvable' using errcode = '42501'; end if;
  if p_status not in ('acceptee', 'planifiee', 'prelevee', 'terminee', 'refusee') then raise exception 'PP422: statut invalide'; end if;
  if r.status in ('annulee', 'terminee', 'refusee') then raise exception 'PP409: cette demande est close'; end if;
  update public.home_sampling_requests set status = p_status, scheduled_at = coalesce(p_scheduled, scheduled_at),
    lab_note = coalesce(nullif(btrim(coalesce(p_note, '')), ''), lab_note), updated_at = now() where id = p_id;
  what := case when r.mode = 'laboratoire' then 'rendez-vous au laboratoire' else 'prélèvement à domicile' end;
  lbl := case p_status when 'acceptee' then 'Votre demande de ' || what || ' est acceptée'
    when 'planifiee' then 'Votre ' || what || ' est planifié' when 'prelevee' then 'Prélèvement effectué'
    when 'terminee' then 'Votre demande de ' || what || ' est terminée' else 'Votre demande de ' || what || ' n''a pas pu être acceptée' end;
  perform public.notify_user(r.user_id, 'laboratoire', lbl,
    case when p_status = 'planifiee' and coalesce(p_scheduled, r.scheduled_at) is not null
      then 'Rendez-vous le ' || to_char(coalesce(p_scheduled, r.scheduled_at) at time zone 'utc', 'DD/MM/YYYY à HH24"h"MI') || '.' else 'Ouvrez SantéProxi pour voir le détail.' end,
    null, '/compte/prelevements');
end $$;

-- ---------------------------------------------------------------------------
-- 6. Résultats d'analyses envoyés par le laboratoire (fichier chiffré)
-- ---------------------------------------------------------------------------
create table if not exists public.lab_results (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.home_sampling_requests(id) on delete cascade,
  facility_id uuid not null references public.facility_listings(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null unique,
  file_name text check (char_length(coalesce(file_name, '')) <= 160),
  mime text not null check (mime in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  size_bytes int not null check (size_bytes between 1 and 10485760),
  note text check (char_length(coalesce(note, '')) <= 500),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  first_opened_at timestamptz
);
create index if not exists lab_results_user on public.lab_results (user_id, created_at desc);
alter table public.lab_results enable row level security;
drop policy if exists "pp_lab_results_read" on public.lab_results;
create policy "pp_lab_results_read" on public.lab_results for select to authenticated using (user_id = auth.uid() or public.is_facility_member(facility_id));
revoke all on public.lab_results from anon, authenticated;
grant select on public.lab_results to authenticated;

create or replace function public.lab_can_upload_result(p_request uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.home_sampling_requests r join public.lab_home_service s on s.facility_id = r.facility_id and s.results_enabled
                  where r.id = p_request and r.results_consent and r.status in ('prelevee', 'terminee', 'planifiee', 'acceptee')
                    and public.is_facility_member(r.facility_id));
$$;

create or replace function public.lab_add_result(p_request uuid, p_path text, p_name text, p_mime text, p_size int, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare r public.home_sampling_requests; v_id uuid;
begin
  select * into r from public.home_sampling_requests where id = p_request;
  if not found or not public.lab_can_upload_result(p_request) then
    raise exception 'PP403: envoi impossible : le patient doit avoir accepté de recevoir ses résultats sur SantéProxi' using errcode = '42501';
  end if;
  if p_path !~ ('^' || r.facility_id::text || '/' || r.id::text || '/[0-9a-f-]{36}\.bin$') then raise exception 'PP422: fichier invalide'; end if;
  insert into public.lab_results (request_id, facility_id, user_id, storage_path, file_name, mime, size_bytes, note, created_by)
  values (r.id, r.facility_id, r.user_id, p_path, left(p_name, 160), p_mime, p_size, nullif(btrim(coalesce(p_note, '')), ''), auth.uid())
  returning id into v_id;
  perform public.notify_user(r.user_id, 'laboratoire', 'Vos résultats d''analyses sont disponibles',
    'Ouvrez SantéProxi pour les consulter. Faites-les interpréter par votre médecin.', null, '/compte/resultats');
  perform public.log_audit('lab_result_add', 'lab_result', v_id::text, jsonb_build_object('request', r.id));
  return v_id;
end $$;

create or replace function public.mark_result_opened(p_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.lab_results set first_opened_at = coalesce(first_opened_at, now()) where id = p_id and user_id = auth.uid();
$$;

create or replace function public.delete_lab_result(p_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare p text;
begin
  delete from public.lab_results where id = p_id and (user_id = auth.uid() or public.is_facility_member(facility_id)) returning storage_path into p;
  if p is null then raise exception 'PP404: résultat introuvable'; end if;
  return p;
end $$;
revoke execute on function public.lab_add_result(uuid, text, text, text, int, text), public.mark_result_opened(uuid), public.delete_lab_result(uuid) from public, anon;
grant execute on function public.lab_add_result(uuid, text, text, text, int, text), public.mark_result_opened(uuid), public.delete_lab_result(uuid) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('lab-results', 'lab-results', false, 11534336, array['application/octet-stream'])
on conflict (id) do nothing;
drop policy if exists "pp_lab_results_insert" on storage.objects;
create policy "pp_lab_results_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'lab-results' and public.lab_can_upload_result(((storage.foldername(name))[2])::uuid)
              and exists (select 1 from public.home_sampling_requests r where r.id = ((storage.foldername(name))[2])::uuid and r.facility_id::text = (storage.foldername(name))[1]));
drop policy if exists "pp_lab_results_select" on storage.objects;
create policy "pp_lab_results_select" on storage.objects for select to authenticated
  using (bucket_id = 'lab-results' and exists (select 1 from public.lab_results x where x.storage_path = name and (x.user_id = auth.uid() or public.is_facility_member(x.facility_id))));
drop policy if exists "pp_lab_results_delete" on storage.objects;
create policy "pp_lab_results_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'lab-results' and (public.is_facility_member(((storage.foldername(name))[1])::uuid)
         or exists (select 1 from public.home_sampling_requests r where r.id = ((storage.foldername(name))[2])::uuid and r.user_id = auth.uid())));

-- ---------------------------------------------------------------------------
-- 7. Documents personnels du dossier santé (fichiers chiffrés, visibles par le seul titulaire)
-- ---------------------------------------------------------------------------
create table if not exists public.record_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  person_id uuid not null references public.record_persons(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 2 and 120),
  doc_kind text not null default 'autre' check (doc_kind in ('ordonnance', 'resultat', 'compte_rendu', 'certificat', 'vaccination', 'autre')),
  doc_date date,
  storage_path text not null unique,
  mime text not null check (mime in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  size_bytes int not null check (size_bytes between 1 and 10485760),
  created_at timestamptz not null default now()
);
create index if not exists record_documents_person on public.record_documents (person_id, created_at desc);
alter table public.record_documents enable row level security;
drop policy if exists "pp_record_documents_owner" on public.record_documents;
create policy "pp_record_documents_owner" on public.record_documents for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists (select 1 from public.record_persons p where p.id = person_id and p.owner_id = auth.uid())
              and storage_path like auth.uid()::text || '/%');
revoke all on public.record_documents from anon;
grant select, insert, delete on public.record_documents to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('personal-documents', 'personal-documents', false, 11534336, array['application/octet-stream'])
on conflict (id) do nothing;
drop policy if exists "pp_personal_docs_insert" on storage.objects;
create policy "pp_personal_docs_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'personal-documents' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "pp_personal_docs_select" on storage.objects;
create policy "pp_personal_docs_select" on storage.objects for select to authenticated
  using (bucket_id = 'personal-documents' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "pp_personal_docs_delete" on storage.objects;
create policy "pp_personal_docs_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'personal-documents' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- 8. Scanner de médicaments : propositions de codes-barres (validées par l'équipe)
-- ---------------------------------------------------------------------------
create table if not exists public.gtin_suggestions (
  id uuid primary key default gen_random_uuid(),
  code text not null check (code ~ '^[0-9]{8,14}$'),
  catalog_id uuid not null references public.medicine_catalog(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  status text not null default 'nouvelle' check (status in ('nouvelle', 'acceptee', 'refusee')),
  created_at timestamptz not null default now(),
  unique (code, catalog_id)
);
alter table public.gtin_suggestions enable row level security;
drop policy if exists "pp_gtin_suggestions_admin" on public.gtin_suggestions;
create policy "pp_gtin_suggestions_admin" on public.gtin_suggestions for select to authenticated using (public.is_admin() or user_id = auth.uid());
revoke all on public.gtin_suggestions from anon, authenticated;
grant select on public.gtin_suggestions to authenticated;

create or replace function public.suggest_gtin(p_code text, p_catalog uuid)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_auth();
begin
  if (select count(*) from public.gtin_suggestions where user_id = uid and created_at > now() - interval '1 day') >= 10 then raise exception 'PP429: trop de propositions aujourd''hui'; end if;
  if exists (select 1 from public.medicine_identifiers where id_type = 'gtin' and value = btrim(p_code)) then raise exception 'PP409: ce code est déjà connu'; end if;
  insert into public.gtin_suggestions (code, catalog_id, user_id) values (btrim(p_code), p_catalog, uid) on conflict do nothing;
exception when check_violation then raise exception 'PP422: code-barres invalide (8 à 14 chiffres)';
end $$;

create or replace function public.admin_review_gtin(p_id uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = public as $$
declare s public.gtin_suggestions;
begin
  perform public.require_admin();
  select * into s from public.gtin_suggestions where id = p_id for update;
  if not found then raise exception 'PP404: proposition introuvable'; end if;
  if p_accept then
    insert into public.medicine_identifiers (catalog_id, id_type, value) values (s.catalog_id, 'gtin', s.code) on conflict (id_type, value) do nothing;
  end if;
  update public.gtin_suggestions set status = case when p_accept then 'acceptee' else 'refusee' end where id = p_id;
end $$;
revoke execute on function public.suggest_gtin(text, uuid), public.admin_review_gtin(uuid, boolean) from public, anon;
grant execute on function public.suggest_gtin(text, uuid), public.admin_review_gtin(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. Santé mentale : lignes d'écoute et d'aide (saisies et vérifiées par l'équipe)
-- ---------------------------------------------------------------------------
create table if not exists public.support_lines (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  phone text not null check (char_length(btrim(phone)) between 3 and 30),
  hours text check (char_length(coalesce(hours, '')) <= 120),
  description text check (char_length(coalesce(description, '')) <= 400),
  topic text not null default 'sante_mentale' check (topic in ('sante_mentale', 'violences', 'addictions', 'jeunes', 'autre')),
  source text not null check (char_length(btrim(source)) between 3 and 200),
  verified_at date not null default current_date,
  active boolean not null default true,
  sort int not null default 100
);
alter table public.support_lines enable row level security;
drop policy if exists "pp_support_lines_read" on public.support_lines;
create policy "pp_support_lines_read" on public.support_lines for select to anon, authenticated using (active or public.is_admin());
drop policy if exists "pp_support_lines_admin" on public.support_lines;
create policy "pp_support_lines_admin" on public.support_lines for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.support_lines from anon;
grant select on public.support_lines to anon;
grant select, insert, update, delete on public.support_lines to authenticated;

-- ---------------------------------------------------------------------------
-- 10. Langues nationales : traductions de l'interface, publiées après validation
-- ---------------------------------------------------------------------------
create table if not exists public.ui_translations (
  key text not null check (key ~ '^[a-z0-9_.]{2,80}$'),
  lang text not null check (lang in ('bm', 'snk', 'ff', 'son')),
  text text not null check (char_length(btrim(text)) between 1 and 400),
  status text not null default 'propose' check (status in ('propose', 'valide')),
  proposed_by text check (char_length(coalesce(proposed_by, '')) <= 120),
  validated_by text check (char_length(coalesce(validated_by, '')) <= 120),
  updated_at timestamptz not null default now(),
  primary key (key, lang)
);
alter table public.ui_translations enable row level security;
drop policy if exists "pp_translations_read" on public.ui_translations;
create policy "pp_translations_read" on public.ui_translations for select to anon, authenticated using (status = 'valide' or public.is_admin());
drop policy if exists "pp_translations_admin" on public.ui_translations;
create policy "pp_translations_admin" on public.ui_translations for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.ui_translations from anon;
grant select on public.ui_translations to anon;
grant select, insert, update, delete on public.ui_translations to authenticated;

-- ---------------------------------------------------------------------------
-- 11. Effacement avec le compte
-- ---------------------------------------------------------------------------
create or replace function public.purge_v023_on_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    delete from public.record_documents where user_id = new.id;
    delete from public.lab_results where user_id = new.id;
    update public.gtin_suggestions set user_id = null where user_id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists purge_v023_on_delete on public.profiles;
create trigger purge_v023_on_delete after update of deleted_at on public.profiles
  for each row execute function public.purge_v023_on_delete();


-- >>> 20261109000100_v024_sos_numeros_urgence.sql
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


-- >>> 20261109000200_v025_confidentialite_consentements.sql
-- =============================================================================
-- SantéProxi 0.25.0 — Confidentialité : consentements, preuves, demandes d'exercice
-- des droits, journal d'audit chaîné (inaltérable par l'application).
-- Migration additive : aucune donnée existante n'est modifiée ni supprimée.
-- Retour arrière (dans cet ordre) :
--   drop trigger if exists audit_logs_chain on public.audit_logs;
--   drop trigger if exists audit_logs_immutable on public.audit_logs;
--   alter table public.audit_logs drop column if exists prev_hash, drop column if exists row_hash;
--   drop table if exists public.privacy_requests, public.consent_records, public.consent_purposes;
-- =============================================================================

-- 1. Finalités (texte versionné présenté à l'utilisateur)
create table if not exists public.consent_purposes (
  code text primary key check (code ~ '^[a-z_]{3,40}$'),
  title text not null check (char_length(btrim(title)) between 3 and 120),
  description text not null check (char_length(btrim(description)) between 10 and 1200),
  data_categories text not null check (char_length(data_categories) <= 300),
  recipients text not null check (char_length(recipients) <= 300),
  legal_basis text not null check (legal_basis in ('consentement', 'contrat', 'obligation_legale', 'interet_vital', 'interet_legitime')),
  withdrawal_effect text check (char_length(coalesce(withdrawal_effect, '')) <= 400),
  version int not null default 1 check (version >= 1),
  active boolean not null default true,
  sort int not null default 100,
  updated_at timestamptz not null default now()
);
alter table public.consent_purposes enable row level security;
drop policy if exists "pp_consent_purposes_read" on public.consent_purposes;
create policy "pp_consent_purposes_read" on public.consent_purposes for select to anon, authenticated using (active or public.is_admin());
drop policy if exists "pp_consent_purposes_admin" on public.consent_purposes;
create policy "pp_consent_purposes_admin" on public.consent_purposes for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.consent_purposes from anon;
grant select on public.consent_purposes to anon;
grant select, insert, update, delete on public.consent_purposes to authenticated;

-- Toute modification du texte d'une finalité augmente sa version (les preuves gardent la version acceptée)
create or replace function public.bump_consent_purpose_version()
returns trigger language plpgsql set search_path = public as $$
begin
  if (new.title, new.description, new.data_categories, new.recipients, new.legal_basis, coalesce(new.withdrawal_effect, ''))
     is distinct from (old.title, old.description, old.data_categories, old.recipients, old.legal_basis, coalesce(old.withdrawal_effect, '')) then
    new.version := old.version + 1;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists consent_purposes_version on public.consent_purposes;
create trigger consent_purposes_version before update on public.consent_purposes for each row execute function public.bump_consent_purpose_version();

insert into public.consent_purposes (code, title, description, data_categories, recipients, legal_basis, withdrawal_effect, sort) values
  ('dossier_sante', 'Mon dossier santé',
   'Enregistrer dans votre compte vos documents médicaux, mesures, traitements et résultats d''analyses, pour les retrouver et, si vous le décidez, les montrer à un professionnel.',
   'Documents médicaux, mesures, traitements, résultats d''analyses', 'Vous seul ; les professionnels ou proches à qui vous ouvrez un accès',
   'consentement', 'Le retrait n''efface pas automatiquement les éléments déjà enregistrés : vous pouvez les supprimer depuis votre dossier ou demander leur suppression.', 10),
  ('espace_femme', 'SantéProxi Femme',
   'Enregistrer votre suivi de cycle, de grossesse et vos notes personnelles dans l''espace Femme, protégé par un code secret.',
   'Cycle, symptômes, grossesse, notes personnelles (chiffrées)', 'Vous seul ; les personnes avec qui vous partagez explicitement',
   'consentement', 'Le retrait n''efface pas automatiquement vos données : vous pouvez les supprimer depuis l''espace Femme.', 20),
  ('communications', 'Informations et nouveautés',
   'Recevoir par e-mail des informations sur les nouveaux services SantéProxi et des messages de prévention.',
   'Adresse e-mail, prénom', 'SantéProxi et son prestataire d''envoi d''e-mails',
   'consentement', 'Vous ne recevez plus ces messages. Les messages liés à vos rendez-vous et commandes continuent.', 30),
  ('enquetes', 'Enquêtes de satisfaction',
   'Être contacté(e) pour donner votre avis sur SantéProxi afin d''améliorer le service.',
   'Adresse e-mail ou téléphone, prénom', 'Équipe SantéProxi',
   'consentement', 'Vous n''êtes plus sollicité(e) pour les enquêtes.', 40),
  ('compte_et_services', 'Compte, rendez-vous, commandes et réservations',
   'Créer et sécuriser votre compte, transmettre vos rendez-vous au professionnel choisi et vos réservations à la pharmacie choisie.',
   'Identité, contact, rendez-vous, commandes', 'Le professionnel, l''établissement ou la pharmacie que vous choisissez',
   'contrat', null, 100),
  ('securite', 'Sécurité et traçabilité',
   'Journaliser les actions sensibles (connexions, modifications, accès) pour protéger les comptes et enquêter en cas d''incident.',
   'Identifiant, action, date', 'Administrateurs habilités de SantéProxi',
   'interet_legitime', null, 110),
  ('fiche_urgence', 'Fiche d''urgence',
   'Afficher, si vous la remplissez, votre fiche d''urgence (groupe sanguin, allergies, contact) pour faciliter votre prise en charge.',
   'Informations de la fiche d''urgence', 'Vous ; les secours à qui vous la montrez',
   'interet_vital', null, 120)
on conflict (code) do nothing;

-- 2. Preuves de consentement : registre en ajout seul
create table if not exists public.consent_records (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  purpose_code text not null references public.consent_purposes(code),
  purpose_version int not null,
  decision text not null check (decision in ('accorde', 'retire')),
  method text not null check (method in ('centre_confidentialite', 'inscription', 'parcours_service')),
  data_categories text not null,
  recipients text not null,
  created_at timestamptz not null default now()
);
create index if not exists consent_records_user_idx on public.consent_records (user_id, purpose_code, created_at desc);
alter table public.consent_records enable row level security;
drop policy if exists "pp_consent_records_own" on public.consent_records;
create policy "pp_consent_records_own" on public.consent_records for select to authenticated using (user_id = auth.uid());
revoke all on public.consent_records from anon, authenticated;
grant select on public.consent_records to authenticated;

create or replace function public.consent_records_append_only()
returns trigger language plpgsql set search_path = public as $$
begin
  -- Seule exception : suppression en cascade quand le profil lui-même est supprimé définitivement
  if tg_op = 'DELETE' and not exists (select 1 from public.profiles where id = old.user_id) then return old; end if;
  raise exception 'PP403: le registre des consentements ne peut pas être modifié';
end $$;
drop trigger if exists consent_records_append_only on public.consent_records;
create trigger consent_records_append_only before update or delete on public.consent_records for each row execute function public.consent_records_append_only();

create or replace function public.set_consent(p_purpose text, p_granted boolean, p_method text default 'centre_confidentialite')
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); p public.consent_purposes; last text;
begin
  if uid is null then raise exception 'PP401: connexion requise'; end if;
  select * into p from public.consent_purposes where code = p_purpose and active;
  if not found or p.legal_basis <> 'consentement' then raise exception 'PP422: cette finalité ne relève pas du consentement'; end if;
  if p_method not in ('centre_confidentialite', 'inscription', 'parcours_service') then raise exception 'PP422: méthode invalide'; end if;
  if (select count(*) from public.consent_records where user_id = uid and created_at > now() - interval '1 hour') >= 60 then
    raise exception 'PP429: trop de changements, réessayez plus tard';
  end if;
  select decision into last from public.consent_records where user_id = uid and purpose_code = p_purpose order by created_at desc, id desc limit 1;
  if last is not distinct from (case when p_granted then 'accorde' else 'retire' end) then return; end if;
  if last is null and not p_granted then return; end if;
  insert into public.consent_records (user_id, purpose_code, purpose_version, decision, method, data_categories, recipients)
  values (uid, p.code, p.version, case when p_granted then 'accorde' else 'retire' end, p_method, p.data_categories, p.recipients);
  perform public.log_audit(case when p_granted then 'consent.grant' else 'consent.withdraw' end, 'consent', p.code, jsonb_build_object('version', p.version, 'method', p_method));
end $$;
revoke execute on function public.set_consent(text, boolean, text) from public, anon;
grant execute on function public.set_consent(text, boolean, text) to authenticated;

-- Statistiques agrégées pour l'administration (aucune identité)
create or replace function public.consent_stats()
returns table (purpose_code text, accorde bigint, retire bigint)
language sql security definer set search_path = public stable as $$
  with last as (
    select distinct on (user_id, purpose_code) user_id, purpose_code, decision
    from public.consent_records order by user_id, purpose_code, created_at desc, id desc)
  select purpose_code, count(*) filter (where decision = 'accorde'), count(*) filter (where decision = 'retire')
  from last where public.is_admin() group by purpose_code;
$$;
revoke execute on function public.consent_stats() from public, anon;
grant execute on function public.consent_stats() to authenticated;

-- 3. Demandes d'exercice des droits
create table if not exists public.privacy_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('acces', 'rectification', 'export', 'suppression', 'opposition', 'autre')),
  message text check (char_length(coalesce(message, '')) <= 2000),
  status text not null default 'nouvelle' check (status in ('nouvelle', 'en_cours', 'traitee', 'refusee')),
  admin_note text check (char_length(coalesce(admin_note, '')) <= 1000),
  handled_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists privacy_requests_status_idx on public.privacy_requests (status, created_at desc);
alter table public.privacy_requests enable row level security;
drop policy if exists "pp_privacy_requests_own" on public.privacy_requests;
create policy "pp_privacy_requests_own" on public.privacy_requests for select to authenticated using (user_id = auth.uid() or public.is_admin());
revoke all on public.privacy_requests from anon, authenticated;
grant select on public.privacy_requests to authenticated;

create or replace function public.create_privacy_request(p_kind text, p_message text)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); rid uuid; a record;
begin
  if uid is null then raise exception 'PP401: connexion requise'; end if;
  if p_kind not in ('acces', 'rectification', 'export', 'suppression', 'opposition', 'autre') then raise exception 'PP422: type de demande invalide'; end if;
  if char_length(coalesce(p_message, '')) > 2000 then raise exception 'PP422: message trop long'; end if;
  if (select count(*) from public.privacy_requests where user_id = uid and created_at > now() - interval '1 day') >= 5 then
    raise exception 'PP429: trop de demandes aujourd''hui, réessayez demain';
  end if;
  insert into public.privacy_requests (user_id, kind, message) values (uid, p_kind, nullif(btrim(coalesce(p_message, '')), '')) returning id into rid;
  perform public.log_audit('privacy.request', 'privacy_request', rid::text, jsonb_build_object('kind', p_kind));
  for a in select ur.user_id from public.user_roles ur where ur.role = 'admin' loop
    insert into public.notifications (user_id, kind, title, body, link)
    values (a.user_id, 'confidentialite', 'Nouvelle demande sur les données personnelles', 'Type : ' || p_kind, '/admin/confidentialite');
  end loop;
  return rid;
end $$;
revoke execute on function public.create_privacy_request(text, text) from public, anon;
grant execute on function public.create_privacy_request(text, text) to authenticated;

create or replace function public.handle_privacy_request(p_id uuid, p_status text, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare r public.privacy_requests;
begin
  if not public.is_admin() then raise exception 'PP403: réservé à l''administration'; end if;
  if p_status not in ('nouvelle', 'en_cours', 'traitee', 'refusee') then raise exception 'PP422: statut invalide'; end if;
  update public.privacy_requests set status = p_status, admin_note = nullif(btrim(coalesce(p_note, '')), ''), handled_by = auth.uid(), updated_at = now()
  where id = p_id returning * into r;
  if not found then raise exception 'PP404: demande introuvable'; end if;
  perform public.log_audit('privacy.request_status', 'privacy_request', p_id::text, jsonb_build_object('status', p_status));
  insert into public.notifications (user_id, kind, title, body, link)
  values (r.user_id, 'confidentialite', 'Votre demande sur vos données a été mise à jour',
          case p_status when 'en_cours' then 'Elle est en cours de traitement.' when 'traitee' then 'Elle a été traitée.' when 'refusee' then 'Elle n''a pas pu être acceptée : consultez la réponse.' else 'Elle a été enregistrée.' end,
          '/compte/confidentialite');
end $$;
revoke execute on function public.handle_privacy_request(uuid, text, text) from public, anon;
grant execute on function public.handle_privacy_request(uuid, text, text) to authenticated;

-- Événement de confidentialité déclenché par l'utilisateur lui-même (ex. export de ses données)
create or replace function public.log_privacy_event(p_action text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'PP401: connexion requise'; end if;
  if p_action not in ('privacy.export', 'privacy.signout_others') then raise exception 'PP422: action inconnue'; end if;
  perform public.log_audit(p_action, 'user', auth.uid()::text, '{}'::jsonb);
end $$;
revoke execute on function public.log_privacy_event(text) from public, anon;
grant execute on function public.log_privacy_event(text) to authenticated;

-- Historique visible par l'utilisateur : ses propres actions et celles qui le concernent directement
create or replace function public.my_audit_events(p_limit int default 50)
returns table (created_at timestamptz, action text, entity_type text, by_me boolean)
language sql security definer set search_path = public stable as $$
  select l.created_at, l.action, l.entity_type, l.actor_id = auth.uid()
  from public.audit_logs l
  where auth.uid() is not null and (l.actor_id = auth.uid() or (l.entity_type = 'user' and l.entity_id = auth.uid()::text))
  order by l.created_at desc limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;
revoke execute on function public.my_audit_events(int) from public, anon;
grant execute on function public.my_audit_events(int) to authenticated;

-- 4. Journal d'audit chaîné : chaque ligne contient l'empreinte de la précédente.
-- Toute modification ou suppression par l'application est refusée ; une altération
-- directe en base devient détectable par audit_verify_chain().
alter table public.audit_logs add column if not exists prev_hash text, add column if not exists row_hash text;

create or replace function public.audit_logs_chain()
returns trigger language plpgsql set search_path = public as $$
declare last text;
begin
  perform pg_advisory_xact_lock(hashtext('pp_audit_chain'));
  select row_hash into last from public.audit_logs where row_hash is not null order by id desc limit 1;
  new.prev_hash := coalesce(last, 'genesis');
  new.row_hash := encode(sha256(convert_to(concat_ws('|', new.prev_hash, coalesce(new.actor_id::text, ''), new.action, new.entity_type,
    coalesce(new.entity_id, ''), new.details::text, to_char(new.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US')), 'UTF8')), 'hex');
  return new;
end $$;
drop trigger if exists audit_logs_chain on public.audit_logs;
create trigger audit_logs_chain before insert on public.audit_logs for each row execute function public.audit_logs_chain();

create or replace function public.audit_logs_immutable()
returns trigger language plpgsql as $$
begin raise exception 'PP403: le journal d''audit ne peut être ni modifié ni supprimé'; end $$;
drop trigger if exists audit_logs_immutable on public.audit_logs;
create trigger audit_logs_immutable before update or delete on public.audit_logs for each row execute function public.audit_logs_immutable();

create or replace function public.audit_verify_chain()
returns table (checked bigint, broken_at bigint, first_chained_id bigint)
language plpgsql security definer set search_path = public stable as $$
declare r record; prev text := null; n bigint := 0; bad bigint := null; first_id bigint := null; h text;
begin
  if not public.is_admin() then raise exception 'PP403: réservé à l''administration'; end if;
  for r in select * from public.audit_logs where row_hash is not null order by id loop
    if first_id is null then first_id := r.id; prev := r.prev_hash; end if;
    h := encode(sha256(convert_to(concat_ws('|', r.prev_hash, coalesce(r.actor_id::text, ''), r.action, r.entity_type,
      coalesce(r.entity_id, ''), r.details::text, to_char(r.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US')), 'UTF8')), 'hex');
    if r.prev_hash is distinct from prev or h <> r.row_hash then bad := r.id; exit; end if;
    prev := r.row_hash; n := n + 1;
  end loop;
  return query select n, bad, first_id;
end $$;
revoke execute on function public.audit_verify_chain() from public, anon;
grant execute on function public.audit_verify_chain() to authenticated;

-- 5. Fiche de preuve des consentements d'une personne (administration, consultation journalisée)
create or replace function public.consent_proof(p_user uuid)
returns table (purpose_code text, purpose_title text, purpose_version int, decision text, method text, data_categories text, recipients text, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'PP403: réservé à l''administration'; end if;
  perform public.log_audit('admin.consent_proof', 'user', p_user::text, '{}'::jsonb);
  return query select r.purpose_code, p.title, r.purpose_version, r.decision, r.method, r.data_categories, r.recipients, r.created_at
    from public.consent_records r join public.consent_purposes p on p.code = r.purpose_code
    where r.user_id = p_user order by r.created_at, r.id;
end $$;
revoke execute on function public.consent_proof(uuid) from public, anon;
grant execute on function public.consent_proof(uuid) to authenticated;


-- >>> 20261109000300_v025_centre_aide.sql
-- =============================================================================
-- SantéProxi 0.25.0 — Centre d'aide : catégories, articles, recherche, avis,
-- tickets de support avec échanges et suivi des délais.
-- Migration additive. Retour arrière :
--   drop table if exists public.support_ticket_messages, public.support_tickets, public.help_votes, public.help_articles, public.help_categories cascade;
-- =============================================================================

create table if not exists public.help_categories (
  slug text primary key check (slug ~ '^[a-z0-9-]{2,60}$'),
  title text not null check (char_length(btrim(title)) between 2 and 80),
  description text not null check (char_length(description) <= 240),
  icon text not null default 'help' check (char_length(icon) <= 30),
  audience text not null default 'tous' check (audience in ('tous', 'patients', 'professionnels')),
  sort int not null default 100,
  active boolean not null default true
);
alter table public.help_categories enable row level security;
drop policy if exists "pp_help_categories_read" on public.help_categories;
create policy "pp_help_categories_read" on public.help_categories for select to anon, authenticated using (active or public.is_admin());
drop policy if exists "pp_help_categories_admin" on public.help_categories;
create policy "pp_help_categories_admin" on public.help_categories for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.help_categories from anon;
grant select on public.help_categories to anon;
grant select, insert, update, delete on public.help_categories to authenticated;

create table if not exists public.help_articles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,90}$'),
  category_slug text not null references public.help_categories(slug) on update cascade,
  section text not null check (char_length(btrim(section)) between 2 and 80),
  title text not null check (char_length(btrim(title)) between 5 and 140),
  summary text not null check (char_length(btrim(summary)) between 10 and 300),
  body text not null check (char_length(btrim(body)) between 20 and 20000),
  keywords text not null default '' check (char_length(keywords) <= 500),
  status text not null default 'publie' check (status in ('brouillon', 'publie')),
  sort int not null default 100,
  helpful_yes int not null default 0,
  helpful_no int not null default 0,
  views int not null default 0,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists help_articles_cat_idx on public.help_articles (category_slug, section, sort);
create index if not exists help_articles_trgm_idx on public.help_articles using gin (public.normalize_text(title || ' ' || keywords) extensions.gin_trgm_ops);
alter table public.help_articles enable row level security;
drop policy if exists "pp_help_articles_read" on public.help_articles;
create policy "pp_help_articles_read" on public.help_articles for select to anon, authenticated using (status = 'publie' or public.is_admin());
drop policy if exists "pp_help_articles_admin" on public.help_articles;
create policy "pp_help_articles_admin" on public.help_articles for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.help_articles from anon;
grant select on public.help_articles to anon;
grant select, insert, update, delete on public.help_articles to authenticated;

create or replace function public.touch_help_article()
returns trigger language plpgsql set search_path = public as $$
begin
  if (new.title, new.summary, new.body, new.section, new.category_slug, new.keywords, new.status)
     is distinct from (old.title, old.summary, old.body, old.section, old.category_slug, old.keywords, old.status) then
    new.updated_at := now();
  end if;
  return new;
end $$;
drop trigger if exists touch_help_article on public.help_articles;
create trigger touch_help_article before update on public.help_articles for each row execute function public.touch_help_article();

-- Recherche : insensible aux accents et à la casse, tolérante aux fautes (trigrammes), synonymes via « keywords »
create or replace function public.search_help(p_q text, p_limit int default 20)
returns table (slug text, title text, summary text, category_slug text, section text, score real)
language sql stable security definer set search_path = public as $$
  with q as (select btrim(public.normalize_text(p_q)) as t)
  select a.slug, a.title, a.summary, a.category_slug, a.section,
    (greatest(extensions.similarity(public.normalize_text(a.title), q.t), extensions.word_similarity(q.t, public.normalize_text(a.title || ' ' || a.keywords)))
     + case when public.normalize_text(a.title) like '%' || q.t || '%' then 0.6 else 0 end
     + case when public.normalize_text(a.keywords) like '%' || q.t || '%' then 0.4 else 0 end
     + case when public.normalize_text(a.body) like '%' || q.t || '%' then 0.2 else 0 end)::real as score
  from public.help_articles a, q
  where a.status = 'publie' and char_length(q.t) >= 2
    and (public.normalize_text(a.title || ' ' || a.keywords || ' ' || a.summary || ' ' || a.body) like '%' || q.t || '%'
         or extensions.word_similarity(q.t, public.normalize_text(a.title || ' ' || a.keywords)) > 0.35)
  order by score desc, a.sort
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;
grant execute on function public.search_help(text, int) to anon, authenticated;

-- Avis « Cet article vous a-t-il aidé ? » : une voix par visiteur et par article (clé anonymisée calculée côté serveur)
create table if not exists public.help_votes (
  article_id uuid not null references public.help_articles(id) on delete cascade,
  voter text not null check (voter ~ '^[0-9a-f]{64}$'),
  useful boolean not null,
  created_at timestamptz not null default now(),
  primary key (article_id, voter)
);
alter table public.help_votes enable row level security;
revoke all on public.help_votes from anon, authenticated;

create or replace function public.vote_help_article(p_slug text, p_useful boolean, p_voter text)
returns boolean language plpgsql security definer set search_path = public as $$
declare aid uuid;
begin
  if p_voter !~ '^[0-9a-f]{64}$' then raise exception 'PP422: vote invalide'; end if;
  select id into aid from public.help_articles where slug = p_slug and status = 'publie';
  if aid is null then raise exception 'PP404: article introuvable'; end if;
  insert into public.help_votes (article_id, voter, useful) values (aid, p_voter, p_useful) on conflict do nothing;
  if not found then return false; end if;
  update public.help_articles set helpful_yes = helpful_yes + (case when p_useful then 1 else 0 end), helpful_no = helpful_no + (case when p_useful then 0 else 1 end) where id = aid;
  return true;
end $$;
grant execute on function public.vote_help_article(text, boolean, text) to anon, authenticated;

create or replace function public.count_help_view(p_slug text)
returns void language sql security definer set search_path = public as $$
  update public.help_articles set views = views + 1 where slug = p_slug and status = 'publie';
$$;
grant execute on function public.count_help_view(text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Tickets de support
-- -----------------------------------------------------------------------------
create sequence if not exists public.support_ticket_seq start 1001;
create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('SP-' || lpad(nextval('public.support_ticket_seq')::text, 6, '0')),
  user_id uuid references public.profiles(id) on delete set null,
  name text not null check (char_length(btrim(name)) between 2 and 120),
  email text check (email is null or (char_length(email) <= 200 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  phone text check (phone is null or char_length(phone) <= 30),
  category_slug text references public.help_categories(slug) on update cascade on delete set null,
  subject text not null check (char_length(btrim(subject)) between 4 and 160),
  status text not null default 'nouveau' check (status in ('nouveau', 'en_cours', 'attente_infos', 'resolu', 'ferme')),
  priority text not null default 'normale' check (priority in ('basse', 'normale', 'haute', 'urgente')),
  assigned_to uuid references public.profiles(id) on delete set null,
  page_url text check (char_length(coalesce(page_url, '')) <= 300),
  first_response_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (user_id is not null or email is not null or phone is not null)
);
create index if not exists support_tickets_status_idx on public.support_tickets (status, priority, created_at);
create index if not exists support_tickets_user_idx on public.support_tickets (user_id, created_at desc);

create table if not exists public.support_ticket_messages (
  id bigint generated always as identity primary key,
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  from_staff boolean not null default false,
  internal boolean not null default false,
  body text not null check (char_length(btrim(body)) between 2 and 5000),
  created_at timestamptz not null default now()
);
create index if not exists support_ticket_messages_idx on public.support_ticket_messages (ticket_id, created_at);

alter table public.support_tickets enable row level security;
alter table public.support_ticket_messages enable row level security;
drop policy if exists "pp_tickets_read" on public.support_tickets;
create policy "pp_tickets_read" on public.support_tickets for select to authenticated using (user_id = auth.uid() or public.is_admin());
drop policy if exists "pp_ticket_msgs_read" on public.support_ticket_messages;
create policy "pp_ticket_msgs_read" on public.support_ticket_messages for select to authenticated using (
  public.is_admin() or (not internal and exists (select 1 from public.support_tickets t where t.id = ticket_id and t.user_id = auth.uid())));
revoke all on public.support_tickets, public.support_ticket_messages from anon, authenticated;
grant select on public.support_tickets, public.support_ticket_messages to authenticated;

-- Délai cible de première réponse (heures) selon la priorité
create or replace function public.ticket_sla_hours(p_priority text) returns int language sql immutable as $$
  select case p_priority when 'urgente' then 4 when 'haute' then 24 when 'normale' then 48 else 72 end;
$$;
grant execute on function public.ticket_sla_hours(text) to authenticated;

create or replace function public.create_support_ticket(p_name text, p_email text, p_phone text, p_category text, p_subject text, p_body text, p_page text default null)
returns text language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); t public.support_tickets; v_email text := nullif(lower(btrim(coalesce(p_email, ''))), ''); v_phone text := nullif(btrim(coalesce(p_phone, '')), ''); a record; prio text := 'normale';
begin
  if uid is null and v_email is null and v_phone is null then raise exception 'PP422: indiquez un e-mail ou un téléphone pour que nous puissions vous répondre'; end if;
  if char_length(btrim(coalesce(p_body, ''))) < 10 then raise exception 'PP422: décrivez votre demande en quelques mots (10 caractères minimum)'; end if;
  if char_length(btrim(coalesce(p_subject, ''))) < 4 then raise exception 'PP422: indiquez un objet'; end if;
  if char_length(btrim(coalesce(p_name, ''))) < 2 then raise exception 'PP422: indiquez votre nom'; end if;
  if (select count(*) from public.support_tickets where created_at > now() - interval '1 hour'
      and ((uid is not null and user_id = uid) or (v_email is not null and email = v_email) or (v_phone is not null and phone = v_phone))) >= 5 then
    raise exception 'PP429: trop de demandes envoyées, réessayez plus tard';
  end if;
  if p_category in ('urgences', 'securite-confidentialite') then prio := 'haute'; end if;
  insert into public.support_tickets (user_id, name, email, phone, category_slug, subject, priority, page_url)
  values (uid, btrim(p_name), v_email, v_phone, (select slug from public.help_categories where slug = p_category), btrim(p_subject), prio, left(p_page, 300))
  returning * into t;
  insert into public.support_ticket_messages (ticket_id, author_id, body) values (t.id, uid, btrim(p_body));
  for a in select ur.user_id from public.user_roles ur where ur.role = 'admin' loop
    insert into public.notifications (user_id, kind, title, body, link)
    values (a.user_id, 'support', 'Nouvelle demande d''aide ' || t.reference, left(t.subject, 140), '/admin/aide/tickets/' || t.id);
  end loop;
  return t.reference;
end $$;
grant execute on function public.create_support_ticket(text, text, text, text, text, text, text) to anon, authenticated;

create or replace function public.reply_support_ticket(p_ticket uuid, p_body text, p_internal boolean default false, p_status text default null, p_priority text default null)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); t public.support_tickets; staff boolean := public.is_admin();
begin
  if uid is null then raise exception 'PP401: connexion requise'; end if;
  select * into t from public.support_tickets where id = p_ticket for update;
  if not found or (not staff and t.user_id is distinct from uid) then raise exception 'PP404: demande introuvable'; end if;
  if p_status is not null and p_status not in ('nouveau', 'en_cours', 'attente_infos', 'resolu', 'ferme') then raise exception 'PP422: statut invalide'; end if;
  if p_priority is not null and p_priority not in ('basse', 'normale', 'haute', 'urgente') then raise exception 'PP422: priorité invalide'; end if;
  if not staff and t.status = 'ferme' then raise exception 'PP409: cette demande est fermée, créez-en une nouvelle'; end if;
  if nullif(btrim(coalesce(p_body, '')), '') is not null then
    insert into public.support_ticket_messages (ticket_id, author_id, from_staff, internal, body) values (t.id, uid, staff, staff and coalesce(p_internal, false), btrim(p_body));
  end if;
  update public.support_tickets set
    status = case when staff then coalesce(p_status, case when t.status = 'nouveau' then 'en_cours' else t.status end)
                  else case when t.status in ('attente_infos', 'resolu') then 'en_cours' else t.status end end,
    priority = case when staff then coalesce(p_priority, t.priority) else t.priority end,
    assigned_to = case when staff and t.assigned_to is null then uid else t.assigned_to end,
    first_response_at = case when staff and not coalesce(p_internal, false) and t.first_response_at is null and nullif(btrim(coalesce(p_body, '')), '') is not null then now() else t.first_response_at end,
    resolved_at = case when staff and p_status in ('resolu', 'ferme') then coalesce(t.resolved_at, now()) when staff and p_status is not null then null else t.resolved_at end,
    updated_at = now()
  where id = t.id;
  if staff and t.user_id is not null and not coalesce(p_internal, false) then
    insert into public.notifications (user_id, kind, title, body, link)
    values (t.user_id, 'support', 'Réponse à votre demande ' || t.reference, left(t.subject, 140), '/compte/aide/' || t.id);
  end if;
  if staff then perform public.log_audit('support.reply', 'support_ticket', t.id::text, jsonb_build_object('status', p_status, 'internal', coalesce(p_internal, false))); end if;
end $$;
revoke execute on function public.reply_support_ticket(uuid, text, boolean, text, text) from public, anon;
grant execute on function public.reply_support_ticket(uuid, text, boolean, text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Contenu initial : 14 catégories, articles décrivant uniquement des fonctions existantes
-- -----------------------------------------------------------------------------
insert into public.help_categories (slug, title, description, icon, audience, sort) values
  ('mon-compte', 'Mon compte SantéProxi', 'Créer son compte, se connecter, gérer ses informations.', 'user', 'tous', 10),
  ('rendez-vous', 'Mes rendez-vous', 'Trouver un professionnel, réserver, modifier ou annuler.', 'calendar', 'patients', 20),
  ('pharmacies-medicaments', 'Pharmacies et médicaments', 'Trouver une pharmacie, un médicament, réserver.', 'pill', 'patients', 30),
  ('laboratoires', 'Laboratoires et analyses', 'Trouver un laboratoire, faire une analyse, recevoir ses résultats.', 'flask', 'patients', 40),
  ('donnees-sante', 'Mes données de santé', 'Dossier santé, documents médicaux, confidentialité.', 'file-lock', 'patients', 50),
  ('proches', 'Mes proches et ma famille', 'Gérer les rendez-vous de vos enfants et de vos parents.', 'users', 'patients', 60),
  ('teleconsultation', 'Téléconsultation', 'Où en est la téléconsultation sur SantéProxi.', 'video', 'patients', 70),
  ('etablissements', 'Établissements de santé', 'Cliniques, hôpitaux, centres de santé et centres spécialisés.', 'hospital', 'tous', 80),
  ('urgences', 'Urgences et informations importantes', 'Numéros d''urgence, pharmacies de garde, premiers secours.', 'siren', 'tous', 90),
  ('securite-confidentialite', 'Sécurité et confidentialité', 'Protéger son compte, gérer ses données et ses consentements.', 'shield', 'tous', 100),
  ('paiements', 'Paiements et facturation', 'Comment se règlent les réservations et les services.', 'wallet', 'tous', 110),
  ('utilisation', 'Utilisation de SantéProxi', 'Installer l''application, langues, connexion faible.', 'smartphone', 'tous', 120),
  ('professionnels', 'Assistance aux professionnels de santé', 'Médecins, infirmiers : inscription, fiche, agenda.', 'stethoscope', 'professionnels', 130),
  ('structures', 'Pharmacies, laboratoires et établissements', 'Inscrire sa structure, gérer ses stocks, ses tarifs et son équipe.', 'building', 'professionnels', 140)
on conflict (slug) do nothing;

insert into public.help_articles (slug, category_slug, section, title, summary, keywords, sort, body) values
('creer-mon-compte', 'mon-compte', 'Créer et gérer mon compte', 'Comment créer mon compte SantéProxi ?', 'Créez gratuitement votre compte patient en quelques minutes.', 'inscription inscrire ouvrir compte s''inscrire nouveau compte', 10, $b$
La recherche de pharmacies, de médicaments et de professionnels fonctionne **sans compte**. Un compte est utile pour réserver, prendre rendez-vous et garder votre dossier santé.

1. Cliquez sur **Connexion**, puis sur **Créer un compte**.
2. Indiquez votre nom, votre adresse e-mail, éventuellement votre téléphone, et choisissez un mot de passe.
3. Acceptez les conditions d'utilisation et validez.

Le compte créé est un compte **patient**. Les professionnels de santé suivent une démarche spécifique : voir « Je suis professionnel de santé : comment m'inscrire ? ».
$b$),
('mot-de-passe-oublie', 'mon-compte', 'Connexion et identifiants', 'J''ai oublié mon mot de passe, que faire ?', 'Recevez par e-mail un lien pour choisir un nouveau mot de passe.', 'mot de passe oublie perdu reinitialiser connexion impossible mdp', 20, $b$
1. Ouvrez la page de **connexion**.
2. Cliquez sur **Mot de passe oublié ?**
3. Saisissez l'**adresse e-mail** de votre compte.
4. Ouvrez l'e-mail reçu (pensez à vérifier les courriers indésirables) et cliquez sur le lien.
5. Choisissez un nouveau mot de passe, puis connectez-vous.

La réinitialisation se fait aujourd'hui **par e-mail uniquement**. Si vous n'avez plus accès à votre adresse e-mail, contactez l'équipe depuis le centre d'aide.
$b$),
('modifier-mes-informations', 'mon-compte', 'Informations personnelles', 'Comment modifier mes informations personnelles ?', 'Nom, téléphone, région et adresses se modifient depuis Mon compte.', 'modifier nom telephone adresse profil changer informations', 30, $b$
Ouvrez **Mon compte** : vous pouvez y modifier votre nom, votre téléphone, votre région et commune préférées, et vos adresses.

Pour changer de mot de passe : **Mon compte › Sécurité**.
$b$),
('supprimer-mon-compte', 'mon-compte', 'Créer et gérer mon compte', 'Comment supprimer mon compte ?', 'La suppression se fait en bas de la page Mon compte.', 'supprimer effacer compte desinscrire fermer compte', 40, $b$
En bas de la page **Mon compte**, utilisez **Supprimer mon compte** et confirmez.

Avant de supprimer votre compte, vous pouvez **télécharger vos données** depuis *Mes données et confidentialité*.
$b$),
('trouver-un-medecin', 'rendez-vous', 'Trouver un professionnel de santé', 'Comment trouver un médecin ou un spécialiste ?', 'Cherchez par spécialité, par nom et par ville.', 'medecin docteur specialiste trouver chercher pediatre gynecologue', 10, $b$
1. Ouvrez **Médecins** depuis le menu.
2. Choisissez une **spécialité** ou tapez un nom.
3. Précisez votre région ou votre commune.
4. Ouvrez la fiche d'un médecin pour voir ses lieux de consultation, ses jours et la possibilité de prendre rendez-vous.

Une fiche indique la date de la dernière confirmation des informations.
$b$),
('prendre-rendez-vous', 'rendez-vous', 'Prendre un rendez-vous', 'Comment prendre rendez-vous ?', 'Réservez un créneau ou envoyez une demande au cabinet.', 'rendez-vous rdv reserver prendre consultation creneau', 20, $b$
Depuis la fiche d'un médecin, choisissez **Prendre rendez-vous**. Selon le cabinet :

- **Réservation immédiate** : vous choisissez un créneau libre, le rendez-vous est confirmé.
- **Demande à confirmer** : le cabinet accepte, propose un autre horaire ou refuse. Une demande sans réponse sous **48 heures** expire automatiquement : vous pouvez alors appeler le cabinet ou refaire une demande.

Vous devez être connecté(e). Vous pouvez prendre rendez-vous pour un proche (voir *Mes proches et ma famille*).
$b$),
('annuler-deplacer-rendez-vous', 'rendez-vous', 'Modifier ou annuler un rendez-vous', 'Comment annuler ou déplacer un rendez-vous ?', 'Depuis Mes rendez-vous, annulez ou choisissez un autre créneau.', 'annuler deplacer modifier changer rendez-vous rdv report', 30, $b$
1. Ouvrez **Mon compte › Mes rendez-vous**.
2. Sur le rendez-vous concerné, choisissez **Déplacer** (si le cabinet le permet) ou **Annuler**.

Prévenez le plus tôt possible : le créneau libéré peut servir à un autre patient.
$b$),
('rappels-rendez-vous', 'rendez-vous', 'Notifications et rappels', 'Comment recevoir un rappel de mon rendez-vous ?', 'Notifications dans votre compte et ajout à l''agenda du téléphone.', 'rappel notification agenda calendrier oubli', 40, $b$
Les changements sur vos rendez-vous apparaissent dans vos **notifications**. Pour un rendez-vous confirmé, le bouton **Ajouter à mon agenda** télécharge un fichier à ouvrir avec l'agenda de votre téléphone ; il inclut un rappel deux heures avant.

Réglez vos préférences dans **Mon compte › Notifications**.
$b$),
('alerte-creneau-libere', 'rendez-vous', 'Prendre un rendez-vous', 'Être prévenu(e) quand un créneau se libère', 'Inscrivez-vous sur la liste d''attente d''un médecin.', 'liste attente creneau libre complet disponibilite', 50, $b$
Quand aucun créneau ne convient, inscrivez-vous à l'**alerte de créneau libéré** sur la fiche du médecin. Vous êtes notifié(e) si un créneau se libère. Retrouvez vos alertes dans **Mes rendez-vous**.
$b$),
('trouver-medicament', 'pharmacies-medicaments', 'Rechercher un médicament', 'Comment trouver un médicament près de chez moi ?', 'Cherchez par nom commercial, générique ou principe actif.', 'medicament trouver disponible stock chercher paracetamol generique', 10, $b$
1. Tapez le nom du médicament dans la barre de recherche (nom commercial, générique ou principe actif). Vous pouvez aussi utiliser la recherche vocale.
2. Précisez votre région, commune ou quartier.
3. Les pharmacies qui **déclarent** l'avoir s'affichent, avec la **date de la dernière mise à jour** du stock.

Une disponibilité déclarée n'est pas une garantie : en cas de doute, appelez la pharmacie avant de vous déplacer.
$b$),
('pharmacie-de-garde', 'pharmacies-medicaments', 'Trouver une pharmacie', 'Comment trouver une pharmacie de garde ?', 'La page Garde liste les pharmacies ouvertes la nuit et le week-end.', 'garde nuit week-end dimanche ouverte ferie', 20, $b$
Ouvrez **Pharmacies de garde** depuis l'accueil ou le menu. Les gardes affichées sont celles **publiées** sur SantéProxi ; si aucune garde n'apparaît pour votre zone, renseignez-vous auprès des pharmacies proches ou des autorités sanitaires locales.
$b$),
('reserver-medicament', 'pharmacies-medicaments', 'Commandes et réservations', 'Comment réserver un médicament ?', 'Envoyez une demande de réservation à une pharmacie partenaire.', 'reserver commande commander retrait pharmacie', 30, $b$
Sur une pharmacie qui accepte les réservations, ajoutez les médicaments puis envoyez votre demande. La pharmacie confirme ou non la disponibilité. Suivez l'avancement dans **Mon compte › Mes commandes**.

Les médicaments soumis à prescription restent délivrés selon les règles de la pharmacie. SantéProxi ne recommande aucun médicament : demandez conseil à votre pharmacien.
$b$),
('medicament-suspect', 'pharmacies-medicaments', 'Informations importantes', 'Comment signaler un médicament suspect ?', 'Utilisez la page Signaler un médicament suspect.', 'faux contrefait suspect signaler qualite rue', 40, $b$
Ouvrez **Signaler un médicament suspect** (pied de page) et décrivez le produit et le lieu d'achat. N'achetez pas de médicaments hors des pharmacies : leur qualité et leur conservation ne sont pas garanties.
$b$),
('trouver-laboratoire', 'laboratoires', 'Trouver un laboratoire', 'Comment trouver un laboratoire d''analyses ?', 'La page Laboratoires liste les laboratoires et les examens.', 'laboratoire analyse examen prise de sang bilan', 10, $b$
Ouvrez **Laboratoires et examens**. Cherchez un examen ou un laboratoire près de chez vous. Les tarifs affichés sont ceux **communiqués par les laboratoires**. Le **lexique des analyses** explique les principaux examens.
$b$),
('prelevement-domicile', 'laboratoires', 'Réaliser une analyse', 'Comment demander une prise de sang à domicile ?', 'Certains laboratoires proposent le prélèvement à domicile.', 'domicile prelevement prise de sang infirmier maison', 20, $b$
Si un laboratoire propose ce service, faites la demande depuis sa fiche. Suivez vos demandes dans **Mon compte › Prises de sang à domicile**. Le laboratoire vous contacte pour fixer le rendez-vous.
$b$),
('resultats-analyses', 'laboratoires', 'Résultats d''analyses', 'Où trouver mes résultats d''analyses ?', 'Les résultats déposés par le laboratoire apparaissent dans votre compte.', 'resultats analyses bilan recevoir consulter', 30, $b$
Quand le laboratoire auprès duquel vous avez fait une demande dépose vos résultats sur SantéProxi, ils apparaissent dans **Mon compte › Résultats**. Seuls vous et ce laboratoire y ont accès. Pour leur interprétation, adressez-vous à votre médecin.
$b$),
('dossier-sante', 'donnees-sante', 'Comprendre mon espace santé', 'À quoi sert mon dossier santé ?', 'Rangez vos documents, traitements, mesures et votre fiche d''urgence.', 'dossier sante carnet documents ordonnance vaccins traitement', 10, $b$
Dans **Ma santé › Mon dossier**, vous pouvez enregistrer vos documents médicaux (ordonnances, comptes rendus), vos traitements, vos mesures et votre **fiche d'urgence**. Ces informations ne sont lisibles que par vous, et par les personnes à qui vous ouvrez un accès.
$b$),
('telecharger-mes-donnees', 'donnees-sante', 'Confidentialité', 'Comment télécharger ou faire supprimer mes données ?', 'Le centre « Mes données et confidentialité » permet l''export et les demandes.', 'donnees export telecharger suppression rgpd apdp acces rectification', 20, $b$
Ouvrez **Mon compte › Mes données et confidentialité** :

- **Télécharger mes données** : un fichier contenant les données de votre compte.
- **Faire une demande** : accès, rectification, suppression ou opposition. L'équipe vous répond dans votre compte.
- **Mes consentements** : accordez ou retirez chaque consentement séparément.

Retirer un consentement ne supprime pas automatiquement les données déjà enregistrées : vous pouvez les supprimer séparément.
$b$),
('rendez-vous-pour-un-proche', 'proches', 'Gérer mes proches', 'Comment prendre rendez-vous pour mon enfant ou un parent ?', 'Ajoutez vos proches dans votre compte, puis choisissez-les lors de la réservation.', 'enfant parent proche famille bebe rendez-vous pour autre personne', 10, $b$
1. Ouvrez **Mon compte › Mes proches** et ajoutez la personne (seuls son nom et, si vous le souhaitez, son téléphone sont enregistrés).
2. Lors d'une prise de rendez-vous, choisissez pour qui est le rendez-vous.
$b$),
('teleconsultation-disponibilite', 'teleconsultation', 'Informations', 'La téléconsultation est-elle disponible ?', 'Pas encore : elle exige un hébergement certifié des données de santé.', 'teleconsultation video consultation a distance en ligne', 10, $b$
**Non, la téléconsultation n'est pas encore proposée sur SantéProxi.** Elle sera ouverte seulement lorsque les conditions de sécurité et de réglementation seront réunies (hébergement adapté aux données de santé, accords avec les professionnels).

En attendant, vous pouvez prendre rendez-vous en cabinet depuis la fiche d'un médecin.
$b$),
('trouver-etablissement', 'etablissements', 'Trouver un établissement', 'Comment trouver une clinique, un hôpital ou un centre spécialisé ?', 'Utilisez Cliniques, Urgences et Centres spécialisés.', 'clinique hopital centre sante cscom specialise dialyse', 10, $b$
- **Cliniques** : liste des cliniques et polycliniques avec leurs services.
- **Urgences** : services d'urgence et ambulances proches.
- **Centres spécialisés** : établissements disposant d'un service particulier, avec la source de l'information.

Chaque fiche affiche la date de dernière confirmation de ses informations.
$b$),
('numeros-urgence', 'urgences', 'Urgences', 'Quels numéros appeler en cas d''urgence ?', 'La page SOS Santé regroupe les numéros d''urgence avec appel direct.', 'urgence numero appeler pompier police ambulance secours sos', 10, $b$
Ouvrez **SOS Santé** (bouton rouge en haut de chaque page). Vous y trouvez les numéros d'urgence, un bouton **Appeler maintenant** et un bouton **Copier** pour chaque numéro, avec l'état de leur vérification.

En cas d'urgence vitale, contactez immédiatement les services de secours ou rendez-vous au service d'urgence le plus proche. SantéProxi ne remplace pas les services de secours et n'envoie pas d'ambulance.
$b$),
('double-authentification', 'securite-confidentialite', 'Protéger mon compte', 'Comment activer la double authentification ?', 'Ajoutez un code à usage unique pour sécuriser votre compte.', 'double authentification 2fa code securite application authentificateur', 10, $b$
1. Ouvrez **Mon compte › Sécurité**.
2. Suivez les étapes pour associer une application d'authentification (codes à 6 chiffres).
3. À chaque connexion, saisissez le code affiché par l'application.

Vous pouvez aussi **déconnecter vos autres appareils** depuis *Mes données et confidentialité*.
$b$),
('message-suspect', 'securite-confidentialite', 'Protéger mon compte', 'J''ai reçu un message suspect au nom de SantéProxi', 'SantéProxi ne vous demande jamais votre mot de passe.', 'arnaque phishing fraude message suspect mot de passe faux', 20, $b$
SantéProxi ne vous demandera **jamais** votre mot de passe ni un code reçu par e-mail. Ne cliquez pas sur le lien, ne répondez pas, et signalez-le à l'équipe depuis le centre d'aide. Si vous avez saisi votre mot de passe, changez-le immédiatement dans **Mon compte › Sécurité**.
$b$),
('paiement-reservations', 'paiements', 'Paiements', 'Comment payer une réservation de médicaments ?', 'Le paiement se fait auprès de la pharmacie.', 'payer paiement prix orange money moov argent tarif', 10, $b$
SantéProxi ne prélève pas de paiement en ligne pour les médicaments : vous **réglez directement la pharmacie**, selon les moyens qu'elle accepte. Les prix affichés sont ceux communiqués par les pharmacies.

La recherche et l'utilisation de SantéProxi sont **gratuites** pour les patients.
$b$),
('installer-application', 'utilisation', 'Utiliser SantéProxi', 'Comment installer SantéProxi sur mon téléphone ?', 'Ajoutez le site à l''écran d''accueil : il fonctionne comme une application.', 'installer application telephone ecran accueil android iphone hors ligne', 10, $b$
- **Android (Chrome)** : menu ⋮ › **Ajouter à l'écran d'accueil** ou **Installer l'application**.
- **iPhone (Safari)** : bouton Partager › **Sur l'écran d'accueil**.

Certaines pages (SOS, premiers secours, urgences) restent lisibles sans Internet une fois ouvertes une première fois.
$b$),
('changer-langue', 'utilisation', 'Utiliser SantéProxi', 'Comment changer de langue ?', 'Choisissez votre langue dans le menu ; certaines traductions sont en cours.', 'langue bambara francais traduction audio soninke peul', 20, $b$
Utilisez le sélecteur de langue du menu. Seules les traductions **validées** par des locuteurs natifs s'affichent ; les textes non encore traduits restent en français. Des **guides audio** enregistrés en langues nationales sont proposés sur certaines pages.
$b$),
('inscription-professionnel', 'professionnels', 'Rejoindre SantéProxi', 'Je suis professionnel de santé : comment m''inscrire ?', 'Créez un compte, puis l''équipe vérifie votre autorisation d''exercer.', 'medecin inscription professionnel infirmier sage-femme fiche ordre', 10, $b$
1. Créez un compte SantéProxi normal.
2. Ouvrez **Vous êtes professionnel de santé ?** et envoyez votre demande avec la référence de votre autorisation (inscription à l'Ordre, arrêté ou agrément).
3. L'équipe vérifie auprès des registres officiels et autorise votre compte ; vous êtes notifié(e) pour compléter votre fiche.

Votre fiche est publiée après dépôt et vérification de vos justificatifs. Les informations de vérification ne sont pas publiées.
$b$),
('inscrire-pharmacie', 'structures', 'Inscrire ma structure', 'Comment inscrire ma pharmacie, mon laboratoire ou ma clinique ?', 'Demande depuis l''espace professionnels, puis vérification des justificatifs.', 'pharmacie inscrire laboratoire clinique structure partenaire agrement', 10, $b$
Depuis **Vous êtes professionnel de santé ?**, choisissez le type de structure et envoyez votre demande avec vos justificatifs. Après vérification, vous accédez à votre espace : fiche publique, horaires, équipe, et selon le type de structure, stocks, réservations, examens et tarifs.
$b$),
('mettre-a-jour-stocks', 'structures', 'Gérer ma pharmacie', 'Comment mettre à jour les stocks de ma pharmacie ?', 'Depuis l''espace pharmacien, par saisie ou import d''un fichier.', 'stock mise a jour import csv fichier disponibilite pharmacien', 20, $b$
Dans l'**espace pharmacien**, mettez à jour un produit en quelques gestes ou importez un fichier (CSV) de votre logiciel. La date de mise à jour s'affiche aux patients : des stocks récents inspirent confiance et évitent des déplacements inutiles.
$b$)
on conflict (slug) do nothing;


-- >>> v0.26 — Conformité et consentements (20261109000400)
-- =============================================================================
-- SantéProxi 0.26.0 — Conformité : preuves de consentement renforcées, versions
-- de politique, réclamations, registre des traitements, destinataires, habilitations
-- conformité, historique des connexions, favoris.
-- Migration additive : aucune donnée existante n'est modifiée ni supprimée
-- (les preuves antérieures restent telles quelles ; les nouvelles colonnes sont vides pour elles).
-- Retour arrière : voir le bloc « ROLLBACK » en fin de fichier.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Habilitations conformité (DPO / correspondant, juriste, auditeur en lecture seule)
-- ---------------------------------------------------------------------------
create table if not exists public.compliance_members (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  role text not null check (role in ('dpo', 'juriste', 'auditeur')),
  granted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.compliance_members enable row level security;
drop policy if exists "pp_compliance_members_read" on public.compliance_members;
create policy "pp_compliance_members_read" on public.compliance_members for select to authenticated using (user_id = auth.uid() or public.is_admin());
revoke all on public.compliance_members from anon, authenticated;
grant select on public.compliance_members to authenticated;

create or replace function public.compliance_role() returns text
language sql stable security definer set search_path = public as $$
  select case when public.is_admin() then 'admin' else (select role from public.compliance_members where user_id = auth.uid()) end;
$$;
create or replace function public.can_view_compliance() returns boolean
language sql stable security definer set search_path = public as $$ select public.compliance_role() is not null; $$;
create or replace function public.can_edit_compliance() returns boolean
language sql stable security definer set search_path = public as $$ select coalesce(public.compliance_role() in ('admin', 'dpo', 'juriste'), false); $$;
grant execute on function public.compliance_role(), public.can_view_compliance(), public.can_edit_compliance() to authenticated;

create or replace function public.admin_set_compliance_member(p_email text, p_role text)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if not public.is_admin() then raise exception 'PP403: réservé à l''administration'; end if;
  select id into uid from auth.users where lower(email) = lower(btrim(p_email));
  if uid is null then raise exception 'PP404: aucun compte avec cette adresse'; end if;
  if p_role is null or p_role = '' then
    delete from public.compliance_members where user_id = uid;
  else
    if p_role not in ('dpo', 'juriste', 'auditeur') then raise exception 'PP422: rôle invalide'; end if;
    insert into public.compliance_members (user_id, role, granted_by) values (uid, p_role, auth.uid())
    on conflict (user_id) do update set role = excluded.role, granted_by = excluded.granted_by, created_at = now();
  end if;
  perform public.log_audit('compliance.member', 'user', uid::text, jsonb_build_object('role', nullif(p_role, '')));
end $$;
revoke execute on function public.admin_set_compliance_member(text, text) from public, anon;
grant execute on function public.admin_set_compliance_member(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Versions immuables des textes de consentement (copie exacte + empreinte SHA-256)
-- ---------------------------------------------------------------------------
create table if not exists public.consent_purpose_versions (
  purpose_code text not null references public.consent_purposes(code),
  version int not null,
  snapshot jsonb not null,
  text_sha256 text not null check (text_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  primary key (purpose_code, version)
);
alter table public.consent_purpose_versions enable row level security;
drop policy if exists "pp_consent_purpose_versions_read" on public.consent_purpose_versions;
create policy "pp_consent_purpose_versions_read" on public.consent_purpose_versions for select to anon, authenticated using (true);
revoke all on public.consent_purpose_versions from anon, authenticated;
grant select on public.consent_purpose_versions to anon, authenticated;

create or replace function public.consent_purpose_snapshot(p public.consent_purposes) returns jsonb
language sql immutable as $$
  select jsonb_build_object('code', p.code, 'version', p.version, 'titre', p.title, 'description', p.description,
    'donnees', p.data_categories, 'destinataires', p.recipients, 'base_legale', p.legal_basis, 'effet_du_retrait', p.withdrawal_effect);
$$;
create or replace function public.sha256_text(t text) returns text language sql immutable as $$ select encode(sha256(convert_to(t, 'UTF8')), 'hex') $$;

create or replace function public.archive_consent_purpose_version() returns trigger
language plpgsql security definer set search_path = public as $$
declare s jsonb := public.consent_purpose_snapshot(new);
begin
  insert into public.consent_purpose_versions (purpose_code, version, snapshot, text_sha256)
  values (new.code, new.version, s, public.sha256_text(s::text)) on conflict do nothing;
  return new;
end $$;
drop trigger if exists consent_purposes_archive on public.consent_purposes;
create trigger consent_purposes_archive after insert or update on public.consent_purposes for each row execute function public.archive_consent_purpose_version();

create or replace function public.immutable_row() returns trigger language plpgsql as $$
begin raise exception 'PP403: enregistrement immuable (%), toute correction doit créer un nouvel enregistrement', tg_table_name; end $$;
drop trigger if exists consent_purpose_versions_immutable on public.consent_purpose_versions;
create trigger consent_purpose_versions_immutable before update or delete on public.consent_purpose_versions for each row execute function public.immutable_row();

-- Versions actuelles déjà en place : archivées telles quelles
insert into public.consent_purpose_versions (purpose_code, version, snapshot, text_sha256)
select p.code, p.version, public.consent_purpose_snapshot(p), public.sha256_text(public.consent_purpose_snapshot(p)::text)
from public.consent_purposes p on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 3. Versions de la politique de confidentialité (texte figé une fois publié)
-- ---------------------------------------------------------------------------
create table if not exists public.privacy_policy_versions (
  id uuid primary key default gen_random_uuid(),
  version text not null unique check (version ~ '^[0-9A-Za-z._-]{1,20}$'),
  lang text not null default 'fr',
  title text not null check (char_length(btrim(title)) between 3 and 160),
  body text not null check (char_length(btrim(body)) >= 20),
  sha256 text not null default '',
  status text not null default 'brouillon' check (status in ('brouillon', 'publiee', 'archivee')),
  published_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.privacy_policy_versions enable row level security;
drop policy if exists "pp_policy_versions_read" on public.privacy_policy_versions;
create policy "pp_policy_versions_read" on public.privacy_policy_versions for select to anon, authenticated using (status <> 'brouillon' or public.can_view_compliance());
revoke all on public.privacy_policy_versions from anon, authenticated;
grant select on public.privacy_policy_versions to anon, authenticated;

create or replace function public.policy_version_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'brouillon' then raise exception 'PP403: une version publiée ne peut pas être supprimée'; end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and old.status <> 'brouillon' then
    if (new.title, new.body, new.version, new.lang) is distinct from (old.title, old.body, old.version, old.lang) then
      raise exception 'PP403: une version publiée est figée ; créez une nouvelle version';
    end if;
    if not (old.status = 'publiee' and new.status = 'archivee') and new.status <> old.status then
      raise exception 'PP403: transition de statut non autorisée';
    end if;
  end if;
  new.sha256 := public.sha256_text(new.version || '|' || new.lang || '|' || new.title || '|' || new.body);
  if new.status = 'publiee' and new.published_at is null then new.published_at := now(); end if;
  return new;
end $$;
drop trigger if exists policy_version_guard on public.privacy_policy_versions;
create trigger policy_version_guard before insert or update or delete on public.privacy_policy_versions for each row execute function public.policy_version_guard();

create or replace function public.current_policy_version() returns text
language sql stable security definer set search_path = public as $$
  select version from public.privacy_policy_versions where status = 'publiee' order by published_at desc limit 1;
$$;
grant execute on function public.current_policy_version() to anon, authenticated;

-- Version 1 : copie exacte de la politique de confidentialité actuellement affichée
insert into public.privacy_policy_versions (version, title, body, status)
select '1', coalesce(nullif(title, ''), 'Politique de confidentialité'), body, 'publiee'
from public.content_pages where slug = 'confidentialite' and char_length(btrim(body)) >= 20
on conflict (version) do nothing;

create or replace function public.publish_policy_version(p_version text, p_title text, p_body text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_edit_compliance() then raise exception 'PP403: réservé au responsable conformité'; end if;
  update public.privacy_policy_versions set status = 'archivee' where status = 'publiee';
  insert into public.privacy_policy_versions (version, title, body, status, created_by) values (p_version, p_title, p_body, 'publiee', auth.uid());
  perform public.log_audit('compliance.policy_publish', 'privacy_policy', p_version, '{}'::jsonb);
end $$;
revoke execute on function public.publish_policy_version(text, text, text) from public, anon;
grant execute on function public.publish_policy_version(text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Preuves de consentement : refus explicite, contexte complet, chaîne d'empreintes
-- ---------------------------------------------------------------------------
alter table public.consent_records drop constraint if exists consent_records_decision_check;
alter table public.consent_records add constraint consent_records_decision_check check (decision in ('accorde', 'refuse', 'retire'));
alter table public.consent_records
  add column if not exists text_sha256 text,
  add column if not exists policy_version text,
  add column if not exists lang text,
  add column if not exists timezone text,
  add column if not exists session_ref text,
  add column if not exists origin text,
  add column if not exists prev_hash text,
  add column if not exists row_hash text;

create or replace function public.consent_records_chain() returns trigger
language plpgsql set search_path = public as $$
declare last text;
begin
  perform pg_advisory_xact_lock(hashtext('pp_consent_chain'));
  select row_hash into last from public.consent_records where row_hash is not null order by id desc limit 1;
  new.prev_hash := coalesce(last, 'genesis');
  new.row_hash := public.sha256_text(concat_ws('|', new.prev_hash, new.user_id::text, new.purpose_code, new.purpose_version::text, new.decision,
    new.method, coalesce(new.text_sha256, ''), coalesce(new.policy_version, ''), coalesce(new.lang, ''), coalesce(new.timezone, ''),
    coalesce(new.session_ref, ''), coalesce(new.origin, ''), to_char(new.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US')));
  return new;
end $$;
drop trigger if exists consent_records_chain on public.consent_records;
create trigger consent_records_chain before insert on public.consent_records for each row execute function public.consent_records_chain();

-- Enregistrement d'un choix : uniquement à la suite d'une action de l'utilisateur connecté
create or replace function public.record_consent(p_purpose text, p_decision text, p_method text default 'centre_confidentialite', p_lang text default 'fr', p_timezone text default null)
returns text language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); p public.consent_purposes; last text; v public.consent_purpose_versions; d text := p_decision;
begin
  if uid is null then raise exception 'PP401: connexion requise'; end if;
  select * into p from public.consent_purposes where code = p_purpose and active;
  if not found or p.legal_basis <> 'consentement' then raise exception 'PP422: cette finalité ne relève pas du consentement'; end if;
  if p_method not in ('centre_confidentialite', 'inscription', 'parcours_service') then raise exception 'PP422: méthode invalide'; end if;
  if d not in ('accorde', 'refuse', 'retire') then raise exception 'PP422: choix invalide'; end if;
  if (select count(*) from public.consent_records where user_id = uid and created_at > now() - interval '1 hour') >= 60 then
    raise exception 'PP429: trop de changements, réessayez plus tard';
  end if;
  select decision into last from public.consent_records where user_id = uid and purpose_code = p_purpose order by created_at desc, id desc limit 1;
  -- Refuser ce qui était accordé = retrait ; retirer ce qui n'est pas accordé = refus
  if d = 'refuse' and last = 'accorde' then d := 'retire'; end if;
  if d = 'retire' and last is distinct from 'accorde' then d := 'refuse'; end if;
  if last is not distinct from d then return d; end if;
  select * into v from public.consent_purpose_versions where purpose_code = p.code and version = p.version;
  insert into public.consent_records (user_id, purpose_code, purpose_version, decision, method, data_categories, recipients,
    text_sha256, policy_version, lang, timezone, session_ref, origin)
  values (uid, p.code, p.version, d, p_method, p.data_categories, p.recipients,
    v.text_sha256, public.current_policy_version(), left(coalesce(nullif(p_lang, ''), 'fr'), 5), left(nullif(p_timezone, ''), 60),
    left(coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'session_id', ''), 64), 'utilisateur');
  perform public.log_audit('consent.' || d, 'consent', p.code, jsonb_build_object('version', p.version, 'method', p_method));
  return d;
end $$;
revoke execute on function public.record_consent(text, text, text, text, text) from public, anon;
grant execute on function public.record_consent(text, text, text, text, text) to authenticated;

-- Compatibilité avec la 0.25
create or replace function public.set_consent(p_purpose text, p_granted boolean, p_method text default 'centre_confidentialite')
returns void language plpgsql security definer set search_path = public as $$
begin perform public.record_consent(p_purpose, case when p_granted then 'accorde' else 'refuse' end, p_method, 'fr', null); end $$;

-- ---------------------------------------------------------------------------
-- 5. Réclamations « Je n'ai jamais donné mon consentement »
-- ---------------------------------------------------------------------------
create table if not exists public.consent_disputes (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('REC-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(md5(gen_random_uuid()::text), 1, 6))),
  user_id uuid not null references public.profiles(id) on delete cascade,
  purpose_code text references public.consent_purposes(code),
  message text not null check (char_length(btrim(message)) between 5 and 2000),
  status text not null default 'nouvelle' check (status in ('nouvelle', 'en_analyse', 'preuve_retrouvee', 'preuve_insuffisante', 'traitement_suspendu', 'resolue', 'transmise')),
  shared_with_recipients text check (char_length(coalesce(shared_with_recipients, '')) <= 1000),
  corrective_actions text check (char_length(coalesce(corrective_actions, '')) <= 2000),
  report text check (char_length(coalesce(report, '')) <= 5000),
  handled_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.consent_disputes enable row level security;
drop policy if exists "pp_consent_disputes_read" on public.consent_disputes;
create policy "pp_consent_disputes_read" on public.consent_disputes for select to authenticated using (user_id = auth.uid() or public.can_view_compliance());
revoke all on public.consent_disputes from anon, authenticated;
grant select on public.consent_disputes to authenticated;

create or replace function public.create_consent_dispute(p_purpose text, p_message text)
returns text language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); r public.consent_disputes; a record;
begin
  if uid is null then raise exception 'PP401: connexion requise'; end if;
  if (select count(*) from public.consent_disputes where user_id = uid and created_at > now() - interval '1 day') >= 3 then raise exception 'PP429: trop de réclamations aujourd''hui'; end if;
  insert into public.consent_disputes (user_id, purpose_code, message)
  values (uid, (select code from public.consent_purposes where code = p_purpose), btrim(p_message)) returning * into r;
  perform public.log_audit('compliance.dispute_create', 'consent_dispute', r.id::text, jsonb_build_object('purpose', p_purpose));
  for a in select user_id from public.user_roles where role = 'admin' union select user_id from public.compliance_members where role in ('dpo', 'juriste') loop
    insert into public.notifications (user_id, kind, title, body, link) values (a.user_id, 'confidentialite', 'Réclamation sur un consentement ' || r.reference, left(r.message, 140), '/conformite/reclamations');
  end loop;
  return r.reference;
end $$;
revoke execute on function public.create_consent_dispute(text, text) from public, anon;
grant execute on function public.create_consent_dispute(text, text) to authenticated;

create or replace function public.handle_consent_dispute(p_id uuid, p_status text, p_shared text, p_actions text, p_report text)
returns void language plpgsql security definer set search_path = public as $$
declare r public.consent_disputes;
begin
  if not public.can_edit_compliance() then raise exception 'PP403: réservé au responsable conformité'; end if;
  if p_status not in ('nouvelle', 'en_analyse', 'preuve_retrouvee', 'preuve_insuffisante', 'traitement_suspendu', 'resolue', 'transmise') then raise exception 'PP422: statut invalide'; end if;
  update public.consent_disputes set status = p_status, shared_with_recipients = nullif(btrim(coalesce(p_shared, '')), ''),
    corrective_actions = nullif(btrim(coalesce(p_actions, '')), ''), report = nullif(btrim(coalesce(p_report, '')), ''), handled_by = auth.uid(), updated_at = now()
  where id = p_id returning * into r;
  if not found then raise exception 'PP404: réclamation introuvable'; end if;
  perform public.log_audit('compliance.dispute_status', 'consent_dispute', p_id::text, jsonb_build_object('status', p_status));
  insert into public.notifications (user_id, kind, title, body, link)
  values (r.user_id, 'confidentialite', 'Votre réclamation ' || r.reference || ' a été mise à jour', 'Consultez-la dans Mes données et confidentialité.', '/compte/confidentialite');
end $$;
revoke execute on function public.handle_consent_dispute(uuid, text, text, text, text) from public, anon;
grant execute on function public.handle_consent_dispute(uuid, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Consultation, vérification et export des preuves (journalisés)
-- ---------------------------------------------------------------------------
create or replace function public.consent_record_ok(r public.consent_records) returns boolean
language sql stable security definer set search_path = public as $$
  select r.text_sha256 is null or exists (select 1 from public.consent_purpose_versions v
    where v.purpose_code = r.purpose_code and v.version = r.purpose_version and v.text_sha256 = r.text_sha256
      and v.text_sha256 = public.sha256_text(v.snapshot::text));
$$;

create or replace function public.compliance_search(p_user uuid default null, p_from date default null, p_to date default null, p_purpose text default null, p_decision text default null, p_export boolean default false)
returns table (id bigint, user_id uuid, user_name text, purpose_code text, purpose_title text, purpose_version int, decision text, method text,
  policy_version text, lang text, timezone text, text_sha256 text, created_at timestamptz, text_ok boolean)
language plpgsql security definer set search_path = public as $$
begin
  if not public.can_view_compliance() then raise exception 'PP403: accès réservé aux personnes habilitées'; end if;
  perform public.log_audit(case when p_export then 'compliance.export' else 'compliance.search' end, 'consent', coalesce(p_user::text, '*'),
    jsonb_build_object('from', p_from, 'to', p_to, 'purpose', p_purpose, 'decision', p_decision));
  return query
    select r.id, r.user_id, pr.full_name, r.purpose_code, p.title, r.purpose_version, r.decision, r.method, r.policy_version, r.lang, r.timezone, r.text_sha256, r.created_at,
      public.consent_record_ok(r)
    from public.consent_records r join public.consent_purposes p on p.code = r.purpose_code left join public.profiles pr on pr.id = r.user_id
    where (p_user is null or r.user_id = p_user) and (p_from is null or r.created_at >= p_from) and (p_to is null or r.created_at < p_to + 1)
      and (p_purpose is null or r.purpose_code = p_purpose) and (p_decision is null or r.decision = p_decision)
    order by r.created_at desc, r.id desc limit 2000;
end $$;
revoke execute on function public.compliance_search(uuid, date, date, text, text, boolean) from public, anon;
grant execute on function public.compliance_search(uuid, date, date, text, text, boolean) to authenticated;

create or replace function public.consent_chain_verify()
returns table (checked bigint, broken_at bigint)
language plpgsql security definer set search_path = public stable as $$
declare r record; prev text := null; n bigint := 0; bad bigint := null; h text; started boolean := false;
begin
  if not public.can_view_compliance() then raise exception 'PP403: accès réservé aux personnes habilitées'; end if;
  for r in select * from public.consent_records where row_hash is not null order by id loop
    if not started then prev := r.prev_hash; started := true; end if;
    h := public.sha256_text(concat_ws('|', r.prev_hash, r.user_id::text, r.purpose_code, r.purpose_version::text, r.decision,
      r.method, coalesce(r.text_sha256, ''), coalesce(r.policy_version, ''), coalesce(r.lang, ''), coalesce(r.timezone, ''),
      coalesce(r.session_ref, ''), coalesce(r.origin, ''), to_char(r.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US')));
    if r.prev_hash is distinct from prev or h <> r.row_hash then bad := r.id; exit; end if;
    prev := r.row_hash; n := n + 1;
  end loop;
  return query select n, bad;
end $$;
revoke execute on function public.consent_chain_verify() from public, anon;
grant execute on function public.consent_chain_verify() to authenticated;

create or replace function public.compliance_find_user(p_query text)
returns table (id uuid, full_name text, email text)
language plpgsql security definer set search_path = public as $$
begin
  if not public.can_view_compliance() then raise exception 'PP403: accès réservé aux personnes habilitées'; end if;
  if char_length(btrim(coalesce(p_query, ''))) < 4 then raise exception 'PP422: saisissez au moins 4 caractères'; end if;
  perform public.log_audit('compliance.find_user', 'user', '*', jsonb_build_object('q_len', char_length(p_query)));
  return query select u.id, p.full_name, u.email::text from auth.users u join public.profiles p on p.id = u.id
    where lower(u.email) = lower(btrim(p_query)) or p.phone = btrim(p_query) or u.id::text = btrim(p_query) limit 5;
end $$;
revoke execute on function public.compliance_find_user(text) from public, anon;
grant execute on function public.compliance_find_user(text) to authenticated;

-- Journal des consultations et exports administratifs (lecture pour les personnes habilitées)
create or replace function public.compliance_access_log(p_limit int default 100)
returns table (created_at timestamptz, actor_name text, action text, entity_id text, details jsonb)
language plpgsql security definer set search_path = public stable as $$
begin
  if not public.can_view_compliance() then raise exception 'PP403: accès réservé aux personnes habilitées'; end if;
  return query select l.created_at, p.full_name, l.action, l.entity_id, l.details from public.audit_logs l left join public.profiles p on p.id = l.actor_id
    where l.action like 'compliance.%' or l.action = 'admin.consent_proof' order by l.id desc limit least(greatest(p_limit, 1), 500);
end $$;
revoke execute on function public.compliance_access_log(int) from public, anon;
grant execute on function public.compliance_access_log(int) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Registre des traitements et destinataires
-- ---------------------------------------------------------------------------
create table if not exists public.data_processing_registry (
  code text primary key check (code ~ '^[a-z_]{3,40}$'),
  purpose text not null check (char_length(btrim(purpose)) between 3 and 300),
  data_categories text not null default '',
  data_subjects text not null default '',
  recipients text not null default '',
  legal_basis text not null check (legal_basis in ('consentement', 'contrat', 'obligation_legale', 'interet_vital', 'interet_legitime', 'mission_interet_public', 'a_determiner')),
  retention text not null default 'À définir',
  security_measures text not null default '',
  transfers text not null default '',
  apdp_formalities text not null default 'À déterminer',
  legal_status text not null default 'a_valider' check (legal_status in ('a_valider', 'valide', 'a_revoir')),
  validated_by_name text,
  validated_at date,
  sort int not null default 100,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);
alter table public.data_processing_registry enable row level security;
drop policy if exists "pp_dpr_read" on public.data_processing_registry;
create policy "pp_dpr_read" on public.data_processing_registry for select to authenticated using (public.can_view_compliance());
revoke all on public.data_processing_registry from anon, authenticated;
grant select on public.data_processing_registry to authenticated;

create table if not exists public.third_party_recipients (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(btrim(name)) between 2 and 120),
  role text not null default '',
  data_categories text not null default '',
  country text not null default 'À préciser',
  safeguards text not null default 'À vérifier',
  contract_status text not null default 'a_verifier' check (contract_status in ('a_verifier', 'signe', 'conditions_standard', 'a_negocier')),
  active boolean not null default true,
  sort int not null default 100,
  updated_at timestamptz not null default now()
);
alter table public.third_party_recipients enable row level security;
drop policy if exists "pp_tpr_read" on public.third_party_recipients;
create policy "pp_tpr_read" on public.third_party_recipients for select to anon, authenticated using (active or public.can_view_compliance());
revoke all on public.third_party_recipients from anon, authenticated;
grant select on public.third_party_recipients to anon, authenticated;

create or replace function public.save_registry_entry(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_edit_compliance() then raise exception 'PP403: réservé au responsable conformité'; end if;
  update public.data_processing_registry set
    purpose = coalesce(p ->> 'purpose', purpose), data_categories = coalesce(p ->> 'data_categories', data_categories),
    data_subjects = coalesce(p ->> 'data_subjects', data_subjects), recipients = coalesce(p ->> 'recipients', recipients),
    legal_basis = coalesce(p ->> 'legal_basis', legal_basis), retention = coalesce(p ->> 'retention', retention),
    security_measures = coalesce(p ->> 'security_measures', security_measures), transfers = coalesce(p ->> 'transfers', transfers),
    apdp_formalities = coalesce(p ->> 'apdp_formalities', apdp_formalities), legal_status = coalesce(p ->> 'legal_status', legal_status),
    validated_by_name = case when p ->> 'legal_status' = 'valide' then nullif(btrim(coalesce(p ->> 'validated_by_name', '')), '') else validated_by_name end,
    validated_at = case when p ->> 'legal_status' = 'valide' then current_date else validated_at end,
    updated_at = now(), updated_by = auth.uid()
  where code = p ->> 'code';
  if not found then raise exception 'PP404: traitement introuvable'; end if;
  if p ->> 'legal_status' = 'valide' and nullif(btrim(coalesce(p ->> 'validated_by_name', '')), '') is null then
    raise exception 'PP422: indiquez le nom et la qualité de la personne qui valide';
  end if;
  perform public.log_audit('compliance.registry', 'processing', p ->> 'code', jsonb_build_object('status', p ->> 'legal_status'));
end $$;
revoke execute on function public.save_registry_entry(jsonb) from public, anon;
grant execute on function public.save_registry_entry(jsonb) to authenticated;

insert into public.data_processing_registry (code, purpose, data_categories, data_subjects, recipients, legal_basis, retention, security_measures, transfers, sort) values
  ('comptes', 'Création et sécurité des comptes', 'Identité, contact, identifiants de connexion', 'Patients, professionnels', 'SantéProxi', 'contrat', 'Durée du compte', 'Mot de passe haché par le service d''authentification, double authentification, règles d''accès par ligne', 'Hébergement Union européenne (Irlande)', 10),
  ('rendez_vous', 'Prise et suivi des rendez-vous', 'Identité, contact, date, motif choisi', 'Patients et proches, professionnels', 'Professionnel ou établissement choisi', 'contrat', 'Durée du compte', 'Règles d''accès par ligne', 'Hébergement Union européenne (Irlande)', 20),
  ('reservations', 'Réservations et commandes en pharmacie', 'Identité, contact, médicaments réservés', 'Patients', 'Pharmacie choisie', 'contrat', 'Durée du compte', 'Règles d''accès par ligne', 'Hébergement Union européenne (Irlande)', 30),
  ('dossier_sante', 'Dossier santé personnel', 'Données de santé (documents, mesures, traitements, résultats)', 'Patients et proches', 'La personne et ceux à qui elle ouvre un accès', 'consentement', 'Jusqu''à suppression par la personne ou du compte', 'Règles d''accès par ligne, stockage privé, liens temporaires, aucun accès administrateur', 'Hébergement Union européenne (Irlande)', 40),
  ('espace_femme', 'SantéProxi Femme', 'Données de santé (cycle, grossesse, notes chiffrées)', 'Utilisatrices', 'L''utilisatrice et les personnes avec qui elle partage', 'consentement', 'Jusqu''à suppression', 'Chiffrement AES-256-GCM des notes, code secret, journal des accès', 'Hébergement Union européenne (Irlande)', 50),
  ('communications', 'Informations et messages de prévention par e-mail', 'E-mail, prénom', 'Utilisateurs ayant consenti', 'SantéProxi, prestataire d''envoi', 'consentement', 'Jusqu''au retrait du consentement', 'Envoi uniquement après consentement enregistré', 'À préciser selon le prestataire d''e-mail', 60),
  ('support', 'Centre d''aide et demandes d''assistance', 'Identité, contact, contenu de la demande', 'Utilisateurs et visiteurs', 'Équipe SantéProxi', 'interet_legitime', 'À définir', 'Accès réservé à l''équipe, notes internes séparées', 'Hébergement Union européenne (Irlande)', 70),
  ('securite_audit', 'Sécurité et traçabilité', 'Identifiant, action, date', 'Tous les utilisateurs', 'Administrateurs habilités', 'interet_legitime', 'À définir', 'Journal chaîné, non modifiable par l''application', 'Hébergement Union européenne (Irlande)', 80),
  ('statistiques', 'Statistiques agrégées de recherche', 'Recherches sans identité', 'Visiteurs', 'Partenaires sous forme agrégée', 'interet_legitime', '400 jours', 'Aucune donnée de santé individuelle', 'Hébergement Union européenne (Irlande)', 90),
  ('assistant', 'Assistant santé', 'Texte des questions, sans nom ni identifiant', 'Utilisateurs de l''assistant', 'Fournisseur d''IA (Anthropic)', 'a_determiner', 'Selon les conditions du fournisseur', 'Aucune donnée de compte transmise', 'États-Unis (fournisseur d''IA)', 100)
on conflict (code) do nothing;

insert into public.third_party_recipients (name, role, data_categories, country, safeguards, sort) values
  ('Supabase', 'Base de données, authentification et stockage des fichiers', 'Toutes les données du service', 'Union européenne (Irlande, région eu-west-1)', 'À vérifier : conditions contractuelles et accord de traitement des données', 10),
  ('Vercel', 'Hébergement et exécution du site', 'Données en transit lors de l''utilisation du site', 'À préciser (société américaine ; région d''exécution à confirmer)', 'À vérifier', 20),
  ('Prestataire d''envoi d''e-mails', 'Envoi des e-mails de compte et de notification', 'Adresse e-mail, contenu des messages', 'À préciser', 'À vérifier', 30),
  ('Anthropic', 'Réponses de l''assistant santé', 'Texte des questions posées à l''assistant', 'États-Unis', 'À vérifier : conditions commerciales de l''API', 40)
on conflict (name) do nothing;

-- Identité du responsable de traitement : champs administrables, vides tant qu'ils ne sont pas définis
insert into public.platform_settings (key, value, description) values
  ('privacy_controller_name', '""'::jsonb, 'Responsable du traitement : dénomination juridique'),
  ('privacy_controller_address', '""'::jsonb, 'Responsable du traitement : adresse officielle'),
  ('privacy_controller_registration', '""'::jsonb, 'Responsable du traitement : immatriculation (RCCM)'),
  ('privacy_contact_email', '""'::jsonb, 'Point de contact confidentialité : e-mail'),
  ('privacy_contact_phone', '""'::jsonb, 'Point de contact confidentialité : téléphone'),
  ('privacy_dpo_name', '""'::jsonb, 'Correspondant à la protection des données (si désigné)')
on conflict (key) do nothing;

create or replace function public.set_privacy_setting(p_key text, p_value text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_edit_compliance() then raise exception 'PP403: réservé au responsable conformité'; end if;
  if p_key not in ('privacy_controller_name', 'privacy_controller_address', 'privacy_controller_registration', 'privacy_contact_email', 'privacy_contact_phone', 'privacy_dpo_name') then
    raise exception 'PP422: paramètre inconnu';
  end if;
  update public.platform_settings set value = to_jsonb(left(btrim(coalesce(p_value, '')), 300)), updated_at = now(), updated_by = auth.uid() where key = p_key;
  perform public.log_audit('compliance.setting', 'setting', p_key, '{}'::jsonb);
end $$;
revoke execute on function public.set_privacy_setting(text, text) from public, anon;
grant execute on function public.set_privacy_setting(text, text) to authenticated;

create or replace function public.privacy_identity()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from public.platform_settings where key like 'privacy\_%';
$$;
grant execute on function public.privacy_identity() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 8. Historique des connexions et alerte « nouvel appareil »
-- ---------------------------------------------------------------------------
create table if not exists public.login_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  device_hash text not null check (device_hash ~ '^[0-9a-f]{64}$'),
  device_label text not null check (char_length(device_label) <= 80),
  new_device boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists login_events_user_idx on public.login_events (user_id, created_at desc);
alter table public.login_events enable row level security;
drop policy if exists "pp_login_events_own" on public.login_events;
create policy "pp_login_events_own" on public.login_events for select to authenticated using (user_id = auth.uid());
revoke all on public.login_events from anon, authenticated;
grant select on public.login_events to authenticated;

create or replace function public.record_login(p_device_hash text, p_device_label text)
returns boolean language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); known boolean; first_login boolean;
begin
  if uid is null then return false; end if;
  if p_device_hash !~ '^[0-9a-f]{64}$' then raise exception 'PP422: appareil invalide'; end if;
  select exists (select 1 from public.login_events where user_id = uid and device_hash = p_device_hash), not exists (select 1 from public.login_events where user_id = uid)
  into known, first_login;
  insert into public.login_events (user_id, device_hash, device_label, new_device) values (uid, p_device_hash, left(coalesce(p_device_label, 'Appareil'), 80), not known and not first_login);
  delete from public.login_events where user_id = uid and created_at < now() - interval '180 days';
  if not known and not first_login then
    insert into public.notifications (user_id, kind, title, body, link)
    values (uid, 'securite', 'Connexion depuis un nouvel appareil', 'Une connexion a eu lieu depuis : ' || left(coalesce(p_device_label, 'appareil inconnu'), 80) || '. Si ce n''est pas vous, changez votre mot de passe et déconnectez vos autres appareils.', '/compte/confidentialite');
  end if;
  return not known and not first_login;
end $$;
revoke execute on function public.record_login(text, text) from public, anon;
grant execute on function public.record_login(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. Favoris (professionnels et établissements)
-- ---------------------------------------------------------------------------
create table if not exists public.favorites (
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('medecin', 'pharmacie', 'etablissement', 'laboratoire')),
  target_id uuid not null,
  label text not null check (char_length(btrim(label)) between 1 and 160),
  href text not null check (href ~ '^/[a-z0-9/_-]{1,200}$'),
  created_at timestamptz not null default now(),
  primary key (user_id, kind, target_id)
);
alter table public.favorites enable row level security;
drop policy if exists "pp_favorites_own" on public.favorites;
create policy "pp_favorites_own" on public.favorites for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.favorites from anon, authenticated;
grant select, insert, delete on public.favorites to authenticated;

-- ---------------------------------------------------------------------------
-- ROLLBACK (à exécuter manuellement si nécessaire, dans cet ordre) :
--   drop table if exists public.favorites, public.login_events, public.third_party_recipients, public.data_processing_registry, public.consent_disputes, public.privacy_policy_versions, public.consent_purpose_versions, public.compliance_members cascade;
--   drop trigger if exists consent_records_chain on public.consent_records;
--   drop trigger if exists consent_purposes_archive on public.consent_purposes;
--   (les colonnes ajoutées à consent_records peuvent rester : elles sont facultatives)
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 10. Langues : anglais et arabe (affichage de droite à gauche) ouverts à la traduction validée
-- ---------------------------------------------------------------------------
alter table public.ui_translations drop constraint if exists ui_translations_lang_check;
alter table public.ui_translations add constraint ui_translations_lang_check check (lang in ('bm', 'snk', 'ff', 'son', 'en', 'ar'));


-- >>> Maintenance planifiée toutes les 10 minutes (pg_cron)
create extension if not exists pg_cron;
select cron.schedule('pharmaproxi-maintenance', '*/10 * * * *', $$select public.run_maintenance()$$);
