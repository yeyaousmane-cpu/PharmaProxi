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
