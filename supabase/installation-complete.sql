-- ============================================================================
-- PharmaProxi — installation complète de la base (toutes les migrations)
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

-- >>> Maintenance planifiée toutes les 10 minutes (pg_cron)
create extension if not exists pg_cron;
select cron.schedule('pharmaproxi-maintenance', '*/10 * * * *', $$select public.run_maintenance()$$);
