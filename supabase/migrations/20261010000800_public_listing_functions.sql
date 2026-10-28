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
