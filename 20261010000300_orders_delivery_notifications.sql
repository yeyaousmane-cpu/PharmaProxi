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
